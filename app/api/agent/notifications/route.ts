import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { queryRows } from "@/lib/db";
import { createPortalNotifications } from "@/lib/portal-notifications";

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
};

async function requireAgent() {
  const session = await getAuthSession();
  if (!session) return { response: NextResponse.json({ error: "Sign in to open your notifications." }, { status: 401 }) } as const;
  if (session.role !== "agent") return { response: NextResponse.json({ error: "Agent access required." }, { status: 403 }) } as const;
  return { session } as const;
}

export async function GET() {
  const auth = await requireAgent();
  if ("response" in auth) return auth.response;
  try {
    const [notifications, sent] = await Promise.all([
      queryRows<NotificationRow>(
        `SELECT n.id,n.kind,n.title,n.message,n.href,n.read_at,n.created_at,u.display_name AS actor_name
         FROM portal_notifications n LEFT JOIN users u ON u.id=n.actor_user_id
         WHERE n.recipient_user_id=? ORDER BY n.created_at DESC,n.id DESC LIMIT 100`, [auth.session.userId],
      ),
      queryRows<NotificationRow>(
        `SELECT MAX(n.id) AS id,n.kind,n.title,n.message,n.href,MAX(n.read_at) AS read_at,n.created_at,'MAAF Admin' AS actor_name
         FROM portal_notifications n WHERE n.actor_user_id=? AND n.kind='agent_message'
         GROUP BY n.kind,n.title,n.message,n.href,n.created_at
         ORDER BY n.created_at DESC,MAX(n.id) DESC LIMIT 30`, [auth.session.userId],
      ),
    ]);
    const jsonSafe = (item: NotificationRow) => ({ ...item, id: Number(item.id) });
    return NextResponse.json({ notifications: notifications.map(jsonSafe), sent: sent.map(jsonSafe), unread: notifications.filter((item) => item.read_at === null).length }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Could not load agent notifications:", error);
    return NextResponse.json({ error: "Notifications could not be loaded. Refresh and try again." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAgent();
  if ("response" in auth) return auth.response;
  let body: { message?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Enter a message for the admin team." }, { status: 400 }); }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length < 2 || message.length > 2000) return NextResponse.json({ error: "Messages must be between 2 and 2,000 characters." }, { status: 400 });
  try {
    const admins = await queryRows<{ id: number }>(
      `SELECT u.id FROM users u LEFT JOIN admin_account_status s ON s.user_id=u.id
       WHERE u.role='admin' AND u.active=1 AND COALESCE(s.status,'active')='active'`,
    );
    if (!admins.length) return NextResponse.json({ error: "There are no active administrators to receive this message." }, { status: 409 });
    await createPortalNotifications(admins.map((admin) => Number(admin.id)), auth.session.userId, "agent_message", `Message from ${auth.session.name}`, message, "/dashboard/agent-messages");
    return NextResponse.json({ success: true, message: "Your message was sent to the admin team." }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Could not send agent message:", error);
    return NextResponse.json({ error: "Your message could not be sent. Try again." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAgent();
  if ("response" in auth) return auth.response;
  let body: { notificationId?: unknown; markAllRead?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Choose a notification to update." }, { status: 400 }); }
  try {
    if (body.markAllRead === true) {
      await queryRows("UPDATE portal_notifications SET read_at=UTC_TIMESTAMP() WHERE recipient_user_id=? AND read_at IS NULL", [auth.session.userId]);
    } else {
      const id = Number(body.notificationId);
      if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Choose a valid notification." }, { status: 400 });
      await queryRows("UPDATE portal_notifications SET read_at=UTC_TIMESTAMP() WHERE id=? AND recipient_user_id=?", [id, auth.session.userId]);
    }
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Could not update agent notification:", error);
    return NextResponse.json({ error: "The notification could not be updated." }, { status: 503 });
  }
}
