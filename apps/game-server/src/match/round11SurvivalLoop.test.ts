/**
 * ⭐⭐ 取捨迴圈 ①②③ 跑**真的 `MatchController`**（GH#920 / #1151 C）。
 *
 * > owner 2026-09-01（逐字）：「**普通殭屍放著會變成特殊殭屍**⋯
 * >  **特殊殭屍打死才能復活隊友一次**（出現復活圈）⛔ 而不是無限復活⋯
 * >  噴寶具是**你死就一定會噴 被誰殺死都會隨機噴一件**⋯**就是損壞了 不能撿回**」
 */
import { describe, it, expect } from "vitest";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";
import { recordBossKill } from "@ggd/shared/sim/round11Gate";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content";
import { TICK_HZ } from "@ggd/shared/constants";
import type { EntityId, ItemId } from "@ggd/shared/ids";

const FAST = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 20, resolutionTicks: 2 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

const PROMOTE_SEC = 3;
const rules = (over: Partial<ArenaRules["round11"]["survivalLoop"]> = {}): ArenaRules => ({
  ...DEFAULT_ARENA_RULES,
  mobWaves: { ...DEFAULT_MOB_WAVES_CONFIG, fromRound: 1 },
  // ⭐ 復活圈設定要在,⛔ 否則②沒有半徑可以讀(⭐ 而那是既有的那一格,不是新的)。
  reviveCircles: DEFAULT_ARENA_RULES.reviveCircles ?? {
    channelSec: 5,
    radius: 2.4,
    decayMult: 2,
    revivesPerTeamPerRound: 1,
    reviveHpPctMax: 0.5,
    reviveManaPctMax: 0.5,
    contestPauses: false,
    damageInterrupts: false,
    ccInterrupts: true,
  },
  finalRound: 3,
  round11: {
    ...DEFAULT_ARENA_RULES.round11,
    enabled: true,
    triggerBossKills: 2,
    arenaId: "arena.royale",
    durationSec: 60,
    maxAliveZombies: 100,
    spawnRampSec: 0,
    deadPlayersControlBoss: false,
    waveTable: { eventIntervalSec: 1, difficultyBase: 1, baseSpawnCount: 3, events: [{ kind: "normal", weight: 1 }] },
    bombardment: { ...DEFAULT_ARENA_RULES.round11.bombardment, enabled: false },
    survivalLoop: {
      normalToSpecialSec: PROMOTE_SEC,
      specialDropsReviveCircle: true,
      breakItemOnDeath: true,
      ...over,
    },
  },
});

const make = (id: string, over: Partial<ArenaRules["round11"]["survivalLoop"]> = {}) =>
  new MatchController(id, 7, allBots(), FAST, undefined, rules(over));

function toRound11(ctl: MatchController): void {
  recordBossKill(ctl.round11BossKillsForTest, 1);
  recordBossKill(ctl.round11BossKillsForTest, 2);
  let n = 0;
  while (!(ctl.phase.round === 4 && ctl.phase.phase === "combat") && n++ < 40000) ctl.tick();
  expect(ctl.phase.round, "有跑到第十一回合").toBe(4);
}

/** ⭐ 跑 N 秒，數升級事件。 */
function promotions(ctl: MatchController, secs: number): number {
  let n = 0;
  for (let i = 0; i < Math.round(secs * TICK_HZ); i++) {
    ctl.tick();
    for (const ev of ctl.world.events) if (ev.type === "mobPromote") n++;
  }
  return n;
}

describe("① 普通殭屍放著就變特殊（GH#920 ①）", () => {
  it("⭐⭐ 撐過門檻 ⇒ **真的升級了**", () => {
    const ctl = make("loop-promote");
    toRound11(ctl);
    expect(promotions(ctl, PROMOTE_SEC + 3), "⭐ 有怪升級").toBeGreaterThan(0);
  });

  it("⛔ 門檻設 0 ⇒ **一隻都不轉**（⭐ 而不是「全部一出生就轉」）", () => {
    // ⚠️⭐ 反過來的話,關掉開關會讓場上瞬間**全部**是特殊怪 —— 那是災難級的預設。
    const ctl = make("loop-off", { normalToSpecialSec: 0 });
    toRound11(ctl);
    expect(promotions(ctl, PROMOTE_SEC + 3), "⛔ 完全安靜").toBe(0);
  });

  it("⭐ 升級**不是**「殺掉再生一隻」—— ⛔ 沒有多出一次擊殺", () => {
    const ctl = make("loop-nokill");
    toRound11(ctl);
    let slain = 0;
    let promoted = 0;
    for (let i = 0; i < Math.round((PROMOTE_SEC + 3) * TICK_HZ); i++) {
      ctl.tick();
      for (const ev of ctl.world.events) {
        if (ev.type === "mobPromote") promoted++;
        // ⭐ 升級如果是「殺掉再生」,這裡會看到一批 killer 是 null 的擊殺。
        if (ev.type === "mobSlain" && ev.data.killer === null) slain++;
      }
    }
    expect(promoted, "有升級發生").toBeGreaterThan(0);
    expect(slain, "⛔ 而沒有任何無主的擊殺").toBe(0);
  });
});

describe("③ 死亡損壞一件寶具（GH#920 ③）", () => {
  /** ⭐ 給 0 號座位塞兩件寶具，然後把他打死，回傳剩下幾件。 */
  const deathWithItems = (id: string, breakOnDeath: boolean) => {
    const ctl = make(id, { breakItemOnDeath: breakOnDeath });
    toRound11(ctl);
    const seatId = [...ctl.seats.keys()][0]!;
    const entity = ctl.seats.get(seatId)!.entityId!;
    const champ = ctl.world.champion.get(entity)!;
    champ.items[0] = ("godie-item-a" as ItemId);
    champ.items[1] = ("godie-item-b" as ItemId);
    const before = champ.items.filter(Boolean).length;
    const hp = ctl.world.health.get(entity)!;
    hp.hp = 0; // ⭐ 走**真的** deathSystem（⛔ 不自己 emit）
    ctl.tick();
    return { before, after: champ.items.filter(Boolean).length, ctl, seatId };
  };

  it("⭐⭐ 死一次 ⇒ **少一件**（⛔ 被誰殺死都一樣：這裡沒有兇手）", () => {
    const r = deathWithItems("loop-break", true);
    // ⚠️ ⭐ bot 自己會買東西 ⇒ ⛔ 不可以假設背包是空的;⭐ 問的是**差幾件**。
    expect(r.before, "他身上有東西可以損壞").toBeGreaterThan(0);
    expect(r.after, "⭐ 正好少一件").toBe(r.before - 1);
  });

  it("⛔ 關掉 ⇒ **一件都不少**（⭐ 一鍵 rollback）", () => {
    const r = deathWithItems("loop-nobreak", false);
    expect(r.after).toBe(r.before);
  });

  it("⭐ 而且它**發得出是哪一件** —— ⛔ 不是安靜地消失", () => {
    const ctl = make("loop-broken-ev");
    toRound11(ctl);
    const seatId = [...ctl.seats.keys()][0]!;
    const entity = ctl.seats.get(seatId)!.entityId!;
    ctl.world.champion.get(entity)!.items[0] = ("godie-item-a" as ItemId);
    const held = ctl.world.champion.get(entity)!.items.filter(Boolean).map(String);
    ctl.world.health.get(entity)!.hp = 0;
    ctl.tick();
    const ev = ctl.world.events.find((e) => e.type === "round11ItemBroken");
    expect(ev, "⭐ 有喊").toBeDefined();
    // ⭐ 指名的那一件**必須是他真的帶著的**（⛔ 而不是憑空一個字串）,
    //   ⭐ 而且那一格現在是空的。
    expect(held, "⭐ 損壞的是他身上的東西").toContain(ev!.data.itemId as string);
    expect(ctl.world.champion.get(entity)!.items[ev!.data.slot as number]).toBeFalsy();
  });
});

describe("② 特殊殭屍打死 ⇒ 一次復活權（GH#920 ②）", () => {
  /**
   * ⭐ 用**出貨的**傷害佇列把一隻特殊怪打死，回傳那一隊的復活權前後值。
   *
   * ⚠️⚠️ ⭐ 量的是**復活權**，⛔ 不是「場上有沒有圈」——
   * 復活圈的 `ownerId` 是**要被復活的那具屍體**，⇒ ⭐ 沒有人死的時候本來就不該有圈
   * （`ReviveSystem` 會在下一 tick 就把一個 owner 還活著的圈熄掉）。
   */
  const killOneSpecial = (id: string, dropsCircle: boolean) => {
    const ctl = make(id, { specialDropsReviveCircle: dropsCircle });
    toRound11(ctl);
    let n = 0;
    let special: EntityId | null = null;
    while (special === null && n++ < Math.round(20 * TICK_HZ)) {
      ctl.tick();
      for (const [mid, m] of ctl.world.mob) if (m.kind === "special") { special = mid; break; }
    }
    expect(special, "⭐ 場上真的出現了特殊怪").not.toBeNull();
    const killer = ctl.seats.get([...ctl.seats.keys()][0]!)!.entityId!;
    const team = ctl.world.team.get(killer)!.teamId;
    const before = ctl.world.reviveCharges.get(team) ?? 0;
    ctl.world.damageQueue.push({
      source: killer,
      target: special!,
      amount: ctl.world.health.get(special!)!.maxHp * 100,
      type: "true",
      crit: false,
      origin: "basic",
    });
    ctl.tick();
    return { before, after: ctl.world.reviveCharges.get(team) ?? 0 };
  };

  it("⭐⭐ 打死一隻特殊怪 ⇒ 那一隊**多一格復活權**", () => {
    const r = killOneSpecial("loop-revive", true);
    expect(r.after, "⭐ 復活權真的加上去了").toBe(r.before + 1);
  });

  it("⛔ 關掉 ⇒ **一格都不加**（⭐ 一鍵 rollback）", () => {
    const r = killOneSpecial("loop-norevive", false);
    expect(r.after).toBe(r.before);
  });
});
