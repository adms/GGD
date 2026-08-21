/**
 * GH#537 —— owner 2026-08-22:「朋友清單，有上線的應該會特別排到最上面顯示吧？」
 *
 * ⛔ 只驗**出貨預設**（`online-first`）那一條路（CLAUDE.md 第〇·六：
 * 「測試也只做預設啟動的項目就好」）。`name` 模式是為了讓 owner 回頭用的,不測。
 */
import { describe, it, expect } from "vitest";
import { orderFriends } from "./friendOrder";
import { DEFAULT_LOBBY_LAYOUT } from "./lobbyLayout";

/** REST 快照那一半：**全部離線**（這正是輪詢間隔裡的樣子）。 */
const SNAPSHOT = [
  { id: "acc-01", username: "zoe", state: "offline" },
  { id: "acc-02", username: "adam", state: "offline" },
  { id: "acc-03", username: "mila", state: "offline" },
  { id: "acc-04", username: "bo", state: "offline" },
];

const merged = (presence: Record<string, string>) =>
  orderFriends(SNAPSHOT, (f) => presence[f.id] ?? f.state, DEFAULT_LOBBY_LAYOUT.friendSort);

describe("orderFriends", () => {
  it("⭐ 在線的排最上面,而且吃的是 WS 推播疊上去的狀態(⛔ 不是 REST 那一半)", () => {
    // `zoe`/`bo` 的 REST 狀態還寫著 offline —— 只有推播知道他們上線了。
    const rows = merged({ "acc-01": "online", "acc-04": "in-lobby" });
    // in-lobby(邀得動) > online > 離線;同一群內按使用者名稱。
    expect(rows.map((f) => f.username)).toEqual(["bo", "zoe", "adam", "mila"]);
  });

  it("in-match 亮著燈但正在打 —— 排在線上那一群的最後,⛔ 不在離線後面", () => {
    const rows = merged({ "acc-01": "in-match", "acc-02": "online" });
    expect(rows.map((f) => f.username)).toEqual(["adam", "zoe", "bo", "mila"]);
  });

  it("平台哪天多一個沒見過的狀態,那個人落在「大概離線」,⛔ 不是自成一格排最後", () => {
    const rows = merged({ "acc-02": "away-afk-2027", "acc-03": "online" });
    expect(rows.map((f) => f.username)).toEqual(["mila", "adam", "bo", "zoe"]);
  });

  it("⛔ 不就地改動輸入(store 那一份靠 identity 比對)", () => {
    const input = [...SNAPSHOT];
    orderFriends(input, () => "online", DEFAULT_LOBBY_LAYOUT.friendSort);
    expect(input.map((f) => f.id)).toEqual(SNAPSHOT.map((f) => f.id));
  });
});
