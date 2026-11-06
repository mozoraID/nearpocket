"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  Bot,
  ExternalLink,
  Search,
  ShieldCheck,
  Star,
  Truck,
  Trash2,
  Link2,
  Eye,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Sheet } from "@/components/Sheet";
import { StatusBadge } from "@/components/StatusBadge";
import { ReceiptView } from "@/components/ReceiptView";
import { MarketplaceMark } from "@/components/MarketplaceMark";
import { useNearPocketStore } from "@/lib/store";
import type { MarketplaceOffer } from "@/lib/marketplaces/types";
import {
  MARKETPLACE_CATALOG,
  COUNTRY_GROUPS,
  metaFor,
} from "@/lib/marketplaces";
import type { WaitlistItem } from "@/lib/agent/policy";
import { buildCardSettlement, type SettlementReceipt } from "@/lib/settlement";
import type { FxQuote } from "@/lib/fx/quote";
import { settleAndRecord } from "@/lib/client/pay";
import { approveWaitlistItem, recheckWaitlistItem, rejectWaitlistItem } from "@/lib/client/agent";
import { NEAR_CONFIG, explorerAccountUrl } from "@/lib/near/config";
import { trySetPolicyOnChain } from "@/lib/near/set-policy";
import { useT } from "@/lib/i18n";
import { AgentChatInline } from "@/components/agent/AgentChatInline";
import { formatRateLine } from "@/lib/fx/quote";

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
  const t = useT();
  const waitlist = useNearPocketStore((s) => s.waitlist);
  const addWaitlist = useNearPocketStore((s) => s.addWaitlist);
  const removeWaitlist = useNearPocketStore((s) => s.removeWaitlist);
  const logActivity = useNearPocketStore((s) => s.logActivity);
  const policy = useNearPocketStore((s) => s.policy);
  const setPolicy = useNearPocketStore((s) => s.setPolicy);
  const balanceUsdc = useNearPocketStore((s) => s.balanceUsdc);
  const connected = useNearPocketStore((s) => s.connectedMarketplaces);
  const toggleMarketplace = useNearPocketStore((s) => s.toggleMarketplace);
  const demoMode = useNearPocketStore((s) => s.demoMode);
  const accountId = useNearPocketStore((s) => s.accountId);

  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [offers, setOffers] = useState<MarketplaceOffer[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [idrQuote, setIdrQuote] = useState<FxQuote | null>(null);
  const [chain, setChain] = useState<ChainInfo | null>(null);

  const [askFor, setAskFor] = useState<{ title: string; offer?: MarketplaceOffer } | null>(null);
  const [budget, setBudget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [buyOffer, setBuyOffer] = useState<MarketplaceOffer | null>(null);
  const [buyReceipt, setBuyReceipt] = useState<SettlementReceipt | null>(null);
  const [overview, setOverview] = useState<MarketplaceOffer | null>(null);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [countryFilter, setCountryFilter] = useState("ID");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [policyMsg, setPolicyMsg] = useState<string | null>(null);

  const idrRate = idrQuote?.rate ?? null;

  useEffect(() => {
    setMounted(true);
    fetch("/api/fx?currency=IDR&amount=10000")
      .then((r) => r.json())
      .then((q) => q?.rate && setIdrQuote(q))
      .catch(() => null);
    fetch("/api/contract").then((r) => r.json()).then(setChain).catch(() => null);
  }, []);

  async function search(q: string) {
    const term = q.trim();
    if (!term) return;
    if (!connected.length) {
      setMsg("Connect at least one marketplace first.");
      setConnectOpen(true);
      return;
    }
    setQuery(term);
    setLastQuery(term);
    setShowAll(false);
    setSearching(true);
    setMsg(null);
    try {
      const only = connected.join(",");
      const data = await (
        await fetch(`/api/marketplaces?q=${encodeURIComponent(term)}&only=${encodeURIComponent(only)}`)
      ).json();
      setOffers(((data.offers || []) as MarketplaceOffer[]).filter((o) => o.inStock).slice(0, 16));
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
    const mLabel = best ? metaFor(best.marketplace)?.label || best.marketplace : undefined;
    const item: WaitlistItem = {
      id: `wl_${Date.now().toString(36)}`,
      title: askFor.offer ? askFor.offer.title.split(" · ")[0] : askFor.title,
      merchant: best ? `${mLabel} · ${best.merchant}` : "Any marketplace",
      category: categoryFor(askFor.title),
      targetPriceUsdc: max,
      currentPriceUsdc: current,
      maxBudgetUsdc: max,
      deadline,
      marketplace: mLabel,
      mocked: best?.mocked ?? true,
      url: best?.productUrl || best?.url,
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
      const mLabel = metaFor(buyOffer.marketplace)?.label || buyOffer.marketplace;
      const req = buildCardSettlement({
        merchantName: `${mLabel} · ${buyOffer.merchant}`,
        amountUsd: buyOffer.priceUsdc,
        quote: fx,
        destination: buyOffer.productUrl || buyOffer.url,
      });
      req.mode = "merchant_checkout";
      req.note = "Buy now from NearPocket Belanja.";
      const r = await settleAndRecord(req, {
        kind: "purchase",
        title: buyOffer.title.split(" · ")[0],
        countTowardAgentPolicy: true,
      });
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

  async function savePolicy() {
    setPolicyMsg(null);
    const result = await trySetPolicyOnChain(policy, { demoMode, accountId });
    setPolicyMsg(
      result.mode === "on-chain"
        ? "Saved on-chain via your wallet."
        : result.detail || "Saved locally (demo).",
    );
    setLimitsOpen(false);
  }

  const items = mounted ? waitlist.filter((w) => w.status !== "cancelled") : [];
  const daily = chain?.policy?.dailyLimitUsdc ?? policy.dailyLimitUsdc;
  const perItem = chain?.policy?.perItemMaxUsdc ?? policy.perItemMaxUsdc;
  const spent = mounted ? policy.spentTodayUsdc : 0;
  const filteredCatalog = MARKETPLACE_CATALOG.filter(
    (m) => m.countries.includes(countryFilter) || (countryFilter === "WW" && m.countries.includes("WW")),
  );

  return (
    <main>
      <TopBar title={t("nav.shop")} />

      <button
        type="button"
        onClick={() => setConnectOpen(true)}
        className="mb-3 flex w-full items-center gap-3 rounded-3xl bg-cream-100 p-4 text-left ring-1 ring-cream-300"
      >
        <Link2 className="h-5 w-5 shrink-0" />
        <span className="flex-1">
          <span className="block font-semibold">{t("shop.connectTitle")}</span>
          <span className="text-xs text-warm-600">
            {connected.length} connected · {t("shop.connectHint").slice(0, 48)}…
          </span>
        </span>
        <div className="flex -space-x-1">
          {connected.slice(0, 4).map((id) => (
            <MarketplaceMark key={id} id={id} />
          ))}
        </div>
      </button>

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
          placeholder={t("shop.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          enterKeyHint="search"
        />
        <button
          type="submit"
          disabled={!query.trim() || searching}
          className="absolute right-1.5 top-1/2 h-11 -translate-y-1/2 rounded-full bg-ink px-5 text-sm font-semibold text-cream-100 disabled:opacity-40"
        >
          {searching ? "…" : t("common.search")}
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
      {policyMsg && <p className="mt-2 text-xs text-warm-600">{policyMsg}</p>}
      {idrQuote && (
        <p className="mt-2 text-[11px] text-warm-500">{formatRateLine(idrQuote)}</p>
      )}

      {offers && (
        <section className="mt-5">
          <div className="mb-2">
            <h2 className="text-base font-semibold">{t("shop.results", { q: lastQuery })}</h2>
            <p className="text-xs text-warm-600">{t("shop.cheapestFirst")}</p>
          </div>
          <button
            type="button"
            onClick={() => openAsk(lastQuery)}
            className="mb-3 flex w-full items-center gap-3 rounded-3xl bg-ink p-4 text-left text-cream-100"
          >
            <Bot className="h-6 w-6 shrink-0" />
            <span className="flex-1">
              <span className="block font-semibold">{t("shop.askAgent", { q: lastQuery })}</span>
              <span className="text-sm text-cream-400">{t("shop.askAgentHint")}</span>
            </span>
          </button>
          {offers.length === 0 && <p className="card text-sm text-warm-600">{t("shop.noResults")}</p>}
          <div className="space-y-3">
            {(showAll ? offers : offers.slice(0, 5)).map((o) => {
              const m = metaFor(o.marketplace);
              const openUrl = o.productUrl || o.url;
              return (
                <div key={o.id} className="card !p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-1.5">
                        <MarketplaceMark id={o.marketplace} />
                        <span className="text-[11px] font-semibold">{m?.label || o.marketplace}</span>
                        <span className={clsx("text-[11px]", o.mocked ? "text-warm-500" : "text-[#2f5a1f]")}>
                          {o.mocked ? t("common.demo") : t("common.live")}
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
                      {t("shop.buyNow")}
                    </button>
                    <button type="button" className="btn-outline !min-h-11" onClick={() => openAsk(o.title.split(" · ")[0], o)}>
                      {t("shop.askAgentBtn")}
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" className="btn-secondary !min-h-10 text-xs" onClick={() => setOverview(o)}>
                      <Eye className="h-3.5 w-3.5" /> {t("shop.overview")}
                    </button>
                    <a
                      href={openUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary !min-h-10 text-xs"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> {t("shop.openIn", { name: m?.label || o.marketplace })}
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
          {offers.length > 5 && !showAll && (
            <button type="button" className="btn-secondary mt-3 w-full" onClick={() => setShowAll(true)}>
              Show all {offers.length} results
            </button>
          )}
        </section>
      )}

      <section id="agent" className="mt-8 scroll-mt-4">
        <h2 className="text-base font-semibold">{t("shop.yourAgent")}</h2>
        <p className="mb-3 text-sm text-warm-600">{t("shop.yourAgentHint")}</p>
        <AgentChatInline />
        {items.length === 0 ? (
          <div className="card text-center text-sm text-warm-600">{t("shop.nothingYet")}</div>
        ) : (
          <div className="space-y-3">
            {items.map((w) => (
              <div key={w.id} className={clsx("card !p-4", w.status === "awaiting_approval" && "ring-2 ring-ink")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{w.title}</p>
                    <p className="text-xs text-warm-600">
                      {w.marketplace || w.merchant}
                      {w.mocked ? " · demo" : ""}
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
                        {busy === w.id ? t("home.paying") : `${t("home.approve")} ${w.currentPriceUsdc.toFixed(2)}`}
                      </button>
                      <button type="button" className="btn-outline !min-h-11 flex-1" onClick={() => rejectWaitlistItem(w)}>
                        {t("home.reject")}
                      </button>
                    </>
                  ) : ["watching", "queued", "searching"].includes(w.status) ? (
                    <button
                      type="button"
                      className="btn-secondary !min-h-11 flex-1"
                      disabled={busy === w.id}
                      onClick={() => act(w.id, () => recheckWaitlistItem(w))}
                    >
                      {busy === w.id ? "…" : "Check price now"}
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
              <h2 className="font-semibold">{t("shop.spendingLimits")}</h2>
            </div>
            <button type="button" className="text-sm font-medium underline" onClick={() => setLimitsOpen(true)}>
              {t("shop.edit")}
            </button>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-sm">
              <span className="text-warm-600">{t("shop.agentSpent")}</span>
              <span className="font-medium">{spent.toFixed(2)} / {daily} USDC</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-cream-300">
              <div className="h-full rounded-full bg-ink" style={{ width: `${Math.min(100, (spent / (daily || 1)) * 100)}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-warm-500">{t("shop.agentSpentNote")}</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl bg-cream-200 p-3">
              <p className="text-xs text-warm-600">{t("shop.maxPerItem")}</p>
              <p className="font-semibold">{perItem} USDC</p>
            </div>
            <div className="rounded-2xl bg-cream-200 p-3">
              <p className="text-xs text-warm-600">{t("shop.approval")}</p>
              <p className="font-semibold">{policy.paused ? t("shop.agentPaused") : t("shop.everyBuy")}</p>
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
        </div>
      </section>

      <Sheet open={!!askFor} onClose={() => setAskFor(null)} title={t("shop.askAgentBtn")}>
        {askFor && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-cream-200 p-4">
              <p className="font-semibold">{askFor.title}</p>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm text-warm-600">{t("shop.maxBudget")}</span>
              <input className="input text-xl font-semibold" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-warm-600">{t("shop.stopAfter")}</span>
              <input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
            <button type="button" className="btn-primary w-full" disabled={!(parseFloat(budget) > 0)} onClick={submitAsk}>
              {t("shop.startWatching")}
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!buyOffer} onClose={() => setBuyOffer(null)} title={buyReceipt ? t("common.done") : t("shop.buyNow")}>
        {buyOffer && !buyReceipt && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-cream-200 p-4">
              <p className="font-semibold">{buyOffer.title}</p>
              <p className="mt-3 text-3xl font-bold">{buyOffer.priceUsdc.toFixed(2)} <span className="text-base text-warm-500">USDC</span></p>
            </div>
            <button type="button" className="btn-primary w-full" disabled={busy === "buy"} onClick={confirmBuy}>
              {busy === "buy" ? t("home.paying") : `Pay ${buyOffer.priceUsdc.toFixed(2)} USDC`}
            </button>
          </div>
        )}
        {buyReceipt && (
          <div className="space-y-4">
            <ReceiptView receipt={buyReceipt} />
            <button type="button" className="btn-primary w-full" onClick={() => setBuyOffer(null)}>
              {t("common.done")}
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!overview} onClose={() => setOverview(null)} title={t("shop.overview")}>
        {overview && (
          <div className="space-y-4">
            {overview.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={overview.imageUrl} alt="" className="h-40 w-full rounded-2xl object-cover" />
            )}
            <div className="flex items-center gap-2">
              <MarketplaceMark id={overview.marketplace} size="md" />
              <span className="font-semibold">{metaFor(overview.marketplace)?.label}</span>
            </div>
            <p className="text-lg font-semibold">{overview.title}</p>
            <p className="text-2xl font-bold">{overview.priceUsdc.toFixed(2)} USDC</p>
            {overview.rating && <p className="text-sm text-warm-600">★ {overview.rating.toFixed(1)} · {overview.merchant}</p>}
            <p className="text-sm text-warm-600">{overview.description || "Demo / partner listing overview."}</p>
            <a
              href={overview.productUrl || overview.url}
              target="_blank"
              rel="noreferrer"
              className="btn-primary w-full"
            >
              {t("shop.openIn", { name: metaFor(overview.marketplace)?.label || overview.marketplace })}
            </a>
          </div>
        )}
      </Sheet>

      <Sheet open={limitsOpen} onClose={() => setLimitsOpen(false)} title={t("shop.spendingLimits")}>
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm text-warm-600">{t("shop.dailyLimit")}</span>
            <input className="input" type="number" value={policy.dailyLimitUsdc} onChange={(e) => setPolicy({ dailyLimitUsdc: Number(e.target.value) })} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-warm-600">{t("shop.maxPerItem")} (USDC)</span>
            <input className="input" type="number" value={policy.perItemMaxUsdc} onChange={(e) => setPolicy({ perItemMaxUsdc: Number(e.target.value) })} />
          </label>
          <label className="flex items-center justify-between rounded-2xl bg-cream-200 px-4 py-3">
            <span className="font-medium">{t("shop.pauseAgent")}</span>
            <input type="checkbox" className="h-5 w-5 accent-[#111]" checked={policy.paused} onChange={(e) => setPolicy({ paused: e.target.checked })} />
          </label>
          <p className="text-xs text-warm-600">
            With a real wallet connected, Save signs <code>set_policy</code> on {NEAR_CONFIG.agentPolicyContract}. Demo mode stays local.
          </p>
          <button type="button" className="btn-primary w-full" onClick={savePolicy}>
            {t("common.save")}
          </button>
        </div>
      </Sheet>

      <Sheet open={connectOpen} onClose={() => setConnectOpen(false)} title={t("shop.connectTitle")}>
        <p className="mb-3 text-xs text-warm-600">{t("shop.connectHint")}</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {COUNTRY_GROUPS.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setCountryFilter(c.code)}
              className={clsx(
                "h-9 rounded-full px-3 text-sm",
                countryFilter === c.code ? "bg-ink text-cream-100" : "bg-cream-200",
              )}
            >
              {c.flag} {c.label}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {filteredCatalog.map((m) => {
            const on = connected.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleMarketplace(m.id)}
                className={clsx(
                  "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left",
                  on ? "bg-ink text-cream-100" : "bg-cream-200",
                )}
              >
                <MarketplaceMark id={m.id} size="md" />
                <span className="flex-1">
                  <span className="block font-semibold">{m.label}</span>
                  <span className={clsx("text-xs", on ? "text-cream-400" : "text-warm-600")}>{m.region} · demo connect</span>
                </span>
                <span className="text-xs font-semibold">{on ? t("shop.connected") : t("shop.connect")}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="btn-primary mt-4 w-full" onClick={() => setConnectOpen(false)}>
          {t("common.done")}
        </button>
      </Sheet>
    </main>
  );
}
