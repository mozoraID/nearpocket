"use client";

import { useEffect, useRef } from "react";
import { useNearPocketStore } from "@/lib/store";
import { detectDisplayCurrency } from "@/lib/region/display-currency";

const FLAG = "nearpocket-region-bootstrapped";

/** One-time: if user never chose a currency, infer from locale/timezone. */
export function RegionBootstrap() {
  const displayCurrency = useNearPocketStore((s) => s.displayCurrency);
  const setDisplayCurrency = useNearPocketStore((s) => s.setDisplayCurrency);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const unsub = useNearPocketStore.persist.onFinishHydration(() => {
      try {
        if (sessionStorage.getItem(FLAG) === "1") return;
        // Only auto-set when still at default USD and never bootstrapped
        const raw = localStorage.getItem("nearpocket-v3");
        const parsed = raw ? JSON.parse(raw) : null;
        const saved = parsed?.state?.displayCurrency;
        if (saved && saved !== "USD") {
          sessionStorage.setItem(FLAG, "1");
          return;
        }
        // If persist already has explicit USD from a prior chooser, leave it
        if (saved === "USD" && localStorage.getItem("nearpocket-currency-chosen") === "1") {
          sessionStorage.setItem(FLAG, "1");
          return;
        }
        const detected = detectDisplayCurrency();
        if (detected !== displayCurrency) setDisplayCurrency(detected);
        sessionStorage.setItem(FLAG, "1");
      } catch {
        /* */
      }
    });
    if (useNearPocketStore.persist.hasHydrated()) {
      // trigger manually
      try {
        if (sessionStorage.getItem(FLAG) !== "1") {
          const detected = detectDisplayCurrency();
          const raw = localStorage.getItem("nearpocket-v3");
          const parsed = raw ? JSON.parse(raw) : null;
          const saved = parsed?.state?.displayCurrency;
          if (!saved || (saved === "USD" && localStorage.getItem("nearpocket-currency-chosen") !== "1")) {
            if (detected !== "USD" || !saved) setDisplayCurrency(detected);
          }
          sessionStorage.setItem(FLAG, "1");
        }
      } catch { /* */ }
    }
    return unsub;
  }, [displayCurrency, setDisplayCurrency]);

  return null;
}
