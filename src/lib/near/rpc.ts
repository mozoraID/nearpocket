import { NEAR_CONFIG } from "./config";

const TESTNET_FALLBACKS = [
  "https://rpc.testnet.fastnear.com",
  "https://test.rpc.fastnear.com",
];

/** Official RPC first, then public fallbacks. Testnet reads race them. */
export function rpcUrls(): string[] {
  const primary = NEAR_CONFIG.nodeUrl;
  if (NEAR_CONFIG.networkId !== "testnet") return [primary];
  return [...new Set([primary, ...TESTNET_FALLBACKS])];
}

/**
 * JSON-RPC call. Testnet endpoints race; the first successful result wins.
 * `timeoutMs` bounds the whole race so a hung endpoint cannot stall the UI.
 */
export async function rpcCall(body: object, timeoutMs = 5000): Promise<unknown> {
  const urls = rpcUrls();
  const controllers = urls.map(() => new AbortController());
  const timer = setTimeout(() => {
    for (const controller of controllers) controller.abort();
  }, timeoutMs);
  try {
    return await Promise.any(urls.map((url, index) => postRpc(url, body, controllers[index].signal)));
  } catch (error) {
    const message =
      error instanceof AggregateError
        ? error.errors.map((item) => (item instanceof Error ? item.message : String(item))).filter(Boolean).join("; ")
        : error instanceof Error
          ? error.message
          : "rpc failed";
    throw new Error(message || "rpc failed");
  } finally {
    clearTimeout(timer);
    for (const controller of controllers) controller.abort();
  }
}

async function postRpc(url: string, body: object, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = (await res.json()) as { error?: { message?: string }; result?: unknown };
  if (data.error) throw new Error(data.error.message || "rpc error");
  if (data.result == null) throw new Error("empty rpc result");
  return data.result;
}
