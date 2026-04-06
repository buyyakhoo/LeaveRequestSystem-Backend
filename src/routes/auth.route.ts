import crypto from 'node:crypto'
import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { loginWithEmailPassword, loginWithGoogle } from '../services/user.service.js'
import { buildGoogleAuthUrl, exchangeCodeForTokens, getGoogleUserInfo } from '../services/google_auth.service.js'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const auth = new Hono()

// ─── One-time exchange code store ─────────────────────────────────────────────
// code → { token, user, exp }  (TTL 60 seconds, single-use)
interface ExchangeEntry {
  token: string
  user: object
  exp: number
}
const exchangeStore = new Map<string, ExchangeEntry>()

function storeExchangeCode(token: string, user: object): string {
  const code = crypto.randomBytes(24).toString('hex')
  exchangeStore.set(code, { token, user, exp: Date.now() + 60_000 })
  return code
}

// ─── Email / Password Login ───────────────────────────────────────────────────

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
        first_name: user.first_name,
        last_name: user.last_name,
        employee_code: user.employee_code,
        department_id: user.department_id,
        department_name: user.department_name,
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

// ─── Get current user ────────────────────────────────────────────────────────

auth.get('/me', requireAuth, async (c) => {
  const { sub } = c.get('jwtPayload')

  const employee = await prisma.employees.findUnique({
    where: { id: String(sub) },
    select: {
      id: true,
      employee_code: true,
      email: true,
      first_name: true,
      last_name: true,
      role: true,
      departments: { select: { id: true, name: true } },
    },
  })

  if (!employee) {
    return c.json({ message: 'User not found' }, 404)
  }

  return c.json(employee)
})

// ─── Google SSO ───────────────────────────────────────────────────────────────
//
// Step 1: Redirect ไปหา Google consent screen
//   GET /auth/google
//
// Step 2: Google redirect กลับมาพร้อม authorization code
//   GET /auth/google/callback?code=xxx&state=xxx

auth.get('/google', (c) => {
  // สร้าง state แบบ random เพื่อป้องกัน CSRF
  // state จะถูกเก็บใน httpOnly cookie แล้วนำมาเทียบกับ state ที่ Google ส่งกลับมา
  const state = crypto.randomBytes(16).toString('hex')

  const googleUrl = buildGoogleAuthUrl(state)

  // เก็บ state ใน cookie อายุ 10 นาที (แค่พอสำหรับ OAuth flow)
  c.header(
    'Set-Cookie',
    `oauth_state=${state}; HttpOnly; SameSite=Lax; Max-Age=600; Path=/`
  )

  return c.redirect(googleUrl)
})

auth.get('/google/callback', async (c) => {
  const { code, state, error } = c.req.query()

  // ถ้า user กด deny ที่ Google
  if (error) {
    return c.redirect(`${process.env.FRONTEND_URL}/auth?error=oauth_denied`)
  }

  if (!code || !state) {
    return c.redirect(`${process.env.FRONTEND_URL}/auth?error=invalid_callback`)
  }

  // ตรวจ state cookie เพื่อป้องกัน CSRF
  const cookieHeader = c.req.header('Cookie') ?? ''
  const stateCookie = /(?:^|;\s*)oauth_state=([^;]+)/.exec(cookieHeader)?.[1]

  if (!stateCookie || state !== stateCookie) {
    return c.redirect(`${process.env.FRONTEND_URL}/auth?error=invalid_state`)
  }

  try {
    // แลก code → access_token
    const tokens = await exchangeCodeForTokens(code)

    // ดึงข้อมูล user จาก Google
    const userInfo = await getGoogleUserInfo(tokens.access_token)

    if (!userInfo.verified_email) {
      return c.redirect(`${process.env.FRONTEND_URL}/auth?error=email_not_verified`)
    }

    // ตรวจสอบ employee ใน DB และ link/verify Google identity
    const user = await loginWithGoogle(userInfo.id, userInfo.email)

    // ออก JWT เหมือนกับ login ปกติ
    const token = await sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
        employee_code: user.employee_code,
        department_id: user.department_id,
        department_name: user.department_name,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
      },
      process.env.JWT_SECRET!
    )

    // ล้าง state cookie
    c.header('Set-Cookie', 'oauth_state=; HttpOnly; Max-Age=0; Path=/')

    // เก็บ token ไว้ใน memory แล้ว redirect ด้วย one-time code แทน
    const exchangeCode = storeExchangeCode(token, user)
    return c.redirect(`${process.env.FRONTEND_URL}/auth/callback?code=${exchangeCode}`)
  } catch (err) {
    const errorMap: Record<string, string> = {
      NOT_AN_EMPLOYEE: 'not_employee',
      ACCOUNT_DISABLED: 'account_disabled',
      GOOGLE_ACCOUNT_MISMATCH: 'google_mismatch',
    }
    const errorCode = err instanceof Error ? (errorMap[err.message] ?? null) : null
    if (!errorCode) console.error(err)
    return c.redirect(`${process.env.FRONTEND_URL}/auth?error=${errorCode ?? 'server_error'}`)
  }
})

// ─── Exchange one-time code → JWT ────────────────────────────────────────────
auth.post('/exchange', async (c) => {
  const body = await c.req.json<{ code?: string }>()
  const { code } = body

  if (!code) return c.json({ message: 'code is required' }, 400)

  const entry = exchangeStore.get(code)
  if (!entry) return c.json({ message: 'Invalid or expired code' }, 401)

  // Single-use: delete immediately
  exchangeStore.delete(code)

  if (Date.now() > entry.exp) {
    return c.json({ message: 'Code has expired' }, 401)
  }

  return c.json({ token: entry.token, user: entry.user })
})

export default auth
