"use client";

import { metaFor } from "@/lib/marketplaces";

export function MarketplaceMark({
  id,
  size = "sm",
}: {
  id: string;
  size?: "sm" | "md";
}) {
  const m = metaFor(id);
  const dim = size === "md" ? "h-9 w-9 text-xs" : "h-6 w-6 text-[10px]";
  if (!m) {
    return (
      <span className={`inline-flex ${dim} items-center justify-center rounded-lg bg-cream-300 font-bold`}>
        ?
      </span>
    );
  }
  return (
    <span
      className={`inline-flex ${dim} items-center justify-center rounded-lg font-bold`}
      style={{ background: m.color, color: m.textColor || "#fff" }}
      title={m.label}
    >
      {m.mark}
    </span>
  );
}
