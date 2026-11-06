"use client";

import { useState } from "react";
import { HowItWorksSheet } from "./HowItWorks";
import { NEAR_CONFIG } from "@/lib/near/config";

/** Small "Demo · testnet" pill that opens the How-it-works sheet. */
export function DemoPill() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-cream-300 px-2.5 py-1 text-[11px] font-semibold text-warm-600"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[#d08a1e]" />
        Demo · {NEAR_CONFIG.networkId}
      </button>
      <HowItWorksSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** @deprecated kept for older imports */
export const DemoBanner = DemoPill;
