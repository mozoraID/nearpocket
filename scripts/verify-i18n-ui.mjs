/**
 * Switch all 7 locales on / and /home at a phone viewport and confirm visible copy changes.
 * Usage: node scripts/verify-i18n-ui.mjs [baseUrl]
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.argv[2] || "http://127.0.0.1:3456";
const outDir = "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });

const LOCALES = [
  { id: "en", native: "English" },
  { id: "id", native: "Bahasa Indonesia" },
  { id: "th", native: "ไทย" },
  { id: "ms", native: "Bahasa Melayu" },
  { id: "ja", native: "日本語" },
  { id: "ko", native: "한국어" },
  { id: "zh", native: "中文" },
];

function parseDict(file) {
  const text = fs.readFileSync(file, "utf8");
  const re = /"([^"]+)"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  const dict = new Map();
  let m;
  while ((m = re.exec(text))) dict.set(m[1], m[2]);
  return dict;
}

const copy = Object.fromEntries(
  LOCALES.map(({ id }) => {
    const dict = parseDict(path.join("src/lib/i18n", `${id}.ts`));
    return [id, {
      hero: dict.get("landing.heroTitle"),
      balance: dict.get("home.balance"),
    }];
  }),
);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
const failures = [];

async function pickLocale(native) {
  const trigger = page.locator('button[aria-haspopup="listbox"]').first();
  await trigger.click();
  const option = page.getByRole("option", { name: native });
  await option.waitFor({ state: "visible" });
  await option.click();
}

try {
  await page.goto(base + "/", { waitUntil: "networkidle" });
  const seenHeroes = new Set();

  for (const { id, native } of LOCALES) {
    await pickLocale(native);
    const hero = copy[id].hero;
    const h1 = page.locator("h1");
    await h1.waitFor({ state: "visible" });
    await page.waitForFunction(
      (expected) => document.querySelector("h1")?.textContent?.trim() === expected,
      hero,
      { timeout: 8000 },
    );
    const actual = (await h1.innerText()).trim();
    if (actual !== hero) failures.push(`${id} landing hero: ${JSON.stringify(actual)} != ${JSON.stringify(hero)}`);
    if (seenHeroes.has(actual)) failures.push(`${id} hero duplicated an earlier locale: ${actual}`);
    seenHeroes.add(actual);

    await page.screenshot({ path: path.join(outDir, `locale-${id}.png`) });
    console.log(`landing ${id}: ${actual}`);

    await page.evaluate(() => {
      localStorage.setItem(
        "nearpocket-v3",
        JSON.stringify({
          state: {
            accountId: "demo.local",
            demoMode: true,
            authMethod: "demo",
            balanceUsdc: 128.5,
          },
          version: 0,
        }),
      );
    });
    await page.goto(base + "/home", { waitUntil: "networkidle" });
    const balance = copy[id].balance;
    await page.getByText(balance, { exact: true }).waitFor({ timeout: 8000 });
    const homeText = await page.locator("main").innerText();
    if (!homeText.includes(balance)) failures.push(`${id} home missing balance label`);
    if (id !== "en" && homeText.includes("Balance · USDC on NEAR")) {
      failures.push(`${id} home still shows English balance`);
    }
    console.log(`home ${id}: ${balance}`);
    await page.goto(base + "/", { waitUntil: "networkidle" });
  }
} catch (err) {
  failures.push(err instanceof Error ? err.stack || err.message : String(err));
  try {
    await page.screenshot({ path: path.join(outDir, "locale-failure.png") });
  } catch { /* ignore */ }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log("ui locales ok");
