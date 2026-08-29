/**
 * 🌧️ WeatherRainFx —— 天氣的**降水**那一層（GH#654）。
 *
 * owner 2026-08-24：「**下雨跟起霧的天氣特效**」。
 * 霧那一半在 GH#610 就出貨了（`render/weatherFogBanks.ts` ＋ `Lighting` 的
 * `scene.fog`）；⭐ 這個檔是**同一個機制的第三層**，⛔ 不是第二套天氣系統。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ 一個機制 ＋ 一張表（第零守則⑨）
 * ═══════════════════════════════════════════════════════════════════════════
 * 「下不下雨」**沒有新的住處**（GH#676，owner 2026-08-24：「只要是**室外場景**，
 * 都**有機率**下雨，而**非一定會下或不會下**」）：
 *   · **下不下** = 每場開賽用 matchSeed 擲一次（`matchRainRoll`，決定性）
 *   · **淋不淋得到** = `config.weather@1.arenas` 級別的 id 前綴（室內永遠不下）
 *   · **下多大** = `WEATHER_KIND_WEIGHTS[kind].rain` 那張**共用表**
 * ⛔ 也**沒有**「雨的類別」與「霧的類別」兩支平行的程式 —— 三層共用同一份政策、
 * 同一個 `weatherLookFor()`、同一格總開關。
 *
 * ⚠️ 出貨 **開著**（`rainEnabled: true`，GH#676 把它從止血閥以外的職責解雇了）：
 * #654 第一版出貨 false ＝「不會下」，正是 owner 說不要的二元。機率制下沒進房
 * （沒有 seed）仍然不下 —— 開機骨架畫面與上一版逐像素相同。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ 兩個 GH#654 明文要求先量的東西
 * ═══════════════════════════════════════════════════════════════════════════
 * ① **效能**：「雨的粒子數必須進 `AdaptiveQuality` 的降級階梯，⛔ 不可以是
 *    『開了就永遠在』」⇒ {@link rainPlan} 把後台的滿載滴數 **乘上** 這一刻的
 *    粒子預算（`particleBudgetScale(qualityController…particleDensity)`），
 *    而那正是 `VfxSystem` / `AmbientVfx` 用的同一顆旋鈕。降到 0 ⇒ 這一層不建。
 * ② **⛔ 不要遮住玩家看得見的資訊**：雨落在**相機與英雄之間**，所以濃度那一格
 *    的上界（0.6）與霧的兩格同源 —— 出貨值刻意離上界很遠（0.22 ＝ 裝飾）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ GPU 粒子，CPU 是**退路**不是預設
 * ═══════════════════════════════════════════════════════════════════════════
 * GH#654 逐字：「GPU 粒子（⛔ 不要 CPU 粒子 —— 一場雨是幾千顆）」。
 * `GPUParticleSystem.IsSupported` 為真時走 GPU；⚠️ 它需要 WebGL2 的 transform
 * feedback，而 **NullEngine 沒有** ⇒ 測試**預設**量到的是 CPU 那條路。兩條路共用
 * 同一個 `IParticleSystem` 介面與同一份 {@link rainPlan}，所以「走哪一條」是一行，
 * ⛔ 不是兩份會各自腐爛的設定。
 *
 * ⛔⛔ **GH#700（T0，2026-08-25）**：上面那一行「NullEngine 走 CPU」在此之前只是
 * 一句**檔頭散文**，而它正是這個缺陷能出貨的原因 —— 出貨的真瀏覽器是 WebGL2 ⇒
 * `IsSupported` 為 **true** ⇒ 走 `new GPUParticleSystem(...)`，而 Babylon 的
 * GPU 粒子把平台實作放在**另一個模組**裡（`gpuParticleSystem.js:739` 用
 * `GetClass("BABYLON.WebGL2ParticleSystem")` 查註冊表，查不到就**擲例外**）。
 * ⇒ 少了下面那一行 side-effect import，出貨路徑**每一次下雨都擲**
 * `The WebGL2ParticleSystem class is not available!`，而 vitest 全綠
 * （NullEngine 的 `IsSupported` 是 false ⇒ 那條路一次都沒被走過）。
 * ⭐ 守衛 `render/weatherRainGpuPath.test.ts` **把 caps 打開**逼它走 GPU 那條路，
 * ⛔ 不再是「測試環境剛好走另一條」。
 * ⚠️ 客戶端只建 WebGL `Engine`（⛔ 沒有 WebGPU）⇒ 只需要註冊 WebGL2 那一個平台；
 * 哪天真的接了 WebGPU，`supportComputeShaders` 會要 `ComputeShaderParticleSystem`
 * —— 那條路今天由 `ArenaScene` 的 fail-open 接住（並且會喊）。
 *
 * ⚠️ 雨是**常駐**特效（整回合都在）⇒ 建立當下就 `markVfxPersistent()`，
 * 否則 GH#570 的兜底掃描（出貨 scope `"scene"`）會在 5 秒後把整場雨收掉，
 * ⛔ 而畫面上只會看到「雨下一下就停了」。
 */
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { IParticleSystem } from "@babylonjs/core/Particles/IParticleSystem";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { GPUParticleSystem } from "@babylonjs/core/Particles/gpuParticleSystem";
// ⛔⛔ GH#700 —— **這一行沒有匯出任何東西，⛔ 不要當成沒用的 import 刪掉。**
// 它是 `GPUParticleSystem` 在 WebGL2 上的平台實作，靠 `RegisterClass` 把自己登記到
// Babylon 的全域註冊表；少了它，出貨路徑上的 `new GPUParticleSystem(...)` 直接擲。
import "@babylonjs/core/Particles/webgl2ParticleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { WeatherLook, WeatherPolicy } from "@ggd/shared/content";
import { fogBankSeed, fogFootprint, fogHash01 } from "../render/weatherFogBanks";
import { particleBudgetScale } from "../render/RenderConfig";
import { qualityController } from "../render/QualityController";
import { markVfxPersistent } from "./vfxHardCap";

/** 雨的貼圖（一顆柔邊的亮點；`BILLBOARDMODE_STRETCHED` 把它拉成一道雨絲）。 */
const RAIN_TEXTURE = "/content/assets/textures/particles/light_01.png";
/** 一滴的橫向粗細（世界單位）。⛔ 不是後台一格：它只有「看得見」與「太粗」兩種值。 */
const DROP_WIDTH = 0.05;
/** 雨柱高度 = 場地跨距 × 這個比例，夾在 8..24 之間。 */
const COLUMN_OF_SPAN = 0.45;
const COLUMN_MIN = 8;
const COLUMN_MAX = 24;

/** 這一場雨的**算好的**參數（PURE，⛔ 沒有 Babylon）。`null` = 不下雨。 */
export interface RainPlan {
  /** 場上同時幾滴（已經吃過畫質階梯）。 */
  drops: number;
  /** 一滴掉多快。 */
  speed: number;
  /** 斜多少（弧度）。 */
  tiltRad: number;
  /** 拉多長。 */
  streak: number;
  /** 多不透明。 */
  alpha: number;
}

/**
 * 政策 × 這一場的觀感 × 這一刻的畫質預算 → 這一場雨（PURE）。
 *
 * ⚠️ `budgetScale` 是**參數**而不是在這裡讀 `qualityController` —— 這一支要能被
 * 測試逐值驗，而畫質是每幀會變的執行期狀態（同 `weatherLookFor` 不讀 store）。
 */
export function rainPlan(
  policy: WeatherPolicy,
  look: WeatherLook,
  budgetScale: number,
): RainPlan | null {
  const alpha = policy.rainAlpha ?? 0;
  const speed = policy.rainFallSpeed ?? 0;
  // ⭐ 三個 0 各自代表一種「這一層關掉」：沒有雨權重 / 全透明 / 不會掉。
  const drops = Math.floor(look.rainDrops * Math.max(0, budgetScale));
  if (drops <= 0 || alpha <= 0 || speed <= 0) return null;
  return {
    drops,
    speed,
    tiltRad: ((policy.rainTiltDeg ?? 0) * Math.PI) / 180,
    streak: policy.rainStreak ?? 1,
    alpha,
  };
}

export interface RainInput {
  policy: WeatherPolicy;
  look: WeatherLook;
}

export interface RainHandle {
  /** 出貨路徑不碰它；測試量的是 `getActiveCount()`（＝場上真的有幾滴）。 */
  ps: IParticleSystem;
  /** 這一場雨用的是 GPU 那條路嗎（⛔ 不是設定，是**量到的**能力）。 */
  gpu: boolean;
  /** 雨柱的高度（＝一滴從生出來到落地要走的距離）。 */
  columnY: number;
}

/**
 * 建一場雨。`null` = 這張圖不下雨、降水開關關著、或畫質階梯把它降到 0。
 *
 * ⚠️ 生命週期掛在**一顆看不見的 emitter mesh** 上，而那顆 mesh 是 `parent` 的
 * 子節點 ⇒ `disposeArena()` 收 root 的那一刻粒子系統跟著死。⛔ 不需要在
 * `ArenaHandles` 上多開一格，也⛔ 不會留下一個對著死掉場景噴雨的系統
 * （同 `buildFogBanks` 把 observer 綁在 `mesh.onDispose` 上的理由）。
 */
export function buildRain(
  scene: Scene,
  parent: TransformNode,
  arenaId: string,
  zones: readonly { center: { x: number; z: number }; boundaryRadius: number }[],
  weather: RainInput,
  budgetScale = particleBudgetScale(qualityController.getParams().particleDensity),
): RainHandle | null {
  const plan = rainPlan(weather.policy, weather.look, budgetScale);
  if (!plan) return null;
  const foot = fogFootprint(zones);
  if (foot.span <= 0) return null;

  const columnY = Math.min(COLUMN_MAX, Math.max(COLUMN_MIN, foot.span * COLUMN_OF_SPAN));
  // 風向從場地 id 推導 —— ⛔ 不再開一格後台（同一張圖每次進來風向一樣，
  // 而兩張圖不會剛好同向）。
  const windYaw = fogHash01(fogBankSeed(arenaId), 7) * Math.PI * 2;
  const sin = Math.sin(plan.tiltRad);
  const dir = new Vector3(sin * Math.cos(windYaw), -Math.cos(plan.tiltRad), sin * Math.sin(windYaw));

  const mesh = new Mesh(`weather-rain-${arenaId}`, scene);
  mesh.isVisible = false;
  mesh.isPickable = false;
  mesh.parent = parent;
  mesh.position.set(foot.cx, columnY, foot.cz);

  const gpu = GPUParticleSystem.IsSupported;
  const capacity = Math.max(1, plan.drops);
  const ps: IParticleSystem = gpu
    ? new GPUParticleSystem(`weather-rain-${arenaId}`, { capacity }, scene)
    : new ParticleSystem(`weather-rain-${arenaId}`, capacity, scene);
  ps.emitter = mesh;
  ps.particleTexture = new Texture(RAIN_TEXTURE, scene, false, false);
  // 一滴從雨柱頂端落到地面就死 —— ⛔ 不是「活 N 秒然後在半空中消失」。
  const life = columnY / plan.speed;
  ps.minLifeTime = life;
  ps.maxLifeTime = life;
  // 穩態同時活著的滴數 = emitRate × life ⇒ 這一行就是「場上幾滴」。
  ps.emitRate = plan.drops / life;
  ps.minEmitPower = plan.speed;
  ps.maxEmitPower = plan.speed;
  ps.minSize = DROP_WIDTH;
  ps.maxSize = DROP_WIDTH;
  ps.minScaleY = plan.streak;
  ps.maxScaleY = plan.streak;
  ps.isBillboardBased = true;
  ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
  ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  ps.color1 = new Color4(0.78, 0.86, 1, plan.alpha);
  ps.color2 = new Color4(0.62, 0.72, 0.9, plan.alpha);
  // ⚠️ 落地那一刻**還是看得見**的：雨不是慢慢淡掉的煙（GH#660 那一族），
  // 它是被地面接住的。⛔ 把 colorDead 的 alpha 寫 0 會讓最後幾公尺變成霧。
  ps.colorDead = new Color4(0.62, 0.72, 0.9, plan.alpha);
  ps.gravity = new Vector3(0, 0, 0); // 速度已經是終端速度，⛔ 不要再加速
  const half = foot.span / 2;
  ps.createBoxEmitter(dir, dir, new Vector3(-half, 0, -half), new Vector3(half, 0, half));
  // ⏳ GH#570 的兜底掃描出貨掃**整個 scene** ⇒ 不標成常駐的話 5 秒後雨就停了。
  markVfxPersistent(ps);
  ps.start();

  mesh.onDisposeObservable.add(() => ps.dispose());
  return { ps, gpu, columnY };
}
