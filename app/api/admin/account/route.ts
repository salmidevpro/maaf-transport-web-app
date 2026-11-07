import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthSession, SESSION_COOKIE } from "@/lib/auth";
import { ensureDatabase, getPool } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/passwords";

type AccountRecord = { id: number; email: string; display_name: string; password_hash: string; role: "admin" | "agent"; active: number };
type AccountPayload = { firstName?: unknown; lastName?: unknown; surname?: unknown; email?: unknown; username?: unknown; location?: unknown; currentPassword?: unknown; newPassword?: unknown; confirmPassword?: unknown };

async function readBody(request: Request): Promise<AccountPayload | null> {
  try {
    const body = await request.json() as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? body as AccountPayload : null;
  } catch { return null; }
}

async function getAdminAccount() {
  const session = await getAuthSession();
  if (!session) return { response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) } as const;
  if (session.role !== "admin") return { response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) } as const;
  await ensureDatabase();
  const rows = await getPool().query(
    "SELECT id, email, display_name, password_hash, role, active FROM users WHERE id = ? AND role = 'admin' AND active = 1 LIMIT 1",
    [session.userId],
  ) as AccountRecord[];
  if (!rows[0]) return { response: NextResponse.json({ error: "The administrator account could not be found." }, { status: 404 }) } as const;
  return { account: rows[0] } as const;
}

export async function GET() {
  try {
    const auth = await getAdminAccount();
    if ("response" in auth) return auth.response;
    const rows = await getPool().query("SELECT username, location FROM admin_account_preferences WHERE user_id = ? LIMIT 1", [auth.account.id]) as Array<{ username: string | null; location: string }>;
    return NextResponse.json({ username: rows[0]?.username ?? "", location: rows[0]?.location ?? "" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Your admin profile could not be loaded." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await getAdminAccount();
    if ("response" in auth) return auth.response;
    const body = await readBody(request);
    if (!body) return NextResponse.json({ error: "Provide a valid JSON request." }, { status: 400 });

    const firstName = typeof body.firstName === "string" ? body.firstName.trim().replace(/\s+/g, " ") : "";
    const lastName = typeof body.lastName === "string" ? body.lastName.trim().replace(/\s+/g, " ") : "";
    const surname = typeof body.surname === "string" ? body.surname.trim().replace(/\s+/g, " ") : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const location = typeof body.location === "string" ? body.location.trim().replace(/\s+/g, " ") : "";
    if (firstName.length < 2 || firstName.length > 60) return NextResponse.json({ error: "Enter a first name between 2 and 60 characters." }, { status: 400 });
    if (lastName.length < 2 || lastName.length > 60) return NextResponse.json({ error: "Enter a last name between 2 and 60 characters." }, { status: 400 });
    if (surname.length === 1 || surname.length > 60) return NextResponse.json({ error: "Third name must be between 2 and 60 characters when provided." }, { status: 400 });
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) return NextResponse.json({ error: "Choose a username using 3–40 letters, numbers, dots, underscores, or hyphens." }, { status: 400 });
    if (location.length > 120) return NextResponse.json({ error: "Location must be 120 characters or fewer." }, { status: 400 });
    const displayName = [firstName, lastName, surname].filter(Boolean).join(" ");
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      await connection.query("UPDATE users SET display_name = ?, email = ? WHERE id = ?", [displayName, email, auth.account.id]);
      await connection.query(
        `INSERT INTO admin_profiles (user_id, first_name, last_name, surname) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE first_name=VALUES(first_name), last_name=VALUES(last_name), surname=VALUES(surname)`,
        [auth.account.id, firstName, lastName, surname],
      );
      await connection.query(
        `INSERT INTO admin_account_preferences (user_id, username, location) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE username=VALUES(username), location=VALUES(location)`,
        [auth.account.id, username, location],
      );
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
    return NextResponse.json({ user: { firstName, lastName, surname, name: firstName, email, username, location } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ER_DUP_ENTRY") {
      return NextResponse.json({ error: "That email address or username is already in use." }, { status: 409 });
    }
    return NextResponse.json({ error: "Your profile could not be updated. Please try again." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await getAdminAccount();
    if ("response" in auth) return auth.response;
    const body = await readBody(request);
    if (!body) return NextResponse.json({ error: "Provide a valid JSON request." }, { status: 400 });
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
    if (!currentPassword || currentPassword.length > 256) return NextResponse.json({ error: "Enter your current password." }, { status: 400 });
    if (!(await verifyPassword(currentPassword, auth.account.password_hash))) return NextResponse.json({ error: "The current password is incorrect." }, { status: 400 });
    if (newPassword.length > 128 || newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword) || !/\d/.test(newPassword)) {
      return NextResponse.json({ error: "Use 8–128 characters with one capital letter, one special character, and one number." }, { status: 400 });
    }
    if (newPassword !== confirmPassword) return NextResponse.json({ error: "The new password and confirmation do not match." }, { status: 400 });
    if (await verifyPassword(newPassword, auth.account.password_hash)) return NextResponse.json({ error: "Choose a password you have not used for this account." }, { status: 400 });

    const cookieStore = await cookies();
    const currentToken = cookieStore.get(SESSION_COOKIE)?.value;
    if (!currentToken) return NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
    const currentTokenHash = createHash("sha256").update(currentToken).digest("hex");
    await getPool().query("UPDATE users SET password_hash = ? WHERE id = ?", [await hashPassword(newPassword), auth.account.id]);
    await getPool().query("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", [auth.account.id, currentTokenHash]);
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Your password could not be updated. Please try again." }, { status: 503 });
  }
}
