import clsx from "clsx";

const tones: Record<string, string> = {
  paid: "bg-emerald-500/20 text-emerald-300",
  mocked: "bg-amber-500/20 text-amber-200",
  awaiting_approval: "bg-fuchsia-500/20 text-fuchsia-200",
  watching: "bg-sky-500/20 text-sky-200",
  ready: "bg-cyan-500/20 text-cyan-200",
  queued: "bg-slate-500/20 text-slate-200",
  approved: "bg-emerald-500/20 text-emerald-300",
  rejected: "bg-rose-500/20 text-rose-200",
  purchased: "bg-emerald-500/20 text-emerald-300",
  failed: "bg-rose-500/20 text-rose-200",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        tones[status] || "bg-slate-500/20 text-slate-300",
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
