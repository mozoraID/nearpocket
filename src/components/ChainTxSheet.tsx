"use client";

import { Sheet } from "./Sheet";
import { useT } from "@/lib/i18n";
import { explorerTxUrl } from "@/lib/near/config";

const METHOD_LABEL: Record<string, string> = {
  queue_item: "activity.txQueue",
  request_spend: "activity.txRequest",
  approve_spend: "activity.txApprove",
  reject_spend: "activity.txReject",
  withdraw: "activity.txWithdraw",
  ft_transfer_call: "activity.txDeposit",
  storage_deposit: "activity.txDeposit",
};

export function ChainTxSheet({
  open,
  onClose,
  title,
  hash,
  steps,
  error,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  hash: string;
  steps?: { methodName: string; txHash: string; title?: string; ok?: boolean }[];
  error?: string;
}) {
  const t = useT();
  const rows = steps?.length ? steps : hash ? [{ methodName: "", txHash: hash, title, ok: !error }] : [];
  if (!rows.length) return null;
  const failed = Boolean(error) || rows.some((row) => row.ok === false);
  return (
    <Sheet open={open} onClose={onClose} title={failed ? t("tx.failed") : t("pay.onchain")}>
      <div className="space-y-3">
        <p className="text-sm text-warm-600">{title}</p>
        {error && <p className="text-sm text-[#8a2d1c]">{error}</p>}
        {rows.map((row) => {
          const labelKey = METHOD_LABEL[row.methodName] as
            | "activity.txQueue"
            | "activity.txRequest"
            | "activity.txApprove"
            | "activity.txReject"
            | "activity.txWithdraw"
            | "activity.txDeposit"
            | undefined;
          const label = row.title || (labelKey ? t(labelKey) : row.methodName);
          return (
            <a
              key={row.txHash}
              className="block break-all font-mono text-sm underline"
              href={explorerTxUrl(row.txHash)}
              target="_blank"
              rel="noreferrer"
            >
              {label ? <span className="mb-1 block font-sans text-xs text-warm-600">{label}</span> : null}
              {row.txHash}
            </a>
          );
        })}
      </div>
    </Sheet>
  );
}
