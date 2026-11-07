import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import {
  ArrowRight, ArrowUpRight, BadgeCheck, Check, CircleCheck, ClipboardCheck,
  MapPin, QrCode, ScanLine, ShieldCheck, Ticket, TimerReset,
} from "lucide-react";

const pillars = [
  { icon: Ticket, title: "Controlled card batches", text: "Create dated production batches and allocate cards by transport class and destination." },
  { icon: QrCode, title: "QR trip cards", text: "Give each issued card a unique MAAF code that agents can scan at a checkpoint." },
  { icon: ScanLine, title: "Recorded checkpoints", text: "Review the declared trip details, then record each checkpoint against the card." },
  { icon: ClipboardCheck, title: "One operations view", text: "Admins can follow card allocations, trip progress, agent activity and flagged checks." },
];

const steps = [
  { number: "01", icon: Ticket, title: "Create a card batch", text: "Admins create a dated production batch with a reserved, sequential range of MAAF card numbers." },
  { number: "02", icon: MapPin, title: "Set up the trip", text: "Cards are organized by transport class and destination, then assigned the declared route and goods." },
  { number: "03", icon: ScanLine, title: "Verify at checkpoints", text: "An agent scans the trip card, reviews its details and records the checkpoint for the admin team." },
];

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "MAAF Transport Control",
  url: "https://maafnigerialtd.com",
  description: "Transport card allocation, QR trip card verification and checkpoint operations.",
};

export default function PublicHome() {
  return <main className="public-site">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
    <SiteHeader/>

    <section className="public-hero" id="top">
      <div className="hero-copy">
        <div className="hero-kicker">QR TRIP CARDS · CHECKPOINT OPERATIONS</div>
        <h1>Every trip card.<br/><em>One clear</em><br/>journey.</h1>
        <p className="hero-lede">Create transport card batches, follow declared trips and record checkpoint scans in one shared operations platform.</p>
        <div className="hero-actions"><a className="site-button site-button-dark" href="/agent/signup">Become an agent <ArrowRight size={17}/></a><a className="site-button site-button-light" href="/security">How it works <ArrowRight size={16}/></a></div>
        <div className="hero-note"><span className="note-check"><Check size={13}/></span> Card activity is visible to the MAAF admin team</div>
      </div>
      <div className="hero-visual" aria-label="Illustration of a MAAF QR trip card and checkpoint record">
        <div className="visual-orb orb-a"/><div className="visual-orb orb-b"/>
        <div className="visual-label label-top"><span className="label-dot"/> LIVE TRIP CARD</div>
        <div className="identity-card">
          <div className="identity-top"><span className="identity-mini-brand"><span><QrCode size={14}/></span> MAAF TRIP PASS</span><span className="identity-active"><i/> READY TO VERIFY</span></div>
          <div className="identity-vehicle"><div className="identity-bus"><Ticket size={29}/></div><div><small>TRANSPORT CLASS</small><b>Jeep</b><span>Lagos · Destination: Ikeja</span></div></div>
          <div className="identity-plate"><small>DECLARED ROUTE</small><strong>CMS → IKEJA</strong></div>
          <div className="identity-divider"/>
          <div className="identity-bottom"><div className="identity-code"><QrCode size={62}/></div><div><small>MAAF CARD ID</small><b>MAAF-BCH0001-0001</b><span><BadgeCheck size={14}/> Checkpoint ready</span></div><ArrowUpRight className="identity-open" size={17}/></div>
        </div>
        <div className="visual-label label-bottom"><div className="check-seal"><ShieldCheck size={20}/></div><span><b>Checkpoint recorded</b><small>Card activity shared with admins</small></span></div>
        <div className="visual-spark spark-one">✳</div><div className="visual-spark spark-two">✳</div>
      </div>
    </section>

    <section className="platform-section" id="platform">
      <div className="section-heading"><div><span className="section-kicker">THE MAAF PLATFORM</span><h2>Card operations,<br/><em>connected end to end.</em></h2></div><p>Manage production batches, organize route cards and follow checkpoint activity from the admin workspace.</p></div>
      <div className="pillar-grid">{pillars.map(({icon:Icon,title,text},index)=><article className="pillar-card" key={title}><div className={`pillar-icon pillar-icon-${index}`}><Icon size={23}/></div><span className="pillar-index">0{index+1}</span><h3>{title}</h3><p>{text}</p><a href="#how-it-works" aria-label={`Learn about ${title}`}><ArrowRight size={17}/></a></article>)}</div>
    </section>

    <section className="how-section" id="how-it-works">
      <div className="how-intro"><h2>From card batch<br/>to <em>checkpoint.</em></h2><p>Keep card allocation, declared trip details and field verification in one traceable workflow.</p><a href="/security" className="how-link">How it works <ArrowRight size={16}/></a><div className="how-decoration"><QrCode size={125}/></div></div>
      <div className="steps-list">{steps.map(({number,icon:Icon,title,text},index)=><article className="step-item" key={number}><div className="step-marker"><span>{number}</span><div className="step-line"/></div><div className="step-content"><div className="step-icon"><Icon size={20}/></div><div><h3>{title}</h3><p>{text}</p></div></div>{index<steps.length-1&&<div className="step-connector"/>}</article>)}</div>
    </section>

    <section className="security-section"><div className="security-graphic"><div className="security-ring ring-one"/><div className="security-ring ring-two"/><div className="security-shield"><ShieldCheck size={47}/></div><div className="security-tag tag-one"><CircleCheck size={15}/> Card identity checked</div><div className="security-tag tag-two"><TimerReset size={15}/> Checkpoint activity logged</div></div><div className="security-copy"><h2>Clear trip details.<br/><em>Accountable checks.</em></h2><p>Agents review the route card before recording a checkpoint. Admins can follow submitted activity and review flagged checks.</p><ul><li><Check size={15}/> Scan a card QR code or enter its MAAF ID</li><li><Check size={15}/> Review declared route and goods</li><li><Check size={15}/> Share checkpoint activity with admins</li></ul></div></section>

    <section className="public-cta" id="contact"><div className="cta-pattern"/><div className="cta-copy"><h2>Bring card operations<br/>into one clear view.</h2><p>Follow each card from production batch to checkpoint activity.</p></div><a href="/agent/signup" className="cta-button">Become an agent <ArrowRight size={18}/></a></section>

    <SiteFooter/>
  </main>;
}
