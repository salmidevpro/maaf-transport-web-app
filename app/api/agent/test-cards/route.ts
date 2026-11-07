import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { ensureDatabase, getPool } from "@/lib/db";
import { getTestSandbox, parseTestTripCode, saveTestSandbox } from "@/lib/test-batch-sandbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function agentSession() {
  const session = await getAuthSession();
  if (!session) return { response: NextResponse.json({ error: "Sign in to the Agent Portal to view this practice trip." }, { status: 401 }) };
  if (session.role !== "agent") return { response: NextResponse.json({ error: "Agent access required." }, { status: 403 }) };
  return { session };
}

export async function GET(request: Request) {
  const auth = await agentSession();
  if ("response" in auth) return auth.response;
  const parsed = parseTestTripCode(new URL(request.url).searchParams.get("code") || "");
  if (!parsed) return NextResponse.json({ error: "That is not a valid MAAF practice trip card." }, { status: 404 });
  try {
    await ensureDatabase();
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const sandbox = await getTestSandbox(connection);
      if (!sandbox) {
        await connection.commit();
        return NextResponse.json({ error: "This test card expired when its 10-minute practice session ended. The sandbox has been cleared." }, { status: 410 });
      }
      if (sandbox.sessionToken !== parsed.sessionToken) {
        await connection.commit();
        return NextResponse.json({ error: "This test card belongs to an expired practice session. Start a new test batch." }, { status: 410 });
      }
      const category = sandbox.data.categories.flatMap((item) => item.trips.map((trip) => ({ category: item, trip }))).find(({ trip }) => trip.id === parsed.id);
      if (!category) {
        await connection.commit();
        return NextResponse.json({ error: "This practice card is not assigned in the active test batch." }, { status: 404 });
      }
      const { category: group, trip } = category;
      await connection.commit();
      return NextResponse.json({
        id: -trip.id,
        source: "test",
        code: trip.code,
        batch_id: 0,
        serial: trip.serial,
        vehicle_class: group.vehicleClass,
        origin: trip.origin,
        destination: group.destination,
        status: trip.status,
        current_step: trip.current_step,
        items: trip.goods.map((description) => ({ description })),
        verifications: trip.verifications.map(({ step, agent_name, outcome, notes, checked_at }) => ({ step, agent_name, outcome, notes, checked_at })),
        currentAgentVerifiedStep: trip.verifications.find((event) => event.agent_id === auth.session.userId && event.outcome === "verified")?.step ?? null,
      }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } catch (error) {
    console.error("Failed to load practice card:", error);
    return NextResponse.json({ error: "The practice trip could not be loaded." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await agentSession();
  if ("response" in auth) return auth.response;
  let body: { code?: unknown; step?: unknown; outcome?: unknown; notes?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Enter a valid practice checkpoint result." }, { status: 400 }); }
  const parsed = typeof body.code === "string" ? parseTestTripCode(body.code) : null;
  const step = Number(body.step);
  const outcome = body.outcome;
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : "";
  if (!parsed || !Number.isInteger(step) || step < 1 || step > 3 || (outcome !== "verified" && outcome !== "flagged")) {
    return NextResponse.json({ error: "Choose a valid practice checkpoint result." }, { status: 400 });
  }
  if (outcome === "flagged" && !notes) return NextResponse.json({ error: "Add a short note explaining the discrepancy." }, { status: 400 });

  try {
    await ensureDatabase();
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const sandbox = await getTestSandbox(connection);
      if (!sandbox) {
        await connection.commit();
        return NextResponse.json({ error: "This test card expired when its 10-minute practice session ended. The sandbox has been cleared." }, { status: 410 });
      }
      if (sandbox.sessionToken !== parsed.sessionToken) {
        await connection.commit();
        return NextResponse.json({ error: "This test card belongs to an expired practice session. Start a new test batch." }, { status: 410 });
      }
      const found = sandbox.data.categories.flatMap((category) => category.trips.map((trip) => ({ category, trip }))).find(({ trip }) => trip.id === parsed.id);
      if (!found) {
        await connection.commit();
        return NextResponse.json({ error: "This practice card is not assigned in the active test batch." }, { status: 404 });
      }
      const { trip } = found;
      if (trip.status === "completed") { await connection.rollback(); return NextResponse.json({ error: "This practice trip completed all three checkpoints." }, { status: 409 }); }
      if (trip.status === "on_hold") { await connection.rollback(); return NextResponse.json({ error: "This practice trip is on hold." }, { status: 409 }); }
      if (trip.current_step !== step) { await connection.rollback(); return NextResponse.json({ error: `Checkpoint ${trip.current_step} must be completed before checkpoint ${step}.` }, { status: 409 }); }
      if (outcome === "verified") {
        const previous = trip.verifications.find((event) => event.agent_id === auth.session.userId && event.outcome === "verified");
        if (previous) { await connection.rollback(); return NextResponse.json({ error: `You already verified this card at checkpoint ${previous.step}. Every checkpoint must be verified by a different agent.` }, { status: 409 }); }
      }
      const checkedAt = new Date().toISOString();
      trip.verifications.push({ step, agent_id: auth.session.userId, agent_name: auth.session.name, outcome, notes, checked_at: checkedAt });
      sandbox.data.notifications.push({
        id: Math.max(0, ...sandbox.data.notifications.map((notification) => notification.id)) + 1,
        agent_id: auth.session.userId,
        agent_name: auth.session.name,
        agent_email: auth.session.email,
        title: `Practice checkpoint ${outcome}`,
        message: `${auth.session.name} ${outcome} checkpoint ${step} for ${trip.code} in the test batch.${notes ? ` Agent note: ${notes}` : ""}`,
        created_at: checkedAt,
        read_by: [],
      });
      if (outcome === "flagged") trip.status = "on_hold";
      else if (step === 3) { trip.status = "completed"; trip.current_step = 4; trip.completed_at = new Date().toISOString(); }
      else { trip.status = "in_transit"; trip.current_step = step + 1; }
      if (!(await saveTestSandbox(connection, sandbox))) {
        await connection.rollback();
        return NextResponse.json({ error: "This test card expired when its 10-minute practice session ended. The sandbox has been cleared." }, { status: 410 });
      }
      await connection.commit();
      return NextResponse.json({ success: true, status: trip.status, currentStep: outcome === "verified" ? step + 1 : step }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } catch (error) {
    console.error("Failed to record practice checkpoint:", error);
    return NextResponse.json({ error: "The practice checkpoint could not be saved." }, { status: 503 });
  }
}
