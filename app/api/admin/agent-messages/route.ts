import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { ensureDatabase, getPool, queryRows } from "@/lib/db";
import { createPortalNotifications } from "@/lib/portal-notifications";
import { getTestSandbox, saveTestSandbox } from "@/lib/test-batch-sandbox";

export const dynamic = "force-dynamic";

type NotificationRow = {
  id: number;
  kind: "agent_activity" | "admin_message" | "agent_message";
  title: string;
  message: string;
  href: string;
  read_at: string | Date | null;
  created_at: string | Date;
  actor_name: string | null;
  actor_email: string | null;
};

async function requireAdmin() {
  const session = await getAuthSession();
  if (!session) return { response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) } as const;
  if (session.role !== "admin") return { response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) } as const;
  return { session } as const;
}

async function getPracticeNotifications(adminId: number) {
  await ensureDatabase();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const sandbox = await getTestSandbox(connection);
    await connection.commit();
    return (sandbox?.data.notifications ?? []).map((item) => ({
      id: -item.id,
      kind: "agent_activity" as const,
      title: item.title,
      message: item.message,
      href: "/dashboard/agent-messages",
      read_at: item.read_by.includes(adminId) ? item.created_at : null,
      created_at: item.created_at,
      actor_name: item.agent_name,
      actor_email: item.agent_email,
    }));
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

async function markPracticeNotificationsRead(adminId: number, notificationId?: number) {
  await ensureDatabase();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const sandbox = await getTestSandbox(connection);
    if (sandbox) {
      const notifications = notificationId === undefined
        ? sandbox.data.notifications
        : sandbox.data.notifications.filter((item) => item.id === Math.abs(notificationId));
      for (const notification of notifications) {
        if (!notification.read_by.includes(adminId)) notification.read_by.push(adminId);
      }
      if (notifications.length) await saveTestSandbox(connection, sandbox);
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    if (new URL(request.url).searchParams.get("summary") === "1") {
      const [counts, practiceNotifications] = await Promise.all([queryRows<{ unread: number | string }>(
        "SELECT COUNT(*) AS unread FROM portal_notifications WHERE recipient_user_id=? AND read_at IS NULL", [auth.session.userId],
      ), getPracticeNotifications(auth.session.userId)]);
      const practiceUnread = practiceNotifications.filter((item) => item.read_at === null).length;
      return NextResponse.json({ unread: Number(counts[0]?.unread ?? 0) + practiceUnread }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const [notifications, sent, agents] = await Promise.all([
      queryRows<NotificationRow>(
        `SELECT n.id,n.kind,n.title,n.message,n.href,n.read_at,n.created_at,u.display_name AS actor_name,u.email AS actor_email
         FROM portal_notifications n LEFT JOIN users u ON u.id=n.actor_user_id
         WHERE n.recipient_user_id=? ORDER BY n.created_at DESC,n.id DESC LIMIT 150`, [auth.session.userId],
      ),
      queryRows<NotificationRow>(
        `SELECT MAX(n.id) AS id,n.kind,n.title,n.message,n.href,MAX(n.read_at) AS read_at,n.created_at,'You' AS actor_name,NULL AS actor_email
         FROM portal_notifications n WHERE n.actor_user_id=? AND n.kind='admin_message'
         GROUP BY n.kind,n.title,n.message,n.href,n.created_at
         ORDER BY n.created_at DESC,MAX(n.id) DESC LIMIT 50`, [auth.session.userId],
      ),
      queryRows<{ id: number; name: string; email: string }>(
        `SELECT u.id,COALESCE(NULLIF(TRIM(CONCAT_WS(' ',p.first_name,p.other_names,p.last_name)),''),u.display_name) AS name,u.email
         FROM users u LEFT JOIN agent_profiles p ON p.user_id=u.id
         LEFT JOIN agent_account_status s ON s.user_id=u.id
         WHERE u.role='agent' AND u.active=1 AND COALESCE(s.status,'active')='active'
         ORDER BY name,u.id`,
      ),
    ]);
    const jsonSafe = (item: NotificationRow) => ({ ...item, id: Number(item.id) });
    const practiceNotifications = await getPracticeNotifications(auth.session.userId);
    const combined = [...notifications.map(jsonSafe), ...practiceNotifications]
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
      .slice(0, 150);
    return NextResponse.json({ notifications: combined, sent: sent.map(jsonSafe), agents, unread: combined.filter((item) => item.read_at === null).length }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Could not load agent activity and messages:", error);
    return NextResponse.json({ error: "Agent messages could not be loaded. Refresh and try again." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  let body: { message?: unknown; recipientId?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Enter a message for the agent." }, { status: 400 }); }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length < 2 || message.length > 2000) return NextResponse.json({ error: "Messages must be between 2 and 2,000 characters." }, { status: 400 });
  if (body.recipientId !== "all" && (!/^\d+$/.test(String(body.recipientId)) || !Number.isSafeInteger(Number(body.recipientId)) || Number(body.recipientId) < 1)) {
    return NextResponse.json({ error: "Choose an active agent to receive this message." }, { status: 400 });
  }
  try {
    const agents = body.recipientId === "all"
      ? await queryRows<{ id: number }>(
        `SELECT u.id FROM users u LEFT JOIN agent_account_status s ON s.user_id=u.id
         WHERE u.role='agent' AND u.active=1 AND COALESCE(s.status,'active')='active'`,
      )
      : await queryRows<{ id: number }>(
        `SELECT u.id FROM users u LEFT JOIN agent_account_status s ON s.user_id=u.id
         WHERE u.id=? AND u.role='agent' AND u.active=1 AND COALESCE(s.status,'active')='active'`, [Number(body.recipientId)],
      );
    if (!agents.length) return NextResponse.json({ error: "Choose an active agent to receive this message." }, { status: 404 });
    await createPortalNotifications(agents.map((agent) => Number(agent.id)), auth.session.userId, "admin_message", "Message from MAAF Admin", message, "/agent");
    return NextResponse.json({ success: true, recipientCount: agents.length, message: agents.length === 1 ? "Message sent to the agent." : `Message sent to ${agents.length} active agents.` }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Could not send admin message to agent:", error);
    return NextResponse.json({ error: "The message could not be sent. Try again." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  let body: { notificationId?: unknown; markAllRead?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Choose a notification to update." }, { status: 400 }); }
  try {
    if (body.markAllRead === true) {
      await queryRows("UPDATE portal_notifications SET read_at=UTC_TIMESTAMP() WHERE recipient_user_id=? AND read_at IS NULL", [auth.session.userId]);
      await markPracticeNotificationsRead(auth.session.userId);
    } else {
      const id = Number(body.notificationId);
      if (!Number.isSafeInteger(id) || id === 0) return NextResponse.json({ error: "Choose a valid notification." }, { status: 400 });
      if (id < 0) await markPracticeNotificationsRead(auth.session.userId, id);
      else await queryRows("UPDATE portal_notifications SET read_at=UTC_TIMESTAMP() WHERE id=? AND recipient_user_id=?", [id, auth.session.userId]);
    }
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Could not update admin notification:", error);
    return NextResponse.json({ error: "The notification could not be updated." }, { status: 503 });
  }
}
