import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAuthSession } from "@/lib/auth";
import { isExpiredAuthSession } from "@/lib/auth";
import { SessionActivity } from "@/components/session-activity";

export const metadata: Metadata = {
  title: { default: "Admin Dashboard — MAAF Transport Control", template: "%s | MAAF Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminDashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getAuthSession();
  if (!session) redirect(await isExpiredAuthSession() ? "/admin/login?expired=1" : "/admin/login");
  if (session.role !== "admin") redirect("/agent");
  if (session.mustChangePassword) redirect("/admin/change-password");
  return <><SessionActivity role="admin"/>{children}</>;
}
