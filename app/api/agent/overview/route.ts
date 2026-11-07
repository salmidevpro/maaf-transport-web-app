import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { queryRows } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Sign in to view your dashboard." }, { status: 401 });
  if (session.role !== "agent") return NextResponse.json({ error: "Agent access required." }, { status: 403 });
  try {
    const rows = await queryRows<{ checkpoints: number | string; flagged: number | string }>(
      `SELECT
        (SELECT COUNT(*) FROM (
          SELECT user_id,checked_at FROM transport_production_trip_events
          UNION ALL SELECT user_id,checked_at FROM transport_card_assignment_events
          UNION ALL SELECT user_id,checked_at FROM transport_card_verification_events
        ) events WHERE user_id=? AND DATE(checked_at)=UTC_DATE()) AS checkpoints,
        (SELECT COUNT(*) FROM (
          SELECT user_id,outcome,checked_at FROM transport_production_trip_events
          UNION ALL SELECT user_id,outcome,checked_at FROM transport_card_assignment_events
          UNION ALL SELECT user_id,outcome,checked_at FROM transport_card_verification_events
        ) events WHERE user_id=? AND outcome='flagged' AND DATE(checked_at)=UTC_DATE()) AS flagged`,
      [session.userId, session.userId],
    );
    const totals = rows[0];
    return NextResponse.json({
      name: session.name,
      checkpointsToday: Number(totals?.checkpoints ?? 0),
      flaggedToday: Number(totals?.flagged ?? 0),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Could not load agent overview:", error);
    return NextResponse.json({ error: "Dashboard totals could not be loaded." }, { status: 503 });
  }
}
