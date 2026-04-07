import { Hono } from 'hono'
import { requireAuth, requireRole } from '../middleware/auth.js'
import type { AuthVariables } from '../middleware/auth.js'
import * as EmployeeService from '../services/employee.service.js'
import { validatePassword } from '../services/user.service.js'

const employeeRouter = new Hono<{ Variables: AuthVariables }>()

const handleRoleChange = async (c: any, action: 'promote' | 'demote') => {
  const payload = c.get('jwtPayload')
  
  try {
    const serviceFn = action === 'promote' 
      ? EmployeeService.promoteToManager 
      : EmployeeService.demoteToUser

    const result = await serviceFn(c.req.param('id'), payload.sub.toString(), payload.role)
    return c.json(result)
  } catch (e: any) {
    const errorMap: Record<string, { message: string; status: number }> = {
      'NOT_FOUND': { message: 'ไม่พบพนักงาน', status: 404 },
      'EMPLOYEE_DISABLED': { 
        message: action === 'promote' ? 'ไม่สามารถเลื่อนยศพนักงานที่ลาออก' : 'พนักงานนี้ลาออกแล้ว', 
        status: 409 
      },
      'NOT_A_MANAGER': { message: 'พนักงานนี้บทบาทไม่ถูกต้อง', status: 409 },
      'NOT_A_USER': { message: 'พนักงานนี้บทบาทไม่ถูกต้อง', status: 409 },
    }

    const mappedError = errorMap[e.message]
    if (mappedError) {
      return c.json({ error: mappedError.message }, mappedError.status as any)
    }
    
    throw e
  }
}

const checkProfileAccess = (payload: any, targetId: string, target: any, body: any) => {
  if (payload.role === 'user' && payload.sub.toString() !== targetId) {
    return { error: 'Forbidden', status: 403 as const }
  }

  if (payload.role === 'manager') {
    if (target.departments?.id !== payload.department_id) {
      return { error: 'Forbidden: พนักงานนี้ไม่ได้อยู่ในแผนกของคุณ', status: 403 as const }
    }
    if (target.role !== 'user') {
      return { error: 'Forbidden: สามารถแก้ไขได้เฉพาะข้อมูลของพนักงานทั่วไป (User) เท่านั้น', status: 403 as const }
    }
  }

  if (payload.role === 'admin') {
    const isChangingManagerDept = body.departmentId && body.departmentId !== target.departments?.id && target.role === 'manager'
    if (isChangingManagerDept) {
      return { error: 'ไม่สามารถย้ายแผนก Manager ได้โดยตรง กรุณาลดระดับสิทธิ์ (Demote) เป็น User ก่อนย้ายแผนก', status: 403 as const }
    }
  }

  return null
}

const mapProfileUpdateError = (errorMessage: string) => {
  const errorMap: Record<string, { message: string; status: number }> = {
    'NOT_FOUND': { message: 'ไม่พบพนักงาน', status: 404 },
    'EMPLOYEE_CODE_ALREADY_SET': { message: 'รหัสพนักงานถูกตั้งไว้แล้ว ไม่สามารถแก้ไขได้', status: 409 },
    'EMPLOYEE_CODE_EXISTS': { message: 'รหัสพนักงานนี้มีในระบบแล้ว', status: 409 },
    'EMPLOYEE_DISABLED': { message: 'ไม่สามารถแก้ไขข้อมูลพนักงานที่ถูกระงับได้', status: 409 }
  }
  
  return errorMap[errorMessage] || null
}

employeeRouter.use('*', requireAuth)

employeeRouter.get('/', requireRole('admin', 'manager'), async (c) => {
  const payload = c.get('jwtPayload')
  const departmentId = (payload as any).department_id ?? null
  const employees = await EmployeeService.getEmployees(payload.role, departmentId)
  return c.json({ data: employees })
})

employeeRouter.get('/me', async (c) => {
  const payload = c.get('jwtPayload')
  const emp = await EmployeeService.getEmployeeById(payload.sub.toString())
  if (!emp) return c.json({ error: 'Not found' }, 404)
  return c.json(emp)
})

employeeRouter.get('/:id', requireRole('admin', 'manager'), async (c) => {
  const payload = c.get('jwtPayload')
  const emp = await EmployeeService.getEmployeeById(c.req.param('id'))
  if (!emp) return c.json({ error: 'Not found' }, 404)
  if (payload.role === 'manager') {
    if (emp.departments?.id !== (payload as any).department_id) {
      return c.json({ error: 'Forbidden: พนักงานนี้ไม่ได้อยู่ในแผนกของคุณ' }, 403)
    }
    if (emp.role !== 'user') {
      return c.json({ error: 'Forbidden: ไม่ได้รับอนุญาตให้เข้าถึงข้อมูล' }, 403)
    }
  }
  return c.json(emp)
})

employeeRouter.post('/', requireRole('admin', 'manager'), async (c) => {
  const body = await c.req.json()
  const payload = c.get('jwtPayload')

  const errors = validatePassword(body.password ?? '')
  if (errors.length > 0) return c.json({ error: 'Password policy violation', details: errors }, 400)

  if (payload.role === 'manager') {
    body.departmentId = (payload as any).department_id
    body.role = 'user'
  }
  try {
    const emp = await EmployeeService.createEmployee(body, payload.sub.toString(), payload.role)
    return c.json(emp, 201)
  } catch (e: any) {
    if (e.message === 'EMAIL_EXISTS' || e.message === 'EMPLOYEE_CODE_EXISTS') {
      return c.json({ error: 'ไม่สามารถสร้างบัญชีได้ ข้อมูลบางอย่างไม่ถูกต้องหรือมีอยู่ในระบบแล้ว' }, 409)
    }
    if (e.message === 'PASSWORD_BREACHED') {
      return c.json({ 
        error: 'รหัสผ่านนี้ไม่ปลอดภัย กรุณาตั้งรหัสผ่านใหม่' 
      }, 400)
    }
    throw e
  }
})

employeeRouter.patch('/:id/demote', requireRole('admin'), (c) => handleRoleChange(c, 'demote'))

employeeRouter.patch('/:id/promote', requireRole('admin'), (c) => handleRoleChange(c, 'promote'))

employeeRouter.patch('/:id/disable', requireRole('manager'), async (c) => {
  const payload = c.get('jwtPayload')

  const target = await EmployeeService.getEmployeeById(c.req.param('id'))
  if (!target) return c.json({ error: 'ไม่พบพนักงาน' }, 404)
  if (target.departments?.id !== (payload as any).department_id)
    return c.json({ error: 'Forbidden: พนักงานนี้ไม่ได้อยู่ในแผนกของคุณ' }, 403)

  if (target.role !== 'user') {
    return c.json({ error: 'Forbidden: ระงับบัญชีได้เฉพาะพนักงานทั่วไป (User) เท่านั้น' }, 403)
  }
  
  try {
    const result = await EmployeeService.disableEmployee(c.req.param('id'), payload.sub.toString(), payload.role)
    return c.json(result)
  } catch (e: any) {
    if (e.message === 'NOT_FOUND') return c.json({ error: 'ไม่พบพนักงาน' }, 404)
    if (e.message === 'ALREADY_DISABLED') return c.json({ error: 'ลาออกแล้ว' }, 409)
    if (e.message === 'CANNOT_DISABLE_ADMIN') return c.json({ error: 'ไม่สามารถบันทึกให้ admin ลาออกได้' }, 403)
    throw e
  }
})

employeeRouter.patch('/:id/profile', async (c) => {
  const payload = c.get('jwtPayload')
  const targetId = c.req.param('id')
  const body = await c.req.json()

  const target = await EmployeeService.getEmployeeById(targetId)
  if (!target) return c.json({ error: 'ไม่พบพนักงาน' }, 404)

  const accessError = checkProfileAccess(payload, targetId, target, body)
  if (accessError) {
    return c.json({ error: accessError.error }, accessError.status)
  }

  try {
    const result = await EmployeeService.updateProfile(targetId, body, payload.sub.toString(), payload.role)
    return c.json(result)
  } catch (e: any) {
    const mappedError = mapProfileUpdateError(e.message)
    if (mappedError) {
      return c.json({ error: mappedError.message }, mappedError.status as any)
    }
    throw e
  }
})

export default employeeRouter