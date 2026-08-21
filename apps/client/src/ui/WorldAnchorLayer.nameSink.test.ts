/**
 * @vitest-environment jsdom
 *
 * ⛔ **頭頂血條上的玩家名是「字」，不是「標記」**（GH#80／稽核 F-06）。
 *
 * 這一支守的是 `makeChampionNode` 這個 **sink 本身**，⛔ 刻意不走
 * `net/RoomConnection`：那一層（以及伺服器上的 `sanitizeDisplayName`）會先把
 * payload 的角括號吃掉，於是測到的是**清洗器**而不是這裡 —— 那正是失敗形態⑤
 * 「被測的不是出貨的那個」。清洗器是黑名單、而且逐接縫複製；這一格是輸出端跳脫，
 * 兩者是縱深的兩層，⛔ 不可以互相代替。
 *
 * 突變紀錄：把 `nameEl.textContent = name` 換回
 * `nameEl.innerHTML = name` → 第一條紅（jsdom 解析出 `<img>`，`querySelector` 不是 null）。
 */
import { describe, it, expect } from "vitest";
import { makeChampionNode } from "./WorldAnchorLayer";

/** 一段真的會建出節點的標記。`onerror` 在 jsdom 不會跑，所以斷言看的是 DOM 樹。 */
const PAYLOAD = '<img src=x onerror="globalThis.__pwned=1">收尾';

describe("makeChampionNode —— 玩家名不是標記 (#80)", () => {
  it("餵一段 HTML 進去，得到的是一個文字節點，⛔ 不是一顆 <img>", () => {
    const node = makeChampionNode(PAYLOAD, "#ff3366", true);
    document.body.appendChild(node);

    expect(node.querySelector("img"), "玩家名被當成標記解析了").toBeNull();
    expect(document.querySelector("img")).toBeNull();

    const nameEl = node.querySelector('[data-role="name"]');
    expect(nameEl?.textContent, "整段 payload 要原樣以文字出現").toBe(PAYLOAD);
    // 樣式走 element.style —— 顏色沒有進過 HTML 字串。
    expect((nameEl as HTMLElement).style.color).not.toBe("");
  });

  it("frame loop 讀得到的那四個 data-role 都還在（⛔ 不可以在重寫時掉一格）", () => {
    const node = makeChampionNode("玩家", "#4488ff", false);
    for (const role of ["name", "hp", "mana", "cast-wrap", "cast"]) {
      expect(node.querySelector(`[data-role="${role}"]`), `少了 ${role}`).not.toBeNull();
    }
  });
});
