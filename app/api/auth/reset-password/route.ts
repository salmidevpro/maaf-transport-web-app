import { NextResponse } from "next/server";
import { completePasswordReset, type PasswordResetRole } from "@/lib/password-reset";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Provide a valid password reset request." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Provide a valid password reset request." }, { status: 400 });

  const payload = body as { token?: unknown; role?: unknown; password?: unknown; confirmPassword?: unknown };
  const token = typeof payload.token === "string" ? payload.token : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  const confirmPassword = typeof payload.confirmPassword === "string" ? payload.confirmPassword : "";
  if ((payload.role !== "admin" && payload.role !== "agent") || !token || token.length > 100) {
    return NextResponse.json({ error: "This password reset link is invalid or has expired. Request a new link." }, { status: 400 });
  }
  if (password.length < 8 || password.length > 128 || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return NextResponse.json({ error: "Use 8–128 characters with a capital letter, a number, and a special character." }, { status: 400 });
  }
  if (password !== confirmPassword) return NextResponse.json({ error: "The new password and confirmation do not match." }, { status: 400 });

  try {
    const success = await completePasswordReset(token, payload.role as PasswordResetRole, password);
    if (!success) return NextResponse.json({ error: "This password reset link is invalid or has expired. Request a new link." }, { status: 400 });
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("MAAF password reset could not be completed.", error);
    return NextResponse.json({ error: "Your password could not be reset. Please try again." }, { status: 503 });
  }
}
