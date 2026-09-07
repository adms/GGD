/**
 * 傷害排行榜 (#636) 的守衛 —— 寫入與修剪。
 *
 * 夾具走**出貨的** `MatchLedger`(beginCast/creditCast/recordItemTxn),
 * 不手拼 snapshot(失敗形態⑤)。Redis 用注入的 fake,它模擬 zset 的
 * rank 語意 —— 修剪正確性(cap 之外的尾端真的消失)是這一批的承重線。
 * 突變:拿掉 writeDamageBoard 的 ZREMRANGEBYRANK 那一行 → 「trims」紅。
 */
import { describe, expect, it } from "vitest";
import { MatchLedger } from "@ggd/shared/sim/stats/matchLedger";
import {
  DAMAGE_BOARD_CALIBER,
  DAMAGE_BOARD_KEY,
  buildDamageBoardEntries,
  isDamageBoardEntry,
  publishMatchDamageBoard,
  readDamageBoard,
  serveDamageBoard,
  writeDamageBoard,
} from "./damageBoard";
import type { RedisCommandClient } from "./redisCommands";
import type { RespValue } from "../config/redisSubscriber";

/** zset 語意的最小模擬:ZADD / ZREMRANGEBYRANK / ZCARD / ZREVRANGE。 */
class FakeRedis implements RedisCommandClient {
  readonly commands: string[][] = [];
  readonly zset = new Map<string, number>();
  closed = false;
  failWith: Error | null = null;

  private ranked(): [string, number][] {
    return [...this.zset.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
  }

  async send(...args: string[]): Promise<RespValue> {
    if (this.failWith) throw this.failWith;
    this.commands.push(args);
    const [cmd, , ...rest] = args;
    if (cmd === "ZADD") {
      for (let i = 0; i + 1 < rest.length; i += 2) this.zset.set(rest[i + 1] ?? "", Number(rest[i]));
      return this.zset.size;
    }
    if (cmd === "ZREMRANGEBYRANK") {
      const members = this.ranked();
      const n = members.length;
      const at = (v: number): number => (v < 0 ? n + v : v);
      const start = Math.max(0, at(Number(rest[0])));
      const stop = Math.min(n - 1, at(Number(rest[1])));
      let removed = 0;
      for (let i = start; i <= stop; i += 1) {
        const m = members[i];
        if (!m) continue;
        this.zset.delete(m[0]);
        removed += 1;
      }
      return removed;
    }
    if (cmd === "ZCARD") return this.zset.size;
    if (cmd === "ZREVRANGE") {
      const members = this.ranked().reverse().map((m) => m[0]);
      return members.slice(Number(rest[0]), Number(rest[1]) + 1);
    }
    return null;
  }

  close(): void {
    this.closed = true;
  }
}

/** 三次施放(900 / 500 / 200)、兩筆道具、一個座位的出貨帳本。 */
function ledgerSnapshot() {
  const ledger = new MatchLedger("m-guard");
  ledger.recordPick({ seatId: 0, teamId: 0, zone: 0, championId: "godie-h01", source: "manual", selectOpenTick: 0, lockTick: 5 });
  ledger.recordItemTxn({ seatId: 0, round: 1, tick: 10, kind: "buy", itemId: "sword", goldDelta: -100 });
  ledger.recordItemTxn({ seatId: 0, round: 1, tick: 10, kind: "buy", itemId: "armor", goldDelta: -80 });
  ledger.recordItemTxn({ seatId: 0, round: 1, tick: 40, kind: "sell", itemId: "armor", goldDelta: 40 });
  const big = ledger.beginCast({ seatId: 0, round: 2, tick: 50, abilityId: "01-04", slot: "R" });
  ledger.creditCast(big, { heroHits: 1, damageToHeroes: 900 });
  const mid = ledger.beginCast({ seatId: 0, round: 1, tick: 20, abilityId: "01-01", slot: "Q" });
  ledger.creditCast(mid, { heroHits: 1, damageToHeroes: 300, damageToMobs: 200 });
  const low = ledger.beginCast({ seatId: 0, round: 1, tick: 30, abilityId: "01-02", slot: "W" });
  ledger.creditCast(low, { mobHits: 1, damageToMobs: 200 });
  // GH#1015 —— 普攻走 uncast(⛔ 不是 cast 列);它比榜上最痛的那一發還大,而榜上仍然看不到它。
  ledger.creditUncast(0, 2, "basic", { heroHits: 9, damageToHeroes: 5_000 });
  return ledger.snapshot();
}

describe("damage board (#636)", () => {
  it("builds owner's payload off the shipped ledger — top order, champion, items at cast tick", () => {
    const entries = buildDamageBoardEntries(ledgerSnapshot(), { top: 2, ts: 1_756_000_000_000, version: "v0.23.0" });
    expect(entries.map((e) => e.damage)).toEqual([900, 500]); // top 2 of 3, desc
    const [r, q] = entries;
    if (!r || !q) throw new Error("expected two entries");
    expect(r).toMatchObject({ round: 2, championId: "godie-h01", abilityId: "01-04", ts: 1_756_000_000_000, version: "v0.23.0", matchId: "m-guard" });
    expect(r.items).toEqual(["sword"]); // armor 在 tick 40 賣掉,R 在 tick 50
    expect(q.items).toEqual(["armor", "sword"]); // Q 在 tick 20,兩件都還在
    expect(entries.every(isDamageBoardEntry)).toBe(true);
  });

  it("writes then TRIMS the tail so the zset never exceeds the cap", async () => {
    const redis = new FakeRedis();
    redis.zset.set('{"old":"tiny"}', 5); // 榜上原有的一筆小傷害
    const entries = buildDamageBoardEntries(ledgerSnapshot(), { top: 3, ts: 1, version: "v" });
    await writeDamageBoard(redis, entries, 3);
    // cap 3:留 900 / 500 / 200,舊的 5 被修剪掉
    expect([...redis.zset.values()].sort((a, b) => b - a)).toEqual([900, 500, 200]);
    expect(redis.commands.some((c) => c[0] === "ZREMRANGEBYRANK" && c[1] === DAMAGE_BOARD_KEY && c[2] === "0" && c[3] === "-4")).toBe(true);
    // 讀回來:依 damage 降冪,垃圾 member 跳過
    redis.zset.set("not-json{", 9_999);
    const { rows } = await readDamageBoard(redis, { count: 10 });
    expect(rows.map((e) => e.damage)).toEqual([900, 500, 200]);
  });

  it("publish is fail-open: a dead Redis drops the rows, never throws, and closes the client", async () => {
    const redis = new FakeRedis();
    redis.failWith = new Error("boom");
    const ok = await publishMatchDamageBoard(ledgerSnapshot(), { env: { GGD_DAMAGE_BOARD: "1" }, clientFactory: () => redis, now: () => 1, version: "v" });
    expect(ok).toBe(false);
    expect(redis.closed).toBe(true);
    // 開關:GGD_DAMAGE_BOARD=0 → 連 factory 都不碰
    const untouched = await publishMatchDamageBoard(ledgerSnapshot(), {
      env: { GGD_DAMAGE_BOARD: "0" },
      clientFactory: () => {
        throw new Error("must not be called");
      },
    });
    expect(untouched).toBe(false);
  });
});
