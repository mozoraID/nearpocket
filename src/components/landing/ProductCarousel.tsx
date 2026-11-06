"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import clsx from "clsx";

const SLIDES = [
  { src: "/landing/screens/home.webp", labelKey: "landing.slideHome", altKey: "landing.slideHomeAlt" },
  { src: "/landing/screens/pay.webp", labelKey: "landing.slidePay", altKey: "landing.slidePayAlt" },
  { src: "/landing/screens/card.webp", labelKey: "landing.slideCard", altKey: "landing.slideCardAlt" },
  { src: "/landing/screens/shop.webp", labelKey: "landing.slideShop", altKey: "landing.slideShopAlt" },
] as const;

const AUTO_MS = 5000;

export function ProductCarousel() {
  const t = useT();
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useRef(false);

  useEffect(() => {
    reduceMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const syncIndex = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const w = el.clientWidth;
    if (!w) return;
    const i = Math.round(el.scrollLeft / w);
    setIndex(Math.max(0, Math.min(SLIDES.length - 1, i)));
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.addEventListener("scroll", syncIndex, { passive: true });
    return () => el.removeEventListener("scroll", syncIndex);
  }, [syncIndex]);

  const go = useCallback((i: number) => {
    const el = scroller.current;
    if (!el) return;
    const next = ((i % SLIDES.length) + SLIDES.length) % SLIDES.length;
    el.scrollTo({ left: next * el.clientWidth, behavior: reduceMotion.current ? "auto" : "smooth" });
    setIndex(next);
  }, []);

  useEffect(() => {
    if (paused || reduceMotion.current) return;
    const id = window.setInterval(() => {
      setIndex((cur) => {
        const n = (cur + 1) % SLIDES.length;
        const el = scroller.current;
        if (el) el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
        return n;
      });
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  return (
    <div
      className="relative mx-auto w-full max-w-[300px] sm:max-w-[340px]"
      onPointerDown={() => setPaused(true)}
      onTouchStart={() => setPaused(true)}
    >
      {/* Soft depth — static, no filter during swipe */}
      <div aria-hidden className="pointer-events-none absolute inset-x-6 top-10 -z-10 h-2/3 rounded-full bg-ink/[0.07] blur-2xl" />

      <div
        className="rounded-[2rem] bg-ink p-[9px] shadow-[0_20px_40px_rgba(17,17,17,0.14)]"
      >
        <div
          ref={scroller}
          className="np-carousel flex snap-x snap-mandatory overflow-x-auto rounded-[1.4rem] bg-cream-200"
          role="region"
          aria-roledescription="carousel"
          aria-label={t("landing.carouselLabel")}
        >
          {SLIDES.map((s, i) => (
            <div
              key={s.src}
              className="relative w-full shrink-0 snap-center snap-always"
              aria-hidden={i !== index}
            >
              <Image
                src={s.src}
                alt={t(s.altKey)}
                width={390}
                height={844}
                priority={i === 0}
                loading={i === 0 ? "eager" : "lazy"}
                sizes="(max-width: 640px) 280px, 320px"
                className="h-auto w-full"
                draggable={false}
              />
            </div>
          ))}
        </div>
      </div>

      <p className="mt-4 text-center text-sm font-medium text-warm-600">{t(SLIDES[index].labelKey)}</p>

      <div className="mt-3 flex items-center justify-center gap-2">
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
              "h-2 rounded-full transition-[width,background-color] duration-200",
              i === index ? "w-6 bg-ink" : "w-2 bg-cream-400",
            )}
          />
        ))}
      </div>
    </div>
  );
}
