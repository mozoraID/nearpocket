# NearPocket — demo video storyboard (60–90s) + X post draft

**Do not post automatically.** Abi posts on X.

## Shot list (≈75 seconds)

Record on a phone (or DevTools 390×844) at https://nearpocket.vercel.app. Four tabs: **Home · Bayar · Belanja · Aktivitas**.

| t | Shot | VO / on-screen text |
| --- | --- | --- |
| 0–6s | **Home**: balance card (USDC on NEAR + ≈ Rp), tap *Sign in* → Meteor / *Try demo* | “I hold USDC on NEAR, but warungs only take QRIS.” |
| 6–22s | Tap **Scan & Pay** → camera opens → scan the merchant QR (or *Use sample QRIS*) → merchant card *Warung Bu Siti · Rp25,000* + FX line → **Pay** | “Scan. NearPocket shows the merchant and the USDC rate. One tap.” |
| 22–30s | Progress: Signed → NEAR Intents → **Xendit QRIS** → Paid → receipt with Xendit ref | “A licensed partner pays the merchant in rupiah. Crypto never touches the warung.” |
| 30–38s | *Paste code* sheet → 🇹🇭 PromptPay / 🇯🇵 JPQR sample → confirm card | “Same wallet for Thailand, Malaysia, Singapore, Japan, Korea QR.” |
| 38–45s | Back → *Pay worldwide* → toggle *Pay with NEAR* (live 1Click quote) | “No QR? NEAR Intents turns any token into USDC, then a card pays.” |
| 45–62s | **Belanja**: search “Wireless earbuds” → results with Tokopedia/Shopee/Lazada badges → **Ask agent** (budget + deadline) → agent card *Needs you* → **Approve** | “Tell the agent your budget. It watches marketplaces, but it can’t spend without me.” |
| 62–70s | Spending limits card → open `nearly-7b1462.testnet` on NearBlocks; **Aktivitas** timeline + on-chain proof | “Limits live in a NEAR contract. Every action is on the timeline.” |
| 70–80s | End card: logo + repo + live URL | “NearPocket — your NEAR pocket for real-world money. Built at NEAR HACKATHON.” |

Tips: allow camera access when the browser asks; if the camera is blocked, the scanner shows *Try again* plus upload / paste / sample. Tap the **Demo · testnet** pill to show the *How it works* sheet (real vs demo). Captions help; no music needed.

## Draft X post

```
Warungs don’t take USDC. NearPocket fixes that — without breaking the rules.

Scan QRIS (and ASEAN QR rails) → USDC on NEAR → licensed PJP pays the merchant in local fiat.
Worldwide? NEAR Intents → USDC → card/link.
Plus a shopping agent that waitlists deals but can’t spend without you (on-chain policy).

Built at NEAR HACKATHON — realworld + agents.

Demo: https://nearpocket.vercel.app
Repo: https://github.com/mozoraID/nearpocket

@NEARProtocol #NEARHackathon @NearBuilders
```

Replace the demo URL if the alias differs after Vercel deploy. Attach the 60–90s video.
