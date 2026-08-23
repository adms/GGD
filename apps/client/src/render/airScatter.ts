/**
 * 空氣漫反射 —— 遠處的東西被空氣裡散射的光洗淡（aerial perspective, GH#610）。
 *
 * owner 2026-08-23：
 *
 * > 「如果**規格高的客戶端環境**，還可以加上**空氣漫反射的效果，增加質感**（**可開關**）」
 *
 * ── ⭐ 為什麼是「霧」，⛔ 不是 god rays / SSR ────────────────────────────────
 *
 * 三個候選（全部是 `@babylonjs/core` 已經有的東西，⛔ 沒有新套件、沒有新貼圖）：
 *
 * | 候選 | 每幀成本 | 為什麼不是它 |
 * |---|---|---|
 * | `VolumetricLightScatteringPostProcess` | **多一整趟場景 render**（遮罩 RTT）＋ radial blur | 俯角 68° ⇒ 太陽**永遠不在畫面裡**（`ArenaBackdrop` 檔頭已經為了同一個理由否決過天空盒），而且 post-process 是**逐相機**掛的 ⇒ 四人分割畫面就是 ×4 |
 * | `ScreenSpaceReflections` | 多一趟 depth + reflection | 它是**表面**反射，⛔ 不是空氣散射；答非所問 |
 * | ⭐ `scene.fog`（EXP2） | **零個額外 pass** —— 只是材質多一個 `FOG` define，每像素一次距離內插 | ⭐ 選它 |
 *
 * ⭐ 霧同時吃到這一版的三個結構事實：① 這條 render 路**不是** Babylon 的
 * `runRenderLoop`（`Renderer.ts` 檔頭），而霧是 scene 層級的狀態、⛔ 不必掛在
 * 任何一顆相機上；② 分割畫面有多顆相機，霧一次就全部涵蓋；③ `ArenaBackdrop`
 * 的遠景層是平躺在地上的 2D 環 —— 它們離相機最遠，所以**最先**被空氣洗淡，
 * 那正是「有景深」這件事免費多出來的一半。
 *
 * ⚠️ 唯一真正的成本是**切換的那一下**：`scene.fogMode` 一改，所有材質要重編
 * shader（Babylon 自己在 `PrepareDefinesForMisc` 做）。所以它是玩家按下去才
 * 發生的一次性 hitch，⛔ 不是每幀的開銷。
 *
 * ⚠️ **它不會動。** 唯一隨時間變的輸入是 `sceneryLightAt()` 那一幀的光，而那個
 * 波形本身已經被後台政策（`animateLights`）與 `wave: "none"` 兩道閘管著 ——
 * 也就是說：關掉會動的光，空氣也跟著靜止。⇒ ⛔ 這個效果不需要另一條
 * `prefers-reduced-motion` 的路（它沒有自己的動態成分）。
 */
import { hexToRgb01, type SceneryLightSample, type SceneryPalette } from "@ggd/shared/content";
import type { AirScatterSetting, QualityPreset } from "../settings/types";
import { ADAPTIVE_LADDER, FIXED_PRESET_RES_FLOOR } from "./AdaptiveQuality";

/**
 * 梯子降到**哪一階**就自動關掉。
 *
 * ⭐ **推導**，⛔ 不是字面值：取「解析度還沒被拉到固定預設的地板以下」的最後
 * 一階。判準跟 `FIXED_PRESET_RES_FLOOR` 是同一個 —— 那一格是「畫質是一個
 * 刻意的選擇」的界線，而空氣漫反射整個存在的理由就是畫質。梯子再往下一階
 * 代表這台機器已經在為 fps 割肉了，那時候「質感」不是它該花的錢。
 */
export const AIR_SCATTER_MAX_LEVEL: number = ADAPTIVE_LADDER.reduce(
  (last, rung, i) => (rung.resolutionScale >= FIXED_PRESET_RES_FLOOR ? i : last),
  0,
);

/**
 * 這一刻到底開不開。純函式（⛔ 不讀 store、⛔ 不碰 Babylon）。
 *
 * - `off` / `on` —— 玩家講死了。⚠️ `on` **不受梯子管**：那是他對畫質的明確
 *   宣告，跟固定預設拿到 `FIXED_PRESET_RES_FLOOR` 那一格保護是同一個道理。
 *   （想回頭就是把這一格轉回 `auto` / `off`，一次點擊。）
 * - `auto`（出貨值）—— owner 那句「**規格高的**客戶端環境」：畫質預設要是
 *   `high` 或 `auto`（低／中是玩家自己說了「這台不行」），**而且**適應梯子還
 *   沒開始割解析度。
 */
export function airScatterEnabled(
  setting: AirScatterSetting,
  preset: QualityPreset,
  adaptiveLevel: number,
): boolean {
  if (setting === "off") return false;
  if (setting === "on") return true;
  if (preset !== "high" && preset !== "auto") return false;
  return adaptiveLevel <= AIR_SCATTER_MAX_LEVEL;
}

/**
 * EXP2 的濃度。霧量 = `exp(-(d·k)²)`，所以 d≈30（英雄所在的距離）幾乎看不出來
 * ⇒ 打架的東西**一格都不模糊**；d≈160（最外圈背景）才吃到六成 ⇒ 遠景退進空氣裡。
 * ⚠️ ⛔ 不要拿這個數字寫斷言（它是可調的質感值，不是機制）。
 */
export const AIR_SCATTER_DENSITY = 0.006;

/** 空氣的顏色偏向陽光多少（0 = 純天光，1 = 純主光色）。 */
const INSCATTER_MIX = 0.45;

/** 再暗的場地，空氣也不會全黑 —— 全黑的霧看起來是「畫面壞了」不是「有空氣」。 */
const AIR_LIGHT_FLOOR = 0.35;

export interface AirScatterFog {
  r: number;
  g: number;
  b: number;
  density: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 這一幀空氣是什麼顏色：**天光**（`palette.sky`，＝陰影裡是什麼顏色）往
 * **這一刻的主光色**混一點（in-scattering：空氣被太陽照亮的那一半），
 * 再乘上這一刻的補光強度。
 *
 * ⭐ 所以它跟著場地走，也跟著 `GH#362` 那個會動的光走 —— 雷雨場的空氣會隨著
 * 閃電變色，⛔ 而不是 13 張圖共用同一片灰。純函式，測得到。
 */
export function airScatterFog(
  palette: SceneryPalette,
  light: SceneryLightSample,
): AirScatterFog {
  const sky = hexToRgb01(palette.sky);
  const lit = clamp01(Math.max(AIR_LIGHT_FLOOR, light.fillIntensity));
  const ch = (skyC: number, keyC: number): number =>
    clamp01((skyC + (keyC - skyC) * INSCATTER_MIX) * lit);
  return {
    r: ch(sky.r, light.key.r),
    g: ch(sky.g, light.key.g),
    b: ch(sky.b, light.key.b),
    density: AIR_SCATTER_DENSITY,
  };
}
