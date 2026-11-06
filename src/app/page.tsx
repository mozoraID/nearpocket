import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = {
  title: `${BRAND.displayName} — Pay anywhere with NEAR`,
  description: BRAND.description,
  openGraph: {
    title: `${BRAND.displayName} — Pay anywhere with NEAR`,
    description: BRAND.description,
    url: BRAND.liveUrl,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: BRAND.displayName }],
  },
};

export default function MarketingHome() {
  return <LandingPage />;
}
