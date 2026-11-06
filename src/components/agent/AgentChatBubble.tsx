"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n";
import { useNearPocketStore } from "@/lib/store";
import type { WaitlistItem } from "@/lib/agent/policy";
import { metaFor } from "@/lib/marketplaces";

type Msg = { role: "user" | "agent"; text: string; item?: WaitlistItem };

function parseIdrBudget(text: string): number | null {
  // 300rb / 300 ribu / Rp300.000 / under 20 USDC
  const usdc = text.match(/(?:under|below|di bawah|max|budget)\s*(\d+(?:[.,]\d+)?)\s*(?:usdc|usd)?/i);
  if (usdc && /usdc|usd/i.test(text)) return parseFloat(usdc[1].replace(",", "."));
  const rb = text.match(/(\d+(?:[.,]\d+)?)\s*(rb|ribu)/i);
  if (rb) return Math.round((parseFloat(rb[1].replace(",", ".")) * 1000) / 18069 * 100) / 100;
  const rp = text.match(/(?:rp|idr)\s*([\d.,]+)/i);
  if (rp) {
    const n = parseFloat(rp[1].replace(/\./g, "").replace(",", "."));
    if (n > 100) return Math.round((n / 18069) * 100) / 100;
  }
  const plain = text.match(/(\d+(?:[.,]\d+)?)\s*usdc/i);
  if (plain) return parseFloat(plain[1].replace(",", "."));
  return null;
}

function parseDeadline(text: string): string {
  const lower = text.toLowerCase();
  const days = ["minggu", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const map: Record<string, number> = {
    minggu: 0, sunday: 0, senin: 1, monday: 1, selasa: 2, tuesday: 2, rabu: 3, wednesday: 3,
    kamis: 4, thursday: 4, jumat: 5, friday: 5, sabtu: 6, saturday: 6,
  };
  for (const d of days) {
    if (lower.includes(d) || lower.includes(`sebelum ${d}`)) {
      const target = map[d];
      const now = new Date();
      const cur = now.getDay();
      let add = (target - cur + 7) % 7;
      if (add === 0) add = 7;
      now.setDate(now.getDate() + add);
      return now.toISOString().slice(0, 10);
    }
  }
  if (/besok|tomorrow/.test(lower)) {
    const n = new Date();
    n.setDate(n.getDate() + 1);
    return n.toISOString().slice(0, 10);
  }
  return new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
}

function parseItem(text: string): string {
  const cleaned = text
    .replace(/cari|tolong|minta|find|get|buy|belikan|sebelum|before|di bawah|under|below|rp[\d.,]+|\d+\s*(rb|ribu|usdc|usd)|jumat|friday|senin|monday|selasa|rabu|kamis|sabtu|minggu/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 60) || text.slice(0, 60);
}

export function AgentChatBubble() {
  const t = useT();
  const pathname = usePathname();
  const addWaitlist = useNearPocketStore((s) => s.addWaitlist);
  const logActivity = useNearPocketStore((s) => s.logActivity);
  const connected = useNearPocketStore((s) => s.connectedMarketplaces);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "agent",
      text: "Hi! Tell me what to find — e.g. “cari earbuds di bawah 300rb sebelum Jumat”. I’ll waitlist it; you approve every buy.",
    },
  ]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  // Hide on pay scan fullscreen-ish? Keep everywhere above nav.
  if (pathname?.startsWith("/pay") && !open) {
    /* still show bubble */
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const budget = parseIdrBudget(text) ?? 15;
      const deadline = parseDeadline(text);
      const title = parseItem(text);

      // Prefer API parse when available
      let item: WaitlistItem | null = null;
      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "parse", text }),
        });
        if (res.ok) item = (await res.json()) as WaitlistItem;
      } catch { /* rule-based below */ }

      if (!item) {
        item = {
          id: `wl_${Date.now().toString(36)}`,
          title,
          merchant: "Any connected marketplace",
          category: /earbud|phone|keyboard|laptop/i.test(title) ? "electronics" : "digital",
          targetPriceUsdc: budget,
          currentPriceUsdc: budget * 1.15,
          maxBudgetUsdc: budget,
          deadline,
          status: "watching",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          agentReason: `Watching until ≤ ${budget} USDC before ${deadline}.`,
          notes: text,
          mocked: true,
        };
      } else {
        item = {
          ...item,
          maxBudgetUsdc: item.maxBudgetUsdc || budget,
          deadline: item.deadline || deadline,
          targetPriceUsdc: item.maxBudgetUsdc || budget,
        };
      }

      // Quick search across connected marketplaces
      const only = connected.join(",");
      try {
        const data = await (
          await fetch(`/api/marketplaces?q=${encodeURIComponent(item.title)}&only=${encodeURIComponent(only)}`)
        ).json();
        const offers = (data.offers || []) as { priceUsdc: number; marketplace: string; title: string; mocked?: boolean; url?: string }[];
        const best = offers[0];
        if (best) {
          item.currentPriceUsdc = best.priceUsdc;
          item.marketplace = metaFor(best.marketplace)?.label || best.marketplace;
          item.mocked = best.mocked;
          item.url = best.url;
          item.status = best.priceUsdc <= (item.maxBudgetUsdc || item.targetPriceUsdc) ? "awaiting_approval" : "watching";
          item.agentReason =
            item.status === "awaiting_approval"
              ? `Found at ${best.priceUsdc.toFixed(2)} USDC on ${item.marketplace}. Waiting for your OK.`
              : `Cheapest now ${best.priceUsdc.toFixed(2)} USDC. Watching until ≤ ${item.maxBudgetUsdc} USDC.`;
        }
      } catch { /* keep parsed */ }

      addWaitlist(item);
      logActivity({
        kind: "agent",
        title: `Agent watching: ${item.title}`,
        detail: `Budget ${item.maxBudgetUsdc} USDC · until ${item.deadline}`,
        status: item.status,
      });

      setMsgs((m) => [
        ...m,
        {
          role: "agent",
          text:
            item!.status === "awaiting_approval"
              ? `${t("agent.needApprove")} “${item!.title}” @ ${item!.currentPriceUsdc.toFixed(2)} USDC (${item!.marketplace || "marketplace"}).`
              : `${t("agent.created")} Watching “${item!.title}” ≤ ${item!.maxBudgetUsdc} USDC until ${item!.deadline}.`,
          item,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-[76px] right-[max(1rem,calc((100vw-440px)/2+1rem))] z-40 flex h-14 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-cream-100 shadow-lg"
          aria-label={t("agent.bubble")}
        >
          <Bot className="h-5 w-5" />
          {t("agent.bubble")}
        </button>
      )}

      {open && (
        <div className="fixed bottom-[76px] right-[max(0.5rem,calc((100vw-440px)/2+0.5rem))] z-50 flex h-[min(70dvh,520px)] w-[min(100vw-1rem,380px)] flex-col overflow-hidden rounded-[28px] bg-cream-100 shadow-2xl ring-1 ring-cream-300">
          <div className="flex items-center justify-between border-b border-cream-300 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-cream-100">
                <Bot className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">{t("agent.chatTitle")}</p>
                <p className="text-[11px] text-warm-600">You approve every buy</p>
              </div>
            </div>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-cream-300"
              onClick={() => setOpen(false)}
              aria-label={t("common.close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === "user" ? "ml-auto bg-ink text-cream-100" : "bg-cream-200 text-ink"
                }`}
              >
                {m.text}
              </div>
            ))}
            {busy && <p className="text-xs text-warm-500">{t("agent.thinking")}</p>}
            <div ref={endRef} />
          </div>
          <form
            className="flex gap-2 border-t border-cream-300 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              className="input !min-h-11 flex-1 !rounded-full text-sm"
              placeholder={t("agent.placeholder")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-cream-100 disabled:opacity-40"
              aria-label={t("agent.send")}
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
