"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Locale } from "./types";
import { LOCALES } from "./types";
import { en, type Dict, type TranslationKey } from "./en";
import "./completeness";
import { id } from "./id";
import { th } from "./th";
import { ms } from "./ms";
import { ja } from "./ja";
import { ko } from "./ko";
import { zh } from "./zh";

const DICTS: Record<Locale, Dict> = { en, id, th, ms, ja, ko, zh };
const STORAGE_KEY = "nearpocket-locale";

function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const raw = (navigator.languages?.[0] || navigator.language || "en").toLowerCase();
  const map: Record<string, Locale> = {
    id: "id", "id-id": "id", in: "id",
    th: "th", "th-th": "th",
    ms: "ms", "ms-my": "ms",
    ja: "ja", "ja-jp": "ja",
    ko: "ko", "ko-kr": "ko",
    zh: "zh", "zh-cn": "zh", "zh-tw": "zh", "zh-hans": "zh", "zh-hant": "zh",
    en: "en",
  };
  if (map[raw]) return map[raw];
  const base = raw.split("-")[0];
  return map[base] || "en";
}

function lookup(dict: Dict, key: string): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(dict, key)) return undefined;
  return dict[key as TranslationKey];
}

function format(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`,
  );
}

type I18nCtx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  locales: typeof LOCALES;
};

const Ctx = createContext<I18nCtx | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (saved && DICTS[saved]) setLocaleState(saved);
      else setLocaleState(detectLocale());
    } catch {
      setLocaleState(detectLocale());
    }
    setReady(true);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch { /* ignore */ }
    if (typeof document !== "undefined") document.documentElement.lang = l === "id" ? "id" : l;
  }, []);

  useEffect(() => {
    if (ready && typeof document !== "undefined") {
      document.documentElement.lang = locale === "id" ? "id" : locale;
    }
  }, [locale, ready]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = DICTS[locale] || en;
      const raw = lookup(dict, key) ?? lookup(en, key) ?? key;
      return format(raw, vars);
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, locales: LOCALES }),
    [locale, setLocale, t],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n outside LanguageProvider");
  return ctx;
}

export function useT() {
  return useI18n().t;
}

export { LOCALES };
export type { Locale };
