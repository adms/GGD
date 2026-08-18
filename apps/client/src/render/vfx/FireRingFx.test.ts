/**
 * The fire ring's world band (task #195) — 「圈圈外會有激烈火焰」.
 *
 * The Babylon half needs a GPU-less null engine, so what is locked here is the
 * DECISION LAYER: how many emitters the budget buys, how the band's alpha
 * tracks the shrink, and the three structural promises that would otherwise
 * fail silently — no `W3xEmitterRig` (its 12 s cap would put a 20 s band out
 * two thirds of the way through), no glb-node anchoring (#131), and a budget
 * re-read every tick rather than snapshotted at construction.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BAND_TESSELLATION,
  BAND_THICKNESS,
  FLAME_DOC_IDS,
  MAX_FLAME_EMITTERS,
  MIN_FLAME_EMITTERS,
  bandAlphaForProgress,
  bandRingPositions,
  flameEmitterCount,
} from "./FireRingFx";

const RAW = readFileSync(join(__dirname, "FireRingFx.ts"), "utf8");
/** comments stripped, so PROSE about a banned symbol does not count as using it */
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("fire-ring band budget + look (firering-shrink)", () => {
  it("stands 8..12 emitters on the rim, scaling with the particle budget", () => {
    cover("firering-shrink");
    expect(flameEmitterCount(1)).toBe(MAX_FLAME_EMITTERS);
    expect(flameEmitterCount(0)).toBe(MIN_FLAME_EMITTERS);
    // the adaptive ladder's floor (0.3) still buys a readable wall of fire
    expect(flameEmitterCount(0.3)).toBeGreaterThanOrEqual(MIN_FLAME_EMITTERS);
    expect(flameEmitterCount(0.3)).toBeLessThan(MAX_FLAME_EMITTERS);
    // garbage in never produces a blank ring
    expect(flameEmitterCount(Number.NaN)).toBe(MAX_FLAME_EMITTERS);
    expect(flameEmitterCount(-5)).toBe(MIN_FLAME_EMITTERS);
    expect(flameEmitterCount(99)).toBe(MAX_FLAME_EMITTERS);
  });

  it("uses the four real WC3 flame/smoke layers", () => {
    cover("firering-shrink");
    expect(FLAME_DOC_IDS).toHaveLength(4);
    for (const id of FLAME_DOC_IDS) expect(id).toMatch(/^fx\.w3x\.particle\.flamessmoke\.p0\d$/);
  });

  it("the band gets angrier as the ring closes, and never fades out of sight", () => {
    cover("firering-shrink");
    const a = bandAlphaForProgress(0);
    const b = bandAlphaForProgress(0.5);
    const c = bandAlphaForProgress(1);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    // it is a navigational signal: always clearly visible
    expect(a).toBeGreaterThan(0.5);
    expect(c).toBeLessThanOrEqual(1);
    expect(bandAlphaForProgress(Number.NaN)).toBe(a);
    expect(bandAlphaForProgress(9)).toBe(c); // clamped
  });
});

describe("fire-ring band geometry — 破圖閃爍 (GH#363)", () => {
  /** 頂點掃出來的 y 範圍與離圓心的最近／最遠距離。 */
  function measure(r: number): { yMin: number; yMax: number; near: number; far: number } {
    const p = bandRingPositions(r, new Float32Array((BAND_TESSELLATION + 1) * 6));
    let yMin = Infinity;
    let yMax = -Infinity;
    let near = Infinity;
    let far = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      const d = Math.hypot(p[i]!, p[i + 2]!);
      yMin = Math.min(yMin, p[i + 1]!);
      yMax = Math.max(yMax, p[i + 1]!);
      near = Math.min(near, d);
      far = Math.max(far, d);
    }
    return { yMin, yMax, near, far };
  }

  it("⭐ 帶寬固定是 BAND_THICKNESS 個世界單位，⛔ 不隨半徑放大", () => {
    cover("firering-shrink");
    // 出貨的圈從分區邊界收到口袋 —— 三個代表性的半徑，寬度必須一模一樣。
    for (const r of [30, 20, 4]) {
      const m = measure(r);
      // Float32 緩衝 ⇒ 4 位小數；缺陷的量級是 40×，不是 1e-5。
      expect(m.far - m.near).toBeCloseTo(BAND_THICKNESS, 4);
    }
  });

  it("⭐ 矩形分區畫的是**矩形的框**，⛔ 不是一個圓（GH#364）", () => {
    cover("firering-shrink");
    // 出貨的矩形分區是 24×18。sim 的安全區在半徑 r 時是 (r, 0.75r) 的矩形，
    // 所以帶子的短軸必須明顯比長軸近 —— 一個圓在這裡會把 33% 的死地畫成安全。
    const rect = { halfW: 24, halfD: 18 };
    const p = bandRingPositions(12, new Float32Array((BAND_TESSELLATION + 1) * 6), rect);
    let maxX = 0;
    let maxZ = 0;
    for (let i = 0; i < p.length; i += 3) {
      maxX = Math.max(maxX, Math.abs(p[i]!));
      maxZ = Math.max(maxZ, Math.abs(p[i + 2]!));
    }
    // 長寬比跟著分區走（⛔ 不抄 24/18 以外的任何數字：它就是輸入）
    expect(maxZ / maxX).toBeCloseTo(rect.halfD / rect.halfW, 1);
    // …而且不是圓：圓的話這個比會是 1
    expect(maxZ / maxX).toBeLessThan(0.9);
  });

  it("⭐ 完全平的（y 恆定）⇒ 它在型別上不可能切過地板", () => {
    cover("firering-shrink");
    // 舊的 torus 垂直半徑 0.275、掛在 y=0.08 ⇒ 下半部沉在地板下，
    // 交線是一圈 64 邊形鋸齒 —— owner 看到的那片黃色條紋。
    for (const r of [30, 12, 1]) {
      const m = measure(r);
      expect(m.yMin).toBe(0);
      expect(m.yMax).toBe(0);
    }
  });
});

describe("fire-ring band structural promises (firering-shrink)", () => {
  it("does NOT route through W3xEmitterRig (its 12 s cap would kill a 20 s band)", () => {
    cover("firering-shrink");
    expect(SRC).not.toMatch(/W3xEmitterRig/);
    expect(SRC).not.toMatch(/DEFAULT_MAX_EFFECT_SEC/);
  });

  it("anchors emitters to a WORLD position, never to a glb node (#131)", () => {
    cover("firering-shrink");
    // a Vector3 emitter, set from the zone's own numbers each frame
    expect(SRC).toMatch(/ps\.emitter = new Vector3\(0, 0, 0\)/);
    // a TransformNode emitter is exactly the #131 stranded-blob shape
    expect(SRC).not.toMatch(/emitter\s*=\s*rootNode/);
    expect(SRC).not.toMatch(/findBoneNode/);
  });

  it("re-reads the particle budget EVERY tick, not once at construction", () => {
    cover("firering-shrink");
    // `this.getScale()` must appear inside tick(), because the adaptive ladder
    // drops density to 0.3 exactly while the ring is burning.
    const tick = SRC.slice(SRC.indexOf("tick(nowMs"), SRC.indexOf("hide(): void"));
    expect(tick).toMatch(/this\.getScale\(\)/);
  });

  it("draws nothing for a zone the local player is not in (bye round / spectator)", () => {
    cover("firering-shrink");
    // `zone: null` is an explicit, documented state — not a fall-through to
    // zone 0, which would light a fire around somebody else's duel.
    // ⚠️ 這一條要的是 `| null` 那一半（沒有分區就不畫），⛔ 不是欄位清單 ——
    // GH#364 在同一個型別上加了 optional 的 `rect`，鎖死整串字只會逼下一個人改測試。
    expect(SRC).toMatch(/zone: \{ x: number; z: number; r: number;[\s\S]*?\} \| null/);
    expect(SRC).toMatch(/frame\?\.zone \?\? null/);
  });
});
