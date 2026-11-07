"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Globe } from "lucide-react";
import { useI18n } from "@/lib/i18n";

type MenuBox = { top: number; left: number; width: number; maxHeight: number };

/**
 * The landing header uses backdrop-filter, which becomes the containing block
 * for position:fixed descendants and clips an in-header menu to the bar height.
 * The list is portaled to document.body so every locale can paint in full.
 */
function measureMenu(btn: HTMLElement): MenuBox {
  const rect = btn.getBoundingClientRect();
  const margin = 12;
  const width = Math.min(288, window.innerWidth - margin * 2);
  let left = rect.right - width;
  left = Math.max(margin, Math.min(left, window.innerWidth - margin - width));
  const gap = 8;
  const spaceBelow = window.innerHeight - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  // Prefer opening downward; flip only when the list cannot fit below.
  const openUp = spaceBelow < 280 && spaceAbove > spaceBelow;
  const available = (openUp ? spaceAbove : spaceBelow) - gap;
  const maxHeight = Math.max(160, available);
  const top = openUp
    ? Math.max(margin, rect.top - gap - maxHeight)
    : rect.bottom + gap;
  return { top, left, width, maxHeight };
}

export function LanguageSwitcher({ compact }: { compact?: boolean }) {
  const { locale, setLocale, locales, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<MenuBox | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = locales.find((l) => l.id === locale);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      if (btnRef.current) setBox(measureMenu(btnRef.current));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const menu =
    open && box && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-label={t("lang.title")}
            className="fixed z-[70] overflow-y-auto rounded-2xl bg-cream-100 p-1.5 shadow-[0_16px_40px_rgba(17,17,17,0.14)] ring-1 ring-cream-300"
            style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}
          >
            <p className="px-3 pb-1 pt-2 text-xs font-semibold tracking-wide text-warm-500">
              {t("lang.title")}
            </p>
            <p className="px-3 pb-2 text-xs text-warm-600">{t("lang.auto")}</p>
            <div className="space-y-1">
              {locales.map((l) => {
                const active = locale === l.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setLocale(l.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${
                      active ? "bg-ink text-cream-100" : "text-ink hover:bg-cream-200"
                    }`}
                  >
                    <span className="text-xl leading-none" aria-hidden>
                      {l.flag}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{l.native}</span>
                      <span className={`block text-xs ${active ? "text-cream-400" : "text-warm-600"}`}>
                        {l.label}
                      </span>
                    </span>
                    {active && <span className="text-sm">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("lang.title")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={
          compact
            ? "flex h-10 w-10 items-center justify-center rounded-full bg-cream-100 ring-1 ring-cream-300"
            : "flex h-10 items-center gap-1.5 rounded-full bg-cream-100 px-3 text-sm font-medium ring-1 ring-cream-300"
        }
      >
        <Globe className="h-4 w-4" />
        {!compact && (
          <span>
            {current?.flag} {current?.id.toUpperCase()}
          </span>
        )}
      </button>
      {menu}
    </>
  );
}
