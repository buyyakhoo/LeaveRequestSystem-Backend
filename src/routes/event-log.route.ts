import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth.middleware'
import { db } from '../db/index'

const eventLogRouter = new Hono()

eventLogRouter.use('*', authMiddleware)

// GET /event-logs — admin เห็นทั้งหมด, manager เห็นเฉพาะ action ของตัวเอง
eventLogRouter.get('/', requireRole('admin', 'manager'), async (c) => {
  const user = c.get('user')
  const limit = Number(c.req.query('limit') ?? 50)

  if (user.role === 'manager') {
    const result = await db.query(
      `SELECT el.*, e.email as actor_email
       FROM event_logs el
       LEFT JOIN employees e ON el.actor_id = e.id
       WHERE el.actor_id = $1
       ORDER BY el.timestamp DESC
       LIMIT $2`,
      [user.sub, limit]
    )
    return c.json({ data: result.rows })
  }

  // admin เห็นทั้งหมด
  const result = await db.query(
    `SELECT el.*, e.email as actor_email
     FROM event_logs el
     LEFT JOIN employees e ON el.actor_id = e.id
     ORDER BY el.timestamp DESC
     LIMIT $1`,
    [limit]
  )
  return c.json({ data: result.rows })
})

export default eventLogRouter