import { Hono } from 'hono'
import { requireAuth, requireRole } from '../middleware/auth.js'
import type { AuthVariables } from '../middleware/auth.js'
import { getEventLogs } from '../services/event-log.service.js'

const eventLogRouter = new Hono<{ Variables: AuthVariables }>()

eventLogRouter.use('*', requireAuth)

eventLogRouter.get('/', requireRole('admin', 'manager'), async (c) => {
  const payload = c.get('jwtPayload')
  const limit = Number(c.req.query('limit') ?? 50)
  const fromParam = c.req.query('from')
  const from = fromParam ? new Date(fromParam) : undefined
  const result = await getEventLogs(payload.sub.toString(), payload.role, limit, from)
  return c.json({ data: result })
})

export default eventLogRouter
