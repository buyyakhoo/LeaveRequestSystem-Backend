import { Hono } from 'hono'
import { requireAuth, requireRole } from '../middleware/auth.js'
import type { AuthVariables } from '../middleware/auth.js'
import * as EmployeeService from '../services/employee.service.js'
import { validatePassword } from '../services/user.service.js'

const employeeRouter = new Hono<{ Variables: AuthVariables }>()

employeeRouter.use('*', requireAuth) // ทุก route ต้อง login ก่อน

// GET /employees
// admin → เห็นพนักงานทุกคน
// manager → เห็นเฉพาะแผนกตัวเอง (กรองด้วย department_id จาก token)
employeeRouter.get('/', requireRole('admin', 'manager'), async (c) => {
  const payload = c.get('jwtPayload')
  const departmentId = (payload as any).department_id ?? null
  const employees = await EmployeeService.getEmployees(payload.role, departmentId)
  return c.json({ data: employees })
})

// GET /employees/:id
// ดูรายละเอียดพนักงานคนเดียว
// manager: เห็นได้เฉพาะพนักงานในแผนกตัวเอง
employeeRouter.get('/:id', requireRole('admin', 'manager'), async (c) => {
  const payload = c.get('jwtPayload')
  const emp = await EmployeeService.getEmployeeById(c.req.param('id'))
  if (!emp) return c.json({ error: 'Not found' }, 404)
  if (payload.role === 'manager') {
    if (emp.departments?.id !== (payload as any).department_id) {
      return c.json({ error: 'Forbidden: พนักงานนี้ไม่ได้อยู่ในแผนกของคุณ' }, 403)
    }
    if (emp.role !== 'user') {
      return c.json({ error: 'Forbidden: ไม่ได้รับอนุญาตให้เข้าถึงข้อมูลของระดับผู้จัดการ' }, 403)
    }
  }
  return c.json(emp)
})

// POST /employees
// เพิ่มพนักงานใหม่ + เช็ค OWASP password policy
// manager จะถูก force ให้เพิ่มได้แค่แผนกตัวเอง role user
employeeRouter.post('/', requireRole('admin', 'manager'), async (c) => {
  const body = await c.req.json()
  const payload = c.get('jwtPayload')

  const errors = validatePassword(body.password ?? '')
  if (errors.length > 0) return c.json({ error: 'Password policy violation', details: errors }, 400)

  if (payload.role === 'manager') {
    body.departmentId = (payload as any).department_id // force แผนกตัวเอง
    body.role = 'user'                                 // force role user
  }
  try {
    const emp = await EmployeeService.createEmployee(body, payload.sub.toString(), payload.role)
    return c.json(emp, 201)
  } catch (e: any) {
    if (e.message === 'EMAIL_EXISTS') return c.json({ error: 'อีเมลนี้มีในระบบแล้ว' }, 409)
    if (e.message === 'EMPLOYEE_CODE_EXISTS') return c.json({ error: 'รหัสพนักงานนี้มีในระบบแล้ว' }, 409)
    throw e
  }
})

// PATCH /employees/:id/demote
// ลดระดับ manager → user (admin เท่านั้น, department ไม่เปลี่ยน)
employeeRouter.patch('/:id/demote', requireRole('admin'), async (c) => {
  const payload = c.get('jwtPayload')
  try {
    const result = await EmployeeService.demoteToUser(c.req.param('id'), payload.sub.toString(), payload.role)
    return c.json(result)
  } catch (e: any) {
    if (e.message === 'NOT_FOUND') return c.json({ error: 'ไม่พบพนักงาน' }, 404)
    if (e.message === 'EMPLOYEE_DISABLED') return c.json({ error: 'พนักงานนี้ถูก disable แล้ว' }, 409)
    if (e.message === 'NOT_A_MANAGER') return c.json({ error: 'พนักงานนี้ไม่ได้เป็น Manager' }, 409)
    throw e
  }
})

// PATCH /employees/:id/promote
// เลื่อนยศ user → manager (admin เท่านั้น, department ไม่เปลี่ยน)
employeeRouter.patch('/:id/promote', requireRole('admin'), async (c) => {
  const payload = c.get('jwtPayload')
  try {
    const result = await EmployeeService.promoteToManager(c.req.param('id'), payload.sub.toString(), payload.role)
    return c.json(result)
  } catch (e: any) {
    if (e.message === 'NOT_FOUND') return c.json({ error: 'ไม่พบพนักงาน' }, 404)
    if (e.message === 'EMPLOYEE_DISABLED') return c.json({ error: 'ไม่สามารถเลื่อนยศพนักงานที่ถูก disable' }, 409)
    if (e.message === 'NOT_A_USER') return c.json({ error: 'พนักงานนี้ไม่ได้เป็น user หรือเป็น manager/admin อยู่แล้ว' }, 409)
    throw e
  }
})

// PATCH /employees/:id/disable
// เปลี่ยน status เป็น disabled (ห้าม delete)
// manager: disable ได้เฉพาะพนักงานในแผนกตัวเอง
employeeRouter.patch('/:id/disable', requireRole('manager'), async (c) => {
  const payload = c.get('jwtPayload')

  const target = await EmployeeService.getEmployeeById(c.req.param('id'))
  if (!target) return c.json({ error: 'ไม่พบพนักงาน' }, 404)
  if (target.departments?.id !== (payload as any).department_id)
    return c.json({ error: 'Forbidden: พนักงานนี้ไม่ได้อยู่ในแผนกของคุณ' }, 403)

  if (target.role !== 'user') {
    return c.json({ error: 'Forbidden: HR ระงับบัญชีได้เฉพาะพนักงานทั่วไป (User) เท่านั้น' }, 403)
  }
  
  try {
    const result = await EmployeeService.disableEmployee(c.req.param('id'), payload.sub.toString(), payload.role)
    return c.json(result)
  } catch (e: any) {
    if (e.message === 'NOT_FOUND') return c.json({ error: 'ไม่พบพนักงาน' }, 404)
    if (e.message === 'ALREADY_DISABLED') return c.json({ error: 'Disabled แล้ว' }, 409)
    if (e.message === 'CANNOT_DISABLE_ADMIN') return c.json({ error: 'ไม่สามารถ disable admin' }, 403)
    throw e
  }
})

// PATCH /employees/:id/profile
// แก้ข้อมูลตัวเอง / manager แก้ user / admin ย้ายแผนก
employeeRouter.patch('/:id/profile', async (c) => {
  const payload = c.get('jwtPayload')
  const targetId = c.req.param('id')
  const body = await c.req.json()

  const target = await EmployeeService.getEmployeeById(targetId)
  if (!target) return c.json({ error: 'ไม่พบพนักงาน' }, 404)

  if (payload.role === 'user' && payload.sub.toString() !== targetId)
    return c.json({ error: 'Forbidden' }, 403)

  if (payload.role === 'manager') {
    if (target.departments?.id !== (payload as any).department_id)
      return c.json({ error: 'Forbidden: พนักงานนี้ไม่ได้อยู่ในแผนกของคุณ' }, 403)
      
    if (target.role !== 'user') {
      return c.json({ error: 'Forbidden: HR สามารถแก้ไขได้เฉพาะข้อมูลของพนักงานทั่วไป (User) เท่านั้น' }, 403)
    }
  }

  if (payload.role === 'admin') {
    if (body.departmentId && body.departmentId !== target.departments?.id && target.role === 'manager') {
      return c.json({ error: 'ไม่สามารถย้ายแผนก Manager ได้โดยตรง กรุณาลดระดับสิทธิ์ (Demote) เป็น User ก่อนย้ายแผนก' }, 403)
    }
  }

  try {
    const result = await EmployeeService.updateProfile(targetId, body, payload.sub.toString(), payload.role)
    return c.json(result)
  } catch (e: any) {
    if (e.message === 'NOT_FOUND') return c.json({ error: 'ไม่พบพนักงาน' }, 404)
    if (e.message === 'EMPLOYEE_CODE_ALREADY_SET') return c.json({ error: 'รหัสพนักงานถูกตั้งไว้แล้ว ไม่สามารถแก้ไขได้' }, 409)
    if (e.message === 'EMPLOYEE_CODE_EXISTS') return c.json({ error: 'รหัสพนักงานนี้มีในระบบแล้ว' }, 409)
    throw e
  }
})

export default employeeRouter