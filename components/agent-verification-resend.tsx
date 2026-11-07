"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, MailCheck } from "lucide-react";

export function AgentVerificationResendForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/agent-signup/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const result = await response.json() as { message?: string; error?: string };
      if (!response.ok) {
        setError(result.error || "We could not send a verification email. Try again shortly.");
        return;
      }
      setMessage(result.message || "A new verification email has been sent. Check your inbox and spam folder.");
    } catch {
      setError("Could not connect. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="login-panel recovery-panel">
    <div className="login-emblem"><MailCheck size={22}/></div>
    <span className="section-kicker">AGENT ACCOUNT</span>
    <h1>Verify your email</h1>
    <p className="login-lede">Enter the email address you used to create your MAAF Agent account. We’ll send a new verification link if needed.</p>
    <form onSubmit={submit} className="login-form">
      <label htmlFor="agent-verification-email">Email address</label>
      <input id="agent-verification-email" type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@organization.com" required/>
      {error && <div className="login-error" role="alert">{error}</div>}
      {message && <div className="recovery-success" role="status"><MailCheck size={17}/><span>{message}</span></div>}
      <button className="login-submit" disabled={busy}>{busy ? "Sending…" : <>Send verification email <ArrowRight size={17}/></>}</button>
    </form>
    <Link className="recovery-back-link" href="/agent/login"><ArrowLeft size={15}/> Back to Agent Portal sign in</Link>
  </section>;
}
