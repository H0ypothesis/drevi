import { isIP } from "node:net";
import type { WebAddress } from "./web-transport.ts";

export const PROXY_FAKE_IP_RANGE = "198.18.0.0/15";

export function isProxyFakeAddress(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return a === 198 && (b === 18 || b === 19);
}

/** Resolve real targets, never use a proxy's synthetic IP as an SSRF exemption.
 * The caller supplies a bounded transport bootstrapped to the resolver's public
 * IP, retaining cloudflare-dns.com for TLS verification and the HTTP Host header.
 */
export async function lookupProxyTarget(
  hostname: string,
  signal: AbortSignal,
  fetch: typeof globalThis.fetch,
): Promise<WebAddress[]> {
  const pending = new AbortController();
  const lookupSignal = AbortSignal.any([signal, pending.signal]);
  try {
    return (
      await Promise.all(
        ([1, 28] as const).map(async (type) => {
          const url = new URL("https://cloudflare-dns.com/dns-query");
          url.searchParams.set("name", hostname);
          url.searchParams.set("type", String(type));
          const response = await fetch(url, {
            headers: { accept: "application/dns-json" },
            redirect: "error",
            signal: lookupSignal,
          });
          if (!response.ok) throw new Error("Public DNS request failed.");
          const data = (await response.json()) as {
            Status?: number;
            TC?: boolean;
            Answer?: Array<{ type?: number; data?: unknown }>;
          } | null;
          if (
            !data ||
            data.TC ||
            ![0, 3].includes(data.Status ?? -1) ||
            (data.Answer !== undefined && !Array.isArray(data.Answer))
          )
            throw new Error("Invalid public DNS response.");
          if (data.Status === 3) return [];
          const family = type === 1 ? 4 : 6;
          return (data.Answer ?? []).flatMap((record) => {
            if (record?.type !== type) return [];
            if (typeof record.data !== "string" || isIP(record.data) !== family)
              throw new Error("Invalid public DNS address.");
            return [{ address: record.data, family }];
          });
        }),
      )
    ).flat();
  } finally {
    pending.abort();
  }
}
