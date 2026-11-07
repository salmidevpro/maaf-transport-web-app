"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, BusFront, CheckCircle2, QrCode, ScanLine, Search, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import type { Vehicle } from "@/lib/vehicles";

export function AgentLookup() {
  const [query, setQuery] = useState("");
  const [vehicle, setVehicle] = useState<Vehicle | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError(""); setVehicle(undefined);
    try {
      const response = await fetch("/api/vehicles/verify", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ lookup: query }) });
      const result = await response.json() as Vehicle | { error?: string };
      if (response.status === 404) { setVehicle(null); return; }
      if (!response.ok || !("id" in result)) throw new Error("error" in result ? result.error || "Could not verify this vehicle." : "Could not connect to the vehicle registry.");
      setVehicle(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Verification failed. Try again.");
    } finally { setLoading(false); }
  }

  return <div className="agent-workspace"><section className="agent-lookup-card"><div className="agent-scan-icon"><ScanLine size={25}/></div><h2>Check a vehicle record</h2><p>Enter the MAAF ID or registration plate to confirm the vehicle’s status and details.</p><form onSubmit={verify}><label htmlFor="agent-vehicle-query">MAAF ID or registration number</label><div className="agent-search-row"><div className="agent-search-box"><Search size={19}/><input id="agent-vehicle-query" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="MAAF-1234ABCD or LND 482 XY" required/></div><button className="agent-submit" disabled={loading}>{loading ? "Checking…" : <>Verify <ArrowRight size={17}/></>}</button></div></form><div className="agent-safety"><ShieldCheck size={16}/> Match the record to the vehicle and operator before proceeding.</div>{error&&<div className="agent-error"><XCircle size={18}/>{error}</div>}{vehicle!==undefined&&<div className={`agent-result ${vehicle?.status === "Active" ? "agent-result-ok" : vehicle ? "agent-result-warning" : "agent-result-error"}`}>{vehicle ? vehicle.status === "Active" ? <CheckCircle2 size={22}/> : <ShieldAlert size={22}/> : <XCircle size={22}/>}<div><b>{!vehicle ? "No matching record" : vehicle.status === "Active" ? "Vehicle verified" : `Status: ${vehicle.status}`}</b>{vehicle ? <div className="agent-record-grid"><span>Registration<strong>{vehicle.plate}</strong></span><span>Vehicle<strong>{vehicle.make} {vehicle.model} · {vehicle.year}</strong></span><span>Operator<strong>{vehicle.operator}</strong></span><span>Route<strong>{vehicle.route}</strong></span><span>MAAF identity<strong className="agent-code">{vehicle.id}</strong></span></div> : <p>Check the MAAF ID or registration plate and try again.</p>}</div></div>}</section><aside className="agent-side-card"><div className="agent-side-icon"><QrCode size={22}/></div><span className="section-kicker">FIELD CHECK GUIDE</span><h3>Verify the vehicle, not just the code.</h3><ol><li><b>01</b><span>Check the plate matches this record.</span></li><li><b>02</b><span>Confirm vehicle details with what you see.</span></li><li><b>03</b><span>Review current status before clearing.</span></li></ol><div className="agent-side-note"><BusFront size={16}/> Checks are added to the vehicle record.</div></aside></div>;
}
