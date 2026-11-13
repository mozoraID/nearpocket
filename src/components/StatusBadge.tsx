"use client";

import clsx from "clsx";
import { useT } from "@/lib/i18n";

const tones: Record<string, string> = {
  paid: "bg-[#e3eedb] text-[#2f5a1f]",
  purchased: "bg-[#e3eedb] text-[#2f5a1f]",
  approved: "bg-[#e3eedb] text-[#2f5a1f]",
  completed: "bg-[#e3eedb] text-[#2f5a1f]",
  active: "bg-[#e3eedb] text-[#2f5a1f]",
  mocked: "bg-cream-300 text-warm-600",
  sandbox: "bg-[#f4e3c7] text-[#7a4b0c]",
  sandbox_partner: "bg-[#f4e3c7] text-[#7a4b0c]",
  onchain: "bg-[#e3eedb] text-[#2f5a1f]",
  awaiting_approval: "bg-ink text-cream-100",
  ready: "bg-[#f4e3c7] text-[#7a4b0c]",
  watching: "bg-[#e6e1f2] text-[#463a73]",
  searching: "bg-[#e6e1f2] text-[#463a73]",
  queued: "bg-cream-300 text-warm-600",
  rejected: "bg-[#f4dcd6] text-[#8a2d1c]",
  failed: "bg-[#f4dcd6] text-[#8a2d1c]",
  expired: "bg-cream-300 text-warm-600",
};

const STATUS_KEYS: Record<string, string> = {
  awaiting_approval: "status.needsYou",
  mocked: "status.demoPayment",
  sandbox: "status.sandbox",
  sandbox_partner: "status.sandboxPartner",
  onchain: "status.onchain",
  watching: "status.watching",
  searching: "status.searching",
  queued: "status.queued",
  rejected: "status.rejected",
  failed: "status.failed",
  expired: "status.expired",
  paid: "status.paid",
  purchased: "status.purchased",
  approved: "status.approved",
  completed: "status.completed",
  active: "status.active",
  ready: "status.ready",
};

export function StatusBadge({ status }: { status: string }) {
  const t = useT();
  const key = STATUS_KEYS[status];
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize",
        tones[status] || "bg-cream-300 text-warm-600",
      )}
    >
      {key ? t(key) : status.replace(/_/g, " ")}
    </span>
  );
}
