import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { BRAND } from "@/config/brand";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.liveUrl),
  title: {
    default: `${BRAND.displayName} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.displayName}`,
  },
  description: BRAND.description,
  applicationName: BRAND.displayName,
  openGraph: {
    type: "website",
    url: BRAND.liveUrl,
    siteName: BRAND.displayName,
    title: `${BRAND.displayName} — Pay anywhere with NEAR`,
    description: BRAND.description,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: BRAND.displayName }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.displayName} — Pay anywhere with NEAR`,
    description: BRAND.description,
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#f5efe6",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
