import clsx from "clsx";

const tones: Record<string, string> = {
  paid: "bg-[#e3eedb] text-[#2f5a1f]",
  purchased: "bg-[#e3eedb] text-[#2f5a1f]",
  approved: "bg-[#e3eedb] text-[#2f5a1f]",
  completed: "bg-[#e3eedb] text-[#2f5a1f]",
  active: "bg-[#e3eedb] text-[#2f5a1f]",
  mocked: "bg-cream-300 text-warm-600",
  awaiting_approval: "bg-ink text-cream-100",
  ready: "bg-[#f4e3c7] text-[#7a4b0c]",
  watching: "bg-[#e6e1f2] text-[#463a73]",
  searching: "bg-[#e6e1f2] text-[#463a73]",
  queued: "bg-cream-300 text-warm-600",
  rejected: "bg-[#f4dcd6] text-[#8a2d1c]",
  failed: "bg-[#f4dcd6] text-[#8a2d1c]",
  expired: "bg-cream-300 text-warm-600",
};

const labels: Record<string, string> = {
  awaiting_approval: "Needs you",
  mocked: "Demo",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize",
        tones[status] || "bg-cream-300 text-warm-600",
      )}
    >
      {labels[status] || status.replace(/_/g, " ")}
    </span>
  );
}
