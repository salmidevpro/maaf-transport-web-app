import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { ensureDatabase, getPool } from "@/lib/db";

type AccountStatus = "active" | "inactive" | "suspended";

async function authorize() {
  const session = await getAuthSession();
  if (!session) return { response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) } as const;
  if (session.role !== "admin") return { response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) } as const;
  return { session } as const;
}

function parseId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize();
  if ("response" in auth) return auth.response;
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid administrator ID." }, { status: 400 });

  let status: AccountStatus;
  try {
    const body = await request.json() as { status?: unknown };
    if (body.status !== "active" && body.status !== "inactive" && body.status !== "suspended") throw new Error("Invalid status");
    status = body.status;
  } catch {
    return NextResponse.json({ error: "Choose active, inactive, or suspended." }, { status: 400 });
  }
  if (id === auth.session.userId && status !== "active") {
    return NextResponse.json({ error: "You cannot disable or suspend your own account." }, { status: 400 });
  }

  let connection: Awaited<ReturnType<ReturnType<typeof getPool>["getConnection"]>> | undefined;
  try {
    await ensureDatabase();
    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const rows = await connection.query("SELECT u.id,u.role,ag.email_verified_at FROM users u LEFT JOIN agent_profiles ag ON ag.user_id=u.id WHERE u.id = ? AND u.role IN ('admin','agent') FOR UPDATE", [id]) as Array<{ id: number; role: "admin" | "agent"; email_verified_at: string | Date | null }>;
    const target = rows[0];
    if (!target) {
      await connection.rollback();
      return NextResponse.json({ error: "User account not found." }, { status: 404 });
    }
    if (target.role === "agent" && status === "active" && !target.email_verified_at) {
      await connection.rollback();
      return NextResponse.json({ error: "This agent must verify their email before the account can be activated." }, { status: 409 });
    }
    await connection.query("UPDATE users SET active = ? WHERE id = ?", [status === "active" ? 1 : 0, id]);
    const statusTable = target.role === "admin" ? "admin_account_status" : "agent_account_status";
    await connection.query(
      `INSERT INTO ${statusTable} (user_id, status) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status)`,
      [id, status],
    );
    if (status !== "active") await connection.query("DELETE FROM sessions WHERE user_id = ?", [id]);
    await connection.commit();
    return NextResponse.json({ success: true, status });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch { /* Connection may have dropped after commit. */ }
    }
    console.error("Could not update administrator status:", error);
    return NextResponse.json({ error: "Administrator status could not be updated." }, { status: 503 });
  } finally {
    connection?.release();
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize();
  if ("response" in auth) return auth.response;
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid administrator ID." }, { status: 400 });
  if (id === auth.session.userId) return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });

  let connection: Awaited<ReturnType<ReturnType<typeof getPool>["getConnection"]>> | undefined;
  try {
    await ensureDatabase();
    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const rows = await connection.query("SELECT id,role FROM users WHERE id = ? AND role IN ('admin','agent') FOR UPDATE", [id]) as Array<{ id: number; role: "admin" | "agent" }>;
    if (!rows[0]) {
      await connection.rollback();
      return NextResponse.json({ error: "User account not found." }, { status: 404 });
    }
    await connection.query("DELETE FROM users WHERE id = ? AND role IN ('admin','agent')", [id]);
    await connection.commit();
    return NextResponse.json({ success: true });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch { /* Keep the original database error. */ }
    }
    if (error && typeof error === "object" && "code" in error && error.code === "ER_ROW_IS_REFERENCED_2") {
      return NextResponse.json({ error: "This user has recorded trips or checkpoints. Suspend or deactivate the account to preserve its audit history." }, { status: 409 });
    }
    console.error("Could not delete administrator account:", error);
    return NextResponse.json({ error: "Administrator account could not be deleted." }, { status: 503 });
  } finally {
    connection?.release();
  }
}
