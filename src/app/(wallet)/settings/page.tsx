"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { DeliveryAddressForm } from "@/components/DeliveryAddressForm";
import { formatShipTo, type DeliveryAddress } from "@/lib/address";
import { TopBar } from "@/components/TopBar";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SignOutButton } from "@/components/SignOutButton";
import { useI18n, useT } from "@/lib/i18n";
import { useNearPocketStore } from "@/lib/store";
import { NEAR_CONFIG, explorerAccountUrl } from "@/lib/near/config";
import { sourceLabel, type FxTableRow } from "@/lib/fx/quote";
import {
  DISPLAY_CURRENCIES,
  type DisplayCurrencyCode,
  getDisplayCurrency,
} from "@/lib/region/display-currency";
import { authMethodLabel } from "@/lib/account-label";
import { BRAND } from "@/config/brand";

export default function SettingsPage() {
  const t = useT();
  const { locale, locales } = useI18n();
  const accountId = useNearPocketStore((s) => s.accountId);
  const demoMode = useNearPocketStore((s) => s.demoMode);
  const authMethod = useNearPocketStore((s) => s.authMethod);
  const displayCurrency = useNearPocketStore((s) => s.displayCurrency);
  const setDisplayCurrency = useNearPocketStore((s) => s.setDisplayCurrency);
  const addresses = useNearPocketStore((s) => s.addresses);
  const removeAddress = useNearPocketStore((s) => s.removeAddress);
  const setDefaultAddress = useNearPocketStore((s) => s.setDefaultAddress);
  const [editing, setEditing] = useState<DeliveryAddress | "new" | null>(null);
  const [rows, setRows] = useState<FxTableRow[] | null>(null);
  const [fxError, setFxError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/fx?table=1")
      .then((r) => r.json())
      .then((d) => {
        if (d?.rows) setRows(d.rows);
        else setFxError("Could not load rates");
      })
      .catch(() => setFxError("Could not load rates"));
  }, []);

  const loc = locales.find((l) => l.id === locale);
  const method = authMethodLabel(authMethod, demoMode);
  const selected = getDisplayCurrency(displayCurrency);

  function choose(code: DisplayCurrencyCode) {
    setDisplayCurrency(code);
    try {
      localStorage.setItem("nearpocket-currency-chosen", "1");
    } catch { /* */ }
  }

  return (
    <main className="space-y-5">
      <TopBar title={t("settings.title")} />
      <Link href="/home" className="flex h-10 items-center gap-1 text-sm font-medium">
        <ArrowLeft className="h-4 w-4" /> {t("common.back")}
      </Link>

      <section className="card space-y-3">
        <h2 className="font-semibold">{t("settings.language")}</h2>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-warm-600">
            {loc?.flag} {loc?.native}
          </span>
          <LanguageSwitcher />
        </div>
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="font-semibold">{t("address.title")}</h2>
          <p className="mt-1 text-sm text-warm-600">{t("address.hint")}</p>
        </div>
        {addresses.length === 0 && !editing && (
          <p className="text-sm text-warm-600">{t("address.empty")}</p>
        )}
        <div className="space-y-2">
          {addresses.map((a) => (
            <div key={a.id} className="rounded-2xl bg-cream-200 px-3 py-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{formatShipTo(a)}</p>
                {a.isDefault ? (
                  <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold uppercase text-cream-100">
                    {t("address.defaultBadge")}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="text-xs font-semibold underline" onClick={() => setEditing(a)}>
                  {t("address.edit")}
                </button>
                {!a.isDefault && (
                  <button type="button" className="text-xs font-semibold underline" onClick={() => setDefaultAddress(a.id)}>
                    {t("address.setDefault")}
                  </button>
                )}
                <button type="button" className="text-xs font-semibold underline" onClick={() => removeAddress(a.id)}>
                  {t("address.remove")}
                </button>
              </div>
            </div>
          ))}
        </div>
        {editing ? (
          <DeliveryAddressForm
            initial={editing === "new" ? null : editing}
            forceDefault={addresses.length === 0 || (editing !== "new" && editing.isDefault && addresses.length === 1)}
            onSaved={() => setEditing(null)}
          />
        ) : (
          <button type="button" className="btn-secondary w-full" onClick={() => setEditing("new")}>
            {t("address.add")}
          </button>
        )}
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="font-semibold">{t("settings.homeCurrency")}</h2>
          <p className="mt-1 text-sm text-warm-600">{t("settings.homeCurrencyHint")}</p>
        </div>
        <div className="space-y-2">
          {DISPLAY_CURRENCIES.map((c) => {
            const active = c.code === selected.code;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => choose(c.code)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left ring-1 transition ${
                  active ? "bg-ink text-cream-100 ring-ink" : "bg-cream-50 ring-cream-300"
                }`}
              >
                <span className="text-xl" aria-hidden>
                  {c.flag}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {c.country}
                    {c.demo ? (
                      <span className={`ml-2 text-[10px] font-bold uppercase tracking-wide ${active ? "text-cream-400" : "text-warm-500"}`}>
                        demo
                      </span>
                    ) : null}
                  </span>
                  <span className={`block text-xs ${active ? "text-cream-400" : "text-warm-500"}`}>
                    {c.code} · {c.rail}
                  </span>
                </span>
                {active ? <Check className="h-4 w-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="font-semibold">{t("settings.fx")}</h2>
          <p className="mt-1 text-sm text-warm-600">{t("settings.fxTableHint")}</p>
        </div>
        {fxError && <p className="text-sm text-[#8a2d1c]">{fxError}</p>}
        {!rows && !fxError && <p className="text-sm text-warm-600">{t("common.loading")}</p>}
        {rows && (
          <div className="overflow-hidden rounded-2xl ring-1 ring-cream-300">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cream-200 text-left text-xs text-warm-600">
                  <th className="px-3 py-2 font-medium">1 USDC</th>
                  <th className="px-3 py-2 font-medium">Rate</th>
                  <th className="px-3 py-2 font-medium">{t("settings.fxSource")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const meta = getDisplayCurrency(r.currency);
                  const hi = r.currency === selected.code;
                  return (
                    <tr
                      key={r.currency}
                      className={hi ? "bg-ink/5 font-semibold" : "border-t border-cream-300"}
                    >
                      <td className="px-3 py-2.5">
                        <span className="mr-1.5">{meta.flag}</span>
                        {r.currency}
                        {hi ? <span className="ml-1 text-[10px] uppercase text-warm-500">you</span> : null}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {r.rate.toLocaleString("en-US", {
                          maximumFractionDigits: meta.zeroDecimal ? 0 : 4,
                        })}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-warm-500">{sourceLabel(r.source)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows[0] && (
              <p className="border-t border-cream-300 px-3 py-2 text-[11px] text-warm-500">
                {t("settings.fxAsOf", {
                  time: new Date(rows[0].asOf).toLocaleString("en-GB", {
                    timeZone: "Asia/Jakarta",
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">{t("settings.account")}</h2>
        <p className="break-all text-sm font-medium">{accountId || "—"}</p>
        <p className="text-xs text-warm-500">
          {method} · {NEAR_CONFIG.networkId} · {selected.code}
        </p>
        {accountId && !demoMode && (
          <a className="text-sm underline" href={explorerAccountUrl(accountId)} target="_blank" rel="noreferrer">
            {t("auth.viewExplorer")}
          </a>
        )}
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">{t("settings.about")}</h2>
        <p className="text-sm text-warm-600">{BRAND.description}</p>
        <p className="text-xs text-warm-500">
          Contract {NEAR_CONFIG.agentPolicyContract} · {BRAND.displayName}
        </p>
      </section>

      <section className="pt-2">
        <SignOutButton />
      </section>
    </main>
  );
}
