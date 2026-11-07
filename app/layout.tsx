import type { Metadata } from "next";
import "./globals.css";
import "./card-trips.css";
import "./admin-agent-access-responsive.css";
import "./agent-portal.css";
import { MessageAutoScroll } from "@/components/message-auto-scroll";
import { PagePreloader } from "@/components/page-preloader";

export const metadata: Metadata = {
  metadataBase: new URL("https://maafnigerialtd.com"),
  title: {
    default: "MAAF Transport Control | QR Trip Cards & Checkpoints",
    template: "%s | MAAF Transport Control",
  },
  description: "Create transport card batches, assign declared trips, and verify QR trip cards at checkpoints with MAAF Transport Control.",
  applicationName: "MAAF Transport Control",
  keywords: ["transport cards Nigeria", "QR trip card verification", "transport card batches", "trip checkpoint verification", "MAAF Transport Control"],
  alternates: { canonical: "/" },
  icons: { icon: "/icon.svg", shortcut: "/icon.svg" },
  openGraph: {
    type: "website",
    locale: "en_NG",
    url: "/",
    siteName: "MAAF Transport Control",
    title: "MAAF Transport Control | QR Trip Cards & Checkpoints",
    description: "Create transport card batches, assign declared trips, and verify QR trip cards at checkpoints with MAAF Transport Control.",
    images: [{ url: "/maaf-social-card.png", width: 1200, height: 630, alt: "MAAF Transport Control — QR trip cards and checkpoint verification" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MAAF Transport Control | QR Trip Cards & Checkpoints",
    description: "Create transport card batches, assign declared trips, and verify QR trip cards at checkpoints with MAAF Transport Control.",
    images: ["/maaf-social-card.png"],
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/></head><body suppressHydrationWarning><PagePreloader/><MessageAutoScroll />{children}</body></html>;
}

