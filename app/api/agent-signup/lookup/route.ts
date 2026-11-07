import { NextResponse } from "next/server";
import { lookupPreRegistration } from "@/lib/agent-onboarding";

const attempts = new Map<string, { count: number; startedAt: number; lastAt: number }>();

export async function POST(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const current = attempts.get(forwarded);
  if (current && now - current.startedAt < 60 * 60 * 1000 && (current.count >= 20 || now - current.lastAt < 1200)) {
    const retryAt = current.count >= 20 ? current.startedAt + 60 * 60 * 1000 : current.lastAt + 1200;
    const retryAfter = Math.max(1, Math.ceil((retryAt - now) / 1000));
    return NextResponse.json(
      { error: "Record checks are temporarily limited." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }
  if (!current || now - current.startedAt >= 60 * 60 * 1000) attempts.set(forwarded, { count: 1, startedAt: now, lastAt: now });
  else attempts.set(forwarded, { ...current, count: current.count + 1, lastAt: now });
  let body: { nin?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter your 11-digit NIN." }, { status: 400 }); }
  const nin = typeof body.nin === "string" ? body.nin.replace(/\D/g, "") : "";
  if (!/^\d{11}$/.test(nin)) return NextResponse.json({ error: "Enter your 11-digit NIN." }, { status: 400 });
  try {
    const record = await lookupPreRegistration(nin);
    if (!record) return NextResponse.json({ error: "We could not match that NIN to an available MAAF pre-registration." }, { status: 404 });
    return NextResponse.json({ firstName: record.first_name, lastName: record.last_name, otherNames: record.other_names });
  } catch (error) {
    console.error("Agent pre-registration lookup failed:", error);
    return NextResponse.json({ error: "Pre-registration lookup is not configured. Please contact MAAF support." }, { status: 503 });
  }
}
