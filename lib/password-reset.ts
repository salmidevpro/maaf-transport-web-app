import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { ensureDatabase, getPool } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { getSiteUrl } from "@/lib/site-config";

export type PasswordResetRole = "admin" | "agent";

const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");
const genericResponse = "If an active account matches that email, password reset instructions will be sent shortly. Check your inbox and spam folder.";

function escapeHtml(value: string) {
  const escaped: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (character) => escaped[character]);
}

async function sendPasswordResetEmail(email: string, name: string, token: string, role: PasswordResetRole) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const siteUrl = getSiteUrl();
  if (!apiKey || !from || !siteUrl) throw new Error("Password reset email is not configured. Set RESEND_API_KEY, RESEND_FROM_EMAIL, and MAAF_SITE_URL (or NEXT_PUBLIC_SITE_URL).");

  const resetUrl = new URL(`/${role}/reset-password`, siteUrl);
  resetUrl.searchParams.set("token", token);
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(resetUrl.toString());
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Reset your MAAF portal password",
      text: `Hello ${name},\n\nWe received a request to reset your MAAF ${role} portal password. Use this one-time link within 30 minutes:\n\n${resetUrl.toString()}\n\nIf you did not request this change, ignore this email. Your password will remain unchanged.\n\nMAAF Transport Control`,
      html: `<div style="margin:0;padding:36px 14px;background:#f3f6f9;font-family:Arial,Helvetica,sans-serif;color:#243b53"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e3e9ef;border-radius:14px;overflow:hidden"><tr><td style="padding:23px 32px;background:#142d49"><div style="font-size:23px;font-weight:800;color:#fff">maaf<span style="color:#f7b821">.</span></div><div style="margin-top:4px;font-size:9px;font-weight:700;letter-spacing:1.8px;color:#c6d2df">TRANSPORT CONTROL</div></td></tr><tr><td style="padding:34px 32px"><div style="display:inline-block;padding:7px 10px;border-radius:20px;background:#fff4d7;color:#896200;font-size:11px;font-weight:700;letter-spacing:.7px">ACCOUNT SECURITY</div><h1 style="margin:19px 0 11px;color:#142d49;font-size:26px;line-height:1.25">Reset your password</h1><p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#304b66">Hello ${safeName},</p><p style="margin:0 0 23px;font-size:14px;line-height:1.75;color:#5e7185">We received a request to reset the password for your MAAF ${role} portal account. Use the secure link below within 30 minutes. It can only be used once.</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px"><tr><td bgcolor="#142d49" style="border-radius:8px"><a href="${safeUrl}" style="display:inline-block;padding:14px 22px;border:1px solid #142d49;border-radius:8px;color:#fff;font-size:15px;font-weight:700;text-decoration:none">Choose a new password&nbsp; →</a></td></tr></table><p style="margin:0 0 7px;font-size:12px;font-weight:700;color:#53677d">If the button does not work, copy and paste this link:</p><p style="margin:0 0 22px;overflow-wrap:anywhere;font-size:12px;line-height:1.6"><a href="${safeUrl}" style="color:#315f84;text-decoration:underline">${safeUrl}</a></p><div style="padding:13px 15px;border:1px solid #e8edf2;border-radius:8px;background:#f8fafc;color:#65798d;font-size:12px;line-height:1.65">If you did not request a password reset, ignore this message. Your password will remain unchanged.</div></td></tr><tr><td style="padding:18px 32px 22px;background:#f8fafc;border-top:1px solid #e8edf2;color:#8291a0;font-size:11px;line-height:1.6">MAAF Transport Control<br/>Automated account security email</td></tr></table></div>`,
    }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Resend could not send the password reset email (${response.status}): ${message.slice(0, 300)}`);
  }
}

export async function requestPasswordReset(emailInput: string, role: PasswordResetRole, requesterIp?: string | null) {
  await ensureDatabase();
  const email = emailInput.trim().toLowerCase();
  const requesterIpHash = requesterIp?.trim() ? hashToken(requesterIp.trim()) : null;
  const connection = await getPool().getConnection();
  let pendingEmail: { email: string; name: string; token: string } | null = null;

  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM password_reset_tokens WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)");

    if (requesterIpHash) {
      const ipAttempts = await connection.query(
        "SELECT COUNT(*) AS attempts FROM password_reset_tokens WHERE requester_ip_hash=? AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR)",
        [requesterIpHash],
      ) as Array<{ attempts: number }>;
      if (Number(ipAttempts[0]?.attempts ?? 0) >= 10) { await connection.commit(); return genericResponse; }
    }

    const accounts = await connection.query(
      `SELECT u.id, u.email, u.display_name, u.role
       FROM users u
       LEFT JOIN admin_account_status aas ON aas.user_id=u.id
       LEFT JOIN agent_account_status ags ON ags.user_id=u.id
       WHERE u.email=? AND u.role=? AND u.active=1
         AND ((u.role='admin' AND COALESCE(aas.status,'active')='active')
           OR (u.role='agent' AND COALESCE(ags.status,'active')='active'))
       LIMIT 1 FOR UPDATE`,
      [email, role],
    ) as Array<{ id: number; email: string; display_name: string; role: PasswordResetRole }>;
    const account = accounts[0];
    if (!account) { await connection.commit(); return genericResponse; }

    const accountAttempts = await connection.query(
      "SELECT COUNT(*) AS attempts FROM password_reset_tokens WHERE user_id=? AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR)",
      [account.id],
    ) as Array<{ attempts: number }>;
    if (Number(accountAttempts[0]?.attempts ?? 0) >= 3) { await connection.commit(); return genericResponse; }

    const token = randomBytes(32).toString("base64url");
    await connection.query("UPDATE password_reset_tokens SET expires_at=UTC_TIMESTAMP() WHERE user_id=? AND expires_at>UTC_TIMESTAMP()", [account.id]);
    await connection.query(
      "INSERT INTO password_reset_tokens (token_hash,user_id,requester_ip_hash,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE))",
      [hashToken(token), account.id, requesterIpHash],
    );
    await connection.commit();
    pendingEmail = { email: account.email, name: account.display_name, token };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (pendingEmail) {
    try {
      await sendPasswordResetEmail(pendingEmail.email, pendingEmail.name, pendingEmail.token, role);
    } catch (error) {
      await getPool().query("UPDATE password_reset_tokens SET expires_at=UTC_TIMESTAMP() WHERE token_hash=?", [hashToken(pendingEmail.token)]);
      console.error("MAAF password reset email could not be delivered.", error);
    }
  }
  return genericResponse;
}

export async function completePasswordReset(tokenInput: string, role: PasswordResetRole, password: string) {
  const token = tokenInput.trim();
  if (token.length < 40 || token.length > 100) return false;
  await ensureDatabase();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const rows = await connection.query(
      `SELECT t.user_id
       FROM password_reset_tokens t
       INNER JOIN users u ON u.id=t.user_id
       LEFT JOIN admin_account_status aas ON aas.user_id=u.id
       LEFT JOIN agent_account_status ags ON ags.user_id=u.id
       WHERE t.token_hash=? AND t.expires_at>UTC_TIMESTAMP() AND u.role=? AND u.active=1
         AND ((u.role='admin' AND COALESCE(aas.status,'active')='active')
           OR (u.role='agent' AND COALESCE(ags.status,'active')='active'))
       LIMIT 1 FOR UPDATE`,
      [hashToken(token), role],
    ) as Array<{ user_id: number }>;
    const account = rows[0];
    if (!account) { await connection.rollback(); return false; }

    const passwordHash = await hashPassword(password);
    await connection.query("UPDATE users SET password_hash=? WHERE id=?", [passwordHash, account.user_id]);
    await connection.query("DELETE FROM password_reset_tokens WHERE user_id=?", [account.user_id]);
    await connection.query("DELETE FROM sessions WHERE user_id=?", [account.user_id]);
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
