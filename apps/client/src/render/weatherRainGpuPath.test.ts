/**
 * 🌧️🚨 **@visual-proof** —— GH#700（T0）：**出貨路徑上的雨真的建得起來。**
 *
 * ⛔ 既有的 `vfx/WeatherRainFx.test.ts` 對這個缺陷**結構性失明**：NullEngine 的
 * `GPUParticleSystem.IsSupported` 是 **false** ⇒ 它量到的永遠是 CPU 那條路，
 * 而**玩家的瀏覽器是 WebGL2 ⇒ 走 GPU 那條**（缺平台模組時 Babylon 直接擲）。
 * ⭐ 所以這一支**把 caps 打開**逼出 GPU 那條路 —— 這是「守衛不能只在 NullEngine
 * 的預設能力上跑」的具體樣子。
 *
 * 兩條，各關一個方向（兩條都走出貨的 `buildArena`，⛔ 不自己 new 粒子系統）：
 *  ① `supportTransformFeedbacks` ⇒ 雨真的以 **GPU 粒子**建在場上（少了那行
 *     side-effect import 就會擲 ⇒ 紅）
 *  ② 平台真的載不起來時（`supportComputeShaders` ⇒ 需要一個沒有被 import 的類別）
 *     ⇒ **地圖照建**（fail-open）**而且有人喊**（fail-loud）**而且不再重試**
 *
 * 突變紀錄（2026-08-25）：拿掉 `WeatherRainFx.ts` 的
 * `import "@babylonjs/core/Particles/webgl2ParticleSystem"` ⇒ ①②都紅。
 * ⭐ 而**第一版的①在同一次突變下是綠的** —— 因為 Babylon 在擲之前就把那顆半成品
 * `push` 進 `scene.particleSystems` 了，所以「場上找得到一顆同名的 GPU 粒子系統」
 * 對這個缺陷失明。①現在改量 `isStarted()`／`emitRate`／沒有人被 fail-open 接住。
 */
import { describe, it, expect, afterAll, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { GPUParticleSystem } from "@babylonjs/core/Particles/gpuParticleSystem";
import { DEFAULT_GRAPHICS } from "../settings/types";
import { setWeatherArena, setWeatherMatchSeed, setWeatherToggles, weatherToggles } from "./weather";
import { buildArena } from "./ArenaScene";

const WET = "arena.shiganshina"; // 出貨表上的室外圖（會進擲骰池）
const ZONES = [{ id: "z0", center: { x: 0, z: 0 }, boundaryRadius: 24, obstacles: [], spawns: [] }];
const ARENA = { id: WET, name: "r", zones: ZONES, decor: [] };

const engine = new NullEngine();
const scene = new Scene(engine);
const caps = engine.getCaps();
afterAll(() => {
  // ⚠️ Babylon 7.54 的 `GPUParticleSystem.dispose()` 在 NullEngine 上會擲
  //    （`_releaseBuffers` 讀一個 null engine 沒有的東西）—— 那是**收攤**的事，
  //    ⛔ 不是這一支要驗的東西（S7 的 audition 檔頭記過同一個坑）。
  try {
    scene.dispose();
  } catch {
    /* 收攤而已 */
  }
  engine.dispose();
});

/** 出貨機率是 0.3 ⇒ 找一顆**真的會下**的 seed，⛔ 不抄一個會過期的字面值。 */
function seedThatRains(): number {
  setWeatherToggles(weatherToggles(DEFAULT_GRAPHICS, "high", 0, false));
  for (let s = 1; s < 5000; s++) {
    setWeatherMatchSeed(s);
    if (setWeatherArena(WET).rainDrops > 0) return s;
  }
  throw new Error("找不到會下雨的 seed —— 擲骰或天氣表壞了");
}

const build = (): ReturnType<typeof buildArena> => buildArena(scene, ARENA as never, "stone");
const rainOnStage = (): GPUParticleSystem =>
  scene.particleSystems.find((p) => p.name === `weather-rain-${WET}`) as GPUParticleSystem;

describe("🌧️ 出貨路徑的雨：GPU 那條路真的走得通 (@visual-proof)", () => {
  it("① WebGL2（transform feedback）⇒ 雨以 GPU 粒子建在場上，⛔ 不擲例外", () => {
    seedThatRains();
    caps.supportTransformFeedbacks = true;
    caps.supportComputeShaders = false;
    expect(GPUParticleSystem.IsSupported).toBe(true); // 逼出出貨那條路
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    build();
    const ps = rainOnStage();
    expect(ps).toBeInstanceOf(GPUParticleSystem);
    // ⛔⛔ 「場上有一個 GPUParticleSystem」**不夠**：Babylon 的建構子在擲之前就
    //    已經 `scene.particleSystems.push(this)` 了（`gpuParticleSystem.ts:726`
    //    在平台檢查之前）⇒ 一個**建構失敗**的殘骸也找得到，名字還一模一樣。
    //    ⭐ 只有建構走完，`buildRain` 後面那幾行（emitRate / start）才跑得到。
    //    這一條是突變當場量到的洞，⛔ 不是預想出來的。
    expect(ps.isStarted()).toBe(true);
    expect(ps.emitRate).toBeGreaterThan(0);
    expect(spy).not.toHaveBeenCalled(); // ⛔ 沒有東西需要被 fail-open 接住
    spy.mockRestore();
  });

  it("② 平台載不起來 ⇒ 地圖照建、有人喊、⛔ 不再重試", () => {
    seedThatRains();
    // `ComputeShaderParticleSystem` 全 repo 沒有人 import ⇒ 建構必擲（＝真實的壞掉）
    caps.supportTransformFeedbacks = false;
    caps.supportComputeShaders = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handles = build();
    expect(handles.root).toBeTruthy(); // fail-open：地圖建起來了
    expect(spy).toHaveBeenCalledTimes(1); // fail-loud：⛔ 不是靜默
    build();
    expect(spy).toHaveBeenCalledTimes(1); // latch：⛔ 不重試、⛔ 不洗版
    spy.mockRestore();
  });
});
