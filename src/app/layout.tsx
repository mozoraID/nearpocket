import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Nearly — Pay nearly anywhere",
  description:
    "NEAR wallet for QRIS, worldwide payments, merchant checkout & autonomous shopping agents with user-controlled spend limits. Built for NEAR HACKATHON.",
  applicationName: "Nearly",
};

export const viewport: Viewport = {
  themeColor: "#070b14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
