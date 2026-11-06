"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Bot, ExternalLink, Search, ShieldCheck, Star, Truck, Trash2 } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Sheet } from "@/components/Sheet";
import { StatusBadge } from "@/components/StatusBadge";
import { ReceiptView } from "@/components/ReceiptView";
import { useNearPocketStore } from "@/lib/store";
import type { MarketplaceOffer } from "@/lib/marketplaces/types";
import type { WaitlistItem } from "@/lib/agent/policy";
import { buildCardSettlement, type SettlementReceipt } from "@/lib/settlement";
import type { FxQuote } from "@/lib/fx/quote";
import { settleAndRecord } from "@/lib/client/pay";
import { approveWaitlistItem, recheckWaitlistItem, rejectWaitlistItem } from "@/lib/client/agent";
import { NEAR_CONFIG, explorerAccountUrl } from "@/lib/near/config";

const SOURCE_LABEL: Record<string, string> = {
  tokopedia: "Tokopedia",
  shopee: "Shopee",
  lazada: "Lazada",
  amazon: "DummyJSON",
  ebay: "eBay",
  "demo-mart": "Demo Mart",
};

const SUGGESTIONS = ["Wireless earbuds", "Kopi arabica", "Hoodie", "Mechanical keyboard"];

function categoryFor(q: string) {
  const l = q.toLowerCase();
  if (/kopi|coffee|snack|grocery|food/.test(l)) return "groceries";
  if (/hoodie|baju|shirt|shoe|fashion/.test(l)) return "fashion";
  if (/earbud|phone|keyboard|laptop|headphone|monitor|watch/.test(l)) return "electronics";
  return "digital";
}

interface ChainInfo {
  contractId: string;
  explorerAccount?: string;
  policy: { dailyLimitUsdc: number; spentTodayUsdc: number; perItemMaxUsdc: number } | null;
  sampleTxs?: Record<string, { hash: string; url: string }>;
}

export default function BelanjaPage() {
  const waitlist = useNearPocketStore((s) => s.waitlist);
  const addWaitlist = useNearPocketStore((s) => s.addWaitlist);
  const removeWaitlist = useNearPocketStore((s) => s.removeWaitlist);
  const logActivity = useNearPocketStore((s) => s.logActivity);
  const policy = useNearPocketStore((s) => s.policy);
  const setPolicy = useNearPocketStore((s) => s.setPolicy);
  const balanceUsdc = useNearPocketStore((s) => s.balanceUsdc);

  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [offers, setOffers] = useState<MarketplaceOffer[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [idrRate, setIdrRate] = useState<number | null>(null);
  const [chain, setChain] = useState<ChainInfo | null>(null);

  const [askFor, setAskFor] = useState<{ title: string; offer?: MarketplaceOffer } | null>(null);
  const [budget, setBudget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [buyOffer, setBuyOffer] = useState<MarketplaceOffer | null>(null);
  const [buyReceipt, setBuyReceipt] = useState<SettlementReceipt | null>(null);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetch("/api/fx?currency=IDR&amount=10000").then((r) => r.json()).then((q) => q?.rate && setIdrRate(q.rate)).catch(() => null);
    fetch("/api/contract").then((r) => r.json()).then(setChain).catch(() => null);
  }, []);

  async function search(q: string) {
    const term = q.trim();
    if (!term) return;
    setQuery(term);
    setLastQuery(term);
    setShowAll(false);
    setSearching(true);
    setMsg(null);
    try {
      const data = await (await fetch(`/api/marketplaces?q=${encodeURIComponent(term)}`)).json();
      setOffers(((data.offers || []) as MarketplaceOffer[]).filter((o) => o.inStock).slice(0, 12));
    } catch {
      setOffers([]);
    } finally {
      setSearching(false);
    }
  }

  function openAsk(title: string, offer?: MarketplaceOffer) {
    setAskFor({ title, offer });
    const ref = offer?.priceUsdc ?? (offers?.[0]?.priceUsdc || 20);
    setBudget(String(Math.max(1, Math.floor(ref * 0.95))));
    setDeadline(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  }

  function submitAsk() {
    if (!askFor) return;
    const max = parseFloat(budget);
    if (!max || max <= 0) return;
    const best = askFor.offer || offers?.[0];
    const current = best?.priceUsdc ?? max * 1.2;
    const within = current <= max;
    const item: WaitlistItem = {
      id: `wl_${Date.now().toString(36)}`,
      title: askFor.offer ? askFor.offer.title.split(" · ")[0] : askFor.title,
      merchant: best ? `${SOURCE_LABEL[best.marketplace] || best.marketplace} · ${best.merchant}` : "Any marketplace",
      category: categoryFor(askFor.title),
      targetPriceUsdc: max,
      currentPriceUsdc: current,
      maxBudgetUsdc: max,
      deadline,
      marketplace: best ? SOURCE_LABEL[best.marketplace] || best.marketplace : undefined,
      mocked: best?.mocked ?? true,
      url: best?.url,
      status: within ? "awaiting_approval" : "watching",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      agentReason: within
        ? `Found at ${current.toFixed(2)} USDC, within your ${max} USDC budget. Waiting for your OK.`
        : `Cheapest now ${current.toFixed(2)} USDC. Watching until it's ≤ ${max} USDC.`,
    };
    addWaitlist(item);
    logActivity({
      kind: "agent",
      title: `Agent watching: ${item.title}`,
      detail: `Budget ${max} USDC · until ${deadline}`,
      status: item.status,
    });
    setAskFor(null);
    setMsg(within ? "Agent found it within budget. Approve below." : "Agent is watching. It can't buy without you.");
    setTimeout(() => document.getElementById("agent")?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  async function confirmBuy() {
    if (!buyOffer) return;
    setBusy("buy");
    try {
      if (buyOffer.priceUsdc > balanceUsdc) throw new Error("Not enough USDC. Top up first.");
      const fx = (await (await fetch(`/api/fx?currency=USD&amount=${buyOffer.priceUsdc}`)).json()) as FxQuote;
      const req = buildCardSettlement({
        merchantName: `${SOURCE_LABEL[buyOffer.marketplace] || buyOffer.marketplace} · ${buyOffer.merchant}`,
        amountUsd: buyOffer.priceUsdc,
        quote: fx,
        destination: buyOffer.url,
      });
      req.mode = "merchant_checkout";
      req.note = "Buy now from NearPocket Belanja.";
      const r = await settleAndRecord(req, { kind: "purchase", title: buyOffer.title.split(" · ")[0] });
      setBuyReceipt(r);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Buy failed");
      setBuyOffer(null);
    } finally {
      setBusy(null);
    }
  }

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const items = mounted ? waitlist.filter((w) => w.status !== "cancelled") : [];
  const daily = chain?.policy?.dailyLimitUsdc ?? policy.dailyLimitUsdc;
  const perItem = chain?.policy?.perItemMaxUsdc ?? policy.perItemMaxUsdc;
  const spent = mounted ? policy.spentTodayUsdc : 0;

  return (
    <main>
      <TopBar title="Belanja" />

      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          search(query);
        }}
      >
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-warm-500" />
        <input
          className="input h-14 rounded-full pl-12 pr-24"
          placeholder="What do you want to buy?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          enterKeyHint="search"
        />
        <button
          type="submit"
          disabled={!query.trim() || searching}
          className="absolute right-1.5 top-1/2 h-11 -translate-y-1/2 rounded-full bg-ink px-5 text-sm font-semibold text-cream-100 disabled:opacity-40"
        >
          {searching ? "…" : "Search"}
        </button>
      </form>

      {!offers && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => search(s)} className="h-10 rounded-full bg-cream-100 px-4 text-sm ring-1 ring-cream-300">
              {s}
            </button>
          ))}
        </div>
      )}

      {msg && <p className="mt-4 rounded-2xl bg-cream-100 px-4 py-3 text-sm ring-1 ring-cream-300">{msg}</p>}

      {offers && (
        <section className="mt-5">
          <div className="mb-2 flex items-end justify-between">
            <div>
              <h2 className="text-base font-semibold">Results for “{lastQuery}”</h2>
              <p className="text-xs text-warm-600">Cheapest first · across {new Set(offers.map((o) => o.marketplace)).size} marketplaces</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openAsk(lastQuery)}
            className="mb-3 flex w-full items-center gap-3 rounded-3xl bg-ink p-4 text-left text-cream-100"
          >
            <Bot className="h-6 w-6 shrink-0" />
            <span className="flex-1">
              <span className="block font-semibold">Ask agent to get “{lastQuery}”</span>
              <span className="text-sm text-cream-400">Set a budget. It waits for a deal and asks you first.</span>
            </span>
          </button>
          {offers.length === 0 && <p className="card text-sm text-warm-600">No results. Try another word.</p>}
          <div className="space-y-3">
            {(showAll ? offers : offers.slice(0, 5)).map((o) => (
              <div key={o.id} className="card !p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="rounded-full bg-cream-300 px-2 py-0.5 text-[11px] font-semibold">
                        {SOURCE_LABEL[o.marketplace] || o.marketplace}
                      </span>
                      <span className={clsx("text-[11px]", o.mocked ? "text-warm-500" : "text-[#2f5a1f]")}>
                        {o.mocked ? "demo data" : "live API"}
                      </span>
                    </div>
                    <p className="line-clamp-2 font-medium">{o.title}</p>
                    <p className="mt-1 flex items-center gap-3 text-xs text-warm-600">
                      {o.rating ? (
                        <span className="flex items-center gap-0.5"><Star className="h-3 w-3" />{o.rating.toFixed(1)}</span>
                      ) : null}
                      {o.shippingDays ? (
                        <span className="flex items-center gap-0.5"><Truck className="h-3 w-3" />{o.shippingDays}d</span>
                      ) : null}
                      <span className="truncate">{o.merchant}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold">{o.priceUsdc.toFixed(2)}</p>
                    <p className="text-[11px] text-warm-600">USDC</p>
                    {idrRate && <p className="text-[11px] text-warm-500">≈ Rp {Math.round(o.priceUsdc * idrRate).toLocaleString("id-ID")}</p>}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" className="h-11 rounded-full bg-ink text-sm font-semibold text-cream-100" onClick={() => { setBuyReceipt(null); setBuyOffer(o); }}>
                    Buy now
                  </button>
                  <button type="button" className="btn-outline !min-h-11" onClick={() => openAsk(o.title.split(" · ")[0], o)}>
                    Ask agent
                  </button>
                </div>
              </div>
            ))}
          </div>
          {offers.length > 5 && !showAll && (
            <button type="button" className="btn-secondary mt-3 w-full" onClick={() => setShowAll(true)}>
              Show all {offers.length} results
            </button>
          )}
        </section>
      )}

      <section id="agent" className="mt-8 scroll-mt-4">
        <h2 className="text-base font-semibold">Your shopping agent</h2>
        <p className="mb-3 text-sm text-warm-600">Things the agent is watching. It never buys without your OK.</p>
        {items.length === 0 ? (
          <div className="card text-center text-sm text-warm-600">
            Nothing yet. Search for something and tap <b className="text-ink">Ask agent</b>.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((w) => (
              <div key={w.id} className={clsx("card !p-4", w.status === "awaiting_approval" && "ring-2 ring-ink")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{w.title}</p>
                    <p className="text-xs text-warm-600">
                      {w.marketplace || w.merchant}
                      {w.mocked ? " · demo data" : ""}
                      {w.deadline ? ` · until ${w.deadline}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={w.status} />
                </div>
                <div className="mt-3 flex items-center justify-between rounded-2xl bg-cream-200 px-3 py-2 text-sm">
                  <span>Now <b>{w.currentPriceUsdc.toFixed(2)}</b> USDC</span>
                  <span className="text-warm-600">Budget {(w.maxBudgetUsdc ?? w.targetPriceUsdc).toFixed(2)}</span>
                </div>
                {w.agentReason && <p className="mt-2 text-xs text-warm-600">{w.agentReason}</p>}
                <div className="mt-3 flex gap-2">
                  {w.status === "awaiting_approval" || w.status === "ready" ? (
                    <>
                      <button
                        type="button"
                        className="h-11 flex-1 rounded-full bg-ink text-sm font-semibold text-cream-100 disabled:opacity-40"
                        disabled={busy === w.id || policy.paused}
                        onClick={() => act(w.id, () => approveWaitlistItem(w))}
                      >
                        {busy === w.id ? "Paying…" : `Approve ${w.currentPriceUsdc.toFixed(2)}`}
                      </button>
                      <button type="button" className="btn-outline !min-h-11 flex-1" onClick={() => rejectWaitlistItem(w)}>
                        Reject
                      </button>
                    </>
                  ) : ["watching", "queued", "searching"].includes(w.status) ? (
                    <button
                      type="button"
                      className="btn-secondary !min-h-11 flex-1"
                      disabled={busy === w.id}
                      onClick={() => act(w.id, () => recheckWaitlistItem(w))}
                    >
                      {busy === w.id ? "Checking…" : "Check price now"}
                    </button>
                  ) : (
                    <span className="flex-1" />
                  )}
                  <button
                    type="button"
                    aria-label="Remove"
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-cream-200"
                    onClick={() => removeWaitlist(w.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              <h2 className="font-semibold">Spending limits</h2>
            </div>
            <button type="button" className="text-sm font-medium underline" onClick={() => setLimitsOpen(true)}>
              Edit
            </button>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-sm">
              <span className="text-warm-600">Spent today</span>
              <span className="font-medium">{spent.toFixed(2)} / {daily} USDC</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-cream-300">
              <div className="h-full rounded-full bg-ink" style={{ width: `${Math.min(100, (spent / (daily || 1)) * 100)}%` }} />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl bg-cream-200 p-3">
              <p className="text-xs text-warm-600">Max per item</p>
              <p className="font-semibold">{perItem} USDC</p>
            </div>
            <div className="rounded-2xl bg-cream-200 p-3">
              <p className="text-xs text-warm-600">Approval</p>
              <p className="font-semibold">{policy.paused ? "Agent paused" : "Every buy"}</p>
            </div>
          </div>
          <a
            href={chain?.explorerAccount || explorerAccountUrl(NEAR_CONFIG.agentPolicyContract)}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex items-center justify-between rounded-2xl bg-cream-200 px-3 py-3 text-sm"
          >
            <span>
              <span className="block text-xs text-warm-600">Enforced on NEAR {NEAR_CONFIG.networkId}{chain?.policy ? " · read live" : ""}</span>
              <span className="font-medium">{chain?.contractId || NEAR_CONFIG.agentPolicyContract}</span>
            </span>
            <ExternalLink className="h-4 w-4" />
          </a>
          {chain?.sampleTxs?.approve_spend && (
            <a className="mt-2 block text-xs text-warm-600 underline" href={chain.sampleTxs.approve_spend.url} target="_blank" rel="noreferrer">
              See a real approve_spend tx on testnet
            </a>
          )}
        </div>
      </section>

      {/* Ask agent */}
      <Sheet open={!!askFor} onClose={() => setAskFor(null)} title="Ask the agent">
        {askFor && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-cream-200 p-4">
              <p className="font-semibold">{askFor.title}</p>
              {(askFor.offer || offers?.[0]) && (
                <p className="text-sm text-warm-600">
                  Cheapest now {(askFor.offer || offers![0]).priceUsdc.toFixed(2)} USDC on{" "}
                  {SOURCE_LABEL[(askFor.offer || offers![0]).marketplace]}
                </p>
              )}
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm text-warm-600">Max budget (USDC)</span>
              <input className="input text-xl font-semibold" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-warm-600">Stop watching after</span>
              <input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
            <p className="text-xs text-warm-600">
              The agent checks Tokopedia, Shopee, Lazada, eBay and more. Limits: {perItem} USDC per item, {daily} USDC per day. You approve every buy.
            </p>
            <button type="button" className="btn-primary w-full" disabled={!(parseFloat(budget) > 0)} onClick={submitAsk}>
              Start watching
            </button>
          </div>
        )}
      </Sheet>

      {/* Buy now */}
      <Sheet open={!!buyOffer} onClose={() => setBuyOffer(null)} title={buyReceipt ? "Done" : "Buy now"}>
        {buyOffer && !buyReceipt && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-cream-200 p-4">
              <p className="font-semibold">{buyOffer.title}</p>
              <p className="text-sm text-warm-600">
                {SOURCE_LABEL[buyOffer.marketplace]} · {buyOffer.merchant}
                {buyOffer.mocked ? " · demo data" : ""}
              </p>
              <p className="mt-3 text-3xl font-bold">{buyOffer.priceUsdc.toFixed(2)} <span className="text-base text-warm-500">USDC</span></p>
            </div>
            <button type="button" className="btn-primary w-full" disabled={busy === "buy"} onClick={confirmBuy}>
              {busy === "buy" ? "Paying…" : `Pay ${buyOffer.priceUsdc.toFixed(2)} USDC`}
            </button>
          </div>
        )}
        {buyReceipt && (
          <div className="space-y-4">
            <ReceiptView receipt={buyReceipt} />
            <button type="button" className="btn-primary w-full" onClick={() => setBuyOffer(null)}>
              Done
            </button>
          </div>
        )}
      </Sheet>

      {/* Limits */}
      <Sheet open={limitsOpen} onClose={() => setLimitsOpen(false)} title="Spending limits">
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm text-warm-600">Daily limit (USDC)</span>
            <input className="input" type="number" value={policy.dailyLimitUsdc} onChange={(e) => setPolicy({ dailyLimitUsdc: Number(e.target.value) })} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-warm-600">Max per item (USDC)</span>
            <input className="input" type="number" value={policy.perItemMaxUsdc} onChange={(e) => setPolicy({ perItemMaxUsdc: Number(e.target.value) })} />
          </label>
          <label className="flex items-center justify-between rounded-2xl bg-cream-200 px-4 py-3">
            <span className="font-medium">Pause agent</span>
            <input type="checkbox" className="h-5 w-5 accent-[#111]" checked={policy.paused} onChange={(e) => setPolicy({ paused: e.target.checked })} />
          </label>
          <p className="text-xs text-warm-600">
            Changes here apply to this demo. The same limits live in the NEAR contract{" "}
            <a className="underline" href={explorerAccountUrl(NEAR_CONFIG.agentPolicyContract)} target="_blank" rel="noreferrer">
              {NEAR_CONFIG.agentPolicyContract}
            </a>{" "}
            (owner calls set_policy; see README).
          </p>
          <button type="button" className="btn-primary w-full" onClick={() => setLimitsOpen(false)}>
            Save
          </button>
        </div>
      </Sheet>
    </main>
  );
}
