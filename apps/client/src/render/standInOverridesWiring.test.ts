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
import { readFileSync } from "node:fs";
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
  glbPath: "assets/models/champions/mage.glb",
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
