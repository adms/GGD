/**
 * ⭐【「一位玩家剛加入時真的收到什麼」的單一入口】—— GH#760 步驟 2。
 *
 * 自從 `MatchState.entities` 帶上 `view()` tag（per-client 剔除），
 * **`encoder.encodeAll()` 已經不再是客戶端收到的東西**：view-tagged 欄位的異動
 * 走 `ChangeTree.filteredChanges`，而 `encodeAll` 只走 `allChanges`
 * ⇒ ⛔ 它的輸出裡**一個實體都沒有**。
 *
 * 出貨真正走的是 `SchemaSerializer.getFullState(client)`：
 * ```
 *   fullEncodeBuffer[0] = Protocol.ROOM_STATE;
 *   sharedOffsetCache   = { offset: 1 };
 *   fullEncodeCache     = encoder.encodeAll(sharedOffsetCache, fullEncodeBuffer);
 *   return encoder.encodeAllView(client.view, sharedOffsetCache.offset, {…}, fullEncodeBuffer);
 * ```
 * 這一支就是那四行 —— ⭐ 逐字照抄，⛔ 不是一個「差不多的」重寫，否則量到的東西
 * 又會是一個虛構通道（失敗形態⑤）。
 */
import { Encoder, StateView } from "@colyseus/schema";
import type { EntityState, MatchState } from "@ggd/shared/protocol/schema";

/** 把整份 `state.entities` 收進一個新的 `StateView` ＝「全部可見」那條路。 */
export function viewOfEverything(state: MatchState): StateView {
  const view = new StateView();
  state.entities.forEach((es) => view.add(es as unknown as EntityState));
  return view;
}

/**
 * 一位客戶端加入時真的收到的那一段位元組（共用段 + 這一份 view 的 filtered 段）。
 * `view` 省略 ⇒ 「全部可見」，也就是剔除關掉時的線路內容。
 */
export function fullStateBytes(
  encoder: Encoder<MatchState>,
  state: MatchState,
  view: StateView = viewOfEverything(state),
): Buffer {
  const buf = Buffer.allocUnsafe(Encoder.BUFFER_SIZE);
  const shared = { offset: 1 };
  encoder.encodeAll(shared, buf);
  return encoder.encodeAllView(view, shared.offset, { ...shared }, buf);
}

/** 解碼的起點：第 0 個位元組是 `Protocol.ROOM_STATE`，⛔ 不是狀態本身。 */
export const WIRE_DECODE_START = { offset: 1 } as const;
