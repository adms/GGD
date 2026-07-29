/**
 * matchLedger —— 三個消費端(#207 / #211 / #212)共用的分析帳本的守衛。
 *
 * 這裡守的是四件事,每一件都對應一種「做了但玩家拿不到」:
 *
 *  ① **statStacks 只有一個來源**(形態②:算出來了但兩邊的數字不同)。
 *     `statPathSnapshotOf` 必須是 `ChampionComp.statStacks` 的搬運工。帳本自己
 *     數的話,商店顯示 3/20、覆盤報表顯示 11/20,兩邊都言之鑿鑿而且沒有任何
 *     測試會發現。突變驗證:把 snapshot 改成讀帳本自己的計數器 → 紅。
 *
 *  ② **團隊積分和結算畫面同源**(形態④:斷言方向跟缺陷無關)。斷言「有一個
 *     total 欄位」對「加對了」和「加錯了」都會過;這裡直接和 `rankScore` 的
 *     逐項和比對,而且用整場的排名輸入去比。
 *
 *  ③ **沒選的那兩張真的被記下來**。`declined` 是強度分析的對照組,漏了它
 *     取捨率就只剩一個沒有分母的數字。
 *
 *  ④ **差分涵蓋 `PlayerMatchStats` 的每一個欄位**(形態③:刪掉還全綠)。
 *     手寫的減法漏一個欄位不會有任何測試發現 —— 所以這裡用 key 全集迭代,
 *     `PlayerMatchStats` 新增欄位的那一刻自動涵蓋。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { asEntityId, asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import { STAT_TICK_TARGET } from "../economy/itemTiers";
import { statPathView } from "../economy/statPath";
import { createMatchStats, type PlayerMatchStats } from "./matchStats";
import { rankScore, type RankEntry } from "./rating";
import {
  LEVEL_FIELDS,
  MatchLedger,
  aggregateAbilityUse,
  aggregateChampionRates,
  aggregateOfferChoices,
  createRoundPlayerRecord,
  diffMatchStats,
  gradeRoundRecord,
  lineupKey,
  matchupKey,
  pickDecisionTicks,
  statPathSnapshotOf,
  teamScores,
  type SeatRankEntry,
} from "./matchLedger";

beforeAll(() => {
  registerSkeletonContent();
});

function makeWorld(): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 7);
  const c = SKELETON_ARENA.zones[0]!.center;
  const id = spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x, z: c.z },
    zone: 0,
  });
  return { world, id };
}

function stats(over: Partial<PlayerMatchStats> = {}): PlayerMatchStats {
  return { ...createMatchStats(), ...over };
}

// ───────────────────────────────────────────────────────────────────────────

describe("① statStacks 只有一個來源(#211 的 N/20)", () => {
  it("snapshot 讀的就是 ChampionComp.statStacks —— 不是帳本自己數的", () => {
    cover("ledger-statstacks-single-source");
    const { world, id } = makeWorld();
    const champ = world.champion.get(id)!;

    champ.statStacks = 13;
    expect(statPathSnapshotOf(world, id).stacks).toBe(13);

    // 「歸零」(買道具)之後 snapshot 必須跟著掉回 0。帳本自己數的話它會停在
    // 13,而商店會顯示 0 —— 這正是要防的分岔。
    champ.statStacks = 0;
    expect(statPathSnapshotOf(world, id).stacks).toBe(0);

    // 而且不管帳本被操作多少次,它都不會自己長出一個數字來
    const ledger = new MatchLedger("m1");
    for (let i = 0; i < 50; i++) {
      ledger.recordItemTxn({ seatId: 0, round: 1, tick: i, kind: "buy", itemId: "x", goldDelta: -375 });
      ledger.recordOffer({ seatId: 0, round: 1, tick: i, kind: "attr", offered: ["a", "b", "c"], picked: "a", auto: false });
      ledger.beginCast({ seatId: 0, round: 1, tick: i, abilityId: "q", slot: "Q" });
    }
    expect(statPathSnapshotOf(world, id).stacks).toBe(0);
    champ.statStacks = 7;
    expect(statPathSnapshotOf(world, id).stacks).toBe(7);
  });

  it("走的是商店面板呼叫的同一支 statPathView(分母也同源)", () => {
    const { world, id } = makeWorld();
    const champ = world.champion.get(id)!;
    champ.statStacks = 5;
    champ.statCapstonePct = 0;
    // 逐格等於商店那一支的輸出 —— 分母、remaining、atRisk 都不可以另有一套
    expect(statPathSnapshotOf(world, id)).toEqual(statPathView(5, 0));
    expect(statPathSnapshotOf(world, id).target).toBe(STAT_TICK_TARGET);

    // 拿到 capstone 之後 live/remaining/atRisk 的語意也必須跟著商店走
    champ.statCapstonePct = 80;
    expect(statPathSnapshotOf(world, id)).toEqual(statPathView(5, 80));
    expect(statPathSnapshotOf(world, id).live).toBe(false);
  });

  it("沒有 champion 的 entity 給一份 0 的 view,不是丟例外", () => {
    const { world } = makeWorld();
    const ghost = asEntityId(99999);
    expect(statPathSnapshotOf(world, ghost)).toEqual(statPathView(0, 0));
  });

  it("回合紀錄的分母預設就是 STAT_TICK_TARGET", () => {
    expect(createRoundPlayerRecord().statTarget).toBe(STAT_TICK_TARGET);
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe("② 團隊累積積分和結算畫面同一個數(#212)", () => {
  const entries: SeatRankEntry[] = [
    { seatId: 0, teamId: 0, role: "fighter", roundsSurvived: 3, stats: stats({ kills: 8, assists: 3, deaths: 2, damageDealt: 9000, killParticipation: 6, timeAliveTicks: 3000 }) },
    { seatId: 1, teamId: 0, role: "support", roundsSurvived: 2, stats: stats({ assists: 9, deaths: 3, healingDone: 5000, killParticipation: 7, timeAliveTicks: 2600 }) },
    { seatId: 2, teamId: 1, role: "tank", roundsSurvived: 1, stats: stats({ kills: 2, assists: 4, deaths: 5, damageTaken: 12000, damageBlocked: 6000, killParticipation: 5, timeAliveTicks: 2200 }) },
    { seatId: 3, teamId: 1, role: "marksman", roundsSurvived: 0, stats: stats({ kills: 1, deaths: 7, damageDealt: 2000, timeAliveTicks: 900 }) },
  ];

  it("每個成員的分數就是 rankScore,總分就是它們的和", () => {
    cover("ledger-team-score-identity");
    const lobby = entries.map((e) => e.stats);
    const teams = teamScores(entries);
    expect(teams.map((t) => t.teamId)).toEqual([0, 1]);
    for (const t of teams) {
      const mine = entries.filter((e) => e.teamId === t.teamId).sort((a, b) => a.seatId - b.seatId);
      // 逐個成員都等於結算畫面印出來的那個數
      expect(t.memberScores).toEqual(mine.map((e) => rankScore(e as RankEntry, lobby)));
      expect(t.seatIds).toEqual(mine.map((e) => e.seatId));
      // 而總分就是它們的和,沒有第二套加權
      let sum = 0;
      for (const s of t.memberScores) sum += s;
      expect(t.total).toBe(sum);
    }
  });

  it("存活回合數(結算畫面的 +200/回合)有進到隊伍總分", () => {
    const base = teamScores(entries);
    const bumped = teamScores(
      entries.map((e) => (e.seatId === 0 ? { ...e, roundsSurvived: 6 } : e)),
    );
    expect(bumped[0]!.total).toBeGreaterThan(base[0]!.total);
    // 而且只動了那一隊
    expect(bumped[1]!.total).toBe(base[1]!.total);
  });

  it("輸出是決定性的:打亂輸入順序,結果一樣", () => {
    const shuffled = [entries[3]!, entries[1]!, entries[2]!, entries[0]!];
    expect(teamScores(shuffled)).toEqual(teamScores(entries));
  });

  it("帳本存的就是同一份", () => {
    const ledger = new MatchLedger("m");
    expect(ledger.setTeamScores(entries)).toEqual(teamScores(entries));
    expect(ledger.snapshot().teams).toEqual(teamScores(entries));
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe("③ 三選一:沒選的那兩張也要記", () => {
  it("declined 是 offered 扣掉 picked —— 對照組不是呼叫端自己算的", () => {
    cover("ledger-offer-declined");
    const l = new MatchLedger("m");
    l.recordOffer({ seatId: 0, round: 2, tick: 100, kind: "augment", offered: ["a", "b", "c"], picked: "b", auto: false });
    const [o] = l.snapshot().offers;
    expect(o!.offered).toEqual(["a", "b", "c"]);
    expect(o!.declined).toEqual(["a", "c"]);
  });

  it("沒選(過期而且沒代選)→ 三張全部是 declined", () => {
    const l = new MatchLedger("m");
    l.recordOffer({ seatId: 0, round: 2, tick: 100, kind: "item", offered: ["a", "b", "c"], picked: null, auto: false });
    expect(l.snapshot().offers[0]!.declined).toEqual(["a", "b", "c"]);
  });

  it("同一張重複出現時只扣掉一份 —— 另一份仍然是被拒絕的", () => {
    const l = new MatchLedger("m");
    l.recordOffer({ seatId: 0, round: 2, tick: 1, kind: "attr", offered: ["a", "a", "b"], picked: "a", auto: false });
    expect(l.snapshot().offers[0]!.declined).toEqual(["a", "b"]);
  });

  it("取捨率:offered = picked + autoPicked + declined,系統代選不算偏好", () => {
    cover("ledger-offer-rates");
    const l = new MatchLedger("m");
    // 「a」被發三次:玩家選一次、系統代選一次、被拒一次
    l.recordOffer({ seatId: 0, round: 1, tick: 1, kind: "augment", offered: ["a", "b"], picked: "a", auto: false });
    l.recordOffer({ seatId: 0, round: 2, tick: 2, kind: "augment", offered: ["a", "b"], picked: "a", auto: true });
    l.recordOffer({ seatId: 0, round: 3, tick: 3, kind: "augment", offered: ["a", "b"], picked: "b", auto: false });
    const byId = new Map(aggregateOfferChoices(l.snapshot().offers).map((s) => [s.id, s]));
    const a = byId.get("a")!;
    expect(a.offered).toBe(3);
    expect(a.picked).toBe(1);
    expect(a.autoPicked).toBe(1);
    expect(a.declined).toBe(1);
    expect(a.picked + a.autoPicked + a.declined).toBe(a.offered);
    const b = byId.get("b")!;
    expect(b.offered).toBe(3);
    expect(b.picked).toBe(1);
    expect(b.declined).toBe(2);
  });

  it("買 / 賣 / 免費發放分得開,金額是實際套用的 delta", () => {
    const l = new MatchLedger("m");
    l.recordItemTxn({ seatId: 0, round: 1, tick: 1, kind: "buy", itemId: "sword", goldDelta: -750 });
    l.recordItemTxn({ seatId: 0, round: 2, tick: 2, kind: "sell", itemId: "sword", goldDelta: 300 });
    l.recordItemTxn({ seatId: 0, round: 3, tick: 3, kind: "grant", itemId: "quest", goldDelta: 0 });
    const t = l.snapshot().itemTxns;
    expect(t.map((x) => x.kind)).toEqual(["buy", "sell", "grant"]);
    expect(t.map((x) => x.goldDelta)).toEqual([-750, 300, 0]);
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe("④ 累積計分板的差分", () => {
  it("涵蓋 PlayerMatchStats 的每一個欄位(新增欄位漏了就紅)", () => {
    cover("ledger-diff-coverage");
    const before = createMatchStats();
    const after = createMatchStats();
    const keys = Object.keys(before) as (keyof PlayerMatchStats)[];
    expect(keys.length).toBeGreaterThan(15);
    // 每一格都 +1,差分必須每一格都回報變化(極值欄位除外)
    for (const k of keys) after[k] = before[k] + 1;
    const d = diffMatchStats(before, after);
    for (const k of keys) {
      expect(d[k], `${String(k)} 沒有被差分涵蓋`).toBe(1);
    }
  });

  it("largestSingleHit 是極值,回報水位不是相減(刻意的例外)", () => {
    expect(LEVEL_FIELDS).toContain("largestSingleHit");
    const before = stats({ largestSingleHit: 800, damageDealt: 1000 });
    const after = stats({ largestSingleHit: 1200, damageDealt: 3000 });
    const d = diffMatchStats(before, after);
    expect(d.largestSingleHit).toBe(1200); // 水位,不是 400
    expect(d.damageDealt).toBe(2000); // 其他欄位照樣相減
  });

  it("計數器倒退(重生換 entity)讀成 0,不是一個大負數", () => {
    const d = diffMatchStats(stats({ damageDealt: 5000, kills: 4 }), stats({ damageDealt: 0, kills: 0 }));
    expect(d.damageDealt).toBe(0);
    expect(d.kills).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe("選角與陣容", () => {
  it("鎖定時間是絕對 tick 的差;沒鎖定是 -1 而不是 0", () => {
    cover("ledger-pick-timing");
    expect(pickDecisionTicks({ seatId: 0, teamId: 0, zone: 0, championId: "a", source: "manual", selectOpenTick: 100, lockTick: 460 })).toBe(360);
    // -1 而不是 0:0 在平均值裡會被讀成「秒選」,那和「完全沒選」是相反的行為
    expect(pickDecisionTicks({ seatId: 0, teamId: 0, zone: 0, championId: "a", source: "auto", selectOpenTick: 100, lockTick: -1 })).toBe(-1);
  });

  it("陣容 key 和順序無關 —— 陣容是集合", () => {
    cover("ledger-lineup-pairing");
    const l = new MatchLedger("m");
    l.recordLineup(1, 0, { teamId: 3, championIds: ["c", "a", "b"], won: false }, { teamId: 1, championIds: ["z", "y"], won: true });
    const rec = l.snapshot().lineups[0]!;
    // sides 依 teamId 升冪,championIds 已排序
    expect(rec.sides.map((s) => s.teamId)).toEqual([1, 3]);
    expect(rec.sides[1]!.championIds).toEqual(["a", "b", "c"]);
    expect(lineupKey(rec.sides[1]!)).toBe("a|b|c");
    // 成對:同一組對局不管誰先記,key 都一樣
    const other = new MatchLedger("m");
    other.recordLineup(1, 0, { teamId: 1, championIds: ["y", "z"], won: true }, { teamId: 3, championIds: ["b", "c", "a"], won: false });
    expect(matchupKey(other.snapshot().lineups[0]!)).toBe(matchupKey(rec));
    // 而且勝負沒有被排序弄丟
    expect(rec.sides.find((s) => s.teamId === 1)!.won).toBe(true);
  });

  it("選取率:隨機和系統代選分開算,輪空回合不進分母", () => {
    cover("ledger-champion-rates");
    const picks = [
      { seatId: 0, teamId: 0, zone: 0, championId: "hero-a", source: "manual" as const, selectOpenTick: 0, lockTick: 30 },
      { seatId: 1, teamId: 0, zone: 0, championId: "hero-a", source: "random" as const, selectOpenTick: 0, lockTick: 20 },
      { seatId: 2, teamId: 1, zone: 0, championId: "hero-b", source: "auto" as const, selectOpenTick: 0, lockTick: -1 },
    ];
    const rounds = [
      createRoundPlayerRecord({ round: 1, seatId: 0, championId: "hero-a", alive: true }),
      createRoundPlayerRecord({ round: 2, seatId: 0, championId: "hero-a", alive: false }),
      // 輪空:沒有打過,不該進分母
      createRoundPlayerRecord({ round: 3, seatId: 0, championId: "hero-a", bye: true }),
    ];
    const byId = new Map(aggregateChampionRates(picks, rounds).map((s) => [s.championId, s]));
    const a = byId.get("hero-a")!;
    expect(a.picks).toBe(2);
    expect(a.randomPicks).toBe(1);
    expect(a.autoPicks).toBe(0);
    expect(a.roundsPlayed).toBe(2); // 3 筆,輪空那筆不算
    expect(a.roundsSurvived).toBe(1);
    expect(byId.get("hero-b")!.autoPicks).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe("技能效益", () => {
  it("後到的傷害掛得回原本那一次施放(英雄 vs 小怪分開記)", () => {
    cover("ledger-ability-credit");
    const l = new MatchLedger("m");
    const q = l.beginCast({ seatId: 0, round: 1, tick: 10, abilityId: "q1", slot: "Q" });
    const w = l.beginCast({ seatId: 0, round: 1, tick: 12, abilityId: "w1", slot: "W" });
    // 投射物飛了 20 tick 才打到人 —— credit 必須回到 q,不是最新的那一次
    l.creditCast(q, { heroHits: 2, damageToHeroes: 350, heroKills: 1 });
    l.creditCast(q, { mobHits: 3, damageToMobs: 120 });
    l.creditCast(w, { healingDone: 200, ccTicksApplied: 60 });
    const casts = l.snapshot().casts;
    expect(casts[0]!.abilityId).toBe("q1");
    expect(casts[0]!.heroHits).toBe(2);
    expect(casts[0]!.damageToHeroes).toBe(350);
    expect(casts[0]!.mobHits).toBe(3);
    expect(casts[0]!.damageToMobs).toBe(120);
    expect(casts[0]!.healingDone).toBe(0); // 治療是 w 的,不可以漏進 q
    expect(casts[1]!.healingDone).toBe(200);
    expect(casts[1]!.ccTicksApplied).toBe(60);
  });

  it("未知 handle 是 no-op,不會爆掉也不會亂加", () => {
    const l = new MatchLedger("m");
    l.beginCast({ seatId: 0, round: 1, tick: 1, abilityId: "q", slot: "Q" });
    l.creditCast(999, { damageToHeroes: 9999 });
    expect(l.snapshot().casts[0]!.damageToHeroes).toBe(0);
  });

  it("whiff 是「這一次施放什麼都沒打到」,不是 hits/casts", () => {
    cover("ledger-ability-aggregate");
    const l = new MatchLedger("m");
    const a = l.beginCast({ seatId: 0, round: 1, tick: 1, abilityId: "q", slot: "Q" });
    l.creditCast(a, { heroHits: 3, damageToHeroes: 300 }); // 一發打中三個人
    l.beginCast({ seatId: 0, round: 1, tick: 2, abilityId: "q", slot: "Q" }); // 完全落空
    const c = l.beginCast({ seatId: 0, round: 1, tick: 3, abilityId: "q", slot: "Q" });
    l.creditCast(c, { mobHits: 1, damageToMobs: 20 }); // 只打到小怪,也算命中
    const [u] = aggregateAbilityUse(l.snapshot().casts);
    expect(u!.casts).toBe(3);
    expect(u!.whiffs).toBe(1);
    expect(u!.heroHits).toBe(3);
    expect(u!.damageToHeroes).toBe(300);
    expect(u!.damageToMobs).toBe(20);
  });

  it("聚合的分組鍵含座位 AND 技能 —— 兩個人放同一支技能不會被併成一列", () => {
    cover("ledger-aggregate-grouping");
    // 分組鍵少了任一半都會讓兩列合併,而報表上只看得到「這支技能用得比較多」/
    // 「這個人放得比較多」。兩個方向各釘一次。
    const l = new MatchLedger("m");
    l.beginCast({ seatId: 0, round: 1, tick: 1, abilityId: "q", slot: "Q" });
    l.beginCast({ seatId: 1, round: 1, tick: 2, abilityId: "q", slot: "Q" }); // 同技能,不同人
    l.beginCast({ seatId: 0, round: 1, tick: 3, abilityId: "w", slot: "W" }); // 同人,不同技能
    const rows = aggregateAbilityUse(l.snapshot().casts);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.casts === 1)).toBe(true);

    // 三選一同理:同一個 id 在不同 kind 的池子裡是兩張不同的卡
    const o = new MatchLedger("m");
    o.recordOffer({ seatId: 0, round: 1, tick: 1, kind: "item", offered: ["x"], picked: null, auto: false });
    o.recordOffer({ seatId: 0, round: 1, tick: 2, kind: "augment", offered: ["x"], picked: null, auto: false });
    expect(aggregateOfferChoices(o.snapshot().offers)).toHaveLength(2);
  });

  it("聚合的輸出順序是決定性的 (seatId, abilityId 升冪)", () => {
    const l = new MatchLedger("m");
    l.beginCast({ seatId: 2, round: 1, tick: 1, abilityId: "w", slot: "W" });
    l.beginCast({ seatId: 0, round: 1, tick: 2, abilityId: "z", slot: "R" });
    l.beginCast({ seatId: 0, round: 1, tick: 3, abilityId: "a", slot: "Q" });
    expect(aggregateAbilityUse(l.snapshot().casts).map((u) => `${u.seatId}${u.abilityId}`)).toEqual([
      "0a",
      "0z",
      "2w",
    ]);
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe("回合紀錄與評價的接縫", () => {
  it("回合紀錄可以直接餵給 S~D 評價 —— 消費端不用自己拼", () => {
    cover("ledger-round-grade");
    const strong = createRoundPlayerRecord({
      round: 1,
      seatId: 0,
      kills: 10,
      assists: 4,
      deaths: 1,
      damageDealt: 4000,
      damageTaken: 3000,
      damageBlocked: 1500,
      healingDone: 1500,
      ccAppliedTicks: 300,
      abilityHits: 15,
      mobKills: 15,
      survivedTicks: 1800,
      alive: true,
    });
    const weak = createRoundPlayerRecord({ round: 1, seatId: 1, deaths: 5, survivedTicks: 100 });
    const ctx = { roundTicks: 1800 };
    expect(gradeRoundRecord(strong, ctx)!.grade).toBe("S");
    expect(gradeRoundRecord(weak, ctx)!.grade).toBe("D");
  });

  it("輪空回合回 null —— 給它一個 D 是對沒有發生過的比賽說謊", () => {
    const bye = createRoundPlayerRecord({ round: 3, seatId: 0, bye: true });
    expect(gradeRoundRecord(bye, { roundTicks: 1800 })).toBeNull();
  });

  it("查詢照 seatId / round 升冪,不看插入順序", () => {
    const l = new MatchLedger("m");
    l.recordRound(createRoundPlayerRecord({ round: 2, seatId: 1 }));
    l.recordRound(createRoundPlayerRecord({ round: 1, seatId: 1 }));
    l.recordRound(createRoundPlayerRecord({ round: 1, seatId: 0 }));
    expect(l.roundRecords(1).map((r) => r.seatId)).toEqual([0, 1]);
    expect(l.seatRounds(1).map((r) => r.round)).toEqual([1, 2]);
  });

  it("snapshot 是拷貝:改回傳值改不到帳本", () => {
    const l = new MatchLedger("m");
    l.recordPick({ seatId: 0, teamId: 0, zone: 0, championId: "hero-a", source: "manual", selectOpenTick: 0, lockTick: 10 });
    const snap = l.snapshot();
    snap.picks[0]!.championId = "TAMPERED";
    expect(l.snapshot().picks[0]!.championId).toBe("hero-a");
    expect(l.pickOf(0)!.championId).toBe("hero-a");
    expect(l.pickOf(42)).toBeNull();
  });
});
