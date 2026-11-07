import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "MAAF Transport Control",
  robots: { index: false, follow: false },
};

export default function LegacyVehicleVerificationPage() {
  redirect("/");
}
