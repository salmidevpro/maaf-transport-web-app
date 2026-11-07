"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, LoaderCircle, MapPin, PackageCheck, ShieldCheck, Truck, XCircle } from "lucide-react";
import type { CardTrip, CardTripVerification } from "@/lib/card-trips";

type AgentTrip = CardTrip & { code: string; currentAgentVerifiedStep: number | null };

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let result: unknown;
  try { result = text ? JSON.parse(text) : null; }
  catch { throw new Error(`The server returned an invalid response (${response.status}).`); }
  if (!response.ok) {
    const message = result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "The request could not be completed.";
    throw new Error(message);
  }
  if (result == null) throw new Error("The server returned an empty response. Refresh and try again.");
  return result as T;
}

const stageLabels = ["Agent 1 · Departure check", "Agent 2 · Route checkpoint", "Agent 3 · Arrival check"];

export function AgentCardTrip({ code, onCheckpointRecorded }: { code: string; onCheckpointRecorded?: () => void }) {
  const [trip, setTrip] = useState<AgentTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const apiPath = code.toUpperCase().startsWith("MAAF-TEST-") ? "/api/agent/test-cards" : "/api/agent/card-trips";

  async function load() {
    setLoading(true); setError("");
    try { setTrip(await parseResponse<AgentTrip>(await fetch(`${apiPath}?code=${encodeURIComponent(code)}`, { cache: "no-store" }))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Trip information could not be loaded."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [apiPath, code]);

  async function record(outcome: "verified" | "flagged") {
    if (!trip || busy) return;
    setBusy(true); setError("");
    try {
      await parseResponse(await fetch(apiPath, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, step: trip.current_step, outcome, notes }),
      }));
      setNotes(""); setConfirmed(false); await load(); onCheckpointRecorded?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this checkpoint."); }
    finally { setBusy(false); }
  }

  if (loading) return <section className="card-trip-shell"><div className="card-trip-loading"><LoaderCircle className="spin"/> Loading trip record…</div></section>;
  if (error && !trip) return <section className="card-trip-shell"><div className="card-trip-error"><XCircle/><div><b>Trip record unavailable</b><p>{error}</p></div><button className="button button-secondary" onClick={() => void load()}>Retry</button></div></section>;
  if (!trip) return null;

  const eventsByStep = new Map<number, CardTripVerification[]>();
  for (const event of trip.verifications) eventsByStep.set(event.step, [...(eventsByStep.get(event.step) || []), event]);
  const currentStep = Number(trip.current_step);
  const closed = trip.status === "completed";
  const held = trip.status === "on_hold";
  const alreadyVerifiedByCurrentAgent = trip.currentAgentVerifiedStep != null;

  return <section className="card-trip-shell">
    <div className={`card-trip-status-banner ${closed ? "is-complete" : held ? "is-held" : "is-active"}`}>
      {closed ? <CheckCircle2/> : held ? <AlertTriangle/> : <ShieldCheck/>}
      <div><b>{closed ? "Trip completed — card closed" : held ? "Trip on hold" : `Checkpoint ${currentStep} of 3 is open`}</b><span>{closed ? "All three agent checks are complete. This one-trip QR card cannot be reused." : held ? "An agent reported a discrepancy. An admin must review and release this trip before it can continue." : "Check the goods and travel details before recording the checkpoint."}</span></div>
    </div>
    {error && <div className="card-trip-inline-error" role="alert"><AlertTriangle size={16}/>{error}</div>}
    <div className="card-trip-details-grid">
      <article className="card-trip-panel"><div className="card-trip-panel-heading"><span><Truck size={18}/></span><div><h2>Trip route</h2><p>{trip.code} · {trip.vehicle_class}</p></div></div>
        <div className="card-trip-route"><div><span>TRAVELLING FROM</span><b><MapPin size={15}/>{trip.origin}</b></div><i/><div><span>DESTINATION</span><b><MapPin size={15}/>{trip.destination}</b></div></div>
      </article>
      <article className="card-trip-panel"><div className="card-trip-panel-heading"><span><PackageCheck size={18}/></span><div><h2>Declared goods</h2><p>Compare the load with this list at every checkpoint.</p></div></div>
        <div className="card-trip-goods-list">{trip.items.map((item, index) => <div className="card-trip-goods-row" key={`${item.description}-${index}`}><b>{item.description}</b></div>)}</div>
      </article>
    </div>
    <section className="card-trip-panel card-trip-checkpoints"><div className="card-trip-panel-heading"><span><ShieldCheck size={18}/></span><div><h2>Three required agent checks</h2><p>Each checkpoint unlocks the next and must be completed by a different agent account.</p></div></div>
      <div className="card-trip-stage-list">{stageLabels.map((label, index) => {
        const number = index + 1; const stageEvents = eventsByStep.get(number) || []; const successful = stageEvents.find((item) => item.outcome === "verified"); const flagged = [...stageEvents].reverse().find((item) => item.outcome === "flagged"); const done = Boolean(successful); const open = number === currentStep && !closed && !held; const locked = !done && !open;
        return <article className={`card-trip-stage ${done ? "is-done" : open ? "is-open" : locked ? "is-locked" : "is-held"}`} key={number}>
          <div className="card-trip-stage-marker">{done ? <Check size={17}/> : <span>0{number}</span>}</div>
          <div className="card-trip-stage-copy"><b>{label}</b><span>{successful ? `Verified by ${successful.agent_name} · ${new Date(successful.checked_at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}` : locked ? "Locked until the previous checkpoint is verified." : flagged ? `Flagged by ${flagged.agent_name}: ${flagged.notes}` : open ? number === 1 ? "Open for an authorized agent to complete." : "Open for a different signed-in agent to complete." : "Awaiting admin review."}</span></div>
          <span className="card-trip-stage-state">{done ? "Verified" : locked ? "Locked" : open ? "Open" : "On hold"}</span>
        </article>;
      })}</div>
      {currentStep >= 1 && currentStep <= 3 && !closed && !held && <div className="card-trip-action-area">
        {alreadyVerifiedByCurrentAgent
          ? <div className="card-trip-closed-note is-held"><AlertTriangle size={17}/> You already verified this card at checkpoint {trip.currentAgentVerifiedStep}. Another agent must complete checkpoint {currentStep}.</div>
          : <><label className="card-trip-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}/><span>I checked the route and listed goods against this trip record.</span></label>
        <button className="button button-primary" disabled={!confirmed || busy} onClick={() => void record("verified")}>{busy ? <LoaderCircle className="spin" size={16}/> : <CheckCircle2 size={16}/>} {busy ? "Saving check…" : `Verify checkpoint ${currentStep}`}</button></>}
        <details className="card-trip-flag"><summary><AlertTriangle size={14}/> Report a mismatch</summary><label htmlFor="trip-flag-note">Describe what does not match</label><textarea id="trip-flag-note" rows={2} maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="For example, the load has fewer bags than declared."/><button className="button button-secondary" disabled={!notes.trim() || busy} onClick={() => void record("flagged")}>Place trip on hold</button></details>
      </div>}
      {closed && <div className="card-trip-closed-note"><CheckCircle2 size={17}/> This card has completed all three checks and is permanently closed to further use.</div>}
      {held && <div className="card-trip-closed-note is-held"><AlertTriangle size={17}/> Contact an administrator to review the reported issue.</div>}
    </section>
  </section>;
}
