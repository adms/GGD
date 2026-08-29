/**
 * ⭐ GH#765 —— TouchControls 的**矩形模型**。
 *
 * ⚠️ 為什麼這支存在：`028aa3bf`（#275 的驗屍）逐字量到
 * 「觸控 844x390 **裝備欄壓在攻擊鈕上重疊 88x38** 且 z 序贏 + pointerEvents auto」，
 * 而同一則訊息自陳兩個盲點，第二個是「**TouchControls 完全不在 hudLayout 的世界裡**」。
 * ⇒ `grep -rn "touchControlsRect" apps/ packages/` 在 2026-08-26 是 **0 命中**：
 * 全 repo 沒有任何東西算得出那三顆按鈕在畫面上的位置，於是那個重疊
 * **不可能被任何守衛看見**（失敗形態⑦：掃屬性代替掃行為）。
 *
 * ⭐ **常數住在這裡，元件 import 它** —— ⛔ 不是測試裡抄一份座標。
 * 抄一份就是第四個住處（第〇·四守則），而它會在下一次排版微調時靜靜地過期，
 * 然後這條守衛會繼續綠著量一個已經不存在的版面。
 *
 * ⚠️ **矩形是外接框，⛔ 不是精確的圓**：圓弧上的按鈕是圓形，這裡用它的外接方框。
 * ⇒ 這把尺**會多報**重疊（保守），⛔ 不會少報 —— 那個方向才是安全的。
 * ⚠️ 而且它只回答**幾何**：`pointerEvents` / z 序不是幾何，矩形不重疊
 * ⛔ 不等於觸控不會被吃掉。這支只關掉一半的門。
 */
import type { CoreAbilitySlot } from "@ggd/shared/sim/intents";
import { hudScale, hudScaleTappable, hudScaleTier, type HudScaleTier } from "../hudScale";
import { HUD_STAMP_BAND, type HudRect, type HudViewport } from "./hudLayout";

/** Q/W/E/R —— 圓弧上的四顆。⛔ 只有一個住處：`TouchControls.tsx` import 這一個。 */
export const TOUCH_ARC_SLOTS: readonly CoreAbilitySlot[] = ["Q", "W", "E", "R"];

/** attack-button center offset from the bottom-right corner (CSS px) */
export const ATTACK_CENTER = 84;
export const ATTACK_SIZE = 88;
export const ABILITY_SIZE = 58;
/** ability arc radius around the attack button */
export const ARC_RADIUS = 122;
/** recall（⌂）—— 圓弧正上方的小工具鈕；它用觸控下限的 44 當邊長。 */
export const RECALL_SIZE = 44;
/** recall 在圓弧之上再抬高這麼多。 */
export const RECALL_LIFT = 46;

export interface TouchMetrics {
  attackCenter: number;
  attackSize: number;
  abilitySize: number;
  arcRadius: number;
  s: (px: number) => number;
  tap: (px: number) => number;
}

/** 這一次繪製的實際尺寸。⛔ 全部從 `hudScale*` 來，這裡不做算術。 */
export function touchMetrics(tier: HudScaleTier = hudScaleTier()): TouchMetrics {
  const s = (px: number): number => hudScale(px, tier);
  const tap = (px: number): number => hudScaleTappable(px, tier);
  const attackSize = tap(ATTACK_SIZE);
  /**
   * ⭐ **錨點不可以縮進版本徽章的保留帶**（`versionBadgeBand.test.ts` 抓到的）。
   *
   * 整個觸控叢集都是從 `attackCenter` 往上長的，而 `hudScale(84,"min") = 8` ——
   * 比 `HUD_STAMP_BAND`（版本徽章在**每一個畫面**都畫在那裡）還低。也就是最小
   * 檔位會把攻擊鈕壓進徽章底下：按鈕在那裡、字也在那裡，兩個疊著。
   *
   * ⛔ 這不是「把徽章讓開」可以解的 —— 徽章是 #245 刻意提到最上層的。
   * 所以是**錨點有下限**。⚠️ 下限是 `HUD_STAMP_BAND`，⛔ 不是一個新發明的數字。
   */
  const anchorFloor = HUD_STAMP_BAND + attackSize / 2;
  return {
    attackCenter: Math.max(s(ATTACK_CENTER), anchorFloor),
    attackSize,
    abilitySize: tap(ABILITY_SIZE),
    arcRadius: s(ARC_RADIUS),
    s,
    tap,
  };
}

/** 圓弧上第 i 顆的中心（距右下角的 CSS `right` / `bottom`）。 */
export function arcCenter(
  i: number,
  m: TouchMetrics = touchMetrics(),
): { right: number; bottom: number } {
  const angle = (i / (TOUCH_ARC_SLOTS.length - 1)) * (Math.PI / 2);
  return {
    right: m.attackCenter + Math.cos(angle) * m.arcRadius,
    bottom: m.attackCenter + Math.sin(angle) * m.arcRadius,
  };
}

/** 一顆按鈕：CSS 的 right/bottom（到那一邊的距離）＋ 邊長。 */
interface CornerBox {
  right: number;
  bottom: number;
  size: number;
}

/** 右下角座標 → viewport 座標（原點左上，與 `hudSlotRect` 同一個空間）。 */
function toRect(b: CornerBox, vp: HudViewport): HudRect {
  return {
    x: vp.width - b.right - b.size,
    y: vp.height - b.bottom - b.size,
    w: b.size,
    h: b.size,
  };
}

function union(rects: readonly HudRect[]): HudRect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    w: Math.max(...rects.map((r) => r.x + r.w)) - x,
    h: Math.max(...rects.map((r) => r.y + r.h)) - y,
  };
}

/** 一顆按鈕的矩形，帶著它的名字 —— 守衛紅的時候要指名**哪一顆**。 */
export interface TouchButtonRect {
  id: string;
  rect: HudRect;
}

export interface TouchControlsRects {
  /** ⭐ 大攻擊鈕 —— `028aa3bf` 被裝備欄吃掉 88×38 的就是這一顆。 */
  attack: HudRect;
  /**
   * ⭐ 逐顆按鈕（含攻擊鈕）。**比對用這一個**，⛔ 不是 `cluster` ——
   * 圓弧是扇形，它的外接框有一大半是空的，拿它去比對會多報一堆不存在的重疊。
   */
  buttons: readonly TouchButtonRect[];
  /**
   * Q/W/E/R ＋ EX ＋ 天生技 ＋ recall ＋ 攻擊鈕的**外接框**（最壞情況：全部都畫）。
   * ⚠️ 只適合回答「整叢集有沒有跑出畫面」，⛔ 不適合回答「它壓到誰」。
   */
  cluster: HudRect;
  /**
   * 搖桿的**觸控捕捉區**：畫布左半（`GameApp.isJoystickArea` 逐字
   * `clientX - rect.left < rect.width / 2`）。
   * ⚠️ 搖桿本身畫在手指落下的地方（`position:fixed` + transform），
   * 所以「搖桿的矩形」只有這一個有意義的答案：**它會吃掉哪一塊**。
   */
  joystick: HudRect;
}

/**
 * TouchControls 在這個 viewport ／這個 HUD 縮放檔位下真的佔住的矩形。
 *
 * ⛔ 這裡不做任何「大概是這樣」的估算：每一格都從 `touchMetrics()` /
 * `arcCenter()` 來，也就是**元件排版時用的同一組數字**。
 */
export function touchControlsRect(
  viewport: HudViewport,
  tier: HudScaleTier = hudScaleTier(),
): TouchControlsRects {
  const m = touchMetrics(tier);
  const half = m.abilitySize / 2;
  const attack: CornerBox = {
    right: m.attackCenter - m.attackSize / 2,
    bottom: m.attackCenter - m.attackSize / 2,
    size: m.attackSize,
  };
  const boxes: (CornerBox & { id: string })[] = [
    { ...attack, id: "attack" },
    // Q/W/E/R
    ...TOUCH_ARC_SLOTS.map((slot, i) => {
      const c = arcCenter(i, m);
      return { id: slot, right: c.right - half, bottom: c.bottom - half, size: m.abilitySize };
    }),
    // EX（圓弧的斜對角外側）
    {
      id: "EX",
      right: m.attackCenter + m.arcRadius - half,
      bottom: m.attackCenter + m.arcRadius - half,
      size: m.abilitySize,
    },
    // 天生技（刻意離開圓弧，在攻擊鈕那一列再往左一格）
    {
      id: "innate",
      right: m.attackCenter + m.arcRadius + m.abilitySize - half,
      bottom: m.attackCenter - half,
      size: m.abilitySize,
    },
    // recall（⌂）
    {
      id: "recall",
      right: m.attackCenter - m.tap(RECALL_SIZE) / 2,
      bottom: m.attackCenter + m.arcRadius + m.s(RECALL_LIFT),
      size: m.tap(RECALL_SIZE),
    },
  ];
  return {
    attack: toRect(attack, viewport),
    buttons: boxes.map((b) => ({ id: b.id, rect: toRect(b, viewport) })),
    cluster: union(boxes.map((b) => toRect(b, viewport))),
    joystick: { x: 0, y: 0, w: viewport.width / 2, h: viewport.height },
  };
}
