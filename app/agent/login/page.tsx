import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { AppPortalNavigation } from "@/components/app-portal-navigation";
import { PortalLogin } from "@/components/portal-login";
import { getAuthSession, getPortalCredentials } from "@/lib/auth";

export const metadata: Metadata = { title: "Agent Portal Login — MAAF", description: "Sign in to MAAF Agent Portal." };
export default async function AgentLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; expired?: string; app?: string }> }) {
  const { next, expired, app } = await searchParams;
  const appMode = app === "1";
  const session = await getAuthSession();
  if (session?.role === "agent") redirect("/agent");
  if (session?.role === "admin") redirect("/dashboard");
  const credentials = getPortalCredentials("agent");
  const nextPath = next?.startsWith("/agent/card?") && !next.startsWith("//") ? next : undefined;
  return <main className={`public-site${appMode ? " app-portal-mode" : ""}`}>{appMode ? <AppPortalNavigation active="agent"/> : <SiteHeader/>}<div className="login-page-wrap"><PortalLogin role="agent" nextPath={nextPath} sessionExpired={expired === "1"} defaultEmail={credentials?.demo ? credentials.email : undefined} appMode={appMode}/></div>{!appMode && <SiteFooter/>}</main>;
}
