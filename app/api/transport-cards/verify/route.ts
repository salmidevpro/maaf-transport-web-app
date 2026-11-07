import { NextResponse } from "next/server";
import { ensureDatabase, queryRows } from "@/lib/db";
import { parseCardTripCode } from "@/lib/card-trips";
import type { TransportCardBatch } from "@/lib/card-batches";
import { cardsPerProductionBatch } from "@/lib/card-batches";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const parsed = parseCardTripCode(new URL(request.url).searchParams.get("code") || "");
  if (!parsed) return NextResponse.json({ error: "This card code is not valid." }, { status: 404 });
  await ensureDatabase();
  if (parsed.token && (parsed.batchId - 1) % cardsPerProductionBatch === 0) {
    const productionBatchId = Math.floor((parsed.batchId - 1) / cardsPerProductionBatch) + 1;
    const cards = await queryRows<{ serial: number; vehicle_class: string; destination: string; status: string }>(
      "SELECT t.serial, c.vehicle_class, t.destination, t.status FROM transport_production_trip_assignments t JOIN transport_production_categories c ON c.id = t.category_id WHERE t.production_batch_id = ? AND t.public_token = ? LIMIT 1",
      [productionBatchId, parsed.token],
    );
    if (cards[0]) return NextResponse.json({ code: parsed.code, vehicleClass: cards[0].vehicle_class, destination: cards[0].destination, serial: Number(cards[0].serial), status: cards[0].status }, { headers: { "Cache-Control": "no-store" } });
  }
  const tokenRows = parsed.token ? await queryRows<{ serial: number }>("SELECT serial FROM transport_card_trip_tokens WHERE batch_id = ? AND public_token = ? LIMIT 1", [parsed.batchId, parsed.token]) : [];
  const serial = parsed.serial ?? (tokenRows[0] ? Number(tokenRows[0].serial) : null);
  if (!serial) return NextResponse.json({ error: "This card code is not valid." }, { status: 404 });

  const rows = await queryRows<TransportCardBatch>(
    "SELECT id, vehicle_class, destination, allocated_quantity, fare_ngn FROM transport_card_batches WHERE id = ? LIMIT 1",
    [parsed.batchId],
  );
  const batch = rows[0];
  if (!batch || serial > Number(batch.allocated_quantity)) {
    return NextResponse.json({ error: "This card is not included in the current allocation." }, { status: 404 });
  }

  return NextResponse.json({ code: parsed.code, vehicleClass: batch.vehicle_class, destination: batch.destination, serial, status: "Allocated" }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}
