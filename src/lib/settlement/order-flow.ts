import type { DeliveryAddress } from "../address";
import { formatShipTo } from "../address";
import type { SettlementReceipt, SettlementRequest, SettlementStatus, ShopOrderMeta } from "./types";

/**
 * Demo money path for a shop purchase (mode merchant_checkout).
 * NEAR Intents is not executed. No licensed partner is called.
 * A connected testnet account only changes the wording of the lock step
 * so it names request_spend / approve_spend on the agent-policy contract.
 */

export const MERCHANT_CHECKOUT_COMPLIANCE =
  "Demo settlement. Intents quote integration: quotes can be live, execution is not run. " +
  "NEAR Intents only swaps tokens. The fiat leg is a licensed partner. " +
  "Refunds come back in local currency via the partner (planned). " +
  "Crypto is not sent to the marketplace.";

export interface MerchantCheckoutTimelineInput {
  startedAt?: string;
  usdcAmount: number;
  fiatCurrency: string;
  fiatAmount?: number;
  shipTo: string;
  orderId: string;
  contractId: string;
  testnetAccountId?: string | null;
}

const ZERO_DECIMAL = new Set(["IDR", "JPY", "KRW", "VND"]);

export function formatFiatLeg(amount: number | undefined, currency: string): string {
  const code = (currency || "USD").toUpperCase();
  if (amount == null || !Number.isFinite(amount)) return code;
  const rounded = ZERO_DECIMAL.has(code) ? Math.round(amount) : Math.round(amount * 100) / 100;
  return `${rounded.toLocaleString("en-US")} ${code}`;
}

export function isRealTestnetAccount(
  accountId: string | null | undefined,
  demoMode: boolean,
  networkId: string = "testnet",
): boolean {
  if (demoMode || networkId !== "testnet") return false;
  if (!accountId) return false;
  const id = accountId.trim().toLowerCase();
  if (!id || id === "demo.local") return false;
  if (id.endsWith(".near")) return false;
  return true;
}

function atOffset(start: Date, seconds: number): string {
  return new Date(start.getTime() + seconds * 1000).toISOString();
}

export function buildMerchantCheckoutTimeline(input: MerchantCheckoutTimelineInput): {
  timeline: SettlementReceipt["timeline"];
  complianceNote: string;
  orderId: string;
} {
  const start = input.startedAt ? new Date(input.startedAt) : new Date();
  const base = Number.isNaN(start.getTime()) ? new Date() : start;
  const contractId = input.contractId || "agent-policy.testnet";
  const account = input.testnetAccountId?.trim() || "";
  const onTestnet = Boolean(account);
  const usdc = Number.isFinite(input.usdcAmount) ? input.usdcAmount.toFixed(2) : "0.00";
  const fiat = formatFiatLeg(input.fiatAmount, input.fiatCurrency);
  const orderId = input.orderId;
  const shipTo = input.shipTo;

  const steps: {
    offset: number;
    status: SettlementStatus;
    stepKey: string;
    stepVars?: Record<string, string | number>;
    detail: string;
  }[] = [
    onTestnet
      ? {
          offset: 0,
          status: "quoted",
          stepKey: "receipt.stepLockedTestnet",
          stepVars: { contract: contractId, account },
          detail:
            `USDC locked pending approval. References request_spend on ${contractId} ` +
            `(NEAR testnet, ${account}). You approve with approve_spend.`,
        }
      : {
          offset: 0,
          status: "quoted",
          stepKey: "receipt.stepLockedDemo",
          stepVars: { contract: contractId },
          detail:
            `USDC locked pending approval (demo). This mirrors request_spend on ${contractId}. ` +
            "No testnet transaction was sent.",
        },
    {
      offset: 2,
      status: "user_signed",
      stepKey: "receipt.stepApproved",
      detail: "Approved by you.",
    },
    {
      offset: 4,
      status: "offramping",
      stepKey: "receipt.stepOfframp",
      stepVars: { amount: usdc, fiat },
      detail:
        `${usdc} USDC sent to a licensed off-ramp partner (demo) and converted to ${fiat} (demo).`,
    },
    {
      offset: 6,
      status: "paying_merchant",
      stepKey: "receipt.stepMarketplace",
      detail:
        "Marketplace checkout paid via VA/QRIS (demo). Funds are held by the marketplace's buyer protection until delivery.",
    },
    {
      offset: 8,
      status: "mocked",
      stepKey: "receipt.stepPlaced",
      stepVars: { orderId, address: shipTo },
      detail: `Order ${orderId} placed (demo). Ship to: ${shipTo}.`,
    },
  ];

  return {
    orderId,
    complianceNote: MERCHANT_CHECKOUT_COMPLIANCE,
    timeline: steps.map((step) => ({
      at: atOffset(base, step.offset),
      status: step.status,
      detail: step.detail,
      stepKey: step.stepKey,
      stepVars: step.stepVars,
    })),
  };
}

export function withShopOrder(
  req: SettlementRequest,
  opts: {
    address: DeliveryAddress;
    fiatCurrency: string;
    fiatAmount?: number;
    contractId: string;
    accountId: string | null;
    demoMode: boolean;
    networkId?: string;
    orderId?: string;
  },
): SettlementRequest {
  const shipTo = formatShipTo(opts.address);
  const orderId = opts.orderId || `demo.ord_${Date.now().toString(36)}`;
  const testnet = isRealTestnetAccount(opts.accountId, opts.demoMode, opts.networkId || "testnet")
    ? opts.accountId!.trim()
    : undefined;
  const shopOrder: ShopOrderMeta = {
    shipTo,
    orderId,
    fiatCurrency: opts.fiatCurrency,
    contractId: opts.contractId,
  };
  if (opts.fiatAmount != null && Number.isFinite(opts.fiatAmount)) shopOrder.fiatAmount = opts.fiatAmount;
  if (testnet) shopOrder.testnetAccountId = testnet;
  const shipLine = `Ship to: ${shipTo}`;
  const note = req.note?.includes(shipLine) ? req.note : [req.note, shipLine].filter(Boolean).join(" · ");
  return {
    ...req,
    mode: "merchant_checkout",
    note,
    shopOrder,
  };
}
