/**
 * ContentDb — the per-match load path.
 *
 * The regression these tests lock is a LOADING one: ContentDb used to re-fetch
 * the `models` and `vfx` collections (507 requests / 516,392 B measured against
 * the real content tree) on EVERY match entry, for documents the shared
 * ContentLoader had already loaded into the registries at boot. It now reads the
 * registries, and the ONLY request it may still make is the one direct-path
 * sidecar that is deliberately excluded from the models index.
 *
 * Test 3 is the one that protects a live bug rather than a byte count: modelFor()
 * must stay null until load() settles, because that null is what stops
 * ChampionView.tryUpgradeToGlb from latching before the per-champion size
 * override (task #77/#150) is resolvable.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HttpContentSource, Arenas, Configs, Models, VfxDefs } from "@ggd/shared/content";
import { Abilities, Champions } from "@ggd/shared/sim/content/registry";
import { ContentDb, contentAssetUrl } from "./ContentDb";
import { ensureContentLoaded, __resetContentBoot } from "./bootContent";

const HASH = "aaaaaaaaaaaa";
const idx = (collection: string, entries: { id: string; path: string }[]) => ({
  collection,
  hash: HASH,
  entries: entries.map((e) => ({ ...e, hash: HASH, size: 1 })),
});

const MODEL = {
  id: "mock.model",
  schema: "model@1",
  glbPath: "assets/models/mock.glb",
  scale: 1,
  collisionRadius: 0.5,
  clipMap: { idle: "Idle", run: "Run", attack: "Atk", cast: "Cast", hurt: "Hurt", death: "Die" },
};
const ARENA = {
  id: "arena.mock",
  schema: "arena@1",
  name: "Mock Arena",
  zones: [
    {
      id: "zone-0",
      center: { x: 0, z: 0 },
      boundaryRadius: 20,
      obstacles: [],
      spawns: [[{ x: -5, z: 0 }], [{ x: 5, z: 0 }]],
    },
  ],
};
const STANDIN = {
  schema: "standin-overrides@2",
  target: 1.8,
  overrides: { godie2000: { relativeScale: 0.65 } },
};
/** task #231's hand-authored voxel-skin override sidecar (layer L1). */
const VOXEL_SKINS = {
  schema: "voxel-skins@1",
  overrides: { godie2000: { motifs: { head: "crown" } } },
};

const FILES: Record<string, unknown> = {
  "/content/manifest.json": {
    contentVersion: "cv_deadbeef1234",
    collections: {
      models: { hash: HASH, count: 1, path: "models/_index.json" },
      arenas: { hash: HASH, count: 1, path: "arenas/_index.json" },
    },
  },
  "/content/models/_index.json": idx("models", [{ id: "mock.model", path: "models/mock.model.json" }]),
  "/content/models/mock.model.json": MODEL,
  "/content/arenas/_index.json": idx("arenas", [{ id: "arena.mock", path: "arenas/arena.mock.json" }]),
  "/content/arenas/arena.mock.json": ARENA,
  // the "_"-prefixed sidecars the content index deliberately skips
  "/content/models/_standin-overrides.json": STANDIN,
  "/content/models/_voxel-skins.json": VOXEL_SKINS,
};

/** fetch-like over FILES, counting every call (ignores the ?h=<hash> cache-bust). */
function countingFetch(files: Record<string, unknown>): { fn: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fn = ((input: unknown) => {
    const url = String(input).split("?")[0]!;
    calls.push(url);
    const body = files[url];
    if (body === undefined)
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

function clearRegistries(): void {
  for (const r of [Champions, Abilities]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs]) r.clear();
}

let calls: string[];

beforeEach(async () => {
  clearRegistries();
  __resetContentBoot();
  const counting = countingFetch(FILES);
  calls = counting.calls;
  vi.stubGlobal("fetch", counting.fn);
  // the client boot that has ALWAYS already happened by the time a match starts
  await ensureContentLoaded({
    source: new HttpContentSource({ baseUrl: "/content", fetchFn: counting.fn }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  __resetContentBoot();
});

describe("ContentDb per-match load", () => {
  it("re-fetches NO collection — the only requests are the direct-path sidecars", async () => {
    const before = calls.length;
    const db = new ContentDb();
    await db.load("arena.mock");
    const made = calls.slice(before);

    // BOTH "_"-prefixed sidecars: the #77/#150 size overrides and (task #231)
    // the hand-authored voxel-skin overrides. Neither is in a collection index,
    // so neither can ride in on the boot bundle — two requests, no collections.
    expect([...made].sort()).toEqual([
      "/content/models/_standin-overrides.json",
      "/content/models/_voxel-skins.json",
    ]);
    // the two collections that used to cost 507 requests
    expect(made.some((u) => u.includes("/models/_index.json"))).toBe(false);
    expect(made.some((u) => u.includes("/vfx/"))).toBe(false);
  });

  it("serves model + arena docs out of the registries the boot hydrated", async () => {
    const db = new ContentDb();
    await db.load("arena.mock");

    expect(db.ready).toBe(true);
    expect(db.modelFor("mock.model")?.glbPath).toBe("assets/models/mock.glb");
    expect(db.modelFor("nope.model")).toBeNull();
    expect(db.arena?.id).toBe("arena.mock");
    // the size-override sidecar still rides in alongside the model docs
    expect(db.modelOverrideFor("godie2000")?.relativeScale).toBe(0.65);
    expect(db.modelOverrideFor("unlisted")).toBeNull();
    // ...and so does the voxel-skin override sidecar (task #231)
    expect(db.voxelSkinOverrideFor("godie2000")?.motifs?.head).toBe("crown");
    expect(db.voxelSkinOverrideFor("unlisted")).toBeNull();
  });

  it("loadArena reads the registry — no request per arena change", async () => {
    const db = new ContentDb();
    await db.load("arena.mock");
    const before = calls.length;

    expect((await db.loadArena("arena.mock"))?.id).toBe("arena.mock");
    expect(calls.slice(before)).toEqual([]);
  });

  it("GATE: modelFor stays null until load() settles (glb upgrade must not latch early)", async () => {
    const db = new ContentDb();
    // registry is already populated, yet the db must not hand out a doc:
    // ChampionView latches `upgradeStarted` on the first non-null doc, and the
    // per-champion size override is not resolvable until load() finishes.
    expect(Models.tryGet("mock.model")).toBeTruthy();
    expect(db.modelFor("mock.model")).toBeNull();

    const p = db.load("arena.mock");
    expect(db.modelFor("mock.model")).toBeNull(); // still gated while in flight
    await p;
    expect(db.modelFor("mock.model")).toBeTruthy(); // …and the override answers now
    expect(db.modelOverrideFor("godie2000")).toBeTruthy();
  });
});

describe("content asset cache key", () => {
  it("stamps ?h=<contentVersion> once the manifest has landed", () => {
    // nginx: `map $arg_h $content_cache` — no arg means `no-cache`, any arg means
    // `public, max-age=31536000, immutable`.
    expect(contentAssetUrl("assets/icons/items/x.png")).toBe(
      "/content/assets/icons/items/x.png?h=cv_deadbeef1234",
    );
  });

  it("stays bare before the manifest lands — never a guessed key", () => {
    __resetContentBoot();
    expect(contentAssetUrl("assets/icons/items/x.png")).toBe("/content/assets/icons/items/x.png");
    expect(contentAssetUrl("models/not-an-asset.json")).toBeNull();
  });
});
