/**
 * viewGatedEntities —— ⭐ **一個 view-gated 欄位在「空」的時候是 `undefined`，
 * ⛔ 不是空集合**（GH#760 步驟 2 之後的新事實）。
 *
 * ---------------------------------------------------------------------------
 * 量到的（2026-08-27，真瀏覽器 · localhost · HEAD 939e9773）
 * ---------------------------------------------------------------------------
 * `packages/shared/src/protocol/schema.ts` 對 `MatchState.entities` 下了
 * `view()(MatchState.prototype, "entities")`。它的檔頭已經寫對了一半：
 *
 * > ⚠️ 反面是 ⛔ **沒有 `client.view` 的客戶端一個實體都收不到**
 *
 * ⭐ 而它**沒有**寫的那一半，才是真的會咬人的：**有 view、但 view 裡一個實體
 * 都沒有的時候，Colyseus 根本不會送這一格** ⇒ 客戶端的 `state.entities`
 * 是 **`undefined`**（⛔ 不是 `size === 0` 的空 map）。
 *
 * ⚠️ 而那正好就是**選人畫面**：`champSelect` 期間一隻實體都還沒生出來。
 * 實測（183 份連續快照）：`champSelect / noEntities`，一份都沒有例外。
 *
 * ⇒ 在此之前客戶端有 **6 個**地方無條件讀它，兩個致命：
 *
 * | 地方 | 症狀 |
 * |---|---|
 * | `GameApp.onStatePatch` 的閘 `if (!state?.seats \|\| !state.entities) return` | ⭐ **整份快照被丟掉** ⇒ `syncHudFromState` 一次都沒跑 ⇒ HUD 永遠停在「Connecting to match…」⇒ **進不了選人畫面** |
 * | `GameApp.collectEntities` 的 `state.entities.forEach` | **每一幀**擲 `TypeError` ⇒ `renderFrame` 在第 4 步中止，後面的 views/camera/vfx/anchors/**draw** 全部不跑 |
 *
 * ---------------------------------------------------------------------------
 * ⭐ 為什麼修在客戶端，⛔ 不是把 `view()` 拿掉
 * ---------------------------------------------------------------------------
 * 「空的 view-gated 集合不上線」是 **Colyseus 的編碼事實**，⛔ 不是伺服器忘了做
 * 什麼 —— `MatchRoom.onJoin` 已經指派了 view（`zoneViews.onJoin`）。
 * ⇒ 會**再次**發生的是「客戶端假設它一定在」，所以閘要立在客戶端這一側。
 *
 * ⚠️ 這與「fail-open 沒錯，**靜默**才是缺陷」同一族：本檔讓那六個讀端**活下來**，
 * 而 `perfBus.renderLoopErrors` 仍然是那個「有東西擲了例外」的收據。
 */

import type { EntityState, MatchState } from "@ggd/shared/protocol/schema";

/** `MatchState.entities` 的型別，⛔ 不必把 `@colyseus/schema` 拉進 client 的相依。 */
export type EntityMap = MatchState["entities"];

/**
 * 「這一份快照裡一個實體都沒有」的那一份唯讀替身。
 *
 * ⚠️ 刻意是**模組層的單例**：讀端跑在每一幀的熱路徑上，⛔ 不可以每一幀配一個新的。
 * ⭐ 一個真的 `Map` 就夠了 —— 六個讀端只用到 `forEach` / `get` / `has` / `size`，
 * 而那四樣 `Map` 與 `MapSchema` 的語意一字不差。
 */
const NO_ENTITIES = new Map<string, EntityState>() as unknown as EntityMap;

/**
 * ⭐ 讀 `state.entities` 的**唯一**入口。
 *
 * ⛔ 不要在呼叫端寫 `state.entities ?? …` —— 那樣這份「為什麼會是 undefined」
 * 的知識就會有第二個住處（第〇·四守則），而下一個新增的讀端不會知道要加。
 */
export function entitiesOf(state: MatchState | null | undefined): EntityMap {
  return state?.entities ?? NO_ENTITIES;
}

/**
 * 這一份快照的實體集合**到了沒有**。
 *
 * ⭐ 給的是「還沒到」與「到了但是空的」的**區別**，⛔ 不是 `size === 0`：
 * 前者是選人畫面（正常），後者是實體全滅（也正常）—— 但只有前者代表
 * 「這一格的資料還沒有上線，⛔ 不要拿它下任何結論」。
 */
export function entitiesDelivered(state: MatchState | null | undefined): boolean {
  return state?.entities !== undefined;
}
