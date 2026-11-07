/**
 * Locale catalogs must contain every key from en.ts, and the same {placeholders}.
 * Runs without a TypeScript loader so `npm test` can catch a silent English fallback.
 */
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "src/lib/i18n");
const locales = ["en", "id", "th", "ms", "ja", "ko", "zh"];

function parseDict(file) {
  const text = fs.readFileSync(file, "utf8");
  const re = /"([^"]+)"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  const dict = new Map();
  let m;
  while ((m = re.exec(text))) {
    if (dict.has(m[1])) throw new Error(`${file} has duplicate key ${m[1]}`);
    dict.set(m[1], m[2]);
  }
  if (dict.size < 50) throw new Error(`${file} parsed only ${dict.size} keys`);
  return dict;
}

function placeholders(value) {
  return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
}

const en = parseDict(path.join(dir, "en.ts"));
let failed = 0;

for (const locale of locales) {
  const dict = parseDict(path.join(dir, `${locale}.ts`));
  const missing = [...en.keys()].filter((k) => !dict.has(k));
  const extra = [...dict.keys()].filter((k) => !en.has(k));
  if (missing.length || extra.length) {
    failed++;
    console.error(`${locale}: missing ${missing.length}, extra ${extra.length}`);
    for (const k of missing) console.error(`  missing ${k}`);
    for (const k of extra) console.error(`  extra ${k}`);
  }
  for (const [key, value] of dict) {
    if (!en.has(key)) continue;
    const expected = placeholders(en.get(key));
    const actual = placeholders(value);
    if (expected !== actual) {
      failed++;
      console.error(`${locale}.${key}: placeholders {${actual}} != {${expected}}`);
    }
    if (!value.trim()) {
      failed++;
      console.error(`${locale}.${key}: empty translation`);
    }
  }
}

if (failed) {
  console.error(`i18n check failed (${failed})`);
  process.exit(1);
}
console.log(`i18n ok: ${en.size} keys × ${locales.length} locales`);
