import "server-only";
import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes } from "node:crypto";
import { getPool, hasAgentOriginLgaColumn, queryRows } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { getSiteUrl } from "@/lib/site-config";

export function hashNin(nin: string) {
  const secret = process.env.MAAF_NIN_HASH_SECRET;
  if (!secret || secret.length < 32) throw new Error("MAAF_NIN_HASH_SECRET must be set to a random secret of at least 32 characters.");
  return createHmac("sha256", secret).update(nin).digest("hex");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function ninEncryptionKey() {
  const secret = process.env.MAAF_NIN_ENCRYPTION_KEY;
  if (!secret) throw new Error("MAAF_NIN_ENCRYPTION_KEY is required to protect NIN records.");
  const key = Buffer.from(secret, "base64");
  if (key.length !== 32) throw new Error("MAAF_NIN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export function encryptNin(nin: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ninEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(nin, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptNin(value: string | null) {
  if (!value) return null;
  const [ivPart, tagPart, ciphertextPart] = value.split(".");
  if (!ivPart || !tagPart || !ciphertextPart) throw new Error("Stored NIN record could not be decrypted.");
  const decipher = createDecipheriv("aes-256-gcm", ninEncryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextPart, "base64url")), decipher.final()]).toString("utf8");
}

export async function lookupPreRegistration(nin: string) {
  return (await queryRows<{ id: number; first_name: string; last_name: string; other_names: string }>(
    `SELECT p.id, p.first_name, p.last_name, p.other_names
     FROM agent_preregistrations p
     LEFT JOIN agent_profiles ap ON ap.preregistration_id = p.id
     WHERE p.nin_hash = ? AND ap.user_id IS NULL LIMIT 1`,
    [hashNin(nin)],
  ))[0] ?? null;
}

function escapeHtml(value: string) {
  const escaped: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (character) => escaped[character]);
}

export async function sendAgentVerificationEmail(email: string, token: string, name: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const siteUrl = getSiteUrl();
  if (!apiKey || !from || !siteUrl) throw new Error("Email verification is not configured yet. Set RESEND_API_KEY, RESEND_FROM_EMAIL, and NEXT_PUBLIC_SITE_URL.");
  const verifyUrl = new URL("/agent/verify-email", siteUrl);
  verifyUrl.searchParams.set("token", token);
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(verifyUrl.toString());
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Action needed: verify your MAAF Agent email",
      text: `Hello ${name},\n\nYour MAAF Agent account is nearly ready. Confirm this email address to activate your account and sign in.\n\nVerify your email: ${verifyUrl.toString()}\n\nFor your security, this one-time link expires in 10 minutes. If it expires, return to MAAF and request a new verification email.\n\nIf you did not create a MAAF Agent account, you can ignore this email. No account access will be granted until the email is verified.\n\nMAAF Transport Control`,
      html: `<div style="margin:0;padding:36px 14px;background:#f3f6f9;font-family:Arial,Helvetica,sans-serif;color:#243b53">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e3e9ef;border-radius:14px;overflow:hidden">
          <tr><td style="padding:23px 32px;background:#142d49"><div style="font-size:23px;font-weight:800;letter-spacing:-.7px;color:#ffffff">maaf<span style="color:#f7b821">.</span></div><div style="margin-top:4px;font-size:9px;font-weight:700;letter-spacing:1.8px;color:#c6d2df">TRANSPORT CONTROL</div></td></tr>
          <tr><td style="padding:34px 32px 12px"><div style="display:inline-block;padding:7px 10px;border-radius:20px;background:#fff4d7;color:#896200;font-size:11px;font-weight:700;letter-spacing:.7px">AGENT ACCOUNT SETUP</div>
            <h1 style="margin:19px 0 11px;color:#142d49;font-size:28px;line-height:1.25">Verify your email address</h1>
            <p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:#304b66">Hello ${safeName},</p>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.75;color:#5e7185">Your MAAF Agent account is nearly ready. Confirm that this email address belongs to you to activate your account and sign in to the agent portal.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 23px"><tr><td bgcolor="#142d49" style="border-radius:8px"><a href="${safeUrl}" style="display:inline-block;padding:15px 23px;border:1px solid #142d49;border-radius:8px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none">Verify email address&nbsp; →</a></td></tr></table>
            <div style="margin:0 0 24px;padding:14px 16px;border:1px solid #f0dfad;border-radius:9px;background:#fffbef"><div style="font-size:13px;font-weight:700;color:#72591f">This link expires in 10 minutes</div><div style="margin-top:4px;font-size:12px;line-height:1.6;color:#796b49">It can only be used once. If it expires, return to MAAF and request a new verification email.</div></div>
            <p style="margin:0 0 7px;font-size:12px;font-weight:700;color:#53677d">If the button does not work, copy and paste this link:</p>
            <p style="margin:0 0 24px;overflow-wrap:anywhere;font-size:12px;line-height:1.6"><a href="${safeUrl}" style="color:#315f84;text-decoration:underline">${safeUrl}</a></p>
            <div style="height:1px;background:#e8edf2"></div>
            <p style="margin:20px 0 0;font-size:12px;line-height:1.7;color:#74869a"><strong style="color:#52677d">Didn’t request this?</strong> You can safely ignore this message. Your account will remain inactive until its email address is verified.</p>
          </td></tr>
          <tr><td style="padding:18px 32px 22px;background:#f8fafc;border-top:1px solid #e8edf2;color:#8291a0;font-size:11px;line-height:1.6">MAAF Transport Control<br/>This is an automated account security email. Please do not reply.</td></tr>
        </table>
      </div>`,
    }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Resend could not send the verification email (${response.status}): ${message.slice(0, 300)}`);
  }
}

export async function registerAgent(input: {
  nin: string; username: string; email: string; password: string; firstName: string; lastName: string; otherNames: string;
  phone: string; location: string; originState: string; originLga: string; country: string;
}) {
  const originLgaColumnExists = await hasAgentOriginLgaColumn();
  const pool = getPool();
  const connection = await pool.getConnection();
  const verifyToken = randomBytes(32).toString("base64url");
  try {
    await connection.beginTransaction();
    const registrations = await connection.query(
      `SELECT p.id, p.first_name, p.last_name, p.other_names
       FROM agent_preregistrations p LEFT JOIN agent_profiles ap ON ap.preregistration_id=p.id
       WHERE p.nin_hash=? AND ap.user_id IS NULL FOR UPDATE`, [hashNin(input.nin)],
    ) as Array<{ id: number; first_name: string; last_name: string; other_names: string }>;
    const prereg = registrations[0];
    if (!prereg) { await connection.rollback(); return { error: "We could not match that NIN to an available MAAF pre-registration." } as const; }
    const duplicates = await connection.query(
      `SELECT id FROM users WHERE email=? UNION SELECT user_id AS id FROM agent_profiles WHERE username=? LIMIT 1`,
      [input.email, input.username],
    ) as Array<{ id: number }>;
    if (duplicates.length) { await connection.rollback(); return { error: "That email or username is already in use." } as const; }
    const displayName = [prereg.first_name, prereg.other_names, prereg.last_name].filter(Boolean).join(" ");
    const hashedPassword = await hashPassword(input.password);
    const userResult = await connection.query(
      "INSERT INTO users (email, display_name, password_hash, role, active) VALUES (?, ?, ?, 'agent', 0)",
      [input.email, displayName, hashedPassword],
    ) as { insertId: number };
    if (originLgaColumnExists) {
      await connection.query(
        `INSERT INTO agent_profiles (user_id, preregistration_id, username, first_name, last_name, other_names, phone, location, origin_state, origin_lga, residence_state, country)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)`,
        [userResult.insertId, prereg.id, input.username, prereg.first_name, prereg.last_name, prereg.other_names, input.phone, input.location, input.originState, input.originLga, input.country],
      );
    } else {
      await connection.query(
        `INSERT INTO agent_profiles (user_id, preregistration_id, username, first_name, last_name, other_names, phone, location, origin_state, residence_state, country)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userResult.insertId, prereg.id, input.username, prereg.first_name, prereg.last_name, prereg.other_names, input.phone, input.location, input.originState, input.originLga, input.country],
      );
    }
    await connection.query(
      "INSERT INTO email_verification_tokens (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE))",
      [hashToken(verifyToken), userResult.insertId],
    );
    await sendAgentVerificationEmail(input.email, verifyToken, displayName);
    await connection.commit();
    return { ok: true } as const;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function resendAgentVerificationEmail(email: string) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const accounts = await connection.query(
      `SELECT u.id,u.display_name,u.active,p.email_verified_at
       FROM users u LEFT JOIN agent_profiles p ON p.user_id=u.id
       WHERE u.email=? AND u.role='agent' LIMIT 1 FOR UPDATE`,
      [email.trim().toLowerCase()],
    ) as Array<{ id: number; display_name: string; active: number; email_verified_at: string | Date | null }>;
    const account = accounts[0];
    if (!account) { await connection.commit(); return "not_found" as const; }
    if (account.email_verified_at) { await connection.commit(); return "already_verified" as const; }
    if (Number(account.active) === 1) { await connection.commit(); return "already_active" as const; }

    const tokenRows = await connection.query(
      "SELECT MAX(expires_at) >= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 9 MINUTE) AS sent_within_last_minute FROM email_verification_tokens WHERE user_id=?",
      [account.id],
    ) as Array<{ sent_within_last_minute: number | boolean | null }>;
    if (Number(tokenRows[0]?.sent_within_last_minute) === 1) { await connection.commit(); return "cooldown" as const; }

    const token = randomBytes(32).toString("base64url");
    await connection.query("DELETE FROM email_verification_tokens WHERE user_id=?", [account.id]);
    await connection.query(
      "INSERT INTO email_verification_tokens (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE))",
      [hashToken(token), account.id],
    );
    await sendAgentVerificationEmail(email.trim().toLowerCase(), token, account.display_name);
    await connection.commit();
    return "sent" as const;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function verifyAgentEmail(token: string) {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const rows = await connection.query(
      `SELECT t.user_id FROM email_verification_tokens t
       INNER JOIN users u ON u.id=t.user_id
       WHERE t.token_hash=? AND t.expires_at>UTC_TIMESTAMP() AND u.active=0 FOR UPDATE`,
      [hashToken(token)],
    ) as Array<{ user_id: number }>;
    const row = rows[0];
    if (!row) { await connection.rollback(); return false; }
    await connection.query("UPDATE users SET active=1 WHERE id=?", [row.user_id]);
    await connection.query("UPDATE agent_profiles SET email_verified_at=UTC_TIMESTAMP() WHERE user_id=?", [row.user_id]);
    await connection.query("DELETE FROM email_verification_tokens WHERE user_id=?", [row.user_id]);
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
