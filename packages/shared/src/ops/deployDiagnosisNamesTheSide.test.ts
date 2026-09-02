/**
 * ⭐⭐ **連不到 mini 的時候，腳本要說出「是哪一邊移動了」，⛔ 不是印三個猜測。**
 *
 * ── ⛔⛔ 2026-09-02 的實際代價 ──────────────────────────────────────────
 * `mini-deploy.sh` 印的是三行並列的可能性：
 *   「mini 睡著了？」「不在同一個網段？」「IP 變了？」
 * ⇒ ⭐ 而我**連續五輪**都把它讀成第一個，回報「那台 mini 需要你看一下」——
 * ⛔ 真相是**這台筆電換了網路**（`10.10.206.29`，而 mini 在 `192.168.0.x`）。
 * ⇒ ⭐ mini **好好的**，而我叫 owner 去喚醒一台沒睡的機器，五次。
 *
 * ── ⭐ 而前兩個是**分辨得出來的** ───────────────────────────────────────
 * 比對本機網段與目標網段就知道。⛔ 只有第三個（DHCP 同網段換尾碼）需要人去看。
 * ⇒ ⭐ 這正是 CLAUDE.md 的元規則：**把判準換成一個會回答你的東西**。
 *
 * ⚠️ 這一條掃**出貨腳本的原始碼**（⛔ 不執行它 —— 執行需要一台真的 mini）。
 * ⭐ 它問的是「那段診斷有沒有**量**」，⛔ 不是「有沒有印東西」。
 *
 * MUTATION LOG（落地前真的跑過）：
 *   · 把網段比對改回三行並列的猜測 → 🔴
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPT = resolve(__dirname, "../../../../scripts/mini-deploy.sh");

describe("部署連不上時的診斷", () => {
  const src = readFileSync(SCRIPT, "utf8");

  it("★★ ⭐ 它**量**本機網段（⛔ 不是列三個可能性讓人猜）", () => {
    expect(
      /ipconfig getifaddr/.test(src),
      "⛔⛔ 連不到的分支沒有讀本機 IP ⇒ ⭐ 它分不出「我移動了」與「它睡了」，\n" +
        "   ⚠️ 而 2026-09-02 那次**連續五輪**都因此指錯方向。",
    ).toBe(true);
    expect(
      /_MY_NET.*!=.*_TARGET_NET|_TARGET_NET.*!=.*_MY_NET/.test(src),
      "⛔ 讀了本機 IP 卻**沒有拿它跟目標比** ⇒ 那個讀數沒有被用來回答問題。",
    ).toBe(true);
  });

  it("★★ ⭐ 網段不同時，訊息要說「移動的是**這一台**」（⛔ 不是怪 mini）", () => {
    expect(
      src.includes("移動的是**這一台**"),
      "⛔⛔ 量到網段不同卻沒說是**本機**移動 ⇒\n" +
        "   ⭐ 讀的人仍然會去喚醒一台沒睡的機器。",
    ).toBe(true);
    expect(
      src.includes("不要去喚醒一台沒睡的機器"),
      "⛔ 沒有明確叫人**不要**做那個沒用的動作 —— ⭐ 一個只說「不是這個」的診斷不夠。",
    ).toBe(true);
  });

  it("★ ⭐ 同網段而連不到時，才指向 mini 那一側", () => {
    // ⭐ 兩個分支都要在 —— ⛔ 只有一個的話它就變成一句永遠成立的話。
    expect(src.includes("同一個網段"), "⛔ 沒有「同網段」那一支").toBe(true);
    expect(src.includes("caffeinate"), "⛔ 同網段那一支沒有給 mini 側的修法").toBe(true);
  });

  it("★ ⭐ 量不到本機 IP 時**說出來**（⛔ 不是靜靜地走進錯的分支）", () => {
    expect(
      src.includes("量不到本機 IP"),
      "⛔ `ipconfig` 失敗時沒有第三條路 ⇒ ⭐ 空字串會讓比對靜靜地走進「同網段」那一支。",
    ).toBe(true);
  });
});
