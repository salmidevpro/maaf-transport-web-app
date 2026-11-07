"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, BusFront, CalendarDays, CarFront, Check, LoaderCircle, Pencil, Plus, Printer, RefreshCw, ShieldCheck, Trash2, Truck, X } from "lucide-react";
import { cardDestinations, cardVehicleClasses, cardsPerProductionBatch, type TransportCardCategory, type TransportProductionBatch } from "@/lib/card-batches";
import { TestBatchSandbox } from "@/components/test-batch-sandbox";

const classIcons: Record<string, typeof BusFront> = { Cars: CarFront, Jeep: Truck, Bus: BusFront };
const destinationTones: Record<string, string> = { Oyo: "oyo", Olorunda: "olorunda", Target: "target", Jimba: "jimba" };

async function readJsonResponse<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text();
  let result: unknown = null;
  if (text) {
    try { result = JSON.parse(text); }
    catch { throw new Error(response.ok ? "The server returned an unreadable response. " + fallback : "The request failed (" + response.status + "). " + fallback); }
  }
  if (!response.ok) throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "The request failed (" + response.status + "). " + fallback);
  if (result === null) throw new Error("The server returned an empty response. " + fallback);
  return result as T;
}

function todayForDateInput() {
  const date = new Date();
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function formatBatchDate(value: string) {
  const date = new Date(value.slice(0, 10) + "T00:00:00");
  return new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function uniqueOptions(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function TransportCardBatches({ onTotalChange }: { onTotalChange?: (total: number) => void }) {
  const [batches, setBatches] = useState<TransportProductionBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [batchError, setBatchError] = useState<{ batchId: number; message: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [batchDate, setBatchDate] = useState(todayForDateInput);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const creatingBatchRef = useRef(false);
  const [categoryBatchId, setCategoryBatchId] = useState<number | null>(null);
  const [newVehicleClass, setNewVehicleClass] = useState("Cars");
  const [addingVehicleClass, setAddingVehicleClass] = useState(false);
  const [customVehicleClass, setCustomVehicleClass] = useState("");
  const [newDestination, setNewDestination] = useState("");
  const [addingDestination, setAddingDestination] = useState(false);
  const [customDestination, setCustomDestination] = useState("");
  const [newQuantity, setNewQuantity] = useState("250");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [availableDraft, setAvailableDraft] = useState("");
  const [savingCategoryId, setSavingCategoryId] = useState<number | null>(null);
  const [deletingCategoryId, setDeletingCategoryId] = useState<number | null>(null);
  const [deletingBatchId, setDeletingBatchId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ category: TransportCardCategory; batch: TransportProductionBatch } | null>(null);
  const [pendingBatchDelete, setPendingBatchDelete] = useState<TransportProductionBatch | null>(null);
  const [collapsedBatches, setCollapsedBatches] = useState<number[]>([]);

  async function loadBatches(signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const result = await readJsonResponse<TransportProductionBatch[] | { error?: string }>(await fetch("/api/admin/transport-card-batches", { cache: "no-store", signal }), "Could not load production batches.");
      if (!Array.isArray(result)) throw new Error("The server returned invalid batch data. Refresh and try again.");
      setBatches(result);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "Could not load production batches.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }

  useEffect(() => { const controller = new AbortController(); void loadBatches(controller.signal); return () => controller.abort(); }, []);
  useEffect(() => {
    if (!pendingDelete && !pendingBatchDelete) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && deletingCategoryId === null && deletingBatchId === null) {
        setPendingDelete(null);
        setPendingBatchDelete(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [pendingDelete, pendingBatchDelete, deletingCategoryId, deletingBatchId]);
  const totalAllocated = useMemo(() => batches.reduce((sum, batch) => sum + Number(batch.allocated_quantity), 0), [batches]);
  const totalAvailable = useMemo(() => batches.reduce((sum, batch) => sum + Math.max(0, Number(batch.allocated_quantity) - Number(batch.assigned_quantity ?? 0)), 0), [batches]);
  const nextBatchRangeStart = batches.length
    ? Math.max(...batches.map((batch) => Number(batch.range_start))) + cardsPerProductionBatch
    : 1;
  const vehicleClasses = useMemo(() => uniqueOptions([...cardVehicleClasses, ...batches.flatMap((batch) => batch.categories.map((category) => category.vehicle_class))]), [batches]);
  const destinationOptions = useMemo(() => uniqueOptions([...cardDestinations, ...batches.flatMap((batch) => batch.categories.map((category) => category.destination))]), [batches]);
  useEffect(() => { onTotalChange?.(totalAvailable); }, [totalAvailable, onTotalChange]);

  async function createBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creatingBatchRef.current) return;
    creatingBatchRef.current = true;
    setCreatingBatch(true); setError(""); setNotice("");
    try {
      const result = await readJsonResponse<TransportProductionBatch>(await fetch("/api/admin/transport-card-batches", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchDate }),
      }), "Could not create the batch.");
      setBatches((current) => [result, ...current]);
      setCategoryBatchId(result.id);
      setNotice("Batch BCH" + String(result.range_start).padStart(4, "0") + " created for " + formatBatchDate(result.batch_date) + ".");
      window.setTimeout(() => setNotice(""), 4500);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create the batch."); }
    finally { creatingBatchRef.current = false; setCreatingBatch(false); }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>, batch: TransportProductionBatch) {
    event.preventDefault();
    if (creatingCategory) return;
    setCreatingCategory(true); setError(""); setBatchError(null); setNotice("");
    try {
      const vehicleClass = (addingVehicleClass ? customVehicleClass : newVehicleClass).trim();
      const destination = (addingDestination ? customDestination : newDestination).trim();
      const category = await readJsonResponse<TransportCardCategory>(await fetch("/api/admin/transport-card-batches", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productionBatchId: batch.id, vehicleClass, destination, quantity: Number(newQuantity) }),
      }), "Could not add the category.");
      setBatches((current) => current.map((item) => item.id === batch.id ? {
        ...item, allocated_quantity: item.allocated_quantity + category.allocated_quantity,
        categories: [...item.categories, category],
      } : item));
      setNewVehicleClass(vehicleClass); setAddingVehicleClass(false); setCustomVehicleClass("");
      setNewDestination(""); setAddingDestination(false); setCustomDestination("");
      setNewQuantity("250"); setCategoryBatchId(null);
      setNotice(category.allocated_quantity.toLocaleString("en-NG") + " " + category.vehicle_class + " cards for " + category.destination + " added to batch BCH" + String(batch.range_start).padStart(4, "0") + ".");
      window.setTimeout(() => setNotice(""), 4500);
    } catch (cause) { setBatchError({ batchId: batch.id, message: cause instanceof Error ? cause.message : "Could not add the category." }); }
    finally { setCreatingCategory(false); }
  }

  function startEditing(category: TransportCardCategory) {
    setError(""); setBatchError(null);
    setEditingCategoryId(category.id);
    setAvailableDraft(String(Math.max(0, Number(category.allocated_quantity) - Number(category.assigned_quantity ?? 0))));
  }

  async function saveAvailable(category: TransportCardCategory, batch: TransportProductionBatch) {
    const available = Number(availableDraft);
    if (!Number.isSafeInteger(available) || available < 0 || savingCategoryId !== null) return;
    setSavingCategoryId(category.id); setError(""); setBatchError(null); setNotice("");
    try {
      const response = await readJsonResponse<{ category: TransportCardCategory; batchAllocated: number }>(await fetch("/api/admin/transport-card-batches", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: category.id, availableQuantity: available }),
      }), "Could not update the available card count.");
      setBatches((current) => current.map((item) => item.id === batch.id ? {
        ...item, allocated_quantity: response.batchAllocated,
        categories: item.categories.map((entry) => entry.id === category.id ? response.category : entry),
      } : item));
      setEditingCategoryId(null);
      setNotice("Available card count updated.");
      window.setTimeout(() => setNotice(""), 4000);
    } catch (cause) { setBatchError({ batchId: batch.id, message: cause instanceof Error ? cause.message : "Could not update the available card count." }); }
    finally { setSavingCategoryId(null); }
  }

  async function deleteCategory(category: TransportCardCategory, batch: TransportProductionBatch) {
    if (deletingCategoryId !== null) return;
    setDeletingCategoryId(category.id); setError(""); setBatchError(null); setNotice("");
    try {
      await readJsonResponse(await fetch("/api/admin/transport-card-batches", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: category.id }),
      }), "Could not delete this category.");
      setBatches((current) => current.map((item) => item.id === batch.id ? {
        ...item, allocated_quantity: Math.max(0, item.allocated_quantity - category.allocated_quantity),
        categories: item.categories.filter((entry) => entry.id !== category.id),
      } : item));
      setPendingDelete(null);
      setNotice("Category deleted.");
      window.setTimeout(() => setNotice(""), 4000);
    } catch (cause) { setBatchError({ batchId: batch.id, message: cause instanceof Error ? cause.message : "Could not delete this category." }); }
    finally { setDeletingCategoryId(null); }
  }

  async function deleteBatch(batch: TransportProductionBatch) {
    if (deletingBatchId !== null) return;
    setDeletingBatchId(batch.id); setError(""); setBatchError(null); setNotice("");
    try {
      await readJsonResponse(await fetch("/api/admin/transport-card-batches", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productionBatchId: batch.id }),
      }), "Could not delete this batch.");
      setBatches((current) => current.filter((item) => item.id !== batch.id));
      setCategoryBatchId((current) => current === batch.id ? null : current);
      setPendingBatchDelete(null);
      setNotice("Batch BCH" + String(batch.range_start).padStart(4, "0") + " deleted.");
      window.setTimeout(() => setNotice(""), 4000);
    } catch (cause) { setBatchError({ batchId: batch.id, message: cause instanceof Error ? cause.message : "Could not delete this batch." }); }
    finally { setDeletingBatchId(null); }
  }

  return <div className="transport-card-inventory">
    <section className="transport-card-summary panel">
      <div className="transport-card-summary-copy"><span className="transport-card-summary-icon"><Printer size={21}/></span><div><span className="eyebrow">CARD ALLOCATION</span><h2>Production batches</h2><p>Create a dated batch, then organize its cards into vehicle class and destination categories.</p></div></div>
      <div className="transport-total"><span>Cards available</span><b>{loading ? "—" : totalAvailable.toLocaleString("en-NG")}</b><small>{loading ? "Loading allocation" : `of ${totalAllocated.toLocaleString("en-NG")} allocated across ${batches.length} batches`}</small></div>
      <div className="transport-stock-status"><ShieldCheck size={15}/> Each batch can contain up to 5,000 cards. Create a new batch when you reach the limit.</div>
    </section>

    <form className="transport-batch-form panel" onSubmit={createBatch} aria-busy={creatingBatch}>
      <div className="transport-batch-form-title"><div><span className="eyebrow">NEW PRODUCTION RUN</span><h2>Create a batch</h2><p>Set the batch date. Its card number range is assigned automatically.</p></div><span className="transport-batch-form-plus"><CalendarDays size={19}/></span></div>
      <div className="transport-batch-fields transport-parent-batch-fields">
        <label>Batch date<input type="date" value={batchDate} onChange={(event) => setBatchDate(event.target.value)} required/></label>
        <div className="transport-batch-preview"><span>Next batch number</span><b>{loading ? "—" : "MAAF-BCH" + String(nextBatchRangeStart).padStart(4, "0")}</b></div>
        <button className="button button-primary" type="submit" disabled={creatingBatch || loading}>{creatingBatch ? <LoaderCircle className="spin" size={16}/> : <Plus size={16}/>} {creatingBatch ? "Creating…" : "Create batch"}</button>
      </div>
      <p className="transport-batch-form-hint">New batches reserve sequential ranges: 0001, 5001, 10001, and so on. The sequence continues across dates.</p>
    </form>

    {error && <div className="transport-card-alert" role="alert"><span><b>Batch needs attention</b>{error}</span><button className="button button-secondary button-small" onClick={() => void loadBatches()}><RefreshCw size={14}/> Retry</button></div>}
    {notice && <div className="transport-card-notice" role="status"><Check size={15}/>{notice}</div>}

    {loading && batches.length === 0 ? <div className="transport-card-loading panel"><LoaderCircle className="spin" size={20}/> Loading batches…</div> : !loading && batches.length === 0 ? <div className="transport-card-loading panel">No production batches yet. Create one above to start an allocation.</div> : <div className="transport-production-list">{batches.map((batch, batchIndex) => {
      const rangeEnd = batch.range_start + cardsPerProductionBatch - 1;
      const rangeText = String(batch.range_start).padStart(4, "0") + "–" + String(rangeEnd).padStart(4, "0");
      const remaining = Math.max(0, cardsPerProductionBatch - batch.allocated_quantity);
      const overCapacity = Math.max(0, batch.allocated_quantity - cardsPerProductionBatch);
      const isCollapsed = collapsedBatches.includes(batch.id);
      return <Fragment key={batch.id}><section className="transport-production-batch panel">
        <div className="transport-production-heading">
          <span className="transport-production-date-icon"><CalendarDays size={18}/></span>
          <div><span className="eyebrow">MAAF BATCH</span><h2>{formatBatchDate(batch.batch_date)}</h2><p>MAAF-BCH{String(batch.range_start).padStart(4, "0")} · Card numbers {rangeText}</p></div>
          <div className={"transport-production-totals" + (overCapacity ? " is-over-capacity" : "")}><b>{batch.allocated_quantity.toLocaleString("en-NG")} / {cardsPerProductionBatch.toLocaleString("en-NG")}</b><span>cards allocated</span>{overCapacity > 0 && <small>{overCapacity.toLocaleString("en-NG")} above batch limit</small>}</div>
          <button type="button" className="transport-category-icon-button is-delete transport-production-delete" aria-label={"Delete batch " + batch.id} title={batch.assigned_quantity > 0 ? "Cannot delete: this batch has assigned cards" : "Delete empty batch"} disabled={batch.assigned_quantity > 0 || deletingBatchId === batch.id} onClick={() => setPendingBatchDelete(batch)}>{deletingBatchId === batch.id ? <LoaderCircle className="spin" size={15}/> : <Trash2 size={15}/>}</button>
          <button type="button" className={"transport-production-toggle" + (isCollapsed ? " is-collapsed" : "")} aria-label={(isCollapsed ? "Expand" : "Collapse") + " batch " + batch.id} aria-expanded={!isCollapsed} aria-controls={"production-batch-content-" + batch.id} title={(isCollapsed ? "Expand" : "Collapse") + " batch"} onClick={() => setCollapsedBatches((current) => isCollapsed ? current.filter((id) => id !== batch.id) : [...current, batch.id])}><span className="transport-production-toggle-mark" aria-hidden="true"><i/></span></button>
        </div>
        <div id={"production-batch-content-" + batch.id} className={"transport-production-content" + (isCollapsed ? " is-collapsed" : "")} aria-hidden={isCollapsed} inert={isCollapsed}>
        <div className="transport-production-content-inner">
        <div className="transport-production-capacity"><span><i style={{ width: Math.min(100, batch.allocated_quantity / cardsPerProductionBatch * 100) + "%" }}/></span><small>{remaining > 0 ? remaining.toLocaleString("en-NG") + " card slots available" : "Batch limit reached"}</small></div>
        <div className="transport-batch-add-action"><button type="button" onClick={() => { setCategoryBatchId(categoryBatchId === batch.id ? null : batch.id); setError(""); }}><Plus size={14}/>{categoryBatchId === batch.id ? "Close category form" : "Add category"}</button></div>
        {batchError?.batchId === batch.id && <div className="transport-card-alert transport-batch-inline-alert" role="alert"><span><b>Batch needs attention</b>{batchError.message}</span><button type="button" className="button button-secondary button-small" onClick={() => { setBatchError(null); void loadBatches(); }}><RefreshCw size={14}/> Retry</button></div>}
        {categoryBatchId === batch.id && remaining > 0 && <form className="transport-category-form" onSubmit={(event) => void addCategory(event, batch)} aria-busy={creatingCategory}>
          <label>Vehicle class{addingVehicleClass ? <div className="transport-new-option-field"><input value={customVehicleClass} onChange={(event) => setCustomVehicleClass(event.target.value)} maxLength={60} placeholder="Enter vehicle class" required/><button type="button" onClick={() => setAddingVehicleClass(false)}>Choose saved</button></div> : <select value={newVehicleClass} onChange={(event) => { if (event.target.value === "__add_vehicle_class__") { setCustomVehicleClass(""); setAddingVehicleClass(true); } else setNewVehicleClass(event.target.value); }} required>{vehicleClasses.map((value) => <option key={value} value={value}>{value}</option>)}<option value="__add_vehicle_class__">+ Add a vehicle class…</option></select>}</label>
          <label>Destination{addingDestination ? <div className="transport-new-option-field"><input value={customDestination} onChange={(event) => setCustomDestination(event.target.value)} maxLength={120} placeholder="Enter destination" required/><button type="button" onClick={() => setAddingDestination(false)}>Choose saved</button></div> : <select value={newDestination} onChange={(event) => { if (event.target.value === "__add_destination__") { setCustomDestination(""); setAddingDestination(true); } else setNewDestination(event.target.value); }} required><option value="" disabled>Select a destination</option>{destinationOptions.map((value) => <option key={value} value={value}>{value}</option>)}<option value="__add_destination__">+ Add a destination…</option></select>}</label>
          <label>Number of cards<input type="number" min="1" max={remaining} value={newQuantity} onChange={(event) => setNewQuantity(event.target.value)} required disabled={remaining <= 0}/></label>
          <button className="button button-primary" type="submit" disabled={creatingCategory || remaining <= 0}>{creatingCategory ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>} {creatingCategory ? "Adding…" : "Add category"}</button>
        </form>}
        {categoryBatchId === batch.id && remaining <= 0 && <div className="transport-category-full" role="status"><b>This batch has reached its 5,000-card limit.</b><span>Create another batch to allocate more cards.</span></div>}
        <div className="transport-category-list">{batch.categories.map((category) => {
          const Icon = classIcons[category.vehicle_class] ?? BusFront;
          const assigned = Number(category.assigned_quantity ?? 0);
          const categoryRemaining = Math.max(0, Number(category.allocated_quantity) - assigned);
          const tone = destinationTones[category.destination] ?? "other";
          return <article className={"transport-destination-card " + tone} key={category.id}>
            <div className="transport-destination-top"><span className="transport-category-class"><Icon size={15}/>{category.vehicle_class}</span><span className="transport-category-mark">{category.destination.slice(0, 1).toUpperCase()}</span></div>
            <h3 className="transport-category-destination">{category.destination}</h3>
            {editingCategoryId === category.id ? <form className="transport-available-editor" onSubmit={(event) => { event.preventDefault(); void saveAvailable(category, batch); }}>
              <label>Cards available<input type="number" min={assigned > 0 ? 0 : 1} max={categoryRemaining + remaining} step="1" value={availableDraft} onChange={(event) => setAvailableDraft(event.target.value)} autoFocus required/></label>
            </form> : <div className="transport-card-quantity"><b>{categoryRemaining.toLocaleString("en-NG")}</b><span>cards available</span></div>}
            <div className="transport-card-assigned">{assigned.toLocaleString("en-NG")} assigned of {category.allocated_quantity.toLocaleString("en-NG")}</div>
            <div className="transport-batch-footer"><span><i/> {assigned.toLocaleString("en-NG")} assigned</span><div className="transport-category-controls">
              <Link className="transport-print-link" href={"/dashboard/card-print/" + category.id}><Printer size={15}/> Prepare trips <ArrowUpRight size={14}/></Link>
              {editingCategoryId === category.id ? <>
                <button type="button" className="transport-category-icon-button is-save" aria-label="Save available card count" title="Save available card count" disabled={savingCategoryId === category.id} onClick={() => void saveAvailable(category, batch)}>{savingCategoryId === category.id ? <LoaderCircle className="spin" size={15}/> : <Check size={15}/>}</button>
                <button type="button" className="transport-category-icon-button" aria-label="Cancel editing" title="Cancel editing" onClick={() => setEditingCategoryId(null)}><X size={15}/></button>
              </> : <>
                <button type="button" className="transport-category-icon-button" aria-label={"Edit cards available for " + category.vehicle_class + " in " + category.destination} title="Edit cards available" onClick={() => startEditing(category)}><Pencil size={14}/></button>
                <button type="button" className="transport-category-icon-button is-delete" aria-label={"Delete " + category.vehicle_class + " in " + category.destination} title={assigned > 0 ? "Cannot delete: trip cards are already assigned" : "Delete category"} disabled={assigned > 0 || deletingCategoryId === category.id} onClick={() => setPendingDelete({ category, batch })}>{deletingCategoryId === category.id ? <LoaderCircle className="spin" size={14}/> : <Trash2 size={14}/>}</button>
              </>}
            </div></div>
          </article>;
        })}{batch.categories.length === 0 && <div className="transport-category-empty">No categories yet. Use “Add category” to allocate cards inside this batch.</div>}</div>
        </div>
        </div>
      </section>{batchIndex === 0 && <TestBatchSandbox/>}</Fragment>;
    })}</div>}
    {pendingDelete && <div className="transport-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && deletingCategoryId === null) setPendingDelete(null); }}>
      <section className="transport-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="transport-delete-title" aria-describedby="transport-delete-description">
        <div className="transport-confirm-icon"><Trash2 size={19}/></div>
        <div className="transport-confirm-copy">
          <span className="eyebrow">DELETE CATEGORY</span>
          <h2 id="transport-delete-title">Delete this card category?</h2>
          <p id="transport-delete-description">This removes the unused card allocation from this batch. The action cannot be undone.</p>
        </div>
        <div className="transport-confirm-summary">
          <span>{pendingDelete.category.vehicle_class} <i/> {pendingDelete.category.destination}</span>
          <b>MAAF-BCH{String(pendingDelete.batch.range_start).padStart(4, "0")}</b>
          <small>{Number(pendingDelete.category.allocated_quantity).toLocaleString("en-NG")} cards allocated</small>
        </div>
        {batchError?.batchId === pendingDelete.batch.id && <div className="transport-confirm-error" role="alert">{batchError.message}</div>}
        <div className="transport-confirm-actions">
          <button type="button" className="button button-secondary" autoFocus disabled={deletingCategoryId !== null} onClick={() => { setPendingDelete(null); setError(""); setBatchError(null); }}>Cancel</button>
          <button type="button" className="button transport-confirm-delete" disabled={deletingCategoryId !== null} onClick={() => void deleteCategory(pendingDelete.category, pendingDelete.batch)}>
            {deletingCategoryId === pendingDelete.category.id ? <LoaderCircle className="spin" size={15}/> : <Trash2 size={15}/>}
            {deletingCategoryId === pendingDelete.category.id ? "Deleting…" : "Delete category"}
          </button>
        </div>
      </section>
    </div>}
    {pendingBatchDelete && <div className="transport-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && deletingBatchId === null) setPendingBatchDelete(null); }}>
      <section className="transport-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="transport-batch-delete-title" aria-describedby="transport-batch-delete-description">
        <div className="transport-confirm-icon"><Trash2 size={19}/></div>
        <div className="transport-confirm-copy">
          <span className="eyebrow">DELETE BATCH</span>
          <h2 id="transport-batch-delete-title">Delete this batch?</h2>
          <p id="transport-batch-delete-description">This permanently removes the batch and its unused categories. A batch with assigned cards cannot be deleted.</p>
        </div>
        <div className="transport-confirm-summary">
          <span>{formatBatchDate(pendingBatchDelete.batch_date)}</span>
          <b>MAAF-BCH{String(pendingBatchDelete.range_start).padStart(4, "0")}</b>
          <small>{Number(pendingBatchDelete.allocated_quantity).toLocaleString("en-NG")} cards allocated · 0 assigned</small>
        </div>
        {batchError?.batchId === pendingBatchDelete.id && <div className="transport-confirm-error" role="alert">{batchError.message}</div>}
        <div className="transport-confirm-actions">
          <button type="button" className="button button-secondary" autoFocus disabled={deletingBatchId !== null} onClick={() => { setPendingBatchDelete(null); setBatchError(null); }}>Cancel</button>
          <button type="button" className="button transport-confirm-delete" disabled={deletingBatchId !== null} onClick={() => void deleteBatch(pendingBatchDelete)}>
            {deletingBatchId === pendingBatchDelete.id ? <LoaderCircle className="spin" size={15}/> : <Trash2 size={15}/>}
            {deletingBatchId === pendingBatchDelete.id ? "Deleting…" : "Delete batch"}
          </button>
        </div>
      </section>
    </div>}
  </div>;
}
