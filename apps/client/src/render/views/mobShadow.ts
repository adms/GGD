/**
 * GH#647 —— 「普通殭屍腳下要不要畫陰影圓盤」, as ONE testable decision.
 *
 * owner 2026-08-24:「殭屍波的普通殭屍不必畫血條跟陰影 節省效能」。
 * R7 一區 30 隻 × 2 區 = 60 顆 alpha-blended 圓盤,每一顆都是一次 draw call
 * 加一層地板 overdraw —— 而普通殭屍波峰時根本沒有人在看牠腳下。
 *
 * 判準與精英小血條(GH#268)**同一個**:快照上的 `ENTITY_FLAG.MOB_ELITE`
 * (`isEliteMob`),不是體型、不是 modelKey —— 那些是設定值,操作者一改,
 * 「誰有影子」就會悄悄跟著變。精英(特殊殭屍 + 殭屍王)保留影子:牠們體型
 * 2×/5×,數量少,而影子正是體型讀感的主要來源。
 *
 * 跟 `mobRingDiameterFor`(mobGroundRing.ts)同一個形狀、同一個理由:決策
 * 住在可以 headless 驅動的地方,`GameApp` 只留接線 —— 內聯在 GameApp 的
 * 決策是沒有任何守衛驅動得到的決策(失敗形狀 ③)。
 *
 * 開關(後台可調,owner 常設「留後台開關可以簡易 rollback」):
 * `mobWaves.normalMobShadow`,走 `MatchState.mobVisualJson` 這條既有頻道
 * (`sim/mobs.ts` 的 `MobVisualTable`),出貨 false = 不畫(owner 的裁決是預設,
 * 第〇·六守則)。翻成 true = 回到舊行為(普通殭屍也有影子)。
 */
import { ENTITY_KIND, isEliteMob } from "@ggd/shared/protocol/schema";
import type { MobVisualTable } from "@ggd/shared/sim/mobs";
import type { EntityViewState } from "../EntityViewRegistry";

/**
 * `true` = 這具身體的腳下影子要**壓掉**(不畫)。
 *
 * 只有「普通(非精英)殭屍 × 後台說不畫」這一種組合回 true:冠軍、中立物件、
 * 精英殭屍一律回 false —— 牠們的影子不歸這張表管,永遠照 `ChampionView`
 * 自己的規則畫(死亡/隱形/飛行那些既有 writer 不受影響)。
 */
export function mobShadowSuppressedFor(
  e: Pick<EntityViewState, "kind" | "flags">,
  table: Pick<MobVisualTable, "normalMobShadow">,
): boolean {
  if (e.kind !== ENTITY_KIND.MOB) return false;
  if (isEliteMob(e.kind, e.flags ?? 0)) return false;
  return !table.normalMobShadow;
}
