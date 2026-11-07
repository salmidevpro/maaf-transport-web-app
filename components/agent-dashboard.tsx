"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { IScannerControls } from "@zxing/browser";
import { Check, CheckCheck, CheckCircle2, Clock3, Home, History, ImagePlus, Inbox as InboxIcon, LoaderCircle, Mail, MapPin, MessageSquare, ScanLine, Send, Settings2, ShieldAlert, UserRound, QrCode, Camera, ChevronRight, ChevronDown, RefreshCw } from "lucide-react";
import { AgentCardTrip } from "@/components/agent-card-trip";
import { LogoutButton } from "@/components/logout-button";
import { BrandMark } from "@/components/brand-mark";

type AgentView = "Overview" | "Verify" | "Notifications" | "Settings";
type AgentStats = { name?: string; checkpointsToday: number; flaggedToday: number };
type Profile = { username: string; first_name: string; last_name: string; other_names: string; phone: string; location: string; origin_state: string; origin_lga: string; country: string; email_verified_at: string | Date | null; isRegistered: boolean; email: string; displayName: string };
type NotificationKind = "agent_activity" | "admin_message" | "agent_message";
type PortalMessage = { id: number; kind: NotificationKind; title: string; message: string; href: string; read_at: string | Date | null; created_at: string | Date; actor_name: string | null };
type Inbox = { notifications: PortalMessage[]; sent: PortalMessage[]; unread: number };
type AgentCheckpoint = { id: number; source: string; code: string; vehicle_class: string; origin: string; destination: string; step: number; outcome: "verified" | "flagged"; notes: string; checked_at: string | Date };

async function responseJson<T extends object>(response: Response): Promise<T> {
  const payload = await response.json() as T | { error?: string };
  if (!response.ok) throw new Error("error" in payload && payload.error ? payload.error : "The request could not be completed.");
  return payload as T;
}

function formatTime(value: string | Date) {
  const source = value instanceof Date ? value.toISOString() : String(value);
  const parsed = new Date(source.includes("T") ? source : `${source.replace(" ", "T")}Z`);
  return Number.isNaN(parsed.getTime()) ? source : new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function AgentAvatar({ initials, small = false, version = 0 }: { initials: string; small?: boolean; version?: number }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  return <span className={`agent-portal-avatar${small ? " is-small" : ""}`}>
    {!imageFailed && <img src={`/api/agent/account/avatar?v=${version}`} alt="" onLoad={() => setImageReady(true)} onError={(event) => { event.currentTarget.style.display = "none"; setImageFailed(true); }}/>}
    <b style={imageReady ? { display: "none" } : undefined}>{initials}</b>
  </span>;
}

export function AgentDashboard({ name, email, initialView = "Overview", initialCode = "" }: { name: string; email: string; initialView?: AgentView; initialCode?: string }) {
  const [view, setViewState] = useState<AgentView>(initialView);
  const [unread, setUnread] = useState(0);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [statsError, setStatsError] = useState("");
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "AG";

  function setView(nextView: AgentView) {
    if (nextView !== view) window.dispatchEvent(new CustomEvent("maaf:page-transition", { detail: { kind: "view" } }));
    setViewState(nextView);
  }

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const [overviewResponse, notificationResponse] = await Promise.all([
          fetch("/api/agent/overview", { cache: "no-store" }), fetch("/api/agent/notifications", { cache: "no-store" }),
        ]);
        const [overview, notifications] = await Promise.all([
          responseJson<AgentStats>(overviewResponse), responseJson<Inbox>(notificationResponse),
        ]);
        if (active) { setStats(overview); setUnread(notifications.unread); setStatsError(""); }
      } catch (error) { if (active) setStatsError(error instanceof Error ? error.message : "Dashboard information could not be loaded."); }
    };
    void refresh(); const timer = window.setInterval(() => void refresh(), 20000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setProfileMenuOpen(false); profileTriggerRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileMenuOpen]);

  const titles: Record<AgentView, string> = { Overview: "Agent dashboard", Verify: "Verify a trip", Notifications: "Inbox", Settings: "Profile and settings" };
  const subtitles: Record<AgentView, string> = {
    Overview: "Your field activity, checkpoint work, and messages from MAAF.",
    Verify: "Scan a trip card or enter its MAAF ID to record a checkpoint.",
    Notifications: "Messages from admins and updates about your field operations.",
    Settings: "Review your account and keep your contact details current.",
  };
  const nav: { view: AgentView; icon: typeof Home }[] = [
    { view: "Overview", icon: Home }, { view: "Verify", icon: ScanLine }, { view: "Notifications", icon: InboxIcon }, { view: "Settings", icon: Settings2 },
  ];

  return <main className="agent-portal">
    <aside className="agent-portal-sidebar">
      <a className="agent-portal-brand" href="/agent"><span><BrandMark size={42}/></span><b>maaf<small>FIELD OPERATIONS</small></b></a>
      <span className="agent-portal-nav-caption">WORKSPACE</span>
      <nav aria-label="Agent workspace">{nav.map(({ view: item, icon: Icon }) => <button key={item} type="button" className={view === item ? "is-active" : ""} onClick={() => setView(item)}><Icon size={18}/><span>{item === "Notifications" ? "Inbox" : item}</span>{item === "Notifications" && unread > 0 && <i>{unread > 99 ? "99+" : unread}</i>}</button>)}</nav>
      <div className="agent-portal-sidebar-account"><AgentAvatar key={avatarVersion} initials={initials} version={avatarVersion}/><span><b>{name}</b><small>{email}</small></span><LogoutButton compact label="Sign out"/></div>
    </aside>
    <section className="agent-portal-main">
      <header className="agent-portal-topbar"><div><span>MAAF AGENT WORKSPACE</span><b>{titles[view]}</b></div><div className="agent-topbar-actions"><button type="button" className="agent-bell-button" aria-label={`${unread} unread inbox messages`} onClick={() => setView("Notifications")}><InboxIcon size={19}/>{unread > 0 && <i>{unread > 99 ? "99+" : unread}</i>}</button><span className="agent-topbar-name">{name}</span><div className="agent-profile-menu-wrap" ref={profileMenuRef}><button ref={profileTriggerRef} type="button" className="agent-profile-trigger" aria-label="Open profile menu" aria-haspopup="true" aria-expanded={profileMenuOpen} aria-controls="agent-profile-menu" onClick={() => setProfileMenuOpen((open) => !open)}><AgentAvatar key={avatarVersion} initials={initials} small version={avatarVersion}/><ChevronDown size={13}/></button>{profileMenuOpen && <div className="agent-profile-menu" id="agent-profile-menu" role="group" aria-label="Agent profile menu"><div className="agent-profile-menu-account"><b>{name}</b><span>{email}</span></div><button type="button" className="agent-profile-menu-settings" onClick={() => { setView("Settings"); setProfileMenuOpen(false); }}><Settings2 size={15}/> Profile and settings</button><LogoutButton label="Sign out"/></div>}</div></div></header>
      <div className="agent-portal-content">
        <div className="agent-view-heading"><div><span className="section-kicker">{view === "Verify" ? "FIELD VERIFICATION" : view === "Notifications" ? "INBOX" : view === "Settings" ? "YOUR ACCOUNT" : "TODAY AT A GLANCE"}</span><h1>{titles[view]}</h1><p>{subtitles[view]}</p></div></div>
        {view === "Overview" && <section className="agent-overview-view">
          <div className="agent-welcome-panel"><div><span className="agent-welcome-icon"><ScanLine size={21}/></span><div><b>Welcome back, {name}</b><p>Every check you record is shared with the MAAF admin team.</p></div></div><button type="button" className="agent-primary-action" onClick={() => setView("Verify")}><ScanLine size={17}/> Verify a trip <ChevronRight size={16}/></button></div>
          {statsError && <div className="agent-inline-error" role="status">{statsError}</div>}
          <div className="agent-stats-grid">
            <article><span className="agent-stat-icon"><CheckCircle2 size={18}/></span><div><small>Trip checkpoints today</small><b>{stats?.checkpointsToday ?? "—"}</b><span>Recorded checkpoint actions</span></div></article>
            <article><span className="agent-stat-icon is-alert"><ShieldAlert size={18}/></span><div><small>Flagged today</small><b>{stats?.flaggedToday ?? "—"}</b><span>Items sent to admin review</span></div></article>
          </div>
          <div className="agent-overview-bottom">
            <section className="agent-overview-card"><div><span className="agent-overview-card-icon"><MessageSquare size={18}/></span><h2>Admin messages</h2></div><p>{unread ? `You have ${unread} unread notification${unread === 1 ? "" : "s"} from MAAF or about your field activity.` : "Messages and operation updates from the admin team will appear in your inbox."}</p><button type="button" onClick={() => setView("Notifications")}>Open inbox <ChevronRight size={15}/></button></section>
            <section className="agent-overview-card"><div><span className="agent-overview-card-icon"><UserRound size={18}/></span><h2>Your profile</h2></div><p>Update your phone number and address. Your registered name and username stay tied to your agent record.</p><button type="button" onClick={() => setView("Settings")}>View profile <ChevronRight size={15}/></button></section>
          </div>
        </section>}
        {view === "Verify" && <AgentVerificationWorkspace initialCode={initialCode}/>}
        {view === "Notifications" && <AgentNotificationInbox onUnreadChange={setUnread}/>}
        {view === "Settings" && <AgentProfileSettings name={name} email={email} avatarVersion={avatarVersion} onAvatarUpdated={() => setAvatarVersion((version) => version + 1)}/>}
        <footer className="agent-portal-footer"><span>© {new Date().getFullYear()} MAAF Transport Control</span><span><i/> Connected to MAAF Operations</span></footer>
      </div>
    </section>
  </main>;
}

function AgentVerificationWorkspace({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [activeCode, setActiveCode] = useState(initialCode);
  const [history, setHistory] = useState<AgentCheckpoint[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  async function loadHistory(append = false) {
    setHistoryLoading(true);
    try {
      const offset = append ? history.length : 0;
      const result = await responseJson<{ history: AgentCheckpoint[]; hasMore: boolean }>(await fetch(`/api/agent/checkpoint-history?offset=${offset}`, { cache: "no-store" }));
      setHistory((current) => append ? [...current, ...result.history] : result.history);
      setHistoryHasMore(result.hasMore);
      setHistoryError("");
    } catch (cause) { setHistoryError(cause instanceof Error ? cause.message : "Your verification history could not be loaded."); }
    finally { setHistoryLoading(false); }
  }
  useEffect(() => { void loadHistory(); }, []);
  function submitCode(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setActiveCode(code.trim()); }
  useEffect(() => {
    if (!cameraOn) return;
    let stopped = false; let controls: IScannerControls | undefined;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setCameraError("Camera scanning needs a secure connection and browser permission. Enter the MAAF ID below."); setCameraOn(false); return; }
    const video = videoRef.current;
    if (!video) return;
    void import("@zxing/browser").then(({ BrowserQRCodeReader }) => {
      if (stopped) return;
      const reader = new BrowserQRCodeReader();
      return reader.decodeFromVideoDevice(undefined, video, (result, _error, scannerControls) => {
        if (stopped) { scannerControls.stop(); return; }
        controls = scannerControls;
        if (result) { const value = result.getText(); setCode(value); setActiveCode(value); setCameraOn(false); setCameraError(""); scannerControls.stop(); }
      }).then((scannerControls) => { if (stopped) scannerControls.stop(); else controls = scannerControls; });
    })
      .catch((error: unknown) => { if (stopped) return; setCameraError(error instanceof Error ? error.message : "The camera could not be opened. Enter the card ID instead."); setCameraOn(false); });
    return () => { stopped = true; controls?.stop(); };
  }, [cameraOn]);
  return <div className="agent-verify-view">
    <section className="agent-trip-entry panel"><div><span className="agent-trip-entry-icon"><QrCode size={20}/></span><div><h2>Scan or enter a trip card</h2><p>Review the declared route and goods before recording a checkpoint.</p></div></div><div className="agent-trip-scan-actions"><button type="button" className="button button-secondary" onClick={() => { setCameraError(""); setCameraOn((current) => !current); }}><Camera size={16}/>{cameraOn ? "Stop scanner" : "Scan QR code"}</button>{cameraError && <small role="status">{cameraError}</small>}</div>{cameraOn && <div className="agent-camera-panel"><video ref={videoRef} playsInline muted aria-label="Trip card QR scanner"/><span>Point your camera at the trip card QR code.</span></div>}<form onSubmit={submitCode}><label htmlFor="agent-trip-code">MAAF ID or card QR value</label><div><input id="agent-trip-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="MAAF-BCH0001-XXXXXXXX" required/><button className="button button-primary"><ScanLine size={16}/> Open card</button></div></form></section>
    {activeCode && <AgentCardTrip code={activeCode} onCheckpointRecorded={() => void loadHistory()}/>}
    <section className="agent-check-history panel">
      <div className="agent-section-heading"><div><span className="agent-overview-card-icon"><History size={18}/></span><span><h2>Your verification history</h2><small>Cards and checkpoints you have verified or flagged</small></span></div><button type="button" className="agent-history-refresh" onClick={() => void loadHistory()} disabled={historyLoading} aria-label="Refresh verification history"><RefreshCw size={15} className={historyLoading ? "spin" : ""}/><span>Refresh</span></button></div>
      {historyError ? <div className="agent-form-feedback is-error" role="alert">{historyError}<button type="button" className="agent-history-retry" onClick={() => void loadHistory()}>Try again</button></div>
        : historyLoading && history.length === 0 ? <div className="agent-history-empty"><LoaderCircle className="spin" size={19}/>Loading your verification history…</div>
          : history.length ? <div className="agent-check-history-list">{history.map((check) => <article key={`${check.source}-${check.id}`}>
            <span className={`agent-history-result ${check.outcome}`}>{check.outcome === "verified" ? <CheckCircle2 size={16}/> : <ShieldAlert size={16}/>}</span>
            <div className="agent-history-main"><b>{check.code}</b><span>{check.vehicle_class} · {check.origin} → {check.destination}</span>{check.outcome === "flagged" && check.notes && <small>{check.notes}</small>}</div>
            <div className="agent-history-meta"><b>Checkpoint {check.step}</b><time>{formatTime(check.checked_at)}</time></div>
            <span className={`agent-history-status ${check.outcome}`}>{check.outcome === "verified" ? "Verified" : "Flagged"}</span>
          </article>)}</div>
          : <div className="agent-history-empty"><History size={22}/><b>No card checks yet</b><span>Your verified and flagged checkpoints will appear here.</span></div>}
      {historyHasMore && <button type="button" className="agent-history-load-more" onClick={() => void loadHistory(true)} disabled={historyLoading}>{historyLoading ? <LoaderCircle className="spin" size={15}/> : null}{historyLoading ? "Loading…" : "Load older checks"}</button>}
    </section>
  </div>;
}

function AgentNotificationInbox({ onUnreadChange }: { onUnreadChange: (count: number) => void }) {
  const [data, setData] = useState<Inbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function load() {
    try { const payload = await responseJson<Inbox>(await fetch("/api/agent/notifications", { cache: "no-store" })); setData(payload); onUnreadChange(payload.unread); setError(""); }
    catch (cause) { setNotice(""); setError(cause instanceof Error ? cause.message : "Notifications could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 20000); return () => window.clearInterval(timer); }, []);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { const payload = await responseJson<{ message: string }>(await fetch("/api/agent/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: draft }) })); setNotice(payload.message); setDraft(""); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Your message could not be sent."); }
    finally { setBusy(false); }
  }
  async function markRead(notificationId?: number) {
    try { await responseJson(await fetch("/api/agent/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(notificationId ? { notificationId } : { markAllRead: true }) })); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Notifications could not be updated."); }
  }
  return <div className="agent-notification-layout">
    <section className="agent-inbox panel"><div className="agent-section-heading"><div><span className="agent-overview-card-icon"><InboxIcon size={18}/></span><span><h2>Your inbox</h2><small>Admin messages and operation updates</small></span></div><span className="agent-inbox-unread">{data?.unread ?? 0} unread</span></div>
      {data?.unread ? <button type="button" className="agent-mark-all" onClick={() => void markRead()}><CheckCheck size={15}/> Mark all read</button> : null}
      {loading && !data ? <div className="agent-empty-inbox"><LoaderCircle className="spin" size={20}/> Loading inbox…</div> : data?.notifications.length ? <div className="agent-inbox-list">{data.notifications.map((item) => <article className={item.read_at ? "is-read" : "is-unread"} key={item.id}><span className={`agent-inbox-kind ${item.kind}`}>{item.kind === "admin_message" ? <Mail size={15}/> : item.kind === "agent_activity" ? <CheckCircle2 size={15}/> : <Send size={15}/>}</span><div><div className="agent-inbox-title"><b>{item.title}</b><time><Clock3 size={12}/>{formatTime(item.created_at)}</time></div><p>{item.message}</p>{!item.read_at && <button type="button" onClick={() => void markRead(item.id)}><Check size={14}/> Mark read</button>}</div></article>)}</div> : <div className="agent-empty-inbox"><InboxIcon size={22}/><b>You’re all caught up</b><span>New notes from MAAF will appear here.</span></div>}
    </section>
    <aside className="agent-contact-admin panel"><div className="agent-section-heading"><div><span className="agent-overview-card-icon"><MessageSquare size={18}/></span><span><h2>Contact admin</h2><small>Send a message to the active admin team</small></span></div></div><form onSubmit={(event) => void send(event)}><label htmlFor="agent-admin-message">Your message</label><textarea id="agent-admin-message" rows={5} maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask a question or share an update…" required/><div className="agent-compose-footer"><small>{draft.length} / 2,000</small><button className="button button-primary" disabled={busy || !draft.trim()}>{busy ? <LoaderCircle className="spin" size={15}/> : <Send size={15}/>} {busy ? "Sending…" : "Send to admin"}</button></div></form>{notice && <div className="agent-form-feedback is-success" role="status">{notice}</div>}{error && <div className="agent-form-feedback is-error" role="alert">{error}</div>}</aside>
    {data?.sent.length ? <section className="agent-sent-messages panel"><div className="agent-section-heading"><div><span className="agent-overview-card-icon"><Send size={18}/></span><span><h2>Sent messages</h2><small>Messages you have sent to admins</small></span></div></div>{data.sent.slice(0, 10).map((item) => <article key={item.id}><div><b>{item.title}</b><time>{formatTime(item.created_at)}</time></div><p>{item.message}</p></article>)}</section> : null}
  </div>;
}

function AgentProfileSettings({ name, email, avatarVersion, onAvatarUpdated }: { name: string; email: string; avatarVersion: number; onAvatarUpdated: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const passwordRules = [{ label: "At least 8 characters", valid: newPassword.length >= 8 }, { label: "One capital letter", valid: /[A-Z]/.test(newPassword) }, { label: "One special character", valid: /[^A-Za-z0-9]/.test(newPassword) }, { label: "One number", valid: /\d/.test(newPassword) }];
  useEffect(() => { let active = true; fetch("/api/agent/account", { cache: "no-store" }).then((response) => responseJson<{ profile: Profile }>(response)).then((data) => { if (active) setProfile(data.profile); }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Your profile could not be loaded."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  useEffect(() => { if (!avatarFile) { setAvatarPreview(""); return; } const url = URL.createObjectURL(avatarFile); setAvatarPreview(url); return () => URL.revokeObjectURL(url); }, [avatarFile]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!profile || busy) return;
    setBusy(true); setError(""); setNotice("");
    try { const payload = await responseJson<{ message: string }>(await fetch("/api/agent/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: profile.phone, location: profile.location }) })); setNotice(payload.message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Your profile could not be saved."); }
    finally { setBusy(false); }
  }
  async function uploadAvatar() {
    if (!avatarFile || avatarBusy) return;
    setAvatarBusy(true); setAvatarError(""); setAvatarMessage("");
    try { const form = new FormData(); form.set("image", avatarFile); await responseJson<{ success: true }>(await fetch("/api/agent/account/avatar", { method: "POST", body: form })); setAvatarFile(null); setAvatarMessage("Your profile photo has been updated."); onAvatarUpdated(); }
    catch (cause) { setAvatarError(cause instanceof Error ? cause.message : "Your profile photo could not be uploaded."); }
    finally { setAvatarBusy(false); }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (passwordBusy) return;
    setPasswordBusy(true); setPasswordError(""); setPasswordMessage("");
    try { const result = await responseJson<{ message: string }>(await fetch("/api/agent/account/password", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) })); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setPasswordMessage(result.message); }
    catch (cause) { setPasswordError(cause instanceof Error ? cause.message : "Your password could not be updated."); }
    finally { setPasswordBusy(false); }
  }
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "AG";
  return <div className="agent-settings-stack"><section className="agent-profile-settings panel"><div className="agent-profile-heading"><span className="agent-profile-avatar">{avatarPreview ? <img src={avatarPreview} alt="Selected profile preview"/> : <AgentAvatar key={avatarVersion} initials={initials} version={avatarVersion}/>}</span><div><h2>{name}</h2><p>{email}</p></div><span className="agent-profile-verified"><CheckCircle2 size={15}/> Agent account</span></div>
    <div className="agent-profile-photo"><input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; setAvatarFile(file); setAvatarMessage(""); setAvatarError(file && file.size > 500 * 1024 ? "Choose an image no larger than 500 KB." : ""); }} /><div><b>Profile photo</b><span>Upload a JPG, PNG, or WebP image up to 500 KB.</span></div><button type="button" className="button button-secondary" onClick={() => avatarInputRef.current?.click()}><ImagePlus size={16}/>{avatarFile ? "Choose another" : "Choose photo"}</button>{avatarFile && <button type="button" className="button button-primary" onClick={() => void uploadAvatar()} disabled={avatarBusy || avatarFile.size > 500 * 1024}>{avatarBusy ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>} {avatarBusy ? "Uploading…" : "Upload photo"}</button>}{avatarMessage && <div className="agent-form-feedback is-success" role="status">{avatarMessage}</div>}{avatarError && <div className="agent-form-feedback is-error" role="alert">{avatarError}</div>}</div>
    {loading ? <div className="agent-profile-loading"><LoaderCircle className="spin" size={19}/> Loading profile…</div> : profile ? <form onSubmit={(event) => void save(event)}>
      {!profile.isRegistered && <div className="agent-profile-note">Your account details are shown here, and your phone and address can still be updated.</div>}
      <div className="agent-profile-readonly"><div><small>USERNAME</small><b>{profile.username}</b></div><div><small>{profile.isRegistered ? "REGISTERED NAME" : "ACCOUNT NAME"}</small><b>{profile.isRegistered ? [profile.first_name, profile.other_names, profile.last_name].filter(Boolean).join(" ") || name : profile.displayName}</b></div><div><small>EMAIL ADDRESS</small><b>{email}</b></div></div>
      <div className="agent-profile-edit-grid"><label>Phone number<input type="tel" maxLength={40} value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} required/></label><label>Address<input maxLength={120} autoComplete="street-address" value={profile.location} onChange={(event) => setProfile({ ...profile, location: event.target.value })} required/></label></div>
      {(profile.origin_state || profile.origin_lga || profile.country) && <div className="agent-profile-location"><MapPin size={16}/><span>Origin details</span><b>{[profile.origin_state ? `State: ${profile.origin_state}` : "", profile.origin_lga ? `Local government: ${profile.origin_lga}` : "", profile.country].filter(Boolean).join(" · ")}</b></div>}
      <div className="agent-profile-actions"><span>Only your phone number and address can be changed here.</span><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>} {busy ? "Saving…" : "Save profile"}</button></div>
      {notice && <div className="agent-form-feedback is-success" role="status">{notice}</div>}{error && <div className="agent-form-feedback is-error" role="alert">{error}</div>}
    </form> : <div className="agent-form-feedback is-error" role="alert">{error || "Your agent profile could not be found."}</div>}
  </section><section className="agent-profile-settings panel"><div className="agent-profile-heading"><span className="agent-profile-verified"><ShieldAlert size={16}/></span><div><h2>Change password</h2><p>Choose a new password for your agent sign-in.</p></div></div><form onSubmit={(event) => void changePassword(event)} className="agent-password-form"><label>Current password<input type="password" autoComplete="current-password" maxLength={256} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required/></label><div className="agent-profile-edit-grid"><label>New password<input type="password" autoComplete="new-password" maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required/></label><label>Confirm new password<input type="password" autoComplete="new-password" maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required/></label></div><div className="agent-password-rules">{passwordRules.map((rule) => <span className={rule.valid ? "is-valid" : ""} key={rule.label}>{rule.valid ? "✓" : "·"} {rule.label}</span>)}</div>{newPassword && confirmPassword && newPassword !== confirmPassword && <p className="agent-password-mismatch">The passwords do not match yet.</p>}{passwordMessage && <div className="agent-form-feedback is-success" role="status">{passwordMessage}</div>}{passwordError && <div className="agent-form-feedback is-error" role="alert">{passwordError}</div>}<div className="agent-profile-actions"><span>Other active sessions will be signed out.</span><button className="button button-primary" disabled={passwordBusy || passwordRules.some((rule) => !rule.valid) || newPassword !== confirmPassword}>{passwordBusy ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>} {passwordBusy ? "Updating password…" : "Update password"}</button></div></form></section></div>;
}

