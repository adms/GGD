/**
 * #207 對戰事件記錄 —— 守衛。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 每一條斷言都讀**磁碟上的檔案**,一條都沒有讀 `ctl.ledger`
 * ─────────────────────────────────────────────────────────────────────────────
 * 這不是潔癖,是這一題唯一會發生的缺陷長什麼樣子的問題。#207 的失敗形態是第②
 * 種:**算出來了但從沒送達**。`MatchController` 一場打完之後帳本裡什麼都有 ——
 * 選角、每一次施放、三選一的三張、每回合名次 —— 而如果沒有人把它寫出去,那些
 * 東西在房間 dispose 的那一毫秒全部消失,**而每一條讀 `ctl.ledger` 的斷言仍然
 * 全綠**。
 *
 * 所以這一份跑一場真的比賽(12 隻 bot、殭屍波、三選一),接上真的
 * `MatchStatsRecorder` 寫進 `/private/tmp`,然後**重新從檔案讀回來**,對還原出
 * 來的東西做斷言。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 突變驗證(2026-07-30 實際跑過,不是宣稱)
 * ─────────────────────────────────────────────────────────────────────────────
 *  · 拿掉 `MatchController.recordLedgerRound()` 最後那行
 *    `this.statsSink?.onRoundSettled(...)` → 這一份 8 條全紅(檔案只剩 header
 *    + final,`folded.rounds.length === 0`)。
 *  · 把 `applyPick` 的 `auto` 參數硬寫成 `true` → 「有人自己選了一張」紅。
 *  · 把 `recordLedgerRound` 的名次排序改成 `a.r.seatId - b.r.seatId`(照座位
 *    排而不是照分數)→ 「名次是照回合分數排的」紅。
 *  · 把 `ledgerObserve` 的 `abilityCast` 分支整個拿掉 → 「每支技能施放次數」
 *    與「和計分板對得起來」兩條紅。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_MOB_WAVES_CONFIG, type MobWavesConfig } from "@ggd/shared/content";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { asSeatId, type AugmentId, type EntityId, type SeatId } from "@ggd/shared/ids";
import type { SimWorld } from "@ggd/shared/sim/SimWorld";
import { Augments } from "@ggd/shared/sim/content/registry";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { ModOp } from "@ggd/shared/sim/stats/modifiers";
import type { AugmentTier } from "@ggd/shared/sim/content/defs";
import {
  aggregateAbilityUse,
  aggregateChampionRates,
  aggregateOfferChoices,
  uncastFamilyOf,
} from "@ggd/shared/sim/stats/matchLedger";
import { MatchController, type SeatSpec } from "../match/MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "../match/arenaRules";
import { HumanDriver } from "../seat/HumanDriver";
import { MatchStatsRecorder } from "./Recorder";
import { MATCH_STATS_KNOBS, loadMatchStats, matchStatsRetention } from "./store";
import type { FoldedMatchStats } from "./format";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 900, resolutionTicks: 5 };

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/** 從第 1 回合就開始湧的殭屍波,間隔壓到 0.2s —— 十回合裡一定有小怪被打死。 */
const MOB_WAVES: MobWavesConfig = {
  ...DEFAULT_MOB_WAVES_CONFIG,
  fromRound: 1,
  firstWaveSec: 0.2,
  waveIntervalSec: 0.2,
};

/**
 * 骨架內容每個 tier 只登記 **1 張** augment,所以 `offerCount: 3` 的三選一在
 * 骨架上永遠只發得出一張 —— 「沒選的那兩張」根本不存在,測不到。這裡替每個
 * 排程用到的 tier 補到 4 張,讓三選一是真的三選一。
 *
 * 這些卡片故意只帶一個無害的 flat modifier:被測的是**記錄**,不是平衡。
 */
function seedAugmentPool(): void {
  const tiers: AugmentTier[] = ["silver", "gold", "prismatic"];
  for (const tier of tiers) {
    for (let i = 0; i < 4; i++) {
      const id = `test-${tier}-${i}` as AugmentId;
      Augments.register(id, {
        id,
        name: `T ${tier} ${i}`,
        description: "test-only augment (analytics.test.ts)",
        tier,
        weight: 100,
        modifiers: [{ stat: Stat.AttackDamage, op: ModOp.Flat, value: 1 }],
        tags: ["test"],
      });
    }
  }
}

function rules(): ArenaRules {
  // `DEFAULT_ARENA_RULES` 的 rounds 就是 AUGMENT_TIER_SCHEDULE —— 三選一會在
  // 排程的回合真的發出來,所以這一場同時涵蓋「小怪波」和「三選一」。
  return { ...DEFAULT_ARENA_RULES, mobWaves: MOB_WAVES, rogueliteMobs: true };
}

let dir = "";
let prevDir: string | undefined;
let folded: FoldedMatchStats;
let fileBytes = 0;
let ctlRef: MatchController;
const MATCH_ID = "stats-e2e";

/**
 * 跑一整場,接上真的 recorder,然後**把檔案讀回來**。
 *
 * 座位 0 是 human driver:它在中場自己按下三選一(auto=false 的那一條路),而
 * 其餘 11 個 bot 走 #207 的自動代選(auto=true)。座位 0–5 在 champ-select 手動
 * 鎖英雄,6–11 完全不選 —— 所以 PickSource 的 manual / auto 兩種都會出現。
 */
async function playAndRead(): Promise<void> {
  const ctl = new MatchController(MATCH_ID, 4242, allBots(), FAST, 3, rules(), SKELETON_ARENA);
  // 建構子跑過 registerSkeletonContent() 之後才補 —— 否則骨架會蓋掉。
  seedAugmentPool();
  ctlRef = ctl;
  const rec = await MatchStatsRecorder.open(MATCH_ID, {
    matchId: MATCH_ID,
    startedAt: "2026-07-30T00:00:00.000Z",
    seed: 4242,
    contentVersion: "cv_test",
    buildStamp: "test",
    arenaId: SKELETON_ARENA.id,
    seats: [...ctl.seats.values()].map((s) => ({
      seatId: s.seatId,
      teamId: s.teamId,
      accountId: s.accountId,
      displayName: `P${s.seatId}`,
      isBot: s.seatId !== 0,
    })),
  });
  expect(rec, "the recorder must open — everything below reads the file it writes").not.toBeNull();
  ctl.statsSink = rec;

  // 座位 0 交給 human driver,這樣它的三選一是「玩家自己按的」。
  const human = new HumanDriver();
  ctl.seats.get(asSeatId(0))!.setDriver(human);
  ctl.seats.get(asSeatId(0))!.applyPendingDriver();

  // champ-select:一半手動鎖、一半放給系統代選。
  const pool = ctl.randomChampionPool();
  for (let i = 0; i < 6; i++) {
    const res = ctl.selectChampion(asSeatId(i), pool[i % pool.length]!);
    expect(res.ok, `seat ${i} should be able to lock ${pool[i % pool.length]}`).toBe(true);
  }

  let pickedByHand = 0;
  for (let n = 0; n < 400_000 && ctl.phase.phase !== "matchEnd"; n++) {
    // 座位 0 手動選它自己的那一張(choice index 1),在自動代選的安全網之前。
    if (ctl.phase.phase === "intermission") {
      for (const [offerId, offer] of ctl.offers) {
        if (offer.seatId !== 0) continue;
        // `seq` 是必填的 —— InputMailbox 用它做 wrap-aware 去重,重複/過期的
        // seq 會被丟掉。所以每一則都要遞增,不能全部送 0。
        human.mailbox.push({
          seq: ((pickedByHand + 1) % 65535) + 1,
          commands: [{ kind: "pickOffer", offerId: `${offerId}#1` }],
        });
        pickedByHand++;
      }
    }
    ctl.tick();
  }
  expect(ctl.phase.phase, "the match must actually finish").toBe("matchEnd");
  expect(pickedByHand, "seat 0 must have been offered at least one card to pick by hand").toBeGreaterThan(0);

  await rec!.finish(ctl);
  folded = await loadMatchStats(MATCH_ID);
  const { statSync } = await import("node:fs");
  fileBytes = statSync(join(dir, `${MATCH_ID}.jsonl`)).size;
}

let prevEnabled: string | undefined;

beforeAll(async () => {
  prevDir = process.env.GGD_MATCH_STATS_DIR;
  prevEnabled = process.env.GGD_MATCH_STATS;
  // `testSetup.ts` 把整批測試的預設關成 "0"(不要污染 data/match-stats),
  // 這一份是唯一要真的寫檔的,所以在這裡明確打開。
  process.env.GGD_MATCH_STATS = "1";
  // ⛔ 一律 /private/tmp,永遠不碰正式站,也不寫進 repo。
  dir = await mkdtemp(join(tmpdir(), "ggd-match-stats-"));
  process.env.GGD_MATCH_STATS_DIR = dir;
  await playAndRead();
}, 300_000);

afterAll(async () => {
  if (prevDir === undefined) delete process.env.GGD_MATCH_STATS_DIR;
  else process.env.GGD_MATCH_STATS_DIR = prevDir;
  if (prevEnabled === undefined) delete process.env.GGD_MATCH_STATS;
  else process.env.GGD_MATCH_STATS = prevEnabled;
  await rm(dir, { recursive: true, force: true });
});

describe("#207 對戰事件記錄 —— 從真的被寫出去的那份檔案讀回來", () => {
  it("這一場真的落地了:header + 每回合一行 + final 行", () => {
    expect(folded.header.matchId).toBe(MATCH_ID);
    expect(folded.complete, "打完的比賽必須有 final 行 —— 沒有 final = 這場沒打完").toBe(true);
    // 一場十回合,所以 round 行至少十行(finish 的尾巴可能再多一行)。
    expect(folded.rounds.length).toBeGreaterThanOrEqual(10);
    expect(folded.final!.rounds).toBeGreaterThanOrEqual(10);

    // ⚠️ 「每回合結束就寫出去」的**真守衛**在這裡,不在行數上。
    //
    // 我第一版只斷言行數,而拿掉 `statsSink?.onRoundSettled(...)` 之後這一份
    // 仍然有 8 條是綠的 —— 因為 `finish()` 會補寫尾巴,於是整場十個回合被塞進
    // **一行**,檔案照樣完整可讀。行數斷言抓得到,但那是運氣。真正被違反的性質
    // 是「一行 = 一個回合」,所以直接測它:每一個非空的 round 行,裡面的
    // `players` 必須全部屬於同一個回合,而且就是這一行標的那個回合。
    const seen: number[] = [];
    for (const line of folded.rounds) {
      if (line.players.length === 0) continue;
      const rounds = [...new Set(line.players.map((p) => p.round))];
      expect(rounds, `round line ${line.round} must carry exactly one round`).toEqual([line.round]);
      seen.push(line.round);
    }
    // 而且是照回合順序一行一行寫下來的(嚴格遞增)。
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBeGreaterThanOrEqual(10);
    // 量到的檔案大小,寫進回報用 —— 保存規則的上限是靠這個數字定的。
    console.log(
      `[#207] ${MATCH_ID}: ${fileBytes} bytes, ${folded.rounds.length} round lines, ` +
        `${folded.casts.length} casts, ${folded.offers.length} offers, ${folded.players.length} player-rounds`,
    );
  });

  it("還原得出:這一場玩的是誰(現況是 95 個回放檔只有 7 筆 championId,全部是小怪)", () => {
    expect(folded.picks).toHaveLength(12);
    const champs = new Set(folded.picks.map((p) => p.championId));
    expect(champs.size, "十二個座位不可能全部撞同一隻英雄").toBeGreaterThan(1);
    // 這一格就是現況的反面:記到的必須是**玩家的英雄**,不是殭屍的模型 id。
    expect([...champs]).not.toContain("godie-zombiex");
    // 手動鎖的六個是 manual 且帶得到鎖定 tick;沒選的六個是 auto 且 lockTick
    // 是 -1(不是 0 —— 0 會在平均值裡被讀成「秒選」)。
    const manual = folded.picks.filter((p) => p.source === "manual");
    const auto = folded.picks.filter((p) => p.source === "auto");
    expect(manual).toHaveLength(6);
    expect(auto).toHaveLength(6);
    for (const p of manual) expect(p.lockTick).toBeGreaterThanOrEqual(0);
    for (const p of auto) expect(p.lockTick).toBe(-1);
  });

  it("還原得出:雙方陣容(成對,而且知道誰贏)", () => {
    expect(folded.lineups.length).toBeGreaterThan(0);
    const seatChamp = new Map(folded.picks.map((p) => [p.seatId, p.championId]));
    const teamOf = new Map(folded.picks.map((p) => [p.seatId, p.teamId]));
    for (const l of folded.lineups) {
      expect(l.sides).toHaveLength(2);
      // 依 teamId 升冪 —— 同一組對局永遠產生同一個 key。
      expect(l.sides[0].teamId).toBeLessThan(l.sides[1].teamId);
      for (const side of l.sides) {
        expect(side.championIds.length).toBeGreaterThan(0);
        // 陣容裡的每一隻,都真的是那一隊某個座位選的英雄。
        const teamChamps = [...seatChamp.entries()]
          .filter(([seatId]) => teamOf.get(seatId) === side.teamId)
          .map(([, cid]) => cid)
          .sort();
        expect([...side.championIds].sort()).toEqual(teamChamps);
        // championIds 是排序過的(陣容是集合,不是順序)。
        expect(side.championIds).toEqual([...side.championIds].sort());
      }
      // 一場決出來的對局恰好有一方是贏家。
      expect(l.sides.filter((s) => s.won)).toHaveLength(1);
    }
  });

  it("還原得出:每支技能施放了幾次 —— 而且和計分板對得起來", () => {
    expect(folded.casts.length, "十二隻 bot 打十回合不可能一次技能都沒放").toBeGreaterThan(0);
    const use = aggregateAbilityUse(folded.casts);
    expect(use.length).toBeGreaterThan(0);
    // final 行的聚合和從 round 行折出來的,**列與次數必須逐格相等**;credit
    // 只能是 final ≥ round(回合結算之後才落地的傷害只進得了 final,見
    // format.ts 對 `MatchStatsRoundLine.casts` 的說明)。寫成 toEqual 會在那幾
    // 發空中的投射物上偶發紅,寫成「都大於 0」則什麼都測不到。
    const finalUse = folded.final!.abilityUse;
    expect(finalUse.map((u) => `${u.seatId}:${u.abilityId}:${u.casts}`)).toEqual(
      use.map((u) => `${u.seatId}:${u.abilityId}:${u.casts}`),
    );
    for (let i = 0; i < finalUse.length; i++) {
      expect(finalUse[i]!.damageToHeroes).toBeGreaterThanOrEqual(use[i]!.damageToHeroes - 1e-6);
      expect(finalUse[i]!.heroHits).toBeGreaterThanOrEqual(use[i]!.heroHits);
    }

    // ⚠️ 真正的守衛在這裡:每個座位的施放列數,必須等於那個座位在**計分板**
    // 上的 abilityCasts 總和。兩者來自同一個 `abilityCast` 事件的兩條路
    // (`recordAbilityCast` 寫 world state / `beginCast` 寫帳本),所以任何一條
    // 漏記都會讓它們分岔。純粹數「有沒有大於 0」是形態⑦(掃屬性代替掃行為)。
    const castsBySeat = new Map<number, number>();
    for (const c of folded.casts) castsBySeat.set(c.seatId, (castsBySeat.get(c.seatId) ?? 0) + 1);
    const scoreboardBySeat = new Map<number, number>();
    for (const p of folded.players) {
      scoreboardBySeat.set(p.seatId, (scoreboardBySeat.get(p.seatId) ?? 0) + p.abilityCasts);
    }
    for (const [seatId, n] of scoreboardBySeat) {
      expect(castsBySeat.get(seatId) ?? 0, `seat ${seatId}: cast rows vs scoreboard abilityCasts`).toBe(n);
    }

    // 每一列都掛在一個真的技能上,而且帶絕對 tick 與槽位。
    for (const c of folded.casts) {
      expect(c.abilityId).not.toBe("");
      expect(c.tick).toBeGreaterThanOrEqual(0);
      expect(c.round).toBeGreaterThanOrEqual(1);
    }
  });

  it("還原得出:三選一的三張 —— 含**沒被選的那兩張**", () => {
    expect(folded.offers.length).toBeGreaterThan(0);
    const three = folded.offers.filter((o) => o.offered.length === 3);
    expect(three.length, "排程的回合會發 3 選 1(offerCount = 3)").toBeGreaterThan(0);
    for (const o of three) {
      if (o.picked === null) continue;
      // 對照組:被選走一張之後,另外兩張必須在 declined 裡。少了它們,
      // 「這張卡比另外兩張強」就是一個沒有分母的說法。
      expect(o.declined).toHaveLength(2);
      expect(o.declined).not.toContain(o.picked);
      expect([...o.declined, o.picked].sort()).toEqual([...o.offered].sort());
    }
    // 玩家自己按的那一條路(座位 0 的 human driver)真的被記成 auto=false,
    // 而 bot 的代選是 auto=true。把 applyPick 的 auto 硬寫成常數,這條會紅。
    expect(folded.offers.some((o) => !o.auto), "座位 0 是玩家自己按的").toBe(true);
    expect(folded.offers.some((o) => o.auto), "其餘座位走 #207 的自動代選").toBe(true);

    // 取捨率把「玩家選的」和「系統代選的」分開算 —— 混在一起的話一半的樣本
    // 是隨機數,而隨機數的選取率沒有意義。
    const stats = aggregateOfferChoices(folded.offers);
    expect(folded.final!.offerChoices).toEqual(stats);
    for (const s of stats) {
      expect(s.offered).toBe(s.picked + s.autoPicked + s.declined);
    }
    expect(stats.some((s) => s.picked > 0), "有卡片是玩家真的選走的").toBe(true);
  });

  it("還原得出:每回合的名次 —— 而且是照回合分數排的,不是照座位", () => {
    for (const line of folded.rounds) {
      const played = line.players.filter((p) => !p.bye);
      if (played.length === 0) continue;
      const places = played.map((p) => p.placement).sort((a, b) => a - b);
      // 1..N,不重複、不跳號。
      expect(places).toEqual(Array.from({ length: played.length }, (_, i) => i + 1));
      // 輪空的不排(0)—— 一場沒發生的比賽給它一個名次是在說謊(#173)。
      for (const p of line.players) if (p.bye) expect(p.placement).toBe(0);
    }
    // 名次不是座位順序:至少有一個回合的第一名不是最小的那個座位號。
    const anyReordered = folded.rounds.some((line) => {
      const played = line.players.filter((p) => !p.bye);
      if (played.length < 2) return false;
      const first = played.find((p) => p.placement === 1)!;
      const lowestSeat = played.reduce((a, b) => (a.seatId <= b.seatId ? a : b));
      return first.seatId !== lowestSeat.seatId;
    });
    expect(anyReordered, "把排序改成照 seatId 排,這一條會紅").toBe(true);
  });

  it("每回合的成績是 DELTA,不是累積快照", () => {
    // 累積快照的特徵是單調不減。真的 delta 一定會出現「這一回合比上一回合少」
    // 的情形(有人這回合傷害輸出比上回合低)。
    const bySeat = new Map<number, number[]>();
    for (const line of folded.rounds) {
      for (const p of line.players) {
        if (p.bye) continue;
        const arr = bySeat.get(p.seatId) ?? [];
        arr.push(p.damageDealt);
        bySeat.set(p.seatId, arr);
      }
    }
    const anyDecrease = [...bySeat.values()].some((series) =>
      series.some((v, i) => i > 0 && v < series[i - 1]!),
    );
    expect(anyDecrease, "把 diffMatchStats 換成直接讀累積值,這一條會紅").toBe(true);
    // 而且每一回合的和,必須**收斂到**整場的總量。
    //
    // ⚠️ 不是精確相等,而且相差的那一點正是真話:回合結算(concludeCombat)之後
    // 仍然有幾發投射物在空中,它們落地的傷害進了計分板但沒有任何一個回合的
    // delta 收得到。量到的差距是 <1%(seat 0: 10330.7 / 10406.9 = 99.27%)。
    // 這一條要抓的是相反方向的缺陷:把 `diffMatchStats` 換成直接讀累積值,
    // Σ 會變成 O(回合數) 倍,遠遠超過 live —— 所以上界才是守衛。
    const totalPerSeat = new Map<number, number>();
    for (const p of folded.players) {
      totalPerSeat.set(p.seatId, (totalPerSeat.get(p.seatId) ?? 0) + p.damageDealt);
    }
    for (const [seatId, sum] of totalPerSeat) {
      const seat = ctlRef.seats.get(asSeatId(seatId))!;
      const live = ctlRef.world.matchStats.get(seat.entityId!)?.damageDealt ?? 0;
      expect(sum, `seat ${seatId}: Σ per-round damage must never EXCEED the scoreboard`).toBeLessThanOrEqual(
        live + 1e-6,
      );
      if (live > 0) {
        expect(sum / live, `seat ${seatId}: Σ per-round damage should account for ~all of it`).toBeGreaterThan(0.9);
      }
    }
  });

  it("英雄選取率讀得出來(這就是 #207 存在的理由)", () => {
    const rates = aggregateChampionRates(folded.picks, folded.players);
    expect(folded.final!.championRates).toEqual(rates);
    expect(rates.length).toBeGreaterThan(0);
    const picks = rates.reduce((s, r) => s + r.picks, 0);
    expect(picks).toBe(12);
    // 輪空的回合不算進 roundsPlayed —— 算進去會讓輪空比較多的英雄看起來比較弱。
    const playedRows = folded.players.filter((p) => !p.bye && p.championId !== "").length;
    expect(rates.reduce((s, r) => s + r.roundsPlayed, 0)).toBe(playedRows);
  });

  it("小怪 / 王的擊殺分開記,而且沒有被守衛塔灌水", () => {
    const mobKills = folded.players.reduce((s, p) => s + p.mobKills, 0);
    expect(mobKills, "殭屍波從第 1 回合就開,十回合下來一定有人補到刀").toBeGreaterThan(0);
    for (const p of folded.players) {
      expect(p.mobKills).toBeGreaterThanOrEqual(0);
      expect(p.bossKills).toBeGreaterThanOrEqual(0);
    }
  });

  it("後台化清單和實際生效的旋鈕是同一份(欄位清單不是許願)", () => {
    const rule = matchStatsRetention();
    const byEnv = new Map(MATCH_STATS_KNOBS.map((k) => [k.env, k]));
    expect(byEnv.size).toBe(MATCH_STATS_KNOBS.length);
    expect(byEnv.get("GGD_MATCH_STATS")!.def).toBe(true);
    expect(byEnv.get("GGD_MATCH_STATS_MAX_FILES")!.def).toBe(rule.maxFiles);
    expect(byEnv.get("GGD_MATCH_STATS_MAX_AGE_DAYS")!.def).toBe(rule.maxAgeDays);
    // DIR 這一格在測試裡被覆寫過,所以比的是「它真的會讀環境變數」。
    expect(rule.dir).toBe(dir);
    expect(rule.enabled).toBe(true);
  });
});
