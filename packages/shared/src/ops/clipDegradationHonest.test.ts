/**
 * ⭐⭐ **剪輯降級契約說的是真話**（GH#940 驗收 ⑥ 的後半）。
 *
 * ⚠️ ⭐ 這一份契約的用途是**讓外部編輯器知道自己拼的演出在哪些模型上是空的** ——
 * `resolveClips()` 找不到一塊剪輯時**什麼都不做** ⇒ 播放器退回 idle，
 * ⭐ 而那在畫面上與「這個模型沒有這個動作」長得一模一樣（失敗形態⑧）。
 *
 * ⛔⛔ 這條守衛問的是**關係**，⛔ 不是「檔案在不在」：
 * ① 契約的詞彙表 ＝ 出貨的 `DEFAULT_CLIP_NAMES`（⛔ 不是抄的一份）
 * ② 分母是**有動畫的模型**（⛔ 不是 glb 總數 —— 第一版被靜態道具灌大了一倍）
 * ③ 覆蓋率**只能變好**（棘輪）—— 素材被拿掉 ⇒ 紅
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const C = JSON.parse(
  readFileSync(join(ROOT, "docs/editor-contract/ggd-clip-degradation.json"), "utf8"),
) as {
  matching: { vocabulary: Record<string, string[]> };
  population: { glbFiles: number; animatedModels: number; clips: number };
  coverage: Record<string, { models: number; pct: number }>;
  perModel: Record<string, string[]>;
};

/**
 * ⭐ **棘輪基準線** —— 2026-09-02 量到的（分母 269 顆有動畫的模型）。
 *
 * ⚠️ ⭐ 這幾個數字**不是目標，是現況**。`guard` 2.2% / `hurt` 8.2% 是
 * **素材事實**：實測整個素材庫裡 `block` / `guard` / `shield` / `parry`
 * **一個動畫名都沒有**，只有 `defend` 那一族（`attack defend` 6 顆）。
 * ⇒ ⛔ 那不是配置問題，改詞彙救不了它（`stand ready` 108 顆看似可用，
 *   ⭐ 但它也被 `idle` 的 `stand` 命中 ⇒ 兩個 state 播同一個 clip
 *   ⇒ 畫面上「格擋」與「站著」一模一樣 —— ⛔ 那不是修好，是換一種空）。
 */
const FLOOR: Record<string, number> = {
  idle: 240, death: 205, attack: 180, run: 180, dodge: 170, cast: 145,
  hurt: 20, celebrate: 12, guard: 6,
};

describe("剪輯降級契約（GH#940 ⑥）", () => {
  it("⭐ ① 詞彙表就是**出貨那一份**（⛔ 不是抄的）", () => {
    const src = readFileSync(join(ROOT, "apps/client/src/render/ClipAnimator.ts"), "utf8");
    for (const [clip, words] of Object.entries(C.matching.vocabulary))
      for (const w of words)
        expect(src, `⛔ 契約說 ${clip} 會比對 "${w}"，而出貨表裡沒有它`).toContain(`"${w}"`);
  });

  it("⭐⭐ ② 分母是**有動畫的模型**（⛔ 不是 glb 總數）", () => {
    // ⚠️ 第一版拿 426 顆 glb 當分母，而其中 41.8% 一支動畫都沒有（道具／場景）
    //   ⇒ 「guard 只有 1.4%」讀起來像災難，⛔ 而近一半的分母根本不是角色。
    expect(C.population.animatedModels).toBeLessThan(C.population.glbFiles);
    expect(C.population.animatedModels).toBeGreaterThan(100);
    for (const [clip, v] of Object.entries(C.coverage)) {
      const expected = Math.round((v.models / C.population.animatedModels) * 1000) / 10;
      expect(v.pct, `⛔ ${clip} 的 pct 不是用 animatedModels 算的`).toBe(expected);
    }
  });

  it("⭐⭐ ③ 覆蓋率**只能變好**（棘輪 —— 素材被拿掉會紅）", () => {
    for (const [clip, floor] of Object.entries(FLOOR))
      expect(
        C.coverage[clip]?.models ?? 0,
        `⛔ ${clip} 的模型數掉到 ${C.coverage[clip]?.models} —— ` +
          `素材被拿掉了,還是詞彙被改壞了?⭐ 真的變好就把 FLOOR 調上去。`,
      ).toBeGreaterThanOrEqual(floor);
  });

  it("⭐ ④ 逐模型清單只列**會降級的**（⛔ 不是全表 —— 那份沒有人讀得完）", () => {
    expect(Object.keys(C.perModel).length).toBeLessThanOrEqual(C.population.animatedModels);
    for (const [m, missing] of Object.entries(C.perModel)) {
      expect(missing.length, `⛔ ${m} 進了清單卻沒有缺任何一塊`).toBeGreaterThan(0);
      for (const c of missing)
        expect(C.coverage, `⛔ ${m} 缺的 "${c}" 不在詞彙表裡`).toHaveProperty(c);
    }
  });
});
