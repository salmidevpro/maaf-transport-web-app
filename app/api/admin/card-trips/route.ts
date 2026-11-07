import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { ensureDatabase, getPool, queryRows } from "@/lib/db";
import { cardTripCode, type CardTrip } from "@/lib/card-trips";
import { ensureCardTripToken } from "@/lib/card-trip-token";
import { cardsPerProductionBatch, productionBatchRangeStart } from "@/lib/card-batches";

export const dynamic = "force-dynamic";
type BatchRow = { id: number; vehicle_class: string; destination: string; allocated_quantity: number };
type TripRow = Omit<CardTrip, "items" | "verifications" | "code"> & { batch_id: number; serial: number; public_token: string };
function validText(value: unknown, max: number) { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max; }
function tripLoadError(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return process.env.NODE_ENV === "development"
    ? `The card trip workspace could not be loaded. ${detail}`
    : "The card trip workspace could not be loaded.";
}

async function requireAdmin() {
  const session = await getAuthSession();
  if (!session) return { response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  if (session.role !== "admin") return { response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) };
  return { session };
}

async function loadTrips(batchId: number): Promise<CardTrip[]> {
  const [newTrips, legacyTrips] = await Promise.all([
    queryRows<TripRow>(
      `SELECT -t.id AS id, t.batch_id, t.serial, tt.public_token, b.vehicle_class,
         t.origin, t.destination, t.status, t.current_step
       FROM transport_card_trip_assignments t
       JOIN transport_card_batches b ON b.id = t.batch_id
       JOIN transport_card_trip_tokens tt ON tt.batch_id = t.batch_id AND tt.serial = t.serial
       WHERE t.batch_id = ? ORDER BY t.serial`, [batchId],
    ),
    queryRows<TripRow>(
      `SELECT t.id, t.batch_id, t.serial, tt.public_token, b.vehicle_class,
         t.origin, t.destination, t.status, t.current_step
       FROM transport_card_trips t
       JOIN transport_card_batches b ON b.id = t.batch_id
       JOIN transport_card_trip_tokens tt ON tt.batch_id = t.batch_id AND tt.serial = t.serial
       WHERE t.batch_id = ? AND NOT EXISTS (
         SELECT 1 FROM transport_card_trip_assignments n WHERE n.batch_id = t.batch_id AND n.serial = t.serial
       ) ORDER BY t.serial`, [batchId],
    ),
  ]);
  const trips = [...newTrips, ...legacyTrips].sort((a, b) => a.serial - b.serial);
  if (!trips.length) return [];
  const newIds = newTrips.map((trip) => Math.abs(Number(trip.id)));
  const oldIds = legacyTrips.map((trip) => Number(trip.id));
  const newSlots = newIds.map(() => "?").join(",");
  const oldSlots = oldIds.map(() => "?").join(",");
  const [goods, legacyGoods, legacyItems, newChecks, oldChecks] = await Promise.all([
    newIds.length ? queryRows<{ trip_id: number; description: string }>(`SELECT trip_id, goods_description AS description FROM transport_card_assignment_goods WHERE trip_id IN (${newSlots}) ORDER BY id`, newIds) : Promise.resolve([]),
    oldIds.length ? queryRows<{ trip_id: number; description: string }>(`SELECT trip_id, goods_description AS description FROM transport_card_trip_goods WHERE trip_id IN (${oldSlots}) ORDER BY id`, oldIds) : Promise.resolve([]),
    oldIds.length ? queryRows<{ trip_id: number; description: string; quantity: number | string; unit: string }>(`SELECT trip_id, goods_description AS description, quantity, unit FROM transport_card_trip_items WHERE trip_id IN (${oldSlots}) ORDER BY id`, oldIds) : Promise.resolve([]),
    newIds.length ? queryRows<{ trip_id: number; step: number; agent_name: string; outcome: "verified" | "flagged"; notes: string; checked_at: string | Date }>(
      `SELECT e.trip_id, e.step, u.display_name AS agent_name, e.outcome, e.notes, e.checked_at
       FROM transport_card_assignment_events e JOIN users u ON u.id = e.user_id WHERE e.trip_id IN (${newSlots}) ORDER BY e.checked_at, e.id`, newIds,
    ) : Promise.resolve([]),
    oldIds.length ? queryRows<{ trip_id: number; step: number; agent_name: string; outcome: "verified" | "flagged"; notes: string; checked_at: string | Date }>(
      `SELECT e.trip_id, e.step, u.display_name AS agent_name, e.outcome, e.notes, e.checked_at
       FROM transport_card_verification_events e JOIN users u ON u.id = e.user_id WHERE e.trip_id IN (${oldSlots}) ORDER BY e.checked_at, e.id`, oldIds,
    ) : Promise.resolve([]),
  ]);
  return trips.map(({ public_token, ...trip }) => {
    const id = Number(trip.id);
    const isNew = id < 0;
    const dbId = Math.abs(id);
    const tripGoods = isNew ? goods.filter((item) => item.trip_id === dbId).map(({ description }) => ({ description }))
      : legacyGoods.some((item) => item.trip_id === dbId)
        ? legacyGoods.filter((item) => item.trip_id === dbId).map(({ description }) => ({ description }))
        : legacyItems.filter((item) => item.trip_id === dbId).map(({ description, quantity, unit }) => ({ description, quantity, unit }));
    const checks = (isNew ? newChecks : oldChecks).filter((event) => event.trip_id === dbId).map(({ trip_id: _tripId, ...event }) => event);
    return { ...trip, id, source: isNew ? "assignment" as const : "legacy" as const, batch_id: Number(trip.batch_id), serial: Number(trip.serial), current_step: Number(trip.current_step), code: cardTripCode(Number(trip.batch_id), public_token), items: tripGoods, verifications: checks };
  });
}

async function loadProductionTrips(categoryId: number): Promise<CardTrip[]> {
  const rows = await queryRows<TripRow>(
    `SELECT -t.id AS id, ${cardsPerProductionBatch} * (t.production_batch_id - 1) + 1 AS batch_id, t.serial, t.public_token, c.vehicle_class, t.origin, t.destination, t.status, t.current_step FROM transport_production_trip_assignments t JOIN transport_production_categories c ON c.id = t.category_id WHERE t.category_id = ? ORDER BY t.serial`,
    [categoryId],
  );
  if (!rows.length) return [];
  const ids = rows.map((row) => Math.abs(Number(row.id)));
  const slots = ids.map(() => "?").join(",");
  const [goods, events] = await Promise.all([
    queryRows<{ trip_id: number; description: string }>("SELECT trip_id, goods_description AS description FROM transport_production_trip_goods WHERE trip_id IN (" + slots + ") ORDER BY id", ids),
    queryRows<{ trip_id: number; step: number; agent_name: string; outcome: "verified" | "flagged"; notes: string; checked_at: string | Date }>(
      "SELECT e.trip_id, e.step, u.display_name AS agent_name, e.outcome, e.notes, e.checked_at FROM transport_production_trip_events e JOIN users u ON u.id = e.user_id WHERE e.trip_id IN (" + slots + ") ORDER BY e.checked_at, e.id", ids,
    ),
  ]);
  return rows.map(({ public_token, ...row }) => {
    const id = Number(row.id); const dbId = Math.abs(id);
    return { ...row, id, source: "production" as const, batch_id: Number(row.batch_id), serial: Number(row.serial), current_step: Number(row.current_step), code: cardTripCode(Number(row.batch_id), public_token),
      items: goods.filter((item) => item.trip_id === dbId).map(({ description }) => ({ description })),
      verifications: events.filter((event) => event.trip_id === dbId).map(({ trip_id: _tripId, ...event }) => event) };
  });
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const params = new URL(request.url).searchParams;
  const categoryId = Number(params.get("categoryId"));
  if (params.has("categoryId")) {
    if (!Number.isSafeInteger(categoryId) || categoryId < 1) return NextResponse.json({ error: "Choose a valid batch category." }, { status: 400 });
    try {
      await ensureDatabase();
      const categories = await queryRows<{ id: number; production_batch_id: number; legacy_batch_id: number | null; vehicle_class: string; destination: string; allocated_quantity: number }>(
        "SELECT id, production_batch_id, legacy_batch_id, vehicle_class, destination, allocated_quantity FROM transport_production_categories WHERE id = ? LIMIT 1", [categoryId]);
      const category = categories[0];
      if (!category) return NextResponse.json({ error: "Batch category not found." }, { status: 404 });
      const legacyId = Number(category.legacy_batch_id ?? -1);
      const usedRows = await queryRows<{ serial: number }>(
        "SELECT serial FROM transport_production_trip_assignments WHERE category_id = ? UNION SELECT serial FROM transport_card_trips WHERE batch_id = ? UNION SELECT serial FROM transport_card_trip_assignments WHERE batch_id = ? ORDER BY serial",
        [categoryId, legacyId, legacyId]);
      const used = new Set(usedRows.map((row) => Number(row.serial)));
      let nextSerial = 1;
      while (used.has(nextSerial) && nextSerial <= Number(category.allocated_quantity)) nextSerial += 1;
      const available = nextSerial <= Number(category.allocated_quantity) ? nextSerial : null;
      const rangeStart = productionBatchRangeStart(Number(category.production_batch_id));
      const trips = await loadProductionTrips(categoryId);
      const legacyTrips = category.legacy_batch_id ? await loadTrips(Number(category.legacy_batch_id)) : [];
      return NextResponse.json({ batch: { ...category, id: Number(category.id), production_batch_id: Number(category.production_batch_id), legacy_batch_id: category.legacy_batch_id == null ? null : Number(category.legacy_batch_id), allocated_quantity: Number(category.allocated_quantity), range_start: rangeStart },
        trips: [...trips, ...legacyTrips].sort((a, b) => a.serial - b.serial), nextSerial: available,
        nextCode: null }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      console.error("Failed to load production category trips:", error);
      return NextResponse.json({ error: tripLoadError(error) }, { status: 503 });
    }
  }
  const batchId = Number(params.get("batchId"));
  if (!Number.isSafeInteger(batchId) || batchId < 1) return NextResponse.json({ error: "Choose a valid card batch." }, { status: 400 });
  try {
    await ensureDatabase();
    const batches = await queryRows<BatchRow>("SELECT id, vehicle_class, destination, allocated_quantity FROM transport_card_batches WHERE id = ? LIMIT 1", [batchId]);
    if (!batches[0]) return NextResponse.json({ error: "Card batch not found." }, { status: 404 });
    const serialRows = await queryRows<{ serial: number }>(
      `SELECT serial FROM transport_card_trips WHERE batch_id = ? UNION SELECT serial FROM transport_card_trip_assignments WHERE batch_id = ? ORDER BY serial`, [batchId, batchId],
    );
    const used = new Set(serialRows.map((row) => Number(row.serial)));
    let nextSerial = 1;
    while (used.has(nextSerial) && nextSerial <= Number(batches[0].allocated_quantity)) nextSerial += 1;
    const availableSerial = nextSerial <= Number(batches[0].allocated_quantity) ? nextSerial : null;
    const connection = await getPool().getConnection();
    let nextToken: string | null = null;
    try {
      for (const row of serialRows) await ensureCardTripToken(connection, batchId, Number(row.serial));
      if (availableSerial) nextToken = await ensureCardTripToken(connection, batchId, availableSerial);
    } finally { connection.release(); }
    const trips = await loadTrips(batchId);
    return NextResponse.json({ batch: batches[0], trips, nextSerial: availableSerial, nextCode: nextToken ? cardTripCode(batchId, nextToken) : null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Failed to load card trip workspace:", error);
    return NextResponse.json({ error: tripLoadError(error) }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  let body: { batchId?: unknown; categoryId?: unknown; productionBatchId?: unknown; serial?: unknown; origin?: unknown; items?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Enter valid trip details." }, { status: 400 }); }
  if (body.categoryId !== undefined) {
    const categoryId = Number(body.categoryId); const productionBatchId = Number(body.productionBatchId); const serial = Number(body.serial);
    if (!Number.isSafeInteger(categoryId) || categoryId < 1 || !Number.isSafeInteger(productionBatchId) || productionBatchId < 1 || !Number.isSafeInteger(serial) || serial < 1 || !validText(body.origin, 120)) return NextResponse.json({ error: "Choose a card and enter a departure location." }, { status: 400 });
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) return NextResponse.json({ error: "Add between 1 and 20 goods items to the trip." }, { status: 400 });
    const items = body.items.map((raw) => { const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}; return { description: typeof item.description === "string" ? item.description.trim() : "" }; });
    if (items.some((item) => !validText(item.description, 160))) return NextResponse.json({ error: "Each goods item needs a description." }, { status: 400 });
    try {
      await ensureDatabase(); const connection = await getPool().getConnection();
      try {
        await connection.beginTransaction();
        const categories = await connection.query("SELECT id, production_batch_id, legacy_batch_id, destination, allocated_quantity FROM transport_production_categories WHERE id = ? FOR UPDATE", [categoryId]) as Array<{ id: number; production_batch_id: number; legacy_batch_id: number | null; destination: string; allocated_quantity: number }>;
        const category = categories[0];
        if (!category || Number(category.production_batch_id) !== productionBatchId) { await connection.rollback(); return NextResponse.json({ error: "The selected batch category could not be found." }, { status: 404 }); }
        if (serial > Number(category.allocated_quantity)) { await connection.rollback(); return NextResponse.json({ error: "This card number is outside the category allocation." }, { status: 400 }); }
        const existing = await connection.query("SELECT id FROM transport_production_trip_assignments WHERE category_id = ? AND serial = ? LIMIT 1 FOR UPDATE", [categoryId, serial]) as Array<{ id: number }>;
        const oldLegacy = category.legacy_batch_id ? await connection.query("SELECT serial FROM transport_card_trips WHERE batch_id = ? AND serial = ? LIMIT 1 FOR UPDATE", [category.legacy_batch_id, serial]) as Array<{ serial: number }> : [];
        const oldAssigned = !oldLegacy.length && category.legacy_batch_id ? await connection.query("SELECT serial FROM transport_card_trip_assignments WHERE batch_id = ? AND serial = ? LIMIT 1 FOR UPDATE", [category.legacy_batch_id, serial]) as Array<{ serial: number }> : [];
        const oldExisting = oldLegacy.length ? oldLegacy : oldAssigned;
        if (existing.length || oldExisting.length) { await connection.rollback(); return NextResponse.json({ error: "That card has already been assigned and cannot be reused." }, { status: 409 }); }
        const { generateCardTripToken } = await import("@/lib/card-trip-token");
        let token = generateCardTripToken();
        for (let retry = 0; retry < 8; retry += 1) {
          const duplicate = await connection.query("SELECT id FROM transport_production_trip_assignments WHERE production_batch_id = ? AND public_token = ? LIMIT 1", [productionBatchId, token]) as Array<{ id: number }>;
          if (!duplicate.length) break;
          token = generateCardTripToken();
        }
        const result = await connection.query(
          "INSERT INTO transport_production_trip_assignments (production_batch_id, category_id, serial, public_token, origin, destination, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [productionBatchId, categoryId, serial, token, (body.origin as string).trim(), category.destination, auth.session.userId],
        ) as { insertId: number | bigint };
        const tripId = Number(result.insertId);
        for (const item of items) await connection.query("INSERT INTO transport_production_trip_goods (trip_id, goods_description) VALUES (?, ?)", [tripId, item.description]);
        await connection.commit();
        return NextResponse.json({ id: -tripId, code: cardTripCode(productionBatchRangeStart(productionBatchId), token) }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    } catch (error) {
      console.error("Failed to create production trip:", error);
      return NextResponse.json({ error: "The trip could not be saved. Check the database connection and try again." }, { status: 503 });
    }
  }
  const batchId = Number(body.batchId);
  const serial = Number(body.serial);
  if (!Number.isSafeInteger(batchId) || batchId < 1 || !Number.isSafeInteger(serial) || serial < 1 || !validText(body.origin, 120)) {
    return NextResponse.json({ error: "Choose a card and enter a departure location." }, { status: 400 });
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) return NextResponse.json({ error: "Add between 1 and 20 goods items to the trip." }, { status: 400 });
  const items = body.items.map((raw) => { const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}; return { description: typeof item.description === "string" ? item.description.trim() : "" }; });
  if (items.some((item) => !validText(item.description, 160))) return NextResponse.json({ error: "Each goods item needs a description." }, { status: 400 });
  try {
    await ensureDatabase();
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const batches = await connection.query("SELECT id, destination, allocated_quantity FROM transport_card_batches WHERE id = ? FOR UPDATE", [batchId]) as BatchRow[];
      if (!batches[0]) { await connection.rollback(); return NextResponse.json({ error: "Card batch not found." }, { status: 404 }); }
      if (serial > Number(batches[0].allocated_quantity)) { await connection.rollback(); return NextResponse.json({ error: "This card number is outside the batch allocation." }, { status: 400 }); }
      const existingLegacy = await connection.query("SELECT serial FROM transport_card_trips WHERE batch_id = ? AND serial = ? LIMIT 1 FOR UPDATE", [batchId, serial]) as Array<{ serial: number }>;
      const existingNew = await connection.query("SELECT serial FROM transport_card_trip_assignments WHERE batch_id = ? AND serial = ? LIMIT 1 FOR UPDATE", [batchId, serial]) as Array<{ serial: number }>;
      if (existingLegacy.length || existingNew.length) { await connection.rollback(); return NextResponse.json({ error: "That card has already been assigned to a trip and cannot be reused." }, { status: 409 }); }
      const token = await ensureCardTripToken(connection, batchId, serial);
      const result = await connection.query(
        `INSERT INTO transport_card_trip_assignments (batch_id, serial, origin, destination, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [batchId, serial, (body.origin as string).trim(), batches[0].destination, auth.session.userId],
      ) as { insertId: number | bigint };
      const tripId = Number(result.insertId);
      for (const item of items) await connection.query("INSERT INTO transport_card_assignment_goods (trip_id, goods_description) VALUES (?, ?)", [tripId, item.description]);
      await connection.commit();
      return NextResponse.json({ id: -tripId, code: cardTripCode(batchId, token) }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      await connection.rollback();
      if (error && typeof error === "object" && "code" in error && error.code === "ER_DUP_ENTRY") return NextResponse.json({ error: "That card has already been assigned to a trip and cannot be reused." }, { status: 409 });
      throw error;
    } finally { connection.release(); }
  } catch (error) {
    console.error("Failed to create card trip:", error);
    return NextResponse.json({ error: "The trip could not be saved. Check the database connection and try again." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  let body: { tripId?: unknown; action?: unknown; source?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Enter a valid card review action." }, { status: 400 }); }
  if (body.action !== "release_hold" || !Number.isSafeInteger(Number(body.tripId))) return NextResponse.json({ error: "Choose a valid held trip." }, { status: 400 });
  try {
    const id = Number(body.tripId);
    const table = body.source === "production" ? "transport_production_trip_assignments" : body.source === "assignment" || id < 0 ? "transport_card_trip_assignments" : "transport_card_trips";
    const dbId = Math.abs(id);
    await queryRows(`UPDATE ${table} SET status = IF(current_step = 1, 'ready', 'in_transit') WHERE id = ? AND status = 'on_hold'`, [dbId]);
    const trip = await queryRows<{ id: number }>(`SELECT id FROM ${table} WHERE id = ? AND status <> 'on_hold' LIMIT 1`, [dbId]);
    if (!trip[0]) return NextResponse.json({ error: "This trip is not on hold or could not be found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to release held card trip:", error);
    return NextResponse.json({ error: "The trip could not be released." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  let body: { tripId?: unknown; source?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Choose a trip card to delete." }, { status: 400 }); }

  const tripId = Number(body.tripId);
  if (!Number.isSafeInteger(tripId) || tripId === 0) return NextResponse.json({ error: "Choose a valid trip card." }, { status: 400 });
  const dbId = Math.abs(tripId);
  const isProductionAssignment = body.source === "production";
  const isNewAssignment = body.source === "assignment" || (!body.source && tripId < 0);
  if ((isProductionAssignment || isNewAssignment) && tripId > 0 || body.source === "legacy" && tripId < 0) return NextResponse.json({ error: "The trip card source is invalid." }, { status: 400 });
  const table = isProductionAssignment ? "transport_production_trip_assignments" : isNewAssignment ? "transport_card_trip_assignments" : "transport_card_trips";
  const eventsTable = isProductionAssignment ? "transport_production_trip_events" : isNewAssignment ? "transport_card_assignment_events" : "transport_card_verification_events";

  try {
    await ensureDatabase();
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const records = await connection.query(
        `SELECT id, status, current_step FROM ${table} WHERE id = ? LIMIT 1 FOR UPDATE`,
        [dbId],
      ) as Array<{ id: number; status: string; current_step: number }>;
      const record = records[0];
      if (!record) {
        await connection.rollback();
        return NextResponse.json({ error: "This trip card could not be found. Refresh the queue and try again." }, { status: 404 });
      }
      if (record.status !== "ready" || Number(record.current_step) !== 1) {
        await connection.rollback();
        return NextResponse.json({ error: "Only a trip card that has not started verification can be deleted." }, { status: 409 });
      }
      const eventRows = await connection.query(
        `SELECT COUNT(*) AS count FROM ${eventsTable} WHERE trip_id = ?`,
        [dbId],
      ) as Array<{ count: number | string }>;
      if (Number(eventRows[0]?.count ?? 0) > 0) {
        await connection.rollback();
        return NextResponse.json({ error: "This card already has verification history and cannot be deleted." }, { status: 409 });
      }
      await connection.query(`DELETE FROM ${table} WHERE id = ?`, [dbId]);
      await connection.commit();
      return NextResponse.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  } catch (error) {
    console.error("Failed to delete unverified trip card:", error);
    return NextResponse.json({ error: "The trip card could not be deleted. Refresh the queue and try again." }, { status: 503 });
  }
}
