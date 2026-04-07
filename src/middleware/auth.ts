import { prisma } from '../lib/prisma.js'
import { verify } from 'hono/jwt'
import { createMiddleware } from 'hono/factory'

type JwtPayload = {
  sub: number
  email: string
  role: string
  department_id?: number | null
  exp: number
}

export type AuthVariables = {
  jwtPayload: JwtPayload
}

export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ message: 'Unauthorized' }, 401)
  }

  const token = authHeader.slice(7)

  try {
    const payload = await verify(token, process.env.JWT_SECRET!, 'HS256') as JwtPayload

    const freshUser = await prisma.employees.findUnique({
      where: { id: String(payload.sub) },
      select: { role: true, status: true, department_id: true }
    })

    if (freshUser?.status !== 'active') {
      return c.json({ message: 'Account disabled or not found' }, 401)
    }

    payload.role = freshUser.role ?? 'user'
    payload.department_id = freshUser.department_id

    c.set('jwtPayload', payload)
    await next()
  } catch {
    return c.json({ message: 'Invalid or expired token' }, 401)
  }
})

export const requireRole = (...roles: string[]) =>
  createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const payload = c.get('jwtPayload')
    if (!roles.includes(payload.role)) {
      return c.json({ message: 'Forbidden' }, 403)
    }
    await next()
  })
