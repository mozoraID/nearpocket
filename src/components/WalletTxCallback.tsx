"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChainTxSheet } from "./ChainTxSheet";
import { clearPending, publishChainTx, readPending, type ChainTxNotice } from "@/lib/near/chain-tx";
import { readTxHash } from "@/lib/near/gasless";
import { useT } from "@/lib/i18n";

/** Opens a receipt for a wallet popup result or a redirect back with transactionHashes. */
export function WalletTxCallback() {
  const t = useT();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [notice, setNotice] = useState<ChainTxNotice | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onTx(event: Event) {
      const detail = (event as CustomEvent<ChainTxNotice>).detail;
      if (detail?.txHash) setNotice(detail);
    }
    window.addEventListener("nearpocket-chain-tx", onTx);
    return () => window.removeEventListener("nearpocket-chain-tx", onTx);
  }, []);

  useEffect(() => {
    const hashes = params.get("transactionHashes");
    const errorCode = params.get("errorCode");
    if (!hashes && !errorCode) return;
    const pending = readPending();
    clearPending();
    if (errorCode) {
      setError(params.get("errorMessage") || errorCode);
    } else {
      const hash = readTxHash(hashes);
      if (hash) {
        publishChainTx({
          kind: pending?.kind || "request",
          title: pending?.title || t("pay.onchain"),
          detail: pending?.detail,
          amountUsdc: pending?.amountUsdc,
          direction: pending?.direction,
          txHash: hash,
        });
      }
    }
    const next = new URLSearchParams(params.toString());
    for (const key of ["transactionHashes", "errorCode", "errorMessage"]) next.delete(key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [params, pathname, router, t]);

  return (
    <>
      {error && (
        <p className="mb-3 rounded-2xl bg-[#f4dcd6] px-4 py-3 text-sm text-[#8a2d1c]">{error}</p>
      )}
      <ChainTxSheet
        open={Boolean(notice)}
        onClose={() => setNotice(null)}
        title={notice?.title || ""}
        hash={notice?.txHash || ""}
      />
    </>
  );
}
