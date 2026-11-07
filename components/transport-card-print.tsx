"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowLeft, BusFront, CarFront, Check, CheckCircle2, CirclePlus, LoaderCircle, Package, Printer, RefreshCw, ShieldAlert, Trash2, Truck, Wifi, X } from "lucide-react";
import { type CardTrip, type CardTripItem } from "@/lib/card-trips";

type Batch = { id: number; vehicle_class: string; destination: string; allocated_quantity: number; production_batch_id?: number; range_start?: number; batch_date?: string };
type BatchResponse = { batch: Batch; trips: CardTrip[]; nextSerial: number | null; nextCode: string | null };
type GoodsInput = { description: string };
const emptyTrips: CardTrip[] = [];

const icons: Record<string, typeof CarFront> = { Cars: CarFront, Jeep: Truck, Bus: BusFront };
const vehiclePhotos: Record<string, string> = {
  Cars: "/images/maaf-car.jpg",
  Jeep: "/images/maaf-jeep.jpg",
  Bus: "/images/maaf-bus.jpg",
};
const destinationTones: Record<string, string> = { Oyo: "oyo", Olorunda: "olorunda", Target: "target", Jimba: "jimba" };

async function responseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let result: unknown = null;
  try { if (text) result = JSON.parse(text); }
  catch { throw new Error(`The server returned an invalid response (${response.status}).`); }
  if (!response.ok) {
    const message = result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "The request could not be completed.";
    throw new Error(message);
  }
  if (result == null) throw new Error("The server returned an empty response. Refresh and try again.");
  return result as T;
}

function tripIdentity(trip: CardTrip) {
  return `${trip.source ?? (trip.id < 0 ? "assignment" : "legacy")}:${trip.id}`;
}

export function TransportCardPrint({ batchId, productionBatchId, rangeStart, vehicleClass, destination, quantity, selectedTripId }: { batchId: number; productionBatchId?: number; rangeStart?: number; vehicleClass: string; destination: string; quantity: number; selectedTripId?: number }) {
  const [data, setData] = useState<BatchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [origin, setOrigin] = useState("");
  const [goods, setGoods] = useState<GoodsInput[]>([{ description: "" }]);
  const [qrCodes, setQrCodes] = useState<Record<number, string>>({});
  const [printing, setPrinting] = useState(false);
  const [deletingTripKey, setDeletingTripKey] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{ action: "release" | "delete"; trip: CardTrip } | null>(null);
  const Icon = icons[vehicleClass] ?? BusFront;
  const vehiclePhoto = vehiclePhotos[vehicleClass] ?? vehiclePhotos.Bus;
  const classLabel = vehicleClass === "Cars" ? "Car" : vehicleClass;
  const tone = destinationTones[destination] ?? "other";
  const trips = data?.trips || emptyTrips;
  const assignedCount = trips.length;
  const remainingCount = Math.max(0, quantity - assignedCount);
  const readyTrips = useMemo(() => trips.filter((trip) => trip.status === "ready" && (selectedTripId === undefined || trip.id === selectedTripId)), [trips, selectedTripId]);
  const printable = readyTrips.filter((trip) => Boolean(qrCodes[trip.id]));
  const sheets = useMemo(() => Array.from({ length: Math.ceil(printable.length / 5) }, (_, index) => printable.slice(index * 5, index * 5 + 5)), [printable]);

  async function load(): Promise<boolean> {
    setLoading(true); setError("");
    try {
      setData(await responseJson<BatchResponse>(await fetch(productionBatchId ? `/api/admin/card-trips?categoryId=${batchId}` : `/api/admin/card-trips?batchId=${batchId}`, { cache: "no-store" })));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load trip records.");
      return false;
    }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [batchId]);

  useEffect(() => {
    let cancelled = false;
    async function buildQrs() {
      const result: Record<number, string> = {};
      try {
        for (const trip of readyTrips) {
          if (cancelled) return;
          const code = trip.code;
          const url = new URL("/agent/card", window.location.origin);
          url.searchParams.set("code", code);
          result[trip.id] = await QRCode.toDataURL(url.toString(), { width: 260, margin: 1, errorCorrectionLevel: "M", color: { dark: "#15314c", light: "#ffffff" } });
        }
        if (!cancelled) setQrCodes(result);
      } catch {
        if (!cancelled) { setNotice(""); setError("QR codes could not be prepared. Refresh this page and try again."); }
      }
    }
    setQrCodes({});
    if (readyTrips.length) void buildQrs();
    return () => { cancelled = true; };
  }, [batchId, readyTrips]);

  async function createTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data?.nextSerial || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await responseJson<{ code: string }>(await fetch("/api/admin/card-trips", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productionBatchId ? { categoryId: batchId, productionBatchId, serial: data.nextSerial, origin, items: goods } : { batchId, serial: data.nextSerial, origin, items: goods }),
      }));
      setOrigin(""); setGoods([{ description: "" }]);
      if (await load()) setNotice(`Trip ${result.code} is ready to print. Its QR card is now reserved for this trip.`);
      else setError(`Trip ${result.code} was saved, but the trip card queue could not be refreshed. Retry to view it.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The trip could not be saved."); }
    finally { setSaving(false); }
  }

  function updateGoods(index: number, value: string) {
    setGoods((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: value } : item));
  }

  async function releaseTrip(trip: CardTrip) {
    setError(""); setNotice("");
    try {
      await responseJson(await fetch("/api/admin/card-trips", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId: trip.id, action: "release_hold", source: trip.source }) }));
      if (await load()) setNotice("Trip released. Its current checkpoint can be completed again.");
      else setError("The trip was released, but the queue could not be refreshed. Retry to view the latest status.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Trip could not be released."); }
  }

  async function deleteTrip(trip: CardTrip) {
    if (deletingTripKey !== null || trip.status !== "ready" || trip.verifications.length > 0) return;
    setDeletingTripKey(tripIdentity(trip)); setError(""); setNotice("");
    try {
      await responseJson(await fetch("/api/admin/card-trips", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: trip.id, source: trip.source }),
      }));
      if (await load()) setNotice(`Trip card ${trip.code} was deleted. Its card number is available to assign again.`);
      else setError("The trip card was deleted, but the queue could not be refreshed. Retry to view the latest cards.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The trip card could not be deleted."); }
    finally { setDeletingTripKey(null); }
  }

  async function confirmPendingAction() {
    if (!pendingConfirmation) return;
    const { action, trip } = pendingConfirmation;
    setPendingConfirmation(null);
    if (action === "release") await releaseTrip(trip);
    else await deleteTrip(trip);
  }

  useEffect(() => {
    if (!pendingConfirmation) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPendingConfirmation(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [pendingConfirmation]);

  async function printCards() {
    if (!printable.length || printing) return;
    setPrinting(true);
    window.print();
    window.setTimeout(() => setPrinting(false), 1000);
  }

  return <main className={`card-print-workspace print-tone-${tone}`}>
    <header className="card-print-toolbar"><Link href="/dashboard/fleet-registry" className="card-print-back"><ArrowLeft size={17}/> Fleet registry</Link><div className="card-print-toolbar-title"><span className="eyebrow">TRIP CARD SETUP</span><b>{vehicleClass} <i/> {destination}</b></div><button className="button button-primary" onClick={() => void printCards()} disabled={!printable.length || printing}><Printer size={16}/>{printing ? "Opening print dialog…" : `Print ${printable.length} ready card${printable.length === 1 ? "" : "s"}`}</button></header>
    <section className="card-print-info panel"><div className="card-print-title-icon"><Icon size={22}/></div><div><span className="eyebrow">ONE QR · ONE LOAD · THREE CHECKS</span><h1>{destination} {classLabel} Trip Cards</h1><p>Assign each card to a declared route and load before printing. Completed cards are permanently closed.</p></div><span className="card-print-count"><CheckCircle2 size={15}/>{loading ? "Loading stock" : `${remainingCount.toLocaleString("en-NG")} remaining · ${assignedCount.toLocaleString("en-NG")} assigned`}</span></section>

    {(error || notice) && <div className="card-print-feedback">
      {error && <div className="card-trip-inline-error card-trip-admin-error" role="alert"><ShieldAlert size={17}/><span>{error}</span><button className="button button-secondary button-small" onClick={() => { setNotice(""); void load(); }}><RefreshCw size={14}/> Retry</button></div>}
      {!error && notice && <div className="transport-card-notice card-print-notice" role="status"><CheckCircle2 size={16}/>{notice}</div>}
    </div>}

    <section className="card-trip-admin-layout">
      <form className="card-trip-panel card-trip-create" onSubmit={createTrip} aria-busy={saving}>
        <div className="card-trip-panel-heading"><span><Package size={18}/></span><div><h2>Prepare a trip card</h2><p>Set the departure point and declare the goods on this trip.</p></div></div>
        <div className={`card-trip-card-reservation${remainingCount === 0 ? " is-empty" : ""}`}><b>{data?.nextSerial ? `MAAF-BCH${String(rangeStart ?? batchId).padStart(4, "0")} · Card ${String(data.nextSerial).padStart(4, "0")}` : "No unassigned card numbers"}</b><span>{data?.nextSerial ? `Next card ${data.nextSerial} of ${quantity} · ${remainingCount.toLocaleString("en-NG")} cards remain` : "This allocation is fully assigned"}</span></div>
        <label className="card-trip-form-field">Travelling from<input value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="Departure location" maxLength={120} required/></label>
        <div className="card-trip-goods-editor"><div className="card-trip-editor-title"><div><b>Goods on this trip</b><span>Add each different item as a separate line.</span></div><button type="button" className="card-trip-add-item" onClick={() => setGoods((current) => [...current, { description: "" }])} disabled={goods.length >= 20}><CirclePlus size={15}/> Add item</button></div>
          {goods.map((item, index) => <div className="card-trip-goods-input-row card-trip-goods-description-only" key={index}><label>Goods<input value={item.description} onChange={(event) => updateGoods(index, event.target.value)} placeholder="e.g. Rice" maxLength={160} required/></label>{goods.length > 1 && <button type="button" className="card-trip-remove-item" aria-label="Remove goods item" onClick={() => setGoods((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={16}/></button>}</div>)}
        </div>
        <button className="button button-primary card-trip-create-submit" disabled={saving || loading || !data?.nextSerial}>{saving ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>} {saving ? "Saving trip…" : "Assign trip to this card"}</button>
        <p className="card-trip-create-note">Once assigned, this QR is permanently linked to this trip and cannot be assigned to another load.</p>
      </form>

      <section className="card-trip-panel card-trip-admin-list"><div className="card-trip-panel-heading"><span><Printer size={18}/></span><div><h2>Trip card queue</h2><p>Cards ready for print and trips requiring admin review.</p></div><span className="card-trip-queue-count">{trips.length}</span></div>
        {loading ? <div className="card-trip-queue-empty"><LoaderCircle className="spin"/> Loading trip records…</div> : trips.length === 0 ? <div className="card-trip-queue-empty"><Package size={22}/><b>No trip cards prepared</b><span>Assign a route and goods to the next card number.</span></div> : <div className="card-trip-queue-list">{trips.map((trip) => <article className={`card-trip-queue-item state-${trip.status}`} key={tripIdentity(trip)}><div className="card-trip-queue-top"><div><b>{trip.code}</b><span>{trip.vehicle_class} · {trip.items.map((item: CardTripItem) => item.description).join(", ")}</span></div><span className={`card-trip-queue-status status-${trip.status}`}>{trip.status.replace("_", " ")}</span></div><div className="card-trip-queue-route-row"><p>{trip.origin} <b>→</b> {trip.destination}</p>{trip.status === "ready" && trip.verifications.length === 0 && <button type="button" className="card-trip-delete-button" aria-label={`Delete trip card ${trip.code}`} title="Delete this card assignment so it can be redone" disabled={deletingTripKey !== null} onClick={() => setPendingConfirmation({ action: "delete", trip })}>{deletingTripKey === tripIdentity(trip) ? <LoaderCircle className="spin" size={15}/> : <Trash2 size={15}/>}</button>}</div><div className="card-trip-queue-foot"><span>{trip.verifications.filter((item) => item.outcome === "verified").length}/3 agent checks complete</span>{trip.status === "ready" ? <span className="card-trip-print-ready"><CheckCircle2 size={14}/> Ready to print</span> : trip.status === "on_hold" ? <button className="button button-secondary button-small" onClick={() => setPendingConfirmation({ action: "release", trip })}>Review and release</button> : trip.status === "completed" ? <span className="card-trip-closed-label">Card permanently closed</span> : <span>Trip in progress</span>}</div>{trip.status === "on_hold" && trip.verifications.filter((item) => item.outcome === "flagged").slice(-1).map((item, index) => <div className="card-trip-flag-note" key={index}><ShieldAlert size={14}/><span><b>{item.agent_name} flagged this trip:</b> {item.notes}</span></div>)}</article>)}</div>}
        <div className="card-trip-print-summary"><Printer size={16}/><span><b>{printable.length} card{printable.length === 1 ? "" : "s"} ready to print</b><small>Print sheets include only assigned trip cards that have not started checkpoint verification.</small></span></div>
      </section>
    </section>

    {printable.length > 0 && <section className="card-print-preview">
      <header className="card-print-preview-heading"><div><h2>Print preview</h2><p>Each trip card is paired with its matching front and back.</p></div><span>{printable.length} ready</span></header>
      <div className="print-document" aria-label={`${printable.length} assigned ${vehicleClass} trip cards for ${destination}`}>
      {sheets.map((sheet, sheetIndex) => <section className="print-sheet" key={sheetIndex}>
        <div className="print-side print-paired-side">{sheet.map((trip) => <div className="print-card-pair" key={`pair-${trip.id}`}>
          <article className="physical-card card-front"><div className="card-front-sky"><img className="card-vehicle-photo" src={vehiclePhoto} alt={`${vehicleClass} on the road`}/><span className="card-front-pill"><b>TRANSPORT</b><i/> <strong>{destination.toUpperCase()}</strong></span><span className="card-vehicle-label">{vehicleClass.toUpperCase()}</span></div></article>
          <article className="physical-card card-back">
            <div className="card-back-heading"><div><b>{destination.toUpperCase()}</b><strong>{classLabel.toUpperCase()} TRIP PASS</strong></div><span className="card-multimodal"><BusFront size={12}/><span>MAAF<br/>TRIP RECORD</span></span></div>
            <div className="card-back-content"><div className="card-qr-block"><img src={qrCodes[trip.id]} alt={`Scan trip card ${trip.code}`}/><small>{trip.code}</small></div><div className="card-id-stripe">{String(trip.serial).padStart(5, "0")}</div><div className="card-tap-area"><span className="tap-rings"><Wifi size={25}/></span><span className="tap-copy">SCAN<br/><b>TO VERIFY</b></span><small>THREE AGENT CHECKPOINTS</small></div></div>
            <div className="card-security-strip"><CheckCircle2 size={10}/> ONE TRIP · THREE CHECKS <span>{trip.code}</span></div>
          </article>
        </div>)}</div>
      </section>)}
      </div>
    </section>}
    {pendingConfirmation && <div className="card-trip-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingConfirmation(null); }}><section className="card-trip-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="card-trip-confirm-title" aria-describedby="card-trip-confirm-description"><div className={`card-trip-confirm-icon${pendingConfirmation.action === "delete" ? " is-delete" : " is-release"}`}>{pendingConfirmation.action === "delete" ? <Trash2 size={21}/> : <ShieldAlert size={21}/>}</div><button type="button" className="card-trip-confirm-close" aria-label="Close confirmation" onClick={() => setPendingConfirmation(null)}><X size={18}/></button><span className="eyebrow">{pendingConfirmation.action === "delete" ? "REMOVE CARD ASSIGNMENT" : "ADMIN REVIEW"}</span><h2 id="card-trip-confirm-title">{pendingConfirmation.action === "delete" ? "Delete this trip card?" : "Release this trip?"}</h2><p id="card-trip-confirm-description">{pendingConfirmation.action === "delete" ? <>Card <b>{pendingConfirmation.trip.code}</b> will be removed from this queue, and its card number can be assigned again.</> : <>This clears the admin hold and allows the trip to continue from its current checkpoint. The existing checkpoint record will remain.</>}</p><div className="card-trip-confirm-record"><span>{pendingConfirmation.trip.vehicle_class} · {pendingConfirmation.trip.origin} → {pendingConfirmation.trip.destination}</span><b>{pendingConfirmation.trip.code}</b></div><div className="card-trip-confirm-actions"><button type="button" className="button button-secondary" onClick={() => setPendingConfirmation(null)}>Cancel</button><button type="button" className={`button ${pendingConfirmation.action === "delete" ? "button-danger" : "button-primary"}`} onClick={() => void confirmPendingAction()}>{pendingConfirmation.action === "delete" ? <><Trash2 size={15}/> Delete card</> : <><Check size={15}/> Release trip</>}</button></div></section></div>}
    <footer className="card-print-footer">MAAF Transport Control <span>Each card is permanently reserved for one trip and closes after three successful agent checks.</span></footer>
  </main>;
}
