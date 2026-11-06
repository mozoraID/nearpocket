/**
 * FX quotes: USDC (treated ~ USD) → local fiat.
 * Uses Frankfurter (ECB) when online; falls back to baked demo rates.
 */

export interface FxQuote {
  base: "USDC";
  quote: string;
  rate: number;
  amountLocal: number;
  amountUsdc: number;
  source: "frankfurter" | "fallback";
  asOf: string;
  feeBps: number;
  feeUsdc: number;
  totalUsdc: number;
}

const FALLBACK_USD: Record<string, number> = {
  IDR: 16250,
  THB: 33.5,
  MYR: 4.35,
  SGD: 1.32,
  JPY: 151,
  KRW: 1380,
  USD: 1,
  EUR: 0.92,
};

const FEE_BPS = 35; // 0.35% demo partner fee

export async function quoteLocalToUsdc(
  currency: string,
  amountLocal: number,
): Promise<FxQuote> {
  const ccy = currency.toUpperCase();
  let rate = FALLBACK_USD[ccy];
  let source: FxQuote["source"] = "fallback";
  let asOf = new Date().toISOString();

  if (ccy !== "USD" && ccy !== "USDC") {
    try {
      const res = await fetch(
        `https://api.frankfurter.app/latest?from=USD&to=${encodeURIComponent(ccy)}`,
        { next: { revalidate: 300 } },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          rates: Record<string, number>;
          date: string;
        };
        if (data.rates?.[ccy]) {
          rate = data.rates[ccy];
          source = "frankfurter";
          asOf = `${data.date}T00:00:00.000Z`;
        }
      }
    } catch {
      /* use fallback */
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
