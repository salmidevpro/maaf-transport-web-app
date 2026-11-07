import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ResetPasswordForm } from "@/components/password-recovery";

export const metadata: Metadata = { title: "Reset Admin Password — MAAF", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function AdminResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <main className="public-site"><SiteHeader/><div className="login-page-wrap"><ResetPasswordForm role="admin" token={token}/></div><SiteFooter/></main>;
}
