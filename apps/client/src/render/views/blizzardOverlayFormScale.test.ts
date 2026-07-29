/**
 * 變身 form SIZE (task #249) — the renderer's FINAL `declaredScale`, not the
 * JSON number.
 *
 * WHY THIS TEST EXISTS AT ALL. Before #249 a 變身 body rendered on the shared
 * voxel stand-in while its base rendered on the real WC3 glb, so the two
 * `relativeScale` numbers were multiplied against DIFFERENT native mesh heights
 * and were never comparable. Now that both halves resolve to the SAME glb (see
 * blizzardOverlayForms.test.ts), `relativeScale` is directly comparable — and
 * an ABSENT entry beside a non-1.0 base silently renders the transform at the
 * wrong size. godie-n01b was exactly that: base 1.28, alternate absent (= 1.0),
 * i.e. 萬解-貓王胖虎 22% SHORTER than the body it transforms out of.
 *
 * So this asserts what ChampionView actually applied — `declaredScale`, read
 * off the view after the glb adopt — against the REAL shipped
 * content/models/_standin-overrides.json, driven through the same
 * ContentDb → EntityViewRegistry seam the composition root uses.
 *
 * The body is a unit box (native height 1), so the #150 height-normalization
 * factor is exactly TARGET_HEIGHT and `declaredScale` reads back as
 * TARGET_HEIGHT × relativeScale with no measurement noise.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { CHAMPION_FORM_PAIRS } from "@ggd/shared/content";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { Animation } from "@babylonjs/core/Animations/animation";
import type { ModelDoc } from "@ggd/shared/content";
import { ContentDb } from "../../content/ContentDb";
import { EntityViewRegistry, type EntityViewState } from "../EntityViewRegistry";
import { TARGET_HEIGHT } from "./ChampionView";
import type { AssetManager } from "../AssetManager";

const OVERRIDES_PATH = join(
  __dirname,
  "../../../../../content/models/_standin-overrides.json",
);
const OVERRIDES_FILE: unknown = JSON.parse(readFileSync(OVERRIDES_PATH, "utf8"));

function mockFetch(file: unknown): typeof fetch {
  return ((input: unknown) => {
    const url = String(input).split("?")[0]!;
    if (url === "/content/models/_standin-overrides.json") {
      return Promise.resolve({ ok: true, status: 200, json: async () => file });
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

const BASE_DOC: ModelDoc = {
  id: "blizzard-local.shared",
  schema: "model@1",
  glbPath: "assets/blizzard-local/models/Shared.glb",
  scale: 1,
  collisionRadius: 0.6,
  clipMap: { idle: "Idle", run: "Idle", attack: "Idle", cast: "Idle", hurt: "Idle", death: "Idle" },
};

function makeContainer(): AssetContainer {
  const container = new AssetContainer(scene);
  const mesh = MeshBuilder.CreateBox("body", { size: 1 }, scene);
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
  x: id,
  z: 0,
  fx: 1,
  fz: 0,
  alive: true,
});
const passthrough = (e: EntityViewState) => ({ x: e.x, z: e.z, fx: e.fx, fz: e.fz });

/** championId → the render scale ChampionView actually wrote. */
async function declaredScales(ids: readonly string[]): Promise<Map<string, number>> {
  vi.stubGlobal("fetch", mockFetch(OVERRIDES_FILE));
  const db = new ContentDb();
  await db.load();
  const seatChampion = new Map<number, string>(ids.map((id, i) => [100 + i, id]));
  const assets = { load: () => Promise.resolve(makeContainer()) } as unknown as AssetManager;
  const registry = new EntityViewRegistry(scene, assets, {
    modelDocFor: () => BASE_DOC,
    modelOverrideFor: (e: EntityViewState) => {
      const championId = seatChampion.get(e.seatId);
      return championId ? db.modelOverrideFor(championId) : null;
    },
  });
  registry.sync({
    entities: ids.map((_, i) => champ(900 + i, 100 + i)),
    poseFor: passthrough,
    nowMs: 0,
    dtMs: 16,
  });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  const out = new Map<string, number>();
  ids.forEach((id, i) => out.set(id, registry.getChampionView(900 + i)!.declaredScale!));
  registry.dispose();
  return out;
}

describe("變身 form declaredScale (blizzard-overlay-form-scale)", () => {
  it("O030 renders at the map's 3.0 — the largest authored 變身 scale", async () => {
    cover("blizzard-overlay-form-scale");
    const s = await declaredScales(["godie-orkn", "godie-o030"]);
    expect(s.get("godie-o030")).toBeCloseTo(TARGET_HEIGHT * 3.0, 5);
    // …and it really is the bigger half of the pair
    expect(s.get("godie-o030")!).toBeGreaterThan(s.get("godie-orkn")!);
  });

  it("E010 is SMALLER than its base — the map shrinks 紮根 from usca 1.10 to 1.00", async () => {
    cover("blizzard-overlay-form-scale");
    const s = await declaredScales(["godie-e00s", "godie-e010"]);
    expect(s.get("godie-e010")!).toBeLessThan(s.get("godie-e00s")!);
    // the exact w3u ratio 1.00 / 1.10, on one shared mesh
    expect(s.get("godie-e010")! / s.get("godie-e00s")!).toBeCloseTo(1.0 / 1.1, 5);
  });

  it("H00W matches its base exactly — both halves declare usca 1.00", async () => {
    cover("blizzard-overlay-form-scale");
    const s = await declaredScales(["godie-harf", "godie-h00w"]);
    expect(s.get("godie-h00w")).toBeCloseTo(s.get("godie-harf")!, 5);
    expect(s.get("godie-h00w")).toBeCloseTo(TARGET_HEIGHT * 1.0, 5);
  });

  it("every listed 變身 entry is finite and inside a sane render range", async () => {
    cover("blizzard-overlay-form-scale");
    const s = await declaredScales([
      "godie-h00w",
      "godie-o030",
      "godie-n01b",
      "godie-e010",
      "godie-o02n",
      "godie-o02o",
    ]);
    for (const [id, v] of s) {
      expect(Number.isFinite(v), id).toBe(true);
      expect(v, id).toBeGreaterThan(0);
      expect(v, id).toBeLessThanOrEqual(TARGET_HEIGHT * 7); // #77's documented ceiling
    }
    // 曹操孟德's two halves share one model AND one usca 1.30 — equal on screen
    expect(s.get("godie-o02n")).toBeCloseTo(s.get("godie-o02o")!, 5);
  });
});

/**
 * The render assertions above cannot tell an ENTRY WORTH 1.0 from NO ENTRY —
 * both produce relativeScale 1.0, so deleting godie-h00w's row left them all
 * green (verified by mutation). That is the 「刪掉還全綠」 hole, and this block
 * closes it at the data layer: each live 變身 form must carry an EXPLICIT row
 * whose declared `usca` is the number `war3map.w3u` actually holds, read from
 * the tracked importer fixture rather than from the note prose.
 */
describe("每個變身態都有明寫的 override 條目 (blizzard-overlay-form-usca-pin)", () => {
  const overrides = (OVERRIDES_FILE as { overrides: Record<string, Record<string, unknown>> })
    .overrides;

  /** `scale` (= `usca`) per hero rawcode, straight from the importer's dump. */
  const HEROES = (
    JSON.parse(
      readFileSync(
        join(__dirname, "../../../../../tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json"),
        "utf8",
      ),
    ) as { heroes: Record<string, { scale: number | null }> }
  ).heroes;

  /** WC3 default when the unit declares no `usca` at all. */
  const uscaOf = (rawcode: string): number => HEROES[rawcode]?.scale ?? 1;

  const LIVE = ["godie-h00w", "godie-o030", "godie-n01b", "godie-e010"] as const;

  it("the fixture and the shipped overrides both really loaded", () => {
    cover("blizzard-overlay-form-usca-pin");
    expect(Object.keys(HEROES).length).toBeGreaterThan(100);
    expect(Object.keys(overrides).length).toBeGreaterThan(30);
  });

  it("each live 變身 form has its OWN row, and its usca is the map's", () => {
    cover("blizzard-overlay-form-usca-pin");
    for (const id of LIVE) {
      const row = overrides[id];
      expect(row, `${id} needs an explicit row — absent silently means 1.0`).toBeDefined();
      const pair = CHAMPION_FORM_PAIRS.find((p) => p.alternateId === id)!;
      expect(row!.usca, `${id} usca`).toBe(uscaOf(pair.alternateUnitRawcode));
      expect(typeof row!.relativeScale, `${id} relativeScale`).toBe("number");
      // bounded: a negative or absurd number would render an invisible or
      // camera-breaking champion, and nothing else in the pipeline clamps it.
      expect(row!.relativeScale as number).toBeGreaterThan(0);
      expect(row!.relativeScale as number).toBeLessThanOrEqual(7);
    }
  });

  it("O030 is the map's 3.0 and the largest 變身 usca anywhere", () => {
    cover("blizzard-overlay-form-usca-pin");
    expect(overrides["godie-o030"]!.relativeScale).toBe(3.0);
    expect(uscaOf("O030")).toBe(3.0);
    expect(uscaOf("Orkn")).toBe(1); // base declares none → WC3 default
    const alternateUscas = CHAMPION_FORM_PAIRS.map((p) => uscaOf(p.alternateUnitRawcode));
    expect(Math.max(...alternateUscas)).toBe(3.0);
  });

  it("E010 shrinks (1.10 → 1.00) while H00W and N01B hold at the base's usca", () => {
    cover("blizzard-overlay-form-usca-pin");
    expect(uscaOf("E010")).toBeLessThan(uscaOf("E00S"));
    expect(overrides["godie-e010"]!.relativeScale as number).toBeLessThan(
      overrides["godie-e00s"]!.relativeScale as number,
    );
    // the map gives both halves of 26 and 40 the same usca
    expect(uscaOf("Harf")).toBe(uscaOf("H00W"));
    expect(uscaOf("Nman")).toBe(uscaOf("N01B"));
    // …and 26's shipped rows mirror that equality (40 cannot yet — see below)
    expect(overrides["godie-h00w"]!.relativeScale).toBe(overrides["godie-harf"]!.relativeScale);
  });
});

/**
 * THE COUPLING GUARD — the half of this task that is NOT done, pinned so it
 * cannot be finished silently or forgotten.
 *
 * blizzardOverlay now RESOLVES the counterpart's glb for these five ids, but
 * `ChampionView.tryUpgradeToGlb` returns early on `skin.preferVoxelBody` before
 * it ever looks at the doc — and `defaultPrefersVoxelBody` still answers TRUE
 * for all five, because its allow-list `BLIZZARD_MODEL_CHAMPIONS`
 * (packages/shared/src/content/voxelSkin/types.ts) is pinned id-for-id to the
 * manifest's champId column, which names only the covered half of each pair. So
 * by DEFAULT the resolved model is still discarded and the champion still wears
 * the voxel body; the resolution is reachable today only through the operator's
 * own `config/voxel-bodies` toggle (owner: 「要替換成體素是我從後台設定套用才
 * 生效」), where it now hands over the correct WC3 model instead of a shared
 * KayKit mesh.
 *
 * These assertions FAIL THE DAY SOMEONE OPENS THE GATE — which is exactly when
 * godie-n01b's `relativeScale` must go 1.0 → 1.28 (see its note in
 * _standin-overrides.json). Do not "fix" them by deleting them.
 */
describe("變身態仍被體素閘擋著 (blizzard-overlay-form-voxel-gate)", () => {
  const STAND_IN_KEY: Record<string, string> = {
    "godie-h00w": "champ.skin.barbarian",
    "godie-o030": "champ.sela",
    "godie-n01b": "champ.skin.rogue",
    "godie-e010": "champ.sela",
    "godie-o02n": "champ.sela",
  };

  it("the covered half is model-bodied, the resolving half is still voxel-bodied", async () => {
    cover("blizzard-overlay-form-voxel-gate");
    const { defaultPrefersVoxelBody } = await import("@ggd/shared/content/voxelSkin");
    // the counterpart the manifest DOES cover already prefers its WC3 model
    expect(defaultPrefersVoxelBody("champ.skin.barbarian", "godie-harf")).toBe(false);
    expect(defaultPrefersVoxelBody("champ.skin.rogue", "godie-nman")).toBe(false);
    // …and every id that resolves THROUGH a counterpart does not, yet
    for (const [id, key] of Object.entries(STAND_IN_KEY)) {
      expect(
        defaultPrefersVoxelBody(key, id),
        `${id}: gate opened — add it to BLIZZARD_MODEL_CHAMPIONS *and* revisit its relativeScale`,
      ).toBe(true);
    }
  });

  it("godie-n01b's shipped scale is the usca-verbatim one the shared mesh needs", () => {
    cover("blizzard-overlay-form-voxel-gate");
    // 1.0 is correct WHILE the gate is shut; 1.28 (= godie-nman's) is correct
    // once it opens. The test above is what forces the swap.
    expect(overridesOf("godie-n01b").relativeScale).toBe(1.0);
    expect(overridesOf("godie-nman").relativeScale).toBe(1.28);
  });
});

function overridesOf(id: string): { relativeScale: number } {
  return (OVERRIDES_FILE as { overrides: Record<string, { relativeScale: number }> }).overrides[id]!;
}
