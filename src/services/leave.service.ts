import { db } from '../db/index'
import { logEvent } from './event-log.service'

// ─── POST /leaves ────────────────────────────────────────────
// scenario: User กดปุ่ม Submit ยื่นคำร้องขอลา
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
  // เช็คว่ามีคำร้องซ้อนช่วงเวลาเดิมไหม
  const overlap = await db.query(
    `SELECT id FROM leave_requests
     WHERE employee_id = $1
       AND status != 'rejected'
       AND (start_date, end_date) OVERLAPS ($2::date, $3::date)`,
    [actorId, data.startDate, data.endDate]
  )
  if (overlap.rows[0]) throw new Error('DATE_OVERLAP')

  const result = await db.query(
    `INSERT INTO leave_requests
      (employee_id, leave_type, start_date, end_date, reason, delegate_name)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      actorId,
      data.leaveType,
      data.startDate,
      data.endDate,
      data.reason,
      data.delegateName ?? null,
    ]
  )

  await logEvent({
    actorId,
    actorRole: 'user',
    action: 'LEAVE_REQUEST',
    targetId: result.rows[0].id,
    targetType: 'leave_request',
    detail: { leaveType: data.leaveType, startDate: data.startDate, endDate: data.endDate },
  })

  return result.rows[0]
}

// ─── GET /leaves ─────────────────────────────────────────────
// scenario: User เปิดหน้าดูประวัติการลาของตัวเอง
// scenario: HR เปิดหน้าดูคำร้องรออนุมัติ
export const getLeaveRequests = async (
  actorId: string,
  actorRole: string,
  status?: string
) => {
  if (actorRole === 'user') {
    const result = await db.query(
      `SELECT lr.*, e.first_name, e.last_name, e.department
       FROM leave_requests lr
       JOIN employees e ON lr.employee_id = e.id
       WHERE lr.employee_id = $1
         AND ($2::text IS NULL OR lr.status = $2::leave_status)
       ORDER BY lr.created_at DESC`,
      [actorId, status ?? null]
    )
    return result.rows
  }

  // admin/manager
  const result = await db.query(
    `SELECT lr.*, e.first_name, e.last_name, e.department
     FROM leave_requests lr
     JOIN employees e ON lr.employee_id = e.id
     WHERE ($1::text IS NULL OR lr.status = $1::leave_status)
     ORDER BY lr.created_at DESC`,
    [status ?? null]
  )
  return result.rows
}

// ─── PATCH /leaves/:id/approve ───────────────────────────────
// scenario: HR กดปุ่ม "อนุมัติ" ข้างคำร้องรออนุมัติ
export const approveLeave = async (
  leaveId: string,
  actorId: string,
  actorRole: string
) => {
  const leave = await db.query(
    'SELECT * FROM leave_requests WHERE id = $1',
    [leaveId]
  )
  if (!leave.rows[0]) throw new Error('NOT_FOUND')
  if (leave.rows[0].status !== 'pending') throw new Error('NOT_PENDING')

  const result = await db.query(
    `UPDATE leave_requests
     SET status = 'approved', reviewed_by = $1, reviewed_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [actorId, leaveId]
  )

  await logEvent({
    actorId,
    actorRole,
    action: 'LEAVE_APPROVE',
    targetId: leaveId,
    targetType: 'leave_request',
  })

  return result.rows[0]
}

// ─── PATCH /leaves/:id/reject ────────────────────────────────
// scenario: HR กดปุ่ม "ไม่อนุมัติ"
export const rejectLeave = async (
  leaveId: string,
  actorId: string,
  actorRole: string
) => {
  const leave = await db.query(
    'SELECT * FROM leave_requests WHERE id = $1',
    [leaveId]
  )
  if (!leave.rows[0]) throw new Error('NOT_FOUND')
  if (leave.rows[0].status !== 'pending') throw new Error('NOT_PENDING')

  const result = await db.query(
    `UPDATE leave_requests
     SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [actorId, leaveId]
  )

  await logEvent({
    actorId,
    actorRole,
    action: 'LEAVE_REJECT',
    targetId: leaveId,
    targetType: 'leave_request',
  })

  return result.rows[0]
}