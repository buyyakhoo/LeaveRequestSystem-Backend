import { createMiddleware } from 'hono/factory'
import jwt from 'jsonwebtoken'

export const authMiddleware = createMiddleware(async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')

  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as jwt.JwtPayload

    const now = Math.floor(Date.now() / 1000)
    if (!payload.exp || payload.exp < now) {
      return c.json({ error: 'Token expired' }, 401)
    }

    c.set('user', payload)
    await next()
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
})

export const requireRole = (...roles: string[]) =>
  createMiddleware(async (c, next) => {
    const user = c.get('user')
    if (!roles.includes(user.role)) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  })