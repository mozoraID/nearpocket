"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Sheet } from "./Sheet";

export function LanguageSwitcher({ compact }: { compact?: boolean }) {
  const { locale, setLocale, locales, t } = useI18n();
  const [open, setOpen] = useState(false);
  const current = locales.find((l) => l.id === locale);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("lang.title")}
        className={
          compact
            ? "flex h-10 w-10 items-center justify-center rounded-full bg-cream-100 ring-1 ring-cream-300"
            : "flex h-10 items-center gap-1.5 rounded-full bg-cream-100 px-3 text-sm font-medium ring-1 ring-cream-300"
        }
      >
        <Globe className="h-4 w-4" />
        {!compact && <span>{current?.flag} {current?.id.toUpperCase()}</span>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("lang.title")}>
        <p className="mb-3 text-xs text-warm-600">{t("lang.auto")}</p>
        <div className="space-y-2">
          {locales.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => {
                setLocale(l.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left ${
                locale === l.id ? "bg-ink text-cream-100" : "bg-cream-200"
              }`}
            >
              <span className="text-xl">{l.flag}</span>
              <span className="flex-1">
                <span className="block font-semibold">{l.native}</span>
                <span className={`text-xs ${locale === l.id ? "text-cream-400" : "text-warm-600"}`}>
                  {l.label}
                </span>
              </span>
              {locale === l.id && <span className="text-sm">✓</span>}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
