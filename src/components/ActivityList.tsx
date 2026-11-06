"use client";

import { ArrowDownLeft, ArrowUpRight, Bot, CreditCard, ShoppingBag } from "lucide-react";
import type { ActivityEntry } from "@/lib/store";
import { StatusBadge } from "./StatusBadge";

const ICON: Record<string, typeof ArrowUpRight> = { payment: ArrowUpRight, purchase: ShoppingBag, topup: ArrowDownLeft, agent: Bot, card: CreditCard };

function when(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function ActivityRow({ a, onClick }: { a: ActivityEntry; onClick?: () => void }) {
  const Icon = ICON[a.kind] || ArrowUpRight;
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="flex w-full items-center gap-3 py-3 text-left"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream-300">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{a.title}</span>
        <span className="block truncate text-xs text-warm-600">
          {a.detail ? `${a.detail} · ` : ""}
          {when(a.at)}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {typeof a.amountUsdc === "number" && (
          <span className="text-sm font-semibold">
            {a.direction === "in" ? "+" : "−"}
            {a.amountUsdc.toFixed(2)}
          </span>
        )}
        {a.status && a.kind !== "topup" && <StatusBadge status={a.status} />}
      </span>
    </Wrapper>
  );
}
