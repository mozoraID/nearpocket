"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ScanLine,
  Globe2,
  ShoppingBag,
  Bot,
  Shield,
  KeyRound,
  Gauge,
  FlaskConical,
  ChevronDown,
  Code2,
  ArrowRight,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useNearPocketStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { BRAND } from "@/config/brand";
import { ProductCarousel } from "./ProductCarousel";
import { useAuthSession } from "@/hooks/useAuthSession";

const RAILS = [
  "landing.railId",
  "landing.railSg",
  "landing.railMy",
  "landing.railTh",
  "landing.railPh",
  "landing.railVn",
] as const;

const FAQ = [
  ["landing.faq1Q", "landing.faq1A"],
  ["landing.faq2Q", "landing.faq2A"],
  ["landing.faq3Q", "landing.faq3A"],
  ["landing.faq4Q", "landing.faq4A"],
] as const;

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl bg-cream-100 ring-1 ring-cream-300">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left font-semibold"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{q}</span>
        <ChevronDown className={`h-5 w-5 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="border-t border-cream-300 px-5 py-4 text-sm leading-relaxed text-warm-600">{a}</p>}
    </div>
  );
}

function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

export function LandingPage() {
  const t = useT();
  const connectDemo = useNearPocketStore((s) => s.connectDemo);
  const { phase } = useAuthSession();
  useEffect(() => {
    try {
      sessionStorage.removeItem("nearpocket-signing-out");
      sessionStorage.removeItem("nearpocket-signing-out-at");
    } catch { /* */ }
  }, []);
  const loginHref = "/login?next=%2Fhome";
  const authLoading = phase === "loading";
  const hasSession = phase === "signed_in";

  return (
    <div className="min-h-dvh bg-cream-200 text-ink">
      <header className="sticky top-0 z-30 border-b border-cream-300/80 bg-cream-100/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-bold text-cream-100">
              NP
            </span>
            <span className="hidden sm:inline">{BRAND.displayName}</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-warm-600 md:flex">
            <a href="#features" className="hover:text-ink">
              {t("landing.navFeatures")}
            </a>
            <a href="#how" className="hover:text-ink">
              {t("landing.navHow")}
            </a>
            <a href="#faq" className="hover:text-ink">
              {t("landing.navFaq")}
            </a>
          </nav>
          <div className="flex min-h-10 items-center gap-2">
            <LanguageSwitcher compact />
            {authLoading ? (
              <span className="h-10 w-24 animate-pulse rounded-full bg-cream-300/80" aria-hidden />
            ) : hasSession ? (
              <a
                href="/home"
                className="flex h-10 items-center rounded-full bg-ink px-4 text-sm font-semibold text-cream-100"
              >
                {t("landing.ctaOpenApp")}
              </a>
            ) : (
              <Link
                href={loginHref}
                className="flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-cream-100"
              >
                {t("landing.ctaNavSignIn")}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-14 lg:pt-16">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-cream-100 px-3 py-1 text-xs font-medium ring-1 ring-cream-300">
              <FlaskConical className="h-3.5 w-3.5" />
              {t("landing.badge")}
            </p>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.25rem]">
              {t("landing.heroTitle")}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-warm-600 sm:text-lg">
              {t("landing.heroSub")}
            </p>
            <div className="mt-8 flex min-h-12 flex-wrap gap-3">
              {authLoading ? (
                <>
                  <span className="h-12 w-36 animate-pulse rounded-full bg-cream-300/80" aria-hidden />
                  <span className="h-12 w-28 animate-pulse rounded-full bg-cream-300/60" aria-hidden />
                </>
              ) : hasSession ? (
                <>
                  <a href="/home" className="btn-primary">
                    {t("landing.ctaOpenApp")}
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <Link href="/login?next=%2Fhome" className="btn-outline">
                    {t("auth.signOutSwitch")}
                  </Link>
                </>
              ) : (
                <>
                  <Link href={loginHref} className="btn-primary">
                    {t("landing.ctaLaunch")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link href={loginHref} className="btn-secondary">
                    {t("landing.ctaSignIn")}
                  </Link>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => {
                      try { sessionStorage.removeItem("nearpocket-suppress-restore"); } catch { /* */ }
                      connectDemo();
                      window.location.href = "/home";
                    }}
                  >
                    {t("landing.ctaDemo")}
                  </button>
                </>
              )}
            </div>
          </div>

          <ProductCarousel />
        </section>

        <section id="features" className="border-t border-cream-300 bg-cream-100/70 py-16">
          <div className="mx-auto max-w-6xl space-y-10 px-4 sm:px-6">
            <Reveal>
              <div className="grid gap-4 md:grid-cols-2">
                <article className="rounded-[1.75rem] bg-cream-200 p-6 ring-1 ring-cream-300 sm:p-8">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-cream-100">
                    <ScanLine className="h-5 w-5" />
                  </div>
                  <h2 className="text-xl font-semibold sm:text-2xl">{t("landing.featQrTitle")}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-warm-600 sm:text-base">{t("landing.featQrBody")}</p>
                </article>
                <article className="rounded-[1.75rem] bg-cream-200 p-6 ring-1 ring-cream-300 sm:p-8">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-cream-100">
                    <Globe2 className="h-5 w-5" />
                  </div>
                  <div className="mb-2 inline-flex rounded-full bg-cream-300 px-2.5 py-0.5 text-[11px] font-semibold">
                    {t("landing.featWorldBadge")}
                  </div>
                  <h2 className="text-xl font-semibold sm:text-2xl">{t("landing.featWorldTitle")}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-warm-600 sm:text-base">{t("landing.featWorldBody")}</p>
                </article>
                <article className="rounded-[1.75rem] bg-cream-200 p-6 ring-1 ring-cream-300 sm:p-8">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-cream-100">
                    <ShoppingBag className="h-5 w-5" />
                  </div>
                  <h2 className="text-xl font-semibold sm:text-2xl">{t("landing.featShopTitle")}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-warm-600 sm:text-base">{t("landing.featShopBody")}</p>
                </article>
                <article className="rounded-[1.75rem] bg-ink p-6 text-cream-100 sm:p-8">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-cream-100 text-ink">
                    <Bot className="h-5 w-5" />
                  </div>
                  <h2 className="text-xl font-semibold sm:text-2xl">{t("landing.featAgentTitle")}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-cream-400 sm:text-base">{t("landing.featAgentBody")}</p>
                </article>
              </div>
            </Reveal>
          </div>
        </section>

        <section id="how" className="py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal>
              <h2 className="text-center text-3xl font-semibold tracking-tight">{t("landing.howTitle")}</h2>
              <div className="mt-10 grid gap-4 md:grid-cols-3">
                {[
                  ["01", "landing.how1Title", "landing.how1Body"],
                  ["02", "landing.how2Title", "landing.how2Body"],
                  ["03", "landing.how3Title", "landing.how3Body"],
                ].map(([n, title, body]) => (
                  <div key={n} className="rounded-[1.75rem] bg-cream-100 p-6 ring-1 ring-cream-300">
                    <p className="text-xs font-semibold tracking-widest text-warm-500">{n}</p>
                    <h3 className="mt-2 text-lg font-semibold">{t(title)}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-warm-600">{t(body)}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        <section className="border-y border-cream-300 bg-cream-100/70 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal>
              <h2 className="text-center text-3xl font-semibold tracking-tight">{t("landing.trustTitle")}</h2>
              <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(
                  [
                    { Icon: Shield, key: "landing.trust1" },
                    { Icon: KeyRound, key: "landing.trust2" },
                    { Icon: Gauge, key: "landing.trust3" },
                    { Icon: FlaskConical, key: "landing.trust4" },
                  ] as const
                ).map(({ Icon, key }) => (
                  <div
                    key={key}
                    className="flex items-start gap-3 rounded-2xl bg-cream-200 px-4 py-4 ring-1 ring-cream-300"
                  >
                    <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium leading-snug">{t(key)}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal>
              <h2 className="text-center text-3xl font-semibold tracking-tight">{t("landing.railsTitle")}</h2>
              <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-warm-600">{t("landing.railsHint")}</p>
              <div className="mt-8 flex flex-wrap justify-center gap-2">
                {RAILS.map((k) => (
                  <span
                    key={k}
                    className="rounded-full bg-cream-100 px-4 py-2 text-sm font-medium ring-1 ring-cream-300"
                  >
                    {t(k)}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        <section id="faq" className="border-t border-cream-300 bg-cream-100/70 py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <Reveal>
              <h2 className="text-center text-3xl font-semibold tracking-tight">{t("landing.faqTitle")}</h2>
              <div className="mt-8 space-y-3">
                {FAQ.map(([q, a]) => (
                  <FaqItem key={q} q={t(q)} a={t(a)} />
                ))}
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-cream-300 bg-cream-200 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="font-semibold">{BRAND.displayName}</p>
            <p className="text-sm text-warm-600">{t("landing.footerBuilt")}</p>
            <p className="mt-1 text-xs text-warm-500">{t("landing.footerTestnet")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <a
              href={BRAND.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-medium underline-offset-2 hover:underline"
            >
              <Code2 className="h-4 w-4" /> {t("landing.footerGithub")}
            </a>
            {authLoading ? null : (
              <Link
                href={hasSession ? "/home" : loginHref}
                className="font-medium underline-offset-2 hover:underline"
              >
                {hasSession ? t("landing.ctaOpenApp") : t("landing.ctaLaunch")}
              </Link>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
