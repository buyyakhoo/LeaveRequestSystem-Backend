import 'dotenv/config'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serve } from '@hono/node-server'
import authRouter from './routes/auth.route'
import employeeRouter from './routes/employee.route'
import leaveRouter from './routes/leave.route'
import eventLogRouter from './routes/event-log.route'

const app = new Hono()

app.use('*', logger())
app.use('*', cors({ origin: 'http://localhost:5173', credentials: true }))

app.get('/health', (c) => c.json({ ok: true }))
app.route('/auth', authRouter)
app.route('/employees', employeeRouter)
app.route('/leaves', leaveRouter)
app.route('/event-logs', eventLogRouter)

serve({ fetch: app.fetch, port: Number(process.env.PORT) || 3000 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`)
})