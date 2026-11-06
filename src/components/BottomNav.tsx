"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, QrCode, Store, ClipboardList, WalletCards } from "lucide-react";
import clsx from "clsx";

const items = [
  { href: "/", label: "Wallet", icon: Home },
  { href: "/pay", label: "Pay QR", icon: QrCode },
  { href: "/scan", label: "Scan", icon: QrCode },
  { href: "/plans", label: "Plans", icon: ClipboardList },
  { href: "/shop", label: "Shop", icon: Store },
  { href: "/topup", label: "Top up", icon: WalletCards },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#0b1220]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-stretch justify-between gap-0.5 overflow-x-auto px-1 pb-[env(safe-area-inset-bottom)]">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex min-w-[3.2rem] flex-1 flex-col items-center gap-0.5 py-2 text-[9px] font-medium",
                active ? "text-cyan-300" : "text-slate-400 hover:text-slate-200",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={active ? 2.4 : 1.8} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
