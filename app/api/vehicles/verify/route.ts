import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { recordVehicleVerification } from "@/lib/server-store";

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Agent accounts can verify trip cards only." }, { status: 403 });

  let lookup: unknown;
  try { ({ lookup } = await request.json() as { lookup?: unknown }); }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (typeof lookup !== "string" || !lookup.trim() || lookup.trim().length > 80) {
    return NextResponse.json({ error: "Enter a valid MAAF ID or registration number." }, { status: 400 });
  }

  try {
    const vehicle = await recordVehicleVerification(lookup, session.userId);
    if (!vehicle) {
      return NextResponse.json({ error: "No matching vehicle record was found." }, { status: 404 });
    }
    return NextResponse.json(vehicle, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Verification could not be recorded. Check the registry connection and try again." }, { status: 503 });
  }
}
