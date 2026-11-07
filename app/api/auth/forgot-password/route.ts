import { NextResponse } from "next/server";
import { requestPasswordReset, type PasswordResetRole } from "@/lib/password-reset";
import { getSiteUrl } from "@/lib/site-config";

const genericMessage = "If an active account matches that email, password reset instructions will be sent shortly. Check your inbox and spam folder.";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Enter your account email." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Enter your account email." }, { status: 400 });

  const payload = body as { email?: unknown; role?: unknown };
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if ((payload.role !== "admin" && payload.role !== "agent") || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid account email." }, { status: 400 });
  }
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL || !getSiteUrl()) {
    return NextResponse.json({ error: "Password reset email is temporarily unavailable. Contact the MAAF administrator." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const requesterIp = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  try {
    const message = await requestPasswordReset(email, payload.role as PasswordResetRole, requesterIp);
    return NextResponse.json({ message }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("MAAF password reset request failed.", error);
    return NextResponse.json({ error: genericMessage }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
