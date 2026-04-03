import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logEvent, getEventLogs } from '../../src/services/event-log.service.js'
import { prisma } from '../../src/lib/prisma.js'

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: { event_logs: { create: vi.fn(), findMany: vi.fn() } },
}))

describe('EventLogService', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('logEvent', () => {
    it('should map parameters and call prisma create correctly', async () => {
      await logEvent({ actorId: 'user-1', actorRole: 'admin', action: 'TEST', targetId: 't-1', targetType: 'user', detail: { ok: 1 } })
      expect(prisma.event_logs.create).toHaveBeenCalled()
    })

    it('should handle missing optional parameters with defaults', async () => {
      await logEvent({ actorId: null, actorRole: 'system', action: 'AUTO_JOB' })
      expect(prisma.event_logs.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ actor_id: null, target_id: null, target_type: null, detail: undefined })
      }))
    })
  })

  describe('getEventLogs', () => {
    it('should return logs with BigInt id converted to string', async () => {
      vi.mocked(prisma.event_logs.findMany).mockResolvedValue([{ id: 1n, action: 'A', actor_id: '1' } as any])
      const result = await getEventLogs('1', 'admin', 10)
      expect(result[0].id).toBe('1')
    })

    it('should filter logs by actor_id if role is manager', async () => {
      vi.mocked(prisma.event_logs.findMany).mockResolvedValue([])
      await getEventLogs('manager-id', 'manager')
      expect(prisma.event_logs.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { actor_id: 'manager-id' } }))
    })

    it('should filter logs by date if "from" parameter is provided', async () => {
      const fromDate = new Date('2024-01-01')
      vi.mocked(prisma.event_logs.findMany).mockResolvedValue([])
      await getEventLogs('user-1', 'admin', 50, fromDate)
      expect(prisma.event_logs.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { timestamp: { gte: fromDate } }
      }))
    })
  })
})