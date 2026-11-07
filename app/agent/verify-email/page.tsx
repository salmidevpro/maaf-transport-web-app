import type { Metadata } from "next";
import { AgentEmailVerification } from "@/components/agent-email-verification";

export const metadata: Metadata = {
  title: "Verify Email — MAAF",
  description: "Securely verify your MAAF Agent account email.",
  robots: { index: false, follow: false },
};
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <AgentEmailVerification token={token} />;
}
