"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "@/lib/i18n";
import clsx from "clsx";

const SLIDES = [
  { src: "/landing/screens/home.webp", labelKey: "landing.slideHome", altKey: "landing.slideHomeAlt" },
  { src: "/landing/screens/pay.webp", labelKey: "landing.slidePay", altKey: "landing.slidePayAlt" },
  { src: "/landing/screens/card.webp", labelKey: "landing.slideCard", altKey: "landing.slideCardAlt" },
  { src: "/landing/screens/shop.webp", labelKey: "landing.slideShop", altKey: "landing.slideShopAlt" },
] as const;

const AUTO_MS = 4200;

export function ProductCarousel() {
  const t = useT();
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const dragX = useRef(0);

  const go = useCallback((i: number) => {
    const n = SLIDES.length;
    setIndex(((i % n) + n) % n);
  }, []);

  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  useEffect(() => {
    if (paused || reduce) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), AUTO_MS);
    return () => window.clearInterval(id);
  }, [paused, reduce]);

  function onTouchStart(e: React.TouchEvent) {
    touchX.current = e.touches[0].clientX;
    setPaused(true);
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "touch") return;
    dragX.current = e.clientX;
    setPaused(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onPointerUp(e: React.PointerEvent) {
    if (e.pointerType === "touch") return;
    const dx = e.clientX - dragX.current;
    if (Math.abs(dx) > 50) (dx < 0 ? next : prev)();
  }

  return (
    <div
      className="relative mx-auto w-full max-w-[340px] select-none sm:max-w-[380px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false);
      }}
    >
      {/* Soft glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-16 -z-10 h-2/3 rounded-full bg-ink/10 blur-3xl"
      />

      {/* Stacked depth phones */}
      {!reduce && (
        <>
          <div
            aria-hidden
            className="absolute left-1/2 top-6 h-[88%] w-[78%] -translate-x-[62%] rotate-[-8deg] rounded-[2rem] bg-ink/10 ring-1 ring-cream-300"
          />
          <div
            aria-hidden
            className="absolute left-1/2 top-4 h-[90%] w-[82%] -translate-x-[38%] rotate-[7deg] rounded-[2rem] bg-ink/15 ring-1 ring-cream-300"
          />
        </>
      )}

      <div
        className="relative"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        role="region"
        aria-roledescription="carousel"
        aria-label={t("landing.carouselLabel")}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={index}
            initial={reduce ? false : { opacity: 0, x: 36, scale: 0.96, rotateY: -8 }}
            animate={{ opacity: 1, x: 0, scale: 1, rotateY: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: -36, scale: 0.96, rotateY: 8 }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            className={clsx(
              "relative mx-auto overflow-hidden rounded-[2rem] bg-ink p-[10px] shadow-[0_30px_60px_rgba(17,17,17,0.18)]",
              !reduce && "np-float",
            )}
            style={{ perspective: 900 }}
          >
            <div className="overflow-hidden rounded-[1.45rem] bg-cream-200">
              <Image
                src={SLIDES[index].src}
                alt={t(SLIDES[index].altKey)}
                width={390}
                height={844}
                priority={index === 0}
                className="h-auto w-full"
                sizes="(max-width: 640px) 280px, 340px"
              />
            </div>
            {/* notch */}
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-[14px] h-5 w-24 -translate-x-1/2 rounded-full bg-ink/90"
            />
          </motion.div>
        </AnimatePresence>

        <p className="mt-5 text-center text-sm font-medium text-warm-600">
          {t(SLIDES[index].labelKey)}
        </p>

        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            aria-label={t("landing.carouselPrev")}
            onClick={() => {
              setPaused(true);
              prev();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-cream-100 ring-1 ring-cream-300 hover:bg-cream-300"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            {SLIDES.map((s, i) => (
              <button
                key={s.src}
                type="button"
                aria-label={t(s.labelKey)}
                aria-current={i === index}
                onClick={() => {
                  setPaused(true);
                  go(i);
                }}
                className={clsx(
                  "h-2 rounded-full transition-all",
                  i === index ? "w-6 bg-ink" : "w-2 bg-cream-400 hover:bg-warm-500",
                )}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label={t("landing.carouselNext")}
            onClick={() => {
              setPaused(true);
              next();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-cream-100 ring-1 ring-cream-300 hover:bg-cream-300"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
