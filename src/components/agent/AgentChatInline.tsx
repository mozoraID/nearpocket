"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useNearPocketStore } from "@/lib/store";
import type { WaitlistItem } from "@/lib/agent/policy";
import { attachSavedAddress } from "@/lib/agent/delivery";
import { defaultAddress, formatShipTo } from "@/lib/address";
import { metaFor } from "@/lib/marketplaces";
import { requestWaitlistOnChain } from "@/lib/client/agent";

type Msg = { role: "user" | "agent"; text: string; item?: WaitlistItem };

/** Parse budget from EN or ID text → USDC */
export function parseBudgetUsdc(text: string): number | null {
  const lower = text.toLowerCase();
  // $20 / 20$ / under $20
  const dollar = text.match(/\$\s*(\d+(?:[.,]\d+)?)/);
  if (dollar) return parseFloat(dollar[1].replace(",", "."));
  const usdc = lower.match(/(?:under|below|di bawah|max|budget|≤|<=)?\s*(\d+(?:[.,]\d+)?)\s*(?:usdc|usd)\b/);
  if (usdc) return parseFloat(usdc[1].replace(",", "."));
  const underNum = lower.match(/(?:under|below|di bawah)\s*(\d+(?:[.,]\d+)?)\b(?!\s*(rb|ribu))/);
  if (underNum && !/(rb|ribu|rp)/i.test(text)) return parseFloat(underNum[1].replace(",", "."));
  const rb = text.match(/(\d+(?:[.,]\d+)?)\s*(rb|ribu)\b/i);
  if (rb) return Math.round((parseFloat(rb[1].replace(",", ".")) * 1000) / 18069 * 100) / 100;
  const rp = text.match(/(?:rp|idr)\s*([\d.,]+)/i);
  if (rp) {
    const n = parseFloat(rp[1].replace(/\./g, "").replace(",", "."));
    if (n > 100) return Math.round((n / 18069) * 100) / 100;
  }
  return null;
}

export function parseDeadline(text: string): string {
  const lower = text.toLowerCase();
  const map: Record<string, number> = {
    minggu: 0, sunday: 0, senin: 1, monday: 1, selasa: 2, tuesday: 2, rabu: 3, wednesday: 3,
    kamis: 4, thursday: 4, jumat: 5, friday: 5, sabtu: 6, saturday: 6,
  };
  for (const [d, target] of Object.entries(map)) {
    if (lower.includes(d) || lower.includes(`sebelum ${d}`) || lower.includes(`by ${d}`)) {
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

export function parseItem(text: string): string {
  const cleaned = text
    .replace(/cari|tolong|minta|find|get|buy|belikan|sebelum|before|by|di bawah|under|below|rp[\d.,]+|\$[\d.,]+|\d+\s*(rb|ribu|usdc|usd)|jumat|friday|senin|monday|selasa|tuesday|rabu|wednesday|kamis|thursday|sabtu|saturday|minggu|sunday/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 60) || text.slice(0, 60);
}

export function AgentChatInline() {
  const t = useT();
  const addWaitlist = useNearPocketStore((s) => s.addWaitlist);
  const logActivity = useNearPocketStore((s) => s.logActivity);
  const connected = useNearPocketStore((s) => s.connectedMarketplaces);
  const addresses = useNearPocketStore((s) => s.addresses);
  const demoMode = useNearPocketStore((s) => s.demoMode);
  const accountId = useNearPocketStore((s) => s.accountId);
  const savedAddress = defaultAddress(addresses);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const greeting = t("agent.greeting");

  // Reset greeting when language changes
  useEffect(() => {
    setMsgs([{ role: "agent", text: greeting }]);
  }, [greeting]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);
    const delivery = savedAddress
      ? { shipTo: formatShipTo(savedAddress), addressId: savedAddress.id }
      : undefined;
    setBusy(true);
    try {
      const budget = parseBudgetUsdc(text) ?? 15;
      const deadline = parseDeadline(text);
      const title = parseItem(text);

      let item: WaitlistItem | null = null;
      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "parse", text, delivery }),
        });
        if (res.ok) item = (await res.json()) as WaitlistItem;
      } catch { /* rule-based */ }

      if (!item) {
        item = {
          id: `wl_${Date.now().toString(36)}`,
          title,
          merchant: t("agent.anyMarketplace"),
          category: /earbud|phone|keyboard|laptop/i.test(title) ? "electronics" : "digital",
          targetPriceUsdc: budget,
          currentPriceUsdc: budget * 1.15,
          maxBudgetUsdc: budget,
          deadline,
          status: "watching",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          agentReason: t("agent.reasonWatching", { budget, deadline }),
          notes: text,
          mocked: true,
        };
      } else {
        item = {
          ...item,
          title: title.length >= 3 ? title : item.title,
          maxBudgetUsdc: item.maxBudgetUsdc || budget,
          deadline: item.deadline || deadline,
          targetPriceUsdc: item.maxBudgetUsdc || budget,
          agentReason: t("agent.reasonWatching", {
            budget: item.maxBudgetUsdc || budget,
            deadline: item.deadline || deadline,
          }),
        };
      }

      const only = connected.join(",");
      try {
        const data = await (
          await fetch(`/api/marketplaces?q=${encodeURIComponent(item.title)}&only=${encodeURIComponent(only)}`)
        ).json();
        const offers = ((data.offers || []) as {
          priceUsdc: number; marketplace: string; title: string; mocked?: boolean; url?: string; merchant?: string;
        }[]).slice().sort((a, b) => a.priceUsdc - b.priceUsdc);
        const budgetCap = item.maxBudgetUsdc || budget;
        const best = offers.find((o) => o.priceUsdc <= budgetCap) || offers[0];
        if (best) {
          item.currentPriceUsdc = best.priceUsdc;
          item.marketplace = metaFor(best.marketplace)?.label || best.marketplace;
          item.mocked = best.mocked;
          item.url = best.url;
          item.status =
            best.priceUsdc <= (item.maxBudgetUsdc || item.targetPriceUsdc)
              ? "awaiting_approval"
              : "watching";
          item.agentReason =
            item.status === "awaiting_approval"
              ? t("agent.reasonFound", {
                  price: best.priceUsdc.toFixed(2),
                  marketplace: item.marketplace || "",
                })
              : t("agent.reasonCheapest", {
                  price: best.priceUsdc.toFixed(2),
                  budget: item.maxBudgetUsdc ?? budget,
                });
        }
      } catch { /* keep */ }

      if (delivery) {
        const attached = attachSavedAddress(item, delivery);
        item = attached.item;
      }

      const realWallet = !demoMode && Boolean(accountId) && accountId !== "demo.local";
      if (realWallet && item.status === "awaiting_approval") {
        item = { ...item, status: "ready" };
      }
      addWaitlist(item);
      if (realWallet && (item.status === "ready" || item.status === "awaiting_approval")) {
        const chain = await requestWaitlistOnChain(item, t("escrow.requested", { title: item.title }));
        if (chain.kind === "chain" && chain.ok) {
          item = { ...item, status: "awaiting_approval" };
        }
      }
      logActivity({
        kind: "agent",
        title: t("shop.watchingTitle", { title: item.title }),
        detail: t("shop.watchingDetail", { budget: item.maxBudgetUsdc ?? "", deadline: item.deadline ?? "" }),
        status: item.status,
      });

      const shipLine = item.shipTo ? ` ${t("agent.attachedAddress", { address: item.shipTo })}` : "";
      const reply =
        item.status === "awaiting_approval"
          ? `${t("agent.needApprove")} ${t("agent.foundReply", {
              title: item.title,
              price: item.currentPriceUsdc.toFixed(2),
              marketplace: item.marketplace || t("agent.marketplace"),
            })}${shipLine}`
          : `${t("agent.created")} ${t("agent.watchingReply", {
              title: item.title,
              budget: item.maxBudgetUsdc ?? budget,
              deadline: item.deadline || deadline,
            })}${shipLine}`;

      setMsgs((m) => [...m, { role: "agent", text: reply, item }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 overflow-hidden rounded-3xl bg-cream-100 ring-1 ring-cream-300">
      <div className="flex items-center gap-2 border-b border-cream-300 px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-cream-100">
          <Bot className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">{t("agent.chatTitle")}</p>
          <p className="text-[11px] text-warm-600">{t("agent.subtitle")}</p>
        </div>
      </div>
      <div className="max-h-56 space-y-2 overflow-y-auto px-4 py-3">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
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
  );
}
