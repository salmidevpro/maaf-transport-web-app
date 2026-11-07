import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { createVehicleRecord, readVehicles } from "@/lib/server-store";
import type { Vehicle, VehicleStatus } from "@/lib/vehicles";

const allowedStatuses: VehicleStatus[] = ["Active", "Under review", "Suspended"];
const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    return NextResponse.json(await readVehicles(), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "The vehicle registry is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  let body: Partial<Vehicle>;
  try { body = await request.json() as Partial<Vehicle>; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }

  const limits: [keyof Vehicle, number][] = [
    ["plate", 32], ["make", 80], ["model", 80], ["type", 80], ["operator", 120], ["phone", 40], ["route", 160],
  ];
  if (limits.some(([key, max]) => !text(body[key], max))) {
    return NextResponse.json({ error: "Complete all required vehicle and operator fields within the allowed lengths." }, { status: 400 });
  }

  const currentYear = new Date().getFullYear();
  const year = Number(body.year);
  if (!Number.isInteger(year) || year < 1980 || year > currentYear + 1) {
    return NextResponse.json({ error: "Enter a valid vehicle year." }, { status: 400 });
  }
  if (body.color !== undefined && (typeof body.color !== "string" || body.color.length > 80)) {
    return NextResponse.json({ error: "Vehicle colour must be 80 characters or fewer." }, { status: 400 });
  }
  if (body.status !== undefined && !allowedStatuses.includes(body.status)) {
    return NextResponse.json({ error: "Choose a valid vehicle status." }, { status: 400 });
  }

  const vehicle: Vehicle = {
    id: `MAAF-${randomUUID().slice(0, 8).toUpperCase()}`,
    plate: body.plate!.trim().toUpperCase().replace(/\s+/g, " "),
    make: body.make!.trim(), model: body.model!.trim(), year,
    type: body.type!.trim(), color: body.color?.trim() ?? "", operator: body.operator!.trim(),
    phone: body.phone!.trim(), route: body.route!.trim(), status: body.status ?? "Active",
    registeredAt: new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date()),
    lastVerified: "Not verified yet",
  };

  try {
    await createVehicleRecord(vehicle);
    return NextResponse.json(vehicle, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ER_DUP_ENTRY") {
      return NextResponse.json({ error: "A vehicle with this registration number already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "The vehicle could not be saved. Check the database connection and try again." }, { status: 503 });
  }
}
