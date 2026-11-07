import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { ensureDatabase, getPool } from "@/lib/db";
import { getTestSandbox, saveTestSandbox, testSandboxCardLimit, type TestCategory } from "@/lib/test-batch-sandbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function adminSession() {
  const session = await getAuthSession();
  if (!session) return { response: NextResponse.json({ error: "Sign in to manage the practice batch." }, { status: 401 }) };
  if (session.role !== "admin") return { response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) };
  return { session };
}

export async function GET() {
  const auth = await adminSession();
  if ("response" in auth) return auth.response;
  try {
    await ensureDatabase();
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const sandbox = await getTestSandbox(connection, { create: true });
      await connection.commit();
      return NextResponse.json(sandbox, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } catch (error) {
    console.error("Could not load practice batch:", error);
    return NextResponse.json({ error: "The practice batch could not be loaded." }, { status: 503 });
  }
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  const auth = await adminSession();
  if ("response" in auth) return auth.response;
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Enter a valid practice batch update." }, { status: 400 }); }

  const action = body.action;
  const sessionToken = cleanText(body.sessionToken, 12).toUpperCase();
  if (!/^[A-F0-9]{12}$/.test(sessionToken)) return NextResponse.json({ error: "This practice session has expired. Reload the practice batch." }, { status: 409 });

  try {
    await ensureDatabase();
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const sandbox = await getTestSandbox(connection);
      if (!sandbox || sandbox.sessionToken !== sessionToken) {
        await connection.commit();
        return NextResponse.json({ error: "This practice session has expired. Reload the practice batch to start a clean one." }, { status: 410 });
      }
      const categories = sandbox.data.categories;

      if (action === "add_category") {
        const vehicleClass = cleanText(body.vehicleClass, 60);
        const destination = cleanText(body.destination, 120);
        const allocated = Number(body.allocated);
        if (!vehicleClass || !destination || !Number.isSafeInteger(allocated) || allocated < 1) {
          await connection.rollback();
          return NextResponse.json({ error: "Enter a vehicle, destination, and a valid card quantity." }, { status: 400 });
        }
        const currentAllocated = categories.reduce((sum, item) => sum + item.allocated, 0);
        if (currentAllocated + allocated > testSandboxCardLimit) {
          await connection.rollback();
          return NextResponse.json({ error: "The practice batch is limited to 5,000 cards." }, { status: 400 });
        }
        if (categories.some((item) => item.vehicleClass.toLowerCase() === vehicleClass.toLowerCase() && item.destination.toLowerCase() === destination.toLowerCase())) {
          await connection.rollback();
          return NextResponse.json({ error: "That vehicle and destination are already in this practice batch." }, { status: 409 });
        }
        const category: TestCategory = { id: Math.max(0, ...categories.map((item) => item.id)) + 1, vehicleClass, destination, allocated, trips: [] };
        categories.push(category);
      } else if (action === "assign_trip") {
        const categoryId = Number(body.categoryId);
        const category = categories.find((item) => item.id === categoryId);
        const origin = cleanText(body.origin, 120);
        const goods = Array.isArray(body.goods) ? body.goods.map((item) => cleanText(item, 160)).filter(Boolean).slice(0, 20) : [];
        if (!category || !origin || goods.length === 0) {
          await connection.rollback();
          return NextResponse.json({ error: "Enter a departure point and at least one goods item." }, { status: 400 });
        }
        if (category.trips.length >= category.allocated) {
          await connection.rollback();
          return NextResponse.json({ error: "No practice cards remain in this category." }, { status: 409 });
        }
        const used = new Set(category.trips.map((trip) => trip.serial));
        let serial = 1;
        while (used.has(serial)) serial++;
        const id = Math.max(0, ...categories.flatMap((item) => item.trips.map((trip) => trip.id))) + 1;
        category.trips.push({ id, serial, code: `MAAF-TEST-${sandbox.sessionToken}-${id}`, origin, goods, status: "ready", current_step: 1, verifications: [], completed_at: null });
      } else if (action === "undo_trip") {
        const category = categories.find((item) => item.id === Number(body.categoryId));
        if (!category) { await connection.rollback(); return NextResponse.json({ error: "Practice category not found." }, { status: 404 }); }
        category.trips = category.trips.filter((trip) => trip.id !== Number(body.tripId));
      } else if (action === "delete_category") {
        const category = categories.find((item) => item.id === Number(body.categoryId));
        if (!category) { await connection.rollback(); return NextResponse.json({ error: "Practice category not found." }, { status: 404 }); }
        if (category.trips.length) { await connection.rollback(); return NextResponse.json({ error: "Undo its practice card assignments before removing this category." }, { status: 409 }); }
        sandbox.data.categories = categories.filter((item) => item.id !== category.id);
      } else {
        await connection.rollback();
        return NextResponse.json({ error: "Choose a valid practice batch action." }, { status: 400 });
      }

      if (!(await saveTestSandbox(connection, sandbox))) {
        await connection.rollback();
        return NextResponse.json({ error: "This practice session has expired. Reload the practice batch to start a clean one." }, { status: 410 });
      }
      await connection.commit();
      return NextResponse.json(sandbox, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } catch (error) {
    console.error("Could not update practice batch:", error);
    return NextResponse.json({ error: "The practice batch could not be updated." }, { status: 503 });
  }
}
