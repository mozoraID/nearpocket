"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { depositToEscrow, withdrawFromEscrow, type WalletBalances } from "@/lib/near/escrow-actions";

export function EscrowPanel({
  balances,
  onRefresh,
}: {
  balances: WalletBalances;
  onRefresh: () => void;
}) {
  const t = useT();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"deposit" | "withdraw" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(kind: "deposit" | "withdraw") {
    const value = Number(amount);
    if (!(value > 0)) {
      setMsg(t("escrow.needAmount"));
      return;
    }
    setBusy(kind);
    setMsg(null);
    try {
      const result =
        kind === "deposit"
          ? await depositToEscrow(value, t("escrow.deposited", { amount: value.toFixed(2) }))
          : await withdrawFromEscrow(value, t("escrow.withdrew", { amount: value.toFixed(2) }));
      if (result.txHash) {
        setAmount("");
        onRefresh();
        return;
      }
      if (kind === "deposit" && result.detail === "wallet") setMsg(t("escrow.notEnoughWallet"));
      else if (kind === "withdraw" && result.detailCode === "needs-escrow") {
        setMsg(t("escrow.notEnoughEscrow"));
      } else setMsg(result.detail || t("shop.errorGeneric"));
    } catch (error) {
      setMsg(error instanceof Error ? error.message : t("shop.errorGeneric"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-cream-300 pt-4">
      <h3 className="font-semibold">{t("escrow.title")}</h3>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-2xl bg-cream-200 p-3">
          <p className="text-[11px] text-warm-600">{t("escrow.wallet")}</p>
          <p className="font-semibold">{balances.walletUsdc.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl bg-cream-200 p-3">
          <p className="text-[11px] text-warm-600">{t("escrow.available")}</p>
          <p className="font-semibold">{balances.escrowAvailableUsdc.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl bg-cream-200 p-3">
          <p className="text-[11px] text-warm-600">{t("escrow.locked")}</p>
          <p className="font-semibold">{balances.escrowLockedUsdc.toFixed(2)}</p>
        </div>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm text-warm-600">{t("escrow.amount")}</span>
        <input
          className="input"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-primary" disabled={busy !== null} onClick={() => run("deposit")}>
          {busy === "deposit" ? t("escrow.depositing") : t("escrow.deposit")}
        </button>
        <button type="button" className="btn-outline" disabled={busy !== null} onClick={() => run("withdraw")}>
          {busy === "withdraw" ? t("escrow.withdrawing") : t("escrow.withdraw")}
        </button>
      </div>
      {msg && <p className="text-sm text-warm-600">{msg}</p>}
    </div>
  );
}
