/**
 * 隱形的畫面那一半 —— the render guard (owner 2026-07-30 「選小的就好」).
 *
 * Two halves, and the second is the one that matters:
 *
 *  1. `stealthVisualFor` — the pure rule (which alpha, and does the bar draw).
 *  2. **A REAL `ChampionView` ON A REAL BABYLON SCENE**: the numbers from (1)
 *     are read back off `mesh.visibility` after `update()` has run. A test that
 *     only asserted (1) is 失敗形態 ③ — delete `applyStealth`'s body and the
 *     hero stays fully opaque on screen with every assertion still green.
 *
 * The read-back also catches the specific hazard this feature has: `visibility`
 * has TWO writers (this and the #220 corpse dissolve), and the last one to run
 * wins. The "a corpse is never hidden" case below is what pins their priority.
 *
 * MUTATION LOG (verified: break → red → restore):
 *   1. `applyStealth` body emptied            → 「敵方隱形英雄的網格真的變透明」 red
 *   2. `stealthVisualFor` always returns 1    → both alpha cases red
 *   3. `hideEnemyHealthBar` ignored           → 「敵方隱形時不畫血條」 red
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { DEFAULT_STEALTH_RULES } from "@ggd/shared/sim/stealth";
import { ChampionView } from "./views/ChampionView";
import { applyStealthDoc, stealthRules, stealthVisualFor } from "./stealthVisual";

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
beforeEach(() => applyStealthDoc(null));

/** The opacity actually drawn: Babylon composes `material.alpha × visibility`. */
function drawnVisibility(view: ChampionView): number {
  const meshes = view.root.getChildMeshes(false);
  expect(meshes.length).toBeGreaterThan(0); // guard the guard: an empty body proves nothing
  return meshes[0]!.visibility;
}

describe("stealthVisualFor —— 規則本身", () => {
  it("沒有隱形的身體:alpha 恰好是 1、血條照畫（這個 1 是恆等式,不是巧合）", () => {
    // Exactly 1 is what lets the registry write this every frame without
    // fighting the #220 dissolve. `toBe`, not `toBeCloseTo`.
    expect(stealthVisualFor(false, false)).toEqual({ alpha: 1, healthBar: true });
    expect(stealthVisualFor(false, true)).toEqual({ alpha: 1, healthBar: true });
  });

  it("己方 vs 敵方是兩個不同的答案（這是這個功能的全部）", () => {
    const ally = stealthVisualFor(true, true);
    const foe = stealthVisualFor(true, false);
    expect(ally.alpha).toBe(DEFAULT_STEALTH_RULES.allyAlpha);
    expect(foe.alpha).toBe(DEFAULT_STEALTH_RULES.enemyAlpha);
    expect(ally.alpha).toBeGreaterThan(foe.alpha);
    // 自己人看得到自己 —— 0 會讓這支英雄不能玩
    expect(ally.alpha).toBeGreaterThan(0);
    expect(ally.healthBar).toBe(true);
    expect(foe.healthBar).toBe(false);
  });

  it("血條是獨立的決定,不是「alpha 是不是 0」的推論", () => {
    // 半透明鬼影 (enemyAlpha 0.15) + 藏血條: a bar over the ghost would be a
    // perfect position readout, i.e. exactly the thing being hidden.
    applyStealthDoc({ enemyAlpha: 0.15, hideEnemyHealthBar: true });
    const foe = stealthVisualFor(true, false);
    expect(foe.alpha).toBeCloseTo(0.15, 6);
    expect(foe.healthBar).toBe(false);
    // …and the operator can have the opposite: visible bar, invisible body.
    applyStealthDoc({ enemyAlpha: 0, hideEnemyHealthBar: false });
    expect(stealthVisualFor(true, false)).toEqual({ alpha: 0, healthBar: true });
  });

  it("缺文件 / null → 出貨表(不是空物件),而且換場不會殘留上一場的覆寫", () => {
    applyStealthDoc({ allyAlpha: 0.99 });
    expect(stealthRules().allyAlpha).toBeCloseTo(0.99, 6);
    applyStealthDoc(null);
    expect(stealthRules()).toEqual(DEFAULT_STEALTH_RULES);
  });
});

describe("ChampionView —— 數字真的寫到 Babylon 網格上", () => {
  it("敵方隱形英雄的網格真的變透明（讀回 mesh.visibility）", () => {
    const view = new ChampionView(scene, 101, "champ.sela", 1);
    view.setPose(0, 0, 0, 1);
    view.update("idle", 0, 16);
    expect(drawnVisibility(view)).toBe(1); // anti-vacuous: opaque before

    view.setStealthAlpha(stealthVisualFor(true, false).alpha);
    view.update("idle", 16, 16);
    expect(drawnVisibility(view)).toBe(DEFAULT_STEALTH_RULES.enemyAlpha);
    expect(view.stealthOpacity).toBe(DEFAULT_STEALTH_RULES.enemyAlpha);
    view.dispose?.();
  });

  it("己方隱形英雄是半透明,不是消失 —— 而且 alpha 不同於敵方那一個", () => {
    const view = new ChampionView(scene, 102, "champ.sela", 1);
    view.setPose(0, 0, 0, 1);
    view.setStealthAlpha(stealthVisualFor(true, true).alpha);
    view.update("idle", 0, 16);
    const drawn = drawnVisibility(view);
    expect(drawn).toBe(DEFAULT_STEALTH_RULES.allyAlpha);
    expect(drawn).toBeGreaterThan(0);
    expect(drawn).toBeLessThan(1);
    view.dispose?.();
  });

  it("破隱之後網格回到完全不透明（不是卡在半透明）", () => {
    const view = new ChampionView(scene, 103, "champ.sela", 1);
    view.setPose(0, 0, 0, 1);
    view.setStealthAlpha(0.35);
    view.update("idle", 0, 16);
    expect(drawnVisibility(view)).toBeCloseTo(0.35, 6);
    view.setStealthAlpha(1);
    view.update("idle", 16, 16);
    expect(drawnVisibility(view)).toBe(1);
    view.dispose?.();
  });

  it("隱形時腳下的隊伍光環 / 影子也關掉 —— 它們是位置線索", () => {
    const view = new ChampionView(scene, 104, "champ.sela", 1);
    view.setPose(0, 0, 0, 1);
    view.update("idle", 0, 16);
    const ring = view.root.getChildTransformNodes(false).concat(view.root.getChildMeshes(false));
    const enabledBefore = ring.filter((n) => n.isEnabled()).length;
    view.setStealthAlpha(0);
    view.update("idle", 16, 16);
    const enabledAfter = ring.filter((n) => n.isEnabled()).length;
    // Not an exact count (the body's own meshes stay ENABLED at visibility 0):
    // the claim is that switching stealth on switches something OFF.
    expect(enabledAfter).toBeLessThan(enabledBefore);
    view.dispose?.();
  });

  it("屍體永遠看得見 —— #220 的溶解贏過隱形（復活圈要看得到那具身體）", () => {
    const view = new ChampionView(scene, 105, "champ.sela", 1);
    view.setPose(0, 0, 0, 1);
    view.setStealthAlpha(0); // as if the server had said "hidden"
    view.update("idle", 0, 16);
    expect(drawnVisibility(view)).toBe(0);
    // now he dies: the dissolve owns `visibility` and starts the body OPAQUE for
    // its 3-second lie-down, so the corpse is visible even though the stealth
    // wish is still 0. (The sim agrees — `isHidden` returns false for a corpse —
    // so in a real match the flag would already be off; this pins the RENDER
    // priority so the two can never fight.)
    view.noteDeath(100);
    view.update("death", 100, 16);
    expect(drawnVisibility(view)).toBe(1);
    view.dispose?.();
  });
});
