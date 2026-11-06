"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, QrCode, Store, Bot, Globe } from "lucide-react";
import clsx from "clsx";

const items = [
  { href: "/", label: "Wallet", icon: Home },
  { href: "/pay", label: "Pay QR", icon: QrCode },
  { href: "/pay?tab=world", label: "World", icon: Globe },
  { href: "/shop", label: "Shop", icon: Store },
  { href: "/agent", label: "Agent", icon: Bot },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#0b1220]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
        {items.map(({ href, label, icon: Icon }) => {
          const base = href.split("?")[0];
          const active =
            base === "/"
              ? pathname === "/"
              : pathname === base || pathname.startsWith(base + "/");
          return (
            <Link
              key={href + label}
              href={href}
              className={clsx(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium",
                active ? "text-cyan-300" : "text-slate-400 hover:text-slate-200",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
