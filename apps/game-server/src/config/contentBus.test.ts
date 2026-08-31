/**
 * The content bus (config/contentBus.ts): an admin edit reaching a RUNNING
 * shard without a restart.
 *
 * Every test here drives the REAL subscriber over a REAL socket against a fake
 * Redis, and refreshes through the REAL fetch path (fetchWhitelistResult /
 * fetchCombatEnvResult) with only the HTTP layer stubbed. The one thing that is
 * never stubbed is the thing under test: the announcement → re-fetch → record
 * chain.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server, type Socket } from "node:net";
import {
  ContentBus,
  CONTENT_CHANNEL,
  BUS_DEGRADE_KEY,
  refreshDegradeKey,
  contentBusEnabled,
  parseRedisAddr,
  contentBusStatus,
  platformStatusWithContent,
  CONTENT_KINDS,
} from "./contentBus";
import { WhitelistCache, type WhitelistDoc } from "../curation/whitelist";
import { CombatEnvCache } from "./combatEnv";
import { resetWarnOnce, hasWarned, degradations } from "./platformUrl";

// ---------------------------------------------------------------- fixtures --

interface FakeRedis {
  port: number;
  publish(channel: string, payload: string): void;
  close(): Promise<void>;
}

async function startFakeRedis(): Promise<FakeRedis> {
  const sockets = new Set<Socket>();
  const server: Server = createServer((sock) => {
    sockets.add(sock);
    sock.on("error", () => {});
    sock.on("close", () => sockets.delete(sock));
    sock.on("data", (chunk) => {
      const m = /\$9\r\nSUBSCRIBE\r\n\$\d+\r\n([^\r]+)\r\n/i.exec(chunk.toString("utf8"));
      if (m?.[1]) {
        const ch = m[1];
        sock.write(`*3\r\n$9\r\nsubscribe\r\n$${Buffer.byteLength(ch)}\r\n${ch}\r\n:1\r\n`);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  return {
    port: typeof addr === "object" && addr ? addr.port : 0,
    publish(channel, payload) {
      const frame =
        `*3\r\n$7\r\nmessage\r\n$${Buffer.byteLength(channel)}\r\n${channel}\r\n` +
        `$${Buffer.byteLength(payload)}\r\n${payload}\r\n`;
      for (const s of sockets) s.write(frame);
    },
    close() {
      for (const s of sockets) s.destroy();
      sockets.clear();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

const waitFor = async (pred: () => boolean, ms = 4_000): Promise<void> => {
  const deadline = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 5));
  }
};

const wlDoc = (champions: string[], updatedAt = "2026-07-24T09:00:00Z"): WhitelistDoc => ({
  version: 1,
  updatedAt,
  champions,
  items: [],
  abilities: [],
});

/** A stub `fetch` whose body/status the test flips between calls. */
function stubFetch() {
  const state = { body: {} as unknown, status: 200, calls: 0, fail: false };
  const impl = (async () => {
    state.calls += 1;
    if (state.fail) throw new Error("ECONNREFUSED (stub)");
    return {
      ok: state.status >= 200 && state.status < 300,
      status: state.status,
      json: async () => state.body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { state, impl };
}

const buses: ContentBus[] = [];
const servers: FakeRedis[] = [];

beforeEach(() => resetWarnOnce());
afterEach(async () => {
  for (const b of buses.splice(0)) b.stop();
  for (const s of servers.splice(0)) await s.close();
  resetWarnOnce();
});

// -------------------------------------------------- publish → refetch → apply

describe("publish → subscribe → refetch", () => {
  it("an announcement makes a RUNNING shard re-read the whitelist", async () => {
    const fake = await startFakeRedis();
    servers.push(fake);
    const { state, impl } = stubFetch();
    state.body = wlDoc(["sela"]);

    const cache = new WhitelistCache("http://platform.test", 60_000, {
      fetchImpl: impl,
      bypass: false,
    });
    const bus = new ContentBus({
      host: "127.0.0.1",
      port: fake.port,
      log: () => {},
      refreshers: {
        curation: {
          run: async () => {
            const r = await cache.refresh();
            return { ok: r.ok, updatedAt: r.updatedAt };
          },
          consequence: "test",
        },
      },
    });
    buses.push(bus);
    bus.start();
    await waitFor(() => bus.state === "subscribed");

    // The shard has resolved the OLD whitelist and cached it for 60s. Before
    // the bus, this value could not change until that TTL expired.
    expect((await cache.get()).snapshotChampions()).toEqual(["sela"]);
    expect(state.calls).toBe(1);

    // The operator enables a second champion in the 後台 console.
    state.body = wlDoc(["sela", "thorne"], "2026-07-24T09:31:04Z");
    fake.publish(
      CONTENT_CHANNEL,
      JSON.stringify({ kind: "curation", version: "9f2ca1b0d3e4", updatedAt: "2026-07-24T09:31:04Z" }),
    );

    await waitFor(() => bus.status().documents.curation.refreshes === 1);
    // No restart, no TTL expiry, no match created: the shard already has it.
    expect((await cache.get()).snapshotChampions()).toEqual(["sela", "thorne"]);
    expect(state.calls).toBe(2);

    const st = bus.status().documents.curation;
    expect(st.announcedVersion).toBe("9f2ca1b0d3e4");
    expect(st.appliedVersion).toBe("9f2ca1b0d3e4");
    expect(st.stale).toBe(false);
    expect(st.lastRefreshAt).toBeTruthy();
    expect(st.documentUpdatedAt).toBe("2026-07-24T09:31:04Z");
  });

  it("routes each kind to its OWN document and leaves the others alone", async () => {
    const fake = await startFakeRedis();
    servers.push(fake);
    const wl = stubFetch();
    wl.state.body = wlDoc(["sela"]);
    const ce = stubFetch();
    ce.state.body = { multipliers: { damageDealt: 1 } };

    const wlCache = new WhitelistCache("http://p.test", 60_000, { fetchImpl: wl.impl, bypass: false });
    const ceCache = new CombatEnvCache("http://p.test", 60_000, {
      fetchImpl: ce.impl,
      bypass: false,
      contentDefaults: {},
    });
    const bus = new ContentBus({
      host: "127.0.0.1",
      port: fake.port,
      log: () => {},
      refreshers: {
        curation: { run: async () => ({ ok: (await wlCache.refresh()).ok }), consequence: "t" },
        "combat-env": { run: async () => ({ ok: (await ceCache.refresh()).ok }), consequence: "t" },
      },
    });
    buses.push(bus);
    bus.start();
    await waitFor(() => bus.state === "subscribed");
    await wlCache.get();
    await ceCache.get();
    const wlCallsBefore = wl.state.calls;

    ce.state.body = { multipliers: { damageDealt: 0.5 } };
    fake.publish(CONTENT_CHANNEL, JSON.stringify({ kind: "combat-env", version: "aaaaaaaaaaaa" }));
    await waitFor(() => bus.status().documents["combat-env"].refreshes === 1);

    expect((await ceCache.get()).damageDealt).toBeCloseTo(0.5);
    expect(wl.state.calls).toBe(wlCallsBefore); // curation was NOT re-fetched
    expect(bus.status().documents.curation.refreshes).toBe(0);
  });

  it("COALESCES a burst so overlapping fetches cannot mis-stamp the version", async () => {
    // Two announcements land while a refresh is in flight. If both fetched
    // concurrently, the loser could complete last and stamp an OLD document
    // with the NEWEST version — /healthz would read "converged" while the
    // shard held stale content. Coalescing makes the final fetch start after
    // the final announcement, always.
    const fake = await startFakeRedis();
    servers.push(fake);
    let inFlight = 0;
    let maxConcurrent = 0;
    let runs = 0;
    let served = "v1";
    let lastSeen = "";

    const bus = new ContentBus({
      host: "127.0.0.1",
      port: fake.port,
      log: () => {},
      refreshers: {
        curation: {
          run: async () => {
            inFlight += 1;
            maxConcurrent = Math.max(maxConcurrent, inFlight);
            runs += 1;
            await new Promise((r) => setTimeout(r, 40));
            lastSeen = served;
            inFlight -= 1;
            return { ok: true };
          },
          consequence: "t",
        },
      },
    });
    buses.push(bus);
    bus.start();
    await waitFor(() => bus.state === "subscribed");

    fake.publish(CONTENT_CHANNEL, JSON.stringify({ kind: "curation", version: "v1" }));
    await new Promise((r) => setTimeout(r, 5));
    served = "v2";
    fake.publish(CONTENT_CHANNEL, JSON.stringify({ kind: "curation", version: "v2" }));
    served = "v3";
    fake.publish(CONTENT_CHANNEL, JSON.stringify({ kind: "curation", version: "v3" }));

    await waitFor(() => bus.status().documents.curation.appliedVersion === "v3");
    expect(maxConcurrent).toBe(1);
    expect(runs).toBeLessThanOrEqual(3); // three announcements, at most two fetches
    expect(lastSeen).toBe("v3"); // the winning fetch read the NEWEST document
    expect(bus.status().documents.curation.stale).toBe(false);
  });
});

// ------------------------------------------------------------- degradation --

describe("a failed refresh is LOUD, and never reverts good content", () => {
  it("records the failure, marks the document stale, and files a degradation", async () => {
    const fake = await startFakeRedis();
    servers.push(fake);
    const { state, impl } = stubFetch();
    state.body = wlDoc(["sela", "thorne"]);

    const cache = new WhitelistCache("http://p.test", 60_000, { fetchImpl: impl, bypass: false });
    const bus = new ContentBus({
      host: "127.0.0.1",
      port: fake.port,
      log: () => {},
      refreshers: {
        curation: { run: async () => ({ ok: (await cache.refresh()).ok }), consequence: "test" },
      },
    });
    buses.push(bus);
    bus.start();
    await waitFor(() => bus.state === "subscribed");
    await cache.get(); // establish a known-good whitelist

    // The platform goes down between the operator's Save and our re-fetch.
    state.fail = true;
    fake.publish(CONTENT_CHANNEL, JSON.stringify({ kind: "curation", version: "beefbeefbeef" }));
    await waitFor(() => bus.status().documents.curation.failures === 1);

    const st = bus.status().documents.curation;
    expect(st.lastRefreshOk).toBe(false);
    expect(st.stale).toBe(true); // "your change did NOT land, and here is why"
    expect(st.appliedVersion).toBe("");
    expect(st.announcedVersion).toBe("beefbeefbeef");
    expect(st.lastError).toBeTruthy();

    // Filed in the SAME registry a failed boot fetch uses, so /healthz shows it.
    expect(hasWarned(refreshDegradeKey("curation"))).toBe(true);
    expect(degradations().some((d) => d.key === refreshDegradeKey("curation"))).toBe(true);
  });

  it("A FAILED REFRESH KEEPS THE LAST KNOWN GOOD — it must not fall to allow-all", async () => {
    // The security-shaped case: an invalidation arriving while the platform is
    // unreachable must not switch content filtering OFF for every later match.
    const { state, impl } = stubFetch();
    state.body = wlDoc(["sela"]);
    const cache = new WhitelistCache("http://p.test", 60_000, { fetchImpl: impl, bypass: false });

    const good = await cache.get();
    expect(good.bypass).toBe(false);
    expect(good.allowsChampion("thorne")).toBe(false);

    state.fail = true;
    const result = await cache.refresh();
    expect(result.ok).toBe(false);

    const after = await cache.get();
    expect(after.bypass).toBe(false); // NOT allow-all
    expect(after.snapshotChampions()).toEqual(["sela"]);
    expect(after.allowsChampion("thorne")).toBe(false);
  });

  it("a process that never had a good answer still fails SAFE", async () => {
    // No last-known-good to hold on to: the documented allow-all fail-safe
    // stands, because bricking every match is worse than not filtering.
    const { state, impl } = stubFetch();
    state.fail = true;
    const cache = new WhitelistCache("http://p.test", 60_000, { fetchImpl: impl, bypass: false });
    const r = await cache.refresh();
    expect(r.ok).toBe(false);
    expect(r.whitelist.bypass).toBe(true);
  });

  it("recovery RETRACTS the degradation instead of staying red forever", async () => {
    const fake = await startFakeRedis();
    servers.push(fake);
    const { state, impl } = stubFetch();
    state.body = wlDoc(["sela"]);
    const cache = new WhitelistCache("http://p.test", 60_000, { fetchImpl: impl, bypass: false });
    const bus = new ContentBus({
      host: "127.0.0.1",
      port: fake.port,
      log: () => {},
      refreshers: {
        curation: { run: async () => ({ ok: (await cache.refresh()).ok }), consequence: "t" },
      },
    });
    buses.push(bus);
    bus.start();
    await waitFor(() => bus.state === "subscribed");

    state.fail = true;
    fake.publish(CONTENT_CHANNEL, JSON.stringify({ kind: "curation", version: "v1" }));
    await waitFor(() => hasWarned(refreshDegradeKey("curation")));

    state.fail = false;
    state.body = wlDoc(["sela", "thorne"]);
    fake.publish(CONTENT_CHANNEL, JSON.stringify({ kind: "curation", version: "v2" }));
    await waitFor(() => bus.status().documents.curation.appliedVersion === "v2");

    expect(hasWarned(refreshDegradeKey("curation"))).toBe(false);
    expect(bus.status().documents.curation.stale).toBe(false);
  });
});

// ------------------------------------------------------- Redis is OPTIONAL --

describe("Redis is optional (the owner runs this on a laptop)", () => {
  it("NO REDIS: the bus warns exactly once, stays retrying, and never throws", async () => {
    // Port 1 refuses instantly.
    const bus = new ContentBus({ host: "127.0.0.1", port: 1, log: () => {} });
    buses.push(bus);
    expect(() => bus.start()).not.toThrow();

    await waitFor(() => hasWarned(BUS_DEGRADE_KEY));
    const first = degradations().find((d) => d.key === BUS_DEGRADE_KEY)!;
    expect(first.message).toContain("NOT FATAL");
    expect(first.message).toContain("cache TTL");

    // Repeated retries do NOT spam the log; warnOnce counts them instead.
    await waitFor(() => (degradations().find((d) => d.key === BUS_DEGRADE_KEY)?.occurrences ?? 0) > 1);
    expect(degradations().filter((d) => d.key === BUS_DEGRADE_KEY)).toHaveLength(1);

    const st = bus.status();
    expect(st.enabled).toBe(true);
    expect(st.state).toBe("retrying");
    expect(st.lastError).toBeTruthy();
  });

  it("NO REDIS: content still resolves through the ordinary TTL path", async () => {
    // The point of "optional": with the bus down, everything the shard needs
    // still works, exactly as it did before the bus existed.
    const bus = new ContentBus({ host: "127.0.0.1", port: 1, log: () => {} });
    buses.push(bus);
    bus.start();

    const { state, impl } = stubFetch();
    state.body = wlDoc(["sela"]);
    const cache = new WhitelistCache("http://p.test", 1, { fetchImpl: impl, bypass: false });
    expect((await cache.get(1_000)).snapshotChampions()).toEqual(["sela"]);
    state.body = wlDoc(["sela", "thorne"]);
    expect((await cache.get(9_999)).snapshotChampions()).toEqual(["sela", "thorne"]);
  });

  it("GGD_CONTENT_BUS=0 disables it as a CHOICE, not a failure", () => {
    expect(contentBusEnabled({} as NodeJS.ProcessEnv)).toBe(true);
    for (const off of ["0", "off", "false", "no", "OFF"]) {
      expect(contentBusEnabled({ GGD_CONTENT_BUS: off } as NodeJS.ProcessEnv)).toBe(false);
    }
    expect(contentBusEnabled({ GGD_CONTENT_BUS: "1" } as NodeJS.ProcessEnv)).toBe(true);

    // With no bus started, /healthz reports disabled rather than pretending.
    const st = contentBusStatus();
    expect(st.enabled).toBe(false);
    expect(st.state).toBe("disabled");
    // ⭐ 從 `CONTENT_KINDS` 推導，⛔ 不抄一份字面清單 —— 那會是這個值的**第四個住處**
    //   （第零守則：出貨值住在測試裡必然過期，而且會用**錯誤的訊息**紅）。
    //   ⚠️ 實測：2026-08-31 加 `content-overlay` 時，這一行原本的字面清單就是這樣紅的。
    expect(Object.keys(st.documents).sort()).toEqual([...CONTENT_KINDS].sort());
  });

  it("REDIS_ADDR parses the same way the Go platform reads it", () => {
    expect(parseRedisAddr(undefined)).toEqual({ host: "127.0.0.1", port: 6379 });
    expect(parseRedisAddr("")).toEqual({ host: "127.0.0.1", port: 6379 });
    expect(parseRedisAddr("redis:6379")).toEqual({ host: "redis", port: 6379 });
    expect(parseRedisAddr("10.0.0.5:6380")).toEqual({ host: "10.0.0.5", port: 6380 });
    expect(parseRedisAddr("redis")).toEqual({ host: "redis", port: 6379 });
    expect(parseRedisAddr("redis:not-a-port")).toEqual({ host: "redis", port: 6379 });
  });
});

// ------------------------------------------------------------ junk on wire --

describe("junk on the channel cannot break the shard", () => {
  it("ignores non-JSON, unknown kinds and missing fields", async () => {
    const fake = await startFakeRedis();
    servers.push(fake);
    let runs = 0;
    const bus = new ContentBus({
      host: "127.0.0.1",
      port: fake.port,
      log: () => {},
      refreshers: {
        curation: {
          run: async () => {
            runs += 1;
            return { ok: true };
          },
          consequence: "t",
        },
      },
    });
    buses.push(bus);
    bus.start();
    await waitFor(() => bus.state === "subscribed");

    fake.publish(CONTENT_CHANNEL, "not json at all");
    fake.publish(CONTENT_CHANNEL, JSON.stringify({ kind: "some-future-document", version: "x" }));
    fake.publish(CONTENT_CHANNEL, JSON.stringify({ noKind: true }));
    // ...and a real one behind them, to prove the subscription survived.
    fake.publish(CONTENT_CHANNEL, JSON.stringify({ kind: "curation", version: "ok" }));

    await waitFor(() => runs === 1);
    expect(bus.status().unknownKinds).toBe(2); // the future doc + the field-less one
    expect(hasWarned("content-bus-malformed")).toBe(true);
    expect(bus.state).toBe("subscribed");
  });

  it("a version-less announcement still refreshes (it just cannot claim a version)", async () => {
    const fake = await startFakeRedis();
    servers.push(fake);
    let runs = 0;
    const bus = new ContentBus({
      host: "127.0.0.1",
      port: fake.port,
      log: () => {},
      refreshers: {
        curation: {
          run: async () => {
            runs += 1;
            return { ok: true };
          },
          consequence: "t",
        },
      },
    });
    buses.push(bus);
    bus.start();
    await waitFor(() => bus.state === "subscribed");
    fake.publish(CONTENT_CHANNEL, JSON.stringify({ kind: "curation" }));
    await waitFor(() => runs === 1);
    expect(bus.status().documents.curation.stale).toBe(false);
  });
});

// --------------------------------------------------------------- /healthz ---

describe("/healthz answers 'did my change land on the shard?'", () => {
  it("keeps the #48 platform fields AND adds the propagation fields", () => {
    const block = platformStatusWithContent();
    // #48's fields must still be there — this block replaced platformStatus().
    expect(typeof block.url).toBe("string");
    expect(["env", "cluster", "localhost"]).toContain(block.source);
    expect(typeof block.reason).toBe("string");
    expect(typeof block.degraded).toBe("boolean");
    expect(Array.isArray(block.degradations)).toBe(true);
    // ...plus the new content block, with a row per document.
    expect(block.content.channel).toBe(CONTENT_CHANNEL);
    for (const kind of ["curation", "combat-env", "server-ops"] as const) {
      const d = block.content.documents[kind];
      expect(d).toHaveProperty("announcedVersion");
      expect(d).toHaveProperty("appliedVersion");
      expect(d).toHaveProperty("lastRefreshAt");
      expect(d).toHaveProperty("stale");
    }
  });

  it("reports the refresh TIME and the applied VERSION after a real refresh", async () => {
    const fake = await startFakeRedis();
    servers.push(fake);
    let at = new Date("2026-07-24T09:31:04Z");
    const bus = new ContentBus({
      host: "127.0.0.1",
      port: fake.port,
      log: () => {},
      now: () => at,
      refreshers: { curation: { run: async () => ({ ok: true }), consequence: "t" } },
    });
    buses.push(bus);
    bus.start();
    await waitFor(() => bus.state === "subscribed");

    fake.publish(CONTENT_CHANNEL, JSON.stringify({ kind: "curation", version: "9f2ca1b0d3e4" }));
    await waitFor(() => bus.status().documents.curation.refreshes === 1);

    const d = bus.status().documents.curation;
    expect(d.lastRefreshAt).toBe("2026-07-24T09:31:04.000Z");
    expect(d.appliedVersion).toBe("9f2ca1b0d3e4");
    expect(d.refreshes).toBe(1);
    expect(d.failures).toBe(0);
    expect(d.stale).toBe(false);

    at = new Date("2026-07-24T10:00:00Z");
    expect(bus.status().documents.curation.lastRefreshAt).toBe("2026-07-24T09:31:04.000Z");
  });
});
