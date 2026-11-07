import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthSession, SESSION_COOKIE } from "@/lib/auth";
import { ensureDatabase, getPool } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/passwords";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    if (session.role !== "agent") return NextResponse.json({ error: "Agent access required." }, { status: 403 });
    const body = await request.json() as { currentPassword?: unknown; newPassword?: unknown; confirmPassword?: unknown };
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
    if (!currentPassword || currentPassword.length > 256) return NextResponse.json({ error: "Enter your current password." }, { status: 400 });
    await ensureDatabase();
    const rows = await getPool().query(
      "SELECT password_hash FROM users WHERE id=? AND role='agent' AND active=1 LIMIT 1", [session.userId],
    ) as Array<{ password_hash: string }>;
    if (!rows[0] || !(await verifyPassword(currentPassword, rows[0].password_hash))) return NextResponse.json({ error: "The current password is incorrect." }, { status: 400 });
    if (newPassword.length > 128 || newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword) || !/\d/.test(newPassword)) {
      return NextResponse.json({ error: "Use 8–128 characters with one capital letter, one special character, and one number." }, { status: 400 });
    }
    if (newPassword !== confirmPassword) return NextResponse.json({ error: "The new password and confirmation do not match." }, { status: 400 });
    if (await verifyPassword(newPassword, rows[0].password_hash)) return NextResponse.json({ error: "Choose a password you have not used for this account." }, { status: 400 });
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await getPool().query("UPDATE users SET password_hash=? WHERE id=? AND role='agent'", [await hashPassword(newPassword), session.userId]);
    await getPool().query("DELETE FROM sessions WHERE user_id=? AND token_hash<>?", [session.userId, tokenHash]);
    return NextResponse.json({ success: true, message: "Your password has been updated. Other sign-in sessions have been signed out." }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Your password could not be updated. Please try again." }, { status: 503 });
  }
}
