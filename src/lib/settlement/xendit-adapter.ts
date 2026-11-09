import { PartnerDownError, type SettlementAdapter, type SettlementReceipt, type SettlementRequest } from "./types";

/**
 * Xendit Test Mode adapter for QRIS create / payout-shaped settlement.
 * Env: XENDIT_SECRET_KEY (test key starts with xnd_development_...)
 * Docs: POST https://api.xendit.co/qr_codes  (api-version: 2022-07-31)
 *
 * Without the key, callers should use the mock adapter instead.
 */
export function createXenditAdapter(secretKey: string): SettlementAdapter {
  const auth = Buffer.from(`${secretKey}:`).toString("base64");

  return {
    id: "xendit-sandbox",
    label: "Xendit Test Mode",
    async settle(req: SettlementRequest): Promise<SettlementReceipt> {
      const now = () => new Date().toISOString();
      const timeline: SettlementReceipt["timeline"] = [
        {
          at: now(),
          status: "user_signed",
          detail: "User approved USDC spend / Intent.",
        },
        {
          at: now(),
          status: "offramping",
          detail: "Xendit sandbox: creating QRIS / recording payout intent.",
        },
      ];

      try {
        // Create a DYNAMIC QRIS code as a sandbox proof we can talk to Xendit.
        // Merchant payout APIs vary by product; QR create is the safest test-mode call.
        const amountIdr =
          req.localCurrency.toUpperCase() === "IDR"
            ? Math.max(1500, Math.round(req.localAmount))
            : Math.max(1500, Math.round(req.quote.amountLocal || req.localAmount * 16000));

        const res = await fetch("https://api.xendit.co/qr_codes", {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",
            "api-version": "2022-07-31",
          },
          body: JSON.stringify({
            reference_id: `nearpocket_${req.id}_${Date.now()}`,
            type: "DYNAMIC",
            currency: "IDR",
            amount: amountIdr,
          }),
        });

        const body = await res.json().catch(() => ({}));
        if (res.status >= 500) {
          throw new PartnerDownError("xendit-sandbox", `Xendit HTTP ${res.status}`);
        }
        if (!res.ok) {
          timeline.push({
            at: now(),
            status: "failed",
            detail: body.error_code === "REQUEST_FORBIDDEN_ERROR"
              ? "Xendit key lacks product permission (enable Money-in / QR Code Write on Test API key in Dashboard)."
              : `Xendit error: ${body.message || body.error_code || res.status}`,
          });
          return {
            request: req,
            status: "failed",
            partnerRef: body.id,
            timeline,
            complianceNote:
              "Xendit sandbox call failed. Crypto still not sent to merchants.",
            mocked: false,
          };
        }

        timeline.push({
          at: now(),
          status: "paying_merchant",
          detail: `Xendit QR created (${body.id}). In production PJP pays merchant via QRIS string.`,
        });
        timeline.push({
          at: now(),
          status: "paid",
          detail: "Sandbox QRIS object created successfully (not a live merchant credit).",
        });

        return {
          request: req,
          status: "paid",
          partnerRef: body.id,
          merchantReceiptId: body.reference_id,
          nearTxHash: undefined,
          timeline,
          complianceNote:
            "Xendit Test Mode. Production: licensed PJP converts USDC→IDR then credits merchant QRIS. Crypto never goes to the merchant.",
          mocked: false,
        };
      } catch (e) {
        if (e instanceof PartnerDownError) throw e;
        throw new PartnerDownError(
          "xendit-sandbox",
          e instanceof Error ? e.message : "xendit network error",
        );
      }
    },
  };
}

export function hasXenditKey() {
  return Boolean(process.env.XENDIT_SECRET_KEY);
}
