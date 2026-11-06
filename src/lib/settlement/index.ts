import { mockPartnerAdapter } from "./mock-adapter";
import { createXenditAdapter, hasXenditKey } from "./xendit-adapter";
import { createZeroXRampAdapter, hasZeroXRampConfig } from "./zeroxramp-adapter";
import type { SettlementAdapter, SettlementRequest, SettlementReceipt } from "./types";
import type { ParsedQrPayment } from "../qris/parser";
import type { FxQuote } from "../fx/quote";
import { RAILS } from "../qris/countries";

export * from "./types";
export { mockPartnerAdapter };
export { hasXenditKey } from "./xendit-adapter";
export { hasZeroXRampConfig } from "./zeroxramp-adapter";

export function resolveAdapter(preferred?: string): SettlementAdapter {
  if (preferred === "mock") return mockPartnerAdapter;
  if (preferred === "xendit" || (!preferred && hasXenditKey())) {
    if (hasXenditKey()) return createXenditAdapter(process.env.XENDIT_SECRET_KEY!);
  }
  if (preferred === "0xramp" || preferred === "zeroxramp") {
    if (hasZeroXRampConfig()) {
      return createZeroXRampAdapter({
        partnerId: process.env.ZEROXRAMP_PARTNER_ID!,
        apiBaseUrl: process.env.ZEROXRAMP_API_BASE_URL!,
        apiKey: process.env.ZEROXRAMP_API_KEY,
      });
    }
  }
  if (hasXenditKey()) return createXenditAdapter(process.env.XENDIT_SECRET_KEY!);
  return mockPartnerAdapter;
}

export function buildQrisSettlement(
  parsed: ParsedQrPayment,
  quote: FxQuote,
): SettlementRequest {
  const amount = parsed.transactionAmount
    ? parseFloat(parsed.transactionAmount)
    : quote.amountLocal;
  return {
    id: `pay_${Date.now().toString(36)}`,
    rail: parsed.rail,
    merchantName: parsed.merchantName || "Unknown merchant",
    merchantCity: parsed.merchantCity,
    localAmount: amount,
    localCurrency: parsed.rail.currency,
    quote,
    destinationRef: parsed.raw.slice(0, 64),
    mode: "qris",
  };
}

export function buildCardSettlement(input: {
  merchantName: string;
  amountUsd: number;
  quote: FxQuote;
  destination: string;
}): SettlementRequest {
  return {
    id: `card_${Date.now().toString(36)}`,
    rail: RAILS["card-intl"],
    merchantName: input.merchantName,
    localAmount: input.amountUsd,
    localCurrency: "USD",
    quote: input.quote,
    destinationRef: input.destination,
    mode: "card",
    note: "Virtual card / payment-link concept.",
  };
}

export async function settle(
  req: SettlementRequest,
  adapterId?: string,
): Promise<SettlementReceipt> {
  return resolveAdapter(adapterId).settle(req);
}

export function activeSettlementBackend() {
  if (hasXenditKey()) return "xendit-sandbox";
  if (hasZeroXRampConfig()) return "0xramp-staging";
  return "mock-pjp";
}
