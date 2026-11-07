import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { getAuthSession } from "@/lib/auth";
import { isExpiredAuthSession } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await getAuthSession();
  if (!session) redirect(await isExpiredAuthSession() ? "/admin/login?expired=1" : "/admin/login");
  if (session.role !== "admin") redirect("/agent");
  return <AdminDashboard userEmail={session.email} userName={session.name} userLastName={session.lastName} userSurname={session.surname} key="overview" />;
}
