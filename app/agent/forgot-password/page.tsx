import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ForgotPasswordForm } from "@/components/password-recovery";

export const metadata: Metadata = { title: "Forgot Agent Password — MAAF", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function AgentForgotPasswordPage() {
  return <main className="public-site"><SiteHeader/><div className="login-page-wrap"><ForgotPasswordForm role="agent"/></div><SiteFooter/></main>;
}
