/**
 * ⭐⭐ 第十一回合的門檻計數：**只算殭屍王、整場累計、按實體 id 去重**
 * （GH#1151 A 逐字：「第 1–10 回合**累計**王擊殺達門檻⋯**去重計數**」）。
 *
 * ⚠️⭐ 這條守衛存在的理由是一個**已經在跑**的量會誤導人：
 * `MatchController.roundBossKills` 的註解逐字寫著「王 / **特殊怪**」——
 * ⭐ 它**刻意**把兩種都算（那是評分用的），
 * ⛔ 而第十一回合的門檻問的是「打倒了幾隻**殭屍王**」。
 * ⇒ 把特殊殭屍算進去，門檻 3 會在第二三回合就被一批特殊怪湊滿。
 *
 * ⭐ 這裡驗的是**那個區分**，⛔ 不是「有一個計數器」。
 */
import { describe, it, expect } from "vitest";
import { recordBossKill, shouldEnterRound11, ROUND11_PRECEDING_ROUND } from "@ggd/shared/sim/round11Gate";

/** 出貨處理器裡那一行的**同一個判準**（⛔ 這裡不重寫規則，只重放事件）。 */
function feed(slain: Set<number>, ev: { kind: string; id: number }): void {
  if (ev.kind === "boss" && typeof ev.id === "number") recordBossKill(slain, ev.id);
}

describe("第十一回合的門檻計數（GH#1151 A）", () => {
  it("⛔ **特殊殭屍不算** —— 十隻特殊怪湊不出一隻王", () => {
    const s = new Set<number>();
    for (let i = 0; i < 10; i++) feed(s, { kind: "special", id: 100 + i });
    expect(s.size).toBe(0);
    expect(shouldEnterRound11({ enabled: true, triggerBossKills: 3 }, ROUND11_PRECEDING_ROUND, s.size)).toBe(false);
  });

  it("⭐ 王算，⭐ 而且同一隻王重覆回報只算一次", () => {
    const s = new Set<number>();
    feed(s, { kind: "boss", id: 7 });
    feed(s, { kind: "boss", id: 7 }); // ⛔ 重連／重播／同 tick 多來源
    expect(s.size).toBe(1);
    feed(s, { kind: "boss", id: 8 });
    feed(s, { kind: "special", id: 9 });
    expect(s.size).toBe(2);
  });

  it("⭐ 混著來：3 隻王 ＋ 一堆特殊怪 ＋ 重覆 ⇒ 剛好達門檻", () => {
    const s = new Set<number>();
    const evs = [
      { kind: "boss", id: 1 }, { kind: "special", id: 50 }, { kind: "boss", id: 1 },
      { kind: "special", id: 51 }, { kind: "boss", id: 2 }, { kind: "boss", id: 3 },
      { kind: "special", id: 52 }, { kind: "boss", id: 2 },
    ];
    for (const e of evs) feed(s, e);
    expect(s.size).toBe(3);
    const gate = { enabled: true, triggerBossKills: 3 };
    expect(shouldEnterRound11(gate, ROUND11_PRECEDING_ROUND, s.size)).toBe(true);
    // ⭐ 而**沒有去重**的話會是 5 —— 那會讓門檻提早成立。
    expect(evs.filter((e) => e.kind === "boss").length).toBe(5);
  });

  it("⭐ 出貨的處理器真的有那一行（⛔ 不是只有這支測試自己會分）", () => {
    // ⚠️ 掃字串在這裡是**刻意**的：上面三條驗的是判準本身，
    //   這一條只回答「出貨那一行有沒有把 kind 分開」——
    //   ⛔ 而它會在有人把 `kind === "boss"` 拿掉時紅。
    const src = readFileSync(new URL("./MatchController.ts", import.meta.url), "utf8");
    expect(src).toContain('data.kind === "boss"');
    expect(src).toContain("recordBossKill(this.round11BossKills");
  });
});

import { readFileSync } from "node:fs";
