/**
 * 一般殭屍 / 特殊殭屍 / 殭屍王 MUST BE THREE DIFFERENT SIZES ON SCREEN (task #262).
 *
 * ── THE DEFECT THIS EXISTS TO CLOSE (failure shape ① / ⑦) ──────────────────
 *
 * #262 shipped three mob model docs — `champ.godie-zombiex` (scale 1.0),
 * `champ.mob.zombie-special` (1.22), `champ.mob.zombie-king` (2.45) — and routed
 * the sim's `MobComp.kind` onto the wire through `EntityState.key`, because the
 * entity schema has no radius/scale field. Its guard asserted that the three
 * kinds resolve to three DISTINCT model keys, and concluded 「看得出來是王」.
 *
 * THAT IS AN ATTRIBUTE, NOT THE BEHAVIOUR. All three docs point at the SAME
 * `assets/models/champions/blocky-undead.glb`, and since task #150
 * `ChampionView.tryUpgradeToGlb` HEIGHT-NORMALIZES every adopted .glb to
 * TARGET_HEIGHT and ignores `doc.scale` outright — the on-screen size comes from
 * `relativeScale`, which is resolved per CHAMPION through the seat table. A mob
 * has `seatId === -1`, so it got no override and normalized to 1.0×. Three keys,
 * three docs, ONE silhouette: the 6,000 hp king rendered at exactly the height of
 * the 100 hp zombie beside it, and every distinct-key assertion stayed green.
 *
 * So this test asserts the RENDERED SIZE, through the real registry, the real
 * ChampionView normalization and the real GameApp seam
 * (`mobModelSizeOverride` + `modelDocFor`), on the SHIPPED docs and the SHIPPED
 * arena-rules keys read off disk — not a fixture. A correct implementation and
 * the pre-fix one give DIFFERENT numbers here (4.41u vs 1.8u for the king), so
 * the assertion can tell them apart, which is the whole point.
 *
 * Runs on Babylon's NullEngine (headless), like the other render tests.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
import { ENTITY_KIND } from "@ggd/shared/protocol/schema";
import { mobModelKeyFor, mobRulesFromConfig, type MobRules } from "@ggd/shared/sim/mobs";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content/schema/config";
import {
  EntityViewRegistry,
  mobModelSizeOverride,
  relativeScaleOf,
  type EntityViewState,
} from "./EntityViewRegistry";
import { TARGET_HEIGHT } from "./views/ChampionView";
import type { AssetManager } from "./AssetManager";

const CONTENT = join(__dirname, "../../../../content");

/** the SHIPPED model doc for `key`, read off disk (⑤: test what ships). */
function shippedDoc(key: string): ModelDoc {
  return JSON.parse(readFileSync(join(CONTENT, "models", `${key}.json`), "utf8")) as ModelDoc;
}

/** the SHIPPED arena-rules mobWaves block, armed exactly as a match arms it. */
const SHIPPED_RULES: MobRules = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, 1 / 30);

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

/** a fresh unit-box .glb container — native height 1, so the normalization
 *  factor is exactly TARGET_HEIGHT and declaredScale reads back noise-free. */
function makeContainer(): AssetContainer {
  const container = new AssetContainer(scene);
  const mesh = MeshBuilder.CreateBox("undead-body", { size: 1 }, scene);
  container.meshes.push(mesh);
  container.rootNodes.push(mesh);
  const g = new AnimationGroup("idle", scene);
  const a = new Animation("idle-y", "rotation.y", 60, Animation.ANIMATIONTYPE_FLOAT);
  a.setKeys([
    { frame: 0, value: 0 },
    { frame: 1, value: 0 },
  ]);
  g.addTargetedAnimation(a, mesh);
  container.animationGroups.push(g);
  container.removeAllFromScene();
  return container;
}

const mob = (id: number, key: string): EntityViewState => ({
  id,
  kind: ENTITY_KIND.MOB,
  seatId: -1, // ← the whole reason the champion override path cannot cover this
  key,
  teamId: 9,
  x: id,
  z: 0,
  fx: 1,
  fz: 0,
  alive: true,
});

const passthrough = (e: EntityViewState) => ({ x: e.x, z: e.z, fx: e.fx, fz: e.fz });

describe("殭屍王 / 特殊殭屍 render size (task #262, failure shape ①)", () => {
  it("the three SHIPPED mob docs really do declare three different scales", () => {
    cover("mob-special-visible");
    const normal = shippedDoc(mobModelKeyFor(SHIPPED_RULES, "normal"));
    const special = shippedDoc(mobModelKeyFor(SHIPPED_RULES, "special"));
    const king = shippedDoc(mobModelKeyFor(SHIPPED_RULES, "boss"));
    // Same mesh — which is exactly why height-normalization collapses them.
    expect(special.glbPath).toBe(normal.glbPath);
    expect(king.glbPath).toBe(normal.glbPath);
    expect(king.scale).toBeGreaterThan(special.scale);
    expect(special.scale).toBeGreaterThan(normal.scale);
  });

  it("mobModelSizeOverride turns a MOB doc's scale into the relative multiplier — and leaves champions alone", () => {
    cover("mob-special-visible");
    const king = shippedDoc("champ.mob.zombie-king");
    expect(relativeScaleOf(mobModelSizeOverride({ kind: ENTITY_KIND.MOB }, king))).toBe(king.scale);
    // A CHAMPION with the very same doc must NOT pick it up — #150's
    // normalization owns champion size, and this branch must not leak into it.
    expect(mobModelSizeOverride({ kind: 0 }, king)).toBeNull();
    // degenerate docs fall back to the normalized default rather than 0×/NaN×
    expect(mobModelSizeOverride({ kind: ENTITY_KIND.MOB }, null)).toBeNull();
    expect(mobModelSizeOverride({ kind: ENTITY_KIND.MOB }, { ...king, scale: 0 })).toBeNull();
    expect(mobModelSizeOverride({ kind: ENTITY_KIND.MOB }, { ...king, scale: NaN })).toBeNull();
  });

  it("END TO END: the king renders BIGGER than the special, which renders bigger than the zombie", async () => {
    cover("mob-special-visible");
    // The GameApp seam, verbatim: key → shipped model doc → mobModelSizeOverride.
    const docs = new Map<string, ModelDoc>();
    for (const kind of ["normal", "special", "boss"] as const) {
      const key = mobModelKeyFor(SHIPPED_RULES, kind);
      docs.set(key, shippedDoc(key));
    }
    const modelDocFor = (key: string): ModelDoc | null => docs.get(key) ?? null;

    const assets = { load: () => Promise.resolve(makeContainer()) } as unknown as AssetManager;
    const registry = new EntityViewRegistry(scene, assets, {
      modelDocFor,
      modelOverrideFor: (e) => mobModelSizeOverride(e, modelDocFor(e.key)),
    });

    const normalKey = mobModelKeyFor(SHIPPED_RULES, "normal");
    const specialKey = mobModelKeyFor(SHIPPED_RULES, "special");
    const kingKey = mobModelKeyFor(SHIPPED_RULES, "boss");
    registry.sync({
      entities: [mob(940, normalKey), mob(941, specialKey), mob(942, kingKey)],
      poseFor: passthrough,
      nowMs: 0,
      dtMs: 16,
    });
    for (let i = 0; i < 6; i++) await Promise.resolve(); // flush the async adopt

    const normal = registry.getChampionView(940)!.declaredScale!;
    const special = registry.getChampionView(941)!.declaredScale!;
    const king = registry.getChampionView(942)!.declaredScale!;

    // THE DISCRIMINATING ASSERTION. Before the fix all three read exactly
    // TARGET_HEIGHT (1.8) and every one of these three lines fails.
    expect(king).toBeGreaterThan(special);
    expect(special).toBeGreaterThan(normal);
    // …and by the amount the docs actually declare, not merely "different".
    expect(normal).toBeCloseTo(TARGET_HEIGHT * docs.get(normalKey)!.scale, 5);
    expect(special).toBeCloseTo(TARGET_HEIGHT * docs.get(specialKey)!.scale, 5);
    expect(king).toBeCloseTo(TARGET_HEIGHT * docs.get(kingKey)!.scale, 5);
    // a king that is only marginally taller is not 「看得出來是王」
    expect(king / normal).toBeGreaterThanOrEqual(2);
    registry.dispose();
  });
});
