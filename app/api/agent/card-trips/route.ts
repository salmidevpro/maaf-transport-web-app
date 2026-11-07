import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { ensureDatabase, getPool, queryRows } from "@/lib/db";
import { parseCardTripCode, type CardTrip } from "@/lib/card-trips";
import { cardsPerProductionBatch } from "@/lib/card-batches";
import { notifyAdminsOfAgentActivity } from "@/lib/portal-notifications";

export const dynamic = "force-dynamic";
type TripRow = Omit<CardTrip, "items" | "verifications" | "code">;

export async function GET(request: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Sign in to the Agent Portal to view this trip." }, { status: 401 });
  if (session.role !== "agent") return NextResponse.json({ error: "Agent access required." }, { status: 403 });
  const parsed = parseCardTripCode(new URL(request.url).searchParams.get("code") || "");
  if (!parsed) return NextResponse.json({ error: "This QR code is not valid." }, { status: 404 });
  try {
    await ensureDatabase();
    if (parsed.token && (parsed.batchId - 1) % cardsPerProductionBatch === 0) {
      const productionBatchId = Math.floor((parsed.batchId - 1) / cardsPerProductionBatch) + 1;
      const productionRows = await queryRows<TripRow>(
        "SELECT -t.id AS id, ? AS batch_id, t.serial, c.vehicle_class, t.origin, t.destination, t.status, t.current_step FROM transport_production_trip_assignments t JOIN transport_production_categories c ON c.id = t.category_id WHERE t.production_batch_id = ? AND t.public_token = ? LIMIT 1",
        [parsed.batchId, productionBatchId, parsed.token],
      );
      const productionTrip = productionRows[0];
      if (productionTrip) {
        const id = Math.abs(Number(productionTrip.id));
        const [items, verifications, ownChecks] = await Promise.all([
          queryRows<{ description: string }>("SELECT goods_description AS description FROM transport_production_trip_goods WHERE trip_id = ? ORDER BY id", [id]),
          queryRows<{ step: number; agent_name: string; outcome: "verified" | "flagged"; notes: string; checked_at: string | Date }>(
            "SELECT e.step, u.display_name AS agent_name, e.outcome, e.notes, e.checked_at FROM transport_production_trip_events e JOIN users u ON u.id = e.user_id WHERE e.trip_id = ? ORDER BY e.checked_at, e.id", [id]),
          queryRows<{ step: number }>("SELECT step FROM transport_production_trip_events WHERE trip_id = ? AND user_id = ? AND outcome = 'verified' ORDER BY step LIMIT 1", [id, session.userId]),
        ]);
        return NextResponse.json({ ...productionTrip, id: Number(productionTrip.id), code: parsed.code, items, verifications, currentAgentVerifiedStep: ownChecks[0]?.step ?? null }, { headers: { "Cache-Control": "private, no-store" } });
      }
    }
    const tokenRows = parsed.token ? await queryRows<{ serial: number }>("SELECT serial FROM transport_card_trip_tokens WHERE batch_id = ? AND public_token = ? LIMIT 1", [parsed.batchId, parsed.token]) : [];
    const serial = parsed.serial ?? (tokenRows[0] ? Number(tokenRows[0].serial) : null);
    if (!serial) return NextResponse.json({ error: "This QR code is not valid." }, { status: 404 });
    const newTrips = await queryRows<TripRow>(
      `SELECT -t.id AS id, t.batch_id, t.serial, b.vehicle_class, t.origin, t.destination, t.status, t.current_step
       FROM transport_card_trip_assignments t JOIN transport_card_batches b ON b.id = t.batch_id
       WHERE t.batch_id = ? AND t.serial = ? LIMIT 1`, [parsed.batchId, serial],
    );
    const isNew = Boolean(newTrips[0]);
    const trips = newTrips.length ? newTrips : await queryRows<TripRow>(
      `SELECT t.id, t.batch_id, t.serial, b.vehicle_class, t.origin, t.destination, t.status, t.current_step
       FROM transport_card_trips t JOIN transport_card_batches b ON b.id = t.batch_id
       WHERE t.batch_id = ? AND t.serial = ? LIMIT 1`, [parsed.batchId, serial],
    );
    const trip = trips[0];
    if (!trip) return NextResponse.json({ error: "This card has not been assigned to a trip yet." }, { status: 404 });
    const dbId = Math.abs(Number(trip.id));
    const [goods, legacyGoods, legacyItems, verifications, legacyVerifications, ownChecks] = await Promise.all([
      isNew ? queryRows<{ description: string }>("SELECT goods_description AS description FROM transport_card_assignment_goods WHERE trip_id = ? ORDER BY id", [dbId]) : Promise.resolve([]),
      isNew ? Promise.resolve([]) : queryRows<{ description: string }>("SELECT goods_description AS description FROM transport_card_trip_goods WHERE trip_id = ? ORDER BY id", [dbId]),
      isNew ? Promise.resolve([]) : queryRows<{ description: string; quantity: number | string; unit: string }>("SELECT goods_description AS description, quantity, unit FROM transport_card_trip_items WHERE trip_id = ? ORDER BY id", [dbId]),
      isNew ? queryRows<{ step: number; agent_name: string; outcome: "verified" | "flagged"; notes: string; checked_at: string | Date }>(
        `SELECT e.step, u.display_name AS agent_name, e.outcome, e.notes, e.checked_at FROM transport_card_assignment_events e JOIN users u ON u.id = e.user_id WHERE e.trip_id = ? ORDER BY e.checked_at, e.id`, [dbId],
      ) : Promise.resolve([]),
      isNew ? Promise.resolve([]) : queryRows<{ step: number; agent_name: string; outcome: "verified" | "flagged"; notes: string; checked_at: string | Date }>(
        `SELECT e.step, u.display_name AS agent_name, e.outcome, e.notes, e.checked_at FROM transport_card_verification_events e JOIN users u ON u.id = e.user_id WHERE e.trip_id = ? ORDER BY e.checked_at, e.id`, [dbId],
      ),
      isNew ? queryRows<{ step: number }>("SELECT step FROM transport_card_assignment_events WHERE trip_id = ? AND user_id = ? AND outcome = 'verified' ORDER BY step LIMIT 1", [dbId, session.userId])
        : queryRows<{ step: number }>("SELECT step FROM transport_card_verification_events WHERE trip_id = ? AND user_id = ? AND outcome = 'verified' ORDER BY step LIMIT 1", [dbId, session.userId]),
    ]);
    const items = isNew ? goods : legacyGoods.length ? legacyGoods : legacyItems;
    return NextResponse.json({ ...trip, id: Number(trip.id), code: parsed.code, items, verifications: isNew ? verifications : legacyVerifications, currentAgentVerifiedStep: ownChecks[0]?.step ?? null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Failed to load agent card trip:", error);
    return NextResponse.json({ error: "Trip information could not be loaded." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Sign in to verify this trip." }, { status: 401 });
  if (session.role !== "agent") return NextResponse.json({ error: "Agent access required." }, { status: 403 });
  let body: { code?: unknown; step?: unknown; outcome?: unknown; notes?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter a valid checkpoint result." }, { status: 400 }); }
  const parsed = typeof body.code === "string" ? parseCardTripCode(body.code) : null;
  const step = Number(body.step);
  const outcome = body.outcome;
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : "";
  if (!parsed || !Number.isInteger(step) || step < 1 || step > 3 || (outcome !== "verified" && outcome !== "flagged")) return NextResponse.json({ error: "Choose a valid card checkpoint result." }, { status: 400 });
  if (outcome === "flagged" && !notes) return NextResponse.json({ error: "Add a short note explaining the discrepancy." }, { status: 400 });
  try {
    await ensureDatabase();
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      if (parsed.token && (parsed.batchId - 1) % cardsPerProductionBatch === 0) {
        const productionBatchId = Math.floor((parsed.batchId - 1) / cardsPerProductionBatch) + 1;
        const production = await connection.query(
          "SELECT id, status, current_step FROM transport_production_trip_assignments WHERE production_batch_id = ? AND public_token = ? LIMIT 1 FOR UPDATE",
          [productionBatchId, parsed.token],
        ) as Array<{ id: number; status: string; current_step: number }>;
        const productionTrip = production[0];
        if (productionTrip) {
          if (productionTrip.status === "completed") { await connection.rollback(); return NextResponse.json({ error: "This trip has completed all three checkpoints. Its card cannot be reused." }, { status: 409 }); }
          if (productionTrip.status === "on_hold") { await connection.rollback(); return NextResponse.json({ error: "This trip is on hold for admin review." }, { status: 409 }); }
          if (Number(productionTrip.current_step) !== step) { await connection.rollback(); return NextResponse.json({ error: "The previous checkpoint must be completed first." }, { status: 409 }); }
          if (outcome === "verified") {
            const previous = await connection.query("SELECT step FROM transport_production_trip_events WHERE trip_id = ? AND user_id = ? AND outcome = 'verified' ORDER BY step LIMIT 1", [productionTrip.id, session.userId]) as Array<{ step: number }>;
            if (previous.length) { await connection.rollback(); return NextResponse.json({ error: `You already verified this card at checkpoint ${previous[0].step}. Every checkpoint must be verified by a different agent.` }, { status: 409 }); }
          }
          await connection.query("INSERT INTO transport_production_trip_events (trip_id, step, user_id, outcome, notes) VALUES (?, ?, ?, ?, ?)", [productionTrip.id, step, session.userId, outcome, notes]);
          if (outcome === "flagged") await connection.query("UPDATE transport_production_trip_assignments SET status = 'on_hold' WHERE id = ?", [productionTrip.id]);
          else if (step === 3) await connection.query("UPDATE transport_production_trip_assignments SET status = 'completed', current_step = 4, completed_at = UTC_TIMESTAMP() WHERE id = ?", [productionTrip.id]);
          else await connection.query("UPDATE transport_production_trip_assignments SET status = 'in_transit', current_step = ? WHERE id = ?", [step + 1, productionTrip.id]);
          await connection.commit();
          try {
            const action = outcome === "flagged" ? "flagged" : "verified";
            await notifyAdminsOfAgentActivity(session.userId, `Checkpoint ${step} ${action}: ${parsed.code}`, `${session.name} ${action} checkpoint ${step} for ${parsed.code}.${notes ? ` Agent note: ${notes}` : ""}`);
          } catch (error) { console.error("Could not notify admins about an agent checkpoint:", error); }
          return NextResponse.json({ success: true, status: outcome === "flagged" ? "on_hold" : step === 3 ? "completed" : "in_transit", currentStep: outcome === "verified" ? step + 1 : step }, { headers: { "Cache-Control": "private, no-store" } });
        }
      }
      const tokenRows = parsed.token ? await connection.query("SELECT serial FROM transport_card_trip_tokens WHERE batch_id = ? AND public_token = ? LIMIT 1 FOR UPDATE", [parsed.batchId, parsed.token]) as Array<{ serial: number }> : [];
      const serial = parsed.serial ?? (tokenRows[0] ? Number(tokenRows[0].serial) : null);
      if (!serial) { await connection.rollback(); return NextResponse.json({ error: "This QR code is not valid." }, { status: 404 }); }
      let table: "transport_card_trip_assignments" | "transport_card_trips" = "transport_card_trip_assignments";
      let eventTable = "transport_card_assignment_events";
      let trips = await connection.query("SELECT id, status, current_step FROM transport_card_trip_assignments WHERE batch_id = ? AND serial = ? FOR UPDATE", [parsed.batchId, serial]) as Array<{ id: number; status: string; current_step: number }>;
      if (!trips[0]) {
        table = "transport_card_trips";
        eventTable = "transport_card_verification_events";
        trips = await connection.query("SELECT id, status, current_step FROM transport_card_trips WHERE batch_id = ? AND serial = ? FOR UPDATE", [parsed.batchId, serial]) as Array<{ id: number; status: string; current_step: number }>;
      }
      const trip = trips[0];
      if (!trip) { await connection.rollback(); return NextResponse.json({ error: "This card has not been assigned to a trip." }, { status: 404 }); }
      if (trip.status === "completed") { await connection.rollback(); return NextResponse.json({ error: "This trip has completed all three checkpoints. Its card cannot be reused." }, { status: 409 }); }
      if (trip.status === "on_hold") { await connection.rollback(); return NextResponse.json({ error: "This trip is on hold for admin review." }, { status: 409 }); }
      if (Number(trip.current_step) !== step) { await connection.rollback(); return NextResponse.json({ error: `Checkpoint ${trip.current_step} must be completed before checkpoint ${step}.` }, { status: 409 }); }
      if (outcome === "verified") {
        const previous = await connection.query(`SELECT step FROM ${eventTable} WHERE trip_id = ? AND user_id = ? AND outcome = 'verified' ORDER BY step LIMIT 1`, [trip.id, session.userId]) as Array<{ step: number }>;
        if (previous.length) { await connection.rollback(); return NextResponse.json({ error: `You already verified this card at checkpoint ${previous[0].step}. Every checkpoint must be verified by a different agent.` }, { status: 409 }); }
      }
      await connection.query(`INSERT INTO ${eventTable} (trip_id, step, user_id, outcome, notes) VALUES (?, ?, ?, ?, ?)`, [trip.id, step, session.userId, outcome, notes]);
      if (outcome === "flagged") await connection.query(`UPDATE ${table} SET status = 'on_hold' WHERE id = ?`, [trip.id]);
      else if (step === 3) await connection.query(`UPDATE ${table} SET status = 'completed', current_step = 4, completed_at = UTC_TIMESTAMP() WHERE id = ?`, [trip.id]);
      else await connection.query(`UPDATE ${table} SET status = 'in_transit', current_step = ? WHERE id = ?`, [step + 1, trip.id]);
      await connection.commit();
      try {
        const action = outcome === "flagged" ? "flagged" : "verified";
        await notifyAdminsOfAgentActivity(session.userId, `Checkpoint ${step} ${action}: ${parsed.code}`, `${session.name} ${action} checkpoint ${step} for ${parsed.code}.${notes ? ` Agent note: ${notes}` : ""}`);
      } catch (error) { console.error("Could not notify admins about an agent checkpoint:", error); }
      return NextResponse.json({ success: true, status: outcome === "flagged" ? "on_hold" : step === 3 ? "completed" : "in_transit", currentStep: outcome === "verified" ? step + 1 : step }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } catch (error) {
    console.error("Failed to record card checkpoint:", error);
    return NextResponse.json({ error: "The checkpoint could not be saved. Refresh and try again." }, { status: 503 });
  }
}
