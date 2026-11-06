/**
 * FX quotes: USDC (treated ~ USD) → local fiat.
 * Primary: Frankfurter (ECB). Cross-check: open.er-api.com.
 */

export interface FxQuote {
  base: "USDC";
  quote: string;
  rate: number;
  amountLocal: number;
  amountUsdc: number;
  source: "frankfurter" | "exchangerate-api" | "fallback";
  /** Secondary source rate when cross-checked */
  crossCheckRate?: number;
  crossCheckSource?: string;
  asOf: string;
  feeBps: number;
  feeUsdc: number;
  totalUsdc: number;
}

const FALLBACK_USD: Record<string, number> = {
  IDR: 18069,
  THB: 33.5,
  MYR: 4.35,
  SGD: 1.32,
  JPY: 151,
  KRW: 1380,
  USD: 1,
  EUR: 0.92,
};

const FEE_BPS = 35; // 0.35% demo partner fee

async function frankfurter(ccy: string): Promise<{ rate: number; asOf: string } | null> {
  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=USD&to=${encodeURIComponent(ccy)}`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { rates: Record<string, number>; date: string };
    if (!data.rates?.[ccy]) return null;
    return { rate: data.rates[ccy], asOf: `${data.date}T00:00:00.000Z` };
  } catch {
    return null;
  }
}

async function openErApi(ccy: string): Promise<{ rate: number; asOf: string } | null> {
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
    if (data.result !== "success" || !data.rates?.[ccy]) return null;
    const asOf = data.time_last_update_utc
      ? new Date(data.time_last_update_utc).toISOString()
      : new Date().toISOString();
    return { rate: data.rates[ccy], asOf };
  } catch {
    return null;
  }
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

  if (ccy !== "USD" && ccy !== "USDC") {
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
    } else if (primary && !secondary) {
      /* no cross */
    } else if (!primary && secondary) {
      /* already primary */
    }
  } else {
    rate = 1;
  }

  if (!rate || rate <= 0) rate = FALLBACK_USD.IDR;
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
  const amountLocal = amountUsdc * q.rate;
  const feeUsdc = (amountUsdc * FEE_BPS) / 10_000;
  return {
    ...q,
    amountLocal: Math.round(amountLocal * 100) / 100,
    amountUsdc: round6(amountUsdc),
    feeUsdc: round6(feeUsdc),
    totalUsdc: round6(amountUsdc + feeUsdc),
  };
}

function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}

export function formatFiat(amount: number, currency: string, symbol: string) {
  const ccy = currency.toUpperCase();
  const digits = ["IDR", "JPY", "KRW", "VND"].includes(ccy) ? 0 : 2;
  return `${symbol}${amount.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatUsdc(amount: number) {
  return `${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })} USDC`;
}

/** Format rate line with source + time for UI */
export function formatRateLine(q: FxQuote) {
  const rateStr = q.rate.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const when = new Date(q.asOf).toLocaleString("en-GB", {
    timeZone: "Asia/Jakarta",
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
    ? ` · cross-check ${q.crossCheckSource}: ${q.crossCheckRate.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : "";
  return `1 USDC = ${rateStr} ${q.quote} · ${src}${cross} · ${when} WIB`;
}
