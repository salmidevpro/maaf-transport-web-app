import "server-only";

import { randomBytes } from "node:crypto";
import type { PoolConnection } from "mariadb";

const tokenAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateToken() {
  const bytes = randomBytes(8);
  let token = "";
  for (const byte of bytes) token += tokenAlphabet[byte & 31];
  return token;
}

export function generateCardTripToken() {
  return generateToken();
}

export async function ensureCardTripToken(connection: PoolConnection, batchId: number, serial: number) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const existing = await connection.query(
      "SELECT public_token FROM transport_card_trip_tokens WHERE batch_id = ? AND serial = ? LIMIT 1 FOR UPDATE",
      [batchId, serial],
    ) as Array<{ public_token: string }>;
    if (existing[0]) return existing[0].public_token;

    await connection.query(
      "INSERT IGNORE INTO transport_card_trip_tokens (batch_id, serial, public_token) VALUES (?, ?, ?)",
      [batchId, serial, generateToken()],
    );
  }
  throw new Error("A unique card token could not be generated. Retry the request.");
}
