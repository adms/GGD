/**
 * 變身 REACHES THE SCREEN (task #249, wave G2) — the client really swaps the
 * body, through the REAL `EntityViewRegistry` and REAL `ChampionView`s on
 * Babylon's NullEngine.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE IS THE WHOLE POINT OF G2
 * ---------------------------------------------------------------------------
 * Everything that decides what a champion body LOOKS like is a
 * construction-time input to `ChampionView`, and every one of them is one-way:
 *
 *   · `modelKey`     — a `readonly` constructor parameter. No setter exists.
 *   · the voxel skin — decides the boxes, their UVs and the motif geometry.
 *   · the .glb       — behind the `upgradeStarted` latch, and the registry only
 *                      offers a doc while `!view.upgradeAttempted`.
 *   · `e.key`        — read exactly once, in the construction branch.
 *
 * And `sync` fetches the view BY ENTITY ID, which does not change when a
 * champion transforms (the swap is in place — same entity, same health, same
 * cooldowns). So before this wave: the sim swapped the body, the snapshot
 * shipped it, `championFormContent.test.ts` proved the stats changed, and the
 * player still watched the OLD model. Failure shape ② in its purest form —
 * computed, transmitted, and never delivered.
 *
 * ---------------------------------------------------------------------------
 * WHAT THESE ASSERT ON (and the trap they avoid)
 * ---------------------------------------------------------------------------
 * `views/mobTint.test.ts` records the lesson: `applyModelTint` CLONES the
 * material, so any assertion written against an object captured BEFORE the call
 * passes whether the work happened or not. The isomorphic trap here is
 * asserting on `e.key` (that is the INPUT), on a bookkeeping flag (failure shape
 * ⑦), or on a ChampionView reference captured before the swap.
 *
 * So every assertion below reads the object the registry is HOLDING RIGHT NOW —
 * `reg.getChampionView(id)` after the sync — and, where it matters, the meshes
 * and materials that Babylon would actually draw with:
 *   · `view.modelKey` on the live view (it picks the glb yaw + fallback accent);
 *   · the instantiated .glb child mesh names in the scene (the geometry itself);
 *   · `mesh.material.diffuseColor` READ BACK after the paint (the mobTint rule);
 *   · `root.setEnabled` state for the cull path.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { ModelDoc } from "@ggd/shared/content";
import { ENTITY_FLAG } from "@ggd/shared/protocol/schema";
import {
  EntityViewRegistry,
  type EntityViewState,
  type ViewContentHooks,
} from "./EntityViewRegistry";
import type { AssetManager } from "./AssetManager";

let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterEach(() => {
  scene.dispose();
  engine.dispose();
});

const ID = 7701;

/** 白木老樹精's real pair: BOTH halves ship `champ.sela` (content/champions). */
const SHARED_KEY = "champ.sela";
const BASE_GLB = "assets/models/champions/base-body.glb";
const ALT_GLB = "assets/models/champions/alt-body.glb";

const docFor = (glbPath: string): ModelDoc =>
  ({
    id: `model.${glbPath}`,
    schema: "model@1",
    glbPath,
    scale: 1,
    collisionRadius: 0.5,
    clipMap: {
      idle: "Idle",
      run: "Running_A",
      attack: "Attack",
      cast: "Cast",
      hurt: "Hit_A",
      death: "Death_A",
    },
  }) as ModelDoc;

/**
 * A stand-in for the AssetManager's cached container, with ONE box whose NAME
 * identifies which glb it came from. `tryUpgradeToGlb` clones it through
 * `instantiateModelsToScene((n) => `${entityId}-${n}`)`, so the mesh the
 * renderer ends up drawing is named `<entityId>-<meshName>` — a direct read of
 * WHICH MODEL IS ON SCREEN, not of any flag about it.
 */
function makeContainer(meshName: string): AssetContainer {
  const container = new AssetContainer(scene);
  const mesh = MeshBuilder.CreateBox(meshName, { size: 1 }, scene);
  container.meshes.push(mesh);
  container.rootNodes.push(mesh);
  container.removeAllFromScene(); // a real LoadAssetContainerAsync leaves nothing behind
  return container;
}

/** glb paths the registry actually asked the AssetManager to load, in order. */
let requested: string[];

function makeAssets(): AssetManager {
  requested = [];
  return {
    load: (path: string): Promise<AssetContainer> => {
      requested.push(path);
      return Promise.resolve(makeContainer(path === ALT_GLB ? "alt-mesh" : "base-mesh"));
    },
  } as unknown as AssetManager;
}

const champ = (over: Partial<EntityViewState> = {}): EntityViewState => ({
  id: ID,
  kind: 0,
  seatId: 0,
  key: SHARED_KEY,
  teamId: 1,
  x: 0,
  z: 0,
  fx: 0,
  fz: 1,
  alive: true,
  flags: 0,
  ...over,
});

interface SyncOpts {
  loadModels?: boolean;
  cull?: { cx: number; cz: number; maxDistance: number };
}

const sync = (
  reg: EntityViewRegistry,
  e: EntityViewState,
  nowMs: number,
  opts: SyncOpts = {},
): void =>
  reg.sync({
    entities: [e],
    poseFor: (s) => ({ x: s.x, z: s.z, fx: s.fx, fz: s.fz }),
    nowMs,
    dtMs: 16,
    loadModels: opts.loadModels ?? true,
    cull: opts.cull,
  });

/** let the `assets.load(...).then(...)` instantiation land. */
const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

/** names of the CLONED glb meshes currently parented under this entity's view. */
const glbMeshNames = (reg: EntityViewRegistry, id: number): string[] =>
  (reg.getChampionView(id)?.root.getChildMeshes(false) ?? [])
    .map((m) => m.name)
    .filter((n) => n.includes("-mesh"));

/**
 * A CHEAP identity for "is this the same body object as before".
 *
 * NOT `expect(a).not.toBe(b)` on the views themselves: on failure vitest tries
 * to DIFF the two objects, and a ChampionView transitively reaches the whole
 * Babylon scene graph — the runner OOMs at 4 GB before it can print anything.
 * `TransformNode.uniqueId` is Babylon's own per-node serial, so it is still a
 * read off the FINAL object, just one that fits in a number.
 */
const bodyIdOf = (reg: EntityViewRegistry, id: number): number =>
  reg.getChampionView(id)!.root.uniqueId;

const torsoMaterialOf = (reg: EntityViewRegistry, id: number): StandardMaterial =>
  reg
    .getChampionView(id)!
    .root.getChildMeshes(false)
    .find((m) => m.name.endsWith("-torso"))!.material as StandardMaterial;

describe("#249 G2 — a form change rebuilds the body the renderer draws", () => {
  it("MODEL KEY CHANGES → the live view is a different model, and the old glb is gone", async () => {
    // The sim's own channel: `es.key` is `Champions.get(championId).modelKey`,
    // recomputed by the snapshot every tick, so a pair whose halves declare
    // DIFFERENT models arrives as a changed key.
    const reg = new EntityViewRegistry(scene, makeAssets(), {
      modelDocFor: (key) => docFor(key === "champ.alt" ? ALT_GLB : BASE_GLB),
    });

    const e = champ({ key: "champ.base" });
    sync(reg, e, 0);
    await settle();

    const first = reg.getChampionView(ID)!;
    const firstBody = bodyIdOf(reg, ID);
    expect(first.modelKey).toBe("champ.base");
    expect(first.hasGlb).toBe(true);
    expect(glbMeshNames(reg, ID)).toEqual([`${ID}-base-mesh`]);

    // ── 變身 ──────────────────────────────────────────────────────────────
    e.key = "champ.alt";
    sync(reg, e, 16);
    await settle();

    const second = reg.getChampionView(ID)!;
    // NOT `expect(e.key)` — that is the input. This is the object the renderer
    // holds, after the sync that was supposed to swap it.
    expect(bodyIdOf(reg, ID)).not.toBe(firstBody);
    expect(second.modelKey).toBe("champ.alt");
    expect(second.hasGlb).toBe(true);
    // the GEOMETRY on screen is the alternate's, and the base's is not merely
    // hidden behind it — it is not in the view at all.
    expect(glbMeshNames(reg, ID)).toEqual([`${ID}-alt-mesh`]);
    expect(requested).toEqual([BASE_GLB, ALT_GLB]);
    // the retired body is torn down, not orphaned in the scene
    expect(first.root.isDisposed()).toBe(true);
    expect(reg.championCount).toBe(1);
  });

  it("SAME KEY, FORM BIT FLIPS → still rebuilds — the case all four shipped pairs are", async () => {
    // THE REASON THE FLAG BITS EXIST. Verified against content/champions/*.json:
    // godie-e00s/e010 and godie-orkn/o030 are both `champ.sela`, harf/h00w both
    // `champ.skin.barbarian`, nman/n01b both `champ.skin.rogue`. `es.key` is
    // BYTE-IDENTICAL in both forms for every pair that ships today, so a
    // key-only identity would never fire in a real match. The FORM bits are the
    // only channel that can carry it — and `modelOverrideFor` takes the whole
    // entity, so the composition root can answer per form.
    const reg = new EntityViewRegistry(scene, makeAssets(), {
      modelDocFor: () => docFor(BASE_GLB),
      modelOverrideFor: (e) =>
        (e.flags ?? 0) & ENTITY_FLAG.FORM_A ? { glbPath: ALT_GLB } : null,
    });

    const e = champ();
    sync(reg, e, 0);
    await settle();

    const first = reg.getChampionView(ID)!;
    const firstBody = bodyIdOf(reg, ID);
    expect(glbMeshNames(reg, ID)).toEqual([`${ID}-base-mesh`]);

    // ── 變身: the key does NOT move, only the flags ───────────────────────
    e.flags = ENTITY_FLAG.FORM_A;
    sync(reg, e, 16);
    await settle();

    expect(e.key).toBe(SHARED_KEY); // the premise: the key really did not change
    const second = reg.getChampionView(ID)!;
    const secondBody = bodyIdOf(reg, ID);
    expect(secondBody).not.toBe(firstBody);
    expect(second.hasGlb).toBe(true);
    expect(glbMeshNames(reg, ID)).toEqual([`${ID}-alt-mesh`]);
    expect(requested).toEqual([BASE_GLB, ALT_GLB]);
    expect(first.root.isDisposed()).toBe(true);

    // ── and back home ────────────────────────────────────────────────────
    e.flags = 0;
    sync(reg, e, 32);
    await settle();
    expect(bodyIdOf(reg, ID)).not.toBe(secondBody);
    expect(glbMeshNames(reg, ID)).toEqual([`${ID}-base-mesh`]);
    expect(second.root.isDisposed()).toBe(true);
  });

  it("an UNCHANGED entity is never rebuilt — no per-frame flicker, no reload storm", async () => {
    // The other half of the contract, and the more dangerous regression: a
    // rebuild that fires every frame would tear the body down 60×/second (a
    // permanently procedural, permanently flickering champion) and would still
    // pass every assertion in the two tests above.
    const reg = new EntityViewRegistry(scene, makeAssets(), {
      modelDocFor: () => docFor(BASE_GLB),
    });
    const e = champ({ flags: ENTITY_FLAG.FORM_A | ENTITY_FLAG.BURNING });

    sync(reg, e, 0);
    await settle();
    const view = reg.getChampionView(ID)!;
    const bodyId = bodyIdOf(reg, ID);

    for (let i = 1; i <= 5; i++) {
      sync(reg, e, i * 16);
      await settle();
      expect(bodyIdOf(reg, ID)).toBe(bodyId);
    }
    expect(view.root.isDisposed()).toBe(false);
    expect(requested).toEqual([BASE_GLB]); // loaded exactly once
  });

  it("unrelated flags churning does NOT rebuild — only the FORM bits are identity", async () => {
    const reg = new EntityViewRegistry(scene, makeAssets(), {
      modelDocFor: () => docFor(BASE_GLB),
    });
    const e = champ();
    sync(reg, e, 0);
    await settle();
    const bodyId = bodyIdOf(reg, ID);

    for (const f of [
      ENTITY_FLAG.STUNNED,
      ENTITY_FLAG.BURNING | ENTITY_FLAG.SLOWED,
      ENTITY_FLAG.MUD_SWELL | ENTITY_FLAG.MUD_BOSS,
      ENTITY_FLAG.AIRBORNE,
      0,
    ]) {
      e.flags = f;
      sync(reg, e, 16);
      await settle();
      expect(bodyIdOf(reg, ID)).toBe(bodyId);
    }
  });
});

describe("#249 G2 — the rebuild reuses the EXIT SEQUENCE, so no per-entity map is left stale", () => {
  it("TINT: the new body is painted, not left in the old body's bookkeeping", () => {
    // `applyTint` remembers per entity that it has already resolved and applied
    // a tint. If the rebuild does not clear `tinted`, the fresh materials are
    // never painted and a tinted champion turns into a plain team-coloured
    // figure the instant it transforms — silently, forever.
    //
    // The expected value is not hard-coded: an untinted CONTROL registry runs
    // the same entity through the same path, so the assertion is "the alternate
    // body is still darker than the raw team colour by the same amount the base
    // body was", which survives any future change to the tint maths.
    const TINT = { tint: [0.25, 0.5, 0.75] as [number, number, number] };
    const tinted = new EntityViewRegistry(scene, makeAssets(), {
      championTintFor: () => TINT,
    } satisfies ViewContentHooks);
    const control = new EntityViewRegistry(scene, makeAssets(), {
      championTintFor: () => null,
    } satisfies ViewContentHooks);

    const e = champ();
    sync(tinted, e, 0, { loadModels: false });
    sync(control, e, 0, { loadModels: false });

    // mobTint.test.ts's rule: read the material off the MESH after the paint —
    // `applyModelTint` CLONES and reassigns `mesh.material`, so an assertion on
    // the pre-paint object passes whether the paint happened or not.
    const rawR = torsoMaterialOf(control, ID).diffuseColor.r;
    const paintedR = torsoMaterialOf(tinted, ID).diffuseColor.r;
    expect(paintedR).toBeLessThan(rawR); // premise: the base body really is tinted

    // ── 變身 ──────────────────────────────────────────────────────────────
    e.flags = ENTITY_FLAG.FORM_A;
    sync(tinted, e, 16, { loadModels: false });
    sync(control, e, 16, { loadModels: false });

    expect(torsoMaterialOf(control, ID).diffuseColor.r).toBeCloseTo(rawR, 5);
    expect(torsoMaterialOf(tinted, ID).diffuseColor.r).toBeCloseTo(paintedR, 5);
  });

  it("CULL: the new body inherits no stale visibility compare", () => {
    // `culled` caches the last-written enabled state to avoid redundant
    // `setEnabled` calls. A rebuilt view starts ENABLED; if the map still says
    // "already hidden", the compare short-circuits and the new body renders at
    // full size beyond the draw distance — the exact bug the cache exists to
    // make cheap.
    const reg = new EntityViewRegistry(scene, makeAssets(), {});
    const FAR = { cx: 0, cz: 0, maxDistance: 5 };
    const e = champ({ x: 100, z: 0 });

    sync(reg, e, 0, { loadModels: false, cull: FAR });
    expect(reg.getChampionView(ID)!.root.isEnabled()).toBe(false);

    e.flags = ENTITY_FLAG.FORM_A;
    sync(reg, e, 16, { loadModels: false, cull: FAR });
    expect(reg.getChampionView(ID)!.root.isEnabled()).toBe(false);
  });

  it("a rebuild leaves no orphan in the RENDER TREE after ten transforms", async () => {
    // Failure shape ③ read backwards: a body dropped from the registry's map but
    // left parented in the scene keeps being drawn. `ChampionView.root` is named
    // `champ-<entityId>`, so counting LIVE nodes with that name in the scene is a
    // direct read of "how many bodies would this entity render".
    const reg = new EntityViewRegistry(scene, makeAssets(), {
      modelDocFor: () => docFor(BASE_GLB),
    });
    const e = champ();
    const rootName = `champ-${ID}`;

    for (let i = 0; i < 10; i++) {
      e.flags = i % 2 === 0 ? ENTITY_FLAG.FORM_A : 0;
      sync(reg, e, i * 16);
      await settle();
      expect(reg.championCount).toBe(1);
      expect(scene.transformNodes.filter((n) => n.name === rootName)).toHaveLength(1);
    }
    // and the glb sub-root too — the .glb is re-adopted per body, so a leak here
    // would stack ten meshes on top of each other at the same spot.
    expect(scene.transformNodes.filter((n) => n.name === `champ-${ID}-glb`)).toHaveLength(1);
  });
});
