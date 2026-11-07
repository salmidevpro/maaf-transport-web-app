import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AgentDashboard } from "@/components/agent-dashboard";
import { getAuthSession, isExpiredAuthSession } from "@/lib/auth";
import { SessionActivity } from "@/components/session-activity";

export const metadata: Metadata = { title: "Trip card verification — MAAF Agent", robots: { index: false, follow: false } };

export default async function AgentCardPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code = "" } = await searchParams;
  const session = await getAuthSession();
  if (!session) {
    const expired = await isExpiredAuthSession();
    const params = new URLSearchParams();
    if (expired) params.set("expired", "1");
    params.set("next", `/agent/card?code=${code}`);
    redirect(`/agent/login?${params.toString()}`);
  }
  if (session.role !== "agent") redirect("/dashboard");
  return <><SessionActivity role="agent" returnPath={`/agent/card?code=${encodeURIComponent(code)}`}/><AgentDashboard name={session.name} email={session.email} initialView="Verify" initialCode={code}/></>;
}
