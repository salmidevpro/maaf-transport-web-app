import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import mariadb, { type Pool } from "mariadb";
import { hashPassword } from "@/lib/passwords";
import { seedVehicles, type Vehicle } from "@/lib/vehicles";
import { cardDestinations, cardVehicleClasses, cardsPerBatch } from "@/lib/card-batches";

declare global {
  // eslint-disable-next-line no-var
  var maafMariaDbPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var maafDatabaseReady: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var maafDatabaseSchemaVersion: number | undefined;
  // eslint-disable-next-line no-var
  var maafAgentOriginLgaColumnExists: boolean | undefined;
}

// Bump this when ensureTables gains migrations. This also makes Next.js
// development hot reload rerun migrations when its global readiness promise
// was created by an older version of this module.
const databaseSchemaVersion = 20;

function required(name: string, fallback?: string) {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`${name} is required to connect to MariaDB.`);
  return value;
}

export function getPool() {
  if (!globalThis.maafMariaDbPool) {
    globalThis.maafMariaDbPool = mariadb.createPool({
      host: required("MAAF_DB_HOST", "127.0.0.1"),
      port: Number(process.env.MAAF_DB_PORT || 3306),
      user: required("MAAF_DB_USER"),
      password: process.env.MAAF_DB_PASSWORD || "",
      database: required("MAAF_DB_NAME", "maaf_transport"),
      connectionLimit: Number(process.env.MAAF_DB_CONNECTION_LIMIT || 10),
      // Bound database waits so an unavailable or stalled MariaDB cannot leave
      // portal sign-in requests pending indefinitely.
      connectTimeout: 8_000,
      acquireTimeout: 10_000,
      queryTimeout: 15_000,
      charset: "utf8mb4",
      dateStrings: true,
    });
  }
  return globalThis.maafMariaDbPool;
}

async function ensureTables() {
  const pool = getPool();
  const schema = await readFile(path.join(process.cwd(), "database", "schema.sql"), "utf8");
  for (const statement of schema.split(";").map((part) => part.trim()).filter(Boolean)) await pool.query(statement);
  await pool.query(
    `INSERT IGNORE INTO admin_profiles (user_id, first_name)
     SELECT id, SUBSTRING_INDEX(TRIM(display_name), ' ', 1) FROM users WHERE role = 'admin'`,
  );
}

async function detectAgentOriginLgaColumn() {
  const pool = getPool();
  const rows = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_profiles' AND COLUMN_NAME = 'origin_lga'
     LIMIT 1`,
  ) as Array<{ 1: number }>;
  return rows.length > 0;
}

async function seedInitialRecords() {
  const pool = getPool();
  for (const vehicleClass of cardVehicleClasses) {
    for (const destination of cardDestinations) {
      await pool.query(
        `INSERT INTO transport_card_batches (vehicle_class, destination, allocated_quantity)
         VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE allocated_quantity = allocated_quantity`,
        [vehicleClass, destination, cardsPerBatch],
      );
    }
  }
  const batchSeedState = await pool.query("SELECT id FROM transport_production_batch_seed_state WHERE id = 1") as Array<{ id: number }>;
  if (!batchSeedState.length) {
    await pool.query(
      `INSERT IGNORE INTO transport_production_batches (id, batch_date)
       SELECT 1, COALESCE((SELECT MIN(DATE(created_at)) FROM transport_card_batches), UTC_DATE())
       WHERE NOT EXISTS (SELECT 1 FROM transport_production_batches)`,
    );
    await pool.query(
      `INSERT IGNORE INTO transport_production_categories
        (production_batch_id, legacy_batch_id, vehicle_class, destination, allocated_quantity, fare_ngn)
       SELECT 1, id, vehicle_class, destination, allocated_quantity, fare_ngn
       FROM transport_card_batches WHERE EXISTS (SELECT 1 FROM transport_production_batches WHERE id = 1)`,
    );
    await pool.query("INSERT IGNORE INTO transport_production_batch_seed_state (id) VALUES (1)");
  }
  const [vehicleCount] = await pool.query("SELECT COUNT(*) AS count FROM vehicles") as [{ count: number }];
  if (Number(vehicleCount.count) === 0 && process.env.NODE_ENV === "development") {
    let vehiclesToMigrate = seedVehicles;
    try {
      const legacy = JSON.parse(await readFile(path.join(process.cwd(), ".data", "vehicles.json"), "utf8")) as Vehicle[];
      if (Array.isArray(legacy) && legacy.every((vehicle) => vehicle.id && vehicle.plate && vehicle.operator)) vehiclesToMigrate = legacy;
    } catch {
      // Fresh installs use the sample registry; an absent legacy file is expected.
    }
    for (const vehicle of vehiclesToMigrate) await insertVehicle(vehicle);
  }

  const developmentDefaults = process.env.NODE_ENV === "development";
  const accounts = [
    {
      role: "admin",
      email: process.env.MAAF_BOOTSTRAP_ADMIN_EMAIL || (developmentDefaults ? "admin@maaf.local" : ""),
      password: process.env.MAAF_BOOTSTRAP_ADMIN_PASSWORD || (developmentDefaults ? "Admin123!" : ""),
      name: process.env.MAAF_BOOTSTRAP_ADMIN_NAME || "MAAF Administrator",
    },
    {
      role: "agent",
      email: process.env.MAAF_BOOTSTRAP_AGENT_EMAIL || (developmentDefaults ? "agent@maaf.local" : ""),
      password: process.env.MAAF_BOOTSTRAP_AGENT_PASSWORD || (developmentDefaults ? "Agent123!" : ""),
      name: process.env.MAAF_BOOTSTRAP_AGENT_NAME || "MAAF Agent",
    },
  ] as const;
  for (const account of accounts) {
    if (!account.email || !account.password) continue;
    const [existing] = await pool.query("SELECT id FROM users WHERE role = ? LIMIT 1", [account.role]) as Array<{ id: number }>;
    if (!existing) {
      const [firstName = "", lastName = "", ...surnameParts] = account.name.trim().split(/\s+/);
      const result = await pool.query(
        "INSERT INTO users (email, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
        [account.email.trim().toLowerCase(), account.name, await hashPassword(account.password), account.role],
      ) as { insertId: number };
      if (account.role === "admin") {
        await pool.query("INSERT INTO admin_profiles (user_id, first_name, last_name, surname) VALUES (?, ?, ?, ?)", [result.insertId, firstName, lastName, surnameParts.join(" ")]);
      }
    }
  }
}

export async function ensureDatabase() {
  if (!globalThis.maafDatabaseReady || globalThis.maafDatabaseSchemaVersion !== databaseSchemaVersion) {
    globalThis.maafDatabaseSchemaVersion = databaseSchemaVersion;
    globalThis.maafDatabaseReady = (async () => {
      await ensureTables();
      // Some production database users have no ALTER privilege. Detect the
      // optional column and use the legacy residence_state field as a fallback.
      globalThis.maafAgentOriginLgaColumnExists = await detectAgentOriginLgaColumn();
      await seedInitialRecords();
    })().catch((error) => {
      if (globalThis.maafDatabaseSchemaVersion === databaseSchemaVersion) {
        globalThis.maafDatabaseReady = undefined;
        globalThis.maafDatabaseSchemaVersion = undefined;
      }
      throw error;
    });
  }
  return globalThis.maafDatabaseReady;
}

export async function hasAgentOriginLgaColumn() {
  await ensureDatabase();
  return globalThis.maafAgentOriginLgaColumnExists === true;
}

export type DbUser = { id: number; email: string; display_name: string; password_hash: string; role: "admin" | "agent"; active: number };

export async function queryRows<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  await ensureDatabase();
  return getPool().query(sql, values) as Promise<T[]>;
}

export async function insertVehicle(vehicle: Vehicle) {
  await getPool().query(
    `INSERT INTO vehicles (id, plate, make, model, year, type, color, operator, phone, route, status, registered_at, last_verified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE plate=VALUES(plate), make=VALUES(make), model=VALUES(model), year=VALUES(year),
     type=VALUES(type), color=VALUES(color), operator=VALUES(operator), phone=VALUES(phone), route=VALUES(route),
     status=VALUES(status), registered_at=VALUES(registered_at), last_verified=VALUES(last_verified)`,
    [vehicle.id, vehicle.plate, vehicle.make, vehicle.model, vehicle.year, vehicle.type, vehicle.color, vehicle.operator, vehicle.phone, vehicle.route, vehicle.status, vehicle.registeredAt, vehicle.lastVerified],
  );
}
