import type { Metadata } from "next";
import { ArrowRight, BadgeCheck, Check, ClipboardCheck, LockKeyhole, MapPin, QrCode, ScanLine, ShieldCheck, Ticket } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { PortalDropdown } from "@/components/portal-login-dropdown";

export const metadata: Metadata = {
  title: "How MAAF Works",
  description: "Learn how MAAF trip cards move from production and assignment through agent checkpoint verification, with clear records for admin review.",
  alternates: { canonical: "/security" },
};

const steps = [
  { n: "01", icon: Ticket, title: "Create a production batch", text: "An admin creates a dated batch. MAAF reserves a sequential card number range and tracks how many slots are allocated." },
  { n: "02", icon: MapPin, title: "Allocate and assign cards", text: "Cards are organized by transport class and destination. Each trip card can show its declared route and goods." },
  { n: "03", icon: ScanLine, title: "Scan and record checkpoints", text: "An agent scans the QR code or enters the card ID, checks the trip details and records the checkpoint for admins to review." },
];

const principles = [
  { icon: BadgeCheck, title: "A unique card identity", text: "Each allocated card has a MAAF number and QR value that links the printed card to its trip details." },
  { icon: ScanLine, title: "Details at scan time", text: "Agents can review the declared route and goods before they record a checkpoint." },
  { icon: ClipboardCheck, title: "Activity admins can follow", text: "Checkpoint records and flagged activity are shared with the admin team for review." },
];

export default function HowItWorksAndSecurityPage() {
  return <main className="public-site">
    <SiteHeader active="security"/>
    <section className="subpage-hero security-route-hero">
      <span className="section-kicker">HOW IT WORKS</span>
      <h1>Three clear steps.<br/><em>Accountable checks.</em></h1>
      <p>Follow a MAAF trip card from production and assignment through checkpoint verification, with records admins can review.</p>
      <div className="subpage-actions">
        <a className="site-button site-button-dark" href="#workflow">See the workflow <ArrowRight size={17}/></a>
        <PortalDropdown label="Login"/>
      </div>
      <div className="security-route-art">
        <div className="security-route-shield"><ShieldCheck size={49}/></div>
        <span className="security-route-tag route-tag-a"><LockKeyhole size={15}/> Card lookup</span>
        <span className="security-route-tag route-tag-b"><QrCode size={15}/> Trip details</span>
        <span className="security-route-tag route-tag-c"><Check size={14}/> Checkpoint logged</span>
      </div>
    </section>
    <section className="workflow-detail" id="workflow">
      <div className="workflow-detail-intro"><span className="section-kicker">A SIMPLE, TRACEABLE FLOW</span><h2>Every scan adds<br/>to the trip record.</h2><p>The agent’s checkpoint activity is shared with the admin team for operational follow-up.</p></div>
      <div className="workflow-detail-steps">{steps.map(({ n, icon: Icon, title, text }, i) => <article className="workflow-step" key={n}><div className="workflow-step-no">{n}</div><div className={`workflow-step-icon workflow-icon-${i}`}><Icon size={22}/></div><div><h3>{title}</h3><p>{text}</p>{i === 2 && <span className="workflow-complete"><Check size={13}/> Activity shared with admins</span>}</div></article>)}</div>
    </section>
    <section className="security-principles">
      <div className="subpage-section-intro"><span className="section-kicker">BUILT AROUND ACCOUNTABILITY</span><h2>A check should show<br/>what it confirms.</h2><p>Agents look up a card, review its allocated trip details and record their own checkpoint once.</p></div>
      <div className="security-principle-grid">{principles.map(({ icon: Icon, title, text }, i) => <article key={title}><div className={`principle-icon principle-${i}`}><Icon size={22}/></div><h3>{title}</h3><p>{text}</p></article>)}</div>
    </section>
    <section className="security-disclaimer"><div className="security-disclaimer-icon"><LockKeyhole size={20}/></div><div><b>A card lookup has a clear scope.</b><p>It confirms the card’s allocation and displays recorded trip details. It does not confirm payment, cargo contents or NFC activity.</p></div></section>
    <section className="security-bottom-cta"><div><span className="section-kicker">MAAF TRANSPORT CONTROL</span><h2>Ready to use MAAF?</h2></div><a className="site-button site-button-dark" href="/agent/login">Open the agent portal <ArrowRight size={16}/></a></section>
    <SiteFooter/>
  </main>;
}
