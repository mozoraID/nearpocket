"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n, useT } from "@/lib/i18n";
import { useNearPocketStore } from "@/lib/store";
import { NEAR_CONFIG, explorerAccountUrl } from "@/lib/near/config";
import { formatRateLine, type FxQuote } from "@/lib/fx/quote";
import { BRAND } from "@/config/brand";

export default function SettingsPage() {
  const t = useT();
  const { locale, locales } = useI18n();
  const accountId = useNearPocketStore((s) => s.accountId);
  const demoMode = useNearPocketStore((s) => s.demoMode);
  const authMethod = useNearPocketStore((s) => s.authMethod);
  const [fx, setFx] = useState<FxQuote | null>(null);

  useEffect(() => {
    fetch("/api/fx?currency=IDR&amount=1")
      .then((r) => r.json())
      .then(setFx)
      .catch(() => null);
  }, []);

  const loc = locales.find((l) => l.id === locale);

  return (
    <main className="space-y-5">
      <TopBar title={t("settings.title")} />
      <Link href="/" className="flex h-10 items-center gap-1 text-sm font-medium">
        <ArrowLeft className="h-4 w-4" /> {t("common.back")}
      </Link>

      <section className="card space-y-3">
        <h2 className="font-semibold">{t("settings.language")}</h2>
        <div className="flex items-center justify-between">
          <span className="text-sm text-warm-600">
            {loc?.flag} {loc?.native}
          </span>
          <LanguageSwitcher />
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">{t("settings.account")}</h2>
        <p className="break-all text-sm">
          {accountId || "—"}
          <span className="ml-2 text-xs text-warm-500">
            {demoMode ? "demo" : authMethod} · {NEAR_CONFIG.networkId}
          </span>
        </p>
        {accountId && !demoMode && (
          <a className="text-sm underline" href={explorerAccountUrl(accountId)} target="_blank" rel="noreferrer">
            Explorer
          </a>
        )}
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">{t("settings.fx")}</h2>
        {fx ? (
          <>
            <p className="text-lg font-semibold">
              1 USDC = {fx.rate.toLocaleString("en-US", { maximumFractionDigits: 2 })} IDR
            </p>
            <p className="text-xs text-warm-600">{formatRateLine(fx)}</p>
          </>
        ) : (
          <p className="text-sm text-warm-600">{t("common.loading")}</p>
        )}
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">{t("settings.about")}</h2>
        <p className="text-sm text-warm-600">{BRAND.description}</p>
        <p className="text-xs text-warm-500">
          Contract {NEAR_CONFIG.agentPolicyContract} · {BRAND.displayName}
        </p>
      </section>
    </main>
  );
}
