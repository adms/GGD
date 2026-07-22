/**
 * client-content-boot / client-content-fallback: the client boot loads the FULL
 * content set over HTTP into the sim + content registries (mirroring the shared
 * loader.test.ts but through a mocked HttpContentSource), and falls back to the
 * sela/thorne skeleton when the mount is unreachable.
 */
import { describe, it, expect, beforeEach } from "vitest";
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
import { loadAllContent, ensureContentLoaded, __resetContentBoot } from "./bootContent";

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
