"use client";

import { Sheet } from "./Sheet";
import { useT } from "@/lib/i18n";
import { explorerTxUrl } from "@/lib/near/config";

export function ChainTxSheet({
  open,
  onClose,
  title,
  hash,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  hash: string;
}) {
  const t = useT();
  if (!hash) return null;
  return (
    <Sheet open={open} onClose={onClose} title={t("pay.onchain")}>
      <div className="space-y-3">
        <p className="text-sm text-warm-600">{title}</p>
        <a
          className="block break-all font-mono text-sm underline"
          href={explorerTxUrl(hash)}
          target="_blank"
          rel="noreferrer"
        >
          {hash}
        </a>
      </div>
    </Sheet>
  );
}
