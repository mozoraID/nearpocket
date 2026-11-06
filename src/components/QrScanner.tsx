"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraOff, RefreshCw } from "lucide-react";

type ScanState = "starting" | "running" | "error";

interface Html5QrLike {
  start: (...args: unknown[]) => Promise<unknown>;
  stop: () => Promise<void>;
  clear: () => void;
  isScanning?: boolean;
}

/**
 * Rear-camera QR scanner (html5-qrcode). Calls onResult once per decode.
 * Shows a friendly fallback when the camera is blocked/unavailable.
 */
export function QrScanner({ onResult }: { onResult: (raw: string) => void }) {
  const scannerRef = useRef<Html5QrLike | null>(null);
  const doneRef = useRef(false);
  const cbRef = useRef(onResult);
  cbRef.current = onResult;
  const [state, setState] = useState<ScanState>("starting");
  const [error, setError] = useState<string>("");
  const [attempt, setAttempt] = useState(0);

  const stop = useCallback(async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (!s) return;
    try {
      if (s.isScanning !== false) await s.stop();
    } catch {}
    try {
      s.clear();
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    doneRef.current = false;
    setState("starting");
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("This browser can't open the camera here (needs HTTPS).");
        }
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode("np-qr-reader", {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        }) as unknown as Html5QrLike;
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: (w: number, h: number) => {
              const s = Math.floor(Math.min(w, h) * 0.7);
              return { width: s, height: s };
            } },
          (decoded: string) => {
            if (doneRef.current) return;
            doneRef.current = true;
            stop();
            cbRef.current(decoded);
          },
          () => undefined,
        );
        if (cancelled) {
          stop();
          return;
        }
        setState("running");
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(
          /denied|NotAllowed|Permission/i.test(msg)
            ? "Camera access is blocked. Allow the camera in your browser settings, then try again."
            : /NotFound|Requested device|no camera|Overconstrained/i.test(msg)
              ? "No camera found on this device."
              : msg || "Camera unavailable.",
        );
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [attempt, stop]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink">
      <div className="absolute inset-0">
        <div id="np-qr-reader" className="h-full w-full" />
      </div>
      {state !== "error" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-[62%] max-h-72 w-[70%] max-w-72">
            {["left-0 top-0 border-l-4 border-t-4 rounded-tl-3xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-3xl", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-3xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-3xl"].map((c) => (
              <span key={c} className={`absolute h-10 w-10 border-cream-100 ${c}`} />
            ))}
            {state === "running" && <span className="np-scanline absolute left-3 right-3 h-0.5 rounded bg-cream-100/80" />}
          </div>
        </div>
      )}
      {state === "starting" && (
        <p className="absolute inset-x-0 bottom-5 text-center text-sm text-cream-300">Opening camera…</p>
      )}
      {state === "running" && (
        <p className="absolute inset-x-0 bottom-5 text-center text-sm text-cream-200">Point at the merchant&apos;s QR code</p>
      )}
      {state === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-cream-100">
          <CameraOff className="h-9 w-9 text-cream-300" />
          <p className="text-sm text-cream-200">{error}</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-1 inline-flex h-11 items-center gap-2 rounded-full bg-cream-100 px-5 text-sm font-semibold text-ink"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
          <p className="text-xs text-cream-400">Or use upload / paste / sample below.</p>
        </div>
      )}
    </div>
  );
}

/** Decode a QR from an image file (fallback when the camera is not available). */
export async function decodeQrFromFile(file: File): Promise<string> {
  const { Html5Qrcode } = await import("html5-qrcode");
  let el = document.getElementById("np-qr-file");
  if (!el) {
    el = document.createElement("div");
    el.id = "np-qr-file";
    el.style.display = "none";
    document.body.appendChild(el);
  }
  const s = new Html5Qrcode("np-qr-file", false);
  try {
    return await s.scanFile(file, false);
  } finally {
    try {
      s.clear();
    } catch {}
  }
}
