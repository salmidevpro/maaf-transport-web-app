import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { ensureDatabase, getPool, hasAgentOriginLgaColumn, queryRows } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { sendAdminCredentialsEmail } from "@/lib/admin-email";

type WorkspaceUser = {
  id: number;
  email: string;
  display_name: string;
  role: "admin" | "agent";
  active: number;
  created_at: string | Date;
  admin_first_name: string | null;
  admin_last_name: string | null;
  admin_surname: string | null;
  agent_first_name: string | null;
  agent_last_name: string | null;
  agent_other_names: string | null;
  username: string | null;
  phone: string | null;
  location: string | null;
  origin_state: string | null;
  origin_lga: string | null;
  email_verified_at: string | Date | null;
  admin_status: "active" | "inactive" | "suspended" | null;
  agent_status: "active" | "inactive" | "suspended" | null;
};

async function requireAdmin() {
  const session = await getAuthSession();
  if (!session) return { response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) } as const;
  if (session.role !== "admin") return { response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) } as const;
  return { session } as const;
}

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    const originLgaExpression = await hasAgentOriginLgaColumn()
      ? "COALESCE(NULLIF(ag.origin_lga,''),ag.residence_state,'')"
      : "COALESCE(ag.residence_state,'')";
    const users = await queryRows<WorkspaceUser>(
      `SELECT u.id,u.email,u.display_name,u.role,u.active,u.created_at,
        ap.first_name AS admin_first_name,ap.last_name AS admin_last_name,ap.surname AS admin_surname,
        ag.first_name AS agent_first_name,ag.last_name AS agent_last_name,ag.other_names AS agent_other_names,
        COALESCE(aprefs.username,ag.username) AS username,ag.phone,COALESCE(aprefs.location,ag.location) AS location,ag.origin_state,${originLgaExpression} AS origin_lga,ag.email_verified_at,
        aas.status AS admin_status,ags.status AS agent_status
       FROM users u
       LEFT JOIN admin_profiles ap ON ap.user_id=u.id
       LEFT JOIN admin_account_preferences aprefs ON aprefs.user_id=u.id
       LEFT JOIN admin_account_status aas ON aas.user_id=u.id
       LEFT JOIN agent_account_status ags ON ags.user_id=u.id
       LEFT JOIN agent_profiles ag ON ag.user_id=u.id
       ORDER BY CASE WHEN u.role='admin' THEN 0 ELSE 1 END,u.created_at DESC,u.id DESC`,
    ).then((rows) => rows.map((user) => {
      const name = user.role === "admin"
        ? [user.admin_first_name, user.admin_last_name, user.admin_surname].filter(Boolean).join(" ") || user.display_name
        : [user.agent_first_name, user.agent_other_names, user.agent_last_name].filter(Boolean).join(" ") || user.display_name;
      return { ...user, name, accountStatus: user.role === "admin" ? user.admin_status ?? (user.active ? "active" : "inactive") : user.agent_status ?? (user.active ? "active" : "inactive") };
    }));
    return NextResponse.json({ users, currentUserId: auth.session.userId }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Could not load admin workspace users:", error);
    return NextResponse.json({ error: "Users could not be loaded. Check the database connection and schema." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid body");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Enter the new administrator’s details." }, { status: 400 });
  }

  const firstName = typeof body.firstName === "string" ? body.firstName.trim().replace(/\s+/g, " ") : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim().replace(/\s+/g, " ") : "";
  const surname = typeof body.surname === "string" ? body.surname.trim().replace(/\s+/g, " ") : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if ([firstName, lastName].some((name) => name.length < 2 || name.length > 60) || surname.length === 1 || surname.length > 60) {
    return NextResponse.json({ error: "Enter first and last names (2–60 characters each). Third name is optional and must be 2–60 characters when provided." }, { status: 400 });
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  let connection: Awaited<ReturnType<ReturnType<typeof getPool>["getConnection"]>> | undefined;
  let insertedUserId: number | undefined;
  try {
    await ensureDatabase();
    const existingUsers = await queryRows<{ id: number; email: string; role: "admin" | "agent"; active: number; display_name: string }>(
      "SELECT id,email,role,active,display_name FROM users WHERE email = ? LIMIT 1", [email],
    );
    if (existingUsers[0]) {
      if (existingUsers[0].role === "admin") {
        return NextResponse.json({ success: true, alreadyExists: true, user: { id: Number(existingUsers[0].id), name: existingUsers[0].display_name, email, role: "admin", active: Number(existingUsers[0].active) } }, { headers: { "Cache-Control": "private, no-store" } });
      }
      return NextResponse.json({ error: "An agent account already uses that email address." }, { status: 409 });
    }
    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const displayName = [firstName, lastName, surname].filter(Boolean).join(" ");
    const inserted = await connection.query(
      "INSERT INTO users (email,display_name,password_hash,role,active) VALUES (?,?,?,'admin',1)",
      [email, displayName, await hashPassword(firstName)],
    ) as { insertId: number };
    insertedUserId = Number(inserted.insertId);
    await connection.query(
      "INSERT INTO admin_profiles (user_id,first_name,last_name,surname) VALUES (?,?,?,?)",
      [insertedUserId, firstName, lastName, surname],
    );
    await connection.commit();
    let emailSent = true;
    try {
      await sendAdminCredentialsEmail(email, displayName, firstName);
    } catch (emailError) {
      emailSent = false;
      console.error("Administrator was created, but the credentials email could not be sent:", emailError);
    }
    return NextResponse.json({ success: true, emailSent, user: { id: Number(inserted.insertId), name: displayName, email, role: "admin", active: 1 } }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); }
      catch { /* The connection may have dropped after the database committed. */ }
    }
    if (error && typeof error === "object" && "code" in error && error.code === "ER_DUP_ENTRY") {
      try {
        const existingAdmins = await queryRows<{ id: number; email: string; active: number; display_name: string; role: "admin" | "agent" }>(
          "SELECT id,email,active,display_name,role FROM users WHERE email = ? LIMIT 1", [email],
        );
        if (existingAdmins[0]?.role === "admin") {
          const id = Number(existingAdmins[0].id);
          return NextResponse.json({ success: true, alreadyExists: insertedUserId !== id, user: { id, name: existingAdmins[0].display_name, email, role: "admin", active: Number(existingAdmins[0].active) } }, { headers: { "Cache-Control": "private, no-store" } });
        }
        return NextResponse.json({ error: "An agent account already uses that email address." }, { status: 409 });
      } catch { /* Fall through to the normal error handling if the lookup fails. */ }
    }
    // A lost database response can happen after COMMIT has succeeded. Reconcile
    // by email so the UI does not report failure for an account that was saved.
    try {
      const committedAdmins = await queryRows<{ id: number; email: string; active: number; display_name: string; role: "admin" | "agent" }>(
        "SELECT id,email,active,display_name,role FROM users WHERE email = ? LIMIT 1", [email],
      );
      if (committedAdmins[0]?.role === "admin") {
        const id = Number(committedAdmins[0].id);
        return NextResponse.json({ success: true, alreadyExists: insertedUserId !== id, user: { id, name: committedAdmins[0].display_name, email, role: "admin", active: Number(committedAdmins[0].active) } }, { headers: { "Cache-Control": "private, no-store" } });
      }
    } catch { /* Keep the normal database error response if reconciliation is unavailable. */ }
    console.error("Could not create an administrator account:", error);
    return NextResponse.json({ error: "The administrator account could not be created. Try again." }, { status: 503 });
  } finally {
    connection?.release();
  }
}
