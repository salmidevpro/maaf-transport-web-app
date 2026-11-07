"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, Mail } from "lucide-react";
type PasswordResetRole = "admin" | "agent";

const portalName = (role: PasswordResetRole) => role === "admin" ? "Admin" : "Agent";

export function ForgotPasswordForm({ role }: { role: PasswordResetRole }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, email }),
      });
      const result = await response.json() as { message?: string; error?: string };
      if (!response.ok) { setError(result.error ?? "We could not process the request. Try again."); return; }
      setMessage(result.message ?? "If an active account matches that email, reset instructions will be sent shortly.");
    } catch {
      setError("Could not connect. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="login-panel recovery-panel">
    <div className="login-emblem"><Mail size={22}/></div>
    <span className="section-kicker">ACCOUNT RECOVERY</span>
    <h1>Forgot password?</h1>
    <p className="login-lede">Enter the email address for your MAAF {portalName(role)} account. We’ll send a secure reset link if an active account matches.</p>
    <form onSubmit={submit} className="login-form">
      <label htmlFor="recovery-email">Email address</label>
      <input id="recovery-email" type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@organization.com" required/>
      {error && <div className="login-error" role="alert">{error}</div>}
      {message && <div className="recovery-success" role="status"><CheckCircle2 size={17}/><span>{message}</span></div>}
      <button className="login-submit" disabled={busy}>{busy ? "Sending…" : <>Send reset link <ArrowRight size={17}/></>}</button>
    </form>
    <Link className="recovery-back-link" href={`/${role}/login`}><ArrowLeft size={15}/> Back to {portalName(role)} sign in</Link>
  </section>;
}

export function ResetPasswordForm({ role, token }: { role: PasswordResetRole; token: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [visibleConfirm, setVisibleConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, token, password, confirmPassword }),
      });
      const result = await response.json() as { success?: boolean; error?: string };
      if (!response.ok) { setError(result.error ?? "Your password could not be reset. Try again."); return; }
      setComplete(true);
    } catch {
      setError("Could not connect. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (complete) return <section className="login-panel recovery-panel">
    <div className="login-emblem recovery-success-emblem"><CheckCircle2 size={23}/></div>
    <span className="section-kicker">PASSWORD UPDATED</span>
    <h1>You’re all set.</h1>
    <p className="login-lede">Your MAAF {portalName(role)} password has been changed. Sign in using your new password.</p>
    <Link className="login-submit recovery-login-button" href={`/${role}/login`}>Go to {portalName(role)} sign in <ArrowRight size={17}/></Link>
  </section>;

  return <section className="login-panel recovery-panel">
    <div className="login-emblem"><KeyRound size={22}/></div>
    <span className="section-kicker">ACCOUNT RECOVERY</span>
    <h1>Choose a new password</h1>
    <p className="login-lede">Create a new password for your MAAF {portalName(role)} account.</p>
    {!token ? <div className="login-error" role="alert">This reset link is missing or invalid. Request a new link to continue.</div> : <form onSubmit={submit} className="login-form">
      <label htmlFor="reset-password">New password</label>
      <div className="password-field"><input id="reset-password" type={visible ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter a new password" required/><button type="button" aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>
      <label htmlFor="reset-confirm-password">Confirm new password</label>
      <div className="password-field"><input id="reset-confirm-password" type={visibleConfirm ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter the password again" required/><button type="button" aria-label={visibleConfirm ? "Hide confirmation password" : "Show confirmation password"} onClick={() => setVisibleConfirm(!visibleConfirm)}>{visibleConfirm ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>
      <p className="recovery-password-hint">Use 8–128 characters with a capital letter, a number, and a special character.</p>
      {error && <div className="login-error" role="alert">{error}</div>}
      {error.toLowerCase().includes("expired") && <Link className="recovery-new-link" href={`/${role}/forgot-password`}>Request a new reset link</Link>}
      <button className="login-submit" disabled={busy}>{busy ? "Saving…" : <>Save new password <ArrowRight size={17}/></>}</button>
    </form>}
    {!token && <Link className="recovery-new-link" href={`/${role}/forgot-password`}>Request a new reset link</Link>}
    <Link className="recovery-back-link" href={`/${role}/login`}><ArrowLeft size={15}/> Back to {portalName(role)} sign in</Link>
  </section>;
}
