"use client";

import { useState } from "react";
import { DeliveryAddressForm } from "./DeliveryAddressForm";
import { useT } from "@/lib/i18n";
import { defaultAddress } from "@/lib/address";
import { useNearPocketStore } from "@/lib/store";
import type { WaitlistItem } from "@/lib/agent/policy";

/** Approve stays available. The address form opens in this step, then the caller signs. */
export function SpendDecision({
  item,
  busy,
  onApprove,
  onReject,
  variant = "ink",
}: {
  item: WaitlistItem;
  busy: boolean;
  onApprove: () => Promise<void>;
  onReject: () => Promise<void>;
  /** `cream` is for the dark home card. */
  variant?: "ink" | "cream";
}) {
  const t = useT();
  const addresses = useNearPocketStore((s) => s.addresses);
  const address = defaultAddress(addresses);
  const [askAddress, setAskAddress] = useState(false);

  return (
    <div className="mt-3 space-y-3">
      {askAddress && !address && (
        <div className="rounded-2xl bg-cream-100 p-3 text-ink">
          <p className="mb-2 text-sm text-warm-600">{t("shop.addressAtCheckout")}</p>
          <DeliveryAddressForm
            forceDefault
            onSaved={() => {
              setAskAddress(false);
              void onApprove();
            }}
          />
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className={`h-11 flex-1 rounded-full text-sm font-semibold disabled:opacity-40 ${variant === "cream" ? "bg-cream-100 text-ink" : "bg-ink text-cream-100"}`}
          disabled={busy}
          onClick={() => {
            if (!address) {
              setAskAddress(true);
              return;
            }
            void onApprove();
          }}
        >
          {busy ? t("home.paying") : `${t("home.approve")} ${item.currentPriceUsdc.toFixed(2)}`}
        </button>
        <button
          type="button"
          className={variant === "cream" ? "h-11 flex-1 rounded-full border border-cream-400/40 font-semibold text-cream-100" : "btn-outline !min-h-11 flex-1"}
          disabled={busy}
          onClick={() => void onReject()}
        >
          {t("home.reject")}
        </button>
      </div>
    </div>
  );
}
