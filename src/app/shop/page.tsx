"use client";

import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { DemoBanner } from "@/components/DemoBanner";
import { StatusBadge } from "@/components/StatusBadge";
import { buildEmvQr } from "@/lib/qris/parser";
import { formatUsdc, type FxQuote } from "@/lib/fx/quote";
import { buildQrisSettlement, type SettlementReceipt } from "@/lib/settlement";
import { parseEmvQr } from "@/lib/qris/parser";
import { useNearlyStore } from "@/lib/store";
import Link from "next/link";

const CATALOG = [
  { id: "1", name: "Bali cold brew", priceIdr: 28000, category: "food" },
  { id: "2", name: "Batik tote bag", priceIdr: 150000, category: "fashion" },
  { id: "3", name: "USB-C hub", priceIdr: 320000, category: "electronics" },
  { id: "4", name: "Steam wallet 10", priceIdr: 165000, category: "digital" },
];

export default function ShopPage() {
  const [mode, setMode] = useState<"buy" | "merchant">("buy");
  const [merchantName, setMerchantName] = useState("Abi's Warung");
  const [amount, setAmount] = useState("45000");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<SettlementReceipt | null>(null);

  const recordReceipt = useNearlyStore((s) => s.recordReceipt);
  const debitUsdc = useNearlyStore((s) => s.debitUsdc);
  const balanceUsdc = useNearlyStore((s) => s.balanceUsdc);
  const receipts = useNearlyStore((s) => s.receipts);

  const merchantQr = useMemo(
    () =>
      buildEmvQr({
        merchantName,
        merchantCity: "Jakarta",
        countryCode: "ID",
        currencyNumeric: "360",
        amount: amount || undefined,
        guid: "ID.CO.QRIS.WWW",
        merchantAccount: "93600915NEARPOCKET01",
        mcc: "5411",
      }),
    [merchantName, amount],
  );

  async function buyItem(priceIdr: number, name: string) {
    setBusy(true);
    setReceipt(null);
    try {
      const fxRes = await fetch(`/api/fx?currency=IDR&amount=${priceIdr}`);
      const quote = (await fxRes.json()) as FxQuote;
      if (quote.totalUsdc > balanceUsdc) throw new Error("Insufficient USDC");
      const payload = buildEmvQr({
        merchantName: name,
        merchantCity: "Jakarta",
        countryCode: "ID",
        currencyNumeric: "360",
        amount: String(priceIdr),
        guid: "ID.CO.QRIS.WWW",
        merchantAccount: "93600915SHOP0001",
      });
      const parsed = parseEmvQr(payload);
      const req = buildQrisSettlement(parsed, quote);
      req.mode = "merchant_checkout";
      const res = await fetch("/api/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      const data = (await res.json()) as SettlementReceipt;
      debitUsdc(quote.totalUsdc);
      recordReceipt(data);
      setReceipt(data);
    } catch (e) {
      alert(e instanceof Error ? e.message : "buy failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Shop</h1>
        <p className="text-sm text-slate-400">Buyer checkout + merchant QR</p>
      </header>
      <DemoBanner />

      <div className="flex gap-2 rounded-2xl bg-black/30 p-1">
        {(["buy", "merchant"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setMode(t)}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold capitalize ${
              mode === t ? "bg-white/10 text-cyan-200" : "text-slate-400"
            }`}
          >
            {t === "buy" ? "Buy" : "Merchant"}
          </button>
        ))}
      </div>

      {mode === "buy" ? (
        <section className="space-y-3">
          {CATALOG.map((item) => (
            <div key={item.id} className="card flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{item.name}</p>
                <p className="text-xs text-slate-400">
                  Rp {item.priceIdr.toLocaleString("id-ID")} · {item.category}
                </p>
              </div>
              <button
                type="button"
                className="btn-primary !px-3 !py-2 !text-xs"
                disabled={busy}
                onClick={() => buyItem(item.priceIdr, item.name)}
              >
                Buy
              </button>
            </div>
          ))}
          <Link href="/agent" className="btn-ghost w-full">
            Or let the agent waitlist a deal →
          </Link>
        </section>
      ) : (
        <section className="space-y-3">
          <div className="card space-y-3">
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">Store name</span>
              <input className="input" value={merchantName} onChange={(e) => setMerchantName(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">Amount (IDR)</span>
              <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <div className="flex justify-center rounded-2xl bg-white p-4">
              <QRCodeSVG value={merchantQr} size={180} />
            </div>
            <p className="text-center text-xs text-slate-400">
              Customers scan with NearPocket Pay → USDC → PJP → QRIS credit to you
            </p>
            <p className="break-all font-mono text-[9px] text-slate-600">{merchantQr}</p>
          </div>

          <div className="card space-y-2">
            <h2 className="text-sm font-semibold">Merchant inbox (demo)</h2>
            {receipts.filter((r) => r.request.mode !== "card").length === 0 ? (
              <p className="text-xs text-slate-400">No inbound payments yet.</p>
            ) : (
              receipts
                .filter((r) => r.request.mode !== "card")
                .slice(0, 5)
                .map((r) => (
                  <div key={r.merchantReceiptId} className="flex items-center justify-between text-sm">
                    <div>
                      <p>{r.request.merchantName}</p>
                      <p className="text-xs text-slate-400">
                        {r.request.localAmount} {r.request.localCurrency}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))
            )}
          </div>
        </section>
      )}

      {receipt && (
        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Checkout receipt</h2>
            <StatusBadge status={receipt.status} />
          </div>
          <p className="text-sm">{formatUsdc(receipt.request.quote.totalUsdc)}</p>
          <p className="text-xs text-slate-400">{receipt.complianceNote}</p>
        </div>
      )}
    </main>
  );
}
