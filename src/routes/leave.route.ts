import { Hono } from 'hono'
import { requireAuth, requireRole } from '../middleware/auth.js'
import type { AuthVariables } from '../middleware/auth.js'
import * as LeaveService from '../services/leave.service.js'

const leaveRouter = new Hono<{ Variables: AuthVariables }>()

leaveRouter.use('*', requireAuth)

leaveRouter.post('/', requireRole('user'), async (c) => {
  const payload = c.get('jwtPayload')
  const body = await c.req.json()

  if (!body.leaveType || !body.startDate || !body.endDate || !body.reason)
    return c.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, 400)
  try {
    const result = await LeaveService.createLeaveRequest(body, payload.sub.toString())
    return c.json(result, 201)
  } catch (e: any) {
    if (e.message === 'DATE_IN_PAST') return c.json({ error: 'ไม่สามารถยื่นลาย้อนหลังได้' }, 400)
    if (e.message === 'DATE_OVERLAP') return c.json({ error: 'มีคำร้องที่ช่วงเวลานี้อยู่แล้ว' }, 409)
    throw e
  }
})

leaveRouter.get('/summary', async (c) => {
  const payload = c.get('jwtPayload')
  const result = await LeaveService.getLeaveSummary(payload.sub.toString())
  return c.json(result)
})

leaveRouter.get('/', async (c) => {
  const payload = c.get('jwtPayload')
  const status = c.req.query('status')
  const result = await LeaveService.getLeaveRequests(
    payload.sub.toString(),
    payload.role,
    status,
    (payload as any).department_id
  )
  return c.json({ data: result })
})

leaveRouter.patch('/:id/approve', requireRole('admin', 'manager'), async (c) => {
  const payload = c.get('jwtPayload')
  try {
    const result = await LeaveService.approveLeave(c.req.param('id'), payload.sub.toString(), payload.role, payload.department_id)
    return c.json(result)
  } catch (e: any) {
    if (e.message === 'NOT_FOUND') return c.json({ error: 'ไม่พบคำร้อง' }, 404)
    if (e.message === 'NOT_PENDING') return c.json({ error: 'คำร้องนี้ถูกตัดสินแล้ว' }, 409)
    if (e.message === 'FORBIDDEN') return c.json({ error: 'ไม่มีสิทธิ์จัดการคำร้องของแผนกอื่น' }, 403)
    throw e
  }
})

leaveRouter.patch('/:id/reject', requireRole('admin', 'manager'), async (c) => {
  const payload = c.get('jwtPayload')
  try {
    const result = await LeaveService.rejectLeave(c.req.param('id'), payload.sub.toString(), payload.role, payload.department_id)
    return c.json(result)
  } catch (e: any) {
    if (e.message === 'NOT_FOUND') return c.json({ error: 'ไม่พบคำร้อง' }, 404)
    if (e.message === 'NOT_PENDING') return c.json({ error: 'คำร้องนี้ถูกตัดสินแล้ว' }, 409)
    if (e.message === 'FORBIDDEN') return c.json({ error: 'ไม่มีสิทธิ์จัดการคำร้องของแผนกอื่น' }, 403)
    throw e
  }
})

export default leaveRouter