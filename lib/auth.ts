import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { ensureDatabase, getPool, queryRows } from "@/lib/db";
import { verifyPassword } from "@/lib/passwords";

export type PortalRole = "admin" | "agent";
export type AuthSession = { userId: number; role: PortalRole; email: string; name: string; firstName: string; lastName: string; surname: string; mustChangePassword: boolean; expiresAt: number };
export const SESSION_COOKIE = "maaf_session";
export const sessionMaxAge = 60 * 15;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export function getPortalCredentials(role: PortalRole) {
  if (process.env.NODE_ENV !== "development") return null;
  return role === "admin"
    ? { email: "admin@maaf.local", password: "Admin123!", demo: true }
    : { email: "agent@maaf.local", password: "Agent123!", demo: true };
}

export async function authenticatePortalAccount(email: string, password: string, role: PortalRole) {
  const rows = await queryRows<{ id: number; email: string; display_name: string; password_hash: string; role: PortalRole; active: number; first_name: string | null }>(
    `SELECT u.id, u.email, u.display_name, u.password_hash, u.role, u.active, p.first_name
     FROM users u LEFT JOIN admin_profiles p ON p.user_id = u.id
     LEFT JOIN admin_account_preferences ap ON ap.user_id = u.id
     LEFT JOIN admin_account_status aas ON aas.user_id = u.id
     LEFT JOIN agent_account_status ags ON ags.user_id = u.id
     WHERE (u.email = ? OR (u.role = 'admin' AND ap.username = ?)) AND u.role = ?
       AND u.active = 1
       AND (u.role <> 'admin' OR COALESCE(aas.status, 'active') = 'active')
       AND (u.role <> 'agent' OR COALESCE(ags.status, 'active') = 'active') LIMIT 1`,
    [email.trim().toLowerCase(), email.trim().toLowerCase(), role],
  );
  const account = rows[0];
  if (!account || !account.active || !(await verifyPassword(password, account.password_hash))) return null;
  return { ...account, mustChangePassword: role === "admin" && Boolean(account.first_name?.trim()) && await verifyPassword(account.first_name!.trim(), account.password_hash) };
}

export async function createAuthSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  await queryRows(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${sessionMaxAge} SECOND))`,
    [tokenHash(token), userId],
  );
  return { token };
}

export async function revokeAuthSession(token: string | undefined) {
  if (!token) return;
  await queryRows("DELETE FROM sessions WHERE token_hash = ?", [tokenHash(token)]);
}

export async function refreshAuthSession(token: string) {
  await ensureDatabase();
  const result = await getPool().query(
    `UPDATE sessions SET expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${sessionMaxAge} SECOND)
     WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()`,
    [tokenHash(token)],
  ) as { affectedRows?: number };
  return Boolean(result.affectedRows);
}

export async function isExpiredAuthSession(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const rows = await queryRows<{ expired: number }>(
    "SELECT expires_at <= UTC_TIMESTAMP() AS expired FROM sessions WHERE token_hash = ? LIMIT 1",
    [tokenHash(token)],
  );
  if (!rows[0]?.expired) return false;
  await revokeAuthSession(token);
  return true;
}

export async function getAuthSession(): Promise<AuthSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await queryRows<{ user_id: number; email: string; display_name: string; password_hash: string; first_name: string | null; last_name: string | null; surname: string | null; role: PortalRole; admin_status: string | null; agent_status: string | null; expires_at: string | Date }>(
    `SELECT u.id AS user_id, u.email, u.display_name, u.password_hash, p.first_name, p.last_name, p.surname, u.role,
       COALESCE(aas.status,'active') AS admin_status, COALESCE(ags.status,'active') AS agent_status, s.expires_at
     FROM sessions s INNER JOIN users u ON u.id = s.user_id
     LEFT JOIN admin_profiles p ON p.user_id = u.id
     LEFT JOIN admin_account_status aas ON aas.user_id = u.id
     LEFT JOIN agent_account_status ags ON ags.user_id = u.id
     WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP() AND u.active = 1 LIMIT 1`,
    [tokenHash(token)],
  );
  const session = rows[0];
  if (!session) return null;
  if ((session.role === "admin" && session.admin_status !== "active") || (session.role === "agent" && session.agent_status !== "active")) {
    await revokeAuthSession(token);
    return null;
  }
  const expiresAt = session.expires_at instanceof Date
    ? session.expires_at.getTime()
    : new Date(`${session.expires_at.replace(" ", "T")}Z`).getTime();
  const firstName = session.first_name?.trim() || session.display_name.trim().split(/\s+/)[0] || "Admin";
  return {
    userId: session.user_id,
    role: session.role,
    email: session.email,
    name: session.role === "admin" ? firstName : session.display_name,
    firstName,
    lastName: session.last_name?.trim() || "",
    surname: session.surname?.trim() || "",
    mustChangePassword: session.role === "admin" && Boolean(session.first_name?.trim()) && await verifyPassword(session.first_name!.trim(), session.password_hash),
    expiresAt,
  };
}
