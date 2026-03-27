import { db } from '../db/index'
import { verifyPassword } from '../lib/password'
import jwt from 'jsonwebtoken'

export const loginLocal = async (email: string, password: string) => {
  const result = await db.query(
    `SELECT e.id, e.email, e.first_name, e.last_name,
            e.role, e.status, e.department,
            ei.password_hash
     FROM employees e
     JOIN employee_identities ei ON e.id = ei.employee_id
     WHERE e.email = $1 AND ei.provider = 'local'`,
    [email]
  )

  const emp = result.rows[0]
  if (!emp) return null
  if (emp.status === 'disabled') return null

  const valid = await verifyPassword(password, emp.password_hash)
  if (!valid) return null

  const token = jwt.sign(
    {
      sub: emp.id,
      email: emp.email,
      role: emp.role,
      department: emp.department,
    },
    process.env.JWT_SECRET!,
    { expiresIn: '8h' }
  )

  return {
    token,
    user: {
      id: emp.id,
      email: emp.email,
      firstName: emp.first_name,
      lastName: emp.last_name,
      role: emp.role,
      department: emp.department,
    },
  }
}

export const getMe = async (id: string) => {
  const result = await db.query(
    `SELECT id, employee_code, email, first_name, last_name,
            department, role, status
     FROM employees WHERE id = $1`,
    [id]
  )
  return result.rows[0] ?? null
}