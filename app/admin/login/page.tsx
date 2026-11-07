import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { AppPortalNavigation } from "@/components/app-portal-navigation";
import { PortalLogin } from "@/components/portal-login";
import { getAuthSession, getPortalCredentials } from "@/lib/auth";

export const metadata: Metadata = { title: "Admin Portal Login — MAAF", description: "Sign in to MAAF Admin Portal." };
export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ expired?: string; app?: string }> }) {
  const { expired, app } = await searchParams;
  const appMode = app === "1";
  const session = await getAuthSession();
  if (session?.role === "admin") redirect("/dashboard");
  if (session?.role === "agent") redirect("/agent");
  const credentials = getPortalCredentials("admin");
  return <main className={`public-site${appMode ? " app-portal-mode" : ""}`}>{appMode ? <AppPortalNavigation active="admin"/> : <SiteHeader/>}<div className="login-page-wrap"><PortalLogin role="admin" sessionExpired={expired === "1"} defaultEmail={credentials?.demo ? credentials.email : undefined} appMode={appMode}/></div>{!appMode && <SiteFooter/>}</main>;
}
