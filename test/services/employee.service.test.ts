import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createEmployee, disableEmployee, getEmployees, getEmployeeById, promoteToManager, demoteToUser, updateProfile } from '../../src/services/employee.service.js'
import { prisma } from '../../src/lib/prisma.js'
import * as EventLogService from '../../src/services/event-log.service.js'
import * as UserService from '../../src/services/user.service.js'

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    employees: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  },
}))
vi.mock('../../src/services/event-log.service.js', () => ({ logEvent: vi.fn() }))
vi.mock('../../src/services/user.service.js', () => ({ hashPassword: vi.fn() }))

describe('EmployeeService', () => {
  const actorId = 'admin-uuid'

  beforeEach(() => { vi.clearAllMocks() })

  describe('getEmployees & getEmployeeById', () => {
    it('should filter by department if actor is manager', async () => {
      vi.mocked(prisma.employees.findMany).mockResolvedValue([])
      await getEmployees('manager', 5)
      expect(prisma.employees.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { department_id: 5, role: 'user' }
      }))
    })

    it('should return employee by ID', async () => {
      vi.mocked(prisma.employees.findUnique).mockResolvedValue({ id: '123' } as any)
      const result = await getEmployeeById('123')
      expect(result).toEqual({ id: '123' })
    })
  })

  describe('createEmployee', () => {
    it('should throw EMAIL_EXISTS if email is already in use', async () => {
      vi.mocked(prisma.employees.findUnique).mockResolvedValue({ id: 'existing' } as any)
      await expect(createEmployee({ email: 'dup@mail.com', firstName: 'A', lastName: 'B', password: '123' }, actorId, 'admin')).rejects.toThrow('EMAIL_EXISTS')
    })

    it('should throw EMPLOYEE_CODE_EXISTS if employeeCode is already in use', async () => {
      vi.mocked(prisma.employees.findUnique)
        .mockResolvedValueOnce(null) // เรียกครั้งแรก (เช็คอีเมล) -> ไม่ซ้ำ
        .mockResolvedValueOnce({ id: 'existing-code' } as any) // เรียกครั้งที่สอง (เช็ครหัส) -> ซ้ำ
      
      await expect(createEmployee({ email: 'new@mail.com', firstName: 'A', lastName: 'B', password: '123', employeeCode: 'EMP001' }, actorId, 'admin')).rejects.toThrow('EMPLOYEE_CODE_EXISTS')
    })

    it('should successfully create employee and log event', async () => {
      vi.mocked(prisma.employees.findUnique).mockResolvedValue(null)
      vi.mocked(UserService.hashPassword).mockResolvedValue('hashed_pw')
      const mockResult = { id: 'new-emp-id', email: 'new@mail.com', role: 'user' }
      vi.mocked(prisma.employees.create).mockResolvedValue(mockResult as any)

      const result = await createEmployee({ email: 'new@mail.com', firstName: 'J', lastName: 'D', password: '123' }, actorId, 'admin')
      expect(result.id).toBe('new-emp-id')
      expect(EventLogService.logEvent).toHaveBeenCalled()
    })
  })

  describe('disableEmployee', () => {
    it('should throw NOT_FOUND if employee not exists', async () => {
      vi.mocked(prisma.employees.findUnique).mockResolvedValue(null)
      await expect(disableEmployee('target', actorId, 'admin')).rejects.toThrow('NOT_FOUND')
    })

    it('should throw ALREADY_DISABLED if already disabled', async () => {
      vi.mocked(prisma.employees.findUnique).mockResolvedValue({ status: 'disabled' } as any)
      await expect(disableEmployee('target', actorId, 'admin')).rejects.toThrow('ALREADY_DISABLED')
    })

    it('should throw CANNOT_DISABLE_ADMIN if trying to disable an admin', async () => {
      vi.mocked(prisma.employees.findUnique).mockResolvedValue({ role: 'admin', status: 'active' } as any)
      await expect(disableEmployee('target', actorId, 'admin')).rejects.toThrow('CANNOT_DISABLE_ADMIN')
    })

    it('should disable employee successfully', async () => {
      vi.mocked(prisma.employees.findUnique).mockResolvedValue({ id: 'target', role: 'user', status: 'active' } as any)
      vi.mocked(prisma.employees.update).mockResolvedValue({ id: 'target', status: 'disabled' } as any)
      const result = await disableEmployee('target', actorId, 'admin')
      expect(result.message).toBe('Disabled successfully')
    })
  })

  describe('promoteToManager', () => {
    it('should throw errors for invalid states', async () => {
      vi.mocked(prisma.employees.findUnique).mockResolvedValue(null)
      await expect(promoteToManager('id', actorId, 'admin')).rejects.toThrow('NOT_FOUND')
      
      vi.mocked(prisma.employees.findUnique).mockResolvedValue({ status: 'disabled' } as any)
      await expect(promoteToManager('id', actorId, 'admin')).rejects.toThrow('EMPLOYEE_DISABLED')

      vi.mocked(prisma.employees.findUnique).mockResolvedValue({ status: 'active', role: 'manager' } as any)
      await expect(promoteToManager('id', actorId, 'admin')).rejects.toThrow('NOT_A_USER')
    })

    it('should promote successfully', async () => {
      vi.mocked(prisma.employees.findUnique).mockResolvedValue({ id: 'id', status: 'active', role: 'user' } as any)
      vi.mocked(prisma.employees.update).mockResolvedValue({ id: 'id', role: 'manager' } as any)
      const result = await promoteToManager('id', actorId, 'admin')
      expect(result.role).toBe('manager')
    })
  })

  describe('demoteToUser', () => {
    it('should throw errors for invalid states', async () => {
      vi.mocked(prisma.employees.findUnique).mockResolvedValue(null)
      await expect(demoteToUser('id', actorId, 'admin')).rejects.toThrow('NOT_FOUND')
      
      vi.mocked(prisma.employees.findUnique).mockResolvedValue({ status: 'disabled' } as any)
      await expect(demoteToUser('id', actorId, 'admin')).rejects.toThrow('EMPLOYEE_DISABLED')

      vi.mocked(prisma.employees.findUnique).mockResolvedValue({ status: 'active', role: 'user' } as any)
      await expect(demoteToUser('id', actorId, 'admin')).rejects.toThrow('NOT_A_MANAGER')
    })

    it('should demote successfully', async () => {
      vi.mocked(prisma.employees.findUnique).mockResolvedValue({ id: 'id', status: 'active', role: 'manager' } as any)
      vi.mocked(prisma.employees.update).mockResolvedValue({ id: 'id', role: 'user' } as any)
      const result = await demoteToUser('id', actorId, 'admin')
      expect(result.role).toBe('user')
    })
  })

  describe('updateProfile', () => {
    it('should throw errors for invalid states', async () => {
      vi.mocked(prisma.employees.findUnique).mockResolvedValue(null)
      await expect(updateProfile('id', {}, actorId, 'admin')).rejects.toThrow('NOT_FOUND')
      
      vi.mocked(prisma.employees.findUnique).mockResolvedValue({ status: 'disabled' } as any)
      await expect(updateProfile('id', {}, actorId, 'admin')).rejects.toThrow('EMPLOYEE_DISABLED')

      vi.mocked(prisma.employees.findUnique).mockResolvedValue({ status: 'active', employee_code: 'OLD01' } as any)
      await expect(updateProfile('id', { employeeCode: 'NEW01' }, actorId, 'admin')).rejects.toThrow('EMPLOYEE_CODE_ALREADY_SET')

      vi.mocked(prisma.employees.findUnique)
        .mockReset()
        .mockResolvedValueOnce({ status: 'active', employee_code: null } as any) // เรียกครั้งแรก (ดึงข้อมูลปัจจุบัน) -> ปกติ
        .mockResolvedValueOnce({ id: 'other' } as any) // เรียกครั้งที่สอง (เช็ครหัสที่อยากเปลี่ยน) -> ซ้ำ
      
      await expect(updateProfile('id', { employeeCode: 'DUP01' }, actorId, 'admin')).rejects.toThrow('EMPLOYEE_CODE_EXISTS')
    })

    it('should update profile successfully', async () => {
      vi.mocked(prisma.employees.findUnique).mockReset()
      
      // เรียกครั้งที่ 1 (ดึงข้อมูลพนักงานคนนี้): เจอพนักงาน สถานะ active และยังไม่เคยตั้ง employee_code
      vi.mocked(prisma.employees.findUnique).mockResolvedValueOnce({ status: 'active', employee_code: null } as any)
      
      // เรียกครั้งที่ 2 (เช็คว่า employeeCode ใหม่ซ้ำไหม): คืนค่า null แปลว่าไม่มีคนใช้ รหัสนี้ว่าง
      vi.mocked(prisma.employees.findUnique).mockResolvedValueOnce(null)
      
      vi.mocked(prisma.employees.update).mockResolvedValue({ id: 'id', first_name: 'New' } as any)
      
      const result = await updateProfile('id', { firstName: 'New', employeeCode: 'EMP99' }, actorId, 'admin')
      
      expect(prisma.employees.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ first_name: 'New', employee_code: 'EMP99' })
      }))
      expect(EventLogService.logEvent).toHaveBeenCalled()
    })
  })
})