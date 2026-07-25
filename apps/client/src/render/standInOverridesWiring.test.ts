/**
 * client-standin-override (task #77/#150, mdl-64/mdl-150d): the COMPOSITION-ROOT
 * wiring. GameApp resolves each champion entity → championId and reads the
 * per-champion size override out of content/models/_standin-overrides.json (loaded
 * client-side by ContentDb), then feeds it to EntityViewRegistry.modelOverrideFor.
 *
 * This test drives the REAL curated overrides file end-to-end:
 *   1. ContentDb.load() fetches models/_standin-overrides.json and exposes each
 *      championId's override via modelOverrideFor() (resolution half);
 *   2. a GameApp-shaped seam (seatId→championId→ContentDb.modelOverrideFor) hands
 *      the override to the registry, which applies its `relativeScale` ON TOP of
 *      ChampionView's height-normalization — a LISTED champion renders at its
 *      intended size, an UNLISTED one defaults to 1.0 = the normalized target
 *      (application half).
 * Runs on Babylon's NullEngine (headless), like the other render tests.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { Animation } from "@babylonjs/core/Animations/animation";
import type { ModelDoc } from "@ggd/shared/content";
import { ContentDb } from "../content/ContentDb";
import {
  EntityViewRegistry,
  relativeScaleOf,
  type EntityViewState,
} from "./EntityViewRegistry";
import { TARGET_HEIGHT } from "./views/ChampionView";
import type { AssetManager } from "./AssetManager";

// The 8 curated size exceptions, mirrored from content/models/_standin-overrides.json
// so the test asserts the SHIPPED data, not a fixture. Read from disk below.
const EXPECTED: Record<string, number> = {
  "godie-n00b": 0.65, // 小叮噹 / 哆啦A夢 — small robot cat
  "godie-ofar": 0.6, // 皮卡丘 — electric mouse
  "godie-hgam": 0.62, // 妙蛙種子 — small starter Pokémon
  "godie-h02k": 0.8, // 熊貓 — short round mascot
  "godie-h02u": 0.85, // 草泥馬 — stubby alpaca
  "godie-h02v": 0.85, // 草泥馬 (alt id)
  "godie-e00r": 1.55, // 初號機 (EVA Unit-01) — giant mecha
  "godie-ubal": 1.3, // 巴恩大魔王 — boss-scale antagonist
};

/** the real shipped overrides file (repo content/, 4 levels up from src/render). */
const OVERRIDES_FILE: unknown = JSON.parse(
  readFileSync(join(__dirname, "../../../../content/models/_standin-overrides.json"), "utf8"),
);

/** fetch stub: serve the real overrides file; 404 everything else so ContentDb
 *  degrades to empty maps for the collections this test does not exercise. */
function mockFetch(overridesFile: unknown): typeof fetch {
  return ((input: unknown) => {
    const url = String(input).split("?")[0]!;
    if (url === "/content/models/_standin-overrides.json") {
      return Promise.resolve({ ok: true, status: 200, json: async () => overridesFile });
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  }) as unknown as typeof fetch;
}

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});

afterAll(() => {
  scene.dispose();
  engine.dispose();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Load a ContentDb over the real overrides file (fetch stubbed). */
async function loadContentDb(): Promise<ContentDb> {
  vi.stubGlobal("fetch", mockFetch(OVERRIDES_FILE));
  const db = new ContentDb();
  await db.load();
  return db;
}

// BASE_DOC's body is a unit box (native height 1) → the height-normalization
// factor is exactly TARGET_HEIGHT, so declaredScale reads back as
// TARGET_HEIGHT × relativeScale with no measurement noise.
const BASE_DOC: ModelDoc = {
  id: "champ.sela",
  schema: "model@1",
  glbPath: "assets/models/champions/blocky-mage.glb",
  scale: 0.77, // the SHARED stand-in size — irrelevant post-#150 normalization
  collisionRadius: 0.6,
  clipMap: { idle: "Idle", run: "Idle", attack: "Idle", cast: "Idle", hurt: "Idle", death: "Idle" },
} as ModelDoc;

/** a fresh unit-box .glb container the fake AssetManager 'loads' per champion. */
function makeContainer(): AssetContainer {
  const container = new AssetContainer(scene);
  const mesh = MeshBuilder.CreateBox("kaykit-body", { size: 1 }, scene);
  container.meshes.push(mesh);
  container.rootNodes.push(mesh);
  const g = new AnimationGroup("Idle", scene);
  const a = new Animation("Idle-y", "rotation.y", 60, Animation.ANIMATIONTYPE_FLOAT);
  a.setKeys([
    { frame: 0, value: 0 },
    { frame: 1, value: 0 },
  ]);
  g.addTargetedAnimation(a, mesh);
  container.animationGroups.push(g);
  container.removeAllFromScene();
  return container;
}

const champ = (id: number, seatId: number): EntityViewState => ({
  id,
  kind: 0,
  seatId,
  key: "champ.sela",
  teamId: 1,
  x: id, // spread them out; irrelevant to scale
  z: 0,
  fx: 1,
  fz: 0,
  alive: true,
});

const passthrough = (e: EntityViewState) => ({ x: e.x, z: e.z, fx: e.fx, fz: e.fz });

describe("stand-in size-override composition-root wiring (client-standin-override, task #150)", () => {
  it("ContentDb resolves every curated championId→override from _standin-overrides.json", async () => {
    cover("client-standin-override");
    const db = await loadContentDb();
    for (const [championId, rel] of Object.entries(EXPECTED)) {
      const ov = db.modelOverrideFor(championId);
      expect(ov, championId).not.toBeNull();
      expect(ov!.relativeScale, championId).toBe(rel);
      // the resolved override flows through the SAME multiplier the renderer uses
      expect(relativeScaleOf(ov), championId).toBe(rel);
    }
  });

  it("an UNLISTED champion resolves to null → the renderer defaults relativeScale to 1.0", async () => {
    cover("client-standin-override");
    const db = await loadContentDb();
    expect(db.modelOverrideFor("heroshana")).toBeNull(); // 夏娜 = the normal case
    expect(db.modelOverrideFor("does-not-exist")).toBeNull();
    // default 1.0 → the height-normalized target size, unchanged
    expect(relativeScaleOf(db.modelOverrideFor("heroshana"))).toBe(1);
  });

  it("a missing/404 overrides file leaves every champion at the normalized default", async () => {
    cover("client-standin-override");
    vi.stubGlobal("fetch", mockFetch(undefined)); // even the overrides file 404s
    const db = new ContentDb();
    await db.load();
    expect(db.modelOverrideFor("godie-n00b")).toBeNull();
    expect(relativeScaleOf(db.modelOverrideFor("godie-n00b"))).toBe(1);
  });

  it("end-to-end: the GameApp seam applies the override so listed champions render at their size, unlisted at 1.0", async () => {
    cover("client-standin-override");
    const db = await loadContentDb();

    // the GameApp.modelOverrideFor seam, verbatim: entity.seatId → championId →
    // ContentDb.modelOverrideFor. render/** never touches the seat table (client-08).
    const seatChampion = new Map<number, string>([
      [11, "godie-n00b"], // 小叮噹 → 0.65 (listed, small)
      [12, "godie-e00r"], // 初號機 → 1.55 (listed, giant)
      [13, "heroshana"], // 夏娜 → unlisted → default 1.0
    ]);
    const modelOverrideFor = (e: EntityViewState) => {
      const championId = seatChampion.get(e.seatId);
      return championId ? db.modelOverrideFor(championId) : null;
    };

    const assets = { load: () => Promise.resolve(makeContainer()) } as unknown as AssetManager;
    const registry = new EntityViewRegistry(scene, assets, {
      modelDocFor: () => BASE_DOC,
      modelOverrideFor,
    });

    registry.sync({
      entities: [champ(910, 11), champ(911, 12), champ(912, 13)],
      poseFor: passthrough,
      nowMs: 0,
      dtMs: 16,
    });
    // flush the async .glb adopt (assets.load → .then measures + scales)
    for (let i = 0; i < 6; i++) await Promise.resolve();

    const small = registry.getChampionView(910)!.declaredScale!;
    const big = registry.getChampionView(911)!.declaredScale!;
    const normal = registry.getChampionView(912)!.declaredScale!;

    // unit-box native height 1 → normalized factor = TARGET_HEIGHT; the exceptions
    // multiply it, the unlisted champion stays exactly at it.
    expect(normal).toBeCloseTo(TARGET_HEIGHT, 5); // ~1.8u — unlisted default 1.0
    expect(small).toBeCloseTo(TARGET_HEIGHT * 0.65, 5); // 小叮噹 ~1.17u
    expect(big).toBeCloseTo(TARGET_HEIGHT * 1.55, 5); // 初號機 ~2.79u
    // and the deliberate exceptions really are smaller / bigger than the default
    expect(small).toBeLessThan(normal);
    expect(big).toBeGreaterThan(normal);
    registry.dispose();
  });
});

/**
 * TASK #77 — the map's declared SCALE must survive the stand-in fallback.
 *
 * 40 `godie-*` champions have no shipped model and render on one of the four
 * shared CC0 KayKit meshes. Their WC3 Scaling Value ('usca',
 * tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json) used to be dropped on the
 * floor, so every one of them rendered at the identical normalized 1.8u.
 *
 * The guard below reads BOTH sides from disk — the source map's objects and the
 * shipped overrides file — so it fails if a champion's map scale is ever
 * silently discarded again. It is a data contract, not a fixture.
 */
const OBJECTS: { heroes?: Record<string, { scale?: number }>; units?: Record<string, { scale?: number }> } =
  JSON.parse(
    readFileSync(
      join(__dirname, "../../../../tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json"),
      "utf8",
    ),
  );

/** The four shared stand-in meshes — a champion on one of these has no model. */
const STOCK_KEYS = new Set([
  "champ.sela",
  "champ.thorne",
  "champ.skin.barbarian",
  "champ.skin.rogue",
]);

/** The map's usca for a `godie-XXXX` champion, or 1.0 (the WC3 default). */
function mapScaleOf(championId: string): number {
  const rawcode = championId.slice("godie-".length).toUpperCase();
  const all = { ...(OBJECTS.units ?? {}), ...(OBJECTS.heroes ?? {}) };
  for (const [code, def] of Object.entries(all)) {
    if (code.toUpperCase() === rawcode) return typeof def.scale === "number" ? def.scale : 1;
  }
  return 1;
}

/**
 * The two champions whose base WC3 model is a CHILD (units\critters\VillagerKid)
 * — usca alone would render them TALLER than an adult against our normalized
 * adult height, so they carry the measured base-model correction instead.
 * See the `note` on each entry in _standin-overrides.json.
 */
const CHILD_MODEL_CORRECTED = new Set(["godie-h021", "godie-hblm"]);

/**
 * Champions where #150 hand-authored a size from LORE that disagrees with the
 * map. The shipped lore value wins until the owner rules; the disagreement is
 * recorded in the file's `note` so it cannot rot silently.
 */
const LORE_OVERRIDES_MAP = new Set(["godie-h02k", "godie-ubal"]);

/**
 * godie-u011 「死亡老二 - 克勞薩先生」 — the map declares usca 1.5 on
 * `collision.mdl`, a geometry-LESS WC3 collision dummy. That is a spec for an
 * invisible unit, not a body: there is no height for 1.5 to scale, so the value
 * is deliberately NOT carried over. #77 moved the champion off the empty model
 * onto a stand-in that actually renders (see content/champions/godie-u011.json).
 */
const NO_BODY_TO_SCALE = new Set(["godie-u011"]);

/**
 * A #150 lore tune that lands within this fraction of the map's own value is
 * treated as AGREEING with the map, not as discarding it (小叮噹 0.65 vs 0.60,
 * 初號機 1.55 vs 1.60 — both authored from lore before the map value was
 * recovered, and both within 8%).
 */
const LORE_AGREEMENT_TOLERANCE = 0.1;

describe("stand-in fallback preserves the map's declared scale (task #77)", () => {
  const overrides = (OVERRIDES_FILE as { overrides: Record<string, { relativeScale?: number }> })
    .overrides;

  /** every stand-in champion, straight off the shipped champion docs. */
  const standIns = readdirSync(join(__dirname, "../../../../content/champions"))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map(
      (f) =>
        JSON.parse(
          readFileSync(join(__dirname, "../../../../content/champions", f), "utf8"),
        ) as { id: string; name: string; modelKey: string },
    )
    .filter((c) => STOCK_KEYS.has(c.modelKey) && c.id.startsWith("godie-"));

  it("finds the stand-in roster (guard against the fixture silently emptying)", () => {
    cover("client-standin-override");
    expect(standIns.length).toBeGreaterThanOrEqual(40);
  });

  it("every stand-in champion's map scale reaches the renderer", () => {
    cover("client-standin-override");
    const dropped: string[] = [];
    for (const c of standIns) {
      const declared = mapScaleOf(c.id);
      const rendered = relativeScaleOf(overrides[c.id] ?? null);
      if (
        CHILD_MODEL_CORRECTED.has(c.id) ||
        LORE_OVERRIDES_MAP.has(c.id) ||
        NO_BODY_TO_SCALE.has(c.id)
      ) {
        continue;
      }
      // a map scale of 1.0 needs no entry — the renderer's default IS 1.0
      if (Math.abs(rendered - declared) > LORE_AGREEMENT_TOLERANCE * declared) {
        dropped.push(`${c.id} ${c.name}: map ${declared.toFixed(2)} → rendered ${rendered}`);
      }
    }
    expect(dropped, `map scale discarded for:\n${dropped.join("\n")}`).toEqual([]);
  });

  it("小叮噹 renders smaller than a default champion, and 黑化張飛 larger", () => {
    cover("client-standin-override");
    // the owner's own example: a 0.6-scale blue panda must not render at 1.0
    expect(relativeScaleOf(overrides["godie-n00b"] ?? null)).toBeLessThan(1);
    expect(mapScaleOf("godie-n00b")).toBeCloseTo(0.6, 2);
    // and the map's largest authored unit really is the biggest on screen
    expect(relativeScaleOf(overrides["godie-u01f"] ?? null)).toBe(2);
  });

  it("the two child-model champions render as children, not as tall adults", () => {
    cover("client-standin-override");
    for (const id of CHILD_MODEL_CORRECTED) {
      expect(mapScaleOf(id), id).toBeCloseTo(1.2, 2); // the map's raw usca > 1
      expect(relativeScaleOf(overrides[id] ?? null), id).toBeLessThan(1); // rendered small
    }
  });
});
