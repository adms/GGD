/**
 * client-content-boot / client-content-fallback: the client boot loads the FULL
 * content set over HTTP into the sim + content registries (mirroring the shared
 * loader.test.ts but through a mocked HttpContentSource), and falls back to the
 * sela/thorne skeleton when the mount is unreachable.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { HttpContentSource } from "@ggd/shared/content";
import {
  Arenas,
  Configs,
  Models,
  StatusEffects,
  VfxDefs,
} from "@ggd/shared/content";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
} from "@ggd/shared/sim/content/registry";
import type { AbilityId, ChampionId } from "@ggd/shared/ids";
import {
  loadAllContent,
  ensureContentLoaded,
  __resetContentBoot,
  isContentReady,
  getContentBootSnapshot,
  subscribeContentBoot,
} from "./bootContent";

// ---- a minimal, self-consistent content set (1 champion, 4 abilities, 1 model) ----
const HASH = "aaaaaaaaaaaa";
const ability = (slot: "Q" | "W" | "E" | "R") => ({
  id: `mockchamp.${slot.toLowerCase()}`,
  name: `Mock ${slot}`,
  slot,
  castType: "self" as const,
  maxRank: 5,
  cooldown: [5],
  manaCost: [50],
  range: 0,
  effects: [],
});
const CHAMPION = {
  id: "mockchamp",
  schema: "champion@1",
  name: "模擬英雄",
  role: "mage",
  attackType: "ranged",
  modelKey: "mock.model",
  baseStats: { ms: 6.5, maxHealth: 500 },
  growth: {},
  abilities: { Q: ability("Q"), W: ability("W"), E: ability("E"), R: ability("R") },
  skillOrder: ["Q", "W", "E", "R"],
  buildPriority: [],
  tags: ["mock"],
};
const MODEL = {
  id: "mock.model",
  schema: "model@1",
  glbPath: "assets/models/mock.glb",
  scale: 1,
  collisionRadius: 0.5,
  clipMap: { idle: "Idle", run: "Run", attack: "Atk", cast: "Cast", hurt: "Hurt", death: "Die" },
};
const idx = (collection: string, entries: { id: string; path: string }[]) => ({
  collection,
  hash: HASH,
  entries: entries.map((e) => ({ ...e, hash: HASH, size: 1 })),
});

const FILES: Record<string, unknown> = {
  "/content/manifest.json": {
    contentVersion: "cv_test00000000",
    collections: {
      champions: { hash: HASH, count: 1, path: "champions/_index.json" },
      abilities: { hash: HASH, count: 4, path: "abilities/_index.json" },
      models: { hash: HASH, count: 1, path: "models/_index.json" },
    },
  },
  "/content/champions/_index.json": idx("champions", [{ id: "mockchamp", path: "champions/mockchamp.json" }]),
  "/content/champions/mockchamp.json": CHAMPION,
  "/content/abilities/_index.json": idx(
    "abilities",
    (["q", "w", "e", "r"] as const).map((s) => ({ id: `mockchamp.${s}`, path: `abilities/mockchamp.${s}.json` })),
  ),
  "/content/abilities/mockchamp.q.json": { ...ability("Q"), schema: "ability@1" },
  "/content/abilities/mockchamp.w.json": { ...ability("W"), schema: "ability@1" },
  "/content/abilities/mockchamp.e.json": { ...ability("E"), schema: "ability@1" },
  "/content/abilities/mockchamp.r.json": { ...ability("R"), schema: "ability@1" },
  "/content/models/_index.json": idx("models", [{ id: "mock.model", path: "models/mock.model.json" }]),
  "/content/models/mock.model.json": MODEL,
};

/** fetch-like that serves FILES by pathname (ignores the ?h=<hash> cache-bust). */
function mockFetch(files: Record<string, unknown>): typeof fetch {
  return ((input: unknown) => {
    const url = String(input).split("?")[0]!;
    const body = files[url];
    if (body === undefined) return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  }) as unknown as typeof fetch;
}

function clearRegistries(): void {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
}

beforeEach(() => {
  clearRegistries();
  __resetContentBoot();
});

describe("content boot", () => {
  it("loads the full set over HTTP and populates the registries", async () => {
    cover("client-content-boot");
    const source = new HttpContentSource({ baseUrl: "/content", fetchFn: mockFetch(FILES) });
    const res = await loadAllContent({ source });

    expect(res.ok).toBe(true);
    expect(res.contentVersion).toBe("cv_test00000000");
    expect(res.championCount).toBe(1);
    // a champion get() works (selectable + predictable), abilities + model too
    expect(Champions.get("mockchamp" as ChampionId).name).toBe("模擬英雄");
    expect(Abilities.get("mockchamp.q" as AbilityId).slot).toBe("Q");
    expect(Models.get("mock.model").glbPath).toBe("assets/models/mock.glb");
  });

  it("falls back to the sela/thorne skeleton when the mount is unreachable", async () => {
    cover("client-content-fallback");
    // manifest 404s → ContentLoader throws → fallback path runs
    const source = new HttpContentSource({ baseUrl: "/content", fetchFn: mockFetch({}) });
    const res = await loadAllContent({ source });

    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
    expect(Champions.tryGet("sela" as ChampionId)).toBeTruthy();
    expect(Champions.tryGet("thorne" as ChampionId)).toBeTruthy();
    expect(res.championCount).toBeGreaterThanOrEqual(2);
  });

  it("readiness signal: loading until the background load settles, then ready (non-blocking)", async () => {
    cover("client-content-boot");
    // At boot the shell paints while content is still loading — the signal must
    // start "loading" so nothing gates first paint on it.
    expect(getContentBootSnapshot().phase).toBe("loading");
    expect(getContentBootSnapshot().result).toBeNull();
    expect(isContentReady()).toBe(false);

    let notified = 0;
    const unsub = subscribeContentBoot(() => {
      notified++;
    });

    const source = new HttpContentSource({ baseUrl: "/content", fetchFn: mockFetch(FILES) });
    const p = ensureContentLoaded({ source });
    // fire-and-track: kicking the load off does NOT synchronously flip readiness
    // (the caller renders the app shell immediately, without awaiting).
    expect(isContentReady()).toBe(false);

    const res = await p;
    expect(res.ok).toBe(true);
    expect(isContentReady()).toBe(true);
    expect(getContentBootSnapshot().phase).toBe("ready");
    expect(getContentBootSnapshot().result).toBe(res);
    expect(notified).toBeGreaterThanOrEqual(1);
    unsub();
  });

  it("readiness signal: skeleton fallback still flips ready (registry usable)", async () => {
    cover("client-content-fallback");
    // mount unreachable → skeleton fallback → still "ready" so the match-start
    // gate can proceed (the game boots on the sela/thorne skeleton).
    const source = new HttpContentSource({ baseUrl: "/content", fetchFn: mockFetch({}) });
    const res = await ensureContentLoaded({ source });
    expect(res.ok).toBe(false);
    expect(isContentReady()).toBe(true);
    expect(getContentBootSnapshot().result?.ok).toBe(false);
  });

  it("__resetContentBoot returns the signal to loading (test isolation)", async () => {
    cover("client-content-boot");
    await ensureContentLoaded({ source: new HttpContentSource({ baseUrl: "/content", fetchFn: mockFetch(FILES) }) });
    expect(isContentReady()).toBe(true);
    __resetContentBoot();
    expect(isContentReady()).toBe(false);
    expect(getContentBootSnapshot().phase).toBe("loading");
  });

  it("ensureContentLoaded is single-flight (loads once)", async () => {
    cover("client-content-boot");
    let calls = 0;
    const counting = mockFetch(FILES);
    const fetchFn = ((input: unknown) => {
      calls++;
      return counting(input as string);
    }) as unknown as typeof fetch;
    const source = new HttpContentSource({ baseUrl: "/content", fetchFn });

    const [a, b] = await Promise.all([
      ensureContentLoaded({ source }),
      ensureContentLoaded({ source }),
    ]);
    expect(a).toBe(b); // same result object → the load ran exactly once
    const after = calls;
    await ensureContentLoaded({ source });
    expect(calls).toBe(after); // a later call re-uses the cached promise
  });
});

/**
 * The transport change (Item 4): boot fetches ONE /content/bundle.json instead
 * of 1 manifest + 12 `_index.json` + 1,441 docs. These tests drive the REAL
 * production wiring — no injected ContentSource — by stubbing global fetch, so
 * they exercise exactly what main.tsx runs.
 */
describe("content boot — one-request bundle transport", () => {
  /** the same mock content set, expressed as a bundle */
  const BUNDLE = {
    schema: "content-bundle@1",
    contentVersion: "cv_test00000000",
    collections: {
      champions: { hash: HASH, entries: [{ id: "mockchamp", hash: HASH, doc: CHAMPION }] },
      abilities: {
        hash: HASH,
        entries: (["q", "w", "e", "r"] as const).map((s) => ({
          id: `mockchamp.${s}`,
          hash: HASH,
          doc: { ...ability(s.toUpperCase() as "Q" | "W" | "E" | "R"), schema: "ability@1" },
        })),
      },
      models: { hash: HASH, entries: [{ id: "mock.model", hash: HASH, doc: MODEL }] },
    },
  };

  /** global-fetch stub: serves the bundle (or not) plus the per-doc FILES. */
  function stubGlobalFetch(bundleBody: string | null, status = 200): { calls: string[] } {
    const calls: string[] = [];
    const perDoc = mockFetch(FILES);
    globalThis.fetch = ((input: unknown, init?: unknown) => {
      const url = String(input);
      calls.push(url);
      if (url.split("?")[0] === "/content/bundle.json") {
        return Promise.resolve({
          ok: status >= 200 && status < 300,
          status,
          text: async () => bundleBody ?? "",
          json: async () => JSON.parse(bundleBody ?? "null") as unknown,
        } as unknown as Response);
      }
      return (perDoc as unknown as (i: unknown, x?: unknown) => Promise<Response>)(input, init);
    }) as unknown as typeof fetch;
    return { calls };
  }

  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("hydrates the registries from the bundle in exactly ONE request", async () => {
    cover("client-content-boot");
    const { calls } = stubGlobalFetch(JSON.stringify(BUNDLE));
    const res = await loadAllContent();

    expect(res.ok).toBe(true);
    expect(res.transport).toBe("bundle");
    expect(res.contentVersion).toBe("cv_test00000000");
    expect(calls).toEqual(["/content/bundle.json"]);
    // ...and the SAME registry state the per-doc path produces
    expect(Champions.get("mockchamp" as ChampionId).name).toBe("模擬英雄");
    expect(Abilities.get("mockchamp.q" as AbilityId).slot).toBe("Q");
    expect(Models.get("mock.model").glbPath).toBe("assets/models/mock.glb");
  });

  it("bundle and per-doc hydrate IDENTICAL registry state", async () => {
    cover("client-content-boot");
    const snapshot = () => ({
      champions: Champions.ids().slice().sort(),
      abilities: Abilities.ids().slice().sort(),
      models: Models.ids().slice().sort(),
      champion: JSON.stringify(Champions.get("mockchamp" as ChampionId)),
      abilityQ: JSON.stringify(Abilities.get("mockchamp.q" as AbilityId)),
      model: JSON.stringify(Models.get("mock.model")),
    });

    stubGlobalFetch(JSON.stringify(BUNDLE));
    const viaBundle = await loadAllContent();
    const fromBundle = snapshot();

    clearRegistries();
    __resetContentBoot();

    // force the legacy path through the very same public entry point
    stubGlobalFetch(null, 404);
    const viaPerDoc = await loadAllContent({ disableBundle: true });
    const fromPerDoc = snapshot();

    expect(viaBundle.ok).toBe(true);
    expect(viaPerDoc.ok).toBe(true);
    expect(viaPerDoc.transport).toBe("per-doc");
    expect(fromBundle).toEqual(fromPerDoc);
    expect(viaBundle.contentVersion).toBe(viaPerDoc.contentVersion);
  });

  it("a 404 bundle falls back to per-doc fetching — a stale deploy cannot brick the client", async () => {
    cover("client-content-fallback");
    const { calls } = stubGlobalFetch(null, 404);
    const res = await loadAllContent();

    expect(res.ok).toBe(true); // NOT the skeleton fallback — the full set loaded
    expect(res.transport).toBe("per-doc");
    expect(res.transportReason).toMatch(/404/);
    expect(calls[0]).toBe("/content/bundle.json");
    expect(calls.length).toBeGreaterThan(1); // it really went back to per-doc
    expect(Champions.get("mockchamp" as ChampionId).name).toBe("模擬英雄");
  });

  it("a CORRUPT bundle also falls back (parse failure, not just HTTP status)", async () => {
    cover("client-content-fallback");
    // truncated body: a status-only check would sail past this and take the
    // whole content set down with it.
    stubGlobalFetch(JSON.stringify(BUNDLE).slice(0, -10));
    const corrupt = await loadAllContent();
    expect(corrupt.ok).toBe(true);
    expect(corrupt.transport).toBe("per-doc");
    expect(Champions.get("mockchamp" as ChampionId).name).toBe("模擬英雄");
  });

  it("valid JSON of the wrong shape also falls back", async () => {
    cover("client-content-fallback");
    stubGlobalFetch(JSON.stringify({ hello: "world" }));
    const res = await loadAllContent();
    expect(res.ok).toBe(true);
    expect(res.transport).toBe("per-doc");
    expect(res.transportReason).toMatch(/schema/);
    expect(Champions.get("mockchamp" as ChampionId).name).toBe("模擬英雄");
  });

  it("when BOTH transports are gone, it still degrades (never throws)", async () => {
    cover("client-content-fallback");
    globalThis.fetch = (() =>
      Promise.resolve({
        ok: false,
        status: 404,
        text: async () => "",
        json: async () => ({}),
      } as unknown as Response)) as unknown as typeof fetch;
    const res = await loadAllContent();
    // the skeleton fallback path — registerSkeletonContent() is latched
    // module-wide, so assert the CONTRACT (never throws, reports the failure)
    // rather than re-asserting sela/thorne, which the test above already owns.
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
    expect(res.transportReason).toMatch(/404/);
  });
});
