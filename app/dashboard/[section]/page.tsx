import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { getAuthSession, isExpiredAuthSession } from "@/lib/auth";

const sections = {
  "fleet-registry": "Fleet registry",
  "agent-access": "Agent access",
  "users-roles": "Users & roles",
  verification: "Verification",
  "agent-messages": "Agent messages",
  reports: "Reports",
  settings: "Settings",
} as const;

export const metadata: Metadata = {
  title: "Admin Workspace — MAAF Transport Control",
  robots: { index: false, follow: false },
};

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!Object.prototype.hasOwnProperty.call(sections, section)) redirect("/dashboard");
  const session = await getAuthSession();
  if (!session) redirect(await isExpiredAuthSession() ? "/admin/login?expired=1" : "/admin/login");
  if (session.role !== "admin") redirect("/agent");
  const view = sections[section as keyof typeof sections];
  return <AdminDashboard userEmail={session.email} userName={session.name} userLastName={session.lastName} userSurname={session.surname} key={section} initialView={view} />;
}
