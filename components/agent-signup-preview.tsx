"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Check, Eye, EyeOff, Fingerprint, MailCheck, ShieldCheck, UserRoundPlus } from "lucide-react";
import { FeedbackMessage, type FeedbackKind } from "@/components/feedback-message";
import nigeriaLgas from "@/data/nigeria-lga.json";

// State and LGA names from open-admin-data's Nigeria dataset (CC BY 4.0).

type Names = { firstName: string; lastName: string; otherNames: string };
type Feedback = { kind: FeedbackKind; title: string; message: string };
const emptyNames: Names = { firstName: "", lastName: "", otherNames: "" };

export function AgentSignupPreview() {
  const [nin, setNin] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [names, setNames] = useState<Names>(emptyNames);
  const [originState, setOriginState] = useState("");
  const [originLga, setOriginLga] = useState("");
  const [matched, setMatched] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const passwordChecks = [
    { label: "At least 8 characters", met: passwordDraft.length >= 8 },
    { label: "One capital letter", met: /[A-Z]/.test(passwordDraft) },
    { label: "One special character", met: /[^A-Za-z0-9]/.test(passwordDraft) },
    { label: "One number", met: /[0-9]/.test(passwordDraft) },
  ];
  const nigeriaStates = Object.keys(nigeriaLgas).sort((a, b) => a.localeCompare(b));
  const originLgas = (nigeriaLgas as Record<string, string[]>)[originState] ?? [];

  async function lookup() {
    setFeedback(null); setNames(emptyNames); setMatched(false);
    if (!/^\d{11}$/.test(nin)) { setFeedback({ kind: "error", title: "Check the NIN", message: "Enter the 11-digit NIN provided to you for MAAF pre-registration." }); return; }
    setBusy(true);
    setFeedback({ kind: "progress", title: "Checking your record", message: "Matching your NIN against the MAAF pre-registration list…" });
    try {
      const response = await fetch("/api/agent-signup/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nin }) });
      const result = await response.json() as Names & { error?: string };
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter >= 60 ? `about ${Math.ceil(retryAfter / 60)} minutes` : `${retryAfter} seconds`
          : "a short time";
        setFeedback({ kind: "warning", title: "Please wait before trying again", message: `For security, record checks are temporarily limited. Try again in ${wait}.` });
        return;
      }
      if (!response.ok) throw new Error(result.error || "This NIN was not found on the MAAF pre-registration list.");
      setNames({ firstName: result.firstName, lastName: result.lastName, otherNames: result.otherNames }); setMatched(true); setFeedback({ kind: "success", title: "Record matched", message: "Your pre-registration is confirmed. Your name fields are locked to the details provided by the MAAF admin." });
    } catch (error) { setFeedback({ kind: "error", title: "Record not matched", message: error instanceof Error ? error.message : "We could not check the pre-registration list. Please try again." }); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!matched) { setFeedback({ kind: "error", title: "Match your record first", message: "Check your NIN against the MAAF pre-registration list before creating an account." }); return; }
    const form = new FormData(event.currentTarget);
    setBusy(true); setFeedback({ kind: "progress", title: "Submitting your application", message: "We’re securely creating your agent account. Please keep this page open." });
    try {
      const payload = Object.fromEntries(form.entries()); payload.nin = nin;
      const response = await fetch("/api/agent-signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string; emailPending?: boolean };
      if (!response.ok) throw new Error(result.error || "Could not complete signup.");
      setComplete(true);
      setFeedback(result.emailPending
        ? { kind: "warning", title: "Account created; email setup is pending", message: "Email delivery is not configured yet. Contact MAAF to arrange your verification message." }
        : { kind: "success", title: "Application received", message: "Check your inbox promptly. Your one-time verification link expires in 10 minutes, and your account will activate after you confirm your email." });
    } catch (error) { setFeedback({ kind: "error", title: "We couldn’t create your account", message: error instanceof Error ? error.message : "Please try again. If the issue continues, contact MAAF support." }); }
    finally { setBusy(false); }
  }

  if (complete) return <section className="agent-signup-shell"><div className="signup-complete-card"><span className="signup-complete-icon"><MailCheck size={24}/></span><span className="section-kicker">CHECK YOUR INBOX</span><h1>One last step to <em>get started.</em></h1>{feedback && <FeedbackMessage {...feedback}/>}<Link className="button button-secondary" href="/agent/login">Go to agent login <ArrowRight size={16}/></Link></div></section>;

  return <section className="agent-signup-shell">
    <div className="agent-signup-heading"><span className="section-kicker">AGENT APPLICATION</span><h1>Create your <em>agent profile.</em></h1><p>MAAF admin must pre-register your details before you can create an agent account. Enter the NIN shared with you to match your record.</p></div>
    <div className="signup-progress" aria-label="Registration steps"><div className="signup-step signup-step-active"><span>01</span><b>Match record</b></div><i aria-hidden="true"/><div className="signup-step"><span>02</span><b>Account details</b></div><i aria-hidden="true"/><div className="signup-step"><span>03</span><b>Verify email</b></div></div>
    <div className="agent-signup-layout">
      <form className="agent-signup-form" onSubmit={submit}>
        {feedback && <FeedbackMessage {...feedback}/>}
        <div className="signup-form-title"><span><UserRoundPlus size={19}/></span><div><h2>Your details</h2><p>Names are populated from your MAAF pre-registration and cannot be edited here.</p></div></div>
        <div className="nin-verification-panel"><div className="nin-panel-heading"><span><Fingerprint size={19}/></span><div><b>Match your pre-registration</b><small>This checks the MAAF admin list only; it does not contact an identity provider.</small></div><span className="nin-status"><ShieldCheck size={13}/> MAAF LIST</span></div>
          <label className="nin-input-label" htmlFor="agent-nin">National Identification Number (NIN)</label>
          <div className="nin-input-row"><input id="agent-nin" name="nin" inputMode="numeric" autoComplete="off" maxLength={11} value={nin} onChange={(event)=>{setNin(event.target.value.replace(/\D/g,"").slice(0,11));setMatched(false);setNames(emptyNames);setFeedback(null);}} placeholder="Enter your 11-digit NIN" required/><button type="button" onClick={lookup} disabled={busy}>{busy ? "Checking…" : "Check record"}<ArrowRight size={15}/></button></div>
          <div className="signup-fields signup-locked-names"><label>First name<input value={names.firstName} placeholder="Checked from admin record" readOnly/></label><label>Last name<input value={names.lastName} placeholder="Checked from admin record" readOnly/></label><label>Other name(s)<input value={names.otherNames} placeholder="Checked from admin record" readOnly/></label></div>
        </div>
        {matched && <><div className="signup-form-title signup-account-title"><span><Check size={19}/></span><div><h2>Set up your account</h2><p>Use an email address you can access to activate your account.</p></div></div>
          <div className="signup-fields"><label>Username<input name="username" autoComplete="username" minLength={3} maxLength={40} pattern="[a-zA-Z0-9._-]+" placeholder="Choose a username" required/></label><label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required/></label><div className="signup-password-field"><label htmlFor="agent-password">Password</label><div className="password-input-wrap"><input id="agent-password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={200} pattern="(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}" title="Use at least 8 characters, including an uppercase letter, a number, and a special character." aria-describedby="agent-password-requirements" placeholder="Create a strong password" value={passwordDraft} onChange={(event)=>setPasswordDraft(event.target.value)} required/><button className="password-visibility-toggle" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={()=>setShowPassword((visible)=>!visible)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div><ul className="password-requirements" id="agent-password-requirements" aria-label="Password requirements" aria-live="polite">{passwordChecks.map(({label,met})=><li className={met ? "is-met" : ""} key={label}><span aria-hidden="true">{met ? "✓" : "○"}</span>{label}<span className="password-check-status">{met ? "Met" : "Not met"}</span></li>)}</ul></div><div className="signup-password-field"><label htmlFor="agent-confirm-password">Confirm password</label><div className="password-input-wrap"><input id="agent-confirm-password" name="confirmPassword" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={200} placeholder="Enter password again" required/><button className="password-visibility-toggle" type="button" aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"} aria-pressed={showConfirmPassword} onClick={()=>setShowConfirmPassword((visible)=>!visible)}>{showConfirmPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></div><div className="signup-phone-field"><label htmlFor="agent-phone">Active phone number</label><div className="phone-input-group"><span className="phone-country-prefix" aria-label="Nigeria country code">+234</span><input type="hidden" name="phoneCountryCode" value="+234"/><input id="agent-phone" name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={11} pattern="0[0-9]{10}" title="Enter an 11-digit Nigerian phone number, including the first zero." aria-describedby="agent-phone-hint" placeholder="080 1234 5678" required/></div><small id="agent-phone-hint">Nigeria only. Enter all 11 digits, starting with 0.</small></div><label>Address<input name="location" autoComplete="street-address" maxLength={120} placeholder="Enter your street address" required/></label><label>State of origin<select name="originState" autoComplete="address-level1" value={originState} onChange={(event)=>{setOriginState(event.target.value);setOriginLga("");}} required><option value="" disabled>Select your state</option>{nigeriaStates.map((state)=><option key={state} value={state}>{state}</option>)}</select></label><label>Local government of origin<select name="originLga" autoComplete="address-level3" value={originLga} onChange={(event)=>setOriginLga(event.target.value)} disabled={!originState} required><option value="" disabled>{originState ? "Select your local government" : "Select state of origin first"}</option>{originLgas.map((lga)=><option key={lga} value={lga}>{lga}</option>)}</select></label><label className="signup-country-field">Country<input name="country" autoComplete="country-name" value="Nigeria" readOnly/></label></div>
          <div className="signup-form-actions"><p><MailCheck size={16}/> Your account activates after you verify your email.</p><button type="submit" disabled={busy}>{busy ? "Submitting…" : "Create account"}<ArrowRight size={17}/></button></div></>}
      </form>
      <aside className="signup-side-card"><div className="signup-side-icon"><ShieldCheck size={20}/></div><span className="section-kicker">HOW ACCOUNT ACCESS WORKS</span><h2>Only pre-registered agents can sign up.</h2><ul><li><span><Fingerprint size={14}/></span><div><b>Match your MAAF record</b><p>Your NIN must match the record added by an admin.</p></div></li><li><span><UserRoundPlus size={14}/></span><div><b>Choose account details</b><p>Your MAAF-registered names stay locked to the admin record.</p></div></li><li><span><MailCheck size={14}/></span><div><b>Verify your email</b><p>Use the link sent to your email to activate your account.</p></div></li></ul><div className="signup-side-note">This is an internal MAAF pre-registration match for account access.</div></aside>
    </div>
  </section>;
}
