import { Hono } from 'hono'
import { loginLocal, getMe } from '../services/auth.service'
import { authMiddleware } from '../middleware/auth.middleware'
import { validatePassword } from '../lib/owasp'

const authRouter = new Hono()

// POST /auth/login
authRouter.post('/login', async (c) => {
  const { email, password } = await c.req.json()

  if (!email || !password)
    return c.json({ error: 'กรุณากรอก email และ password' }, 400)

  // OWASP check
  const check = validatePassword(password)
  if (!check.valid)
    return c.json({ error: 'รหัสผ่านไม่ผ่านเกณฑ์', details: check.errors }, 400)

  const result = await loginLocal(email, password)
  if (!result)
    return c.json({ error: 'email หรือ password ไม่ถูกต้อง' }, 401)

  return c.json(result)
})

// POST /auth/logout
authRouter.post('/logout', authMiddleware, (c) => {
  return c.json({ ok: true, message: 'ออกจากระบบแล้ว' })
})

// GET /auth/me
authRouter.get('/me', authMiddleware, async (c) => {
  const user = c.get('user')
  const profile = await getMe(user.sub)
  if (!profile) return c.json({ error: 'Not found' }, 404)
  return c.json(profile)
})

export default authRouter