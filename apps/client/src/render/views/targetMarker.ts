/**
 * targetMarker —— 「這一發會打**誰**」的地面標記（GH#519）。
 *
 * ── 缺的是什麼 ────────────────────────────────────────────────────────────
 * 純手把玩家用右搖桿對著一團敵人放**指定型**技能時，`GamepadInput` 靠
 * `nearestEnemy(self, reach, aimDir)` 挑一個（方向偏壓已經在 `pickNearestUnit`
 * 裡），挑完**直接包成 command 送走** —— 於是「挑中了誰」這個答案在畫面上
 * **一格都沒有出現過**。人堆裡玩家只能亂猜，按下去才知道打錯人。
 *
 * ⭐ 業界做法（Dota 2 官方手把支援）：按住瞄準時用**有顏色的圈**標出當前目標，
 * 友軍一個顏色、敵人另一個。這個檔就是那個圈的**決定**那一半。
 *
 * ── 為什麼是一個 pure 模組，而不是一個 Babylon class ──────────────────────
 * 圈的**形狀**已經有兩份現成的了（`ChampionView` 的自己人光環、`AimIndicator`
 * 的範圍/AoE 圈），而 GH#519 明說「⛔ 不要另做一套渲染」。所以這裡一顆 mesh 都
 * 不建：它只回答「畫不畫 · 畫在哪 · 多大 · 什麼顏色」，交給既有的圈去畫。
 * 這樣這些決定可以在 node 測試裡被掃過，⛔ 而不是用眼睛判一次然後無聲漂移。
 *
 * ── 顏色與粗細⛔沒有一個是這個檔發明的（第一守則 · 第〇·四守則）────────────
 * 顏色走 `vfx/telegraphChannel.paletteFor(relation)` —— 那正是地面預告在用的
 * 敵/友/自己三條通道，而它們**已經是後台欄位**（`config.range-guide@1` 的
 * `telegraph.{self,ally,incoming}`）。框的粗細走 `ui/abilityRangeGuide` 的
 * `rimThickness`，同一份文件的同一格。
 * ⇒ operator 把敵方預告從紅改成紫的那一刻，這個標記**自己就跟著變**，
 *   ⛔ 不必有人記得來改第二個地方。
 *
 * 幾何唯一新增的兩個數是**比例**而不是絕對值（見 {@link TARGET_RING_RATIO} /
 * {@link TARGET_RING_Y_LIFT}），底數則是自己人光環的那兩顆常數本人 ——
 * ⛔ 不抄字面值。
 */
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import { getCursorlessTarget } from "../../input/AimResolver";
import { ABILITY_RANGE_GUIDE } from "../../ui/abilityRangeGuide";
import { paletteFor, type TelegraphRelation } from "../../vfx/telegraphChannel";
import { ChampionView } from "./ChampionView";

/** RGB 三元組（0..1），與 `ui/rangeGuideConfig.Rgb01` 同形。 */
export type Rgb01 = readonly [number, number, number];

/**
 * 目標環比自己人光環寬多少倍。
 *
 * ⚠️ 一定要 > 1：`targeted` 技能**打得到自己**（補血/增益），那一刻兩個環會同心，
 * 而兩個一樣大的環疊在一起等於只有一個環 —— 玩家分不出「我被鎖定」跟「我是我」。
 */
export const TARGET_RING_RATIO = 1.3;

/**
 * 目標環抬高多少（世界單位），⛔ 相對於自己人光環，不是一個絕對高度。
 *
 * 失敗形態①（「畫在地板下」）：地面上已經有隊伍環(0.04)/影子(0.03)/泥(0.02)/
 * 自己人光環(0.06)四層，而瞄準指引在 0.07。這一格把目標環夾在**自己人光環之上、
 * 瞄準指引之下** —— 它比「我是誰」重要，比「這一發落在哪」次要。
 */
export const TARGET_RING_Y_LIFT = 0.005;

/** 目標環的直徑（世界單位）。 */
export function targetRingDiameter(): number {
  return ChampionView.SELF_RING_DIAMETER * TARGET_RING_RATIO;
}

/** 目標環離地高度（世界單位）。 */
export function targetRingY(): number {
  return ChampionView.SELF_RING_Y + TARGET_RING_Y_LIFT;
}

/** 這一幀要在誰腳下畫一個什麼樣的環。null = 沒有鎖定任何人，⛔ 什麼都不畫。 */
export interface TargetMarkerState {
  entityId: number;
  x: number;
  z: number;
  diameter: number;
  y: number;
  rgb: Rgb01;
  alpha: number;
  rimThickness: number;
}

/**
 * 把一個軟鎖定目標解成一個環。
 *
 * @param entityId 目前鎖定到誰（`AimResolver.getCursorlessTarget()`）。
 * @param posOf    查一個實體現在在哪。⚠️ 查不到 → 不畫，⛔ 不退回施法者腳下 ——
 *                 那正是 GH#415 判死的那個謊（一個位置錯誤的圈，玩家會照著站位）。
 * @param relationOf 這個實體對本地玩家是敵/友/自己。決定顏色，⛔ 不決定畫不畫。
 */
export function resolveTargetMarker(
  entityId: number | null,
  posOf: (id: number) => Vec2 | null,
  relationOf: (id: number) => TelegraphRelation,
): TargetMarkerState | null {
  if (entityId === null) return null;
  const pos = posOf(entityId);
  if (!pos) return null;
  const palette = paletteFor(relationOf(entityId));
  return {
    entityId,
    x: pos.x,
    z: pos.z,
    diameter: targetRingDiameter(),
    y: targetRingY(),
    rgb: palette.ring,
    alpha: palette.alpha,
    rimThickness: ABILITY_RANGE_GUIDE.rimThickness,
  };
}

/**
 * 手把那一條路的**唯一**入口：讀 `AimResolver` 的軟鎖定暫存器並解成一個環。
 *
 * ⭐ 刻意做成一支不用傳 id 的函式，好讓渲染側只需要**一行**就接得上，
 * ⛔ 而不是再把「誰是目標」這個答案沿著五層參數傳一遍（那正是同一個決定會分岔
 * 成兩份的形狀）。放開技能鍵 → `setCursorlessAim(null)` → 暫存器清空 → 這裡回 null。
 */
export function resolvePadTargetMarker(
  posOf: (id: number) => Vec2 | null,
  relationOf: (id: number) => TelegraphRelation,
): TargetMarkerState | null {
  return resolveTargetMarker(getCursorlessTarget(), posOf, relationOf);
}
