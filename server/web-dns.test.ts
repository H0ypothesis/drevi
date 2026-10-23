import assert from "node:assert/strict";
import test from "node:test";
import { isProxyFakeAddress, lookupProxyTarget } from "./web-dns.ts";

test("proxy detection is restricted to the IPv4 198.18.0.0/15 pool", () => {
  for (const address of ["198.18.0.0", "198.18.0.75", "198.19.255.255"])
    assert.equal(isProxyFakeAddress(address), true);
  for (const address of [
    "198.17.255.255",
    "198.20.0.0",
    "198.18.999.1",
    "127.0.0.1",
    "192.168.1.1",
    "::ffff:198.18.0.1",
  ])
    assert.equal(isProxyFakeAddress(address), false);
});

test("public DNS queries A and AAAA without forwarding target credentials or allowing redirects", async () => {
  const controller = new AbortController();
  const requests: URL[] = [];
  const addresses = await lookupProxyTarget(
    "mcp.exa.ai",
    controller.signal,
    (async (input, init) => {
      const url = new URL(String(input));
      requests.push(url);
      assert.equal(url.origin, "https://cloudflare-dns.com");
      assert.equal(url.pathname, "/dns-query");
      assert.equal(url.searchParams.get("name"), "mcp.exa.ai");
      assert.equal(init?.redirect, "error");
      assert.deepEqual(init?.headers, { accept: "application/dns-json" });
      assert.equal(init?.body, undefined);
      assert.equal(init?.signal?.aborted, false);
      const type = Number(url.searchParams.get("type"));
      return Response.json({
        Status: 0,
        Answer: [
          { type: 5, data: "alias.example.com" },
          {
            type,
            data: type === 1 ? "104.18.6.160" : "2606:4700::6812:6a0",
          },
        ],
      });
    }) as typeof fetch,
  );
  assert.equal(requests.length, 2);
  assert.deepEqual(addresses, [
    { address: "104.18.6.160", family: 4 },
    { address: "2606:4700::6812:6a0", family: 6 },
  ]);
});

test("public DNS handles missing records and rejects failed, truncated or malformed answers", async () => {
  for (const data of [{ Status: 0 }, { Status: 3 }]) {
    const result = await lookupProxyTarget(
      "missing.example.com",
      new AbortController().signal,
      (async () => Response.json(data)) as typeof fetch,
    );
    assert.deepEqual(result, []);
  }
  for (const data of [
    null,
    {},
    { Status: 2 },
    { Status: 0, TC: true },
    { Status: 0, Answer: {} },
    { Status: 0, Answer: [{ type: 1, data: "not-an-IP" }] },
    { Status: 0, Answer: [{ type: 1, data: "::1" }] },
  ])
    await assert.rejects(
      lookupProxyTarget(
        "example.com",
        new AbortController().signal,
        (async () => Response.json(data)) as typeof fetch,
      ),
      /Invalid public DNS/,
    );
  await assert.rejects(
    lookupProxyTarget(
      "example.com",
      new AbortController().signal,
      (async () =>
        new Response("unavailable", { status: 503 })) as typeof fetch,
    ),
    /Public DNS request failed/,
  );
});
