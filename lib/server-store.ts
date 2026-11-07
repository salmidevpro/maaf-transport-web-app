import { ensureDatabase, getPool, queryRows } from "@/lib/db";
import type { Vehicle } from "@/lib/vehicles";

type VehicleRow = Omit<Vehicle, "registeredAt" | "lastVerified"> & { registered_at: string; last_verified: string };

function fromRow(row: VehicleRow): Vehicle {
  const { registered_at, last_verified, ...fields } = row;
  return { ...fields, registeredAt: String(registered_at).slice(0, 10), lastVerified: last_verified };
}

export async function readVehicles(): Promise<Vehicle[]> {
  const rows = await queryRows<VehicleRow>(
    `SELECT id, plate, make, model, year, type, color, operator, phone, route, status,
      registered_at, last_verified FROM vehicles ORDER BY registered_at DESC, id DESC`,
  );
  return rows.map(fromRow);
}

export async function createVehicleRecord(vehicle: Vehicle) {
  await ensureDatabase();
  await getPool().query(
    `INSERT INTO vehicles (id, plate, make, model, year, type, color, operator, phone, route, status, registered_at, last_verified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [vehicle.id, vehicle.plate, vehicle.make, vehicle.model, vehicle.year, vehicle.type, vehicle.color, vehicle.operator, vehicle.phone, vehicle.route, vehicle.status, vehicle.registeredAt, vehicle.lastVerified],
  );
}

export async function updateVehicleStatus(id: string, status: Vehicle["status"]) {
  await queryRows<unknown>("UPDATE vehicles SET status=? WHERE id=?", [status, id]);
  const rows = await queryRows<VehicleRow>(
    `SELECT id, plate, make, model, year, type, color, operator, phone, route, status, registered_at, last_verified
     FROM vehicles WHERE id=? LIMIT 1`,
    [id],
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function recordVehicleVerification(lookup: string, userId: number) {
  await ensureDatabase();
  const normalizedId = lookup.trim().toUpperCase();
  const normalizedPlate = normalizedId.replace(/\s/g, "");
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const rows = await connection.query(
      `SELECT id, plate, make, model, year, type, color, operator, phone, route, status, registered_at, last_verified
       FROM vehicles WHERE UPPER(id)=? OR REPLACE(UPPER(plate), ' ', '')=? LIMIT 1 FOR UPDATE`,
      [normalizedId, normalizedPlate],
    ) as VehicleRow[];
    const vehicle = rows[0];
    if (!vehicle) { await connection.rollback(); return null; }
    const lastVerified = new Date().toISOString();
    await connection.query("UPDATE vehicles SET last_verified=? WHERE id=?", [lastVerified, vehicle.id]);
    await connection.query(
      "INSERT INTO vehicle_verification_events (vehicle_id, user_id, vehicle_status) VALUES (?, ?, ?)",
      [vehicle.id, userId, vehicle.status],
    );
    await connection.commit();
    return fromRow({ ...vehicle, last_verified: lastVerified });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
