import { NextResponse } from "next/server";
import { resendAgentVerificationEmail } from "@/lib/agent-onboarding";

export async function POST(request: Request) {
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: "Enter the email address used during signup." }, { status: 400 }); }

  if (!payload || typeof payload !== "object" || !("email" in payload) || typeof payload.email !== "string" || payload.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const result = await resendAgentVerificationEmail(payload.email);
    if (result === "already_verified") {
      return NextResponse.json({ ok: true, status: result, message: "This email address is already verified. No new verification email was sent. You can sign in to your Agent Portal." });
    }
    if (result === "already_active") {
      return NextResponse.json({ ok: true, status: result, message: "This Agent account is already active. No verification email is needed." });
    }
    if (result === "not_found") {
      return NextResponse.json({ error: "No unverified MAAF Agent account was found for this email. Check the address or sign up first." }, { status: 404 });
    }
    if (result === "cooldown") {
      return NextResponse.json({ error: "A verification email was sent recently. Wait one minute before requesting another." }, { status: 429 });
    }
    return NextResponse.json({ ok: true, status: result, message: "A new verification email has been sent. Check your inbox and spam folder." });
  } catch (error) {
    console.error("Agent verification resend failed:", error);
    return NextResponse.json({ error: "We could not send a new verification email right now. Please try again shortly." }, { status: 503 });
  }
}
