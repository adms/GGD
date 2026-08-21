/**
 * friendOrder — 朋友列表的排序決策（GH#536）。
 *
 * owner 2026-08-22：「**朋友清單，有上線的應該會特別排到最上面顯示吧？**」
 *
 * ⚠️ 在此之前的答案是**不會**：平台端 `friend/handlers.go::entries` 用
 * `out[i].ID < out[j].ID` 排 —— 也就是**帳號 id**，對眼睛來說等於亂序 ——
 * 而 `FriendsPanel` 原樣照畫。這在 GH#499（管理員預設好友，既有 **198 人**一起
 * 回填）之後變成真的問題：一頁 198 列裡要用捲的去找那三個亮著綠點的人。
 *
 * ---- 為什麼排序在客戶端，⛔ 不在平台 ---------------------------------------
 * 面板畫的狀態是**兩個來源合起來**的：REST 快照的 `f.state`，加上 WS 推播的
 * `presence[f.id]` 疊在上面（`FriendsPanel` 的 `presence[f.id] ?? f.state`）。
 * 而 REST 只有 `FRIENDS_POLL_MS = 10_000` 才重抓一次。
 * ⇒ 排在伺服器＝用**最舊**的那一半排：剛上線的人綠點已經亮了，卻要再等最多十秒
 * 才會跳上去。⛔ 那正是這條規則想避免的樣子。
 *
 * ---- 這一份是純函式,所以決策看得見也測得到 ---------------------------------
 * 跟 `onlinePlayers.ts` 同一個形狀：面板要**決定**的東西住這裡，
 * 面板本身只剩下畫。
 */
import type { FriendSortMode } from "./lobbyLayout";

/** 一列朋友需要的最小形狀（`api.ts` 的 `friendEntry` 是它的超集）。 */
export interface SortableFriend {
  id: string;
  username?: string;
}

/**
 * 一個 presence 狀態排第幾（小的排前面）。
 *
 * ⭐ 三個線上狀態**不是同一格**，而順序服務的是這個面板唯一的動作：**邀請**。
 * `in-lobby` / `online` 現在就邀得動（`FriendsPanel` 的 Invite 按鈕正是用這兩個
 * 開的），`in-match` 的人亮著燈但正在打，邀了也是打擾。
 *
 * ⚠️ 未知狀態跟 `offline` 同一格,⛔ 不是自成一格排在最後 ——
 * 平台新增一個狀態名時,那個人應該落在「大概離線」而不是「排在離線後面」。
 */
export function presenceRank(state: string | undefined): number {
  switch (state) {
    case "in-lobby":
      return 0;
    case "online":
      return 1;
    case "in-match":
      return 2;
    default:
      return 3;
  }
}

/**
 * 排好的朋友列表。
 *
 * `mode`：
 *  · `online-first`（出貨值，owner 明說的那個）—— 在線的排最上面，
 *    同一群內再按**使用者名稱**（相同再按 id）。
 *  · `name` —— 純字母序，不分線上離線。給「我就是要照名字找人」的人。
 *
 * 名稱→id 的兩段 tie-break 是 repo 既有的慣例，⛔ 不是我新編的：
 * `friend/roster.go::livePlayable` 的 `sort.Slice` 逐字就是這兩段。
 *
 * ⛔ 不就地改動輸入陣列 —— 它是 store 裡的那一份，React 會拿 identity 比對。
 */
export function orderFriends<T extends SortableFriend>(
  friends: readonly T[],
  /** 合併後的即時狀態（`presence[id] ?? f.state`），⛔ 不是 REST 快照那一半 */
  stateOf: (f: T) => string | undefined,
  mode: FriendSortMode = "online-first",
): T[] {
  const byName = (a: T, b: T): number => {
    const an = a.username || a.id;
    const bn = b.username || b.id;
    return an === bn ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : an < bn ? -1 : 1;
  };
  const out = [...friends];
  if (mode === "name") return out.sort(byName);
  return out.sort((a, b) => {
    const d = presenceRank(stateOf(a)) - presenceRank(stateOf(b));
    return d !== 0 ? d : byName(a, b);
  });
}
