import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Trip card verification — MAAF", robots: { index: false, follow: false } };

export default async function CardVerificationPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code = "" } = await searchParams;
  redirect(`/agent/card?code=${encodeURIComponent(code)}`);
}
