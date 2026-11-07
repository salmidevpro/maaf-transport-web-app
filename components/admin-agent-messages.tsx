"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Bell, Check, CheckCheck, Clock3, LoaderCircle, Mail, Send, ShieldAlert, UserRound } from "lucide-react";

type MessageKind = "agent_activity" | "admin_message" | "agent_message";
type PortalMessage = { id: number; kind: MessageKind; title: string; message: string; href: string; read_at: string | Date | null; created_at: string | Date; actor_name: string | null; actor_email: string | null };
type Agent = { id: number; name: string; email: string };
type AdminInbox = { notifications: PortalMessage[]; sent: PortalMessage[]; agents: Agent[]; unread: number };

function formatTime(value: string | Date) {
  const parsed = value instanceof Date ? value : new Date(String(value).replace(" ", "T") + (String(value).includes("Z") ? "" : "Z"));
  return Number.isNaN(parsed.getTime()) ? String(value) : new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

async function responseJson<T extends object>(response: Response): Promise<T> {
  const data = await response.json() as T | { error?: string };
  if (!response.ok) throw new Error("error" in data && data.error ? data.error : "The request could not be completed.");
  return data as T;
}

export function AdminAgentMessages({ onUnreadCountChange }: { onUnreadCountChange?: (count: number) => void }) {
  const [data, setData] = useState<AdminInbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recipientId, setRecipientId] = useState("all");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      const payload = await responseJson<AdminInbox>(await fetch("/api/admin/agent-messages", { cache: "no-store" }));
      setData(payload); setError(""); onUnreadCountChange?.(payload.unread);
    } catch (cause) { setNotice(""); setError(cause instanceof Error ? cause.message : "Agent messages could not be loaded."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 20000); return () => window.clearInterval(timer); }, []);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await responseJson<{ message: string }>(await fetch("/api/admin/agent-messages", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientId, message: draft }),
      }));
      setNotice(result.message); setDraft(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The message could not be sent."); }
    finally { setBusy(false); }
  }

  async function markRead(notificationId?: number) {
    try {
      await responseJson(await fetch("/api/admin/agent-messages", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(notificationId ? { notificationId } : { markAllRead: true }),
      }));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Notifications could not be updated."); }
  }

  return <div className="portal-messaging-layout">
    <section className="portal-message-compose panel">
      <div className="portal-panel-heading"><span className="portal-panel-icon"><Send size={19}/></span><div><h2>Message agents</h2><p>Send a note to one active agent or the full agent team.</p></div></div>
      <form onSubmit={(event) => void sendMessage(event)}>
        <label>Send to<select value={recipientId} onChange={(event) => setRecipientId(event.target.value)} disabled={!data?.agents.length}><option value="all">All active agents</option>{data?.agents.map((agent) => <option value={agent.id} key={agent.id}>{agent.name} · {agent.email}</option>)}</select></label>
        <label>Message<textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} rows={5} placeholder="Write an update or instruction for the field team…" required/></label>
        <div className="portal-compose-footer"><small>{draft.length} / 2,000</small><button className="button button-primary" disabled={busy || !draft.trim() || !data?.agents.length}>{busy ? <LoaderCircle className="spin" size={16}/> : <Send size={16}/>} {busy ? "Sending…" : "Send message"}</button></div>
      </form>
      {notice && <div className="portal-feedback is-success" role="status"><Check size={16}/>{notice}</div>}
      {error && <div className="portal-feedback is-error" role="alert"><ShieldAlert size={16}/>{error}</div>}
    </section>

    <section className="portal-message-inbox panel">
      <div className="portal-panel-heading"><span className="portal-panel-icon"><Bell size={19}/></span><div><h2>Agent activity and messages</h2><p>Checkpoint actions, vehicle checks, and messages agents send to admins.</p></div><span className="portal-unread-count">{data?.unread ?? 0} unread</span></div>
      {data?.unread ? <button type="button" className="portal-mark-all" onClick={() => void markRead()}><CheckCheck size={15}/> Mark all read</button> : null}
      {loading && !data ? <div className="portal-message-empty"><LoaderCircle className="spin" size={19}/> Loading agent activity…</div> : data?.notifications.length ? <div className="portal-message-list">{data.notifications.map((item) => <article className={`portal-message-item ${item.read_at ? "is-read" : "is-unread"}`} key={item.id}>
        <span className={`portal-message-kind ${item.kind}`}>{item.kind === "agent_activity" ? <ShieldAlert size={14}/> : item.kind === "agent_message" ? <Mail size={14}/> : <Bell size={14}/>}</span>
        <div className="portal-message-content"><div className="portal-message-title"><b>{item.title}</b><time><Clock3 size={12}/>{formatTime(item.created_at)}</time></div><p>{item.message}</p><small>{item.actor_name || "Agent account"}{item.actor_email ? ` · ${item.actor_email}` : ""}</small></div>
        {!item.read_at && <button type="button" className="portal-read-button" title="Mark as read" aria-label={`Mark ${item.title} as read`} onClick={() => void markRead(item.id)}><Check size={16}/></button>}
      </article>)}</div> : <div className="portal-message-empty"><Bell size={20}/><b>No agent activity yet</b><span>Agent checks and messages will appear here.</span></div>}
    </section>

    {data?.sent.length ? <section className="portal-message-sent panel"><div className="portal-panel-heading"><span className="portal-panel-icon"><CheckCheck size={18}/></span><div><h2>Recently sent</h2><p>Your latest messages to the agent team.</p></div></div><div className="portal-sent-list">{data.sent.slice(0, 6).map((item) => <article key={item.id}><div><b>{item.title}</b><time>{formatTime(item.created_at)}</time></div><p>{item.message}</p></article>)}</div></section> : null}
  </div>;
}

