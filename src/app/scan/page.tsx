"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DemoBanner } from "@/components/DemoBanner";
import { parseEmvQr } from "@/lib/qris/parser";
import { BRAND } from "@/config/brand";

export default function ScanPage() {
  const router = useRouter();
  const regionRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!regionRef.current) return;
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const scanner = new Html5Qrcode("nearly-qr-reader");
        scannerRef.current = scanner;
        setRunning(true);
        await scanner.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            if (cancelled) return;
            setLast(decoded);
            try {
              const parsed = parseEmvQr(decoded);
              sessionStorage.setItem("nearly_scanned_qr", decoded);
              sessionStorage.setItem("nearly_scanned_summary", parsed.summary);
              scanner.stop().catch(() => undefined);
              router.push("/pay?from=scan");
            } catch {
              setError("Decoded, but not a valid EMVCo payment QR. Try again.");
            }
          },
          () => undefined,
        );
      } catch (e) {
        setError(
          e instanceof Error
            ? `${e.message} — izinkan kamera, atau paste payload di Pay QR.`
            : "Camera unavailable",
        );
        setRunning(false);
      }
    }
    start();
    return () => {
      cancelled = true;
      scannerRef.current?.stop().catch(() => undefined);
      scannerRef.current?.clear();
    };
  }, [router]);

  return (
    <main className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Scan QR (beta)</h1>
        <p className="text-sm text-slate-400">
          {BRAND.displayName} camera scanner for QRIS / EMVCo — works best on mobile
        </p>
      </header>
      <DemoBanner />
      <div className="card overflow-hidden p-2">
        <div id="nearly-qr-reader" ref={regionRef} className="overflow-hidden rounded-2xl" />
      </div>
      {running && <p className="text-xs text-slate-400">Point your camera at a merchant QR…</p>}
      {error && (
        <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      )}
      {last && (
        <p className="break-all font-mono text-[10px] text-slate-500">{last.slice(0, 120)}…</p>
      )}
      <button type="button" className="btn-ghost w-full" onClick={() => router.push("/pay")}>
        Or paste payload in Pay QR →
      </button>
    </main>
  );
}
