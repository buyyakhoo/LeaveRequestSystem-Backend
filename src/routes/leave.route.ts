import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth.middleware'
import * as LeaveService from '../services/leave.service'

const leaveRouter = new Hono()

leaveRouter.use('*', authMiddleware)

// POST /leaves — user ยื่นคำร้องขอลา
leaveRouter.post('/', requireRole('user'), async (c) => {
  const user = c.get('user')
  const body = await c.req.json()

  if (!body.leaveType || !body.startDate || !body.endDate || !body.reason) {
    return c.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, 400)
  }

  try {
    const result = await LeaveService.createLeaveRequest(body, user.sub)
    return c.json(result, 201)
  } catch (e: any) {
    if (e.message === 'DATE_OVERLAP')
      return c.json({ error: 'มีคำร้องที่ช่วงเวลานี้อยู่แล้ว' }, 409)
    throw e
  }
})

// GET /leaves — user ดูของตัวเอง, admin/manager ดูทั้งหมด
leaveRouter.get('/', async (c) => {
  const user = c.get('user')
  const status = c.req.query('status') // ?status=pending
  const result = await LeaveService.getLeaveRequests(user.sub, user.role, status)
  return c.json({ data: result })
})

// PATCH /leaves/:id/approve — manager/admin อนุมัติ
leaveRouter.patch('/:id/approve', requireRole('admin', 'manager'), async (c) => {
  const user = c.get('user')
  try {
    const result = await LeaveService.approveLeave(c.req.param('id'), user.sub, user.role)
    return c.json(result)
  } catch (e: any) {
    if (e.message === 'NOT_FOUND')   return c.json({ error: 'ไม่พบคำร้อง' }, 404)
    if (e.message === 'NOT_PENDING') return c.json({ error: 'คำร้องนี้ถูกตัดสินแล้ว' }, 409)
    throw e
  }
})

// PATCH /leaves/:id/reject — manager/admin ปฏิเสธ
leaveRouter.patch('/:id/reject', requireRole('admin', 'manager'), async (c) => {
  const user = c.get('user')
  try {
    const result = await LeaveService.rejectLeave(c.req.param('id'), user.sub, user.role)
    return c.json(result)
  } catch (e: any) {
    if (e.message === 'NOT_FOUND')   return c.json({ error: 'ไม่พบคำร้อง' }, 404)
    if (e.message === 'NOT_PENDING') return c.json({ error: 'คำร้องนี้ถูกตัดสินแล้ว' }, 409)
    throw e
  }
})

export default leaveRouter