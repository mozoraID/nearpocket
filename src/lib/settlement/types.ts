import type { PaymentRail } from "../qris/countries";
import type { FxQuote } from "../fx/quote";

/** Shop checkout metadata. Phone is already masked. No live partner payload. */
export interface ShopOrderMeta {
  shipTo: string;
  orderId: string;
  fiatCurrency: string;
  fiatAmount?: number;
  contractId: string;
  /** Set only for a real testnet account. Absent in demo. */
  testnetAccountId?: string;
}

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
  /** Shop checkout only. Masked ship-to and demo fiat leg. No partner payload. */
  shopOrder?: ShopOrderMeta;
}

export interface SettlementReceipt {
  request: SettlementRequest;
  status: SettlementStatus;
  /** On-chain / intents reference when available */
  nearTxHash?: string;
  intentsQuoteId?: string;
  partnerRef?: string;
  merchantReceiptId?: string;
  timeline: {
    at: string;
    status: SettlementStatus;
    detail: string;
    /** i18n key. The UI prefers this over `detail`. */
    stepKey?: string;
    stepVars?: Record<string, string | number>;
  }[];
  complianceNote: string;
  mocked: boolean;
  /** True when a testnet relayer paid the gas for nearTxHash. */
  gasCovered?: boolean;
  /** On-chain step was not sent because this account is not the contract owner. */
  chainNote?: "owner-only";
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
