"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Clock3, MailCheck, ShieldCheck } from "lucide-react";
import { FeedbackMessage, type FeedbackKind } from "@/components/feedback-message";

type Feedback = { kind: FeedbackKind; title: string; message: string };

export function AgentEmailVerification({ token }: { token: string }) {
  const [feedback, setFeedback] = useState<Feedback | null>(token ? null : {
    kind: "warning",
    title: "Verification link missing",
    message: "Open the complete link from your MAAF verification email. If the link expired, request a new email from the signup page.",
  });
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendEmail, setResendEmail] = useState("");

  async function verify() {
    if (busy || !token) return;
    setBusy(true);
    setFeedback({ kind: "progress", title: "Verifying your email", message: "Please wait while we securely confirm your link." });
    try {
      const response = await fetch("/api/agent-signup/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not verify this link.");
      setVerified(true);
      setFeedback(null);
    } catch (error) {
      setFeedback({
        kind: "error",
        title: "Email verification failed",
        message: error instanceof Error ? error.message : "We could not verify this link. Request a new verification email and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resending) return;
    setResending(true);
    setFeedback({ kind: "progress", title: "Requesting a new link", message: "We’re checking the account and preparing a fresh verification email." });
    try {
      const response = await fetch("/api/agent-signup/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail }),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || "Could not request a new verification email.");
      setFeedback({ kind: "success", title: "Request received", message: result.message || "If this is an unverified MAAF Agent account, a new link will arrive shortly." });
    } catch (error) {
      setFeedback({ kind: "error", title: "We could not send a new link", message: error instanceof Error ? error.message : "Please try again shortly." });
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="public-site email-verify-page">
      <section className={`email-verify-card ${verified ? "email-verify-card-success" : ""}`} aria-labelledby="email-verify-title">
        <div className={`email-verify-icon ${verified ? "is-verified" : ""}`}><MailCheck size={27}/></div>
        <span className="section-kicker">MAAF AGENT ACCOUNT</span>
        <h1 id="email-verify-title">{verified ? "Your email is verified." : "Verify your email."}</h1>
        <p className="email-verify-lede">{verified
          ? "Your MAAF Agent account is active. You can now sign in and access the agent workspace."
          : "Confirm your email address to activate your MAAF Agent account and continue to the agent portal."}</p>

        {!verified && <div className="email-expiry-note"><Clock3 size={18}/><span><b>This link is valid for 10 minutes</b><small>For your security, the verification link can only be used once.</small></span></div>}
        {feedback && <FeedbackMessage {...feedback}/>}

        {verified
          ? <Link className="email-verify-action" href="/agent/login">Continue to Agent Portal <ArrowRight size={17}/></Link>
          : <>
              <button className="email-verify-action" disabled={busy || !token} onClick={verify}>{busy ? "Verifying your email…" : <>Verify email address <ArrowRight size={17}/></>}</button>
              <button className="email-resend-toggle" type="button" onClick={() => setResendOpen((open) => !open)}>{resendOpen ? "Hide resend form" : "Link expired? Request a new one"}</button>
              {resendOpen && <form className="email-resend-form" onSubmit={resend}>
                <label htmlFor="resend-agent-email">Email address used for signup</label>
                <div><input id="resend-agent-email" type="email" autoComplete="email" maxLength={254} value={resendEmail} onChange={(event) => setResendEmail(event.target.value)} placeholder="you@example.com" required/><button type="submit" disabled={resending}>{resending ? "Sending…" : "Send new link"}</button></div>
                <small>For your account security, new links can be requested once per minute.</small>
              </form>}
            </>}

        <div className="email-verify-security"><ShieldCheck size={16}/><span>{verified ? "Your email address has been confirmed securely." : "Only verify this link if you created this MAAF Agent account."}</span></div>
      </section>
    </main>
  );
}
