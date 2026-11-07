import "server-only";
import { ensureDatabase, getPool } from "@/lib/db";

export type PortalNotificationKind = "agent_activity" | "admin_message" | "agent_message";

export async function createPortalNotifications(
  recipientIds: number[],
  actorId: number | null,
  kind: PortalNotificationKind,
  title: string,
  message: string,
  href = "",
) {
  const ids = Array.from(new Set(recipientIds.filter((id) => Number.isSafeInteger(id) && id > 0)));
  if (!ids.length) return;
  await ensureDatabase();
  const tuples = ids.map(() => "(?, ?, ?, ?, ?, ?)").join(",");
  const values = ids.flatMap((recipientId) => [recipientId, actorId, kind, title.slice(0, 160), message.slice(0, 4000), href.slice(0, 255)]);
  await getPool().query(
    `INSERT INTO portal_notifications (recipient_user_id, actor_user_id, kind, title, message, href) VALUES ${tuples}`,
    values,
  );
}

export async function notifyAdminsOfAgentActivity(agentId: number, title: string, message: string, href = "/dashboard/agent-messages") {
  await ensureDatabase();
  const admins = await getPool().query(
    `SELECT u.id FROM users u LEFT JOIN admin_account_status s ON s.user_id = u.id
     WHERE u.role = 'admin' AND u.active = 1 AND COALESCE(s.status, 'active') = 'active'`,
  ) as Array<{ id: number }>;
  await createPortalNotifications(admins.map((admin) => Number(admin.id)), agentId, "agent_activity", title, message, href);
}

