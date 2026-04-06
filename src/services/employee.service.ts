import { prisma } from '../lib/prisma.js'
import { logEvent } from './event-log.service.js'
import { hashPassword, isPasswordBreached } from './user.service.js'

export const getEmployees = async (actorRole: string, actorDepartmentId: number | null) => {
  return prisma.employees.findMany({
    where: actorRole === 'manager' && actorDepartmentId
      ? { department_id: actorDepartmentId, role: 'user' }
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
  const existing = await prisma.employees.findUnique({ where: { email: data.email } })
  if (existing) throw new Error('EMAIL_EXISTS')

  if (data.employeeCode) {
    const existingCode = await prisma.employees.findUnique({ where: { employee_code: data.employeeCode } })
    if (existingCode) throw new Error('EMPLOYEE_CODE_EXISTS')
  }

  const breached = await isPasswordBreached(data.password)
  if (breached) throw new Error('PASSWORD_BREACHED')

  const hash = await hashPassword(data.password)

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

  await logEvent({
    actorId, actorRole, action: 'ADD_USER',
    targetId: employee.id, targetType: 'employee',
    detail: { email: data.email, role: data.role ?? 'user' },
  })

  return employee
}

export const disableEmployee = async (id: string, actorId: string, actorRole: string) => {
  const emp = await prisma.employees.findUnique({ where: { id } })
  if (!emp) throw new Error('NOT_FOUND')
  if (emp.status === 'disabled') throw new Error('ALREADY_DISABLED')
  if (emp.role === 'admin') throw new Error('CANNOT_DISABLE_ADMIN')

  await prisma.employees.update({
    where: { id },
    data: { status: 'disabled', updated_at: new Date() },
  })

  await logEvent({ 
    actorId, 
    actorRole, 
    action: 'DISABLE_USER', 
    targetId: id, 
    targetType: 'employee',
    detail: { email: emp.email }
  })
  return { message: 'Disabled successfully' }
}

export const promoteToManager = async (id: string, actorId: string, actorRole: string) => {
  const emp = await prisma.employees.findUnique({ where: { id } })
  if (!emp) throw new Error('NOT_FOUND')
  if (emp.status === 'disabled') throw new Error('EMPLOYEE_DISABLED')
  if (emp.role !== 'user') throw new Error('NOT_A_USER')

  const result = await prisma.employees.update({
    where: { id },
    data: { role: 'manager', updated_at: new Date() },
    select: {
      id: true, email: true, first_name: true, last_name: true,
      role: true, departments: { select: { id: true, name: true } },
    },
  })

  await logEvent({
    actorId, actorRole, action: 'PROMOTE_USER',
    targetId: id, targetType: 'employee',
    detail: { email: emp.email },
  })

  return result
}

export const demoteToUser = async (id: string, actorId: string, actorRole: string) => {
  const emp = await prisma.employees.findUnique({ where: { id } })
  if (!emp) throw new Error('NOT_FOUND')
  if (emp.status === 'disabled') throw new Error('EMPLOYEE_DISABLED')
  if (emp.role !== 'manager') throw new Error('NOT_A_MANAGER')

  const result = await prisma.employees.update({
    where: { id },
    data: { role: 'user', updated_at: new Date() },
    select: {
      id: true, email: true, first_name: true, last_name: true,
      role: true, departments: { select: { id: true, name: true } },
    },
  })

  await logEvent({
    actorId, actorRole, action: 'DEMOTE_USER',
    targetId: id, targetType: 'employee',
    detail: { email: emp.email },
  })

  return result
}

export const updateProfile = async (
  id: string,
  data: { firstName?: string; lastName?: string; departmentId?: number; employeeCode?: string },
  actorId: string,
  actorRole: string
) => {
  const current = await prisma.employees.findUnique({ where: { id }, select: { employee_code: true, status: true } })
  if (!current) throw new Error('NOT_FOUND')
  if (current.status === 'disabled') throw new Error('EMPLOYEE_DISABLED')
  let employeeCodeUpdate: { employee_code: string } | undefined
  if (data.employeeCode) {
    if (current.employee_code !== null) throw new Error('EMPLOYEE_CODE_ALREADY_SET')
    const dup = await prisma.employees.findUnique({ where: { employee_code: data.employeeCode } })
    if (dup) throw new Error('EMPLOYEE_CODE_EXISTS')
    employeeCodeUpdate = { employee_code: data.employeeCode }
  }

  const result = await prisma.employees.update({
    where: { id },
    data: {
      ...(data.firstName && { first_name: data.firstName }),
      ...(data.lastName && { last_name: data.lastName }),
      ...(data.departmentId && { department_id: data.departmentId }),
      ...employeeCodeUpdate,
      updated_at: new Date(),
    },
    select: {
      id: true, email: true, first_name: true, last_name: true,
      departments: { select: { id: true, name: true } },
      role: true, status: true,
    },
  })

  await logEvent({
    actorId,
    actorRole,
    action: 'UPDATE_PROFILE',
    targetId: id,
    targetType: 'employee',
    detail: { email: result.email }
  })
  return result
}