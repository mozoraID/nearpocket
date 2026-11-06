/**
 * FX quotes: USDC (≈ USD) → local fiat.
 * Primary: Frankfurter (ECB). Fallback / cross-check: open.er-api.com.
 */

import { DISPLAY_CURRENCY_CODES, type DisplayCurrencyCode } from "@/lib/region/display-currency";

export interface FxQuote {
  base: "USDC";
  quote: string;
  rate: number;
  amountLocal: number;
  amountUsdc: number;
  source: "frankfurter" | "exchangerate-api" | "fallback";
  crossCheckRate?: number;
  crossCheckSource?: string;
  asOf: string;
  feeBps: number;
  feeUsdc: number;
  totalUsdc: number;
}

export interface FxTableRow {
  currency: string;
  rate: number;
  source: FxQuote["source"];
  asOf: string;
  crossCheckRate?: number;
}

/** Static fallbacks when both live sources miss a pair */
const FALLBACK_USD: Record<string, number> = {
  USD: 1,
  USDC: 1,
  EUR: 0.92,
  GBP: 0.79,
  IDR: 16250,
  THB: 34.2,
  MYR: 4.45,
  SGD: 1.34,
  PHP: 58.2,
  VND: 25400,
  JPY: 151,
  KRW: 1385,
  INR: 83.5,
};

const FEE_BPS = 35;

async function frankfurter(ccy: string): Promise<{ rate: number; asOf: string } | null> {
  if (ccy === "USD" || ccy === "USDC") return { rate: 1, asOf: new Date().toISOString() };
  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=USD&to=${encodeURIComponent(ccy)}`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { rates: Record<string, number>; date: string };
    if (!data.rates?.[ccy]) return null;
    return { rate: data.rates[ccy], asOf: `${data.date}T12:00:00.000Z` };
  } catch {
    return null;
  }
}

async function openErApiAll(): Promise<{ rates: Record<string, number>; asOf: string } | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      rates?: Record<string, number>;
      time_last_update_utc?: string;
      result?: string;
    };
    if (data.result !== "success" || !data.rates) return null;
    const asOf = data.time_last_update_utc
      ? new Date(data.time_last_update_utc).toISOString()
      : new Date().toISOString();
    return { rates: data.rates, asOf };
  } catch {
    return null;
  }
}

async function openErApi(ccy: string): Promise<{ rate: number; asOf: string } | null> {
  const all = await openErApiAll();
  if (!all?.rates?.[ccy]) return null;
  return { rate: all.rates[ccy], asOf: all.asOf };
}

export async function quoteLocalToUsdc(
  currency: string,
  amountLocal: number,
): Promise<FxQuote> {
  const ccy = currency.toUpperCase();
  let rate = FALLBACK_USD[ccy];
  let source: FxQuote["source"] = "fallback";
  let asOf = new Date().toISOString();
  let crossCheckRate: number | undefined;
  let crossCheckSource: string | undefined;

  if (ccy === "USD" || ccy === "USDC") {
    rate = 1;
    source = "frankfurter";
  } else {
    const [primary, secondary] = await Promise.all([frankfurter(ccy), openErApi(ccy)]);
    if (primary) {
      rate = primary.rate;
      source = "frankfurter";
      asOf = primary.asOf;
    } else if (secondary) {
      rate = secondary.rate;
      source = "exchangerate-api";
      asOf = secondary.asOf;
    }
    if (secondary && primary) {
      crossCheckRate = secondary.rate;
      crossCheckSource = "open.er-api.com";
    }
  }

  if (!rate || rate <= 0) rate = FALLBACK_USD[ccy] || 1;
  const amountUsdc = amountLocal / rate;
  const feeUsdc = (amountUsdc * FEE_BPS) / 10_000;
  const totalUsdc = amountUsdc + feeUsdc;

  return {
    base: "USDC",
    quote: ccy,
    rate,
    amountLocal,
    amountUsdc: round6(amountUsdc),
    source,
    crossCheckRate,
    crossCheckSource,
    asOf,
    feeBps: FEE_BPS,
    feeUsdc: round6(feeUsdc),
    totalUsdc: round6(totalUsdc),
  };
}

export async function quoteUsdcToLocal(
  currency: string,
  amountUsdc: number,
): Promise<FxQuote> {
  const q = await quoteLocalToUsdc(currency, 1);
  const zero = ["IDR", "JPY", "KRW", "VND", "INR"].includes(currency.toUpperCase());
  const amountLocal = amountUsdc * q.rate;
  const feeUsdc = (amountUsdc * FEE_BPS) / 10_000;
  return {
    ...q,
    amountLocal: zero ? Math.round(amountLocal) : Math.round(amountLocal * 100) / 100,
    amountUsdc: round6(amountUsdc),
    feeUsdc: round6(feeUsdc),
    totalUsdc: round6(amountUsdc + feeUsdc),
  };
}

/** Batch table for Settings — one live open.er-api pull + per-ccy Frankfurter where available */
export async function quoteUsdcTable(
  codes: string[] = DISPLAY_CURRENCY_CODES,
): Promise<FxTableRow[]> {
  const er = await openErApiAll();
  const rows: FxTableRow[] = [];
  await Promise.all(
    codes.map(async (code) => {
      const ccy = code.toUpperCase();
      if (ccy === "USD" || ccy === "USDC") {
        rows.push({ currency: "USD", rate: 1, source: "frankfurter", asOf: new Date().toISOString() });
        return;
      }
      const primary = await frankfurter(ccy);
      const secondaryRate = er?.rates?.[ccy];
      if (primary) {
        rows.push({
          currency: ccy,
          rate: primary.rate,
          source: "frankfurter",
          asOf: primary.asOf,
          crossCheckRate: secondaryRate,
        });
      } else if (secondaryRate) {
        rows.push({
          currency: ccy,
          rate: secondaryRate,
          source: "exchangerate-api",
          asOf: er!.asOf,
        });
      } else {
        rows.push({
          currency: ccy,
          rate: FALLBACK_USD[ccy] || 1,
          source: "fallback",
          asOf: new Date().toISOString(),
        });
      }
    }),
  );
  // Stable order matching DISPLAY_CURRENCY_CODES
  const order = new Map(codes.map((c, i) => [c.toUpperCase(), i]));
  rows.sort((a, b) => (order.get(a.currency) ?? 99) - (order.get(b.currency) ?? 99));
  return rows;
}

function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}

export function formatFiat(amount: number, currency: string, symbol: string) {
  const ccy = currency.toUpperCase();
  const digits = ["IDR", "JPY", "KRW", "VND", "INR"].includes(ccy) ? 0 : 2;
  return `${symbol}${amount.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

/** User-facing USDC — always 2 decimals. Keep full precision in store/quotes. */
export function formatUsdc(amount: number) {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USDC`;
}

export function formatRateLine(q: FxQuote, timeZone = "Asia/Jakarta") {
  const rateStr = q.rate.toLocaleString("en-US", { maximumFractionDigits: 4 });
  const when = new Date(q.asOf).toLocaleString("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const src =
    q.source === "frankfurter"
      ? "Frankfurter/ECB"
      : q.source === "exchangerate-api"
        ? "open.er-api"
        : "fallback";
  const cross = q.crossCheckRate
    ? ` · cross-check ${q.crossCheckSource}: ${q.crossCheckRate.toLocaleString("en-US", { maximumFractionDigits: 4 })}`
    : "";
  const tzLabel = timeZone === "Asia/Jakarta" ? "WIB" : timeZone.split("/").pop() || "";
  return `1 USDC = ${rateStr} ${q.quote} · ${src}${cross} · ${when} ${tzLabel}`.trim();
}

export function sourceLabel(source: FxQuote["source"]) {
  if (source === "frankfurter") return "Frankfurter/ECB";
  if (source === "exchangerate-api") return "open.er-api";
  return "fallback";
}

export type { DisplayCurrencyCode };
