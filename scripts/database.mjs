import mariadb from "mariadb";
import nextEnv from "@next/env";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { scrypt as scryptCallback, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const root = process.cwd();
nextEnv.loadEnvConfig(root);
function pool() {
  if (!process.env.MAAF_DB_USER) throw new Error("Set MAAF_DB_USER in .env.local first.");
  return mariadb.createPool({
    host: process.env.MAAF_DB_HOST || "127.0.0.1",
    port: Number(process.env.MAAF_DB_PORT || 3306),
    user: process.env.MAAF_DB_USER,
    password: process.env.MAAF_DB_PASSWORD || "",
    database: process.env.MAAF_DB_NAME || "maaf_transport",
    connectionLimit: 3,
    charset: "utf8mb4",
  });
}

async function createSchema(connection) {
  const schema = await readFile(path.join(root, "database", "schema.sql"), "utf8");
  for (const statement of schema.split(";").map((part) => part.trim()).filter(Boolean)) await connection.query(statement);
}

async function readHiddenPassword() {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const value = await rl.question("Password: ");
    rl.close();
    return value;
  }
  process.stdout.write("Password: ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return await new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.removeListener("data", onData); process.stdout.write("\n"); };
    const onData = (chunk) => {
      const key = chunk.toString("utf8");
      if (key === "\r" || key === "\n") { cleanup(); resolve(value); }
      else if (key === "\u0003") { cleanup(); reject(new Error("Cancelled.")); }
      else if (key === "\u007f" || key === "\b") value = value.slice(0, -1);
      else if (!key.startsWith("\u001b")) value += key;
    };
    process.stdin.on("data", onData);
  });
}

async function makeHash(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

const command = process.argv[2];
const db = pool();
try {
  const connection = await db.getConnection();
  try {
    await createSchema(connection);
    if (command === "setup") {
      console.log("MAAF database tables are ready.");
      const vehicleClasses = ["Cars", "Jeep", "Bus"];
      const destinations = ["Oyo", "Olorunda", "Target", "Jimba"];
      for (const vehicleClass of vehicleClasses) {
        for (const destination of destinations) {
          await connection.query(
            `INSERT INTO transport_card_batches (vehicle_class, destination, allocated_quantity)
             VALUES (?, ?, 250) ON DUPLICATE KEY UPDATE allocated_quantity = allocated_quantity`,
            [vehicleClass, destination],
          );
        }
      }
      console.log("The 12 starter card allocations are ready.");
      const [{ count: vehicleCount }] = await connection.query("SELECT COUNT(*) AS count FROM vehicles");
      if (Number(vehicleCount) === 0) {
        try {
          const legacy = JSON.parse(await readFile(path.join(root, ".data", "vehicles.json"), "utf8"));
          if (Array.isArray(legacy)) {
            for (const vehicle of legacy) {
              await connection.query(
                `INSERT INTO vehicles (id, plate, make, model, year, type, color, operator, phone, route, status, registered_at, last_verified)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE plate=VALUES(plate), make=VALUES(make), model=VALUES(model), year=VALUES(year),
                 type=VALUES(type), color=VALUES(color), operator=VALUES(operator), phone=VALUES(phone), route=VALUES(route),
                 status=VALUES(status), registered_at=VALUES(registered_at), last_verified=VALUES(last_verified)`,
                [vehicle.id, vehicle.plate, vehicle.make, vehicle.model, vehicle.year, vehicle.type, vehicle.color || "", vehicle.operator, vehicle.phone, vehicle.route, vehicle.status, vehicle.registeredAt, vehicle.lastVerified],
              );
            }
            console.log(`Migrated ${legacy.length} existing vehicle records.`);
          }
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      for (const role of ["admin", "agent"]) {
        const prefix = role === "admin" ? "MAAF_BOOTSTRAP_ADMIN" : "MAAF_BOOTSTRAP_AGENT";
        const email = process.env[`${prefix}_EMAIL`];
        const password = process.env[`${prefix}_PASSWORD`];
        if (!email || !password) continue;
        const rows = await connection.query("SELECT id FROM users WHERE role = ? LIMIT 1", [role]);
        if (!rows.length) {
          const name = process.env[`${prefix}_NAME`] || (role === "admin" ? "MAAF Administrator" : "MAAF Agent");
          await connection.query("INSERT INTO users (email, display_name, password_hash, role) VALUES (?, ?, ?, ?)", [email.trim().toLowerCase(), name, await makeHash(password), role]);
          console.log(`Created the initial ${role} account: ${email}`);
        }
      }
    } else if (command === "user:create") {
      const args = Object.fromEntries(process.argv.slice(3).map((arg) => {
        const match = arg.match(/^--([^=]+)=(.*)$/);
        return match ? [match[1], match[2]] : [arg.replace(/^--/, ""), "true"];
      }));
      const role = args.role;
      const email = args.email?.trim().toLowerCase();
      const name = args.name || email?.split("@")[0];
      if (!["admin", "agent"].includes(role) || !email || !name) throw new Error("Usage: npm run user:create -- --role=agent --email=name@example.com --name=Name");
      const password = process.env.MAAF_NEW_USER_PASSWORD || await readHiddenPassword();
      if (password.length < 10) throw new Error("Use a password with at least 10 characters.");
      await connection.query("INSERT INTO users (email, display_name, password_hash, role) VALUES (?, ?, ?, ?)", [email, name, await makeHash(password), role]);
      console.log(`Created ${role} account ${email}.`);
    } else {
      throw new Error("Choose setup or user:create.");
    }
  } finally { connection.release(); }
} finally { await db.end(); }
