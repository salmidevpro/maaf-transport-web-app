import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AgentDashboard } from "@/components/agent-dashboard";
import { getAuthSession, isExpiredAuthSession } from "@/lib/auth";
import { SessionActivity } from "@/components/session-activity";

export const metadata: Metadata = { title: "Agent Portal — MAAF Transport Control", description: "View field activity, verify trip cards, receive admin messages, and manage your agent profile." };
export default async function AgentPortalPage() {
  const session = await getAuthSession();
  if (!session) redirect(await isExpiredAuthSession() ? "/agent/login?expired=1" : "/agent/login");
  if (session.role !== "agent") redirect("/dashboard");
  return <><SessionActivity role="agent"/><AgentDashboard name={session.name} email={session.email}/></>;
}
