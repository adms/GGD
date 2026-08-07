/**
 * 結算窗口的商店權限 —— owner 2026-08-06 的規則，兩個方向一起釘。
 *
 * > 「只要我回合被打倒就可以到商店購買，但是被復活就又不行」
 *
 * ── 缺陷長什麼樣（修之前）─────────────────────────────────────────────
 * `shopAccess` 從兩個布林推導相位：
 *
 *     economyOpen ? "prep" : combatActive ? "combat" : "closed"
 *
 * 而 `concludeCombat` 把 `combatActive` 設成 false，`economyOpen` 要到中場才開。
 * 那一段裡兩個布林都是 false —— **與選角、與全場結束完全一樣** —— 所以陣亡者
 * 拿到的是 `phase-closed`，訊息「現在不是備戰時間」。
 *
 * ⚠️ 而 #208「只剩一隊存活就立即宣佈回合勝利」讓**被打倒的那一刻常常就是結算的
 * 那一刻**，所以這個窗口正好蓋住玩家真的會去按商店的時機。
 *
 * ── 為什麼只有兩條 ───────────────────────────────────────────────────
 * 這一批只改了「多一個相位」這一件事，而它只有兩種讀法會變：陣亡者與存活者。
 * `prep` / `closed` 兩格沒被碰過，既有的 shopAccess 測試仍在守它們。
 *
 * 突變紀錄（都真的做過，見 commit message）:
 *   · `shopOpen` 的 `|| phase === "resolution"` 拿掉        → shop-resolution-down 紅
 *   · 那一行改成無條件 `return OPEN`（不看 alive）           → shop-resolution-revived 紅
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../testkit/cover";
import { shopOpen, shopPhaseOf } from "./shopAccess";

describe("結算窗口的商店權限", () => {
  it("⛔ 被打倒的人在回合結算期間買得到東西", () => {
    cover("shop-resolution-down");
    // 主機的相位字串要對得上 —— 客戶端與 sim 共用這一支，對不上就兩邊分岔。
    expect(shopPhaseOf("resolution")).toBe("resolution");
    expect(shopOpen("resolution", false)).toEqual({ open: true });
  });

  it("⛔ 但被復活之後就不行 —— 資格跟著身體走", () => {
    cover("shop-resolution-revived");
    // ⚠️ 兩個方向一起讀：只驗上面那條的話，一個「結算就對所有人開」的實作
    // 也會過，而那會讓活著的贏家在結算畫面上照樣血拚（失敗形態④）。
    expect(shopOpen("resolution", true)).toEqual({ open: false, reason: "combat-alive" });
    // 戰鬥中同一條規則 —— 這是 resolution 借用 combat 語意的前提。
    expect(shopOpen("combat", false)).toEqual({ open: true });
    expect(shopOpen("combat", true)).toEqual({ open: false, reason: "combat-alive" });
  });
});
