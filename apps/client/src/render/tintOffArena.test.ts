/**
 * Task #263 — the w3x vertex tint OUTSIDE the arena.
 *
 * #49 ported the per-unit art colour and wired it into exactly one place,
 * `EntityViewRegistry.applyTint`. Every other screen that stands a champion in
 * front of the player kept showing the RAW mesh, so 黑化Saber / 貞子 / 黑人牙膏 /
 * Berserker were near-black in a fight and untouched everywhere else:
 *
 *   • champ-select 3D stage  (ui/panels/champselect/ProfileBlock)  ─┐
 *   • lobby store preview    (ui/platform/StoreScreen)             ─┤ render/StorePreview
 *   • round-winner card      (render/RoundWinnerStage)             ─┘
 *   • intermission shop      (render/intermission/IntermissionScene)
 *
 * All four now go through the SAME `applyModelTint` the arena uses, so there is
 * one gamma correction, one team-mesh exclusion list and one material-cloning
 * policy — not four that can drift.
 *
 *   tint263-store-preview  — StorePreview paints the champion's tint and releases it
 *   tint263-intermission   — the shop hero is painted, and re-swapping releases
 *   tint263-round-winner   — the winner's championId reaches the previewer
 *   tint263-team-colour    — team-colour meshes are STILL never painted, on every screen
 *
 * Headless: Babylon NullEngine + an injected AssetManager stub, no WebGL, no fetch.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { AssetManager } from "./AssetManager";
import type { ModelDoc } from "@ggd/shared/content";
import type { ChampionDef } from "@ggd/shared/sim/content/defs";
import type { ChampionId } from "@ggd/shared/ids";
import { Champions } from "@ggd/shared/sim/content/registry";
import { StorePreview } from "./StorePreview";
import { RoundWinnerStage } from "./RoundWinnerStage";
import { IntermissionScene } from "./intermission/IntermissionScene";
import { UNTINTED_MESH_SUFFIXES } from "./views/modelTint";

/**
 * 英靈-亞瑟王 - 黑化Saber. Its whole identity is the darkening (`黑化`), it is
 * one of the champions the owner could see was wrong, and 0.2941 is far enough
 * from 1 that no rounding can make an untinted material look painted.
 */
const SABER = "godie-e00q";
const SABER_TINT: readonly [number, number, number] = [0.2941, 0.2941, 0.2941];
/** 哆拉A夢 - 小叮噹. The CONTROL: its blue is the mesh's own texture, NOT a
 * tint — `N00B` resolves to (255,255,255) in the w3x. It must stay untouched. */
const DORAEMON = "godie-n00b";

/** WC3 multiplies the DISPLAYED texel; PBR multiplies in linear light. */
const pbr22 = (t: number): number => Math.pow(t, 2.2);
/** The albedo every stub material starts at, so a multiply is measurable. */
const BASE = 0.8;

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

function championFix(id: string, tint?: readonly [number, number, number]): ChampionDef {
  return {
    id: id as ChampionId,
    name: id,
    modelKey: "champ.sela",
    ...(tint ? { tint: [...tint] as [number, number, number] } : {}),
  } as unknown as ChampionDef;
}

beforeEach(() => {
  Champions.clear();
  Champions.register(SABER as ChampionId, championFix(SABER, SABER_TINT));
  Champions.register(DORAEMON as ChampionId, championFix(DORAEMON));
});

/**
 * A stand-in for the AssetManager's cached container. Body + weapon share ONE
 * PBR material (the real shape: a champion .glb is 1–5 materials, not one per
 * mesh) and there is a `-teamring` that must never be painted.
 */
function makeAssets(): { assets: AssetManager; shared: PBRMaterial } {
  const container = new AssetContainer(scene);
  const shared = new PBRMaterial("stub-albedo", scene);
  shared.albedoColor = new Color3(BASE, BASE, BASE);
  const root = MeshBuilder.CreateBox("body", { size: 1 }, scene);
  root.material = shared;
  const weapon = MeshBuilder.CreateBox("weapon", { size: 0.3 }, scene);
  weapon.material = shared;
  weapon.parent = root;
  // the team-colour read: same material family, DIFFERENT job
  const ring = MeshBuilder.CreateBox("champ-stub-teamring", { size: 1.2 }, scene);
  const ringMat = new PBRMaterial("stub-teamring", scene);
  ringMat.albedoColor = new Color3(BASE, BASE, BASE);
  ring.material = ringMat;
  ring.parent = root;

  container.meshes.push(root, weapon, ring);
  container.rootNodes.push(root);
  container.removeAllFromScene();
  return { assets: { load: () => Promise.resolve(container) } as unknown as AssetManager, shared };
}

const DOC: ModelDoc = {
  id: "champ.sela",
  schema: "model@1",
  glbPath: "assets/models/champions/blocky-mage.glb", // native → no yaw rotation
  scale: 1,
  collisionRadius: 0.5,
  clipMap: { idle: "Idle", run: "Walk", attack: "Atk", cast: "Cast", hurt: "Hit", death: "Die" },
} as ModelDoc;

/** Albedo of the first non-team mesh under `root`, or null when it has none. */
function bodyAlbedo(meshes: AbstractMesh[]): Color3 | null {
  const mesh = meshes.find(
    (m) => !UNTINTED_MESH_SUFFIXES.some((s) => m.name.endsWith(s)) && m.material,
  );
  const mat = mesh?.material as PBRMaterial | undefined;
  return mat?.albedoColor ?? null;
}

function teamAlbedo(meshes: AbstractMesh[]): Color3 | null {
  const mesh = meshes.find((m) => m.name.endsWith("-teamring"));
  const mat = mesh?.material as PBRMaterial | undefined;
  return mat?.albedoColor ?? null;
}

// -------------------------------------------------------------- StorePreview

describe("champ-select / store / round-winner preview paints the w3x tint (tint263-store-preview)", () => {
  it("paints a tinted champion, leaves an untinted one byte-identical, and releases on swap", async () => {
    cover("tint263-store-preview");
    const { assets, shared } = makeAssets();
    const preview = new StorePreview(scene, assets);

    // BEFORE: no champion id → the untinted path, materials untouched
    await preview.show(DOC);
    expect(bodyAlbedo(preview.modelNode!.getChildMeshes(false))!.r).toBeCloseTo(BASE, 6);

    // AFTER: 黑化Saber → the ported multiply, gamma-corrected for PBR
    await preview.show(DOC, { championId: SABER });
    const painted = bodyAlbedo(preview.modelNode!.getChildMeshes(false))!;
    expect(painted.r).toBeCloseTo(BASE * pbr22(SABER_TINT[0]), 5);
    expect(painted.g).toBeCloseTo(BASE * pbr22(SABER_TINT[1]), 5);
    expect(painted.b).toBeCloseTo(BASE * pbr22(SABER_TINT[2]), 5);
    // it is a CLONE — the AssetManager's cached material is untouched, so the
    // 17 other champions sharing this mesh cannot be repainted by this one
    expect(shared.albedoColor.r).toBeCloseTo(BASE, 6);

    // 小叮噹 is the control: the w3x sets no tint on N00B (its blue lives in
    // the mesh texture), so showing it must restore a pristine material.
    await preview.show(DOC, { championId: DORAEMON });
    expect(bodyAlbedo(preview.modelNode!.getChildMeshes(false))!.r).toBeCloseTo(BASE, 6);
    expect(shared.albedoColor.r).toBeCloseTo(BASE, 6);

    preview.dispose();
    // dispose released every clone: the cached source is still stock
    expect(shared.albedoColor.r).toBeCloseTo(BASE, 6);
  });
});

// ---------------------------------------------------------------- team colour

describe("champion colour never eats the team colour (tint263-team-colour)", () => {
  it("the team ring keeps its own colour on the preview stage", async () => {
    cover("tint263-team-colour");
    const { assets } = makeAssets();
    const preview = new StorePreview(scene, assets);
    await preview.show(DOC, { championId: SABER });
    const meshes = preview.modelNode!.getChildMeshes(false);
    // body darkened …
    expect(bodyAlbedo(meshes)!.r).toBeLessThan(BASE * 0.5);
    // … team ring NOT. A 0.2941 multiply on the ring is exactly the regression
    // that would make friend and foe unreadable, so this is a hard pin.
    expect(teamAlbedo(meshes)!.r).toBeCloseTo(BASE, 6);
    preview.dispose();
  });
});

// ----------------------------------------------------------- RoundWinnerStage

describe("round-winner card carries the winner's colour (tint263-round-winner)", () => {
  it("forwards the winning championId to the previewer", () => {
    cover("tint263-round-winner");
    const calls: Array<{ id: string | null | undefined }> = [];
    // headless doubles, same shape RoundWinnerStage.test.ts already uses
    const fake = () => ({ style: {} as Record<string, string>, remove: () => {}, textContent: "" });
    const stage = new RoundWinnerStage({
      host: null,
      createCanvas: () => fake() as unknown as HTMLCanvasElement,
      createElement: () => fake() as unknown as HTMLElement,
      createPreview: () => ({
        show: (_doc, opts) => {
          calls.push({ id: opts?.championId });
        },
        dispose: () => {},
      }),
      taunt: { playRound: () => Promise.resolve(null), cancel: () => {} },
    });

    stage.show(DOC, { championId: SABER, round: 3 });
    expect(calls).toHaveLength(1);
    // the whole bug: the stage used to call `show(doc)` with no context at all,
    // so the previewer could not know WHICH champion was on the card.
    expect(calls[0]!.id).toBe(SABER);

    stage.show(DOC, {}); // no winner resolvable → explicitly null, never stale
    expect(calls[1]!.id).toBeNull();
    stage.dispose();
  });
});

// -------------------------------------------------------- IntermissionScene

describe("intermission shop hero carries the w3x tint (tint263-intermission)", () => {
  it("paints the hero at the counter and hands the cached material back on swap", async () => {
    cover("tint263-intermission");
    const { assets, shared } = makeAssets();
    const im = new IntermissionScene(null as unknown as HTMLCanvasElement, {
      engineFactory: () => new NullEngine() as unknown as Engine,
      autoStart: false,
      now: () => 0,
      assets,
    });

    await im.setChampion(DOC.glbPath, 1, DOC.yawOffsetDeg, SABER);
    const root = im.scene.getTransformNodeByName("im-champion");
    expect(root, "the hero is mounted at the counter").not.toBeNull();
    const painted = bodyAlbedo(root!.getChildMeshes(false))!;
    expect(painted.r).toBeCloseTo(BASE * pbr22(SABER_TINT[0]), 5);
    expect(teamAlbedo(root!.getChildMeshes(false))!.r).toBeCloseTo(BASE, 6);
    expect(shared.albedoColor.r, "cached source material stays stock").toBeCloseTo(BASE, 6);

    // swapping to the untinted control restores a pristine material
    await im.setChampion(DOC.glbPath, 1, DOC.yawOffsetDeg, DORAEMON);
    const root2 = im.scene.getTransformNodeByName("im-champion");
    expect(bodyAlbedo(root2!.getChildMeshes(false))!.r).toBeCloseTo(BASE, 6);
    expect(shared.albedoColor.r).toBeCloseTo(BASE, 6);

    im.dispose();
    expect(shared.albedoColor.r).toBeCloseTo(BASE, 6);
  });
});
