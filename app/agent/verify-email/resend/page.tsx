import type { Metadata } from "next";
import { AgentVerificationResendForm } from "@/components/agent-verification-resend";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = {
  title: "Verify Agent Email — MAAF",
  description: "Request a MAAF Agent email verification link.",
  robots: { index: false, follow: false },
};

export default function AgentVerificationResendPage() {
  return <main className="public-site"><SiteHeader/><div className="login-page-wrap"><AgentVerificationResendForm/></div><SiteFooter/></main>;
}
