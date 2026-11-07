"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ExternalLink } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { ActivityRow } from "@/components/ActivityList";
import { Sheet } from "@/components/Sheet";
import { ReceiptView } from "@/components/ReceiptView";
import { useNearPocketStore, type ActivityEntry } from "@/lib/store";
import deployed from "@/config/deployed.json";
import { explorerTxUrl } from "@/lib/near/config";
import { useT } from "@/lib/i18n";

const FILTERS = [
  { id: "all", key: "activity.all" },
  { id: "money", key: "activity.payments" },
  { id: "agent", key: "activity.agent" },
] as const;

const TX_KEYS: Record<string, string> = {
  deploy: "activity.txDeploy",
  set_policy: "activity.txPolicy",
  queue_item: "activity.txQueue",
  request_spend: "activity.txRequest",
  approve_spend: "activity.txApprove",
  upsert_plan: "activity.txPlan",
};

export default function ActivityPage() {
  const t = useT();
  const activity = useNearPocketStore((s) => s.activity);
  const receipts = useNearPocketStore((s) => s.receipts);
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => setMounted(true), []);

  const entries: ActivityEntry[] = useMemo(() => {
    if (!mounted) return [];
    if (activity.length) return activity;
    // Older receipts recorded before the activity log existed
    return receipts.map((r) => ({
      id: r.request.id,
      at: r.timeline?.[0]?.at || new Date().toISOString(),
      kind: "payment" as const,
      title: r.request.merchantName,
      detail: `${r.request.localAmount} ${r.request.localCurrency}`,
      status: r.status,
      amountUsdc: r.request.quote.totalUsdc,
      direction: "out" as const,
      receiptId: r.merchantReceiptId || r.request.id,
    }));
  }, [mounted, activity, receipts]);

  const shown = entries.filter((a) =>
    filter === "all" ? true : filter === "agent" ? a.kind === "agent" : a.kind !== "agent",
  );
  const openReceipt = openId
    ? receipts.find((r) => (r.merchantReceiptId || r.request.id) === openId)
    : undefined;

  return (
    <main>
      <TopBar title={t("nav.activity")} />

      <div className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={clsx(
              "h-10 rounded-full px-4 text-sm font-medium",
              filter === f.id ? "bg-ink text-cream-100" : "bg-cream-100 ring-1 ring-cream-300",
            )}
          >
            {t(f.key)}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="card text-center text-sm text-warm-600">{t("activity.empty")}</div>
      ) : (
        <div className="divide-y divide-cream-300 rounded-3xl bg-cream-100 px-4 ring-1 ring-cream-300">
          {shown.map((a) => (
            <ActivityRow
              key={a.id}
              a={a}
              onClick={a.receiptId && receipts.some((r) => (r.merchantReceiptId || r.request.id) === a.receiptId) ? () => setOpenId(a.receiptId!) : undefined}
            />
          ))}
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-base font-semibold">{t("activity.onChain", { network: deployed.network })}</h2>
        <p className="mb-3 text-sm text-warm-600">{t("activity.onChainHint")}</p>
        <div className="divide-y divide-cream-300 rounded-3xl bg-cream-100 px-4 ring-1 ring-cream-300">
          {Object.entries(deployed.sampleTxs).map(([k, hash]) => (
            <a
              key={k}
              href={explorerTxUrl(hash)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 py-3"
            >
              <span className="min-w-0">
                <span className="block font-medium">{TX_KEYS[k] ? t(TX_KEYS[k]) : k}</span>
                <span className="block truncate font-mono text-xs text-warm-600">{k} · {hash.slice(0, 14)}…</span>
              </span>
              <ExternalLink className="h-4 w-4 shrink-0" />
            </a>
          ))}
        </div>
      </section>

      <Sheet open={!!openReceipt} onClose={() => setOpenId(null)} title={t("activity.receipt")}>
        {openReceipt && <ReceiptView receipt={openReceipt} />}
      </Sheet>
    </main>
  );
}
