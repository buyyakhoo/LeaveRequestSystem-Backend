import { prisma } from '../lib/prisma.js'

export const logEvent = async (params: {
  actorId: string | null
  actorRole: string
  action: string              // ADD_USER | DISABLE_USER | LEAVE_REQUEST | LEAVE_APPROVE | LEAVE_REJECT
  targetId?: string | null
  targetType?: string | null  // employee | leave_request
  detail?: object | null
  result?: string
}) => {
  await prisma.event_logs.create({
    data: {
      actor_id: params.actorId ?? null,
      actor_role: params.actorRole,
      action: params.action,
      target_id: params.targetId ?? null,
      target_type: params.targetType ?? null,
      detail: params.detail ?? undefined,
      result: params.result ?? 'success',
    },
  })
}

export const getEventLogs = async (actorId: string, actorRole: string, limit = 50, from?: Date) => {
  const where: Record<string, unknown> = actorRole === 'manager' ? { actor_id: actorId } : {}
  if (from) where.timestamp = { gte: from }

  const logs = await prisma.event_logs.findMany({
    where,
    include: {
      actor: { select: { email: true } },
    },
    orderBy: { timestamp: 'desc' },
    take: limit,
  })
  // BigInt ไม่ผ่าน JSON.stringify จึงต้องแปลงเป็น string ก่อน return
  return logs.map(log => ({ ...log, id: log.id.toString() }))
}