/**
 * 條件角標 —— 技能格右上角一枚 **11px 高**的小籤，只在那支技能真的帶 gate 時出現。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ owner 2026-08-22 的三句話，這個設計是它們的交集（GH#556）
 * ════════════════════════════════════════════════════════════════════════════
 *
 * > 「根本**不需要顯示那麼大的技能說明區塊**，請你**移除這個功能到 legacy
 * >   不要再出現了**」            ← 大橫幅退休（docs/legacy/_retired-ui/）
 * > 「注意，我講的是**按下不再顯示大面積的技能解說**，但是 **hover 過去有的
 * >   技能小解說還是在**喔」        ← 技能格的 anchored Tooltip 一個字都沒動
 * > 「**不行 他實在太佔空間了，要重新設計不要再放回去**」
 * >                                ← ⛔ 觸發條件**不准**回到那個 Tooltip 裡
 *
 * ⇒ 判準只有一條：**「太佔空間」**。所以這一枚角標付出的版面成本是 **0** ——
 *   它是 `position:absolute` 疊在**既有的** tile 上，⛔ 沒有把任何東西推開、
 *   ⛔ 沒有新增一列、⛔ 沒有動 Tooltip 的 body 或 meta。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼是「兩個字」而不是一顆看不懂的符號
 * ════════════════════════════════════════════════════════════════════════════
 * 票上提的第一個方向是「一顆小徽章」。⚠️ 一顆 `◈` 佔的空間跟兩個字幾乎一樣，
 * 但它**要玩家先學會它是什麼意思**；而這一格 tile 上**本來就有**同一族的小籤
 * （天生技的 `Lv1` / `被動` / `主動`，8px 字、11px 行高、同一個深底圓角），
 * 所以 `條件` 是**沿用既有的視覺語言**，⛔ 不是新發明一種。
 * owner 要的是「瞄一眼就懂」—— 兩個中文字瞄一眼就懂，一顆菱形不會。
 *
 * ⛔ **票上另外兩個方向這裡刻意沒有做，而且理由是機制上的，不是偏好**：
 *   • 「冷卻圈換第二種顏色」與「按下被拒時浮一行字」都預設**這個 gate 會擋施放**。
 *     ⚠️ 它不會 —— `abilityConditionLabels` 讀的是 `passive.ranks[].hooks[].condition`
 *     （**觸發時機**：普攻命中時、受擊時…），⛔ 不是施法前置條件。
 *     照那兩個方向做出來的東西**永遠不會亮**，而它會通過所有測試（第一·五守則：
 *     「說了但不會發生」）。
 *   • 同理，「條件目前不成立時才亮」在客戶端**算不出來**：多數 gate 的主詞是
 *     `target`，而站在技能列前面的玩家此刻沒有 target。⛔ 與其畫一顆會說謊的燈，
 *     不如畫一枚只陳述「這支技能有觸發條件」的籤。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 那**句子**去哪了 —— `title`，零版面
 * ════════════════════════════════════════════════════════════════════════════
 * 完整的 `觸發條件：目標不是英雄 且 目標生命 < 35%` 掛在角標自己的原生 `title`
 * 上：它**不佔任何版面**，只有玩家把游標**停在那 16px 上**才會出現，符合票上的
 * 「只在需要時出現」。⛔ 它沒有進 `Tooltip` 的 `body`／`meta`（那正是 owner 否決的）。
 *
 * ⚠️ 句子一律由 `abilityConditionLabels()` 從**引擎真的 gate 的那個 `condition`
 * 物件**推導，⛔ 這裡一個字都不自己造 —— 手寫的句子與實作是兩個住處（第〇·四守則）。
 *
 * ⚠️ **只掛桌面版技能列。** 觸控版（ui/TouchControls）的技能鍵是圓形、而且沒有
 * hover ⇒ 角落沒有直角可放、`title` 也永遠讀不到。那一半是另一個設計題。
 */
import { abilityConditionLabels } from "@ggd/shared/sim/content/condition";
import { abilityBarMetrics } from "./abilityBarMetrics";

/**
 * 結構型參數 —— 與 `abilityConditionLabels` 同型，所以 `AbilityDef`（登錄表）與
 * 載入的 doc 兩側共用同一支函式，⛔ 不需要為了 UI 再窄化一個型別。
 */
export type GatedDef = Parameters<typeof abilityConditionLabels>[0];

/** 角標上的兩個字。導出讓守衛讀出貨的那一份，⛔ 不要在測試裡再打一次。 */
export const CONDITION_MARK_LABEL = "條件";

/** 只有這一顏色代表「觸發條件」—— 六格 tile 共用一個色，玩家才學得起來。 */
export const CONDITION_MARK_COLOR = "#7fe0c0";

/**
 * 這支技能的所有 gate 併成 `title` 的內容（每句一行），沒有 gate 就回 `null`。
 * ⭐ 純函式，⛔ 不碰 DOM —— 守衛可以直接對它斷言。
 */
export function conditionMarkTitle(def: GatedDef | null | undefined): string | null {
  const labels = abilityConditionLabels(def ?? ({} as GatedDef));
  return labels.length === 0 ? null : labels.join("\n");
}

/**
 * 角標本體。沒有 gate 的技能（絕大多數）回 `null` ⇒ 畫面上一個像素都不多。
 *
 * ⚠️ 要放在 `<IconImg fill>` **之後**（同 `TileName` 的理由）：`inset:0` 的圖示
 * 會蓋掉排在它前面的任何東西。
 */
export function AbilityConditionMark({ def }: { def: GatedDef | null | undefined }): React.JSX.Element | null {
  const title = conditionMarkTitle(def);
  if (title === null) return null;
  const m = abilityBarMetrics();
  return (
    <div
      data-ability-condition-mark
      title={title}
      aria-label={title}
      style={{
        position: "absolute",
        // ⛔ 兩軸都是 0（貼著 tile 自己的右上角）—— hudLayout 的
        //    「no HUD file hard-codes a corner position」掃的是非零的一組座標。
        right: 0,
        top: 0,
        padding: `0 ${m.s(3)}px`,
        borderBottomLeftRadius: m.s(5),
        background: "rgba(6,20,18,0.88)",
        color: CONDITION_MARK_COLOR,
        fontSize: m.s(8),
        lineHeight: `${m.s(11)}px`,
        letterSpacing: m.s(0.5),
      }}
    >
      {CONDITION_MARK_LABEL}
    </div>
  );
}
