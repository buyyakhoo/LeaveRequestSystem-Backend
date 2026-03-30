import { prisma } from '../lib/prisma.js'
import { logEvent } from './event-log.service.js'
import { hashPassword } from './user.service.js'

// getEmployees: ดึงรายชื่อพนักงาน
export const getEmployees = async (actorRole: string, actorDepartmentId: number | null) => {
  
  // ถ้า role=manager จะกรองเฉพาะ department_id ตัวเอง
  return prisma.employees.findMany({
    where: actorRole === 'manager' && actorDepartmentId
      ? { department_id: actorDepartmentId }
      : {},
    select: {
      id: true,
      employee_code: true,
      email: true,
      first_name: true,
      last_name: true,
      departments: { select: { id: true, name: true } },
      role: true,
      status: true,
      created_at: true,
    },
    orderBy: { created_at: 'desc' },
  })
}

// getEmployeeById: ดึงข้อมูลพนักงานคนเดียว
export const getEmployeeById = async (id: string) => {
  return prisma.employees.findUnique({
    where: { id },
    select: {
      id: true,
      employee_code: true,
      email: true,
      first_name: true,
      last_name: true,
      departments: { select: { id: true, name: true } },
      role: true,
      status: true,
    },
  })
}

// createEmployee: สร้างพนักงานใหม่
export const createEmployee = async (
  data: {
    email: string
    firstName: string
    lastName: string
    password: string
    departmentId?: number
    role?: string
    employeeCode?: string
  },
  actorId: string,
  actorRole: string
) => {
  // 1. เช็ค email และ employee_code ซ้ำ
  const existing = await prisma.employees.findUnique({ where: { email: data.email } })
  if (existing) throw new Error('EMAIL_EXISTS')

  if (data.employeeCode) {
    const existingCode = await prisma.employees.findUnique({ where: { employee_code: data.employeeCode } })
    if (existingCode) throw new Error('EMPLOYEE_CODE_EXISTS')
  }

  // 2. hash password
  const hash = await hashPassword(data.password)

  // 3. สร้าง employees row + employee_identities row พร้อมกัน
  const employee = await prisma.employees.create({
    data: {
      email: data.email,
      first_name: data.firstName,
      last_name: data.lastName,
      department_id: data.departmentId ?? null,
      role: (data.role as any) ?? 'user',
      employee_code: data.employeeCode ?? null,
      employee_identities: {
        create: { provider: 'local', password_hash: hash },
      },
    },
    select: {
      id: true, email: true, first_name: true, last_name: true,
      departments: { select: { id: true, name: true } },
      role: true, status: true,
    },
  })
  // 4. บันทึก event log
  await logEvent({
    actorId, actorRole, action: 'ADD_USER',
    targetId: employee.id, targetType: 'employee',
    detail: { email: data.email, role: data.role ?? 'user' },
  })

  return employee
}

// disableEmployee: เปลี่ยน status เป็น disabled
// เช็ค: มีอยู่ไหม, disabled แล้วหรือยัง, ห้าม disable admin
export const disableEmployee = async (id: string, actorId: string, actorRole: string) => {
  const emp = await prisma.employees.findUnique({ where: { id } })
  if (!emp) throw new Error('NOT_FOUND')
  if (emp.status === 'disabled') throw new Error('ALREADY_DISABLED')
  if (emp.role === 'admin') throw new Error('CANNOT_DISABLE_ADMIN')

  await prisma.employees.update({
    where: { id },
    data: { status: 'disabled', updated_at: new Date() },
  })
  // บันทึก event log
  await logEvent({ actorId, actorRole, action: 'DISABLE_USER', targetId: id, targetType: 'employee' })
  return { message: 'Disabled successfully' }
}

// updateProfile: แก้ข้อมูลพนักงาน
// ใช้ COALESCE — ถ้าไม่ส่งมาจะไม่อัปเดต field นั้น
export const updateProfile = async (
  id: string,
  data: { firstName?: string; lastName?: string; departmentId?: number },
  actorId: string,
  actorRole: string
) => {
  const result = await prisma.employees.update({
    where: { id },
    data: {
      ...(data.firstName && { first_name: data.firstName }),
      ...(data.lastName && { last_name: data.lastName }),
      ...(data.departmentId && { department_id: data.departmentId }),
      updated_at: new Date(),
    },
    select: {
      id: true, email: true, first_name: true, last_name: true,
      departments: { select: { id: true, name: true } },
      role: true, status: true,
    },
  })

  await logEvent({ actorId, actorRole, action: 'UPDATE_PROFILE', targetId: id, targetType: 'employee' })
  return result
}