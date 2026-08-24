/**
 * 天氣的**渲染側接縫**（GH#610 第二批）—— 濕地面 · 積水 · 雷擊補光 · 霧濃度。
 *
 * owner 2026-08-23（逐字）：「**do it, 但有開關**」／「有些場景是**室內**，
 * 請**不要下雨**會很奇怪」／「另外一個天氣特效是**起霧** 你覺得如何？」
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 四樣的成本**差三個數量級**，所以它們是四個開關而不是一個
 * ════════════════════════════════════════════════════════════════════════════
 * | | 每幀成本 | 做法 |
 * |---|---|---|
 * | **濕地面** | ⭐ **零**（材質常數：`roughness` × `albedoColor` × `specularIntensity`） | 地板佔畫面八成 ⇒ 收益／成本最高的一項，所以它排第一 |
 * | **雷擊補光** | ⭐ **零**（兩個 float 寫進已經在寫的兩盞燈） | 波形本身 GH#362 就有了（`wave: "storm"`），這裡只是讓它**真的變亮** |
 * | **霧濃度** | ⭐ **零個額外 pass**（`scene.fog` EXP2 —— 空氣漫反射已經在跑的那一顆） | ⇒ 起霧＝**同一顆旋鈕轉大**，⛔ 不是第二套 fog |
 * | **積水** | 每 zone `puddleCount` 顆小 mesh ＋ alpha blend | 最貴的一項 ⇒ 梯子上最早被關掉 |
 *
 * ⭐⭐ **而「霧濃度」那一列在 2026-08-23 被 owner 推翻了一半**（逐字）：
 *
 * > 「⭐ 起霧＝空氣漫反射同一顆旋鈕轉大
 * >  => **不是全場地都霧喔，而是像真實一樣會有一片飄過去，隨機產生不規則形狀霧**」
 *
 * ⇒ 霧從此是**兩層**，而它們共用**同一格開關（`graphics.weatherFog`）**、
 * **同一個級別權重**、**同一條玩法界線**（⛔ 所以它仍然是「同一顆旋鈕」）：
 *
 * | 層 | 誰畫 | 成本 |
 * |---|---|---|
 * | ① 空氣（全場均勻） | `Lighting.write()` 的 `scene.fog` | 零個額外 pass |
 * | ② ⭐ 飄過去的那一片 | `render/weatherFogBanks.ts`（`ArenaScene.buildArena` 建） | **1 個 draw call**／整張圖 |
 *
 * ⚠️ 兩層由**同一支** `weatherLookFor()` 解析（`fogDensity` 與 `fogBanks` 一起出來）
 * ⇒ ⛔ 不可能出現「全域說沒霧、局部飄了一片」。完整推導在 `weatherFogBanks.ts` 的檔頭。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ 積水為什麼**不是** `MirrorTexture`，也**不是** `ScreenSpaceReflection`
 * ════════════════════════════════════════════════════════════════════════════
 * 兩個都在 `@babylonjs/core` 裡（⛔ 不必下載任何東西），而兩個都被**分割畫面**
 * 否決掉，理由不同：
 *
 * | 候選 | 為什麼不是它 |
 * |---|---|
 * | `MirrorTexture` | 它是一趟**額外的完整場景 render**，而且鏡像矩陣是用 **render 當下的 `scene.activeCamera`** 算的。這一版最多有 **4 顆相機**（四人分割畫面），RTT 每幀只 render 一次 ⇒ ⭐ **反射內容對其中 3 個玩家是錯的**。⛔ 一個「對四分之一的人正確」的鏡子比沒有鏡子糟 |
 * | `ScreenSpaceReflectionPostProcess` | post-process 是**逐相機**掛的（`ArenaBackdrop` 與 `airScatter.ts` 檔頭已經為同一個理由否決過兩次）⇒ 分割畫面就是 **×4**，而它本身還要一趟 geometry/prepass |
 *
 * ⭐ 所以積水走**材質**：一片低粗糙度、半透明、比地板更深的薄圓盤。它沒有真正的
 * 反射來源（這個場景 `environmentIntensity = 0`，沒有 IBL），⛔ 但它**不需要** ——
 * 畫面上會發生的是「太陽／閃電在水面上的那一道高光」，而那正好是「積水 ＋ 雷雨」
 * 這個組合裡玩家真的看得到的東西。
 *
 * ⚠️ **幀成本沒有量到。** 這條 lane 不能跑正式站、也沒有在這個環境裡跑起
 * WebGL/WebGPU 量幀 ⇒ ⛔ 我不編一個數字。上面那張表講的是**結構性**的成本
 * （幾趟 render pass、幾顆相機），那是可以從程式碼讀出來的事實。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 這個檔為什麼有一個 module 級的 store
 * ════════════════════════════════════════════════════════════════════════════
 * 天氣要同時到達**兩個**接縫，而它們拿得到的東西不一樣：
 *
 *   · `ArenaScene.buildArena()` 有 **arena.id**（＝知道是哪一種天氣），但它不畫燈
 *   · `Lighting.write()` 有**燈與霧**，但它的 `applyScenery(scenery, animate)`
 *     ⛔ **拿不到 arena.id**（呼叫端在 `GameApp.ts`，不在這條 lane 的柵欄裡）
 *
 * ⇒ 場地那一側 `setWeatherArena(id)`，燈那一側 `subscribeWeather(...)`。
 * ⚠️ 順序無關（GameApp 先套燈、後建場地）—— 訂閱者在 id 進來的那一刻被通知。
 */
import {
  Configs,
  resolveWeather,
  weatherLookFor,
  WEATHER_LOOK_NONE,
  type ConfigWeatherDoc,
  type WeatherLook,
  type WeatherPolicy,
  type WeatherToggles,
} from "@ggd/shared/content";
import { ADAPTIVE_LADDER, MAX_ADAPTIVE_LEVEL } from "./AdaptiveQuality";
import { AIR_SCATTER_MAX_LEVEL, qualityTriStateEnabled } from "./airScatter";
import type { GraphicsSettings, QualityPreset } from "../settings/types";

// ---------------------------------------------------------------------------
// 梯子上限 —— ⭐ 每一格**自己**的，因為只有那一格知道自己多貴
// ---------------------------------------------------------------------------

/**
 * 濕地面撐到梯子的**哪一階**。
 *
 * ⭐ 推導，⛔ 不是字面值：取「梯子還沒放棄陰影」的最後一階。判準是 ——
 * 濕地面是一個**打光的回應**（粗糙度低 ⇒ 主光在地上留下一條長高光），
 * 而梯子把 `shadows` 關掉的那一階，正是這台機器開始砍打光品質的地方。
 * ⚠️ 它本身**一毛錢都不花**（三個材質常數），所以它撐得比其他三格久。
 */
export const WET_GROUND_MAX_LEVEL: number = ADAPTIVE_LADDER.reduce(
  (last, rung, i) => (rung.shadows ? i : last),
  0,
);

/**
 * 積水撐到哪一階。⭐ 與空氣漫反射**同一條**判準（解析度還沒被拉到固定預設的
 * 地板以下），理由也同一條：它們都是純粹的質感，而梯子開始割解析度＝這台機器
 * 已經在為 fps 割肉。⚠️ 積水是四格裡唯一真的多畫東西的那一格。
 */
export const PUDDLE_MAX_LEVEL: number = AIR_SCATTER_MAX_LEVEL;

/**
 * 霧撐到哪一階（**兩層一起**）。⭐ 第①層就**是**空氣漫反射那一顆 `scene.fog`
 * ⇒ 同一階，⛔ 不是巧合也不是抄的：兩格轉的是同一個旋鈕。
 *
 * ⚠️ 第②層（飄過去的那一片）**不是**零成本：它是 1 個 draw call ＋ 幾片透明填充率。
 * ⭐ 但它仍然跟第①層同一階，而且**刻意**沒有第五格開關 —— 判準是它與積水同級
 * （`PUDDLE_MAX_LEVEL` 也等於這一階）：兩者都是「一顆 mesh ＋ thin instances ＋
 * alpha blend」，⛔ 沒有理由讓同一種成本吃兩條不同的梯子。
 */
export const WEATHER_FOG_MAX_LEVEL: number = AIR_SCATTER_MAX_LEVEL;

/**
 * 雷擊補光撐到哪一階。⭐ 梯子**永遠不關它** —— 它的成本是每幀兩個 float 乘法，
 * 而它是雷雨場地上唯一「有事在發生」的訊號。⚠️ 真正會關掉它的是
 * `prefers-reduced-motion`（見 {@link weatherToggles}），⛔ 那不是效能而是無障礙。
 */
export const LIGHTNING_MAX_LEVEL: number = MAX_ADAPTIVE_LEVEL;

// ---------------------------------------------------------------------------
// 開關解析
// ---------------------------------------------------------------------------

/** 四格解析過後的布林。⚠️ `lightning` 不在 `WeatherToggles` 裡 —— 見檔頭。 */
export interface WeatherRenderToggles extends WeatherToggles {
  lightning: boolean;
}

export const WEATHER_TOGGLES_OFF: WeatherRenderToggles = {
  wetGround: false,
  puddles: false,
  fog: false,
  lightning: false,
};

/**
 * 系統有沒有開「減少動態」。
 *
 * ⚠️ **每次呼叫都問**（同 `ui/buttonSfx.ts`）：這個偏好在 session 中途改得動，
 * 而一個只在開機讀一次的無障礙開關，對「打到一半覺得閃太兇」的人是死的。
 * ⛔ 非瀏覽器環境（測試 / SSR）一律回 false —— 不可以讓「沒有 matchMedia」
 * 靜靜地把功能關掉。
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * 玩家設定 × 畫質預設 × 適應梯子 × 無障礙 → 四個布林。**純函式**。
 *
 * ⚠️ `reduced` 只砍**會動的**兩樣：
 *   · 雷擊補光是**閃**（光敏性癲癇的直接誘因）⇒ 關
 *   · 積水的微光在呼吸 ⇒ 微光關掉（見 {@link puddleSheen}），⛔ 但積水本身留著
 *   · 濕地面與霧是**靜態**的 ⇒ ⛔ 不關（關掉它們只是拿走畫質，換不到任何無障礙）
 */
export function weatherToggles(
  g: GraphicsSettings,
  preset: QualityPreset,
  adaptiveLevel: number,
  reduced: boolean = prefersReducedMotion(),
): WeatherRenderToggles {
  const on = (
    setting: GraphicsSettings["wetGround"],
    maxLevel: number,
  ): boolean => qualityTriStateEnabled(setting, preset, adaptiveLevel, maxLevel);
  return {
    wetGround: on(g.wetGround, WET_GROUND_MAX_LEVEL),
    puddles: on(g.puddles, PUDDLE_MAX_LEVEL),
    fog: on(g.weatherFog, WEATHER_FOG_MAX_LEVEL),
    lightning: !reduced && on(g.lightningFlash, LIGHTNING_MAX_LEVEL),
  };
}

// ---------------------------------------------------------------------------
// 政策 + store
// ---------------------------------------------------------------------------

/**
 * 出貨政策。⭐ 直接讀共用的 `Configs` 登錄表，⛔ 不必在 `ContentDb` 加一行 ——
 * 同 `render/modelLod.ts` 的 `Configs.tryGet("model-lod")`（那個檔的註解寫得最好：
 * 「a policy that has to be wired up in two places is a policy that will one day
 * be wired up in one」）。內容還沒載進來 ⇒ `undefined` ⇒ 出貨預設。
 */
let cachedDoc: unknown = Symbol("unread");
let cachedPolicy: WeatherPolicy = resolveWeather(undefined);

export function weatherPolicy(): WeatherPolicy {
  const doc = Configs.tryGet("weather");
  // ⚠️ **memo 是必要的，⛔ 不是最佳化癖**：`Lighting.write()` 每幀呼叫它，而
  // `resolveWeather` 會 spread 出一個新物件 ⇒ 沒有這個比較就是每幀一次配置。
  // 比的是**文件物件的身分**（登錄表換了一份才會不同），⛔ 不是深比較。
  if (doc !== cachedDoc) {
    cachedDoc = doc;
    cachedPolicy = resolveWeather(doc as ConfigWeatherDoc | undefined);
  }
  return cachedPolicy;
}

let arenaId = "";
let toggles: WeatherRenderToggles = WEATHER_TOGGLES_OFF;
// 🌧️ GH#676 —— 這一場的比賽種子。`undefined` = 還沒進房（開機骨架）⇒ 不下雨。
// 由 `GameApp.onStatePatch` 餵（state.seed 是 MatchRoom.onCreate 寫一次、整場不變
// 的那一顆），「這一場下不下雨」= matchRainRoll(policy, seed) 的決定性擲骰。
let matchSeed: number | undefined;
let look: WeatherLook = WEATHER_LOOK_NONE;
const listeners = new Set<(w: WeatherLook) => void>();

function recompute(): void {
  const next = weatherLookFor(weatherPolicy(), arenaId, toggles, matchSeed);
  look = next;
  for (const fn of listeners) fn(next);
}

/** 這一場是哪一張圖。由 `ArenaScene.buildArena()` 呼叫（它是唯一拿得到 id 的地方）。 */
export function setWeatherArena(id: string): WeatherLook {
  arenaId = id;
  recompute();
  return look;
}

/**
 * 🌧️ 這一場的比賽種子進來了（GH#676）。⚠️ 去重是必要的：快照 20Hz 每格都帶
 * seed，而 seed 整場只寫一次 —— 沒有這個比較就是每秒 20 次無謂的 recompute。
 */
export function setWeatherMatchSeed(seed: number): void {
  if (seed === matchSeed) return;
  matchSeed = seed;
  recompute();
}

/** 四格開關變了。由 `QualityController.compute()` 呼叫（設定與梯子都經過它）。 */
export function setWeatherToggles(next: WeatherRenderToggles): void {
  if (
    next.wetGround === toggles.wetGround &&
    next.puddles === toggles.puddles &&
    next.fog === toggles.fog &&
    next.lightning === toggles.lightning
  ) {
    return;
  }
  toggles = next;
  recompute();
}

/** 這一刻的天氣觀感（已經吃過總開關、級別與四格開關）。 */
export function currentWeather(): WeatherLook {
  return look;
}

/** 雷擊補光這一刻開不開。⚠️ 它與 `WeatherLook` 分開 —— 見檔頭。 */
export function lightningEnabled(): boolean {
  return toggles.lightning;
}

export function subscribeWeather(fn: (w: WeatherLook) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** ⛔ 測試用：把 store 打回開機狀態。 */
export function resetWeatherForTest(): void {
  arenaId = "";
  toggles = WEATHER_TOGGLES_OFF;
  matchSeed = undefined;
  look = WEATHER_LOOK_NONE;
  cachedDoc = Symbol("unread");
  cachedPolicy = resolveWeather(undefined);
  listeners.clear();
}

// ---------------------------------------------------------------------------
// 材質與光的純算術
// ---------------------------------------------------------------------------

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 濕地面套在**乾**材質上的三個乘數／絕對值。`wet = 0` ⇒ 逐位元等於乾的那一組。 */
export interface WetGroundParams {
  /** 乘進 `albedoColor`（濕的東西**變深**，⛔ 不會變亮） */
  albedoMul: number;
  /** 乘進 `roughness`（低粗糙度 = 會反光 = 濕） */
  roughnessMul: number;
  /** 直接寫進 `specularIntensity` */
  specular: number;
}

export const WET_GROUND_DRY: WetGroundParams = { albedoMul: 1, roughnessMul: 1, specular: 0 };

/**
 * `drySpecular` 由呼叫端傳入（`ArenaGround` 自己的 `GROUND_SPECULAR_DRY`）——
 * ⭐ 這樣「乾的地板多亮」只有**一個住處**，而且這個檔不必反過來 import 地面模組。
 */
export function wetGroundParams(
  policy: WeatherPolicy,
  wet: number,
  drySpecular: number,
): WetGroundParams {
  if (wet <= 0) return { ...WET_GROUND_DRY, specular: drySpecular };
  const t = wet > 1 ? 1 : wet;
  return {
    albedoMul: lerp(1, policy.wetAlbedoMul, t),
    roughnessMul: lerp(1, policy.wetRoughnessMul, t),
    specular: lerp(drySpecular, policy.wetSpecular, t),
  };
}

/**
 * 積水表面這一刻的微光（0..1 的**額外**不透明度倍率）。
 * `amp = 0` 或減少動態 ⇒ 恆等於 1（完全靜止）。純函式，⛔ 沒有亂數。
 */
export function puddleSheen(amp: number, tSec: number, reduced: boolean): number {
  if (reduced || amp <= 0) return 1;
  return 1 - amp * 0.5 * (1 - Math.cos(tSec * 1.7));
}

/**
 * 這一幀閃電打到多亮（0 = 沒閃，1 = 峰值）。
 *
 * ⭐ 它讀的是**場地自己宣告的**那條波（`scenery.lighting.wave === "storm"`，
 * GH#362 就有了）⇒ ⛔ 天氣文件裡沒有第二個「這張圖有沒有雷」的欄位，
 * 兩者不可能互相打架。⚠️ 只取波的正半邊：`storm` 波長時間貼在 −1（陰暗），
 * 負的那一半是「比平常更暗」，⛔ 不是「往下閃」。
 */
export function lightningStrike(wave01: number): number {
  return wave01 > 0 ? wave01 : 0;
}
