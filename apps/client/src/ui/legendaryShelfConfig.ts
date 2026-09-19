/**
 * legendaryShelfConfig — 客戶端讀 `config.arena-rules@1` 的 `legendaryShelf.swapWhenFull`
 * （GH#1110 B：背包滿時三選一可不可以當場換掉一件）。
 *
 * ⭐ 懶讀（同 `coinThrow.coinThrowRules` / `uiCuesConfig`）：每次問的當下讀
 * `Configs.tryGet()` ⇒ ⛔ 沒有第二個必須記得的接線點。
 * ⛔ 不 parse 整份 arena-rules：別的區塊漂掉不該讓這一格失效。
 *
 * ⚠️ 這一格只決定**要不要畫換裝介面**。權威在伺服器（`sim/economy/draft.ts::applyItemPick`
 * 讀比賽開場凍結的 `world.legendaryShelf`）—— 兩邊不一致時伺服器回 `itemPickRejected`，
 * 玩家看到「道具欄已滿」，⛔ 不會發生「畫面說換了而其實沒換」。
 */
import { Configs, DEFAULT_LEGENDARY_SHELF } from "@ggd/shared/content";
import { ARENA_RULES_DOC_ID } from "@ggd/shared/content/schema/config/arenaRules";

/** 這一刻生效的「背包滿時可以換掉一件」（後台覆蓋層 ?? 出貨 JSON ?? Zod 預設）。 */
export function swapWhenFullEnabled(): boolean {
  const doc = Configs.tryGet(ARENA_RULES_DOC_ID) as { legendaryShelf?: { swapWhenFull?: unknown } } | undefined;
  const v = doc?.legendaryShelf?.swapWhenFull;
  return typeof v === "boolean" ? v : DEFAULT_LEGENDARY_SHELF.swapWhenFull === true;
}

/**
 * 這一刻生效的「背包滿時可以放棄這張卡」（GH#1271，同上懶讀）。
 *
 * ⚠️ 這一格只決定**畫不畫那顆「放棄」**；權威一樣在伺服器
 * （`apps/game-server/src/match/MatchController.ts` 的 `pickOffer` 分支讀開場凍結的 `world.legendaryShelf`）
 * ⇒ 兩邊不一致時卡片留著，⛔ 不會發生「畫面說丟了而其實沒丟」。
 */
export function skipWhenFullEnabled(): boolean {
  const doc = Configs.tryGet(ARENA_RULES_DOC_ID) as { legendaryShelf?: { skipWhenFull?: unknown } } | undefined;
  const v = doc?.legendaryShelf?.skipWhenFull;
  return typeof v === "boolean" ? v : DEFAULT_LEGENDARY_SHELF.skipWhenFull === true;
}
