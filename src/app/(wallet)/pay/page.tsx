"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { ArrowLeft, Check, ClipboardPaste, Globe, ImageUp, Loader2, QrCode, Store } from "lucide-react";
import { QrScanner, decodeQrFromFile } from "@/components/QrScanner";
import { Sheet } from "@/components/Sheet";
import { ReceiptView } from "@/components/ReceiptView";
import { DemoPill } from "@/components/DemoBanner";
import { parseEmvQr, type ParsedQrPayment } from "@/lib/qris/parser";
import { classifyQr } from "@/lib/qris/scan";
import { SAMPLE_QRS, type SampleKey } from "@/lib/qris/samples";
import { formatFiat, formatUsdc, formatRateLine, type FxQuote } from "@/lib/fx/quote";
import { useDisplayFx } from "@/hooks/useDisplayFx";
import { formatDisplayAmount } from "@/lib/region/display-currency";
import { buildCardSettlement, buildQrisSettlement, type SettlementReceipt, type SettlementRequest } from "@/lib/settlement";
import { useNearPocketStore } from "@/lib/store";
import { settleAndRecord, COUNTRY_FLAG } from "@/lib/client/pay";
import { WorldCardView } from "@/components/WorldCardView";
import { useT } from "@/lib/i18n";

type Stage = "scan" | "confirm" | "world" | "paying" | "done";
type PayWith = "USDC" | "NEAR";

const SAMPLE_LABEL: Record<SampleKey, string> = {
  indonesia: "🇮🇩 QRIS",
  thailand: "🇹🇭 PromptPay",
  malaysia: "🇲🇾 DuitNow",
  singapore: "🇸🇬 NETS",
  japan: "🇯🇵 JPQR",
  korea: "🇰🇷 Korea QR",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function PayInner() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const balanceUsdc = useNearPocketStore((s) => s.balanceUsdc);
  const { displayCurrency, meta: displayMeta, rate: displayRate } = useDisplayFx();

  const [stage, setStage] = useState<Stage>(params.get("tab") === "world" ? "world" : "scan");
  const [parsed, setParsed] = useState<ParsedQrPayment | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [quote, setQuote] = useState<FxQuote | null>(null);
  const [nearPerUsdc, setNearPerUsdc] = useState<{ usdcPerNear: number; real: boolean } | null>(null);
  const [payWith, setPayWith] = useState<PayWith>("USDC");
  const [backend, setBackend] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [step, setStep] = useState(0);
  const [receipt, setReceipt] = useState<SettlementReceipt | null>(null);
  const [pendingReq, setPendingReq] = useState<SettlementRequest | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Worldwide form
  const [wMerchant, setWMerchant] = useState("Apple Store Online");
  const [wAmount, setWAmount] = useState("49");

  const handleRaw = useCallback((raw: string) => {
    setError(null);
    try {
      const p = parseEmvQr(raw.trim());
      const issue = classifyQr({
        crcValid: p.crcValid,
        merchantName: p.merchantName,
        merchantAccountCount: p.merchantAccountInformation.length,
      });
      if (issue === "bad-crc") {
        setError(t("pay.badCrc"));
        setStage("scan");
        return;
      }
      if (issue === "invalid") throw new Error("not emv");
      setParsed(p);
      setAmountInput(p.transactionAmount || "");
      setQuote(null);
      setStage("confirm");
    } catch {
      setError(t("pay.badQr"));
      setStage("scan");
    }
  }, [t]);

  useEffect(() => {
    fetch("/api/settle").then((r) => r.json()).then((d) => setBackend(d.backend || "")).catch(() => null);
    fetch("/api/quote?from=NEAR&amount=1")
      .then((r) => r.json())
      .then((q) => {
        const v = parseFloat(q?.toAmount);
        if (v > 0) setNearPerUsdc({ usdcPerNear: v, real: Boolean(q.real) });
      })
      .catch(() => null);
    const scanned = sessionStorage.getItem("nearpocket_scanned_qr");
    if (scanned) {
      sessionStorage.removeItem("nearpocket_scanned_qr");
      handleRaw(scanned);
    }
  }, [handleRaw]);

  const localAmount = useMemo(() => {
    const n = parseFloat((parsed?.transactionAmount || amountInput || "").replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [parsed, amountInput]);

  // FX quote for the confirm screen
  useEffect(() => {
    if (stage !== "confirm" || !parsed || !localAmount) {
      setQuote(null);
      return;
    }
    const rateTimer = setTimeout(() => {
      fetch(`/api/fx?currency=${encodeURIComponent(parsed.rail.currency)}&amount=${localAmount}`)
        .then((r) => r.json())
        .then((q) => q?.totalUsdc && setQuote(q))
        .catch(() => setError(t("pay.rateError")));
    }, 250);
    return () => clearTimeout(rateTimer);
  }, [stage, parsed, localAmount, t]);

  const partnerLabel = backend === "xendit-sandbox" ? t("pay.partnerXendit") : t("pay.partnerPayout");

  const steps = useMemo(() => {
    const isCard = pendingReq?.mode === "card";
    return [
      t("pay.signed"),
      payWith === "NEAR" ? t("pay.convertingNear") : t("pay.routingUsdc"),
      isCard ? t("pay.virtualCharged") : partnerLabel,
      backend === "xendit-sandbox" ? t("pay.sandboxXendit") : t("pay.demoCompleted"),
    ];
  }, [payWith, partnerLabel, pendingReq, backend, t]);

  async function run(req: SettlementRequest, title: string) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError(t("pay.offline"));
      setStage(req.mode === "card" ? "world" : "confirm");
      return;
    }
    if (req.quote.totalUsdc > balanceUsdc) {
      setError(t("pay.notEnough"));
      return;
    }
    setError(null);
    setPendingReq(req);
    setReceipt(null);
    setStage("paying");
    setStep(0);
    try {
      await sleep(600);
      setStep(1);
      await sleep(800);
      setStep(2);
      const r = await settleAndRecord(req, { title });
      setStep(r.status === "failed" ? 2 : 3);
      await sleep(500);
      setStep(4);
      setReceipt(r);
      setStage("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("pay.failed"));
      setStage(req.mode === "card" ? "world" : "confirm");
    }
  }

  function payQr() {
    if (!parsed || !quote) return;
    const req = buildQrisSettlement(parsed, quote);
    if (payWith === "NEAR") req.note = "Intents quote integration. The quote is live; swap execution is not run. Settlement stays demo or sandbox.";
    run(req, parsed.merchantName || t("pay.merchantFallback"));
  }

  async function payWorld() {
    const amount = parseFloat(wAmount);
    if (!amount || amount <= 0) {
      setError(t("pay.amountRequired"));
      return;
    }
    const fx = (await (await fetch(`/api/fx?currency=USD&amount=${amount}`)).json()) as FxQuote;
    const req = buildCardSettlement({
      merchantName: wMerchant || "Online store",
      amountUsd: amount,
      quote: fx,
      destination: `card_link:${(wMerchant || "store").toLowerCase().replace(/\s+/g, "_")}`,
    });
    req.note = `Intents quote integration. Card settlement is still a demo. From ${payWith}.`;
    run(req, wMerchant || "Online store");
  }

  function reset() {
    setParsed(null);
    setQuote(null);
    setReceipt(null);
    setPendingReq(null);
    setError(null);
    setStage("scan");
  }

  const nearNeeded =
    quote && nearPerUsdc ? (quote.totalUsdc / nearPerUsdc.usdcPerNear).toFixed(3) : null;

  const PayWithToggle = (
    <div className="flex items-center justify-between rounded-2xl bg-cream-200 p-1">
      {(["USDC", "NEAR"] as PayWith[]).map((token) => (
        <button
          key={token}
          type="button"
          onClick={() => setPayWith(token)}
          className={clsx(
            "h-10 flex-1 rounded-xl text-sm font-semibold",
            payWith === token ? "bg-ink text-cream-100" : "text-warm-600",
          )}
        >
          {t("pay.payWith", { token })}
        </button>
      ))}
    </div>
  );

  // ───────────────────────── Scan
  if (stage === "scan") {
    return (
      <main className="-mx-5 -mt-4">
        <div className="relative h-[min(62dvh,560px)] w-full">
          <QrScanner onResult={handleRaw} />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
            <h1 className="text-lg font-semibold text-cream-100">{t("pay.scanTitle")}</h1>
            <DemoPill />
          </div>
        </div>
        <div className="space-y-3 px-5 pt-5">
          {error && <p className="rounded-2xl bg-[#f4dcd6] px-4 py-3 text-sm text-[#8a2d1c]">{error}</p>}
          <button type="button" className="btn-primary w-full" onClick={() => handleRaw(SAMPLE_QRS.indonesia)}>
            <QrCode className="h-5 w-5" /> {t("pay.useSample")}
          </button>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SAMPLE_QRS) as SampleKey[]).filter((k) => k !== "indonesia").map((k) => (
              <button
                key={k}
                type="button"
                className="h-9 rounded-full bg-cream-100 px-3 text-xs font-medium ring-1 ring-cream-300"
                onClick={() => handleRaw(SAMPLE_QRS[k])}
              >
                {SAMPLE_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
              <ImageUp className="h-4 w-4" /> {t("pay.upload")}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setPasteOpen(true)}>
              <ClipboardPaste className="h-4 w-4" /> {t("pay.paste")}
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                handleRaw(await decodeQrFromFile(f));
              } catch (error) {
                const message = error instanceof Error ? error.message : "";
                setError(/offline|network|failed to fetch/i.test(message) ? t("pay.offline") : t("pay.uploadFailed"));
              }
            }}
          />
          <div className="divide-y divide-cream-300 rounded-3xl bg-cream-100 px-4 ring-1 ring-cream-300">
            <button type="button" onClick={() => setStage("world")} className="flex w-full items-center gap-3 py-4 text-left">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-cream-300"><Globe className="h-5 w-5" /></span>
              <span className="flex-1">
                <span className="block font-semibold">{t("pay.worldwide")}</span>
                <span className="text-xs text-warm-600">{t("pay.worldwideHint")}</span>
              </span>
            </button>
            <Link href="/merchant" className="flex w-full items-center gap-3 py-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-cream-300"><Store className="h-5 w-5" /></span>
              <span className="flex-1">
                <span className="block font-semibold">{t("pay.merchant")}</span>
                <span className="text-xs text-warm-600">{t("pay.merchantHint")}</span>
              </span>
            </Link>
          </div>
        </div>

        <Sheet open={pasteOpen} onClose={() => setPasteOpen(false)} title={t("pay.pasteTitle")}>
          <div className="space-y-4">
            <textarea
              className="input min-h-28 font-mono text-xs"
              placeholder="000201010212…"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <div>
              <p className="mb-2 text-sm text-warm-600">{t("pay.orSample")}</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(SAMPLE_QRS) as SampleKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="h-10 rounded-full bg-cream-300 px-4 text-sm font-medium"
                    onClick={() => {
                      setPasteOpen(false);
                      handleRaw(SAMPLE_QRS[k]);
                    }}
                  >
                    {SAMPLE_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="btn-primary w-full"
              disabled={!pasteText.trim()}
              onClick={() => {
                setPasteOpen(false);
                handleRaw(pasteText);
              }}
            >
              {t("common.continue")}
            </button>
          </div>
        </Sheet>
      </main>
    );
  }

  // ───────────────────────── Paying (progress)
  if (stage === "paying") {
    const req = pendingReq!;
    return (
      <main className="flex min-h-[70dvh] flex-col justify-center">
        <p className="text-center text-sm text-warm-600">{t("pay.paying", { name: req.merchantName })}</p>
        <p className="mt-1 text-center text-4xl font-bold tracking-tight">
          {formatFiat(req.localAmount, req.localCurrency, req.rail.currencySymbol)}
        </p>
        <p className="text-center text-sm text-warm-600">{formatUsdc(req.quote.totalUsdc)}</p>
        <ol className="card mt-8 space-y-4">
          {steps.map((label, i) => {
            const done = step > i;
            const active = step === i;
            return (
              <li key={label} className="flex items-center gap-3">
                <span
                  className={clsx(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    done ? "bg-ink text-cream-100" : active ? "bg-cream-300" : "bg-cream-200 text-warm-500",
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="text-xs">{i + 1}</span>}
                </span>
                <span className={clsx("text-[15px]", done || active ? "font-medium" : "text-warm-500")}>{label}</span>
              </li>
            );
          })}
        </ol>
      </main>
    );
  }

  // ───────────────────────── Done (receipt)
  if (stage === "done" && receipt) {
    return (
      <main className="space-y-4">
        <ReceiptView receipt={receipt} />
        <button type="button" className="btn-primary w-full" onClick={reset}>
          {t("common.done")}
        </button>
        <button type="button" className="btn-secondary w-full" onClick={() => router.push("/activity")}>
          {t("pay.viewActivity")}
        </button>
      </main>
    );
  }

  // ───────────────────────── Worldwide = NearPocket Card
  if (stage === "world") {
    return <WorldCardView
      reset={reset}
      wMerchant={wMerchant}
      setWMerchant={setWMerchant}
      wAmount={wAmount}
      setWAmount={setWAmount}
      PayWithToggle={PayWithToggle}
      payWith={payWith}
      nearPerUsdc={nearPerUsdc}
      error={error}
      payWorld={payWorld}
      setError={setError}
    />;
  }

  // ───────────────────────── Confirm
  const p = parsed!;
  return (
    <main className="space-y-5">
      <button type="button" onClick={reset} className="flex h-10 items-center gap-1 text-sm font-medium">
        <ArrowLeft className="h-4 w-4" /> {t("pay.scanAgain")}
      </button>

      <section className="card">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cream-300 text-2xl">
            {COUNTRY_FLAG[p.rail.countryCode] || "🏳️"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{p.merchantName || t("pay.merchantFallback")}</p>
            <p className="text-sm text-warm-600">
              {[p.merchantCity, p.rail.country].filter(Boolean).join(", ")} · {p.rail.name}
            </p>
          </div>
        </div>
        {!p.crcValid && (
          <p className="mt-3 rounded-xl bg-[#f4dcd6] px-3 py-2 text-sm text-[#8a2d1c]">{t("pay.crcFail")}</p>
        )}
        <div className="mt-5 border-t border-cream-300 pt-5 text-center">
          {p.transactionAmount ? (
            <p className="text-4xl font-bold tracking-tight">
              {formatFiat(localAmount, p.rail.currency, p.rail.currencySymbol)}
            </p>
          ) : (
            <label className="block">
              <span className="text-sm text-warm-600">{t("pay.enterAmount", { currency: p.rail.currency })}</span>
              <input
                autoFocus
                className="mt-2 w-full bg-transparent text-center text-4xl font-bold tracking-tight outline-none placeholder:text-cream-400"
                inputMode="decimal"
                placeholder="0"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </label>
          )}
          <p className="mt-2 text-sm text-warm-600">
            {quote
              ? t("pay.feeLine", { usdc: formatUsdc(quote.totalUsdc), fee: quote.feeBps / 100 })
              : localAmount
                ? t("pay.gettingRate")
                : " "}
          </p>
          {quote && displayRate && displayCurrency !== p.rail.currency && displayCurrency !== "USD" && (
            <p className="mt-1 text-sm text-warm-600">
              ≈ {formatDisplayAmount(quote.totalUsdc * displayRate, displayCurrency)} {displayMeta.flag} ({displayCurrency})
            </p>
          )}
          {quote && <p className="mt-1 text-[11px] text-warm-500">{formatRateLine(quote)}</p>}
        </div>
      </section>

      {PayWithToggle}
      {payWith === "NEAR" && nearNeeded && (
        <p className="-mt-2 px-1 text-sm text-warm-600">
          {nearPerUsdc?.real
            ? t("pay.nearLive", { amount: nearNeeded })
            : t("pay.nearEstimate", { amount: nearNeeded })}
        </p>
      )}

      {error && <p className="rounded-2xl bg-[#f4dcd6] px-4 py-3 text-sm text-[#8a2d1c]">{error}</p>}

      <button type="button" className="btn-primary h-14 w-full text-lg" disabled={!quote || !p.crcValid} onClick={payQr}>
        {localAmount
          ? t("pay.payFiat", { amount: formatFiat(localAmount, p.rail.currency, p.rail.currencySymbol) })
          : t("pay.pay")}
      </button>
      <p className="text-center text-xs text-warm-500">
        {t("pay.merchantGets", {
          currency: p.rail.currency,
          balance: formatUsdc(Math.max(0, balanceUsdc - (quote?.totalUsdc || 0))),
        })}
      </p>
    </main>
  );
}

function PayFallback() {
  return (
    <main className="-mx-5 -mt-4">
      <div className="relative h-[min(62dvh,560px)] w-full bg-ink/90" />
      <div className="space-y-3 px-5 pt-5">
        <div className="h-14 animate-pulse rounded-full bg-cream-300" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-12 animate-pulse rounded-full bg-cream-300" />
          <div className="h-12 animate-pulse rounded-full bg-cream-300" />
        </div>
      </div>
    </main>
  );
}

export default function PayPage() {
  return (
    <Suspense fallback={<PayFallback />}>
      <PayInner />
    </Suspense>
  );
}
