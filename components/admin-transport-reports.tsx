"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Check, CheckCircle2, Clock3, Copy, LoaderCircle, Printer, RefreshCw, ShieldAlert } from "lucide-react";

type TripStatus = "ready" | "in_transit" | "on_hold" | "completed";
type RecentTrip = {
  id: number;
  batch_id: number;
  category_id: number | null;
  code: string;
  vehicle_class: string;
  destination: string;
  origin: string;
  status: TripStatus;
  created_at: string;
  checks: number;
};
type TransportReport = {
  cards: { allocated: number; assigned: number };
  trips: Partial<Record<TripStatus, number>>;
  verification: { total: number; verified: number; flagged: number };
  recentTrips: RecentTrip[];
};

function formatReportDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function AdminTransportReports() {
  const [report, setReport] = useState<TransportReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [copiedCode, setCopiedCode] = useState("");
  const [copyError, setCopyError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setReport(null);
    fetch("/api/admin/reports", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as TransportReport | { error?: string };
        if (!response.ok) throw new Error("error" in result ? result.error || "Reports could not be loaded." : "Reports could not be loaded.");
        return result as TransportReport;
      })
      .then(setReport)
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : "Reports could not be loaded.");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  const stats = report ? [
    { title: "Assigned trip cards", value: report.cards.assigned, detail: `${Math.max(0, report.cards.allocated - report.cards.assigned).toLocaleString("en-NG")} unassigned of ${report.cards.allocated.toLocaleString("en-NG")}`, icon: Activity },
    { title: "Ready to print", value: report.trips.ready ?? 0, detail: "Assigned and awaiting print", icon: CheckCircle2 },
    { title: "In transit", value: report.trips.in_transit ?? 0, detail: "Trips with checkpoint activity", icon: Clock3 },
    { title: "Completed trips", value: report.trips.completed ?? 0, detail: `${report.trips.on_hold ?? 0} held for review`, icon: ShieldAlert },
  ] : [];

  async function copyCode(code: string) {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode((current) => current === code ? "" : current), 1800);
    } catch {
      setCopyError("Could not copy the MAAF ID. Check clipboard access and try again.");
    }
  }

  return <section className="panel transport-reports">
    <div className="panel-heading transport-reports-heading">
      <div><h2>Trip card and checkpoint reports</h2><p>Live card allocation, trip status and agent verification activity.</p></div>
      {report && <span className="transport-report-total"><b>{report.verification.total.toLocaleString("en-NG")}</b> checkpoint checks</span>}
    </div>
    {loading && <div className="transport-report-state"><LoaderCircle className="spin" size={18}/> Loading trip and checkpoint reports…</div>}
    {!loading && error && <div className="transport-report-error" role="alert"><span>{error}</span><button className="button button-secondary button-small" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={14}/> Retry</button></div>}
    {!loading && report && <>
      <div className="transport-report-stats">{stats.map(({ title, value, detail, icon: Icon }) => <article className="transport-report-stat" key={title}><span className="transport-report-stat-icon"><Icon size={16}/></span><div><span>{title}</span><b>{value.toLocaleString("en-NG")}</b><small>{detail}</small></div></article>)}</div>
      <div className="transport-report-checks"><b>Checkpoint results</b><span><i className="green-dot"/> Verified <strong>{report.verification.verified.toLocaleString("en-NG")}</strong></span><span><i className="red-dot"/> Flagged <strong>{report.verification.flagged.toLocaleString("en-NG")}</strong></span></div>
      <div className="transport-report-table">
        <div className="panel-heading"><div><h3>Recent trip cards</h3><p>Latest assigned cards and their checkpoint progress.</p></div></div>
        {copyError && <p className="report-copy-error" role="status">{copyError}</p>}
        <div className="table-scroll"><table><thead><tr><th>MAAF ID</th><th>CARD CLASS</th><th>ROUTE</th><th>CHECKS</th><th>STATUS</th><th>ASSIGNED</th><th aria-label="PRINT"></th></tr></thead><tbody>
          {report.recentTrips.map((trip) => <tr key={trip.id}><td><span className="report-trip-id"><b className="report-trip-code">{trip.code}</b><button type="button" className={`report-copy-code${copiedCode === trip.code ? " is-copied" : ""}`} aria-label={copiedCode === trip.code ? `Copied ${trip.code}` : `Copy ${trip.code}`} title={copiedCode === trip.code ? "Copied" : "Copy MAAF ID"} onClick={() => void copyCode(trip.code)}>{copiedCode === trip.code ? <Check size={15}/> : <Copy size={15}/>}</button></span></td><td>{trip.vehicle_class}</td><td>{trip.origin} → {trip.destination}</td><td>{trip.checks}/3</td><td><span className={`report-trip-status status-${trip.status}`}>{trip.status.replace("_", " ")}</span></td><td>{formatReportDate(trip.created_at)}</td><td className="report-print-cell">{trip.status === "ready" ? <Link className="report-print-card" href={`/dashboard/card-print/${trip.category_id ?? trip.batch_id}?trip=${trip.id}`} aria-label={`Print ${trip.code}`} title={`Print ${trip.code}`}><Printer size={16}/></Link> : <button type="button" className="report-print-card is-disabled" aria-label={`${trip.code} is not ready to print`} title="Only cards marked Ready can be printed" disabled><Printer size={16}/></button>}</td></tr>)}
        </tbody></table>{report.recentTrips.length === 0 && <div className="empty-table"><b>No trip card activity yet</b><span>Assigned cards and checkpoint activity will appear here.</span></div>}</div>
      </div>
    </>}
  </section>;
}
