import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { ensureDatabase, getPool } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  if (!session.mustChangePassword) return NextResponse.json({ error: "Password setup is not required for this account." }, { status: 409 });

  let body: { password?: string; confirmPassword?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter and confirm your new password." }, { status: 400 }); }
  const password = typeof body.password === "string" ? body.password : "";
  const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
  if (password !== confirmPassword) return NextResponse.json({ error: "The passwords do not match." }, { status: 400 });
  if (password === session.firstName) return NextResponse.json({ error: "Choose a password different from your temporary first-name password." }, { status: 400 });
  if (password.length < 8 || password.length > 128 || !/[A-Z]/.test(password) || !/[^A-Za-z0-9]/.test(password) || !/\d/.test(password)) {
    return NextResponse.json({ error: "Use at least 8 characters with a capital letter, a special character, and a number." }, { status: 400 });
  }

  await ensureDatabase();
  const result = await getPool().query("UPDATE users SET password_hash = ? WHERE id = ? AND role = 'admin'", [await hashPassword(password), session.userId]) as { affectedRows?: number };
  if (!result.affectedRows) return NextResponse.json({ error: "Password setup has already been completed. Sign in again." }, { status: 409 });
  return NextResponse.json({ success: true });
}
