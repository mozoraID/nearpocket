import type { PaymentRail } from "../qris/countries";
import type { FxQuote } from "../fx/quote";

export type SettlementStatus =
  | "quoted"
  | "user_signed"
  | "swapping"
  | "offramping"
  | "paying_merchant"
  | "paid"
  | "failed"
  | "mocked";

export interface SettlementRequest {
  id: string;
  rail: PaymentRail;
  merchantName: string;
  merchantCity?: string;
  localAmount: number;
  localCurrency: string;
  quote: FxQuote;
  /** EMVCo payload or card PAN token / payment link id */
  destinationRef: string;
  mode: "qris" | "card" | "link" | "merchant_checkout";
  note?: string;
}

export interface SettlementReceipt {
  request: SettlementRequest;
  status: SettlementStatus;
  /** On-chain / intents reference when available */
  nearTxHash?: string;
  intentsQuoteId?: string;
  partnerRef?: string;
  merchantReceiptId?: string;
  timeline: { at: string; status: SettlementStatus; detail: string }[];
  complianceNote: string;
  mocked: boolean;
}

export interface SettlementAdapter {
  id: string;
  label: string;
  /** Licensed-PJP-shaped adapter. Demo implementations are sandboxed/mocked. */
  settle(req: SettlementRequest): Promise<SettlementReceipt>;
}

/** Partner HTTP API was unreachable or returned 5xx. Callers fall back to the mock adapter. */
export class PartnerDownError extends Error {
  readonly partnerId: string;
  constructor(partnerId: string, message: string) {
    super(message);
    this.name = "PartnerDownError";
    this.partnerId = partnerId;
  }
}
