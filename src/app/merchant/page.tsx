"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { buildEmvQr } from "@/lib/qris/parser";

export default function MerchantPage() {
  const [merchantName, setMerchantName] = useState("Abi's Warung");
  const [amount, setAmount] = useState("45000");
  const [copied, setCopied] = useState(false);

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

  return (
    <main className="space-y-5">
      <Link href="/pay" className="flex h-10 items-center gap-1 text-sm font-medium">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Receive payment</h1>
        <p className="mt-1 text-sm text-warm-600">Show this QR. Customers pay with NearPocket, you get rupiah.</p>
      </div>
      <div className="card flex flex-col items-center">
        <div className="rounded-3xl bg-white p-5">
          <QRCodeSVG value={qr} size={208} />
        </div>
        <p className="mt-4 text-lg font-semibold">{merchantName || "Your store"}</p>
        <p className="text-2xl font-bold">Rp {Number(amount || 0).toLocaleString("id-ID")}</p>
        <p className="mt-1 text-xs text-warm-500">Demo QRIS (not a real merchant account)</p>
      </div>
      <div className="card space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm text-warm-600">Store name</span>
          <input className="input" value={merchantName} onChange={(e) => setMerchantName(e.target.value)} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-warm-600">Amount (IDR, leave empty for open amount)</span>
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
          {copied ? "Copied" : "Copy QR code text"}
        </button>
      </div>
    </main>
  );
}
