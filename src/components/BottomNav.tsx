"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ScanLine, ShoppingBag, ReceiptText } from "lucide-react";
import clsx from "clsx";
import { useT } from "@/lib/i18n";

export function BottomNav() {
  const pathname = usePathname();
  const t = useT();
  const items = [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/pay", label: t("nav.pay"), icon: ScanLine },
    { href: "/belanja", label: t("nav.shop"), icon: ShoppingBag },
    { href: "/aktivitas", label: t("nav.activity"), icon: ReceiptText },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40">
      <div className="mx-auto w-full max-w-[440px] border-t border-cream-300 bg-cream-100/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="grid grid-cols-4">
          {items.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "flex min-h-[64px] flex-col items-center justify-center gap-1 text-[12px] font-medium",
                  active ? "text-ink" : "text-warm-500",
                )}
              >
                <span
                  className={clsx(
                    "flex h-8 w-14 items-center justify-center rounded-full transition",
                    active && "bg-ink text-cream-100",
                  )}
                >
                  <Icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.2 : 1.8} />
                </span>
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
