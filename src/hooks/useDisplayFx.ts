"use client";

import { useEffect, useState } from "react";
import { useNearPocketStore } from "@/lib/store";
import {
  formatDisplayAmount,
  getDisplayCurrency,
  type DisplayCurrencyCode,
} from "@/lib/region/display-currency";
import { formatRateLine, type FxQuote } from "@/lib/fx/quote";

/** Live USDC→displayCurrency rate for balance / price lines */
export function useDisplayFx() {
  const displayCurrency = useNearPocketStore((s) => s.displayCurrency);
  const [quote, setQuote] = useState<FxQuote | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ccy = displayCurrency || "USD";
    fetch(`/api/fx?currency=${encodeURIComponent(ccy)}&amount=1`)
      .then((r) => r.json())
      .then((q) => {
        if (!cancelled && q?.rate) setQuote(q);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [displayCurrency]);

  const meta = getDisplayCurrency(displayCurrency);
  const rate = quote?.rate ?? (displayCurrency === "USD" ? 1 : null);

  function localFromUsdc(usdc: number): string {
    if (rate == null) return `≈ ${meta.symbol}…`;
    return `≈ ${formatDisplayAmount(usdc * rate, meta.code)}`;
  }

  return {
    displayCurrency: meta.code as DisplayCurrencyCode,
    meta,
    quote,
    rate,
    localFromUsdc,
    rateLine: quote ? formatRateLine(quote) : null,
  };
}
