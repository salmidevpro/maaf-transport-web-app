import { NextResponse } from "next/server";
import { verifyAgentEmail } from "@/lib/agent-onboarding";

export async function POST(request: Request) {
  let body: { token?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "This verification link is invalid or expired." }, { status: 400 }); }
  if (typeof body.token !== "string" || body.token.length < 30 || body.token.length > 200) return NextResponse.json({ error: "This verification link is invalid or expired." }, { status: 400 });
  try {
    const verified = await verifyAgentEmail(body.token);
    if (!verified) return NextResponse.json({ error: "This verification link is invalid or expired." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Email verification failed:", error);
    return NextResponse.json({ error: "Could not verify this email right now." }, { status: 503 });
  }
}
