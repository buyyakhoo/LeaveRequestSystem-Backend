import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { loginWithEmailPassword } from '../services/user_service.js'

const auth = new Hono()

auth.post('/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>()
  const { email, password } = body

  if (!email || !password) {
    return c.json({ message: 'Email and password are required' }, 400)
  }

  try {
    const user = await loginWithEmailPassword(email, password)

    const token = await sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8, // 8 hours
      },
      process.env.JWT_SECRET!
    )

    return c.json({ token, user })
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'INVALID_CREDENTIALS') {
        return c.json({ message: 'Invalid email or password' }, 401)
      }
      if (err.message === 'ACCOUNT_DISABLED') {
        return c.json({ message: 'Account is disabled' }, 403)
      }
    }
    console.error(err)
    return c.json({ message: 'Internal server error' }, 500)
  }
})

export default auth
 