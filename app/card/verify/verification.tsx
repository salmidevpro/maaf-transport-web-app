"use client";

import { useEffect, useState } from "react";
import { BusFront, CarFront, CheckCircle2, CircleHelp, QrCode, ShieldAlert, ShieldCheck, Truck, XCircle } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

type VerifiedCard = { code: string; vehicleClass: "Cars" | "Jeep" | "Bus"; destination: string; serial: number; status: string };
const icons = { Cars: CarFront, Jeep: Truck, Bus: BusFront };

export default function CardPassVerification() {
  const [card, setCard] = useState<VerifiedCard | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) { setReady(true); return; }
    fetch(`/api/transport-cards/verify?code=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as VerifiedCard : null)
      .then(setCard)
      .catch(() => setCard(null))
      .finally(() => setReady(true));
  }, []);
  const VehicleIcon = card ? icons[card.vehicleClass] : QrCode;
  return <main className="public-verify-page"><header className="public-header"><a href="/" className="brand public-brand"><div className="brand-mark"><BrandMark size={34}/></div><div><b>maaf<span>.</span></b><small>TRANSPORT CONTROL</small></div></a><span><ShieldCheck size={15}/> OFFICIAL ROUTE CARD CHECK</span></header><section className="public-verify-card"><div className={`public-result-icon ${!ready ? "public-amber" : card ? "public-green" : "public-red"}`}>{!ready ? <QrCode size={25}/> : card ? <CheckCircle2 size={27}/> : <XCircle size={27}/>}</div><span className="eyebrow">IYEWA MULTIMODAL TRANSPORT</span><h1>{!ready ? "Checking card…" : card ? "Route card verified" : "Card not recognized"}</h1><p className="public-lede">{!ready ? "Checking this card number against its route allocation." : card ? "This card number belongs to an allocated transport pass batch." : "This card number was not found in the current route card allocation."}</p>{card && <div className="public-vehicle"><div><span>PASS TYPE</span><b><VehicleIcon size={16}/> {card.vehicleClass} pass</b></div><div><span>DESTINATION</span><b>{card.destination}</b></div><div><span>CARD NUMBER</span><b className="public-code">{card.code}</b></div><div><span>ALLOCATION STATUS</span><b className="public-status"><i/>{card.status}</b></div></div>}<div className={`public-notice ${card ? "notice-good" : ""}`}><ShieldAlert size={16}/><span>This check confirms the printed card is in an allocated batch. It does not confirm payment or NFC activity.</span></div><a href="/" className="public-help"><CircleHelp size={15}/> Need help with a route card?</a></section><footer className="public-footer">© 2026 MAAF Transport Control <span>Keeping Iyewa moving</span></footer></main>;
}
