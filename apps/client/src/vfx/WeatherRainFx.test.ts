/**
 * 🌧️ **@visual-proof** —— GH#654 · #676：雨滴**真的出現在場上**，而且只在該下的
 * 場合。owner 2026-08-24（逐字）：「只要是**室外場景**，都**有機率**下雨，而
 * **非一定會下或不會下**」⇒ 下不下 = 每場開賽用 matchSeed 的決定性擲骰。
 *
 * ⭐ 量的是 `getActiveCount()`（Babylon 自己模擬之後場上活著的滴數）＋ 顏色的
 * alpha，⛔ 不是「設定讀進來了」——「政策解析對了」是中間節點，終點是畫面。
 *
 * 四條，各關一個方向：
 *  ① 還沒開賽（沒有 seed）⇒ **一顆粒子系統都不建** —— 開機骨架畫面沒有雨
 *  ② 擲出雨的那一場（機率 1 ＋ seed），室外圖上真的有看得見的雨滴 ——
 *     ⭐ 含 **clear 級的室外圖**（#676 的核心：晴朗圖也在機率池裡）
 *  ③ 室內圖**永遠不下雨**，機率 1 也一樣（owner「有些場景是室內，請不要下雨」）
 *  ④ 畫質階梯壓得到它（預算 0 ⇒ 不建；#614「第一回合就 lag」要的就是這個乘法）
 *
 *（本批的擲骰行為守衛在 shared 的 `weatherRainRoll.test.ts`；突變紀錄也在那邊。）
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import {
  DEFAULT_WEATHER,
  weatherLookFor,
  type WeatherPolicy,
  type WeatherToggles,
} from "@ggd/shared/content";
import { buildRain } from "./WeatherRainFx";

const ON: WeatherToggles = { wetGround: true, puddles: true, fog: true };
const ZONES = [{ center: { x: 0, z: 0 }, boundaryRadius: 12 }];
/** 出貨表上的三種場合：雨級的室外、clear 級的室外（名字逐字寫著室外）、室內。 */
const WET = "arena.shiganshina";
const CLEAR_OUTDOOR = "arena.colosseum";
const INDOOR = "arena.nazarick";
/** 機率 1 ⇒ 擲骰必中 —— 這裡驗的是「建不建 FX」，擲骰本身在 shared 的守衛。 */
const CERTAIN: WeatherPolicy = { ...DEFAULT_WEATHER, rainChance: 1 };
const SEED = 7919;

let engine: NullEngine;
let scene: Scene;
let root: TransformNode;
beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  root = new TransformNode("rain-test-root", scene);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

function rainOn(
  policy: WeatherPolicy,
  arenaId: string,
  seed?: number,
  budget = 1,
): ReturnType<typeof buildRain> {
  const look = weatherLookFor(policy, arenaId, ON, seed);
  return buildRain(scene, root, arenaId, ZONES, { policy, look }, budget);
}

describe("🌧️ 天氣降水：雨滴真的在場上 (@visual-proof)", () => {
  it("還沒開賽（沒有 seed）—— 連一顆粒子系統都不建", () => {
    expect(rainOn(DEFAULT_WEATHER, WET)).toBeNull();
    expect(rainOn(CERTAIN, WET)).toBeNull(); // 機率 1 也一樣：沒有比賽就沒有擲骰
  });

  it("擲出雨的那一場,室外圖上真的有看得見的雨滴在飛 —— 晴朗級也在池裡", () => {
    const handle = rainOn(CERTAIN, WET, SEED);
    expect(handle).not.toBeNull();
    const ps = handle!.ps as ParticleSystem;
    // Babylon 自己跑一段：噴出來的滴數 > 0 ＝ 畫面上真的有東西
    for (let i = 0; i < 24; i++) ps.animate(true);
    expect(ps.getActiveCount()).toBeGreaterThan(0);
    // …而且它們**看得見**（全透明的雨等於沒有雨 —— GH#660 那一族的教訓）
    expect(ps.color1.a).toBeGreaterThan(0);
    expect(ps.colorDead.a).toBeGreaterThan(0);
    // 一滴的壽命 = 雨柱高度 ÷ 落速 ⇒ 它是被地面接住的，⛔ 不是半空中消失
    expect(ps.maxLifeTime).toBeCloseTo(handle!.columnY / DEFAULT_WEATHER.rainFallSpeed!, 5);
    handle!.ps.dispose();
    // ⭐ #676 的核心：**clear 級的室外圖**（羅馬大擂台）也下 —— 不再只有雨/雷級
    const clear = rainOn(CERTAIN, CLEAR_OUTDOOR, SEED);
    expect(clear).not.toBeNull();
    clear!.ps.dispose();
  });

  it("室內圖永遠不下雨 —— 機率 1 也一樣", () => {
    expect(rainOn(CERTAIN, INDOOR, SEED)).toBeNull();
  });

  it("畫質階梯壓得到它 —— 粒子預算 0 就不建", () => {
    expect(rainOn(CERTAIN, WET, SEED, 0)).toBeNull();
  });
});
