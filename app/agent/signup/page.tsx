import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { AgentSignupPreview } from "@/components/agent-signup-preview";

export const metadata: Metadata = {
  title: "Agent Sign Up — MAAF",
  description: "Start your MAAF Agent Portal registration.",
};

export default function AgentSignupPage() {
  return <main className="public-site"><SiteHeader/><AgentSignupPreview/><SiteFooter/></main>;
}
