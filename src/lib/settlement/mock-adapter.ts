import type {
  SettlementAdapter,
  SettlementReceipt,
  SettlementRequest,
} from "./types";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Mock licensed off-ramp + QRIS/card payout partner (Xendit / 0xramp / Flip shaped).
 * Architecture in production:
 *   user USDC on NEAR → Intents swap/bridge → partner fiat ledger → QRIS/card payout
 * Crypto is NOT used as a payment instrument to the merchant (BI/OJK compliance).
 */
export const mockPartnerAdapter: SettlementAdapter = {
  id: "mock-pjp",
  label: "NearPocket Sandbox PJP (mock)",
  async settle(req: SettlementRequest): Promise<SettlementReceipt> {
    const now = () => new Date().toISOString();
    const timeline: SettlementReceipt["timeline"] = [
      {
        at: now(),
        status: "user_signed",
        detail: "User approved spend policy / Intent signature (demo).",
      },
      {
        at: now(),
        status: "swapping",
        detail: "NEAR Intents quote: any-token → USDC (dry-run / mocked).",
      },
      {
        at: now(),
        status: "offramping",
        detail: `Sandbox off-ramp ${req.quote.totalUsdc} USDC → ${req.localCurrency}.`,
      },
      {
        at: now(),
        status: "paying_merchant",
        detail:
          req.mode === "qris"
            ? `PJP pays merchant via ${req.rail.name} using EMVCo destination.`
            : `PJP issues ${req.rail.name} payment to destination ref.`,
      },
      {
        at: now(),
        status: "mocked",
        detail: "Sandbox complete — no real fiat moved.",
      },
    ];

    return {
      request: req,
      status: "mocked",
      nearTxHash: `demo.${uid("tx")}`,
      intentsQuoteId: uid("intent"),
      partnerRef: uid("pjp"),
      merchantReceiptId: uid("rcpt"),
      timeline,
      complianceNote:
        "Demo only. In Indonesia, crypto is not a payment instrument (BI/OJK). " +
        "Production flow: licensed PJP converts stablecoin → IDR (or local fiat), " +
        "then pays the merchant via QRIS / card rails. NearPocket never sends crypto to merchants.",
      mocked: true,
    };
  },
};
