import { prisma } from '../lib/prisma.js'
import { logEvent } from './event-log.service.js'

// createLeaveRequest: สร้างคำร้องขอลา
export const createLeaveRequest = async (
  data: {
    leaveType: string
    startDate: string
    endDate: string
    reason: string
    delegateName?: string
  },
  actorId: string
) => {
  const start = new Date(data.startDate)
  const end = new Date(data.endDate)

  // เช็ควันที่ซ้อนกับคำร้องที่ pending/approved อยู่
  const overlap = await prisma.leave_requests.findFirst({
    where: {
      employee_id: actorId,
      status: { not: 'rejected' },
      start_date: { lte: end },
      end_date: { gte: start },
    },
  })
  if (overlap) throw new Error('DATE_OVERLAP')

  const result = await prisma.leave_requests.create({
    data: {
      employee_id: actorId,
      leave_type: data.leaveType as any,
      start_date: start,
      end_date: end,
      reason: data.reason,
      delegate_name: data.delegateName ?? null,
    },
  })

  // บันทึก event log
  await logEvent({
    actorId, actorRole: 'user', action: 'LEAVE_REQUEST',
    targetId: result.id, targetType: 'leave_request',
    detail: { leaveType: data.leaveType, startDate: data.startDate },
  })

  return result
}
// getLeaveRequests: ดึงคำร้องการลา
export const getLeaveRequests = async (
  actorId: string,
  actorRole: string,
  status?: string
) => {
  // user → WHERE employee_id = ตัวเอง
  const where = {
    ...(actorRole === 'user' && { employee_id: actorId }),
    ...(status && { status: status as any }),
  }

  return prisma.leave_requests.findMany({
    where,
    include: {
      employee: {
        select: { first_name: true, last_name: true, department_id: true },
      },
    },
    orderBy: { created_at: 'desc' },
  })
}

// approveLeave + rejectLeave
// เช็คว่า status ยัง pending อยู่ไหม
// update status + reviewed_by + reviewed_at
export const approveLeave = async (leaveId: string, actorId: string, actorRole: string) => {
  const leave = await prisma.leave_requests.findUnique({ where: { id: leaveId } })
  if (!leave) throw new Error('NOT_FOUND')
  if (leave.status !== 'pending') throw new Error('NOT_PENDING')

  const result = await prisma.leave_requests.update({
    where: { id: leaveId },
    data: { status: 'approved', reviewed_by: actorId, reviewed_at: new Date() },
  })

  await logEvent({ actorId, actorRole, action: 'LEAVE_APPROVE', targetId: leaveId, targetType: 'leave_request' })
  return result
}

export const rejectLeave = async (leaveId: string, actorId: string, actorRole: string) => {
  const leave = await prisma.leave_requests.findUnique({ where: { id: leaveId } })
  if (!leave) throw new Error('NOT_FOUND')
  if (leave.status !== 'pending') throw new Error('NOT_PENDING')

  const result = await prisma.leave_requests.update({
    where: { id: leaveId },
    data: { status: 'rejected', reviewed_by: actorId, reviewed_at: new Date() },
  })

  await logEvent({ actorId, actorRole, action: 'LEAVE_REJECT', targetId: leaveId, targetType: 'leave_request' })
  return result
}