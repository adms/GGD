/**
 * #244 — the growth tier THROUGH the registry, which is where the ordering
 * hazard lives.
 *
 * The mud multiply is folded INTO the #49 champion tint (see `composeGrowth`)
 * rather than painted by a second painter. That is the whole reason there is no
 * clobber race: `applyModelTint.paint()` always recomputes from the material's
 * remembered SOURCE colour, so a tier change repaints from base instead of
 * compounding, and dropping back to tier 0 restores the champion's own colour
 * exactly. These tests pin that composition law.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ENTITY_FLAG } from "@ggd/shared/protocol/schema";
import { EntityViewRegistry, type EntityViewState } from "./EntityViewRegistry";
import { AssetManager } from "./AssetManager";
import { mudTintFor } from "./views/growthTier";
import { tintedMeshes } from "./views/modelTint";

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

const BERSERKER_TINT: readonly [number, number, number] = [0.3137, 0.3137, 0.3137];

const champ = (id: number, flags = 0): EntityViewState => ({
  id,
  kind: 0,
  seatId: 0,
  key: "champ.thorne",
  teamId: 1,
  x: 0,
  z: 0,
  fx: 0,
  fz: 1,
  alive: true,
  flags,
});

const sync = (reg: EntityViewRegistry, e: EntityViewState, nowMs: number): void =>
  reg.sync({
    entities: [e],
    poseFor: (s) => ({ x: s.x, z: s.z, fx: s.fx, fz: s.fz }),
    nowMs,
    dtMs: 16,
    loadModels: false,
  });

const torsoOf = (reg: EntityViewRegistry, id: number): StandardMaterial =>
  reg
    .getChampionView(id)!
    .root.getChildMeshes(false)
    .find((m) => m.name.endsWith("-torso"))!.material as StandardMaterial;

describe("#244 growth tier composes with the #49 tint, never fights it", () => {
  it("an UNTINTED champion at tier 0 is still never touched (the 93-of-113 case)", () => {
    cover("growth-registry-untouched");
    const reg = new EntityViewRegistry(scene, new AssetManager(scene), {
      championTintFor: () => null,
    });
    const e = champ(9201);
    sync(reg, e, 0);
    const before = reg.getChampionView(9201)!.root.getChildMeshes(false).find((m) =>
      m.name.endsWith("-torso"),
    )!.material;
    sync(reg, e, 16);
    sync(reg, e, 32);
    expect(
      reg.getChampionView(9201)!.root.getChildMeshes(false).find((m) => m.name.endsWith("-torso"))!
        .material,
    ).toBe(before);
    expect(tintedMeshes(reg.getChampionView(9201)!.root)).toHaveLength(0);
    reg.dispose();
  });

  it("crossing 20 stacks darkens an untinted champion; crossing 50 darkens it further", () => {
    cover("growth-registry-darkens");
    const reg = new EntityViewRegistry(scene, new AssetManager(scene), {
      championTintFor: () => null,
    });
    const id = 9202;
    sync(reg, champ(id), 0);
    const stock = torsoOf(reg, id).diffuseColor.clone();

    sync(reg, champ(id, ENTITY_FLAG.MUD_SWELL), 16);
    const t1 = torsoOf(reg, id).diffuseColor.clone();
    expect(t1.g).toBeLessThan(stock.g);

    sync(reg, champ(id, ENTITY_FLAG.MUD_SWELL | ENTITY_FLAG.MUD_BOSS), 32);
    const t2 = torsoOf(reg, id).diffuseColor.clone();
    expect(t2.g).toBeLessThan(t1.g);
    // …and the value is exactly base × the tier's clamped multiply — proof it
    // recomputed from BASE and did not compound tier 1 into tier 2.
    expect(t2.g).toBeCloseTo(stock.g * mudTintFor(2, null)[1], 5);
    reg.dispose();
  });

  it("dropping back to tier 0 restores the champion's own colour exactly", () => {
    cover("growth-registry-reversible");
    const reg = new EntityViewRegistry(scene, new AssetManager(scene), {
      championTintFor: () => ({ tint: BERSERKER_TINT }),
    });
    const id = 9203;
    sync(reg, champ(id), 0);
    const tinted = torsoOf(reg, id).diffuseColor.clone();
    sync(reg, champ(id, ENTITY_FLAG.MUD_SWELL | ENTITY_FLAG.MUD_BOSS), 16);
    expect(torsoOf(reg, id).diffuseColor.g).not.toBeCloseTo(tinted.g, 4);
    sync(reg, champ(id), 32);
    expect(torsoOf(reg, id).diffuseColor.g).toBeCloseTo(tinted.g, 5);
    reg.dispose();
  });

  it("the tier reaches the VIEW's size too, off the same flags word", () => {
    cover("growth-registry-size");
    const reg = new EntityViewRegistry(scene, new AssetManager(scene), {
      championTintFor: () => null,
    });
    const id = 9204;
    sync(reg, champ(id), 0);
    expect(reg.getChampionView(id)!.appliedGrowthTier).toBe(0);
    sync(reg, champ(id, ENTITY_FLAG.MUD_SWELL | ENTITY_FLAG.MUD_BOSS), 16);
    expect(reg.getChampionView(id)!.appliedGrowthTier).toBe(2);
    expect(reg.getChampionView(id)!.hasMudRing).toBe(true);
    reg.dispose();
  });

  it("an entity with NO flags field behaves exactly like tier 0 (back-compat)", () => {
    cover("growth-registry-absent-flags");
    const reg = new EntityViewRegistry(scene, new AssetManager(scene), {
      championTintFor: () => null,
    });
    const bare: EntityViewState = { ...champ(9205) };
    delete (bare as { flags?: number }).flags;
    sync(reg, bare, 0);
    expect(reg.getChampionView(9205)!.appliedGrowthTier).toBe(0);
    expect(tintedMeshes(reg.getChampionView(9205)!.root)).toHaveLength(0);
    reg.dispose();
  });
});
