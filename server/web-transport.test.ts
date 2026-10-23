import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { Readable } from "node:stream";
import test from "node:test";
import { gzipSync } from "node:zlib";
import {
  createPublicFetch,
  webUrl,
  type WebRequestFactory,
  type WebTransportOptions,
} from "./web-transport.ts";

interface Reply {
  status?: number;
  headers?: IncomingMessage["headers"];
  body?: string | Buffer | Buffer[];
  error?: Error;
  stall?: boolean;
}
function fixture(replies: Reply[], overrides: WebTransportOptions = {}) {
  const requests: Array<{ url: URL; init: RequestOptions; body?: Buffer }> = [];
  const hosts: string[] = [];
  const options: WebTransportOptions = {
    lookup: async (host) => {
      hosts.push(host);
      return [{ address: "93.184.216.34", family: 4 }];
    },
    request: (url, init, callback) => {
      const reply = replies[requests.length] ?? {};
      const record: (typeof requests)[number] = { url, init };
      requests.push(record);
      const client = new EventEmitter();
      Object.assign(client, {
        end(body?: Buffer) {
          record.body = body;
          queueMicrotask(() => {
            if (reply.error) {
              client.emit("error", reply.error);
              return;
            }
            if (reply.stall) return;
            const body = reply.body ?? "A public page";
            const response = Readable.from(
              Array.isArray(body) ? body : [Buffer.from(body)],
            );
            Object.assign(response, {
              statusCode: reply.status ?? 200,
              statusMessage: "OK",
              headers: { "content-type": "text/plain", ...reply.headers },
            });
            callback(response as IncomingMessage);
          });
        },
        destroy() {},
      });
      return client as ClientRequest;
    },
    ...overrides,
  };
  return {
    fetch: createPublicFetch(options),
    request: options.request!,
    requests,
    hosts,
  };
}

test("publicFetch accepts URL and Request input, returns a fetch Response and pins DNS", async () => {
  const f = fixture([{ body: "plain text" }, { body: "another page" }]);
  const response = await f.fetch(new URL("https://example.com/page#fragment"));
  assert.equal(response.status, 200);
  assert.equal(response.url, "https://example.com/page");
  assert.equal(response.headers.get("content-type"), "text/plain");
  assert.equal(response.redirected, false);
  assert.equal(await response.text(), "plain text");
  const request = f.requests[0];
  assert.equal(request.init.agent, false);
  const pinned = await new Promise((resolve, reject) =>
    request.init.lookup!("rebind.invalid", { all: true }, (error, result) =>
      error ? reject(error) : resolve(result),
    ),
  );
  assert.deepEqual(pinned, [{ address: "93.184.216.34", family: 4 }]);
  assert.equal(f.hosts.length, 1);
  await f.fetch(new Request("https://example.com/other"));
  assert.equal(f.requests[1].url.pathname, "/other");
});

test("publicFetch rejects SSRF literals, schemes, credentials and all mixed private DNS answers", async () => {
  const f = fixture([]);
  for (const input of [
    "file:///etc/passwd",
    "https://user:password@example.com/",
    "http://localhost/",
    "http://a.localhost/",
    "http://LOCALHOST./",
    "http://printer/",
    "http://printer.local/",
    "http://service.internal/",
    "http://home.arpa/",
    "http://router.home.arpa/",
    "http://127.1/",
    "http://0x7f000001/",
    "http://2130706433/",
    "http://10.0.0.1/",
    "http://100.64.0.1/",
    "http://169.254.169.254/",
    "http://172.16.0.1/",
    "http://192.168.0.1/",
    "http://192.0.2.1/",
    "http://198.18.0.1/",
    "http://198.19.255.254/",
    "http://198.51.100.1/",
    "http://203.0.113.1/",
    "http://224.0.0.1/",
    "http://[::]/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[64:ff9b::a00:1]/",
    "http://[fc00::1]/",
    "http://[fe80::1]/",
    "http://[ff02::1]/",
    "http://[2001:db8::1]/",
    "http://[2002:7f00:1::]/",
    "http://[3fff::1]/",
  ])
    await assert.rejects(f.fetch(input), Error, input);
  assert.equal(f.requests.length, 0);
  const mixed = fixture([], {
    lookup: async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ],
  });
  await assert.rejects(mixed.fetch("https://example.com/"), /非公共地址/);
  assert.equal(mixed.requests.length, 0);
  assert.equal(webUrl(new URL("https://example.com/#anchor")).hash, "");
});

test("Fake-IP DNS is replaced with verified public addresses and pinned without changing the hostname", async () => {
  const verified: string[] = [];
  for (const address of ["198.18.0.75", "198.19.255.254"]) {
    const f = fixture([{ body: "proxy search result" }], {
      lookup: async () => [{ address, family: 4 }],
      lookupPublic: async (host) => {
        verified.push(host);
        return [{ address: "104.18.6.160", family: 4 }];
      },
    });
    const response = await f.fetch("https://mcp.exa.ai/mcp", {
      method: "POST",
      body: '{"query":"proxy test"}',
      headers: { "content-type": "application/json" },
    });
    assert.equal(await response.text(), "proxy search result");
    assert.equal(f.requests[0].url.hostname, "mcp.exa.ai");
    assert.equal(f.requests[0].body?.toString(), '{"query":"proxy test"}');
    const pinned = await new Promise((resolve, reject) =>
      f.requests[0].init.lookup!(
        "mcp.exa.ai",
        { all: true },
        (error, result) => (error ? reject(error) : resolve(result)),
      ),
    );
    assert.deepEqual(pinned, [{ address: "104.18.6.160", family: 4 }]);
  }
  assert.deepEqual(verified, ["mcp.exa.ai", "mcp.exa.ai"]);
  const direct = fixture([{}], {
    lookupPublic: async () => assert.fail("ordinary DNS must not use DoH"),
  });
  await direct.fetch("https://example.com/");
});

test("the production Fake-IP path bootstraps bounded DoH requests and connects only to the real public target", async (t) => {
  const dns = fixture([
    {
      body: JSON.stringify({
        Status: 0,
        Answer: [{ type: 1, data: "104.18.6.160" }],
      }),
    },
    { body: JSON.stringify({ Status: 0 }) },
  ]);
  const target = fixture([{ body: "real search response" }]);
  const request: WebRequestFactory = (url, init, callback) =>
    (url.hostname === "cloudflare-dns.com" ? dns : target).request(
      url,
      init,
      callback,
    );
  const network = t.mock.method(
    https,
    "request",
    request as typeof https.request,
  );
  syncBuiltinESMExports();
  try {
    const fetch = createPublicFetch({
      lookup: async () => [{ address: "198.18.0.75", family: 4 }],
    });
    const response = await fetch("https://mcp.exa.ai/mcp", {
      method: "POST",
      body: '{"query":"test"}',
      headers: { "x-api-key": "private-key" },
    });
    assert.equal(await response.text(), "real search response");
    assert.equal(dns.requests.length, 2);
    assert.equal(target.requests.length, 1);
    for (const record of [...dns.requests, ...target.requests]) {
      const address = await new Promise((resolve, reject) =>
        record.init.lookup!(
          record.url.hostname,
          { all: true },
          (error, result) => (error ? reject(error) : resolve(result)),
        ),
      );
      const isDns = record.url.hostname === "cloudflare-dns.com";
      assert.deepEqual(address, [
        { address: isDns ? "1.1.1.1" : "104.18.6.160", family: 4 },
      ]);
      if (isDns) {
        assert.equal(record.url.searchParams.get("name"), "mcp.exa.ai");
        assert.equal(record.init.method, "GET");
        assert.equal(record.body, undefined);
        assert.equal(
          (record.init.headers as Record<string, string>)["x-api-key"],
          undefined,
        );
      }
    }
  } finally {
    network.mock.restore();
    syncBuiltinESMExports();
  }
});

test("Fake-IP fallback never permits real internal targets, mixed answers or unverifiable DNS", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "198.18.0.1",
    "198.19.0.1",
    "198.51.100.1",
    "::1",
    "fc00::1",
    "::ffff:127.0.0.1",
  ]) {
    const f = fixture([], {
      lookup: async () => [{ address: "198.18.0.75", family: 4 }],
      lookupPublic: async () => [
        { address: "93.184.216.34", family: 4 },
        { address, family: address.includes(":") ? 6 : 4 },
      ],
    });
    await assert.rejects(f.fetch("https://target.example/"), /非公共地址/);
    assert.equal(f.requests.length, 0, address);
  }
  for (const address of ["127.0.0.1", "192.168.1.1"]) {
    const mixed = fixture([], {
      lookup: async () => [
        { address: "198.18.0.75", family: 4 },
        { address, family: 4 },
      ],
      lookupPublic: async () => assert.fail("must reject mixed internal DNS"),
    });
    await assert.rejects(mixed.fetch("https://example.com/"), /非公共地址/);
    assert.equal(mixed.requests.length, 0);
  }
  for (const lookupPublic of [
    async () => [],
    async () => [{ address: "93.184.216.34", family: 6 }],
    async () => {
      throw new Error("resolver unavailable");
    },
  ]) {
    const f = fixture([], {
      lookup: async () => [{ address: "198.18.0.75", family: 4 }],
      lookupPublic,
    });
    await assert.rejects(
      f.fetch("https://example.com/"),
      /非公共地址|DNS 校验失败/,
    );
    assert.equal(f.requests.length, 0);
  }
});

test("Fake-IP redirects revalidate real DNS and never connect to an internal or rebound target", async () => {
  for (const location of [
    "http://127.0.0.1/",
    "http://192.168.1.1/",
    "http://198.18.0.75/",
    "http://router.local/",
    "https://internal.example/",
    "/rebound",
  ]) {
    let resolutions = 0;
    const f = fixture([{ status: 302, headers: { location } }], {
      lookup: async () => [{ address: "198.18.0.75", family: 4 }],
      lookupPublic: async () => [
        {
          address: resolutions++ === 0 ? "93.184.216.34" : "192.168.1.1",
          family: 4,
        },
      ],
    });
    await assert.rejects(
      f.fetch("https://example.com/"),
      /公共互联网|非公共地址/,
    );
    assert.equal(f.requests.length, 1, location);
  }
});

test("Fake-IP public DNS verification honors cancellation and the request timeout", async () => {
  for (const cancel of [false, true]) {
    const controller = new AbortController();
    const f = fixture([], {
      timeoutMs: cancel ? 30_000 : 10,
      lookup: async () => [{ address: "198.18.0.75", family: 4 }],
      lookupPublic: (_host, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
          if (cancel) controller.abort();
        }),
    });
    await assert.rejects(
      f.fetch("https://example.com/", { signal: controller.signal }),
      (error: Error) => error.name === (cancel ? "AbortError" : "TimeoutError"),
    );
    assert.equal(f.requests.length, 0);
  }
});

test("publicFetch accepts global IPv6 directly", async () => {
  const f = fixture([{}]);
  await f.fetch("https://[2606:4700:4700::1111]/");
  assert.equal(f.hosts.length, 0);
  assert.equal(f.requests.length, 1);
});

test("manual redirects stay manual; follow validates each new target and limits hops", async () => {
  const manual = fixture([{ status: 302, headers: { location: "/article" } }]);
  const manualResult = await manual.fetch("https://example.com/start", {
    redirect: "manual",
  });
  assert.equal(manualResult.status, 302);
  assert.equal(manualResult.headers.get("location"), "/article");
  assert.equal(manual.requests.length, 1);
  const follow = fixture([
    { status: 302, headers: { location: "/article" } },
    { body: "final" },
  ]);
  const result = await follow.fetch("https://example.com/start");
  assert.equal(result.url, "https://example.com/article");
  assert.equal(result.redirected, true);
  assert.equal(await result.text(), "final");
  assert.equal(follow.hosts.length, 2);
  const blocked = fixture([
    { status: 302, headers: { location: "http://169.254.169.254/" } },
  ]);
  await assert.rejects(blocked.fetch("https://example.com/"), /公共互联网/);
  assert.equal(blocked.requests.length, 1);
  const rebind = fixture([{ status: 302, headers: { location: "/next" } }], {
    lookup: async () => [
      {
        address: rebind.requests.length ? "127.0.0.1" : "93.184.216.34",
        family: 4,
      },
    ],
  });
  await assert.rejects(rebind.fetch("https://example.com/"), /非公共地址/);
  assert.equal(rebind.requests.length, 1);
  const loop = fixture(
    Array.from({ length: 4 }, () => ({
      status: 302,
      headers: { location: "/again" },
    })),
  );
  await assert.rejects(loop.fetch("https://example.com/"), /超过 3 次/);
  assert.equal(loop.requests.length, 4);
});

test("JSON POST reaches its intended provider and cross-origin redirects strip every private header", async () => {
  const f = fixture([
    { status: 302, headers: { location: "https://other.example/destination" } },
    { body: "{}", headers: { "content-type": "application/json" } },
  ]);
  const body = JSON.stringify({ query: "search terms" });
  const result = await f.fetch("https://api.exa.ai/search", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "x-api-key": "secret-key",
      authorization: "Bearer secret",
      "x-custom-secret": "also secret",
      cookie: "session=secret",
      host: "localhost",
      accept: "application/json",
    },
  });
  assert.equal(await result.text(), "{}");
  assert.equal(f.requests[0].body?.toString(), body);
  assert.equal(f.requests[0].init.method, "POST");
  const first = f.requests[0].init.headers as Record<string, string>;
  assert.equal(first["x-api-key"], "secret-key");
  assert.equal(first.cookie, undefined);
  assert.equal(first.host, undefined);
  const second = f.requests[1].init.headers as Record<string, string>;
  assert.equal(f.requests[1].init.method, "GET");
  assert.equal(f.requests[1].body, undefined);
  assert.equal(second["x-api-key"], undefined);
  assert.equal(second.authorization, undefined);
  assert.equal(second["x-custom-secret"], undefined);
  assert.equal(second.accept, "application/json");
});

test("307/308 never replay a POST body cross-origin but retain it on the same origin", async () => {
  for (const status of [307, 308]) {
    const blocked = fixture([
      { status, headers: { location: "https://attacker.example/" } },
    ]);
    await assert.rejects(
      blocked.fetch("https://api.exa.ai/search", {
        method: "POST",
        body: '{"key":"secret"}',
      }),
      /跨站重定向/,
    );
    assert.equal(blocked.requests.length, 1);
    const same = fixture([
      { status, headers: { location: "/next" } },
      { body: "done" },
    ]);
    await same.fetch("https://api.exa.ai/search", {
      method: "POST",
      body: "json",
      headers: { "x-api-key": "secret" },
    });
    assert.equal(same.requests[1].body?.toString(), "json");
    assert.equal(
      (same.requests[1].init.headers as Record<string, string>)["x-api-key"],
      "secret",
    );
  }
});

test("publicFetch bounds declared, streamed, decompressed response and request bytes", async () => {
  for (const reply of [
    { headers: { "content-length": "200" } },
    { body: [Buffer.alloc(64), Buffer.alloc(64)] },
    {
      headers: { "content-encoding": "gzip" },
      body: gzipSync(Buffer.alloc(1000)),
    },
  ]) {
    const f = fixture([reply], { maxBytes: 100 });
    await assert.rejects(f.fetch("https://example.com/"), /大小限制/);
  }
  const valid = fixture([
    {
      headers: { "content-encoding": "gzip" },
      body: gzipSync("compressed page"),
    },
  ]);
  const decoded = await valid.fetch("https://example.com/");
  assert.equal(await decoded.text(), "compressed page");
  assert.equal(decoded.headers.get("content-encoding"), null);
  const post = fixture([], { maxRequestBytes: 5 });
  await assert.rejects(
    post.fetch("https://api.exa.ai/search", {
      method: "POST",
      body: "too long",
    }),
    /过大/,
  );
  assert.equal(post.requests.length, 0);
});

test("publicFetch cancellation and total timeouts cover DNS and stalled responses", async () => {
  const controller = new AbortController();
  controller.abort();
  const aborted = fixture([]);
  await assert.rejects(
    aborted.fetch("https://example.com/", { signal: controller.signal }),
    (error: Error) => error.name === "AbortError",
  );
  assert.equal(aborted.requests.length, 0);
  const dns = fixture([], {
    timeoutMs: 10,
    lookup: () => new Promise(() => {}),
  });
  await assert.rejects(
    dns.fetch("https://example.com/"),
    (error: Error) => error.name === "TimeoutError",
  );
  assert.equal(dns.requests.length, 0);
  const stall = fixture([{ stall: true }], { timeoutMs: 10 });
  await assert.rejects(
    stall.fetch("https://example.com/"),
    (error: Error) => error.name === "TimeoutError",
  );
  const later = new AbortController();
  const running = fixture([{ stall: true }]);
  const request = running.fetch("https://example.com/", {
    signal: later.signal,
  });
  setTimeout(() => later.abort(), 5);
  await assert.rejects(request, (error: Error) => error.name === "AbortError");
});

test("transport errors never reveal request API keys", async () => {
  const f = fixture([{ error: new Error("failed x-api-key: top-secret") }]);
  await assert.rejects(
    f.fetch("https://api.exa.ai/search", {
      headers: { "x-api-key": "top-secret" },
    }),
    (error: Error) => {
      assert.doesNotMatch(error.message, /top-secret/);
      return true;
    },
  );
});
