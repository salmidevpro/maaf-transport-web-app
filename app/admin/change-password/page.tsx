import { redirect } from "next/navigation";
import { getAuthSession, isExpiredAuthSession } from "@/lib/auth";
import { AdminInitialPasswordChange } from "@/components/admin-initial-password-change";

export default async function AdminInitialPasswordPage() {
  const session = await getAuthSession();
  if (!session) redirect(await isExpiredAuthSession() ? "/admin/login?expired=1" : "/admin/login");
  if (session.role !== "admin") redirect("/agent");
  if (!session.mustChangePassword) redirect("/dashboard");
  return <AdminInitialPasswordChange/>;
}
