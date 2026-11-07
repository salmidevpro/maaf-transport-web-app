"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Check, LoaderCircle, Plus, ShieldCheck, Users, X } from "lucide-react";

type RecordItem = { id: number; first_name: string; last_name: string; other_names: string; created_at: string; nin: string | null; username: string | null; email: string | null; active: number | null; phone: string | null; location: string | null; origin_state: string | null; origin_lga: string | null; country: string | null; status: string };
const blank = { firstName: "", lastName: "", otherNames: "", nin: "" };
async function readResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  try { return JSON.parse(text) as T; }
  catch { throw new Error(`Server returned an unexpected response (${response.status}). Check the database connection and the dev-server log.`); }
}

export function AdminAgentAccess() {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [form, setForm] = useState(blank);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<RecordItem | null>(null);
  const [ninToSave, setNinToSave] = useState("");
  const [ninError, setNinError] = useState("");
  const [savingNin, setSavingNin] = useState(false);
  const [ninLoaded, setNinLoaded] = useState(false);
  const [ninLoadError, setNinLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { const response = await fetch("/api/admin/agent-preregistrations", { cache: "no-store" }); const result = await readResponse<RecordItem[] | { error?: string }>(response); if (!response.ok || !Array.isArray(result)) throw new Error((result as {error?:string}).error || "Could not load the agent access list."); setRecords(result); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not load the pre-registration list."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const recordId = selected.id;
    setNinLoaded(false); setNinLoadError("");
    fetch(`/api/admin/agent-preregistrations/${recordId}`, { cache: "no-store" })
      .then(async (response) => { const result = await readResponse<{ nin?: string | null; error?: string }>(response); if (!response.ok) throw new Error(result.error || "Could not load the protected NIN."); if (!cancelled) setSelected((current)=>current?.id===recordId?{...current,nin:result.nin??null}:current); })
      .catch((error)=>{ if (!cancelled) setNinLoadError(error instanceof Error?error.message:"Could not load the protected NIN."); })
      .finally(()=>{ if (!cancelled) setNinLoaded(true); });
    return ()=>{cancelled=true;};
  }, [selected?.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/agent-preregistrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await readResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Could not pre-register this agent.");
      setForm(blank); setMessage("Agent pre-registered. They can now create an account with this NIN."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not pre-register this agent."); }
    finally { setBusy(false); }
  }

  function openRecord(record: RecordItem) { setSelected(record); setNinToSave(""); setNinError(""); setNinLoaded(false); setNinLoadError(""); }
  async function saveNin() {
    if (!selected || !/^\d{11}$/.test(ninToSave)) { setNinError("Enter the 11-digit NIN for this agent."); return; }
    setSavingNin(true); setNinError("");
    try {
      const response = await fetch("/api/admin/agent-preregistrations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id, nin: ninToSave }) });
      const result = await readResponse<{ error?: string; nin?: string }>(response);
      if (!response.ok || !result.nin) throw new Error(result.error || "Could not save NIN.");
      const updated = { ...selected, nin: result.nin };
      setSelected(updated); setNinToSave(""); setRecords((current)=>current.map((record)=>record.id===updated.id?updated:record));
    } catch (error) { setNinError(error instanceof Error ? error.message : "Could not save NIN."); }
    finally { setSavingNin(false); }
  }

  return <div className="agent-access-view">
    <div className="agent-access-intro"><span className="agent-access-icon"><ShieldCheck size={20}/></span><div><h2>Pre-register agents</h2><p>Add an agent’s name and NIN to MAAF’s approved signup list. Their names will be matched to this record and locked during signup.</p></div></div>
    <div className="agent-access-grid">
      <form className="panel agent-prereg-form" onSubmit={submit}>
        <div className="panel-heading"><div><h2>Add an agent</h2><p>Only admins can add or view these records.</p></div></div>
        <label>First name<input value={form.firstName} onChange={(e)=>setForm({...form,firstName:e.target.value})} maxLength={80} required/></label>
        <label>Last name<input value={form.lastName} onChange={(e)=>setForm({...form,lastName:e.target.value})} maxLength={80} required/></label>
        <label>Other name(s)<input value={form.otherNames} onChange={(e)=>setForm({...form,otherNames:e.target.value})} maxLength={120}/></label>
        <label>NIN<input value={form.nin} onChange={(e)=>setForm({...form,nin:e.target.value.replace(/\D/g,"").slice(0,11)})} inputMode="numeric" autoComplete="off" maxLength={11} placeholder="11 digits" required/></label>
        <p className="agent-prereg-privacy">NINs are encrypted at rest and shown only to admins viewing an agent record.</p>
        {message && <div className="signup-preview-notice" role="status">{message}</div>}
        <button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <Plus size={16}/>} Pre-register agent</button>
      </form>
      <section className="panel agent-prereg-list">
        <div className="panel-heading"><div><h2>Agent access list</h2><p>{records.length} people pre-registered</p></div><span className="agent-list-count"><Users size={16}/>{records.length}</span></div>
        {loading ? <div className="agent-list-empty">Loading agent access list…</div> : records.length === 0 ? <div className="agent-list-empty"><Users size={22}/><b>No agents pre-registered</b><span>Add a person to let them create an agent account.</span></div> : <div className="agent-access-table-wrap"><table className="agent-access-table"><thead><tr><th>AGENT</th><th>ACCOUNT</th><th>STATUS</th></tr></thead><tbody>{records.map((record)=><tr key={record.id} className="agent-access-record-row" tabIndex={0} role="button" aria-label={`View record for ${record.first_name} ${record.last_name}`} onClick={()=>openRecord(record)} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openRecord(record);}}}><td><b>{[record.first_name,record.other_names,record.last_name].filter(Boolean).join(" ")}</b><small>Names from admin pre-registration</small></td><td>{record.email ? <><b>{record.username}</b><small>{record.email}</small></> : <span>Not signed up</span>}</td><td><span className={`agent-access-status ${record.active ? "is-created" : "is-pending"}`}>{record.active ? <Check size={13}/> : <ArrowRight size={13}/>} {record.status}</span></td></tr>)}</tbody></table><p className="agent-record-hint">Select a record to view details.</p></div>}
      </section>
    </div>
    {selected && <div className="modal-backdrop agent-record-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)setSelected(null);}}><section className="modal agent-record-modal" role="dialog" aria-modal="true" aria-labelledby="agent-record-title"><div className="modal-header"><div><span className="eyebrow">AGENT ACCESS RECORD</span><h2 id="agent-record-title">{[selected.first_name,selected.other_names,selected.last_name].filter(Boolean).join(" ")}</h2><p>Pre-registration and submitted account information.</p></div><button className="icon-button" onClick={()=>setSelected(null)} aria-label="Close record"><X size={19}/></button></div><div className="agent-record-detail-grid"><div className="agent-record-detail"><span>FIRST NAME</span><b>{selected.first_name}</b></div><div className="agent-record-detail"><span>LAST NAME</span><b>{selected.last_name}</b></div><div className="agent-record-detail"><span>OTHER NAME(S)</span><b>{selected.other_names || "Not provided"}</b></div><div className="agent-record-detail"><span>PRE-REGISTRATION</span><b>{new Date(selected.created_at).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"})}</b></div><div className="agent-record-detail"><span>ACCOUNT STATUS</span><b>{selected.status}</b></div><div className="agent-record-detail agent-record-nin"><span>NATIONAL IDENTIFICATION NUMBER</span>{!ninLoaded ? <b>Loading protected NIN…</b> : ninLoadError ? <b>{ninLoadError}</b> : selected.nin ? <b>{selected.nin}</b> : <><b>Not available on this earlier record</b><small>The NIN was hashed before encrypted viewing was added. Re-enter it below to save and display it.</small></>}</div><div className="agent-record-detail"><span>USERNAME</span><b>{selected.username || "Not created yet"}</b></div><div className="agent-record-detail"><span>EMAIL</span><b>{selected.email || "Not provided yet"}</b></div><div className="agent-record-detail"><span>PHONE</span><b>{selected.phone || "Not provided yet"}</b></div><div className="agent-record-detail"><span>ADDRESS</span><b>{selected.location || "Not provided yet"}</b></div><div className="agent-record-detail"><span>STATE OF ORIGIN</span><b>{selected.origin_state || "Not provided yet"}</b></div><div className="agent-record-detail"><span>LOCAL GOVERNMENT OF ORIGIN</span><b>{selected.origin_lga || "Not provided yet"}</b></div><div className="agent-record-detail"><span>COUNTRY</span><b>{selected.country || "Not provided yet"}</b></div></div>{ninLoaded && !ninLoadError && !selected.nin && <div className="agent-record-nin-form"><label htmlFor="record-nin">Re-enter NIN for this record</label><div><input id="record-nin" inputMode="numeric" autoComplete="off" maxLength={11} value={ninToSave} onChange={(event)=>setNinToSave(event.target.value.replace(/\D/g,"").slice(0,11))} placeholder="11-digit NIN"/><button className="button button-primary" disabled={savingNin} onClick={saveNin}>{savingNin ? "Saving…" : "Save NIN"}</button></div>{ninError && <p role="alert">{ninError}</p>}</div>}<div className="modal-footer"><span><ShieldCheck size={15}/> NIN is encrypted; this view is admin-only.</span><div><button className="button button-primary" onClick={()=>setSelected(null)}>Done</button></div></div></section></div>}
  </div>;
}
