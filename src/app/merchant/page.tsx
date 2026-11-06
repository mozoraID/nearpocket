"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Check } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { buildEmvQr } from "@/lib/qris/parser";
import { Sheet } from "@/components/Sheet";
import { useT } from "@/lib/i18n";

export default function MerchantPage() {
  const t = useT();
  const [merchantName, setMerchantName] = useState("Abi's Warung");
  const [amount, setAmount] = useState("45000");
  const [copied, setCopied] = useState(false);
  const [guideOpen, setGuideOpen] = useState(true);

  const qr = useMemo(
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

  const steps = [
    { title: t("merchant.g1Title"), body: t("merchant.g1Body"), icon: "1" },
    { title: t("merchant.g2Title"), body: t("merchant.g2Body"), icon: "2" },
    { title: t("merchant.g3Title"), body: t("merchant.g3Body"), icon: "3" },
    { title: t("merchant.g4Title"), body: t("merchant.g4Body"), icon: "4" },
  ];

  return (
    <main className="space-y-5">
      <Link href="/pay" className="flex h-10 items-center gap-1 text-sm font-medium">
        <ArrowLeft className="h-4 w-4" /> {t("common.back")}
      </Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("merchant.title")}</h1>
          <p className="mt-1 text-sm text-warm-600">{t("merchant.subtitle")}</p>
        </div>
        <button
          type="button"
          className="flex h-10 items-center gap-1.5 rounded-full bg-cream-100 px-3 text-sm font-medium ring-1 ring-cream-300"
          onClick={() => setGuideOpen(true)}
        >
          <BookOpen className="h-4 w-4" /> {t("merchant.guide")}
        </button>
      </div>

      <div className="card flex flex-col items-center">
        <div className="rounded-3xl bg-white p-5">
          <QRCodeSVG value={qr} size={208} />
        </div>
        <p className="mt-4 text-lg font-semibold">{merchantName || "Your store"}</p>
        <p className="text-2xl font-bold">Rp {Number(amount || 0).toLocaleString("id-ID")}</p>
        <p className="mt-1 text-xs text-warm-500">{t("merchant.demoQr")}</p>
      </div>

      <div className="card space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm text-warm-600">{t("merchant.storeName")}</span>
          <input className="input" value={merchantName} onChange={(e) => setMerchantName(e.target.value)} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-warm-600">{t("merchant.amount")}</span>
          <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
        </label>
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => {
            navigator.clipboard?.writeText(qr);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? t("merchant.copied") : t("merchant.copy")}
        </button>
      </div>

      <Sheet open={guideOpen} onClose={() => setGuideOpen(false)} title={t("merchant.guide")}>
        <ol className="space-y-4">
          {steps.map((s) => (
            <li key={s.icon} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-cream-100">
                {s.icon}
              </span>
              <div>
                <p className="font-semibold">{s.title}</p>
                <p className="mt-1 text-sm text-warm-600">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-5 rounded-2xl bg-cream-200 p-4 text-sm text-warm-600">
          <p className="flex items-center gap-2 font-medium text-ink">
            <Check className="h-4 w-4" /> Compliance-safe
          </p>
          Crypto never pays the merchant directly. A licensed PJP converts USDC → IDR/local fiat.
        </div>
        <button type="button" className="btn-primary mt-4 w-full" onClick={() => setGuideOpen(false)}>
          {t("common.done")}
        </button>
      </Sheet>
    </main>
  );
}
