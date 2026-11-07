import "server-only";
import { randomBytes } from "node:crypto";

export const testSandboxLifetimeMinutes = 10;
export const testSandboxCardLimit = 5000;

export type TestTripEvent = {
  step: number;
  agent_id: number;
  agent_name: string;
  outcome: "verified" | "flagged";
  notes: string;
  checked_at: string;
};
export type TestSandboxNotification = {
  id: number;
  agent_id: number;
  agent_name: string;
  agent_email: string;
  title: string;
  message: string;
  created_at: string;
  read_by: number[];
};
export type TestTrip = {
  id: number;
  serial: number;
  code: string;
  origin: string;
  goods: string[];
  status: "ready" | "in_transit" | "on_hold" | "completed";
  current_step: number;
  verifications: TestTripEvent[];
  completed_at: string | null;
};
export type TestCategory = {
  id: number;
  vehicleClass: string;
  destination: string;
  allocated: number;
  trips: TestTrip[];
};
export type TestSandboxData = { categories: TestCategory[]; notifications: TestSandboxNotification[] };
export type TestSandbox = { sessionToken: string; expiresAt: string; data: TestSandboxData };

export function parseTestTripCode(value: string) {
  const match = /^MAAF-TEST-([A-F0-9]{12})-(\d{1,10})$/i.exec(value.trim());
  if (!match) return null;
  const id = Number(match[2]);
  return Number.isSafeInteger(id) && id > 0 ? { sessionToken: match[1].toUpperCase(), id } : null;
}

type DbConnection = {
  query(sql: string, values?: unknown[]): Promise<unknown>;
};

const emptyData = (): TestSandboxData => ({
  categories: [{ id: 1, vehicleClass: "Cars", destination: "Oyo", allocated: 10, trips: [] }],
  notifications: [],
});

export async function getTestSandbox(connection: DbConnection, options: { create?: boolean } = {}): Promise<TestSandbox | null> {
  const rows = await connection.query(
    `SELECT session_token AS sessionToken,
       DATE_FORMAT(expires_at, '%Y-%m-%dT%H:%i:%s.000Z') AS expiresAt,
       data_json AS dataJson, (expires_at <= UTC_TIMESTAMP()) AS expired
     FROM transport_test_sandboxes WHERE id = 1 LIMIT 1 FOR UPDATE`,
  ) as Array<{ sessionToken: string; expiresAt: string; dataJson: string; expired: number | boolean }>;
  const row = rows[0];
  if (row?.expired) {
    await connection.query("DELETE FROM transport_test_sandboxes WHERE id = 1");
  } else if (row) {
    try {
      const data = JSON.parse(row.dataJson) as TestSandboxData;
      if (data && Array.isArray(data.categories)) {
        if (!Array.isArray(data.notifications)) data.notifications = [];
        return { sessionToken: row.sessionToken, expiresAt: row.expiresAt, data };
      }
    } catch {
      // Corrupt sandbox data is removed instead of leaking into a new session.
    }
    await connection.query("DELETE FROM transport_test_sandboxes WHERE id = 1");
  }
  if (!options.create) return null;

  const sessionToken = randomBytes(6).toString("hex").toUpperCase();
  const data = emptyData();
  await connection.query(
    `INSERT INTO transport_test_sandboxes (id, session_token, expires_at, data_json)
     VALUES (1, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${testSandboxLifetimeMinutes} MINUTE), ?)`,
    [sessionToken, JSON.stringify(data)],
  );
  const created = await connection.query(
    "SELECT DATE_FORMAT(expires_at, '%Y-%m-%dT%H:%i:%s.000Z') AS expiresAt FROM transport_test_sandboxes WHERE id = 1",
  ) as Array<{ expiresAt: string }>;
  return { sessionToken, expiresAt: created[0]?.expiresAt ?? new Date(Date.now() + testSandboxLifetimeMinutes * 60_000).toISOString(), data };
}

export async function saveTestSandbox(connection: DbConnection, sandbox: TestSandbox) {
  const result = await connection.query(
    `UPDATE transport_test_sandboxes SET data_json = ?
     WHERE id = 1 AND session_token = ? AND expires_at > UTC_TIMESTAMP()`,
    [JSON.stringify(sandbox.data), sandbox.sessionToken],
  ) as { affectedRows?: number };
  return Boolean(result.affectedRows);
}
