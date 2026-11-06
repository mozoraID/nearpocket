import type { SettlementAdapter, SettlementReceipt, SettlementRequest } from "./types";

/**
 * 0xramp research (docs.0xramp.app, Nov 2026):
 * - Partner SDK for ZEC ↔ local fiat (Pix, UPI, QRIS, …) via hosted pane.
 * - Environments: "production" | "staging" with issued partnerId + apiBaseUrl.
 * - Local sandbox pane is host-simulation only (no live API).
 * - There is NO public unauthenticated USDC→IDR REST sandbox comparable to Xendit.
 *
 * We implement a staging-shaped session adapter when env is present; otherwise
 * the settlement router falls back to mock and README documents this gap.
 *
 * Env vars (when Abi has partner credentials):
 *   ZEROXRAMP_PARTNER_ID
 *   ZEROXRAMP_API_BASE_URL   (https staging origin)
 *   ZEROXRAMP_API_KEY        (optional bearer if issued)
 */
export function createZeroXRampAdapter(opts: {
  partnerId: string;
  apiBaseUrl: string;
  apiKey?: string;
}): SettlementAdapter {
  return {
    id: "0xramp-staging",
    label: "0xramp staging (session)",
    async settle(req: SettlementRequest): Promise<SettlementReceipt> {
      const now = () => new Date().toISOString();
      const timeline: SettlementReceipt["timeline"] = [
        { at: now(), status: "user_signed", detail: "User approved spend." },
        {
          at: now(),
          status: "offramping",
          detail: "Creating 0xramp partner session (sell → local fiat).",
        },
      ];

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "X-Partner-Id": opts.partnerId,
        };
        if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;

        const res = await fetch(`${opts.apiBaseUrl.replace(/\/$/, "")}/api/partner/v0/sessions`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            direction: "sell",
            // 0xramp v0 pilot is ZEC-centric; we pass fiat hint for IDR corridors.
            asset: "ZEC",
            fiat: req.localCurrency || "IDR",
            amountAsset: String(req.quote.totalUsdc),
            partnerSessionId: req.id,
          }),
          redirect: "error",
        });

        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          timeline.push({
            at: now(),
            status: "failed",
            detail: `0xramp session error ${res.status}: ${body.message || "see docs.0xramp.app"}`,
          });
          return {
            request: req,
            status: "failed",
            timeline,
            complianceNote:
              "0xramp staging call failed. SDK is ZEC-centric; USDC corridors need partner enablement.",
            mocked: false,
          };
        }

        timeline.push({
          at: now(),
          status: "paying_merchant",
          detail: `Session ${body.sessionRef || "created"}. Host pane would complete fiat payout.`,
        });
        timeline.push({
          at: now(),
          status: "paid",
          detail: "Staging session opened (not a confirmed merchant credit).",
        });

        return {
          request: req,
          status: "paid",
          partnerRef: body.sessionRef,
          timeline,
          complianceNote:
            "0xramp staging session. Attribution: Powered by 0xramp / P2P.me. Crypto not sent to merchant.",
          mocked: false,
        };
      } catch (e) {
        timeline.push({
          at: now(),
          status: "failed",
          detail: e instanceof Error ? e.message : "0xramp error",
        });
        return {
          request: req,
          status: "failed",
          timeline,
          complianceNote: "0xramp staging unreachable.",
          mocked: false,
        };
      }
    },
  };
}

export function hasZeroXRampConfig() {
  return Boolean(
    process.env.ZEROXRAMP_PARTNER_ID && process.env.ZEROXRAMP_API_BASE_URL,
  );
}
