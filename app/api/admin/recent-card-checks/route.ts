import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { ensureDatabase, queryRows } from "@/lib/db";
import { cardTripCode } from "@/lib/card-trips";
import { cardsPerProductionBatch } from "@/lib/card-batches";

export const dynamic = "force-dynamic";
type RecentCheckRow = {
  id: number;
  step: number;
  outcome: "verified" | "flagged";
  notes: string;
  checked_at: string | Date;
  agent_name: string;
  origin: string;
  destination: string;
  vehicle_class: string;
  batch_id: number;
  public_token: string;
};

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    await ensureDatabase();
    const rows = await queryRows<RecentCheckRow>(
      `SELECT activity.* FROM (
        SELECT -e.id AS id, e.step, e.outcome, e.notes, e.checked_at, u.display_name AS agent_name,
          t.origin, t.destination, b.vehicle_class, t.batch_id, tt.public_token
        FROM transport_card_assignment_events e JOIN users u ON u.id = e.user_id
        JOIN transport_card_trip_assignments t ON t.id = e.trip_id
        JOIN transport_card_batches b ON b.id = t.batch_id
        JOIN transport_card_trip_tokens tt ON tt.batch_id = t.batch_id AND tt.serial = t.serial
        UNION ALL
        SELECT e.id, e.step, e.outcome, e.notes, e.checked_at, u.display_name AS agent_name,
          t.origin, t.destination, b.vehicle_class, t.batch_id, tt.public_token
        FROM transport_card_verification_events e JOIN users u ON u.id = e.user_id
        JOIN transport_card_trips t ON t.id = e.trip_id
        JOIN transport_card_batches b ON b.id = t.batch_id
        JOIN transport_card_trip_tokens tt ON tt.batch_id = t.batch_id AND tt.serial = t.serial
        UNION ALL
        SELECT -e.id AS id, e.step, e.outcome, e.notes, e.checked_at, u.display_name AS agent_name,
            t.origin, t.destination, c.vehicle_class, ${cardsPerProductionBatch} * (t.production_batch_id - 1) + 1 AS batch_id, t.public_token
        FROM transport_production_trip_events e JOIN users u ON u.id = e.user_id
        JOIN transport_production_trip_assignments t ON t.id = e.trip_id
        JOIN transport_production_categories c ON c.id = t.category_id
      ) activity ORDER BY checked_at DESC, id DESC LIMIT 8`,
    );
    return NextResponse.json(rows.map((row) => ({
      id: Number(row.id), code: cardTripCode(Number(row.batch_id), row.public_token), step: Number(row.step),
      outcome: row.outcome, notes: row.notes, checked_at: row.checked_at, agent_name: row.agent_name,
      origin: row.origin, destination: row.destination, vehicle_class: row.vehicle_class,
    })), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Failed to load recent card checks:", error);
    return NextResponse.json({ error: "Recent card scans could not be loaded." }, { status: 503 });
  }
}
