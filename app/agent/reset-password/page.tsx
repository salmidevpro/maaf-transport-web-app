import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ResetPasswordForm } from "@/components/password-recovery";

export const metadata: Metadata = { title: "Reset Agent Password — MAAF", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function AgentResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <main className="public-site"><SiteHeader/><div className="login-page-wrap"><ResetPasswordForm role="agent" token={token}/></div><SiteFooter/></main>;
}
