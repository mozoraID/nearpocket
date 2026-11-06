"use client";

import { LanguageProvider } from "@/lib/i18n";
import { PrivyClientProvider } from "./PrivyClientProvider";
import { RegionBootstrap } from "./RegionBootstrap";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyClientProvider>
      <LanguageProvider>
        <RegionBootstrap />
        {children}
      </LanguageProvider>
    </PrivyClientProvider>
  );
}
