"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { IScannerControls } from "@zxing/browser";
import {
  ArrowRight, BusFront, Camera, Check, CheckCircle2,
  ChevronDown, Clock3, Download,
  FileBarChart2, ImagePlus, LayoutDashboard, Menu, MessageCircle, QrCode,
  Settings2, ShieldAlert, ShieldCheck, SlidersHorizontal,
  UserCog, UserRoundCheck, Users, X, ScanLine,
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { BrandMark } from "@/components/brand-mark";
import { AdminAgentAccess } from "@/components/admin-agent-access";
import { AdminUsersRoles } from "@/components/admin-users-roles";
import { AdminTransportReports } from "@/components/admin-transport-reports";
import { TransportCardBatches } from "@/components/transport-card-batches";
import { productionBatchRangeStart } from "@/lib/card-batches";
import { AdminAgentMessages } from "@/components/admin-agent-messages";

type View = "Overview" | "Fleet registry" | "Agent access" | "Users & roles" | "Verification" | "Agent messages" | "Reports" | "Settings";
type OverviewData = {
  accounts: {
    admins: { total: number; active: number; inactive: number; suspended: number };
    agents: { total: number; active: number; inactive: number; suspended: number; pending: number };
  };
  cards: { allocated: number; assigned: number };
  batches: number;
  trips: Record<string, number>;
  verification: { total: number; verified: number; flagged: number };
  agentAccess: { total: number; awaitingSignup: number; active: number; pendingVerification: number };
  recentBatches: { id: number; batch_date: string; allocated_quantity: number; assigned_quantity: number }[];
  recentChecks: { id: number; code: string; step: number; outcome: "verified" | "flagged"; checked_at: string | Date; agent_name: string; origin: string; destination: string; vehicle_class: string }[];
};

const navItems: { label: View; icon: typeof LayoutDashboard }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Fleet registry", icon: BusFront },
  { label: "Agent access", icon: Users },
  { label: "Users & roles", icon: UserCog },
  { label: "Verification", icon: ScanLine },
  { label: "Agent messages", icon: MessageCircle },
  { label: "Reports", icon: FileBarChart2 },
];
const viewPaths: Record<View, string> = {
  Overview: "/dashboard",
  "Fleet registry": "/dashboard/fleet-registry",
  "Agent access": "/dashboard/agent-access",
  "Users & roles": "/dashboard/users-roles",
  Verification: "/dashboard/verification",
  "Agent messages": "/dashboard/agent-messages",
  Reports: "/dashboard/reports",
  Settings: "/dashboard/settings",
};
function formatLastVerified(value: string) {
  const date = new Date(value);
  if (!value.includes("T") || Number.isNaN(date.getTime())) return value;
  const dateKey = (input: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(input);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const time = new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" }).format(date);
  if (dateKey(date) === dateKey(today)) return `Today, ${time}`;
  if (dateKey(date) === dateKey(yesterday)) return `Yesterday, ${time}`;
  return new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function AdminDashboard({ userEmail, userName, userLastName = "", userSurname = "", initialView = "Overview" }: { userEmail: string; userName: string; userLastName?: string; userSurname?: string; initialView?: View }) {
  const [adminName, setAdminName] = useState(userName);
  const [adminLastName, setAdminLastName] = useState(userLastName);
  const [adminSurname, setAdminSurname] = useState(userSurname);
  const [adminEmail, setAdminEmail] = useState(userEmail);
  const [displayDate, setDisplayDate] = useState("");
  const [profileImageVersion, setProfileImageVersion] = useState(0);
  const pathname = usePathname();
  const router = useRouter();
  const view = Object.entries(viewPaths).find(([, path]) => path === pathname)?.[0] as View | undefined ?? initialView;
  const [mobileMenu, setMobileMenu] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [totalCards, setTotalCards] = useState<number | null>(null);
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [agentMessageUnread, setAgentMessageUnread] = useState(0);
  const avatarInitials = [adminName, adminLastName, adminSurname].filter(Boolean).map((part) => part.trim()[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "AD";

  useEffect(() => {
    setDisplayDate(new Intl.DateTimeFormat("en-NG", {
      weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos",
    }).format(new Date()).toUpperCase());
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setProfileMenuOpen(false); };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOnOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [profileMenuOpen]);

  useEffect(() => {
    let active = true;
    const refreshCardAvailability = async () => {
      try {
        const response = await fetch("/api/admin/transport-card-batches", { cache: "no-store" });
        if (!response.ok) return;
        const batches = await response.json() as Array<{ allocated_quantity: number; assigned_quantity: number }>;
        if (!active || !Array.isArray(batches)) return;
        setTotalCards(batches.reduce((sum, batch) => sum + Math.max(0, Number(batch.allocated_quantity) - Number(batch.assigned_quantity ?? 0)), 0));
      } catch {
        // Keep the latest known availability when a background refresh is unavailable.
      }
    };
    void refreshCardAvailability();
    const timer = window.setInterval(() => void refreshCardAvailability(), 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    const refreshOverview = async () => {
      try {
        const response = await fetch("/api/admin/overview", { cache: "no-store" });
        const payload = await response.json() as OverviewData | { error?: string };
        if (!response.ok || !("accounts" in payload)) throw new Error("error" in payload ? payload.error : "Overview data could not be loaded.");
        if (active) { setOverviewData(payload); setOverviewError(""); }
      } catch (error) {
        if (active) setOverviewError(error instanceof Error ? error.message : "Overview data could not be loaded.");
      }
    };
    void refreshOverview();
    const timer = window.setInterval(() => void refreshOverview(), 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    const refreshAgentUnread = async () => {
      try {
        const response = await fetch("/api/admin/agent-messages?summary=1", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { unread?: number };
        if (active) setAgentMessageUnread(Math.max(0, Number(payload.unread) || 0));
      } catch {
        // Keep the last known notification count if the background request fails.
      }
    };
    void refreshAgentUnread();
    const timer = window.setInterval(() => void refreshAgentUnread(), 20000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  function setView(nextView: View) {
    setMobileMenu(false);
    if (nextView !== view) window.dispatchEvent(new CustomEvent("maaf:page-transition", { detail: { kind: "route" } }));
    router.push(viewPaths[nextView]);
  }

  useEffect(() => {
    if (!mobileMenu) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".menu-button")) return;
      if (event.target instanceof Node && !sidebarRef.current?.contains(event.target)) setMobileMenu(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenu(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileMenu]);

  return (
    <main className="app-shell">
      <aside ref={sidebarRef} id="admin-mobile-sidebar" className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand"><div className="brand-mark"><BrandMark size={34}/></div><div><b>maaf<span>.</span></b><small>TRANSPORT CONTROL</small></div><button className="icon-button close-menu" aria-label="Close navigation" onClick={() => setMobileMenu(false)}><X size={17}/></button></div>
        <div className="workspace-switch"><div className="workspace-avatar">M</div><div className="workspace-copy"><b>MAAF Operations</b><small>Admin workspace</small></div><ChevronDown size={15} /></div>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${view === label ? "nav-active" : ""}`} onClick={() => { setView(label); setMobileMenu(false); }}><Icon size={18}/><span>{label}</span>{label === "Fleet registry" && <small className="nav-count" title="Unassigned cards available">{totalCards === null ? "—" : totalCards.toLocaleString("en-NG")}</small>}{label === "Agent messages" && agentMessageUnread > 0 && <small className="nav-count" title="Unread agent notifications">{agentMessageUnread > 99 ? "99+" : agentMessageUnread}</small>}</button>)}
        </nav>
        <div className="nav-caption tools-caption">MANAGE</div>
        <button className={`nav-item ${view === "Settings" ? "nav-active" : ""}`} onClick={() => { setView("Settings"); setMobileMenu(false); }}><Settings2 size={18}/><span>Settings</span></button>
        <div className="sidebar-bottom">
          <div className="profile-row"><ProfileAvatar className="profile-avatar" fallback={avatarInitials} version={profileImageVersion}/><div className="profile-copy"><b>{adminName}</b><small>{adminEmail}</small></div><LogoutButton compact label="Sign out"/></div>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar"><button className="icon-button menu-button" aria-label={mobileMenu ? "Close navigation" : "Open navigation"} aria-expanded={mobileMenu} aria-controls="admin-mobile-sidebar" onClick={() => setMobileMenu((open) => !open)}><Menu size={20}/></button><div className="crumb"><b>{view}</b></div><div className="topbar-right"><div className="top-profile-wrap" ref={profileMenuRef}><button className="top-profile-button" type="button" aria-label={`Open profile menu for ${adminName}`} aria-haspopup="menu" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((open) => !open)}><ProfileAvatar className="top-avatar" fallback={avatarInitials} version={profileImageVersion}/><ChevronDown size={13}/></button>{profileMenuOpen&&<div className="profile-menu" role="menu" aria-label="Profile and workspace navigation"><div className="profile-menu-account"><ProfileAvatar className="profile-menu-avatar" fallback={avatarInitials} version={profileImageVersion}/><span><b>{adminName}</b><small>{adminEmail}</small></span></div><div className="profile-menu-caption">WORKSPACE</div>{navItems.map(({label,icon:Icon})=><button key={label} type="button" role="menuitem" className={`profile-menu-item ${view===label?"is-current":""}`} onClick={()=>{setView(label);setProfileMenuOpen(false);}}><Icon size={16}/><span>{label}</span></button>)}<div className="profile-menu-divider"/><button type="button" role="menuitem" className={`profile-menu-item ${view==="Settings"?"is-current":""}`} onClick={()=>{setView("Settings");setProfileMenuOpen(false);}}><Settings2 size={16}/><span>Settings</span></button><div className="profile-menu-divider"/><LogoutButton label="Sign out"/></div>}</div></div></header>
        <div className="content-wrap">
          <div className="page-heading"><div><p className="eyebrow">{displayDate.toUpperCase()}</p><h1>{view === "Overview" ? "Operations overview" : view}</h1><p className="heading-sub">{view === "Overview" ? "Monitor card batches, trip progress, and agent checks." : view === "Fleet registry" ? "Manage card production batches, category allocations, and trip card print runs." : view === "Agent access" ? "Pre-register agents so only invited people can create accounts." : view === "Users & roles" ? "Create administrator accounts and review registered agents." : view === "Verification" ? "Scan a trip card QR code or enter its MAAF ID to check the assigned trip." : view === "Agent messages" ? "Review field activity and send operational messages to agents." : view === "Reports" ? "Review trip card assignments and agent checkpoint activity." : "Manage your workspace and registry preferences."}</p></div><div className="heading-actions">{view !== "Reports" && view !== "Agent access" && view !== "Users & roles" && view !== "Agent messages" && <button className="button button-secondary" onClick={() => setView("Reports")}><Download size={16}/>View reports</button>}</div></div>
          {view === "Overview" && <>
            <div className="welcome-banner"><div className="banner-symbol"><QrCode size={20}/></div><div><b>Welcome back, {adminName}</b><p>Here is the latest card allocation and trip activity.</p></div><button className="overview-scan-button" type="button" title="Open trip card verification" aria-label="Open trip card verification" onClick={() => setView("Verification")}><ScanLine size={20}/></button><div className="banner-orbit orbit-one"/><div className="banner-orbit orbit-two"/></div>
            <OverviewOperationsPanel data={overviewData} error={overviewError} onNavigate={setView}/>
          </>}

          {view === "Fleet registry" && <TransportCardBatches onTotalChange={setTotalCards}/>}

          {view === "Verification" && <VerificationView />}
          {view === "Agent messages" && <AdminAgentMessages onUnreadCountChange={setAgentMessageUnread}/>}
          {view === "Agent access" && <AdminAgentAccess />}
          {view === "Users & roles" && <AdminUsersRoles />}
          {view === "Reports" && <AdminTransportReports/>}
          {view === "Settings" && <SettingsView userEmail={adminEmail} firstName={adminName} lastName={adminLastName} surname={adminSurname} avatarVersion={profileImageVersion} onAvatarUpdated={()=>setProfileImageVersion((version)=>version+1)} onProfileUpdated={(firstName,lastName,surname,email)=>{setAdminName(firstName);setAdminLastName(lastName);setAdminSurname(surname);setAdminEmail(email);}} onNavigate={setView}/>}

          <footer className="page-footer"><span>© 2026 MAAF Transport Control</span><span><span className={`footer-live ${overviewError ? "footer-offline" : ""}`}/> {overviewError ? "Operations data unavailable" : overviewData ? "Operations data connected" : "Loading operations data"}</span></footer>
        </div>
      </section>

    </main>
  );
}

function OverviewOperationsPanel({ data, error, onNavigate }: { data: OverviewData | null; error: string; onNavigate: (view: View) => void }) {
  const available = data ? Math.max(0, data.cards.allocated - data.cards.assigned) : null;
  const values = [
    { label: "Cards available", value: available, detail: data ? `${data.cards.allocated.toLocaleString("en-NG")} allocated` : "Loading live totals", icon: QrCode },
    { label: "Cards assigned", value: data?.cards.assigned ?? null, detail: "Current trip assignments", icon: CheckCircle2 },
    { label: "Production batches", value: data?.batches ?? null, detail: "Current card batches", icon: BusFront },
    { label: "Invites awaiting signup", value: data?.agentAccess.awaitingSignup ?? null, detail: data ? `${data.agentAccess.total} total pre-registrations` : "Loading agent access", icon: Users },
  ];
  return <section className="overview-operations panel" aria-label="Admin portal summary">
    <div className="overview-operations-heading"><div><h2>Portal summary</h2><p>Card batches, trip progress, agent access, verification, and accounts</p></div>{error ? <span className="overview-data-error" role="status">{error}</span> : <span className="overview-live"><i/>Updates every 15 seconds</span>}</div>
    <div className="overview-operations-grid">{values.map(({ label, value, detail, icon: Icon }) => <article key={label}><span className="overview-operation-icon"><Icon size={17}/></span><div><small>{label}</small><b>{value === null ? "—" : value.toLocaleString("en-NG")}</b><span>{detail}</span></div></article>)}</div>
    <div className="overview-portal-breakdown">
      <div><b>Trip cards</b><span>{data ? `${data.trips.ready ?? 0} ready to print · ${data.trips.in_transit ?? 0} in transit · ${data.trips.on_hold ?? 0} on hold · ${data.trips.completed ?? 0} completed` : "Loading trip status…"}</span></div>
      <div><b>Agent access</b><span>{data ? `${data.agentAccess.active} active · ${data.agentAccess.pendingVerification} pending email verification · ${data.agentAccess.awaitingSignup} awaiting signup` : "Loading access records…"}</span></div>
      <div><b>Checkpoint verification</b><span>{data ? `${data.verification.total} checks · ${data.verification.verified} verified · ${data.verification.flagged} flagged` : "Loading verification activity…"}</span></div>
    </div>
    <div className="overview-account-totals">
      <b>Accounts</b>
      {data ? <><span><UserRoundCheck size={14}/> Admins <strong>{data.accounts.admins.total}</strong><small>{data.accounts.admins.active} active · {data.accounts.admins.inactive} inactive · {data.accounts.admins.suspended} suspended</small></span><span><UserRoundCheck size={14}/> Agents <strong>{data.accounts.agents.total}</strong><small>{data.accounts.agents.active} active · {data.accounts.agents.pending} pending verification · {data.accounts.agents.inactive + data.accounts.agents.suspended} inactive or suspended</small></span></> : <span>Loading account totals…</span>}
    </div>
    <div className="overview-recent-grid">
      <section className="overview-recent-section"><div className="overview-recent-heading"><div><b>Latest batches</b><small>Production allocations</small></div><button type="button" onClick={() => onNavigate("Fleet registry")}>All batches <ArrowRight size={13}/></button></div>{data?.recentBatches.length ? data.recentBatches.map((batch) => <article className="overview-batch-row" key={batch.id}><span><b>MAAF-BCH{String(productionBatchRangeStart(Number(batch.id))).padStart(4, "0")}</b><small>{formatOverviewDate(batch.batch_date)}</small></span><span><b>{batch.allocated_quantity.toLocaleString("en-NG")}</b><small>{batch.assigned_quantity.toLocaleString("en-NG")} assigned</small></span></article>) : <p className="overview-recent-empty">{data ? "No batches created yet." : "Loading batches…"}</p>}</section>
      <section className="overview-recent-section"><div className="overview-recent-heading"><div><b>Recent checkpoints</b><small>Latest agent verification activity</small></div><button type="button" onClick={() => onNavigate("Verification")}>View scans <ArrowRight size={13}/></button></div>{data?.recentChecks.length ? data.recentChecks.map((check) => <article className="overview-check-row" key={`${check.id}-${check.step}`}><span className={`overview-check-indicator ${check.outcome}`}><CheckCircle2 size={14}/></span><span className="overview-check-copy"><b>{check.code}</b><small>{check.origin} → {check.destination}</small></span><span className="overview-check-result"><b>{check.outcome === "verified" ? "Verified" : "Flagged"}</b><small>{check.agent_name} · {formatCardCheckTime(check.checked_at)}</small></span></article>) : <p className="overview-recent-empty">{data ? "No checkpoint scans recorded yet." : "Loading checkpoint activity…"}</p>}</section>
    </div>
  </section>;
}

function formatOverviewDate(value: string) {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" }).format(parsed);
}

function ProfileAvatar({className,fallback,version,preview}:{className:string;fallback:string;version:number;preview?:string}) {
  const [imageFailed,setImageFailed]=useState(false);
  const src=preview||`/api/admin/account/avatar?v=${version}`;
  useEffect(()=>setImageFailed(false),[src]);
  return <div className={className+" profile-avatar-shell"}><span aria-hidden="true">{fallback}</span>{!imageFailed&&<img src={src} alt="" onError={()=>setImageFailed(true)}/>}</div>;
}

type RecentCardCheck={id:number;code:string;step:number;outcome:"verified"|"flagged";notes:string;checked_at:string|Date;agent_name:string;origin:string;destination:string;vehicle_class:string};
type VerifiedTripCard={id:number;batch_id:number;serial:number;code:string;vehicle_class:string;origin:string;destination:string;status:"ready"|"in_transit"|"on_hold"|"completed";current_step:number;items:{description:string;quantity?:number|string;unit?:string}[];verifications:{step:number;agent_name:string;outcome:"verified"|"flagged";notes:string;checked_at:string|Date}[]};
function formatCardCheckTime(value:string|Date){const raw=value instanceof Date?value.toISOString():value;const parsed=new Date(raw.includes("T")?raw:`${raw.replace(" ","T")}Z`);return Number.isNaN(parsed.getTime())?String(value):formatLastVerified(parsed.toISOString());}
function VerifyTripCardResult({trip}:{trip:VerifiedTripCard}) {
  const verifiedCount=trip.verifications.filter(event=>event.outcome==="verified").length;
  const statusLabel=trip.status==="in_transit"?"In transit":trip.status==="on_hold"?"On hold":trip.status==="completed"?"Completed":"Ready for trip";
  return <div className={`verify-trip-result ${trip.status}`}><div className="verify-trip-result-heading"><CheckCircle2 size={19}/><span><b>MAAF card verified</b><small>{trip.code} · {statusLabel}</small></span></div><div className="verify-trip-result-grid"><div><small>Vehicle class</small><b>{trip.vehicle_class}</b></div><div><small>Travelling from</small><b>{trip.origin}</b></div><div><small>Destination</small><b>{trip.destination}</b></div><div className="verify-trip-goods"><small>Goods on this trip</small>{trip.items.length?trip.items.map((item,index)=><b key={`${item.description}-${index}`}>{item.description}{item.quantity?` · ${item.quantity}${item.unit?` ${item.unit}`:""}`:""}</b>):<span>No goods were listed.</span>}</div><div><small>Checkpoint progress</small><b>{verifiedCount} of 3 completed</b><span>{trip.status==="completed"?"This card is closed and cannot be reused.":trip.status==="on_hold"?"This card is on hold for admin review.":`Next checkpoint: ${trip.current_step}`}</span></div></div>{trip.verifications.length>0&&<div className="verify-trip-events"><b>Recorded checkpoints</b>{trip.verifications.map((event,index)=><span key={`${event.step}-${index}`}>Checkpoint {event.step}: {event.outcome} · {event.agent_name}</span>)}</div>}</div>;
}
function VerificationView() {
  const [code,setCode]=useState(""); const [match,setMatch]=useState<VerifiedTripCard|null|undefined>(undefined); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  const [cameraOn,setCameraOn]=useState(false); const [cameraMessage,setCameraMessage]=useState(""); const videoRef=useRef<HTMLVideoElement>(null);
  const [recentChecks,setRecentChecks]=useState<RecentCardCheck[]>([]); const [recentChecksError,setRecentChecksError]=useState("");
  useEffect(()=>{const controller=new AbortController();fetch("/api/admin/recent-card-checks",{cache:"no-store",signal:controller.signal}).then(async response=>{const result=await response.json() as RecentCardCheck[]|{error?:string};if(!response.ok||!Array.isArray(result))throw new Error("error" in result?result.error||"Recent card scans could not be loaded.":"Recent card scans could not be loaded.");setRecentChecks(result);setRecentChecksError("");}).catch(reason=>{if(!(reason instanceof DOMException&&reason.name==="AbortError"))setRecentChecksError(reason instanceof Error?reason.message:"Recent card scans could not be loaded.");});return()=>controller.abort();},[]);
  async function verifyLookup(lookup:string){if(busy)return;setBusy(true);setError("");setMatch(undefined);try{const response=await fetch("/api/admin/card-trips/lookup",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({code:lookup})});const result=await response.json() as VerifiedTripCard|{error?:string};if(!response.ok||!("code" in result))throw new Error("error" in result?result.error||"This MAAF card could not be verified.":"This MAAF card could not be verified.");setMatch(result);}catch(reason){setError(reason instanceof Error?reason.message:"Card verification could not be completed. Try again.");}finally{setBusy(false);}}
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();await verifyLookup(code.trim());}
  useEffect(()=>{
    if(!cameraOn)return;
    let stopped=false; let controls:IScannerControls|undefined;
    if(!window.isSecureContext){setCameraMessage("Camera scanning requires a secure page (HTTPS or localhost). Enter the MAAF ID below.");setCameraOn(false);return;}
    if(!navigator.mediaDevices?.getUserMedia){setCameraMessage("Camera access is unavailable. Allow camera access in your browser settings or enter the MAAF ID below.");setCameraOn(false);return;}
    setCameraMessage("");
    const video=videoRef.current;
    if(!video){setCameraMessage("Could not open the scanner. Enter the MAAF ID below.");setCameraOn(false);return;}
    void import("@zxing/browser").then(({BrowserQRCodeReader})=>{
      if(stopped)return;
      const reader=new BrowserQRCodeReader();
      return reader.decodeFromVideoDevice(undefined,video,(result,_scanError,scannerControls)=>{
      controls=scannerControls;
      if(stopped||!result)return;
      let lookup=result.getText().trim();
      try{const parsed=new URL(lookup);lookup=parsed.searchParams.get("code")||parsed.searchParams.get("card")||parsed.searchParams.get("id")||lookup;}catch{}
      stopped=true;scannerControls.stop();setCode(lookup);setCameraOn(false);void verifyLookup(lookup);
      }).then(scannerControls=>{controls=scannerControls;if(stopped)scannerControls.stop();});
    }).catch(reason=>{
      if(stopped)return;
      setCameraMessage(reason instanceof Error&&reason.name==="NotAllowedError"?"Camera permission was denied. Allow camera access or enter the MAAF ID below.":"Could not start the camera. Check camera permissions and enter the MAAF ID below.");setCameraOn(false);
    });
    return()=>{stopped=true;controls?.stop();};
  },[cameraOn]);
  return <div className="verification-layout"><section className="verify-work panel"><div className="large-scan"><div className="scan-corners"><ScanLine size={28}/></div><div className="scan-copy"><span className="eyebrow">TRIP CARD CHECK</span><h2>Verify a trip card</h2><p>Scan the QR code on the card or enter its MAAF ID to review the route, goods and checkpoint status.</p></div></div><div className="verify-camera-actions"><button type="button" className="button button-secondary" onClick={()=>{setCameraMessage("");setCameraOn(value=>!value);}}><Camera size={16}/>{cameraOn?"Stop scanner":"Scan QR code"}</button><span>Allow camera access when prompted.</span></div>{cameraOn&&<div className="verify-camera-panel"><video ref={videoRef} playsInline muted aria-label="QR code camera scanner"/><div className="verify-camera-frame"/><p>Point the camera at the trip card QR code.</p></div>}{cameraMessage&&<div className="verify-camera-message" role="status">{cameraMessage}</div>}<form onSubmit={submit} className="verify-page-form"><label htmlFor="verify-code">MAAF card ID</label><div className="verify-input-row"><div className="input-with-icon"><QrCode size={18}/><input id="verify-code" value={code} onChange={e=>setCode(e.target.value)} placeholder="Enter card ID, e.g. MAAF-BCH0003-HX3JSDPJ" required/></div><button className="button button-primary" disabled={busy}>{busy?<Clock3 className="spin" size={16}/>:<ScanLine size={16}/>} {busy?"Checking…":"Verify card"}</button></div><span className="form-hint"><ShieldCheck size={14}/> Check the trip details and checkpoint history before clearing the card.</span></form>{error&&<div className="verify-result result-invalid" role="alert"><X size={16}/><span>{error}</span></div>}{match&&<VerifyTripCardResult trip={match}/>}</section><aside className="verify-aside panel"><div className="panel-heading"><div><h2>Recent card scans</h2><p>Latest trip card checkpoint activity</p></div><span className="live-badge"><i/> LIVE</span></div>{recentChecks.map(check=><article className={`recent-card-check ${check.outcome}`} key={check.id}><div className={`recent-card-check-icon ${check.outcome}`}>{check.outcome==="verified"?<Check size={14}/>:<ShieldAlert size={14}/>}</div><div className="recent-card-check-copy"><b>{check.code}</b><small>{check.vehicle_class}</small><small>{check.origin} → {check.destination}</small><span>Checkpoint {check.step} · {check.agent_name}</span>{check.outcome==="flagged"&&check.notes&&<em>{check.notes}</em>}</div><time>{formatCardCheckTime(check.checked_at)}</time><span className={`recent-card-check-status ${check.outcome}`}>{check.outcome==="verified"?"Verified":"Flagged"}</span></article>)}{recentChecksError?<div className="empty-table"><b>Card scans unavailable</b><span>{recentChecksError}</span></div>:recentChecks.length===0&&<div className="empty-table"><b>No card scans recorded yet</b><span>Trip card checkpoint activity will appear here.</span></div>}</aside></div>;
}
function SettingsView({userEmail,firstName:initialFirstName,lastName:initialLastName,surname:initialSurname,avatarVersion,onAvatarUpdated,onProfileUpdated,onNavigate}:{userEmail:string;firstName:string;lastName:string;surname:string;avatarVersion:number;onAvatarUpdated:()=>void;onProfileUpdated:(firstName:string,lastName:string,surname:string,email:string)=>void;onNavigate:(view:View)=>void}) {
  const [firstName,setFirstName]=useState(initialFirstName);
  const [lastName,setLastName]=useState(initialLastName);
  const [surname,setSurname]=useState(initialSurname);
  const [email,setEmail]=useState(userEmail);
  const [username,setUsername]=useState("");
  const [location,setLocation]=useState("");
  const avatarInputRef=useRef<HTMLInputElement>(null);
  const [avatarFile,setAvatarFile]=useState<File|null>(null);
  const [avatarPreview,setAvatarPreview]=useState("");
  const [uploadingAvatar,setUploadingAvatar]=useState(false);
  const [avatarMessage,setAvatarMessage]=useState("");
  const [avatarError,setAvatarError]=useState("");
  const [currentPassword,setCurrentPassword]=useState("");
  const [newPassword,setNewPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [savingProfile,setSavingProfile]=useState(false);
  const [savingPassword,setSavingPassword]=useState(false);
  const [profileMessage,setProfileMessage]=useState("");
  const [profileError,setProfileError]=useState("");
  const [passwordMessage,setPasswordMessage]=useState("");
  const [passwordError,setPasswordError]=useState("");
  const passwordRules=[{label:"At least 8 characters",valid:newPassword.length>=8},{label:"One capital letter",valid:/[A-Z]/.test(newPassword)},{label:"One special character",valid:/[^A-Za-z0-9]/.test(newPassword)},{label:"One number",valid:/\d/.test(newPassword)}];

  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/admin/account",{cache:"no-store",signal:controller.signal}).then(async response=>{
      const payload=await response.json() as {username?:string;location?:string;error?:string};
      if(!response.ok)throw new Error(payload.error||"Your admin profile could not be loaded.");
      setUsername(payload.username||"");setLocation(payload.location||"");
    }).catch(error=>{if(!(error instanceof DOMException&&error.name==="AbortError"))setProfileError(error instanceof Error?error.message:"Your admin profile could not be loaded.");});
    return()=>controller.abort();
  },[]);

  useEffect(()=>{
    if(!avatarFile){setAvatarPreview("");return;}
    const preview=URL.createObjectURL(avatarFile);setAvatarPreview(preview);
    return()=>URL.revokeObjectURL(preview);
  },[avatarFile]);

  async function saveProfile(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); if(savingProfile)return; setSavingProfile(true);setProfileMessage("");setProfileError("");
    try{
      const response=await fetch("/api/admin/account",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({firstName,lastName,surname,email,username,location})});
      const payload=await response.json() as {user?:{firstName:string;lastName:string;surname:string;email:string;username:string;location:string};error?:string};
      if(!response.ok||!payload.user)throw new Error(payload.error||"Your profile could not be updated.");
      setFirstName(payload.user.firstName);setLastName(payload.user.lastName);setSurname(payload.user.surname);setEmail(payload.user.email);setUsername(payload.user.username);setLocation(payload.user.location);onProfileUpdated(payload.user.firstName,payload.user.lastName,payload.user.surname,payload.user.email);setProfileMessage("Your profile has been updated.");
    }catch(error){setProfileError(error instanceof Error?error.message:"Your profile could not be updated. Try again.");}
    finally{setSavingProfile(false);}
  }
  async function uploadAvatar(){
    if(!avatarFile||uploadingAvatar)return;setUploadingAvatar(true);setAvatarMessage("");setAvatarError("");
    try{
      const body=new FormData();body.set("image",avatarFile);
      const response=await fetch("/api/admin/account/avatar",{method:"POST",body});
      const payload=await response.json() as {success?:boolean;error?:string};
      if(!response.ok||!payload.success)throw new Error(payload.error||"Your profile photo could not be uploaded.");
      setAvatarFile(null);setAvatarMessage("Your profile photo has been updated.");onAvatarUpdated();
    }catch(error){setAvatarError(error instanceof Error?error.message:"Your profile photo could not be uploaded. Try again.");}
    finally{setUploadingAvatar(false);}
  }
  async function updatePassword(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(savingPassword)return;setSavingPassword(true);setPasswordMessage("");setPasswordError("");
    try{
      const response=await fetch("/api/admin/account",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({currentPassword,newPassword,confirmPassword})});
      const payload=await response.json() as {success?:boolean;error?:string};
      if(!response.ok||!payload.success)throw new Error(payload.error||"Your password could not be changed.");
      setCurrentPassword("");setNewPassword("");setConfirmPassword("");setPasswordMessage("Your password has been updated. Other sign-in sessions have been signed out.");
    }catch(error){setPasswordError(error instanceof Error?error.message:"Your password could not be changed. Try again.");}
    finally{setSavingPassword(false);}
  }

  return <div className="settings-page">
    <section className="settings-overview panel"><div className="settings-overview-main"><div className="settings-overview-icon"><Settings2 size={22}/></div><div><span className="eyebrow">MAAF OPERATIONS</span><h2>Workspace settings</h2><p>Manage your administrator profile and sign-in security.</p></div></div><span className="settings-secure-badge"><ShieldCheck size={15}/> Secure admin workspace</span></section>

    <section className="panel settings-section">
      <div className="settings-section-heading"><div className="settings-icon"><UserRoundCheck size={19}/></div><div><h2>Administrator profile</h2><p>Update your account details, username, and location.</p></div></div>
      <div className="settings-account-card"><ProfileAvatar className="settings-account-avatar" fallback={[firstName,lastName,surname].filter(Boolean).map((part)=>part[0]).slice(0,2).join("").toUpperCase() || "AD"} version={avatarVersion} preview={avatarPreview}/><div><b>{[firstName,lastName,surname].filter(Boolean).join(" ")}</b><span>{email}</span></div><span className="settings-role">ADMIN</span></div>
      <div className="settings-photo-controls"><input ref={avatarInputRef} className="settings-photo-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>{const file=event.target.files?.[0]??null;setAvatarFile(file);setAvatarMessage("");setAvatarError(file&&file.size>500*1024?"Choose an image no larger than 500 KB.":"");}}/><div><b>Profile photo</b><span>Upload or replace your admin profile image. JPG, PNG, or WebP up to 500 KB.</span></div><button type="button" className="button button-secondary" onClick={()=>avatarInputRef.current?.click()}><ImagePlus size={16}/>{avatarFile?"Choose another":"Choose photo"}</button>{avatarFile&&<button type="button" className="button button-primary" onClick={()=>void uploadAvatar()} disabled={uploadingAvatar||Boolean(avatarError)}>{uploadingAvatar?<Clock3 className="spin" size={16}/>:<Check size={16}/>} {uploadingAvatar?"Uploading…":"Upload photo"}</button>}{avatarMessage&&<div className="settings-form-message settings-photo-feedback" role="status"><CheckCircle2 size={17}/>{avatarMessage}</div>}{avatarError&&<div className="settings-form-error settings-photo-feedback" role="alert"><ShieldAlert size={17}/>{avatarError}</div>}</div>
      <form className="settings-form" onSubmit={saveProfile}>
        <div className="settings-form-grid"><label className="settings-field"><span>First name</span><input value={firstName} onChange={(event)=>setFirstName(event.target.value)} autoComplete="given-name" maxLength={60} required/></label><label className="settings-field"><span>Last name</span><input value={lastName} onChange={(event)=>setLastName(event.target.value)} autoComplete="family-name" maxLength={60} required/></label><label className="settings-field"><span>Third name <i>optional</i></span><input value={surname} onChange={(event)=>setSurname(event.target.value)} autoComplete="additional-name" maxLength={60}/></label><label className="settings-field"><span>Email address</span><input type="email" value={email} onChange={(event)=>setEmail(event.target.value)} autoComplete="email" maxLength={254} required/></label><label className="settings-field"><span>Username</span><input value={username} onChange={(event)=>setUsername(event.target.value.toLowerCase())} autoComplete="username" minLength={3} maxLength={40} pattern="[a-zA-Z0-9._-]+" placeholder="Choose a username" required/><small>3–40 letters, numbers, dots, underscores, or hyphens. You can use it to sign in.</small></label><label className="settings-field"><span>Location</span><input value={location} onChange={(event)=>setLocation(event.target.value)} autoComplete="address-level2" maxLength={120} placeholder="City or area"/></label></div>
        {profileMessage&&<div className="settings-form-message" role="status"><CheckCircle2 size={17}/>{profileMessage}</div>}{profileError&&<div className="settings-form-error" role="alert"><ShieldAlert size={17}/>{profileError}</div>}
        <div className="settings-form-actions"><span><ShieldCheck size={15}/> Username is also available for admin sign-in.</span><button className="button button-primary" type="submit" disabled={savingProfile}>{savingProfile?<Clock3 className="spin" size={16}/>:<Check size={16}/>} {savingProfile?"Saving profile…":"Save profile"}</button></div>
      </form>
    </section>

    <section className="panel settings-section">
      <div className="settings-section-heading"><div className="settings-icon settings-icon-amber"><ShieldCheck size={19}/></div><div><h2>Change password</h2><p>Choose a new password for your admin sign-in.</p></div></div>
      <form className="settings-form" onSubmit={updatePassword}>
        <div className="settings-form-grid"><label className="settings-field settings-field-wide"><span>Current password</span><input type="password" value={currentPassword} onChange={(event)=>setCurrentPassword(event.target.value)} autoComplete="current-password" maxLength={256} required/></label><label className="settings-field"><span>New password</span><input type="password" value={newPassword} onChange={(event)=>setNewPassword(event.target.value)} autoComplete="new-password" maxLength={128} required/></label><label className="settings-field"><span>Confirm new password</span><input type="password" value={confirmPassword} onChange={(event)=>setConfirmPassword(event.target.value)} autoComplete="new-password" maxLength={128} required/></label></div>
        <div className="settings-password-rules" aria-live="polite">{passwordRules.map((rule)=><span className={rule.valid?"rule-valid":""} key={rule.label}><i>{rule.valid?"✓":"·"}</i>{rule.label}</span>)}</div>
        {newPassword&&confirmPassword&&newPassword!==confirmPassword&&<p className="settings-password-mismatch" role="status">The passwords do not match yet.</p>}
        {passwordMessage&&<div className="settings-form-message" role="status"><CheckCircle2 size={17}/>{passwordMessage}</div>}{passwordError&&<div className="settings-form-error" role="alert"><ShieldAlert size={17}/>{passwordError}</div>}
        <div className="settings-form-actions"><span><ShieldCheck size={15}/> Other active sessions will be signed out after this change.</span><button className="button button-primary" type="submit" disabled={savingPassword||passwordRules.some((rule)=>!rule.valid)||newPassword!==confirmPassword}>{savingPassword?<Clock3 className="spin" size={16}/>:<Check size={16}/>} {savingPassword?"Updating password…":"Update password"}</button></div>
      </form>
    </section>

    <section className="panel settings-section settings-links-section">
      <div className="settings-section-heading"><div className="settings-icon"><SlidersHorizontal size={19}/></div><div><h2>Manage operations</h2><p>Open another workspace to manage its records.</p></div></div>
      <button className="settings-link-row" onClick={()=>onNavigate("Fleet registry")}><span className="settings-link-icon"><BusFront size={17}/></span><span><b>Fleet registry</b><small>Manage vehicle batches, fares and trip cards</small></span><ArrowRight size={17}/></button>
      <button className="settings-link-row" onClick={()=>onNavigate("Agent access")}><span className="settings-link-icon"><Users size={17}/></span><span><b>Agent access</b><small>Review agent invitations and account status</small></span><ArrowRight size={17}/></button>
      <button className="settings-link-row" onClick={()=>onNavigate("Reports")}><span className="settings-link-icon"><FileBarChart2 size={17}/></span><span><b>Reports</b><small>Review trip card status and agent checkpoint activity</small></span><ArrowRight size={17}/></button>
    </section>
  </div>;
}
function Field({label,children,required=false,wide=false}:{label:string;children:React.ReactNode;required?:boolean;wide?:boolean}) { return <label className={`field ${wide?"field-wide":""}`}><span>{label}{required&&<i> *</i>}</span>{children}</label>; }




