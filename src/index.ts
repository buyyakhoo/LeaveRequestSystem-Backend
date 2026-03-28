import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import auth from './routes/auth.js'
import employeeRouter from './routes/employee.route.js'
import leaveRouter from './routes/leave.route.js'
import eventLogRouter from './routes/event-log.route.js'

const app = new Hono()

app.use('*', cors({
  origin: 'http://localhost:5173',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

app.route('/auth', auth)
app.route('/employees', employeeRouter)
app.route('/leaves', leaveRouter)
app.route('/event-logs', eventLogRouter)

app.get('/departments', async (c) => {
  const deps = await prisma.departments.findMany({ orderBy: { name: 'asc' } })
  return c.json({ data: deps })
})

serve({ fetch: app.fetch, port: 3000 }, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
