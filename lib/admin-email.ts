import "server-only";
import { getSiteUrl } from "@/lib/site-config";

function escapeHtml(value: string) {
  const escaped: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (character) => escaped[character]);
}

export async function sendAdminCredentialsEmail(email: string, name: string, password: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const siteUrl = getSiteUrl();
  if (!apiKey || !from || !siteUrl) {
    throw new Error("Admin email is not configured. Set RESEND_API_KEY, RESEND_FROM_EMAIL, and MAAF_SITE_URL (or NEXT_PUBLIC_SITE_URL).");
  }

  const loginUrl = new URL("/admin/login", siteUrl).toString();
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safePassword = escapeHtml(password);
  const safeLoginUrl = escapeHtml(loginUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your MAAF administrator account",
      text: `Hello ${name},\n\nAn administrator account has been created for you in MAAF Transport Control.\n\nSign in: ${loginUrl}\nEmail: ${email}\nTemporary password: ${password}\n\nFor your security, you must choose a new password at your first sign-in. Do not share this message.\n\nMAAF Transport Control`,
      html: `<div style="margin:0;padding:36px 14px;background:#f3f6f9;font-family:Arial,Helvetica,sans-serif;color:#243b53"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e3e9ef;border-radius:14px;overflow:hidden"><tr><td style="padding:23px 32px;background:#142d49"><div style="font-size:23px;font-weight:800;color:#fff">maaf<span style="color:#f7b821">.</span></div><div style="margin-top:4px;font-size:9px;font-weight:700;letter-spacing:1.8px;color:#c6d2df">TRANSPORT CONTROL</div></td></tr><tr><td style="padding:34px 32px"><div style="display:inline-block;padding:7px 10px;border-radius:20px;background:#fff4d7;color:#896200;font-size:11px;font-weight:700;letter-spacing:.7px">ADMINISTRATOR ACCOUNT</div><h1 style="margin:19px 0 11px;color:#142d49;font-size:26px;line-height:1.25">Your account is ready</h1><p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#5e7185">Hello ${safeName}, an administrator created a MAAF workspace account for you.</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 22px;background:#f7f9fb;border:1px solid #e3e9ef;border-radius:9px"><tr><td style="padding:15px 17px;font-size:14px;line-height:1.9;color:#304b66"><strong>Email:</strong> ${safeEmail}<br/><strong>Temporary password:</strong> ${safePassword}</td></tr></table><a href="${safeLoginUrl}" style="display:inline-block;padding:14px 22px;border-radius:8px;background:#142d49;color:#fff;font-size:15px;font-weight:700;text-decoration:none">Sign in to MAAF →</a><div style="margin-top:22px;padding:14px 16px;border:1px solid #f0dfad;border-radius:9px;background:#fffbef;color:#72591f;font-size:13px;line-height:1.65"><strong>Change your password at first sign-in.</strong><br/>This temporary password only gets you into the account setup step. Choose a new password before accessing the workspace.</div><p style="margin:22px 0 0;color:#74869a;font-size:12px;line-height:1.65">Keep this message private and delete it after setting your new password. If you did not expect this account, contact your workspace administrator.</p></td></tr><tr><td style="padding:18px 32px 22px;background:#f8fafc;border-top:1px solid #e8edf2;color:#8291a0;font-size:11px;line-height:1.6">MAAF Transport Control<br/>Automated account message</td></tr></table></div>`,
    }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Resend could not send the admin email (${response.status}): ${message.slice(0, 300)}`);
  }
}
