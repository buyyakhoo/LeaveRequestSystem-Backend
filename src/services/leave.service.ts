import { prisma } from '../lib/prisma.js'
import { logEvent } from './event-log.service.js'

const updateLeaveStatus = async (
  leaveId: string,
  actorId: string,
  actorRole: string,
  targetStatus: 'approved' | 'rejected', // รับ status ปลายทางเข้ามา
  actorDepartmentId?: number | null
) => {
  const leave = await prisma.leave_requests.findUnique({
    where: { id: leaveId },
    include: { employee: { select: { department_id: true, email: true } } },
  })
  
  if (!leave) throw new Error('NOT_FOUND')
  if (leave.status !== 'pending') throw new Error('NOT_PENDING')

  if (actorRole === 'manager') {
    if (!actorDepartmentId || leave.employee.department_id !== actorDepartmentId) {
      throw new Error('FORBIDDEN')
    }
  }

  const result = await prisma.leave_requests.update({
    where: { id: leaveId },
    data: { status: targetStatus, reviewed_by: actorId, reviewed_at: new Date() },
  })

  const logAction = targetStatus === 'approved' ? 'LEAVE_APPROVE' : 'LEAVE_REJECT'

  await logEvent({ 
    actorId, 
    actorRole, 
    action: logAction, 
    targetId: leaveId, 
    targetType: 'leave_request', 
    detail: { email: leave.employee.email } 
  })
  
  return result
}

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

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  if (start < todayStart) throw new Error('DATE_IN_PAST')

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

  await logEvent({
    actorId, actorRole: 'user', action: 'LEAVE_REQUEST',
    targetId: result.id, targetType: 'leave_request',
    detail: { leaveType: data.leaveType, startDate: data.startDate },
  })

  return result
}

export const getLeaveRequests = async (
  actorId: string,
  actorRole: string,
  status?: string,
  actorDepartmentId?: number | null
) => {
  const where = {
    ...(actorRole === 'user' && { employee_id: actorId }),
    ...(actorRole === 'manager' && actorDepartmentId && {
      employee: { department_id: actorDepartmentId }
    }),
    ...(status && { status: status as any }),
  }

  return prisma.leave_requests.findMany({
    where,
    include: {
      employee: {
        select: { first_name: true, last_name: true, department_id: true, email: true },
      },
    },
    orderBy: { created_at: 'desc' },
  })
}

export const getLeaveSummary = async (actorId: string) => {
  const startOfYear = new Date(new Date().getFullYear(), 0, 1)

  const leaves = await prisma.leave_requests.findMany({
    where: {
      employee_id: actorId,
      start_date: { gte: startOfYear },
    },
    select: { leave_type: true, start_date: true, end_date: true, status: true },
  })

  const pendingCount = leaves.filter(l => l.status === 'pending').length

  const approvedLeaves = leaves.filter(l => l.status === 'approved')

  const calcDays = (l: { start_date: Date; end_date: Date }) =>
    Math.round((l.end_date.getTime() - l.start_date.getTime()) / (1000 * 60 * 60 * 24)) + 1

  const totalDaysThisYear = approvedLeaves.reduce((sum, l) => sum + calcDays(l), 0)

  const byType: Record<string, number> = {}
  for (const l of approvedLeaves) {
    byType[l.leave_type] = (byType[l.leave_type] ?? 0) + calcDays(l)
  }

  return { pending_count: pendingCount, total_days_this_year: totalDaysThisYear, by_type: byType }
}

export const approveLeave = async (leaveId: string, actorId: string, actorRole: string, actorDepartmentId?: number | null) => {
  return updateLeaveStatus(leaveId, actorId, actorRole, 'approved', actorDepartmentId)
}

export const rejectLeave = async (leaveId: string, actorId: string, actorRole: string, actorDepartmentId?: number | null) => {
  return updateLeaveStatus(leaveId, actorId, actorRole, 'rejected', actorDepartmentId)
}