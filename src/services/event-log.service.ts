import { prisma } from '../lib/prisma.js'

// logEvent: บันทึก event ทุกครั้งที่มีการกระทำสำคัญ
// เรียกจาก service ตัวอื่นๆ 
// ไม่เรียกจาก route โดยตรง
export const logEvent = async (params: {
  actorId: string | null      // ใครทำ
  actorRole: string           // role ของคนทำ
  action: string              // ADD_USER | DISABLE_USER | LEAVE_REQUEST | LEAVE_APPROVE | LEAVE_REJECT
  targetId?: string | null    // กระทำกับใคร/อะไร
  targetType?: string | null  // employee | leave_request
  detail?: object | null      // ข้อมูลเพิ่มเติม เช่น { email, role }
  result?: string             // success | failed
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

// getEventLogs: ดึง log
// admin → ทั้งหมด
// manager → เฉพาะของตัวเอง
export const getEventLogs = async (actorId: string, actorRole: string, limit = 50) => {
  return prisma.event_logs.findMany({
    where: actorRole === 'manager' ? { actor_id: actorId } : {},
    include: {
      actor: { select: { email: true } },
    },
    orderBy: { timestamp: 'desc' },
    take: limit,
  })
}