import { NextResponse } from "next/server";
import { readVehicles, updateVehicleStatus } from "@/lib/server-store";
import type { Vehicle, VehicleStatus } from "@/lib/vehicles";
import { getAuthSession } from "@/lib/auth";
import { ensureDatabase, getPool } from "@/lib/db";

const allowedStatuses: VehicleStatus[] = ["Active", "Under review", "Suspended"];
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  try {
    const vehicle = (await readVehicles()).find((record) => record.id.toLowerCase() === id.toLowerCase());
    if (!vehicle) return NextResponse.json({ error: "Vehicle record not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    const { phone: _privatePhone, ...publicRecord } = vehicle;
    return NextResponse.json(publicRecord, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The vehicle registry is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const { id } = await params;
  let body: { status?: unknown };
  try { body = await request.json() as { status?: unknown }; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (Object.keys(body).length !== 1 || typeof body.status !== "string" || !allowedStatuses.includes(body.status as VehicleStatus)) {
    return NextResponse.json({ error: "Provide one valid vehicle status." }, { status: 400 });
  }
  try {
    const updated = await updateVehicleStatus(id, body.status as VehicleStatus);
    if (!updated) return NextResponse.json({ error: "Vehicle record not found." }, { status: 404 });
    return NextResponse.json(updated, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Vehicle status could not be updated." }, { status: 503 });
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const { id } = await params;
  let body: Partial<Vehicle>;
  try { body = await request.json() as Partial<Vehicle>; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const limits: [keyof Vehicle, number][] = [
    ["plate", 32], ["make", 80], ["model", 80], ["type", 80], ["operator", 120], ["phone", 40], ["route", 160],
  ];
  if (limits.some(([key, max]) => typeof body[key] !== "string" || !(body[key] as string).trim() || (body[key] as string).trim().length > max)) {
    return NextResponse.json({ error: "Complete all required vehicle and operator fields within the allowed lengths." }, { status: 400 });
  }
  const year = Number(body.year);
  if (!Number.isInteger(year) || year < 1980 || year > new Date().getFullYear() + 1) {
    return NextResponse.json({ error: "Enter a valid vehicle year." }, { status: 400 });
  }
  if (body.color !== undefined && (typeof body.color !== "string" || body.color.length > 80)) {
    return NextResponse.json({ error: "Vehicle colour must be 80 characters or fewer." }, { status: 400 });
  }
  if (body.status !== undefined && (typeof body.status !== "string" || !allowedStatuses.includes(body.status as VehicleStatus))) {
    return NextResponse.json({ error: "Choose a valid vehicle status." }, { status: 400 });
  }
  try {
    await ensureDatabase();
    await getPool().query(
      `UPDATE vehicles SET plate=?, make=?, model=?, year=?, type=?, color=?, operator=?, phone=?, route=?, status=? WHERE id=?`,
      [body.plate!.trim().toUpperCase().replace(/\s+/g, " "), body.make!.trim(), body.model!.trim(), year, body.type!.trim(), body.color?.trim() ?? "", body.operator!.trim(), body.phone!.trim(), body.route!.trim(), body.status ?? "Active", id],
    );
    const updated = (await readVehicles()).find((record) => record.id.toLowerCase() === id.toLowerCase());
    if (!updated) return NextResponse.json({ error: "Vehicle record not found." }, { status: 404 });
    return NextResponse.json(updated, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ER_DUP_ENTRY") {
      return NextResponse.json({ error: "A vehicle with this registration number already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Vehicle details could not be updated. Check the database connection and try again." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const { id } = await params;
  try {
    await ensureDatabase();
    const result = await getPool().query("DELETE FROM vehicles WHERE id = ?", [id]) as { affectedRows?: number };
    if (!result.affectedRows) return NextResponse.json({ error: "Vehicle record not found." }, { status: 404 });
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ER_ROW_IS_REFERENCED_2") {
      return NextResponse.json({ error: "This vehicle has a trip card assigned to it and cannot be deleted. Keep the record for its trip history." }, { status: 409 });
    }
    return NextResponse.json({ error: "Vehicle record could not be deleted. Check the database connection and try again." }, { status: 503 });
  }
}
