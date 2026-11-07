import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { ensureDatabase, queryRows } from "@/lib/db";
import { cardsPerProductionBatch } from "@/lib/card-batches";

export const dynamic = "force-dynamic";

type CheckpointHistoryRow = {
  id: number | string;
  source: string;
  code: string;
  vehicle_class: string;
  origin: string;
  destination: string;
  step: number | string;
  outcome: "verified" | "flagged";
  notes: string;
  checked_at: string | Date;
};

export async function GET(request: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Sign in to view your verification history." }, { status: 401 });
  if (session.role !== "agent") return NextResponse.json({ error: "Agent access required." }, { status: 403 });

  try {
    await ensureDatabase();
    const rawOffset = Number(new URL(request.url).searchParams.get("offset") || 0);
    const offset = Number.isSafeInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0;
    const history = await queryRows<CheckpointHistoryRow>(
      `SELECT * FROM (
        SELECT e.id, 'production' AS source,
          CONCAT('MAAF-BCH', LPAD((t.production_batch_id - 1) * ${cardsPerProductionBatch} + 1, GREATEST(4, LENGTH((t.production_batch_id - 1) * ${cardsPerProductionBatch} + 1)), '0'), '-', t.public_token) AS code,
          c.vehicle_class, t.origin, t.destination, e.step, e.outcome, e.notes, e.checked_at
        FROM transport_production_trip_events e
        JOIN transport_production_trip_assignments t ON t.id = e.trip_id
        JOIN transport_production_categories c ON c.id = t.category_id
        WHERE e.user_id = ?
        UNION ALL
        SELECT e.id, 'assignment' AS source,
          CONCAT('MAAF-BCH', LPAD(t.batch_id, GREATEST(4, LENGTH(t.batch_id)), '0'), '-', tt.public_token) AS code,
          b.vehicle_class, t.origin, t.destination, e.step, e.outcome, e.notes, e.checked_at
        FROM transport_card_assignment_events e
        JOIN transport_card_trip_assignments t ON t.id = e.trip_id
        JOIN transport_card_batches b ON b.id = t.batch_id
        JOIN transport_card_trip_tokens tt ON tt.batch_id = t.batch_id AND tt.serial = t.serial
        WHERE e.user_id = ?
        UNION ALL
        SELECT e.id, 'legacy' AS source,
          CONCAT('MAAF-BCH', LPAD(t.batch_id, GREATEST(4, LENGTH(t.batch_id)), '0'), '-', tt.public_token) AS code,
          b.vehicle_class, t.origin, t.destination, e.step, e.outcome, e.notes, e.checked_at
        FROM transport_card_verification_events e
        JOIN transport_card_trips t ON t.id = e.trip_id
        JOIN transport_card_batches b ON b.id = t.batch_id
        JOIN transport_card_trip_tokens tt ON tt.batch_id = t.batch_id AND tt.serial = t.serial
        WHERE e.user_id = ?
      ) checks
      ORDER BY checked_at DESC, id DESC
      LIMIT 101 OFFSET ?`,
      [session.userId, session.userId, session.userId, offset],
    );

    const hasMore = history.length > 100;
    return NextResponse.json({
      history: history.slice(0, 100).map((check) => ({
        ...check,
        id: Number(check.id),
        step: Number(check.step),
      })),
      hasMore,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Could not load agent checkpoint history:", error);
    return NextResponse.json({ error: "Your verification history could not be loaded." }, { status: 503 });
  }
}
