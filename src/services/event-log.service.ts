import { db } from '../db/index'

export const logEvent = async (params: {
  actorId: string | null
  actorRole: string
  action: string
  targetId?: string | null
  targetType?: string | null
  detail?: object | null
  result?: 'success' | 'failed'
}) => {
  await db.query(
    `INSERT INTO event_logs 
      (actor_id, actor_role, action, target_id, target_type, detail, result)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      params.actorId,
      params.actorRole,
      params.action,
      params.targetId ?? null,
      params.targetType ?? null,
      params.detail ? JSON.stringify(params.detail) : null,
      params.result ?? 'success',
    ]
  )
}