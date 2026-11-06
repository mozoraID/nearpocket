import { mockPartnerAdapter } from "./mock-adapter";
import type { SettlementAdapter, SettlementRequest, SettlementReceipt } from "./types";
import type { ParsedQrPayment } from "../qris/parser";
import type { FxQuote } from "../fx/quote";
import { RAILS } from "../qris/countries";

export * from "./types";
export { mockPartnerAdapter };

const adapters: Record<string, SettlementAdapter> = {
  [mockPartnerAdapter.id]: mockPartnerAdapter,
};

export function getAdapter(id = mockPartnerAdapter.id): SettlementAdapter {
  return adapters[id] ?? mockPartnerAdapter;
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
    note: "Virtual card / payment-link concept (mocked partner).",
  };
}

export async function settle(
  req: SettlementRequest,
  adapterId?: string,
): Promise<SettlementReceipt> {
  return getAdapter(adapterId).settle(req);
}
