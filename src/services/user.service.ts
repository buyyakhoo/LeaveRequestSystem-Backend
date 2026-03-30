import argon2 from 'argon2'
import { prisma } from '../lib/prisma.js'

// ─── OWASP Password Storage Cheat Sheet ───────────────────────────────────────
// https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
// argon2id: memory=19 MiB, iterations=2, parallelism=1
const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,       // iterations
  parallelism: 1,
  // salt ถูก generate อัตโนมัติโดย library ทุกครั้งที่ hash
}

// ─── OWASP Password Policy ────────────────────────────────────────────────────
// 

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

export function validatePassword(password: string): string[] {
  const errors: string[] = []

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`)
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    errors.push(`Password must not exceed ${PASSWORD_MAX_LENGTH} characters`)
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  }
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one digit')
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character')
  }

  return errors
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function loginWithEmailPassword(email: string, password: string) {
  // ตรวจ max length ก่อน query DB เพื่อป้องกัน DoS ผ่าน argon2
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new Error('INVALID_CREDENTIALS')
  }

  const employee = await prisma.employees.findUnique({
    where: { email },
    include: {
      employee_identities: { where: { provider: 'local' } },
      departments: { select: { id: true, name: true } },
    },
  })

  if (!employee) {
    throw new Error('INVALID_CREDENTIALS')
  }

  if (employee.status !== 'active') {
    throw new Error('ACCOUNT_DISABLED')
  }

  const localIdentity = employee.employee_identities[0]
  if (!localIdentity?.password_hash) {
    throw new Error('INVALID_CREDENTIALS')
  }

  const isValid = await argon2.verify(localIdentity.password_hash, password)
  if (!isValid) {
    throw new Error('INVALID_CREDENTIALS')
  }
  
  return {
    id: employee.id,
    employee_code: employee.employee_code,
    email: employee.email,
    first_name: employee.first_name,
    last_name: employee.last_name,
    department_id: employee.department_id,
    department_name: employee.departments?.name ?? null,
    role: employee.role,
  }
}

// ─── Google SSO Login ─────────────────────────────────────────────────────────

export async function loginWithGoogle(googleUserId: string, email: string) {
  const employee = await prisma.employees.findUnique({
    where: { email },
    include: {
      employee_identities: true,
      departments: { select: { id: true, name: true } },
    },
  })

  // ไม่เจอ employee → email นี้ไม่ใช่ employee ของบริษัท
  if (!employee) throw new Error('NOT_AN_EMPLOYEE')
  if (employee.status !== 'active') throw new Error('ACCOUNT_DISABLED')

  const googleIdentity = employee.employee_identities.find(i => i.provider === 'google')

  if (googleIdentity) {
    // เคย link Google แล้ว — ตรวจว่าเป็น Google account เดิมหรือเปล่า
    if (googleIdentity.provider_id !== googleUserId) {
      // มีคนพยายาม login ด้วย Google account คนละตัวกับที่ link ไว้
      throw new Error('GOOGLE_ACCOUNT_MISMATCH')
    }
    // ตรงกัน → ผ่านได้เลย
  } else {
    // ยังไม่เคย login ด้วย Google → เพิ่ม google identity ใหม่
    // local identity ยังอยู่เหมือนเดิม ทำให้ login ได้ทั้ง 2 แบบ
    await prisma.employee_identities.create({
      data: {
        employee_id: employee.id,
        provider: 'google',
        provider_id: googleUserId,
      },
    })
  }

  return {
    id: employee.id,
    employee_code: employee.employee_code,
    email: employee.email,
    first_name: employee.first_name,
    last_name: employee.last_name,
    department_id: employee.department_id,
    department_name: employee.departments?.name ?? null,
    role: employee.role,
  }
}

// ─── Password Hashing ─────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  // ใช้ argon2id + OWASP params / salt ถูก generate อัตโนมัติ ไม่มีการเก็บ plain text
  return argon2.hash(password, ARGON2_OPTIONS)
}
