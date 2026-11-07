import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { decryptNin } from "@/lib/agent-onboarding";
import { queryRows } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Agent record not found." }, { status: 404 });
  try {
    const [record] = await queryRows<{ nin_encrypted: string | null }>(
      "SELECT n.nin_encrypted FROM agent_preregistrations p LEFT JOIN agent_preregistration_nins n ON n.preregistration_id=p.id WHERE p.id=? LIMIT 1",
      [id],
    );
    if (!record) return NextResponse.json({ error: "Agent record not found." }, { status: 404 });
    return NextResponse.json({ nin: decryptNin(record.nin_encrypted) });
  } catch (error) {
    console.error("Admin NIN record could not be read:", error);
    return NextResponse.json({ error: "Could not decrypt this NIN record. Check the server encryption key." }, { status: 503 });
  }
}
