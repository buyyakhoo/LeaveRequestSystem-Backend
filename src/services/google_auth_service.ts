// ─── Google OAuth 2.0 Authorization Code Flow ────────────────────────────────
// ไม่ใช้ library เพิ่มเติม — ใช้ fetch ที่มีใน Node 20 อยู่แล้ว

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

// ─── Step 1: สร้าง URL สำหรับ redirect ไปหา Google ─────────────────────────

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    // select_account: บังคับให้เลือก account ทุกครั้ง (UX ที่ดีกว่า)
    prompt: 'select_account',
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

// ─── Step 2: Exchange authorization code → access_token ──────────────────────

interface GoogleTokenResponse {
  access_token: string
  token_type: string
  id_token: string
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.CLIENT_ID!,
      client_secret: process.env.CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('Google token exchange failed:', body)
    throw new Error('GOOGLE_TOKEN_EXCHANGE_FAILED')
  }

  return res.json() as Promise<GoogleTokenResponse>
}

// ─── Step 3: ดึงข้อมูล user จาก Google ───────────────────────────────────────

export interface GoogleUserInfo {
  id: string            // Google unique user ID (sub) — ใช้เป็น provider_id
  email: string
  verified_email: boolean
  name: string
  given_name: string
  family_name: string
}

export async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    throw new Error('GOOGLE_USERINFO_FAILED')
  }

  return res.json() as Promise<GoogleUserInfo>
}
