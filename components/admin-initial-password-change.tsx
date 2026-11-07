"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, KeyRound, ShieldCheck } from "lucide-react";

export function AdminInitialPasswordChange() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/change-initial-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPassword }),
      });
      const result = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || "Your password could not be updated.");
      window.location.assign("/dashboard");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Your password could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="public-site"><div className="login-page-wrap"><section className="login-panel login-panel-admin initial-password-panel"><div className="login-emblem"><KeyRound size={23}/></div><span className="section-kicker">ACCOUNT SECURITY</span><h1>Set your password</h1><p className="login-lede">Your temporary password has expired. Choose a new password to open the MAAF administrator workspace.</p><form className="login-form" onSubmit={submit}><label htmlFor="initial-new-password">New password</label><input id="initial-new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required/><label htmlFor="initial-confirm-password">Confirm new password</label><input id="initial-confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required/>{error && <div className="login-error" role="alert">{error}</div>}<small className="initial-password-hint">Use at least 8 characters with a capital letter, a special character, and a number.</small><button className="login-submit" disabled={busy}>{busy ? "Saving password…" : <>Save password and continue <ArrowRight size={17}/></>}</button></form><div className="login-security"><ShieldCheck size={15}/> Your new password is stored securely</div></section></div></main>;
}
