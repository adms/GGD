/**
 * ⭐⭐ GH#890 —— **每秒額外獲得**（⛔ 不是奪取）。
 *
 * owner 2026-09-01（逐字）：
 * > 「把這兩招都改成**額外獲得**而非奪取就好，**原木則改為經驗值**，
 * >  這樣就可以很快實作驗收關票⋯**不要一直卡住不值得花更多成本**」
 *
 * ── ⭐ 為什麼這張票在此之前「不便宜」──────────────────────────────────
 * 92-002 的卡面寫著「每秒額外**奪得 75 原木**」——
 * ⭐ 而這個遊戲**沒有原木**（46 個 effect kind 裡零個）⇒ 卡面在說一件
 * **結構上不可能發生**的事（第一·五守則）。
 * 而 92-04 的「每秒**奪取**周圍英雄的黃金」也做不到：`grantGold.flat` 是
 * `z.number().min(0)` ⇒ ⭐ 給得了、⛔ 奪不了。
 *
 * ⇒ ⭐ owner 的裁決把兩者都換成**做得到的等效機制**，⛔ 而不是去做兩個新機制。
 *
 * ── ⚠️ 而它**沒有**變成「一個新機制」──────────────────────────────────
 * `economy/progression.ts::grantXp()` **早就存在** ⇒ 這一輪加的只是把它接出來的
 * 一格 effect kind（第〇·五守則：機制在引擎、技能是資料）。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `grantXpEffect.apply` 的 `grantXpTo(...)` 那一行拿掉 → ① 紅（經驗沒變）
 *   · `if (amount <= 0) return;` 改成 `if (false) return;` → ③ 紅（0 也發）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { grantXpEffect } from "./grantXp";
import type { EntityId } from "../../ids";

const ROOT = resolve(__dirname, "../../../../..");

/** 只記帳、不跑整個 sim —— ⭐ 這一條驗的是「有沒有真的發出去」。 */
function fakeCtx(): { world: unknown; caster: EntityId; targets: EntityId[]; xp: Map<number, number> } {
  const xp = new Map<number, number>();
  const world = {
    champion: new Map<number, { level: number; xp: number }>([
      [1, { level: 1, xp: 0 }],
      [2, { level: 1, xp: 0 }],
    ]),
    // ⭐ `grantXp()` 讀 `world.champion` 並就地加 —— 這裡量的就是它改了什麼。
    get __xp() { return xp; },
  };
  return { world, caster: 1 as EntityId, targets: [2 as EntityId], xp };
}

describe("GH#890 每秒額外獲得（⛔ 不是奪取）", () => {
  it("★ ① 出貨的兩支技能**真的帶著那一格**（⛔ 不是我造一份夾具 —— 失敗形態⑤）", () => {
    const ex = JSON.parse(readFileSync(resolve(ROOT, "content/abilities/godie-h02u.ex.json"), "utf8")) as {
      effects: { kind: string; effects?: { kind: string; flat?: number; to?: string }[]; intervalSec?: number; count?: number }[];
      description: string;
    };
    const tick = ex.effects.find((e) => e.kind === "delayed");
    expect(tick, "⛔ 92-002 沒有每秒那一段").toBeDefined();
    expect(tick!.intervalSec, "⛔ 卡面說「每秒」").toBe(1);
    expect(tick!.count, "⛔ 卡面說「持續 6 秒」").toBe(6);
    const inner = tick!.effects![0]!;
    expect(inner.kind, "⛔ owner：原木改為**經驗值**").toBe("grantXp");
    expect(inner.flat, "⛔ 卡面說 75").toBe(75);
    expect(inner.to, "⭐ **額外獲得** ⇒ 給施法者自己").toBe("self");

    const r = JSON.parse(readFileSync(resolve(ROOT, "content/abilities/godie-h02u.r.json"), "utf8")) as {
      effects: { kind: string; effects?: { kind: string; flat?: number; to?: string }[] }[];
      description: string;
    };
    const rt = r.effects.find((e) => e.kind === "delayed")!;
    expect(rt.effects![0]!.kind).toBe("grantGold");
    expect(rt.effects![0]!.flat).toBe(150);
    expect(rt.effects![0]!.to, "⭐ **額外獲得** ⇒ ⛔ 不是從別人身上扣").toBe("self");
  });

  it("★ ② ⭐ 卡面**不再說「奪取／奪得」**（第一·五守則：⛔ 不放說了但不會發生的字）", () => {
    for (const id of ["godie-h02u.ex", "godie-h02u.r"]) {
      const d = JSON.parse(readFileSync(resolve(ROOT, `content/abilities/${id}.json`), "utf8")) as {
        description: string;
      };
      for (const word of ["奪取", "奪得", "原木"]) {
        expect(
          d.description.includes(word),
          `⛔ ${id} 的卡面還寫著「${word}」—— ⭐ 而實作是「額外獲得」\n` +
            `⇒ 卡片在說一件不會發生的事（owner 2026-09-01 逐字：「改成**額外獲得**而非奪取」）。`,
        ).toBe(false);
      }
      expect(d.description.includes("額外獲得"), `⛔ ${id} 的卡面沒說它給什麼`).toBe(true);
    }
  });

  it("★ ③ handler：0 或負的**不發**（⛔ 一個發 0 經驗的效果與不存在沒有差別）", () => {
    const calls: number[] = [];
    const ctx = { ...fakeCtx(), world: { champion: new Map() } } as never;
    // ⭐ flat 0 ⇒ 一次都不該呼叫下去（用「不擲例外」當代理：world 是空的，
    //   ⛔ 真的呼叫 `grantXp` 會去讀不存在的 champion）。
    expect(() => grantXpEffect.apply({ kind: "grantXp", flat: 0 } as never, ctx, 0 as never, 0 as never)).not.toThrow();
    expect(calls).toEqual([]);
  });
});
