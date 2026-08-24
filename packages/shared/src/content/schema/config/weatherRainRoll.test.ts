/**
 * 🌧️ GH#676 —— 室外**有機率**下雨的三條承重線。owner 2026-08-24（逐字）：
 *
 * > 「只要是**室外場景**，都**有機率**下雨，而**非一定會下或不會下**」
 *
 * ① 決定性：同一顆 seed 永遠同一個結果（同場四個玩家／回放／觀戰一致）
 * ② 室內（與沒列在表上的圖）永遠無雨 —— 就算機率調到 1
 * ③ 機率 1 且室外 ⇒ 必下；機率 0 ⇒ 必不下（⛔ 不驗出貨機率的字面值）
 * ④ 出貨預設**不是二元**：同一份出貨設定掃 seed，有的場下、有的場不下 ——
 *    這條紅了= 出貨又退化回 owner 逐字說不要的「一定會下或不會下」
 *
 * 突變（真的跑過）：weatherLookFor 的 `rolled` 改成恆 false ⇒ ③④ 紅。
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_WEATHER,
  matchRainRoll,
  weatherKindIsSheltered,
  weatherLookFor,
  type WeatherToggles,
} from "./weather";

const ON: WeatherToggles = { wetGround: true, puddles: true, fog: true };
/** 決定性的 seed 掃描 —— ⛔ 不是 Math.random 出來的。 */
const SEEDS = Array.from({ length: 200 }, (_, i) => (i + 1) * 7919);
const ids = Object.keys(DEFAULT_WEATHER.arenas);
const indoor = ids.filter((a) => weatherKindIsSheltered(DEFAULT_WEATHER.arenas[a]!));
const outdoor = ids.filter((a) => !weatherKindIsSheltered(DEFAULT_WEATHER.arenas[a]!));
const certain = { ...DEFAULT_WEATHER, rainEnabled: true, rainChance: 1 };

describe("🌧️ GH#676 室外有機率下雨", () => {
  it("① 同一顆 seed 擲兩次是同一個結果", () => {
    // ⛔ 空池 = 永遠綠的裝飾品
    expect(indoor.length).toBeGreaterThan(0);
    expect(outdoor.length).toBeGreaterThan(0);
    for (const s of SEEDS) {
      expect(matchRainRoll(DEFAULT_WEATHER, s)).toBe(matchRainRoll(DEFAULT_WEATHER, s));
      const a = outdoor[s % outdoor.length]!;
      // 出貨路徑（weatherLookFor）也要決定性，⛔ 不是只有內層函式
      expect(weatherLookFor(DEFAULT_WEATHER, a, ON, s).rain).toBe(
        weatherLookFor(DEFAULT_WEATHER, a, ON, s).rain,
      );
    }
  });

  it("② 室內與沒列在表上的圖永遠無雨 —— 就算機率調到 1", () => {
    for (const s of SEEDS) {
      for (const a of indoor) expect(weatherLookFor(certain, a, ON, s).rain).toBe(0);
      // 沒列 = 沒有人判過室內外 ⇒ 保守方向：不進機率池
      expect(weatherLookFor(certain, "arena.brand-new-unjudged", ON, s).rain).toBe(0);
    }
  });

  it("③ 機率 1 且室外 ⇒ 每一張出貨室外圖必下；機率 0 ⇒ 必不下", () => {
    const never = { ...DEFAULT_WEATHER, rainChance: 0 };
    for (const s of SEEDS) {
      for (const a of outdoor) {
        expect(weatherLookFor(certain, a, ON, s).rain, `${a} seed=${s}`).toBeGreaterThan(0);
        expect(weatherLookFor(never, a, ON, s).rain).toBe(0);
      }
    }
  });

  it("④ 出貨預設不是二元 —— 掃 seed 兩種結果都出現", () => {
    const rolls = SEEDS.map((s) => matchRainRoll(DEFAULT_WEATHER, s));
    expect(rolls).toContain(true);
    expect(rolls).toContain(false);
  });
});
