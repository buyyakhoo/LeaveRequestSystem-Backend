import { Hono } from 'hono'
import { requireAuth, requireRole } from '../middleware/auth.js'
import type { AuthVariables } from '../middleware/auth.js'
import { getEventLogs } from '../services/event-log.service.js'

const eventLogRouter = new Hono<{ Variables: AuthVariables }>()

eventLogRouter.use('*', requireAuth) //login ก่อน

// GET /event-logs
// admin → เห็น log ทุกคน
// manager → เห็นเฉพาะ log ของตัวเอง
// ?limit=20 จำกัดจำนวน default 50
eventLogRouter.get('/', requireRole('admin', 'manager'), async (c) => {
  const payload = c.get('jwtPayload')
  const limit = Number(c.req.query('limit') ?? 50)
  const result = await getEventLogs(payload.sub.toString(), payload.role, limit)
  return c.json({ data: result })
})

export default eventLogRouter
