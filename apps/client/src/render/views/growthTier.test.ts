/**
 * #244 LAYER 4 — the boss reveal. Three things the design says are easy to get
 * wrong, each pinned here:
 *
 *   1. THE GROUND SHIFT. `tryUpgradeToGlb` seats the glb with
 *      `position.y = -min.y` measured in the OLD scaled frame. Growing to 1.25×
 *      without re-measuring sinks a quarter of the body through the floor.
 *   2. THE TEAM RING MUST NOT GROW. #231 calls team-colour legibility the
 *      highest-risk surface of the voxel work; the ring is a UI affordance that
 *      has to be the same size on every champion. The SHADOW does grow (a
 *      bigger thing casts a bigger shadow, and from the fixed camera that is
 *      most of what sells the size read).
 *   3. THE READABILITY FLOOR. #231 clamps outfitPrimary luminance to ≥0.16 and
 *      pins ≥0.045 after the darkest shipped champion tint (狂戰士 ×0.3137).
 *      Tier 2's ×0.60 on top of that would land at ≈0.030 — an unreadable
 *      blob — so `mudTintFor` clamps the composed multiply.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { Animation } from "@babylonjs/core/Animations/animation";
import type { ModelDoc } from "@ggd/shared/content";
import { ENTITY_FLAG, GROWTH_TIER_STACKS, growthTierFromFlags } from "@ggd/shared/protocol/schema";
import { ChampionView } from "./ChampionView";
import type { AssetManager } from "../AssetManager";
import {
  GROWTH_SCALE_EASE_MS,
  GROWTH_TIER_MUD,
  GROWTH_TIER_SCALE,
  MIN_COMPOSED_LUM,
  MIN_SKIN_LUM,
  mudTintFor,
  relLuminance,
} from "./growthTier";

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

/** The darkest tint any shipped champion wears (狂戰士), pinned by #49/#231. */
const DARKEST_CHAMPION_TINT: readonly [number, number, number] = [0.3137, 0.3137, 0.3137];

const makeContainer = (footY: number): AssetContainer => {
  const container = new AssetContainer(scene);
  const mesh = MeshBuilder.CreateBox(`grow-body-${footY}-${Math.random()}`, { size: 1 }, scene);
  mesh.position.y = footY + 0.5; // unit box → feet (min.y) = footY
  container.meshes.push(mesh);
  container.rootNodes.push(mesh);
  const group = new AnimationGroup("Idle", scene);
  const anim = new Animation("Idle-y", "rotation.y", 60, Animation.ANIMATIONTYPE_FLOAT);
  anim.setKeys([
    { frame: 0, value: 0 },
    { frame: 30, value: 0 },
  ]);
  group.addTargetedAnimation(anim, mesh);
  container.animationGroups.push(group);
  container.removeAllFromScene();
  return container;
};

const DOC: ModelDoc = {
  id: "model.test",
  schema: "model@1",
  glbPath: "assets/models/champions/blocky-mage.glb",
  scale: 1,
  collisionRadius: 0.5,
  clipMap: { idle: "Idle", run: "Idle", attack: "Idle", cast: "Idle", hurt: "Idle", death: "Idle" },
} as ModelDoc;

const assetsFor = (c: AssetContainer): AssetManager =>
  ({ load: (): Promise<AssetContainer> => Promise.resolve(c) }) as unknown as AssetManager;

/** Lowest world-space Y over the BODY meshes (ground marks excluded). */
const worldMinY = (view: ChampionView): number => {
  let min = Infinity;
  for (const m of view.root.getChildMeshes(false)) {
    if (!m.isEnabled()) continue;
    if (m.name.includes("shadow") || m.name.includes("teamring") || m.name.includes("mudring"))
      continue;
    m.computeWorldMatrix(true);
    const y = m.getBoundingInfo().boundingBox.minimumWorld.y;
    if (y < min) min = y;
  }
  return min;
};

const meshNamed = (view: ChampionView, suffix: string) =>
  view.root.getChildMeshes(false).find((m) => m.name.endsWith(suffix));

describe("#244 the tier is two flag bits, decoded in one place", () => {
  it("maps flags → 0/1/2 and pins the owner's 20 / 50 thresholds", () => {
    cover("growth-tier-flags");
    expect(GROWTH_TIER_STACKS).toEqual([20, 50]);
    expect(growthTierFromFlags(0)).toBe(0);
    expect(growthTierFromFlags(ENTITY_FLAG.BURNING)).toBe(0); // unrelated bits ignored
    expect(growthTierFromFlags(ENTITY_FLAG.MUD_SWELL)).toBe(1);
    expect(growthTierFromFlags(ENTITY_FLAG.MUD_SWELL | ENTITY_FLAG.MUD_BOSS)).toBe(2);
    // tier 2 alone still reads as 2 — a client that only knows tier 1 degrades
    expect(growthTierFromFlags(ENTITY_FLAG.MUD_BOSS)).toBe(2);
  });
});

describe("#244 the body grows; the team ring never does", () => {
  it("scales the procedural figure and its shadow, not the team ring", () => {
    cover("growth-tier-scale");
    const view = new ChampionView(scene, 9101, "champ.sela", 1);
    const ring = meshNamed(view, "-teamring")!;
    const shadow = meshNamed(view, "-shadow")!;
    const ringBefore = ring.scaling.x;
    view.setGrowthTier(2, 0);
    view.update("idle", GROWTH_SCALE_EASE_MS, 16);
    expect(view.appliedGrowthTier).toBe(2);
    expect(shadow.scaling.x).toBeCloseTo(GROWTH_TIER_SCALE[2], 4);
    expect(ring.scaling.x).toBeCloseTo(ringBefore, 6); // UNTOUCHED — team legibility
    view.dispose();
  });

  it("tier 1 is a smaller swell than tier 2, and tier 0 is exactly 1.0", () => {
    cover("growth-tier-monotone");
    expect(GROWTH_TIER_SCALE[0]).toBe(1);
    expect(GROWTH_TIER_SCALE[1]).toBeGreaterThan(GROWTH_TIER_SCALE[0]);
    expect(GROWTH_TIER_SCALE[2]).toBeGreaterThan(GROWTH_TIER_SCALE[1]);
  });

  it("a grown .glb still stands ON the floor — the re-ground that is easy to miss", async () => {
    cover("growth-tier-reground");
    const view = new ChampionView(scene, 9102, "champ.sela", 0);
    view.setPose(0, 0, 0, 1);
    view.tryUpgradeToGlb(assetsFor(makeContainer(0.72)), DOC);
    await Promise.resolve();
    await Promise.resolve();
    expect(view.hasGlb).toBe(true);
    expect(worldMinY(view)).toBeCloseTo(0, 1);
    const declared = view.declaredScale!;
    view.setGrowthTier(2, 0);
    view.update("idle", GROWTH_SCALE_EASE_MS, 16);
    // sunk into the floor is the failure mode; it must still be seated at y≈0
    expect(worldMinY(view)).toBeCloseTo(0, 1);
    // and the scale composed off the STORED declared value, never compounding
    view.update("idle", GROWTH_SCALE_EASE_MS * 4, 16);
    expect(view.declaredScale).toBeCloseTo(declared, 6);
    view.dispose();
  });

  it("re-entering tier 0 returns the body to its declared size (no drift)", () => {
    cover("growth-tier-reversible");
    const view = new ChampionView(scene, 9103, "champ.sela", 0);
    const shadow = meshNamed(view, "-shadow")!;
    view.setGrowthTier(2, 0);
    view.update("idle", GROWTH_SCALE_EASE_MS, 16);
    view.setGrowthTier(0, GROWTH_SCALE_EASE_MS);
    view.update("idle", GROWTH_SCALE_EASE_MS * 3, 16);
    expect(shadow.scaling.x).toBeCloseTo(1, 4);
    view.dispose();
  });
});

describe("#244 the tier-2 black-mud foot ring", () => {
  it("is built lazily on the tier-2 edge and never before", () => {
    cover("growth-tier-ring-lazy");
    const view = new ChampionView(scene, 9104, "champ.sela", 0);
    expect(view.hasMudRing).toBe(false);
    view.setGrowthTier(1, 0);
    expect(view.hasMudRing).toBe(false); // tier 1 is colour + swell only
    view.setGrowthTier(2, 0);
    expect(view.hasMudRing).toBe(true);
    const ring = meshNamed(view, "-mudring")!;
    expect(ring.isPickable).toBe(false);
    // layered between the blob shadow (0.03) and the team ring (0.04) is wrong;
    // it sits UNDER the shadow so the shadow still reads on top of it
    expect(ring.position.y).toBeLessThan(meshNamed(view, "-teamring")!.position.y);
    view.dispose();
  });

  it("fades in rather than popping, and is off again below tier 2", () => {
    cover("growth-tier-ring-fade");
    const view = new ChampionView(scene, 9105, "champ.sela", 0);
    view.setGrowthTier(2, 1000);
    view.update("idle", 1000, 16);
    const mat = meshNamed(view, "-mudring")!.material!;
    const atStart = mat.alpha;
    view.update("idle", 1400, 16);
    expect(mat.alpha).toBeGreaterThan(atStart);
    view.setGrowthTier(0, 2000);
    view.update("idle", 2000, 16);
    expect(mat.alpha).toBe(0);
    view.dispose();
  });

  it("a dissolved corpse leaves no mud ring behind", () => {
    cover("growth-tier-ring-corpse");
    const view = new ChampionView(scene, 9106, "champ.sela", 0);
    view.setPose(0, 0, 0, 1);
    view.setGrowthTier(2, 0);
    view.update("idle", 0, 16);
    const ring = meshNamed(view, "-mudring")!;
    expect(ring.isEnabled()).toBe(true);
    view.noteDeath(0);
    view.update("death", 20_000, 16); // well past the 3 s lie + rise
    expect(ring.isEnabled()).toBe(false);
    view.dispose();
  });
});

describe("#244 the readability floor (#231's highest-risk surface)", () => {
  it("tier 2 on an UNTINTED champion applies the authored mud multiply", () => {
    cover("growth-tier-mud-plain");
    const t = mudTintFor(2, null);
    expect(t[0]).toBeCloseTo(GROWTH_TIER_MUD[2]![0], 6);
    expect(t[1]).toBeCloseTo(GROWTH_TIER_MUD[2]![1], 6);
    expect(t[2]).toBeCloseTo(GROWTH_TIER_MUD[2]![2], 6);
  });

  it("tier 2 on the DARKEST shipped tint stays above the 0.045 composed floor", () => {
    cover("growth-tier-lum-floor");
    for (const tier of [1, 2] as const) {
      const composed = mudTintFor(tier, DARKEST_CHAMPION_TINT);
      // worst case: the darkest legal skin colour #231 will generate
      const onScreen = relLuminance(composed) * MIN_SKIN_LUM;
      expect(onScreen).toBeGreaterThanOrEqual(MIN_COMPOSED_LUM - 1e-9);
    }
    // …and the unclamped product really would have breached it, so the clamp
    // is load-bearing rather than decorative.
    const naive = GROWTH_TIER_MUD[2]!.map((c, i) => c * DARKEST_CHAMPION_TINT[i]!) as unknown as [
      number,
      number,
      number,
    ];
    expect(relLuminance(naive) * MIN_SKIN_LUM).toBeLessThan(MIN_COMPOSED_LUM);
  });

  it("tier 0 is the identity — an untinted champion is never touched", () => {
    cover("growth-tier-identity");
    expect(mudTintFor(0, null)).toEqual([1, 1, 1]);
    expect(mudTintFor(0, DARKEST_CHAMPION_TINT)).toEqual([
      DARKEST_CHAMPION_TINT[0],
      DARKEST_CHAMPION_TINT[1],
      DARKEST_CHAMPION_TINT[2],
    ]);
  });

  it("darker tier ⇒ darker composed colour on a normal champion", () => {
    cover("growth-tier-monotone-colour");
    const l0 = relLuminance(mudTintFor(0, null));
    const l1 = relLuminance(mudTintFor(1, null));
    const l2 = relLuminance(mudTintFor(2, null));
    expect(l1).toBeLessThan(l0);
    expect(l2).toBeLessThan(l1);
  });
});
