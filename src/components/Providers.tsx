"use client";

import { LanguageProvider } from "@/lib/i18n";
import { PrivyClientProvider } from "./PrivyClientProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyClientProvider>
      <LanguageProvider>{children}</LanguageProvider>
    </PrivyClientProvider>
  );
}
