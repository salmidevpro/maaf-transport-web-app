import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { ensureDatabase, getPool, queryRows } from "@/lib/db";
import { cardDestinations, cardVehicleClasses, cardsPerProductionBatch, productionBatchRangeStart, type TransportCardCategory, type TransportProductionBatch } from "@/lib/card-batches";

export const dynamic = "force-dynamic";
const maxCategoryQuantity = cardsPerProductionBatch;
const productionBatchSequenceLock = "maaf-production-batch-sequence";
type BatchRow = Omit<TransportProductionBatch, "categories" | "range_start"> & { range_start?: number | string };
type CategoryRow = TransportCardCategory;

function normalizeKnownLabel(value: string, known: readonly string[]) { return known.find((label) => label.toLowerCase() === value.toLowerCase()) ?? value; }
function validLabel(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max && /^[\p{L}\p{N}][\p{L}\p{N} .&'’()/-]*$/u.test(value.trim());
}
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
async function adminSession() {
  const session = await getAuthSession();
  if (!session) return { response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  if (session.role !== "admin") return { response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) };
  return { session };
}

export async function GET() {
  const auth = await adminSession();
  if ("response" in auth) return auth.response;
  try {
    await ensureDatabase();
    const [batches, categories] = await Promise.all([
      queryRows<BatchRow>(
        `SELECT b.id, b.batch_date, b.created_at,
           ((b.id - 1) * ${cardsPerProductionBatch} + 1) AS range_start,
           COALESCE(SUM(c.allocated_quantity), 0) AS allocated_quantity,
           COALESCE(SUM(c.assigned_quantity), 0) AS assigned_quantity
         FROM transport_production_batches b
         LEFT JOIN (
           SELECT c.id, c.production_batch_id, c.allocated_quantity,
             COALESCE((SELECT COUNT(*) FROM transport_production_trip_assignments n WHERE n.category_id = c.id), 0) +
             COALESCE((SELECT COUNT(*) FROM transport_card_trips old WHERE old.batch_id = c.legacy_batch_id), 0) +
             COALESCE((SELECT COUNT(*) FROM transport_card_trip_assignments old WHERE old.batch_id = c.legacy_batch_id), 0) AS assigned_quantity
           FROM transport_production_categories c
         ) c ON c.production_batch_id = b.id
         GROUP BY b.id ORDER BY b.id DESC`,
      ),
      queryRows<CategoryRow>(
        `SELECT c.id, c.production_batch_id, c.legacy_batch_id, c.vehicle_class, c.destination,
           c.allocated_quantity, c.fare_ngn,
           COALESCE((SELECT COUNT(*) FROM transport_production_trip_assignments n WHERE n.category_id = c.id), 0) +
           COALESCE((SELECT COUNT(*) FROM transport_card_trips old WHERE old.batch_id = c.legacy_batch_id), 0) +
           COALESCE((SELECT COUNT(*) FROM transport_card_trip_assignments old WHERE old.batch_id = c.legacy_batch_id), 0) AS assigned_quantity
         FROM transport_production_categories c ORDER BY c.id`,
      ),
    ]);
    const result: TransportProductionBatch[] = batches.map((batch) => ({
      ...batch,
      id: Number(batch.id),
      batch_date: String(batch.batch_date).slice(0, 10),
      range_start: Number(batch.range_start ?? productionBatchRangeStart(Number(batch.id))),
      allocated_quantity: Number(batch.allocated_quantity ?? 0),
      assigned_quantity: Number(batch.assigned_quantity ?? 0),
      categories: categories.filter((category) => Number(category.production_batch_id) === Number(batch.id)).map((category) => ({
        ...category, id: Number(category.id), production_batch_id: Number(category.production_batch_id),
        legacy_batch_id: category.legacy_batch_id == null ? null : Number(category.legacy_batch_id),
        allocated_quantity: Number(category.allocated_quantity), assigned_quantity: Number(category.assigned_quantity ?? 0),
      })),
    }));
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Failed to load production batches:", error);
    return NextResponse.json({ error: "Batches and categories could not be loaded." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await adminSession();
  if ("response" in auth) return auth.response;
  let body: { batchDate?: unknown; productionBatchId?: unknown; vehicleClass?: unknown; destination?: unknown; quantity?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Enter valid batch details." }, { status: 400 }); }

  if (body.batchDate !== undefined) {
    if (!validDate(body.batchDate)) return NextResponse.json({ error: "Choose a valid batch date." }, { status: 400 });
    try {
      await ensureDatabase();
      const connection = await getPool().getConnection();
      let sequenceLockAcquired = false;
      let transactionStarted = false;
      try {
        const lockResult = await connection.query("SELECT GET_LOCK(?, 10) AS acquired", [productionBatchSequenceLock]) as Array<{ acquired: number | string | null }>;
        sequenceLockAcquired = Number(lockResult[0]?.acquired) === 1;
        if (!sequenceLockAcquired) return NextResponse.json({ error: "Batch numbering is busy. Please try again." }, { status: 503 });
        await connection.beginTransaction();
        transactionStarted = true;
        const latest = await connection.query("SELECT COALESCE(MAX(id), 0) AS latest_id FROM transport_production_batches") as Array<{ latest_id: number | string }>;
        const batchId = Number(latest[0]?.latest_id ?? 0) + 1;
        await connection.query("INSERT INTO transport_production_batches (id, batch_date) VALUES (?, ?)", [batchId, body.batchDate]);
        await connection.commit();
        transactionStarted = false;
        return NextResponse.json({ id: batchId, batch_date: body.batchDate, range_start: productionBatchRangeStart(batchId), allocated_quantity: 0, assigned_quantity: 0, categories: [] }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
      } catch (error) {
        if (transactionStarted) await connection.rollback();
        throw error;
      } finally {
        if (sequenceLockAcquired) {
          try { await connection.query("SELECT RELEASE_LOCK(?)", [productionBatchSequenceLock]); }
          catch (error) { console.error("Could not release production batch numbering lock:", error); }
        }
        connection.release();
      }
    } catch (error) {
      console.error("Failed to create production batch:", error);
      return NextResponse.json({ error: "The batch could not be created." }, { status: 503 });
    }
  }

  const productionBatchId = Number(body.productionBatchId);
  const quantity = Number(body.quantity);
  if (!Number.isSafeInteger(productionBatchId) || productionBatchId < 1 || !validLabel(body.vehicleClass, 60) || !validLabel(body.destination, 120)) {
    return NextResponse.json({ error: "Enter a vehicle class and destination for this batch category." }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxCategoryQuantity) {
    return NextResponse.json({ error: `Category quantity must be from 1 to ${maxCategoryQuantity.toLocaleString("en-NG")} cards.` }, { status: 400 });
  }
  const vehicleClass = normalizeKnownLabel(body.vehicleClass.trim(), cardVehicleClasses);
  const destination = normalizeKnownLabel(body.destination.trim(), cardDestinations);

  await ensureDatabase();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const parents = await connection.query("SELECT id FROM transport_production_batches WHERE id = ? FOR UPDATE", [productionBatchId]) as Array<{ id: number }>;
    if (!parents[0]) { await connection.rollback(); return NextResponse.json({ error: "The selected batch could not be found." }, { status: 404 }); }
    const totals = await connection.query("SELECT COALESCE(SUM(allocated_quantity), 0) AS allocated FROM transport_production_categories WHERE production_batch_id = ?", [productionBatchId]) as Array<{ allocated: number | string }>;
    const currentTotal = Number(totals[0]?.allocated ?? 0);
    if (currentTotal >= cardsPerProductionBatch) {
      await connection.rollback();
      return NextResponse.json({ error: `This batch has reached its ${cardsPerProductionBatch.toLocaleString("en-NG")}-card limit. Create another batch to allocate more cards.` }, { status: 409 });
    }
    if (currentTotal + quantity > cardsPerProductionBatch) {
      await connection.rollback();
      return NextResponse.json({ error: "This batch has " + Math.max(0, cardsPerProductionBatch - currentTotal).toLocaleString("en-NG") + " card slots remaining. Create another batch to allocate any cards above the limit." }, { status: 409 });
    }
    const inserted = await connection.query(
      "INSERT INTO transport_production_categories (production_batch_id, vehicle_class, destination, allocated_quantity) VALUES (?, ?, ?, ?)",
      [productionBatchId, vehicleClass, destination, quantity],
    ) as { insertId: number | bigint };
    await connection.commit();
    return NextResponse.json({
      id: Number(inserted.insertId), production_batch_id: productionBatchId, legacy_batch_id: null,
      vehicle_class: vehicleClass, destination, allocated_quantity: quantity, assigned_quantity: 0, fare_ngn: null,
    }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    await connection.rollback();
    if (error && typeof error === "object" && "code" in error && error.code === "ER_DUP_ENTRY") return NextResponse.json({ error: "That class and destination category already exists in this batch." }, { status: 409 });
    console.error("Failed to add production batch category:", error);
    return NextResponse.json({ error: "The category could not be added." }, { status: 503 });
  } finally { connection.release(); }
}

export async function PATCH(request: Request) {
  const auth = await adminSession();
  if ("response" in auth) return auth.response;
  let body: { categoryId?: unknown; fareNgn?: unknown; availableQuantity?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Enter a valid fare update." }, { status: 400 }); }
  const categoryId = Number(body.categoryId);
  if (!Number.isSafeInteger(categoryId) || categoryId < 1) return NextResponse.json({ error: "Choose a valid batch category." }, { status: 400 });
  if (body.availableQuantity !== undefined) {
    const availableQuantity = Number(body.availableQuantity);
    if (!Number.isSafeInteger(availableQuantity) || availableQuantity < 0 || availableQuantity > cardsPerProductionBatch) {
      return NextResponse.json({ error: "Enter a valid whole number of available cards." }, { status: 400 });
    }
    try {
      await ensureDatabase();
      const connection = await getPool().getConnection();
      try {
        await connection.beginTransaction();
        const parents = await connection.query("SELECT production_batch_id FROM transport_production_categories WHERE id = ? LIMIT 1", [categoryId]) as Array<{ production_batch_id: number }>;
        if (!parents[0]) { await connection.rollback(); return NextResponse.json({ error: "Batch category not found." }, { status: 404 }); }
        await connection.query("SELECT id FROM transport_production_batches WHERE id = ? FOR UPDATE", [parents[0].production_batch_id]);
        const categories = await connection.query(
          "SELECT id, production_batch_id, legacy_batch_id, vehicle_class, destination, allocated_quantity, fare_ngn FROM transport_production_categories WHERE id = ? FOR UPDATE",
          [categoryId],
        ) as Array<{ id: number; production_batch_id: number; legacy_batch_id: number | null; vehicle_class: string; destination: string; allocated_quantity: number; fare_ngn: number | string | null }>;
        const category = categories[0];
        if (!category) { await connection.rollback(); return NextResponse.json({ error: "Batch category not found." }, { status: 404 }); }
        const productionAssignments = await connection.query("SELECT COUNT(*) AS count FROM transport_production_trip_assignments WHERE category_id = ?", [categoryId]) as Array<{ count: number | string }>;
        const legacyTripRows = category.legacy_batch_id ? await connection.query("SELECT COUNT(*) AS count FROM transport_card_trips WHERE batch_id = ?", [category.legacy_batch_id]) as Array<{ count: number | string }> : [];
        const legacyAssignedRows = category.legacy_batch_id ? await connection.query("SELECT COUNT(*) AS count FROM transport_card_trip_assignments WHERE batch_id = ?", [category.legacy_batch_id]) as Array<{ count: number | string }> : [];
        const assigned = Number(productionAssignments[0]?.count ?? 0) + Number(legacyTripRows[0]?.count ?? 0) + Number(legacyAssignedRows[0]?.count ?? 0);
        const newAllocated = assigned + availableQuantity;
        if (newAllocated < 1) { await connection.rollback(); return NextResponse.json({ error: "A category must reserve at least one card." }, { status: 400 }); }
        const batchTotals = await connection.query("SELECT COALESCE(SUM(allocated_quantity), 0) AS allocated FROM transport_production_categories WHERE production_batch_id = ?", [category.production_batch_id]) as Array<{ allocated: number | string }>;
        const projected = Number(batchTotals[0]?.allocated ?? 0) - Number(category.allocated_quantity) + newAllocated;
        if (projected > cardsPerProductionBatch) {
          await connection.rollback();
          return NextResponse.json({ error: `That available count exceeds this batch's ${cardsPerProductionBatch.toLocaleString("en-NG")}-card limit. Reduce the count or create another batch.` }, { status: 409 });
        }
        await connection.query("UPDATE transport_production_categories SET allocated_quantity = ? WHERE id = ?", [newAllocated, categoryId]);
        const batchAllocated = projected;
        await connection.commit();
        return NextResponse.json({
          category: { ...category, allocated_quantity: newAllocated, assigned_quantity: assigned },
          batchAllocated,
        }, { headers: { "Cache-Control": "private, no-store" } });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally { connection.release(); }
    } catch (error) {
      console.error("Failed to update available category cards:", error);
      return NextResponse.json({ error: "The available card count could not be saved." }, { status: 503 });
    }
  }
  const raw = body.fareNgn;
  let fare: number | null = null;
  if (raw !== null && raw !== "") {
    fare = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
    if (!Number.isFinite(fare) || fare < 0 || fare > 1_000_000_000 || Math.round(fare * 100) / 100 !== fare) return NextResponse.json({ error: "Fare must be a non-negative amount with up to two decimal places." }, { status: 400 });
  }
  try {
    const result = await queryRows("UPDATE transport_production_categories SET fare_ngn = ? WHERE id = ?", [fare, categoryId]);
    const category = await queryRows<{ id: number }>("SELECT id FROM transport_production_categories WHERE id = ? LIMIT 1", [categoryId]);
    if (!category[0]) return NextResponse.json({ error: "Batch category not found." }, { status: 404 });
    void result;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update batch category fare:", error);
    return NextResponse.json({ error: "The fare could not be saved." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const auth = await adminSession();
  if ("response" in auth) return auth.response;
  let body: { categoryId?: unknown; productionBatchId?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Choose a batch or category to delete." }, { status: 400 }); }
  if (body.productionBatchId !== undefined) {
    const productionBatchId = Number(body.productionBatchId);
    if (!Number.isSafeInteger(productionBatchId) || productionBatchId < 1) return NextResponse.json({ error: "Choose a valid production batch." }, { status: 400 });
    try {
      await ensureDatabase();
      const connection = await getPool().getConnection();
      let sequenceLockAcquired = false;
      let transactionStarted = false;
      try {
        const lockResult = await connection.query("SELECT GET_LOCK(?, 10) AS acquired", [productionBatchSequenceLock]) as Array<{ acquired: number | string | null }>;
        sequenceLockAcquired = Number(lockResult[0]?.acquired) === 1;
        if (!sequenceLockAcquired) return NextResponse.json({ error: "Batch numbering is busy. Please try again." }, { status: 503 });
        await connection.beginTransaction();
        transactionStarted = true;
        const batches = await connection.query("SELECT id FROM transport_production_batches WHERE id = ? FOR UPDATE", [productionBatchId]) as Array<{ id: number }>;
        if (!batches[0]) { await connection.rollback(); return NextResponse.json({ error: "Production batch not found." }, { status: 404 }); }
        const categories = await connection.query("SELECT id, legacy_batch_id FROM transport_production_categories WHERE production_batch_id = ? FOR UPDATE", [productionBatchId]) as Array<{ id: number; legacy_batch_id: number | null }>;
        let assigned = 0;
        for (const category of categories) {
          const production = await connection.query("SELECT COUNT(*) AS count FROM transport_production_trip_assignments WHERE category_id = ?", [category.id]) as Array<{ count: number | string }>;
          const legacyTrips = category.legacy_batch_id ? await connection.query("SELECT COUNT(*) AS count FROM transport_card_trips WHERE batch_id = ?", [category.legacy_batch_id]) as Array<{ count: number | string }> : [];
          const legacyAssignments = category.legacy_batch_id ? await connection.query("SELECT COUNT(*) AS count FROM transport_card_trip_assignments WHERE batch_id = ?", [category.legacy_batch_id]) as Array<{ count: number | string }> : [];
          assigned += Number(production[0]?.count ?? 0) + Number(legacyTrips[0]?.count ?? 0) + Number(legacyAssignments[0]?.count ?? 0);
          if (assigned > 0) break;
        }
        if (assigned > 0) {
          await connection.rollback();
          return NextResponse.json({ error: "This batch contains assigned cards and cannot be deleted." }, { status: 409 });
        }
        await connection.query("DELETE FROM transport_production_categories WHERE production_batch_id = ?", [productionBatchId]);
        await connection.query("DELETE FROM transport_production_batches WHERE id = ?", [productionBatchId]);
        await connection.commit();
        transactionStarted = false;
        return NextResponse.json({ success: true });
      } catch (error) {
        if (transactionStarted) await connection.rollback();
        throw error;
      } finally {
        if (sequenceLockAcquired) {
          try { await connection.query("SELECT RELEASE_LOCK(?)", [productionBatchSequenceLock]); }
          catch (error) { console.error("Could not release production batch numbering lock:", error); }
        }
        connection.release();
      }
    } catch (error) {
      console.error("Failed to delete production batch:", error);
      return NextResponse.json({ error: "The production batch could not be deleted." }, { status: 503 });
    }
  }
  const categoryId = Number(body.categoryId);
  if (!Number.isSafeInteger(categoryId) || categoryId < 1) return NextResponse.json({ error: "Choose a valid batch category." }, { status: 400 });
  try {
    await ensureDatabase();
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const parents = await connection.query("SELECT production_batch_id FROM transport_production_categories WHERE id = ? LIMIT 1", [categoryId]) as Array<{ production_batch_id: number }>;
      if (!parents[0]) { await connection.rollback(); return NextResponse.json({ error: "Batch category not found." }, { status: 404 }); }
      await connection.query("SELECT id FROM transport_production_batches WHERE id = ? FOR UPDATE", [parents[0].production_batch_id]);
      const categories = await connection.query(
        "SELECT id, production_batch_id, legacy_batch_id FROM transport_production_categories WHERE id = ? FOR UPDATE",
        [categoryId],
      ) as Array<{ id: number; production_batch_id: number; legacy_batch_id: number | null }>;
      const category = categories[0];
      if (!category) { await connection.rollback(); return NextResponse.json({ error: "Batch category not found." }, { status: 404 }); }
      const production = await connection.query("SELECT COUNT(*) AS count FROM transport_production_trip_assignments WHERE category_id = ?", [categoryId]) as Array<{ count: number | string }>;
      const legacyTrips = category.legacy_batch_id ? await connection.query("SELECT COUNT(*) AS count FROM transport_card_trips WHERE batch_id = ?", [category.legacy_batch_id]) as Array<{ count: number | string }> : [];
      const legacyAssignments = category.legacy_batch_id ? await connection.query("SELECT COUNT(*) AS count FROM transport_card_trip_assignments WHERE batch_id = ?", [category.legacy_batch_id]) as Array<{ count: number | string }> : [];
      const assigned = Number(production[0]?.count ?? 0) + Number(legacyTrips[0]?.count ?? 0) + Number(legacyAssignments[0]?.count ?? 0);
      if (assigned > 0) {
        await connection.rollback();
        return NextResponse.json({ error: "This category has assigned trip cards and cannot be deleted." }, { status: 409 });
      }
      await connection.query("DELETE FROM transport_production_categories WHERE id = ?", [categoryId]);
      await connection.commit();
      return NextResponse.json({ success: true });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  } catch (error) {
    console.error("Failed to delete batch category:", error);
    return NextResponse.json({ error: "The category could not be deleted." }, { status: 503 });
  }
}
