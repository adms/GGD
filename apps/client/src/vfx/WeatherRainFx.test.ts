/**
 * 🌧️ **@visual-proof** —— GH#654：雨滴**真的出現在場上**，而且只在該下的圖上。
 *
 * ⭐ 量的是 `getActiveCount()`（Babylon 自己模擬之後場上活著的滴數）＋ 顏色的
 * alpha，⛔ 不是「設定讀進來了」——「政策解析對了」是中間節點，終點是畫面。
 *
 * 四條，各關一個方向：
 *  ① 出貨預設（`rainEnabled: false`）⇒ **一顆粒子系統都不建**（新功能預設關）
 *  ② 打開之後，下雨的圖上真的有雨滴在飛，而且它們看得見（alpha > 0）
 *  ③ 室內圖**仍然不下雨**（owner「有些場景是室內，請不要下雨」）
 *  ④ 畫質階梯壓得到它（預算 0 ⇒ 不建；#614「第一回合就 lag」要的就是這個乘法）
 *
 * 突變（**真的跑過**）：把 `weatherLookFor` 的 `(policy.rainEnabled ?? false)` 拿掉
 * ⇒ ① 紅（`expected { ps: ParticleSystem… } to be null`）。
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
/** 出貨表上真的下雨的那一張；`arena.nazarick` 是出貨表上的室內圖。 */
const WET = "arena.shiganshina";
const INDOOR = "arena.nazarick";

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

function rainOn(policy: WeatherPolicy, arenaId: string, budget = 1): ReturnType<typeof buildRain> {
  return buildRain(scene, root, arenaId, ZONES, { policy, look: weatherLookFor(policy, arenaId, ON) }, budget);
}

describe("🌧️ 天氣降水：雨滴真的在場上 (@visual-proof)", () => {
  it("出貨預設是關的 —— 連一顆粒子系統都不建", () => {
    expect(DEFAULT_WEATHER.rainEnabled).toBe(false);
    expect(rainOn(DEFAULT_WEATHER, WET)).toBeNull();
  });

  it("打開之後,下雨的圖上真的有看得見的雨滴在飛", () => {
    const handle = rainOn({ ...DEFAULT_WEATHER, rainEnabled: true }, WET);
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
  });

  it("室內圖仍然不下雨,就算總開關打開", () => {
    expect(rainOn({ ...DEFAULT_WEATHER, rainEnabled: true }, INDOOR)).toBeNull();
  });

  it("畫質階梯壓得到它 —— 粒子預算 0 就不建", () => {
    expect(rainOn({ ...DEFAULT_WEATHER, rainEnabled: true }, WET, 0)).toBeNull();
  });
});
