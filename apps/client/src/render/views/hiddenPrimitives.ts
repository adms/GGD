/**
 * hiddenPrimitives — `model@1.hiddenPrimitives`, applied identically by every
 * scene that mounts a champion mesh (GH#368, extracted from ChampionView).
 *
 * owner 2026-08-02:「初號機跟拳四郎一樣 3d model 連著屍體一起」.
 *
 * WC3 hides its `gutz*` blood/corpse geosets with a GEOA/KGAO alpha animation,
 * and #59 established that mdx→glb throws geoset visibility animation away — so
 * the gore becomes a primitive that is drawn forever. The declaration
 * (`content/models/_overlay-hidden-geometry.json`, 16 overlay meshes + the
 * shipped `imported.hero-turtle`) says which primitive index to switch off.
 *
 * ⚠️ WHY THIS IS A MODULE AND NOT THREE COPIES. Until GH#368 the logic lived
 * inside `ChampionView.tryUpgradeToGlb` only, so 商店 / 英靈殿 / 選擇英雄 /
 * 回合勝者卡 / 補給站 all drew the corpse — and, worse, MEASURED it: these gore
 * sheets lie flat at or below the feet, so a bounding box that includes one
 * both lifts the champion off the podium (the sheet touches the floor instead
 * of the feet) and shrinks him (the height being normalized is the sheet's, not
 * the body's). In a 260px preview box that reads exactly as the owner described
 * it: 「許多英雄 3d model 並不是站直,下半身是傾斜」.
 *
 * The guard `hiddenPrimitives.test.ts` loads the REAL .glb through the REAL
 * Babylon loader rather than trusting these comments (CLAUDE.md 第三守則).
 */
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

/**
 * `getHierarchyBoundingVectors` predicate that skips meshes we turned OFF.
 *
 * Babylon's own implementation filters on "has boundingInfo && has vertices" —
 * it does NOT consult `isEnabled`. So without this, a `hiddenPrimitives` entry
 * would stop DRAWING the gore and still let it drive #150's height
 * normalization and #61's ground offset. `isEnabled(false)` deliberately checks
 * only the mesh's own flag: the ancestors are mid-construction at the call
 * sites and their state is not what this question is about.
 *
 * ⛔ Never measure a freshly-mounted champion WITHOUT this predicate. Measured
 * on `Hblm.glb` (賈修): gore floor y=-0.063 vs body floor y=0.025 — hidden but
 * not excluded lifts the whole champion 0.088u into the air (失敗形態 ①).
 */
export const ENABLED_ONLY = (m: AbstractMesh): boolean => m.isEnabled(false);

const EMPTY_HIDDEN: ReadonlySet<number> = new Set<number>();

/**
 * The glTF `mesh.primitives[i]` index a Babylon mesh came from, or -1.
 *
 * Babylon's glTF 2.0 loader gives a multi-primitive mesh one child per
 * primitive, named `${nodeName}_primitive${i}` (`GLTFLoader._loadMeshAsync`);
 * every scene then re-prefixes cloned nodes with its own tag, which leaves that
 * suffix at the END of the string. A single-primitive mesh keeps the plain node
 * name and returns -1 — hiding a model's only primitive would be "render
 * nothing", which `hiddenPrimitives` is not for.
 */
export function gltfPrimitiveIndexOf(name: string): number {
  const m = /_primitive(\d+)$/.exec(name);
  return m ? Number(m[1]) : -1;
}

/** Declared hidden primitive indices as a lookup. Absent/empty ⇒ hide nothing. */
export function hiddenPrimitiveIndexSet(list: readonly number[] | undefined): ReadonlySet<number> {
  return list && list.length > 0 ? new Set(list) : EMPTY_HIDDEN;
}

/**
 * Switch off every declared gore primitive under a freshly-mounted model and
 * report which meshes are still drawn — the ONLY list a caller may go on to
 * flash, tint or measure.
 *
 * Returns the visible meshes rather than mutating a caller's array so the
 * "which meshes survived" answer cannot drift from the "which were disabled"
 * one. Callers with nothing to collect can ignore the return value; they still
 * must pass {@link ENABLED_ONLY} to every bounding-box call afterwards.
 */
export function applyHiddenPrimitives(
  meshes: readonly AbstractMesh[],
  list: readonly number[] | undefined,
): AbstractMesh[] {
  const hidden = hiddenPrimitiveIndexSet(list);
  const visible: AbstractMesh[] = [];
  for (const mesh of meshes) {
    if (hidden.size > 0 && hidden.has(gltfPrimitiveIndexOf(mesh.name))) {
      mesh.setEnabled(false);
      continue;
    }
    visible.push(mesh);
  }
  return visible;
}
