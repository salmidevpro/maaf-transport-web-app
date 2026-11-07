import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { ensureDatabase, getPool, queryRows } from "@/lib/db";
import { cardTripCode, parseCardTripCode } from "@/lib/card-trips";
import { cardsPerProductionBatch } from "@/lib/card-batches";
import { getTestSandbox, parseTestTripCode } from "@/lib/test-batch-sandbox";

export const dynamic = "force-dynamic";

type TripLookupRow = {
  id: number;
  batch_id: number;
  serial: number;
  public_token: string | null;
  vehicle_class: string;
  origin: string;
  destination: string;
  status: "ready" | "in_transit" | "on_hold" | "completed";
  current_step: number;
};

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  let body: { code?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Enter the MAAF card ID or scan its QR code." }, { status: 400 }); }
  if (typeof body.code !== "string" || body.code.trim().length < 1 || body.code.trim().length > 500) {
    return NextResponse.json({ error: "Enter the MAAF card ID or scan its QR code." }, { status: 400 });
  }

  let rawCode = body.code.trim();
  try {
    const url = new URL(rawCode);
    rawCode = url.searchParams.get("code") || url.searchParams.get("card") || url.searchParams.get("id") || rawCode;
  } catch { /* Manual card IDs are not URLs. */ }
  const testCode = parseTestTripCode(rawCode);
  if (testCode) {
    try {
      await ensureDatabase();
      const connection = await getPool().getConnection();
      try {
        await connection.beginTransaction();
        const sandbox = await getTestSandbox(connection);
        if (!sandbox) {
          await connection.commit();
          return NextResponse.json({ error: "This practice card expired after its 10-minute session and the sandbox was cleared." }, { status: 410 });
        }
        if (sandbox.sessionToken !== testCode.sessionToken) {
          await connection.commit();
          return NextResponse.json({ error: "This practice card belongs to an expired sandbox. Create a new test batch to continue." }, { status: 410 });
        }
        const found = sandbox.data.categories.flatMap((category) => category.trips.map((trip) => ({ category, trip }))).find(({ trip }) => trip.id === testCode.id);
        if (!found) {
          await connection.commit();
          return NextResponse.json({ error: "This practice card is not assigned in the active test batch." }, { status: 404 });
        }
        const { category, trip } = found;
        await connection.commit();
        return NextResponse.json({
          id: -trip.id,
          batch_id: 0,
          serial: trip.serial,
          code: trip.code,
          vehicle_class: category.vehicleClass,
          origin: trip.origin,
          destination: category.destination,
          status: trip.status,
          current_step: trip.current_step,
          items: trip.goods.map((description) => ({ description })),
          verifications: trip.verifications.map(({ step, agent_name, outcome, notes, checked_at }) => ({ step, agent_name, outcome, notes, checked_at })),
        }, { headers: { "Cache-Control": "private, no-store" } });
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    } catch (error) {
      console.error("Failed to look up practice trip card:", error);
      return NextResponse.json({ error: "The practice card could not be checked. Retry after the sandbox is available." }, { status: 503 });
    }
  }
  const parsed = parseCardTripCode(rawCode);
  if (!parsed) return NextResponse.json({ error: "That QR code or ID is not a valid MAAF trip card." }, { status: 400 });

  try {
    await ensureDatabase();
    if (parsed.token && (parsed.batchId - 1) % cardsPerProductionBatch === 0) {
      const productionBatchId = Math.floor((parsed.batchId - 1) / cardsPerProductionBatch) + 1;
      const productionRows = await queryRows<TripLookupRow>(
        "SELECT -t.id AS id, ? AS batch_id, t.serial, t.public_token, c.vehicle_class, t.origin, t.destination, t.status, t.current_step FROM transport_production_trip_assignments t JOIN transport_production_categories c ON c.id = t.category_id WHERE t.production_batch_id = ? AND t.public_token = ? LIMIT 1",
        [parsed.batchId, productionBatchId, parsed.token],
      );
      const productionTrip = productionRows[0];
      if (productionTrip) {
        const id = Math.abs(Number(productionTrip.id));
        const [goods, verifications] = await Promise.all([
          queryRows<{ description: string }>("SELECT goods_description AS description FROM transport_production_trip_goods WHERE trip_id = ? ORDER BY id", [id]),
          queryRows<{ step: number; agent_name: string; outcome: "verified" | "flagged"; notes: string; checked_at: string | Date }>(
            "SELECT e.step, u.display_name AS agent_name, e.outcome, e.notes, e.checked_at FROM transport_production_trip_events e JOIN users u ON u.id = e.user_id WHERE e.trip_id = ? ORDER BY e.step, e.checked_at", [id]),
        ]);
        return NextResponse.json({ ...productionTrip, id: Number(productionTrip.id), batch_id: parsed.batchId,
          serial: Number(productionTrip.serial), current_step: Number(productionTrip.current_step), code: parsed.code, items: goods, verifications },
        { headers: { "Cache-Control": "private, no-store" } });
      }
    }
    const selector = parsed.token ? "t.serial = (SELECT serial FROM transport_card_trip_tokens WHERE batch_id = ? AND public_token = ? LIMIT 1)" : "t.serial = ?";
    const args = parsed.token ? [parsed.batchId, parsed.batchId, parsed.token] : [parsed.batchId, parsed.serial];
    const newRows = await queryRows<TripLookupRow>(
      `SELECT -t.id AS id, t.batch_id, t.serial, tt.public_token, b.vehicle_class,
         t.origin, t.destination, t.status, t.current_step
       FROM transport_card_trip_assignments t JOIN transport_card_batches b ON b.id = t.batch_id
       LEFT JOIN transport_card_trip_tokens tt ON tt.batch_id = t.batch_id AND tt.serial = t.serial
       WHERE t.batch_id = ? AND ${selector} LIMIT 1`, args,
    );
    const isNew = Boolean(newRows[0]);
    const rows = newRows.length ? newRows : await queryRows<TripLookupRow>(
      `SELECT t.id, t.batch_id, t.serial, tt.public_token, b.vehicle_class,
         t.origin, t.destination, t.status, t.current_step
       FROM transport_card_trips t JOIN transport_card_batches b ON b.id = t.batch_id
       LEFT JOIN transport_card_trip_tokens tt ON tt.batch_id = t.batch_id AND tt.serial = t.serial
       WHERE t.batch_id = ? AND ${parsed.token ? "tt.public_token = ?" : "t.serial = ?"} LIMIT 1`,
      parsed.token ? [parsed.batchId, parsed.token] : [parsed.batchId, parsed.serial],
    );
    const trip = rows[0];
    if (!trip) return NextResponse.json({ error: "No assigned trip was found for this MAAF card. Check the card ID and try again." }, { status: 404 });

    const id = Math.abs(Number(trip.id));
    const [goods, legacyGoods, legacyItems, verifications, legacyVerifications] = await Promise.all([
      isNew ? queryRows<{ description: string }>("SELECT goods_description AS description FROM transport_card_assignment_goods WHERE trip_id = ? ORDER BY id", [id]) : Promise.resolve([]),
      isNew ? Promise.resolve([]) : queryRows<{ description: string }>("SELECT goods_description AS description FROM transport_card_trip_goods WHERE trip_id = ? ORDER BY id", [id]),
      isNew ? Promise.resolve([]) : queryRows<{ description: string; quantity: number | string; unit: string }>("SELECT goods_description AS description, quantity, unit FROM transport_card_trip_items WHERE trip_id = ? ORDER BY id", [id]),
      isNew ? queryRows<{ step: number; agent_name: string; outcome: "verified" | "flagged"; notes: string; checked_at: string | Date }>(
        `SELECT e.step, u.display_name AS agent_name, e.outcome, e.notes, e.checked_at
         FROM transport_card_assignment_events e JOIN users u ON u.id = e.user_id
         WHERE e.trip_id = ? ORDER BY e.step, e.checked_at`, [id],
      ) : Promise.resolve([]),
      isNew ? Promise.resolve([]) : queryRows<{ step: number; agent_name: string; outcome: "verified" | "flagged"; notes: string; checked_at: string | Date }>(
        `SELECT e.step, u.display_name AS agent_name, e.outcome, e.notes, e.checked_at
         FROM transport_card_verification_events e JOIN users u ON u.id = e.user_id
         WHERE e.trip_id = ? ORDER BY e.step, e.checked_at`, [id],
      ),
    ]);
    return NextResponse.json({
      ...trip,
      id: Number(trip.id),
      batch_id: Number(trip.batch_id),
      serial: Number(trip.serial),
      current_step: Number(trip.current_step),
      code: trip.public_token ? cardTripCode(Number(trip.batch_id), trip.public_token) : parsed.code,
      items: isNew ? goods : legacyGoods.length ? legacyGoods : legacyItems,
      verifications: isNew ? verifications : legacyVerifications,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Failed to verify MAAF trip card:", error);
    return NextResponse.json({ error: "The card could not be verified. Check the database connection and retry." }, { status: 503 });
  }
}
