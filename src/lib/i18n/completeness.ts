import { en, type Dict, type TranslationKey } from "./en";
import { id } from "./id";
import { th } from "./th";
import { ms } from "./ms";
import { ja } from "./ja";
import { ko } from "./ko";
import { zh } from "./zh";

/**
 * Compile-time guard: each catalog must implement every key in en.ts.
 * A missing or extra key fails `tsc` / `next build`.
 */
export const catalogs = { en, id, th, ms, ja, ko, zh } satisfies Record<string, Dict>;

const PLACEHOLDER = /\{(\w+)\}/g;

function placeholders(value: string): string {
  return [...value.matchAll(PLACEHOLDER)].map((m) => m[1]).sort().join(",");
}

/** Runtime guard so a translated string cannot drop or rename a {placeholder}. */
export function assertLocalePlaceholders(): void {
  const keys = Object.keys(en) as TranslationKey[];
  for (const [locale, dict] of Object.entries(catalogs)) {
    for (const key of keys) {
      const expected = placeholders(en[key]);
      const actual = placeholders(dict[key]);
      if (expected !== actual) {
        throw new Error(
          `i18n placeholder mismatch in ${locale} "${key}": got {${actual}} expected {${expected}}`,
        );
      }
    }
  }
}

assertLocalePlaceholders();
