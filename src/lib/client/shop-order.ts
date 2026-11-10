"use client";

import type { DeliveryAddress } from "@/lib/address";
import { NEAR_CONFIG } from "@/lib/near/config";
import { withShopOrder } from "@/lib/settlement/order-flow";
import type { SettlementRequest } from "@/lib/settlement/types";
import { useNearPocketStore } from "@/lib/store";

/** Display-currency estimate for the demo fiat leg. Falls back to the currency code. */
export async function quoteFiatLeg(
  usdc: number,
  currency: string,
): Promise<{ currency: string; amount?: number }> {
  const code = (currency || "USD").toUpperCase();
  if (code === "USD" || code === "USDC") return { currency: "USD", amount: usdc };
  try {
    const res = await fetch(`/api/fx?currency=${encodeURIComponent(code)}&amount=${usdc}`);
    const q = await res.json();
    if (res.ok && typeof q.amountLocal === "number") {
      return { currency: q.quote || code, amount: q.amountLocal };
    }
  } catch {
    /* The receipt still names the currency and labels the leg as demo. */
  }
  return { currency: code };
}

/** Stamp a shop settlement with the saved address. Does not call a payout partner. */
export async function decorateShopCheckout(
  req: SettlementRequest,
  address: DeliveryAddress,
): Promise<SettlementRequest> {
  const st = useNearPocketStore.getState();
  const fiat = await quoteFiatLeg(req.quote.totalUsdc, st.displayCurrency || "USD");
  return withShopOrder(req, {
    address,
    fiatCurrency: fiat.currency,
    fiatAmount: fiat.amount,
    contractId: NEAR_CONFIG.agentPolicyContract,
    accountId: st.accountId,
    demoMode: st.demoMode,
    networkId: NEAR_CONFIG.networkId,
  });
}
