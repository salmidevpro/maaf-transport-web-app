"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Clock3, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
type PortalRole = "admin" | "agent";

export function PortalLogin({ role, defaultEmail, nextPath, sessionExpired = false, appMode = false }: { role: PortalRole; defaultEmail?: string; nextPath?: string; sessionExpired?: boolean; appMode?: boolean }) {
  const isAdmin = role === "admin";
  const adminLoginHref = appMode ? "/admin/login?app=1" : "/admin/login";
  const registerHref = appMode ? "/agent/signup?app=1" : "/agent/signup";
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, email, password }), signal: controller.signal });
      const result = await response.json() as { error?: string; role?: PortalRole; mustChangePassword?: boolean };
      if (!response.ok) { setError(result.error ?? "Sign in failed. Try again."); return; }
      const safeNextPath = nextPath?.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "";
      window.location.assign(result.role === "admin" ? result.mustChangePassword ? "/admin/change-password" : "/dashboard" : safeNextPath || "/agent");
    } catch (error) {
      setError(error instanceof DOMException && error.name === "AbortError"
        ? "Sign-in is taking too long. Check the database connection and try again."
        : "Could not connect. Check your connection and try again.");
    }
    finally { window.clearTimeout(timeoutId); setBusy(false); }
  }

  return <section className={`login-panel ${isAdmin ? "login-panel-admin" : ""}`}><div className="login-emblem"><LockKeyhole size={23}/></div><span className="section-kicker">MAAF {isAdmin ? "ADMINISTRATION" : "FIELD OPERATIONS"}</span><h1>{isAdmin ? "Admin Login" : "Agent Login"}</h1><p className="login-lede">Sign in with your {isAdmin ? "administrator" : "agent"} account to continue to the {isAdmin ? "operations dashboard" : "card verification workspace"}.</p>{sessionExpired&&<div className="login-session-expired" role="status"><Clock3 size={18}/><span><b>Session expired</b><small>Your session expired after 15 minutes of inactivity. Sign in again to continue.</small></span></div>}<form onSubmit={submit} className="login-form"><label htmlFor="portal-email">{isAdmin ? "Email address or username" : "Email address"}</label><input id="portal-email" type={isAdmin ? "text" : "email"} autoComplete="username" value={email} onChange={(event)=>setEmail(event.target.value)} placeholder={isAdmin ? "name@organization.com or username" : "name@organization.com"} required/><label htmlFor="portal-password">Password</label><div className="password-field"><input id="portal-password" type={visible ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event)=>setPassword(event.target.value)} placeholder="Enter your password" required/><button type="button" aria-label={visible ? "Hide password" : "Show password"} onClick={()=>setVisible(!visible)}>{visible ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>{error&&<div className="login-error" role="alert">{error}</div>}<button className="login-submit" disabled={busy}>{busy ? "Signing in…" : <>Sign in to {isAdmin ? "Admin" : "Agent"} Login <ArrowRight size={17}/></>}</button></form><div className="login-secondary-actions">{!isAdmin && <Link className="login-verify-email-button" href={appMode ? "/agent/verify-email/resend?app=1" : "/agent/verify-email/resend"}>Verify Email</Link>}<div className="login-secondary-links"><a className="login-forgot-link" href={`/${role}/forgot-password${appMode ? "?app=1" : ""}`}>Forgot password?</a>{!isAdmin && <><Link className="login-portal-link" href={adminLoginHref}>Admin Login</Link><Link className="login-portal-link" href={registerHref}>Register now</Link></>}</div></div><div className="login-security"><ShieldCheck size={15}/> Sign out after use on shared devices</div></section>;
}
