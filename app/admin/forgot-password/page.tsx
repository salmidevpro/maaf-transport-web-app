import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ForgotPasswordForm } from "@/components/password-recovery";

export const metadata: Metadata = { title: "Forgot Admin Password — MAAF", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function AdminForgotPasswordPage() {
  return <main className="public-site"><SiteHeader/><div className="login-page-wrap"><ForgotPasswordForm role="admin"/></div><SiteFooter/></main>;
}
