"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { BusFront, CarFront, Check, Clock3, LoaderCircle, Plus, RotateCcw, Trash2, Truck, X } from "lucide-react";
import { cardDestinations, cardVehicleClasses, cardsPerProductionBatch } from "@/lib/card-batches";

type PracticeTrip = { id: number; serial: number; code: string; origin: string; goods: string[]; status: string };
type PracticeCategory = { id: number; vehicleClass: string; destination: string; allocated: number; trips: PracticeTrip[] };
type PracticeSandbox = { sessionToken: string; expiresAt: string; data: { categories: PracticeCategory[] } };
const vehicleIcons: Record<string, typeof BusFront> = { Cars: CarFront, Jeep: Truck, Bus: BusFront };

async function readSandboxResponse(response: Response): Promise<PracticeSandbox> {
  const result = await response.json().catch(() => null) as (PracticeSandbox & { error?: string }) | null;
  if (!response.ok || !result) throw new Error(result?.error || "The practice batch could not be loaded.");
  return result;
}

function PracticeCardQr({ code }: { code: string }) {
  const [image, setImage] = useState("");
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(code, { width: 112, margin: 1, errorCorrectionLevel: "M" }).then((value) => { if (active) setImage(value); }).catch(() => setImage(""));
    return () => { active = false; };
  }, [code]);
  return image ? <img className="test-trip-qr" src={image} alt={`QR code for practice trip ${code}`} width={56} height={56}/> : <span className="test-trip-qr-placeholder" aria-label="Creating practice trip QR code"><LoaderCircle size={15}/></span>;
}

function countdownLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

export function TestBatchSandbox() {
  const [sandbox, setSandbox] = useState<PracticeSandbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [vehicleClass, setVehicleClass] = useState("Cars");
  const [customVehicleClass, setCustomVehicleClass] = useState("");
  const [destination, setDestination] = useState("Oyo");
  const [customDestination, setCustomDestination] = useState("");
  const [quantity, setQuantity] = useState("10");
  const [drafts, setDrafts] = useState<Record<number, { origin: string; goods: string[] }>>({});
  const [message, setMessage] = useState("");
  const expiryRefreshStarted = useRef(false);
  const categories = sandbox?.data.categories ?? [];
  const allocated = categories.reduce((sum, category) => sum + category.allocated, 0);
  const assigned = categories.reduce((sum, category) => sum + category.trips.length, 0);
  const chosenVehicle = vehicleClass === "__custom__" ? customVehicleClass.trim() : vehicleClass;
  const chosenDestination = destination === "__custom__" ? customDestination.trim() : destination;

  const loadSandbox = useCallback(async (expired = false) => {
    setLoading(true);
    try {
      const next = await readSandboxResponse(await fetch("/api/admin/test-batch", { cache: "no-store" }));
      setSandbox(next);
      setMessage(expired ? "The previous 10-minute practice session expired and was cleared. A fresh sandbox is ready." : "");
      expiryRefreshStarted.current = false;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The practice batch could not be loaded.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadSandbox(); }, [loadSandbox]);

  useEffect(() => {
    if (!sandbox) return;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((new Date(sandbox.expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0 && !expiryRefreshStarted.current) {
        expiryRefreshStarted.current = true;
        void loadSandbox(true);
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [sandbox, loadSandbox]);

  async function updateSandbox(action: string, values: Record<string, unknown>) {
    if (!sandbox) return;
    setMessage("");
    try {
      const response = await fetch("/api/admin/test-batch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, action, sessionToken: sandbox.sessionToken }),
      });
      const next = await readSandboxResponse(response);
      setSandbox(next);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The practice batch could not be updated.");
      if (error instanceof Error && error.message.toLowerCase().includes("expired")) void loadSandbox(true);
      return false;
    }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(quantity);
    if (!chosenVehicle || !chosenDestination || !Number.isSafeInteger(amount) || amount < 1) return;
    const saved = await updateSandbox("add_category", { vehicleClass: chosenVehicle, destination: chosenDestination, allocated: amount });
    if (!saved) return;
    setVehicleClass("Cars"); setCustomVehicleClass(""); setDestination("Oyo"); setCustomDestination(""); setQuantity("10");
    setMessage("Practice category added. Production records were not changed.");
    setShowForm(false);
  }

  async function assignPracticeTrip(event: FormEvent<HTMLFormElement>, category: PracticeCategory) {
    event.preventDefault();
    const draft = drafts[category.id] ?? { origin: "", goods: [""] };
    const goods = draft.goods.map((item) => item.trim()).filter(Boolean);
    if (!draft.origin.trim() || goods.length === 0 || category.trips.length >= category.allocated) return;
    if (await updateSandbox("assign_trip", { categoryId: category.id, origin: draft.origin.trim(), goods })) {
      setDrafts((current) => ({ ...current, [category.id]: { origin: "", goods: [""] } }));
      setMessage("Practice card assigned. Scan its QR code in the Agent Portal to verify it.");
    }
  }

  async function removePracticeTrip(categoryId: number, tripId: number) {
    await updateSandbox("undo_trip", { categoryId, tripId });
  }

  const selectedVehicleOptions = Array.from(new Set([...cardVehicleClasses, ...categories.map((category) => category.vehicleClass)]));
  const selectedDestinationOptions = Array.from(new Set([...cardDestinations, ...categories.map((category) => category.destination)]));

  return <section className="transport-production-batch panel test-batch-panel" aria-labelledby="test-batch-title">
    <div className="transport-production-heading test-batch-heading">
      <span className="transport-production-date-icon"><RotateCcw size={18}/></span>
      <div><span className="eyebrow">PRACTICE AREA · ISOLATED</span><h2 id="test-batch-title">Test batch</h2><p>Temporary practice data · MAAF-TEST cards</p></div>
      <div className="transport-production-totals"><b>{loading ? "—" : `${allocated.toLocaleString("en-NG")} / ${cardsPerProductionBatch.toLocaleString("en-NG")}`}</b><span>cards allocated</span><small>{assigned.toLocaleString("en-NG")} practice cards assigned</small></div>
      <button type="button" className={"transport-production-toggle" + (!expanded ? " is-collapsed" : "")} aria-label={(expanded ? "Collapse" : "Expand") + " test batch"} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><span className="transport-production-toggle-mark" aria-hidden="true"><i/></span></button>
    </div>
    {expanded && <div className="test-batch-content">
      <div className="test-batch-notice"><Check size={16}/><p><b>This is a temporary sandbox.</b> Practice cards can be scanned and verified in the Agent Portal. They are stored separately from production. This session clears automatically after 10 minutes; all its categories, cards, and checks are then deleted.</p></div>
      {sandbox && <div className="test-batch-expiry" role="timer"><Clock3 size={15}/><span>Practice session ends in <b>{countdownLabel(secondsLeft)}</b></span></div>}
      {message && <p className="test-batch-feedback" role="status">{message}</p>}
      {!sandbox && loading && <p className="test-batch-feedback" role="status">Loading the practice sandbox…</p>}
      <div className="test-batch-actions"><span>{Math.max(0, cardsPerProductionBatch - allocated).toLocaleString("en-NG")} practice card slots available</span><button type="button" className="button button-secondary" disabled={!sandbox || loading} onClick={() => { setShowForm((value) => !value); setMessage(""); }}><Plus size={15}/>{showForm ? "Close form" : "Add practice category"}</button></div>
      {showForm && <form className="transport-category-form test-category-form" onSubmit={addCategory}>
        <label>Vehicle class<select value={vehicleClass} onChange={(event) => setVehicleClass(event.target.value)}>{selectedVehicleOptions.map((item) => <option value={item} key={item}>{item}</option>)}<option value="__custom__">+ Add a vehicle class…</option></select>{vehicleClass === "__custom__" && <input className="test-custom-input" value={customVehicleClass} onChange={(event) => setCustomVehicleClass(event.target.value)} placeholder="Enter a vehicle class" maxLength={60} required/>}</label>
        <label>Destination<select value={destination} onChange={(event) => setDestination(event.target.value)}>{selectedDestinationOptions.map((item) => <option value={item} key={item}>{item}</option>)}<option value="__custom__">+ Add a destination…</option></select>{destination === "__custom__" && <input className="test-custom-input" value={customDestination} onChange={(event) => setCustomDestination(event.target.value)} placeholder="Enter a destination" maxLength={120} required/>}</label>
        <label>Cards allocated<input type="number" min="1" max={cardsPerProductionBatch - allocated} value={quantity} onChange={(event) => setQuantity(event.target.value)} required/></label>
        <button type="submit" className="button button-primary" disabled={loading}><Plus size={15}/> Add category</button>
      </form>}
      <div className="transport-category-list test-category-list">{categories.map((category) => {
        const Icon = vehicleIcons[category.vehicleClass] ?? BusFront;
        const available = category.allocated - category.trips.length;
        const draft = drafts[category.id] ?? { origin: "", goods: [""] };
        return <article className="transport-destination-card test-destination-card" key={category.id}>
          <div className="transport-destination-top"><span className="transport-category-class"><Icon size={15}/>{category.vehicleClass}</span><span className="transport-category-mark">{category.destination.slice(0, 1).toUpperCase()}</span></div>
          <h3 className="transport-category-destination">{category.destination}</h3>
          <div className="transport-card-quantity"><b>{available.toLocaleString("en-NG")}</b><span>practice cards available</span></div>
          <div className="transport-card-assigned">{category.trips.length} assigned of {category.allocated}</div>
          <form className="test-trip-form" onSubmit={(event) => void assignPracticeTrip(event, category)}>
            <label>Practice departure<input value={draft.origin} onChange={(event) => setDrafts((current) => ({ ...current, [category.id]: { ...draft, origin: event.target.value } }))} placeholder="e.g. Ibadan" maxLength={120} required/></label>
            <div className="test-goods-editor"><div className="test-goods-heading"><b>Goods on this practice trip</b><button type="button" onClick={() => setDrafts((current) => ({ ...current, [category.id]: { ...draft, goods: [...draft.goods, ""] } }))} disabled={draft.goods.length >= 20}><Plus size={14}/> Add item</button></div>{draft.goods.map((item, index) => <div className="test-goods-row" key={index}><label htmlFor={`test-goods-${category.id}-${index}`}>Item {index + 1}<input id={`test-goods-${category.id}-${index}`} value={item} onChange={(event) => setDrafts((current) => ({ ...current, [category.id]: { ...draft, goods: draft.goods.map((value, itemIndex) => itemIndex === index ? event.target.value : value) } }))} placeholder="e.g. Rice" maxLength={160} required={index === 0}/></label>{draft.goods.length > 1 && <button type="button" title="Remove goods item" aria-label={`Remove goods item ${index + 1}`} onClick={() => setDrafts((current) => ({ ...current, [category.id]: { ...draft, goods: draft.goods.filter((_, itemIndex) => itemIndex !== index) } }))}><X size={14}/></button>}</div>)}</div>
            <button type="submit" className="button button-primary" disabled={available <= 0 || loading}><Check size={15}/> Assign practice card</button>
          </form>
          {category.trips.length > 0 && <div className="test-trip-list"><b>Practice trip cards</b>{category.trips.map((trip) => <div className="test-trip-row" key={trip.id}><PracticeCardQr code={trip.code}/><span><strong>{trip.code}</strong><small>{trip.origin} → {category.destination} · {trip.goods.join(", ")}</small></span><button type="button" title="Undo this practice assignment" aria-label={`Undo practice card ${trip.code}`} disabled={loading} onClick={() => void removePracticeTrip(category.id, trip.id)}><Trash2 size={14}/></button></div>)}</div>}
          <button type="button" className="test-remove-category" disabled={category.trips.length > 0 || loading} title={category.trips.length ? "Undo practice card assignments first" : "Remove practice category"} onClick={() => void updateSandbox("delete_category", { categoryId: category.id })}><Trash2 size={14}/> Remove practice category</button>
        </article>;
      })}</div>
    </div>}
  </section>;
}
