"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { WalletButton } from "@/components/WalletButton";
import { useNearPocketStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { openAuthSheet } from "@/lib/auth-bridge";
import { BRAND } from "@/config/brand";

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

export function LandingPage() {
  const t = useT();
  const router = useRouter();
  const accountId = useNearPocketStore((s) => s.accountId);
  const connectDemo = useNearPocketStore((s) => s.connectDemo);
  const [mounted, setMounted] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (pendingRedirect && accountId) {
      router.push("/app");
      setPendingRedirect(false);
    }
  }, [pendingRedirect, accountId, router]);

  const hasSession = mounted && Boolean(accountId);

  function launch() {
    if (hasSession) {
      router.push("/app");
      return;
    }
    setPendingRedirect(true);
    openAuthSheet();
  }

  function tryDemo() {
    connectDemo();
    router.push("/app");
  }

  return (
    <div className="min-h-dvh bg-cream-200 text-ink">
      {/* Header */}
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
          <div className="flex items-center gap-2">
            <LanguageSwitcher compact />
            <WalletButton />
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
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
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" className="btn-primary" onClick={launch}>
                {hasSession ? t("landing.ctaOpenApp") : t("landing.ctaLaunch")}
                <ArrowRight className="h-4 w-4" />
              </button>
              {!hasSession && (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setPendingRedirect(true);
                      openAuthSheet();
                    }}
                  >
                    {t("landing.ctaSignIn")}
                  </button>
                  <button type="button" className="btn-outline" onClick={tryDemo}>
                    {t("landing.ctaDemo")}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="relative overflow-hidden rounded-[2rem] bg-cream-100 shadow-[0_20px_60px_rgba(17,17,17,0.08)] ring-1 ring-cream-300">
              <Image
                src="/landing/hero-pay.webp"
                alt={t("landing.heroPhotoAlt")}
                width={1400}
                height={934}
                priority
                className="h-56 w-full object-cover sm:h-72"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-cream-200/40 to-transparent" />
            </div>
            <div className="relative mx-auto -mt-24 w-[220px] sm:-mt-28 sm:w-[250px]">
              <div className="overflow-hidden rounded-[1.75rem] bg-ink p-2 shadow-2xl ring-1 ring-black/20">
                <div className="overflow-hidden rounded-[1.35rem] bg-cream-200">
                  <Image
                    src="/landing/app-mock.webp"
                    alt={t("landing.mockAlt")}
                    width={390}
                    height={844}
                    className="h-auto w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-cream-300 bg-cream-100/70 py-16">
          <div className="mx-auto max-w-6xl space-y-16 px-4 sm:px-6">
            {/* QRIS */}
            <div className="grid items-center gap-8 lg:grid-cols-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="overflow-hidden rounded-3xl ring-1 ring-cream-300">
                  <Image
                    src="/landing/market-stall.webp"
                    alt={t("landing.featQrAlt")}
                    width={1200}
                    height={800}
                    className="h-44 w-full object-cover sm:h-56"
                  />
                </div>
                <div className="overflow-hidden rounded-3xl ring-1 ring-cream-300">
                  <Image
                    src="/landing/cafe-pay.webp"
                    alt={t("landing.featQrAlt2")}
                    width={1200}
                    height={860}
                    className="h-44 w-full object-cover sm:h-56"
                  />
                </div>
              </div>
              <div>
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-cream-100">
                  <ScanLine className="h-5 w-5" />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("landing.featQrTitle")}</h2>
                <p className="mt-3 text-warm-600 leading-relaxed">{t("landing.featQrBody")}</p>
              </div>
            </div>

            {/* Worldwide */}
            <div className="grid items-center gap-8 lg:grid-cols-2">
              <div className="order-2 lg:order-1">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-cream-100">
                  <Globe2 className="h-5 w-5" />
                </div>
                <div className="mb-2 inline-flex rounded-full bg-cream-300 px-2.5 py-0.5 text-[11px] font-semibold">
                  {t("landing.featWorldBadge")}
                </div>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("landing.featWorldTitle")}</h2>
                <p className="mt-3 text-warm-600 leading-relaxed">{t("landing.featWorldBody")}</p>
              </div>
              <div className="order-1 grid grid-cols-2 gap-3 lg:order-2">
                <div className="overflow-hidden rounded-3xl ring-1 ring-cream-300">
                  <Image
                    src="/landing/travel.webp"
                    alt={t("landing.featWorldAlt")}
                    width={666}
                    height={1000}
                    className="h-56 w-full object-cover"
                  />
                </div>
                <div className="overflow-hidden rounded-3xl ring-1 ring-cream-300">
                  <Image
                    src="/landing/contactless.webp"
                    alt={t("landing.featWorldAlt2")}
                    width={666}
                    height={1000}
                    className="h-56 w-full object-cover"
                  />
                </div>
              </div>
            </div>

            {/* Shopping + agent */}
            <div className="grid gap-8 lg:grid-cols-2">
              <article className="overflow-hidden rounded-[1.75rem] bg-cream-200 ring-1 ring-cream-300">
                <Image
                  src="/landing/shop-online.webp"
                  alt={t("landing.featShopAlt")}
                  width={1200}
                  height={800}
                  className="h-48 w-full object-cover"
                />
                <div className="p-6">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-cream-100">
                    <ShoppingBag className="h-5 w-5" />
                  </div>
                  <h2 className="text-xl font-semibold">{t("landing.featShopTitle")}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-warm-600">{t("landing.featShopBody")}</p>
                </div>
              </article>
              <article className="rounded-[1.75rem] bg-ink p-6 text-cream-100 sm:p-8">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-cream-100 text-ink">
                  <Bot className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-semibold">{t("landing.featAgentTitle")}</h2>
                <p className="mt-2 text-sm leading-relaxed text-cream-400">{t("landing.featAgentBody")}</p>
              </article>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
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
          </div>
        </section>

        {/* Trust */}
        <section className="border-y border-cream-300 bg-cream-100/70 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
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
          </div>
        </section>

        {/* QR rails */}
        <section className="py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
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
            <div className="mx-auto mt-10 max-w-3xl overflow-hidden rounded-[1.75rem] ring-1 ring-cream-300">
              <Image
                src="/landing/local-food.webp"
                alt={t("landing.railsPhotoAlt")}
                width={1200}
                height={860}
                className="h-48 w-full object-cover sm:h-64"
              />
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-cream-300 bg-cream-100/70 py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-semibold tracking-tight">{t("landing.faqTitle")}</h2>
            <div className="mt-8 space-y-3">
              {FAQ.map(([q, a]) => (
                <FaqItem key={q} q={t(q)} a={t(a)} />
              ))}
            </div>
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
            <a href="/landing/CREDITS.md" className="font-medium underline-offset-2 hover:underline">
              {t("landing.footerCredits")}
            </a>
            {hasSession ? (
              <Link href="/app" className="font-medium underline-offset-2 hover:underline">
                {t("landing.ctaOpenApp")}
              </Link>
            ) : (
              <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={launch}>
                {t("landing.ctaLaunch")}
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
