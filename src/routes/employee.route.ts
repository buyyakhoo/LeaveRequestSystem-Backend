import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth.middleware'
import * as EmployeeService from '../services/employee.service'
import { validatePassword } from '../lib/owasp'

const employeeRouter = new Hono()

// ทุก route ต้อง login ก่อน
employeeRouter.use('*', authMiddleware)

// GET /employees — admin เห็นทั้งหมด, manager เห็นแผนกตัวเอง
employeeRouter.get('/', requireRole('admin', 'manager'), async (c) => {
  const user = c.get('user')
  const employees = await EmployeeService.getEmployees(user.role, user.department ?? null)
  return c.json({ data: employees })
})

// GET /employees/:id — admin/manager ดูรายละเอียด
employeeRouter.get('/:id', requireRole('admin', 'manager'), async (c) => {
  const emp = await EmployeeService.getEmployeeById(c.req.param('id'))
  if (!emp) return c.json({ error: 'Not found' }, 404)
  return c.json(emp)
})

// POST /employees — admin และ manager (แผนกตัวเอง) เพิ่มพนักงานได้
employeeRouter.post('/', requireRole('admin', 'manager'), async (c) => {
  const body = await c.req.json()
  const user = c.get('user')

  // validate password ก่อนสร้าง
  const check = validatePassword(body.password)
  if (!check.valid) {
    return c.json({ error: 'รหัสผ่านไม่ผ่านเกณฑ์', details: check.errors }, 400)
  }

  // manager เพิ่มได้เฉพาะแผนกตัวเอง
  if (user.role === 'manager') {
    body.department = user.department
    body.role = 'user' // manager เพิ่มได้แค่ user
  }

  try {
    const emp = await EmployeeService.createEmployee(body, user.sub, user.role)
    return c.json(emp, 201)
  } catch (e: any) {
    if (e.message === 'EMAIL_EXISTS')
      return c.json({ error: 'Email นี้มีในระบบแล้ว' }, 409)
    throw e
  }
})

// PATCH /employees/:id/disable — admin/manager disable พนักงาน
employeeRouter.patch('/:id/disable', requireRole('admin', 'manager'), async (c) => {
  const user = c.get('user')
  try {
    const result = await EmployeeService.disableEmployee(
      c.req.param('id'),
      user.sub,
      user.role
    )
    return c.json(result)
  } catch (e: any) {
    if (e.message === 'NOT_FOUND')      return c.json({ error: 'ไม่พบพนักงาน' }, 404)
    if (e.message === 'ALREADY_DISABLED') return c.json({ error: 'Disabled แล้ว' }, 409)
    if (e.message === 'CANNOT_DISABLE_ADMIN') return c.json({ error: 'ไม่สามารถ disable admin' }, 403)
    throw e
  }
})

// PATCH /employees/:id/profile — แก้ข้อมูลตัวเอง (ทุก role)
employeeRouter.patch('/:id/profile', async (c) => {
  const user = c.get('user')
  const targetId = c.req.param('id')

  // user แก้ได้แค่ของตัวเอง
  if (user.role === 'user' && user.sub !== targetId) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const body = await c.req.json()
  const result = await EmployeeService.updateProfile(targetId, body, user.sub, user.role)
  return c.json(result)
})

export default employeeRouter