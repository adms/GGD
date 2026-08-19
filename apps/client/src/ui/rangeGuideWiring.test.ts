/**
 * GUARD — 後台存的值真的**到得了地板上那個圈** (GH#376).
 *
 * ⛔ 刻意**不**斷言「欄位存在」：schema 收得下、後台存得起來、重整還讀得回自己填的
 * 數字，而遊戲裡什麼都不發生，是最貴的那種失敗（形態②）。所以每一條都讀**最終
 * 物件**：材質的 alpha/emissive、`paletteFor()` 回傳的調色盤、橫幅開不開。承重線
 * `applyRangeGuideDoc → rangeGuide() → 畫面` 突變驗過（三條同時紅）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { AimIndicator } from "../render/AimIndicator";
import { paletteFor } from "../vfx/telegraphChannel";
import { getDescribedAbility, setHeldAbility } from "./abilityHold";
import { hoverGuideEnter } from "./abilityRangeGuide";
import { SHIPPED_RANGE_GUIDE, applyRangeGuideDoc, resetRangeGuide } from "./rangeGuideConfig";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const read = (rel: string): string => readFileSync(`${REPO}${rel}`, "utf8");
const SHIPPED_JSON = JSON.parse(read("content/config/range-guide.json")) as Record<string, unknown>;

/** 後台真的會 PUT 的形狀（整份文件），值全部刻意和出貨值不同。 */
const EDITED = {
  ...SHIPPED_JSON,
  hoverDelayMs: 900,
  hoverOpensBanner: true,
  aoeColor: "#00FF00",
  aoeFillAlpha: 0.77,
  telegraph: {
    ...(SHIPPED_JSON.telegraph as Record<string, unknown>),
    incoming: { ring: "#0000FF", fill: "#0000FF", alpha: 0.11, dashed: true, pulseHz: 3 },
  },
};

let engine: NullEngine;
let scene: Scene;
beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterEach(() => {
  resetRangeGuide();
  setHeldAbility(null);
  vi.useRealTimers();
  scene.dispose();
  engine.dispose();
});

/** ⚠️ 讀 `mesh.material`（最終物件），不是建立時那個區域變數。 */
const matOf = (n: string): StandardMaterial =>
  scene.meshes.find((m) => m.name === n)!.material as StandardMaterial;

describe("config.range-guide@1 的值到得了畫面 (GH#376)", () => {
  it("出貨常數逐格等於 content/config/range-guide.json —— 兩份值不會各自漂走", () => {
    const { id, schema, note, ...payload } = SHIPPED_JSON;
    void id, void schema, void note;
    expect(payload).toEqual(SHIPPED_RANGE_GUIDE);
    // ⚠️ 原始碼掃描（誠實標示）：其餘三條證明「值到得了畫面」，這一條擋另一半 ——
    // 那份 JSON 從來沒有被交給它們。
    expect(read("apps/client/src/content/ContentDb.ts")).toContain("applyRangeGuideDoc(");
  });

  it("存進去的顏色/濃度/粗細真的畫在那個圈上", () => {
    applyRangeGuideDoc(EDITED);
    // ⚠️ GH#415 起 AoE 圈有**自己的圓心**（落點），所以要餵 `aoeX`/`aoeZ` ——
    //    給 null 的話那個圈根本不會被畫，這條斷言就會在測空氣。
    new AimIndicator(scene).update({
      kind: "range",
      x: 0,
      z: 0,
      range: 8,
      radius: 3,
      aoeX: 5,
      aoeZ: 0,
    });
    expect(matOf("aim-aoe-fill").alpha).toBeCloseTo(0.77, 6);
    expect(matOf("aim-aoe-fill").emissiveColor.asArray()).toEqual([0, 1, 0]);
    expect(matOf("aim-aoe-rim").alpha).toBeCloseTo(SHIPPED_RANGE_GUIDE.rimAlpha, 6);
  });

  it("「自己 vs 來襲」那三組樣式也到得了地面預告", () => {
    applyRangeGuideDoc(EDITED);
    expect(paletteFor("enemy").dashed).toBe(true); // 出貨是實線
    expect(paletteFor("enemy").ring).toEqual([0, 0, 1]);
    // 沒被改的那條維持出貨值；起手亮度爬升刻意留在程式裡，覆蓋不可以吃掉它
    expect(paletteFor("self").dashed).toBe(SHIPPED_RANGE_GUIDE.telegraph.self.dashed);
    expect(paletteFor("enemy").startAlphaFactor).toBeGreaterThan(0);
  });

  it("hover 的延遲與「要不要開橫幅」都是那份文件說了算", () => {
    vi.useFakeTimers();
    applyRangeGuideDoc(EDITED);
    hoverGuideEnter("Q");
    vi.advanceTimersByTime(SHIPPED_RANGE_GUIDE.hoverDelayMs + 1); // 出貨延遲 ⇒ 還不該出現
    expect(getDescribedAbility()).toBeNull();
    vi.advanceTimersByTime(900);
    expect(getDescribedAbility()).toBe("Q"); // hoverOpensBanner: true ⇒ 橫幅開了
  });
});
