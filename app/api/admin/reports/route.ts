import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { cardTripCode } from "@/lib/card-trips";
import { ensureDatabase, queryRows } from "@/lib/db";
import { cardsPerProductionBatch } from "@/lib/card-batches";

export const dynamic = "force-dynamic";
type AllocationRow = { allocated: number | string; assigned: number | string };
type TripStatusRow = { status: "ready" | "in_transit" | "on_hold" | "completed"; count: number | string };
type VerificationSummaryRow = { total: number | string; verified: number | string; flagged: number | string };
type RecentTripRow = {
  id: number | string; batch_id: number | string; serial: number | string; category_id: number | string | null; public_token: string | null;
  vehicle_class: string; destination: string; origin: string; status: "ready" | "in_transit" | "on_hold" | "completed";
  created_at: string | Date; checks: number | string;
};

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    await ensureDatabase();
    const [allocations, tripStatuses, verification, recentTrips] = await Promise.all([
      queryRows<AllocationRow>(
        `SELECT COALESCE(SUM(c.allocated_quantity), 0) AS allocated,
          COALESCE(SUM(COALESCE(p.assigned, 0) + COALESCE(old.assigned, 0)), 0) AS assigned
         FROM transport_production_categories c
         LEFT JOIN (SELECT category_id, COUNT(*) AS assigned FROM transport_production_trip_assignments GROUP BY category_id) p ON p.category_id = c.id
         LEFT JOIN (
           SELECT c2.id AS category_id, COUNT(legacy.batch_id) AS assigned FROM transport_production_categories c2
           LEFT JOIN (
             SELECT batch_id FROM transport_card_trips UNION ALL SELECT batch_id FROM transport_card_trip_assignments
           ) legacy ON legacy.batch_id = c2.legacy_batch_id GROUP BY c2.id
         ) old ON old.category_id = c.id`,
      ),
      queryRows<TripStatusRow>(
        `SELECT status, COUNT(*) AS count FROM (
          SELECT status FROM transport_card_trips UNION ALL SELECT status FROM transport_card_trip_assignments
          UNION ALL SELECT status FROM transport_production_trip_assignments
        ) all_trips GROUP BY status`,
      ),
      queryRows<VerificationSummaryRow>(
        `SELECT COUNT(*) AS total, COALESCE(SUM(outcome = 'verified'), 0) AS verified, COALESCE(SUM(outcome = 'flagged'), 0) AS flagged
         FROM (SELECT outcome FROM transport_card_verification_events UNION ALL SELECT outcome FROM transport_card_assignment_events
          UNION ALL SELECT outcome FROM transport_production_trip_events) all_events`,
      ),
      queryRows<RecentTripRow>(
        `SELECT trips.* FROM (
          SELECT -t.id AS id, t.batch_id, t.serial, pc.id AS category_id, tt.public_token, b.vehicle_class, b.destination,
            t.origin, t.status, t.created_at,
            (SELECT COUNT(*) FROM transport_card_assignment_events e WHERE e.trip_id = t.id) AS checks
          FROM transport_card_trip_assignments t JOIN transport_card_batches b ON b.id = t.batch_id
          LEFT JOIN transport_production_categories pc ON pc.legacy_batch_id = b.id
          LEFT JOIN transport_card_trip_tokens tt ON tt.batch_id = t.batch_id AND tt.serial = t.serial
          UNION ALL
          SELECT t.id, t.batch_id, t.serial, pc.id AS category_id, tt.public_token, b.vehicle_class, b.destination,
            t.origin, t.status, t.created_at,
            (SELECT COUNT(*) FROM transport_card_verification_events e WHERE e.trip_id = t.id) AS checks
          FROM transport_card_trips t JOIN transport_card_batches b ON b.id = t.batch_id
          LEFT JOIN transport_production_categories pc ON pc.legacy_batch_id = b.id
          LEFT JOIN transport_card_trip_tokens tt ON tt.batch_id = t.batch_id AND tt.serial = t.serial
          WHERE NOT EXISTS (SELECT 1 FROM transport_card_trip_assignments n WHERE n.batch_id = t.batch_id AND n.serial = t.serial)
          UNION ALL
          SELECT -t.id AS id, ${cardsPerProductionBatch} * (t.production_batch_id - 1) + 1 AS batch_id, t.serial, t.category_id,
            t.public_token,
            c.vehicle_class, c.destination, t.origin, t.status, t.created_at,
            (SELECT COUNT(*) FROM transport_production_trip_events e WHERE e.trip_id = t.id) AS checks
          FROM transport_production_trip_assignments t JOIN transport_production_categories c ON c.id = t.category_id
        ) trips ORDER BY created_at DESC, id DESC LIMIT 10`,
      ),
    ]);
    return NextResponse.json({
      cards: { allocated: Number(allocations[0]?.allocated ?? 0), assigned: Number(allocations[0]?.assigned ?? 0) },
      trips: Object.fromEntries(tripStatuses.map(({ status, count }) => [status, Number(count)])),
      verification: { total: Number(verification[0]?.total ?? 0), verified: Number(verification[0]?.verified ?? 0), flagged: Number(verification[0]?.flagged ?? 0) },
      recentTrips: recentTrips.map(({ public_token, batch_id, category_id, ...trip }) => {
        const batchId = Number(batch_id); const serial = Number(trip.serial);
        return { ...trip, id: Number(trip.id), batch_id: batchId, category_id: category_id == null ? null : Number(category_id),
          code: public_token ? cardTripCode(batchId, public_token) : `IYEWA-${String(batchId).padStart(4, "0")}-${String(serial).padStart(5, "0")}`,
          checks: Number(trip.checks) };
      }),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Failed to load operations reports:", error);
    return NextResponse.json({ error: "Reports could not be loaded. Check the database connection and retry." }, { status: 503 });
  }
}
