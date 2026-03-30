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
employeeRouter.get('/:id', requireRole('admin', 'manager'), async (c) => {
  const emp = await EmployeeService.getEmployeeById(c.req.param('id'))
  if (!emp) return c.json({ error: 'Not found' }, 404)
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

// PATCH /employees/:id/disable
// เปลี่ยน status เป็น disabled (ห้าม delete)
employeeRouter.patch('/:id/disable', requireRole('admin', 'manager'), async (c) => {
  const payload = c.get('jwtPayload')
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
// แก้ข้อมูลตัวเอง — user แก้ได้แค่ของตัวเอง admin/manager แก้ได้ทุกคน
employeeRouter.patch('/:id/profile', async (c) => {
  const payload = c.get('jwtPayload')
  const targetId = c.req.param('id')
  if (payload.role === 'user' && payload.sub.toString() !== targetId)
    return c.json({ error: 'Forbidden' }, 403)
  const body = await c.req.json()
  const result = await EmployeeService.updateProfile(targetId, body, payload.sub.toString(), payload.role)
  return c.json(result)
})

export default employeeRouter