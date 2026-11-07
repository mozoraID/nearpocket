"use client";

import { Sheet } from "./Sheet";
import { NEAR_CONFIG, explorerAccountUrl } from "@/lib/near/config";
import { useT } from "@/lib/i18n";

export function HowItWorksSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const steps = [
    ["help.s1t", "help.s1d"],
    ["help.s2t", "help.s2d"],
    ["help.s3t", "help.s3d"],
    ["help.s4t", "help.s4d"],
  ] as const;
  const real = ["help.r1", "help.r2", "help.r3", "help.r4", "help.r6"] as const;
  const mock = ["help.m1", "help.m2", "help.m3", "help.m4"] as const;

  return (
    <Sheet open={open} onClose={onClose} title={t("help.title")}>
      <ol className="space-y-4">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-cream-100">
              {i + 1}
            </span>
            <div>
              <p className="font-semibold">{t(title)}</p>
              <p className="text-sm text-warm-600">{t(body)}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-[#e3eedb] p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#2f5a1f]">{t("help.real")}</p>
          <ul className="space-y-1 text-[13px] text-ink-soft">
            {real.map((key) => (
              <li key={key}>• {t(key)}</li>
            ))}
            <li>• {t("help.r5", { network: NEAR_CONFIG.networkId })}</li>
          </ul>
        </div>
        <div className="rounded-2xl bg-cream-300 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warm-600">{t("help.demo")}</p>
          <ul className="space-y-1 text-[13px] text-ink-soft">
            {mock.map((key) => (
              <li key={key}>• {t(key)}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-4 text-xs text-warm-600">
        {t("help.note")}{" "}
        <a
          className="underline"
          href={explorerAccountUrl(NEAR_CONFIG.agentPolicyContract)}
          target="_blank"
          rel="noreferrer"
        >
          {NEAR_CONFIG.agentPolicyContract}
        </a>
      </p>
    </Sheet>
  );
}
