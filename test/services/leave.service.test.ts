import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createLeaveRequest, getLeaveRequests, getLeaveSummary, approveLeave, rejectLeave } from '../../src/services/leave.service.js'
import { prisma } from '../../src/lib/prisma.js'
import * as EventLogService from '../../src/services/event-log.service.js'

// Mock Prisma
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    leave_requests: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('../../src/services/event-log.service.js', () => ({ logEvent: vi.fn() }))

describe('LeaveService', () => {
  const actorId = '550e8400-e29b-41d4-a716-446655440000'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-05-10T00:00:00Z'))
  })

  describe('createLeaveRequest', () => {
    it('should throw DATE_IN_PAST error if start date is before today', async () => {
      const requestData = { leaveType: 'sick', startDate: '2024-05-09', endDate: '2024-05-10', reason: 'ป่วย' }
      await expect(createLeaveRequest(requestData, actorId)).rejects.toThrow('DATE_IN_PAST')
    })

    it('should throw DATE_OVERLAP error if there is already an existing leave in the same period', async () => {
      const requestData = { leaveType: 'vacation', startDate: '2024-05-20', endDate: '2024-05-22', reason: 'พักผ่อน' }
      vi.mocked(prisma.leave_requests.findFirst).mockResolvedValue({ id: 'existing' } as any)
      await expect(createLeaveRequest(requestData, actorId)).rejects.toThrow('DATE_OVERLAP')
    })

    it('should create leave request successfully when data is valid', async () => {
      const requestData = { leaveType: 'vacation', startDate: '2024-06-01', endDate: '2024-06-05', reason: 'พักผ่อน' }
      const mockCreatedLeave = { id: 'new-leave-id', employee_id: actorId }
      vi.mocked(prisma.leave_requests.findFirst).mockResolvedValue(null)
      vi.mocked(prisma.leave_requests.create).mockResolvedValue(mockCreatedLeave as any)

      const result = await createLeaveRequest(requestData, actorId)
      expect(result.id).toBe('new-leave-id')
      expect(EventLogService.logEvent).toHaveBeenCalled()
    })
  })

  describe('getLeaveRequests', () => {
    it('should query only own leaves if role is user', async () => {
      await getLeaveRequests(actorId, 'user', 'pending')
      expect(prisma.leave_requests.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { employee_id: actorId, status: 'pending' }
      }))
    })

    it('should query all leaves if role is manager/admin', async () => {
      await getLeaveRequests(actorId, 'admin')
      expect(prisma.leave_requests.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {} 
      }))
    })
  })

  describe('getLeaveSummary', () => {
    it('should calculate pending count, total days, and grouped by type correctly', async () => {
      const mockLeaves = [
        { status: 'pending', leave_type: 'sick', start_date: new Date('2024-02-01'), end_date: new Date('2024-02-02') }, 
        { status: 'approved', leave_type: 'vacation', start_date: new Date('2024-03-01'), end_date: new Date('2024-03-03') }, 
        { status: 'approved', leave_type: 'vacation', start_date: new Date('2024-04-01'), end_date: new Date('2024-04-01') }, 
      ]
      vi.mocked(prisma.leave_requests.findMany).mockResolvedValue(mockLeaves as any)

      const result = await getLeaveSummary(actorId)
      expect(result.pending_count).toBe(1)
      expect(result.total_days_this_year).toBe(4)
      expect(result.by_type).toEqual({ vacation: 4 })
    })
  })

  describe('approveLeave / rejectLeave', () => {
    const leaveId = 'leave-123'
    
    it('should throw NOT_FOUND if leave does not exist', async () => {
      vi.mocked(prisma.leave_requests.findUnique).mockResolvedValue(null)
      await expect(approveLeave(leaveId, actorId, 'admin')).rejects.toThrow('NOT_FOUND')
    })

    it('should throw NOT_PENDING if leave is already approved/rejected', async () => {
      vi.mocked(prisma.leave_requests.findUnique).mockResolvedValue({ status: 'approved' } as any)
      await expect(rejectLeave(leaveId, actorId, 'admin')).rejects.toThrow('NOT_PENDING')
    })

    it('should throw FORBIDDEN if manager tries to approve/reject leave outside their department', async () => {
      const mockLeave = { status: 'pending', employee: { department_id: 2 } } 
      vi.mocked(prisma.leave_requests.findUnique).mockResolvedValue(mockLeave as any)
      
      await expect(approveLeave(leaveId, actorId, 'manager', 1)).rejects.toThrow('FORBIDDEN')
      await expect(rejectLeave(leaveId, actorId, 'manager', 1)).rejects.toThrow('FORBIDDEN')
    })

    it('should update status to approved and log event successfully', async () => {
      const mockLeave = { id: leaveId, status: 'pending', employee: { department_id: 1, email: 'user@mail.com' } }
      vi.mocked(prisma.leave_requests.findUnique).mockResolvedValue(mockLeave as any)
      vi.mocked(prisma.leave_requests.update).mockResolvedValue({ id: leaveId, status: 'approved' } as any)

      const result = await approveLeave(leaveId, actorId, 'manager', 1)
      expect(result.status).toBe('approved')
      expect(EventLogService.logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'LEAVE_APPROVE' }))
    })

    it('should update status to rejected and log event successfully', async () => {
      const mockLeave = { id: leaveId, status: 'pending', employee: { department_id: 1, email: 'user@mail.com' } }
      vi.mocked(prisma.leave_requests.findUnique).mockResolvedValue(mockLeave as any)
      vi.mocked(prisma.leave_requests.update).mockResolvedValue({ id: leaveId, status: 'rejected' } as any)

      const result = await rejectLeave(leaveId, actorId, 'admin')
      expect(result.status).toBe('rejected')
      expect(EventLogService.logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'LEAVE_REJECT' }))
    })
  })
})