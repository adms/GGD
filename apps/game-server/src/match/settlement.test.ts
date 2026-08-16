/**
 * Victory settlement: control-freeze once the outcome is decided + the match-end
 * payload (per-player scoreboard / grade / rank / winner) — settle-06..settle-08.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { asSeatId, asTeamId } from "@ggd/shared/ids";
import { GRADES } from "@ggd/shared/sim/stats/rating";
import { MatchState, ROUND_OUTCOME } from "@ggd/shared/protocol/schema";
import { Configs } from "@ggd/shared/content";
import { zConfigMatchDoc } from "@ggd/shared/content/schema/config";
import {
  DEFAULT_SETTLEMENT_CARD_ON_HEALTH_SPENT,
  MatchController,
  settlementCardOnHealthSpentFromDoc,
  type SeatSpec,
} from "./MatchController";
import { projectSnapshot } from "../net/snapshot";
import { HumanDriver } from "../seat/HumanDriver";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/** Tick until the match outcome latches (final combat over), or the guard trips. */
function runToDecided(ctl: MatchController, guard = 60000): number {
  let n = 0;
  while (!ctl.outcomeDecided && n < guard) {
    ctl.tick();
    n++;
  }
  return n;
}

function runToEnd(ctl: MatchController, guard = 60000): void {
  let n = 0;
  while (ctl.phase.phase !== "matchEnd" && n < guard) {
    ctl.tick();
    n++;
  }
}

describe("control freeze once decided (settle-07)", () => {
  it("is NOT frozen during normal combat", () => {
    const ctl = new MatchController("f0", 1234, allBots(), FAST);
    while (ctl.phase.phase !== "combat") ctl.tick();
    expect(ctl.outcomeDecided).toBe(false);
  });

  it("ignores human input after the outcome is decided; champions idle", () => {
    cover("settle-freeze");
    const ctl = new MatchController("f1", 1234, allBots(), FAST);
    runToDecided(ctl);
    expect(ctl.outcomeDecided).toBe(true);
    expect(["resolution", "matchEnd"]).toContain(ctl.phase.phase);

    // pick an alive champion (the winning team survives the final duel)
    const alive = [...ctl.seats.values()].find((s) => {
      const hp = s.entityId !== null ? ctl.world.health.get(s.entityId) : null;
      return hp?.alive;
    });
    expect(alive).toBeDefined();
    const entity = alive!.entityId!;
    const before = { ...ctl.world.transform.get(entity)!.pos };

    // hand the seat to a human and spam a far-away move order — it must be ignored
    const human = new HumanDriver();
    alive!.setDriver(human);
    const target = { x: before.x + 50, z: before.z + 50 };
    for (let i = 0; i < 3; i++) {
      human.mailbox.push({ seq: i + 1, order: { kind: "move", point: target } });
      ctl.tick();
    }
    const after = ctl.world.transform.get(entity)!.pos;
    const moved = Math.hypot(after.x - before.x, after.z - before.z);
    // a live 50-unit move order would drive the champion >1 unit over 3 ticks;
    // frozen, it barely settles (collision only) — proves the input was ignored.
    expect(moved).toBeLessThan(0.05);

    // and the schema projects the freeze flag for the client
    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());
    expect(state.outcomeDecided).toBe(true);
  });
});

describe("match-end settlement payload (settle-08)", () => {
  it("carries a graded, ranked per-player scoreboard + winner", () => {
    cover("settle-payload");
    const ctl = new MatchController("s1", 4242, allBots(), FAST);
    runToEnd(ctl);
    expect(ctl.phase.phase).toBe("matchEnd");

    const settle = ctl.settlement;
    expect(settle).not.toBeNull();
    expect(settle!.perPlayer).toHaveLength(12);

    // winnerTeam is the team that placed 1st
    const firstTeam = [...ctl.placements.entries()].find(([, p]) => p === 1)?.[0];
    expect(settle!.winnerTeam).toBe(firstTeam);

    // every player: a valid grade, and ranks are a permutation of 1..12
    for (const p of settle!.perPlayer) {
      expect(GRADES).toContain(p.grade);
      expect(p.champ.length).toBeGreaterThan(0);
      expect(p.stats).toBeDefined();
    }
    expect(settle!.perPlayer.map((p) => p.rank).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );

    // the payload stats mirror the authoritative world scoreboard
    const p0 = settle!.perPlayer.find((p) => p.seatId === 0)!;
    const entity0 = ctl.seats.get(asSeatId(0))!.entityId!;
    expect(p0.stats).toEqual(ctl.world.matchStats.get(entity0));
    // combat happened -> at least one player recorded a kill
    expect(settle!.perPlayer.some((p) => p.stats.kills > 0)).toBe(true);
  });

  it("is identical across two seeded runs (settle-09)", () => {
    cover("settle-payload-deterministic");
    const run = (): string => {
      const ctl = new MatchController("s2", 777, allBots(), FAST);
      runToEnd(ctl);
      return JSON.stringify({
        winner: ctl.settlement!.winnerTeam,
        players: ctl.settlement!.perPlayer.map((p) => ({ seat: p.seatId, g: p.grade, r: p.rank, k: p.stats.kills, d: p.stats.damageDealt })),
        digest: ctl.world.digest(),
      });
    };
    expect(run()).toBe(run());
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Per-team settlement broadcast — 「什麼叫做被淘汰」 (task #193 / GH#264)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * #193 的中途結算卡本來掛在「團隊生命歸零」上，因為當時歸零**就是**出局。
 * owner 2026-07-27 取消淘汰之後兩者分家：歸零只是計分板見底，那一隊照樣打完
 * 十回合，**而且照樣可能奪冠**（第 1 名由決賽決定、不看團隊生命）。舊的觸發
 * 條件因此會對未來的冠軍送出一張 `winnerTeam: -1` 的「戰鬥結束」卡，而那張卡
 * 在客戶端直接附著「返回大廳」。
 *
 * 「那張卡什麼時候該發」是一個**決策點**，所以它是一個後台欄位
 * （`config.match@1` 的 `match.settlementCardOnHealthSpent`），不是一行寫死的
 * 判斷。下面兩條分別跑兩個模式的**機制**，不是抄任何一個出貨數字。
 *
 * ⚠️ 這兩條都用 `Configs.register` 把文件推進真正的解析路徑（內容 → Zod 的鍵
 * → `settlementCardOnHealthSpentFromDoc` → 建構子預設值），不是手寫一個旗標塞
 * 進控制器 —— 手寫的那種版本對「欄位根本沒接上」是全綠的（失敗形態 ⑤）。
 */
const HERE = dirname(fileURLToPath(import.meta.url));
/** 出貨的那一份 `config.match.json` —— 被測的必須是出貨的那個。 */
const SHIPPED_MATCH_DOC = JSON.parse(
  readFileSync(join(HERE, "../../../../content/config/config.match.json"), "utf8"),
) as Record<string, unknown>;

/** 出貨文件 + 一個覆寫過的 `settlementCardOnHealthSpent`。 */
function matchDocWithCard(on: boolean): Record<string, unknown> {
  const m = SHIPPED_MATCH_DOC.match as Record<string, unknown>;
  return { ...SHIPPED_MATCH_DOC, match: { ...m, settlementCardOnHealthSpent: on } };
}

interface MatchRun {
  ctl: MatchController;
  broadcasts: { teamId: number; winnerTeam: number; players: number }[];
  /** 整場之中**曾經**把團隊生命打到 0 的隊伍（每 tick 取樣，升序）。 */
  spent: number[];
  /** 第 1 名（決賽的勝者）。 */
  winner: number;
  /** 第 2 名 —— 舊斷言裡的 “decider”。 */
  runnerUp: number;
}

/** 跑完一整場，把中途廣播與「誰的血曾經歸零」一起收下來。 */
function runFullMatch(matchId: string, seed: number, doc: Record<string, unknown>): MatchRun {
  Configs.register(doc as never);
  const ctl = new MatchController(matchId, seed, allBots(), FAST);
  const broadcasts: MatchRun["broadcasts"] = [];
  const spent = new Set<number>();
  let n = 0;
  while (ctl.phase.phase !== "matchEnd" && n < 60000) {
    ctl.tick();
    for (const [teamId, hp] of ctl.lives) if (hp <= 0) spent.add(teamId as number);
    for (const es of ctl.takeEliminationSettlements()) {
      broadcasts.push({
        teamId: es.teamId,
        winnerTeam: es.settlement.winnerTeam,
        players: es.settlement.perPlayer.length,
      });
    }
    n++;
  }
  expect(ctl.phase.phase).toBe("matchEnd");
  const place = (p: number): number =>
    [...ctl.placements.entries()].find(([, v]) => v === p)![0] as number;
  return { ctl, broadcasts, spent: [...spent].sort((a, b) => a - b), winner: place(1), runnerUp: place(2) };
}

describe("per-team elimination settlement (elimination-settlement, task #193 / GH#264)", () => {
  it("出貨模式:沒有人在比賽中途出局,所以未來的冠軍拿不到「戰鬥結束」卡", () => {
    cover("elimination-settlement");
    // GH#332 —— seed 4263 換成 4260。⚠️ 同樣不是「把測試調鬆」：2026-08-16 的
    //    移動速度第二版（極小5/小6/中8/大10/極大12，上限 18）+ owner 下架四位
    //    英雄，bot 的選角與走位都變了，4263 那一場冠軍不再是被打光過的隊伍。
    //    實測掃 4260–4560：**72/300 場**有隊伍歸零，其中 4260 / 4288 / 4318 /
    //    4319 / 4331 五個 seed 冠軍本人也歸零過，取最小的。
    //    ⭐ 「72/300」這個數字本身是這次掃描的副產品，但它是有意義的：
    //    如果哪天它變成 0/300，那就不是換 seed 的問題，是**淘汰這條路整個死了**。
    //
    // GH#324 —— seed 4245 換成 4263。⚠️ 同樣不是「把測試調鬆」：Phase 3 讓單位
    //    改走**烘焙好的路徑點**（不再撞牆卡死），bot 的走位因此改變，4245 那一場
    //    不再有任何隊伍把血打光。實測掃 4240–4290，4263 / 4275 / 4276 都重現，
    //    取最小的。⇒ 這正是下面那一行註解在說的事，它照著做了。
    //
    // GH#323 —— seed 4242 換成 4245。⚠️ 這不是「把測試調鬆」：41 位英雄在
    //    2026-08-13 退場，bot 的選角因此改變，4242 那一場**不再有任何隊伍歸零**，
    //    於是這條測試的前提消失（下面那兩行原本就寫著「這一行紅了不要刪，
    //    要換一個會重現的 seed」）。4245 實測：spent=隊伍2/3，winner=隊伍2 ——
    //    冠軍本人被打光過，正是 GH#264 的重現本身。
    const run = runFullMatch("elim1", 4260, matchDocWithCard(false));
    // 這一條測的是 OFF 那一側 —— 而且是**經由內容文件**到達控制器的。
    expect(run.ctl.settlementCardOnHealthSpent).toBe(false);

    // ── 非空轉的證據 ──────────────────────────────────────────────────────
    // 「一張卡都沒發」在一場沒有任何隊伍歸零的比賽裡是**免費**成立的，那種綠
    // 燈對缺陷完全不敏感（失敗形態 ④）。所以先釘住這一場真的有隊伍把血打光，
    // 而且**冠軍就是其中一支** —— 這正是 GH#264 的重現本身。
    // ⚠️ 這一行紅了不要刪：它的意思是這個 seed 不再重現那個情境，要換一個會的。
    expect(run.spent.length).toBeGreaterThanOrEqual(1);
    expect(run.spent).toContain(run.winner);

    // ── 被守的性質 ────────────────────────────────────────────────────────
    // 血耗光 ≠ 出局，而中途結算卡只發給出局的隊伍 → 整場一張都不該有。
    expect(run.broadcasts).toEqual([]);
    const teamIds = run.broadcasts.map((b) => b.teamId);
    expect(teamIds).not.toContain(run.winner);
    expect(teamIds).not.toContain(run.runnerUp);

    // …而**最終**結算完全沒有被動到:冠軍還是拿得到權威的那一份。
    expect(run.ctl.settlement!.winnerTeam).toBe(run.winner);
    expect(run.ctl.settlement!.perPlayer).toHaveLength(12);
  });

  it("後台打開就退回舊行為 —— 這個功能是被關掉,不是被刪掉", () => {
    cover("elimination-settlement");
    // 同上，與 OFF 那一側用同一個 seed 才比得出「打開的代價」。
    const run = runFullMatch("elim1", 4260, matchDocWithCard(true));
    expect(run.ctl.settlementCardOnHealthSpent).toBe(true);

    // 血歸零的隊伍**當場**拿到一張卡:不多不少就是那些隊伍，各一張。
    // （決賽那一回合是被抑制的 —— `maybeFinish` 幾秒後就會送出權威的那一份，
    //   重複一張只會跟它賽跑。決賽本來就不動團隊生命，所以這裡不會有新的。）
    expect(run.broadcasts.length).toBeGreaterThanOrEqual(1);
    expect(run.broadcasts.map((b) => b.teamId).sort((a, b) => a - b)).toEqual(run.spent);
    // 卡的內容仍然是「未定」+ 全場名單，所以玩家看到的是「戰鬥結束」不是假的勝利
    for (const b of run.broadcasts) {
      expect(b.winnerTeam).toBe(-1);
      expect(b.players).toBe(12);
    }

    // ⚠️ 這一行釘的是**打開的代價**，不是我們想要的行為:同一場比賽裡，那張
    // 「戰鬥結束」卡送到了最後奪冠的那一隊手上。它就是出貨值選 OFF 的理由，
    // 也是這個模式在後台說明裡被標成「舊行為」的原因。
    expect(run.broadcasts.map((b) => b.teamId)).toContain(run.winner);
  });

  it("is deterministic: two seeded runs queue the identical broadcast sequence", () => {
    cover("elimination-settlement");
    // 舊行為那一側跑 —— OFF 之下佇列恆空，兩次都空當然相等，那是空轉的綠燈。
    const run = (): string => {
      Configs.register(matchDocWithCard(true) as never);
      const ctl = new MatchController("elim2", 9090, allBots(), FAST);
      const seq: { teamId: number; digest: number }[] = [];
      let n = 0;
      while (ctl.phase.phase !== "matchEnd" && n < 60000) {
        ctl.tick();
        for (const es of ctl.takeEliminationSettlements()) {
          seq.push({ teamId: es.teamId, digest: ctl.world.digest() });
        }
        n++;
      }
      expect(seq.length).toBeGreaterThanOrEqual(1); // 有東西可比，才叫確定性
      return JSON.stringify(seq);
    };
    expect(run()).toBe(run());
  });

  it("draining the queue mutates nothing: the final matchEnd payload is unchanged", () => {
    cover("elimination-settlement");
    // running the match while draining mid-match eliminations must leave the
    // final settlement byte-identical to a run that never drained — the queue is
    // pure output, not sim state. 開著舊行為跑，佇列才真的有東西可以排掉。
    const finalDigest = (drain: boolean): string => {
      Configs.register(matchDocWithCard(true) as never);
      const ctl = new MatchController("elim3", 4242, allBots(), FAST);
      let n = 0;
      while (ctl.phase.phase !== "matchEnd" && n < 60000) {
        ctl.tick();
        if (drain) ctl.takeEliminationSettlements();
        n++;
      }
      return JSON.stringify({
        winner: ctl.settlement!.winnerTeam,
        ranks: ctl.settlement!.perPlayer.map((p) => [p.seatId, p.rank, p.grade]),
        digest: ctl.world.digest(),
      });
    };
    expect(finalDigest(true)).toBe(finalDigest(false));
  });

  it("出貨的 config.match.json 走完 Zod 之後就是 OFF，缺席也是 OFF", () => {
    cover("elimination-settlement");
    // 掃原始碼字串代替行為（失敗形態 ⑥）在這裡會過:所以走真正的 schema。
    const parsed = zConfigMatchDoc.parse(SHIPPED_MATCH_DOC);
    expect(parsed.match.settlementCardOnHealthSpent).toBe(false);
    expect(settlementCardOnHealthSpentFromDoc(parsed)).toBe(false);
    // 缺文件 / 缺欄位 / 錯 schema ⇒ 出貨預設。一份還沒有這一格的舊
    // `config.match.json` 不可以被靜默切到另一半。
    expect(settlementCardOnHealthSpentFromDoc(undefined)).toBe(DEFAULT_SETTLEMENT_CARD_ON_HEALTH_SPENT);
    expect(settlementCardOnHealthSpentFromDoc({ id: "config.match", schema: "config@1", match: {} })).toBe(
      DEFAULT_SETTLEMENT_CARD_ON_HEALTH_SPENT,
    );
    // …而兩個具名狀態都真的讀得出來（不是永遠回預設值的空殼）。
    expect(settlementCardOnHealthSpentFromDoc(matchDocWithCard(true))).toBe(true);
    expect(settlementCardOnHealthSpentFromDoc(matchDocWithCard(false))).toBe(false);
    // 復原全域登錄表:後面的 describe 共用同一個模組實例。
    Configs.register(SHIPPED_MATCH_DOC as never);
  });
});

/**
 * The per-ROUND K/D tallies behind the round-end winner presentation (the #143
 * model + #142 VO). The bug they fix: the client used to present the leading
 * team's LOWEST-SEATID champion, and seat↔champion is fixed for a whole match,
 * so every round showed the same hero. The tallies must therefore be per-round
 * (a cumulative one would just re-pin the match's best killer) and they must be
 * on the wire, because a reconnecting client's own death-event tally is partial.
 */
describe("per-ROUND kill/death tallies (round-mvp-tally)", () => {
  /** Tick until the phase is `target` (or the guard trips). */
  const tickUntil = (ctl: MatchController, target: string, guard = 60000): void => {
    let n = 0;
    while (ctl.phase.phase !== target && ctl.phase.phase !== "matchEnd" && n < guard) {
      ctl.tick();
      n++;
    }
  };

  it("zeroes at every combat entry and equals THAT round's cumulative delta", () => {
    cover("round-mvp-tally");
    const ctl = new MatchController("mvp", 4242, allBots(), FAST);
    const state = new MatchState();
    const seatIds = [...ctl.seats.keys()];
    let sawRoundKills = false;
    let rounds = 0;

    while (ctl.phase.phase !== "matchEnd" && rounds < 6) {
      tickUntil(ctl, "combat");
      if (ctl.phase.phase !== "combat") break;
      rounds++;

      // combat entry: every seat starts the round on a clean sheet
      for (const seatId of seatIds) {
        expect(ctl.roundKills.get(seatId)).toBe(0);
        expect(ctl.roundDeaths.get(seatId)).toBe(0);
      }
      const kBefore = new Map(seatIds.map((s) => [s, ctl.kills.get(s) ?? 0]));
      const dBefore = new Map(seatIds.map((s) => [s, ctl.deaths.get(s) ?? 0]));

      // …and at the round-end beat (the `resolution` edge the presentation
      // fires on) it holds exactly what happened THIS round — never the match
      // total, which is what would freeze one champion on screen forever.
      tickUntil(ctl, "resolution");
      for (const seatId of seatIds) {
        expect(ctl.roundKills.get(seatId)).toBe((ctl.kills.get(seatId) ?? 0) - kBefore.get(seatId)!);
        expect(ctl.roundDeaths.get(seatId)).toBe((ctl.deaths.get(seatId) ?? 0) - dBefore.get(seatId)!);
      }
      if (seatIds.some((s) => (ctl.roundKills.get(s) ?? 0) > 0)) sawRoundKills = true;

      // the snapshot carries the same numbers, so every client (including one
      // that joined mid-match) ranks the round identically
      projectSnapshot(ctl, state, new Map());
      for (const seatId of seatIds) {
        const ss = state.seats.get(String(seatId))!;
        expect(ss.roundKills).toBe(ctl.roundKills.get(seatId));
        expect(ss.roundDeaths).toBe(ctl.roundDeaths.get(seatId));
      }
    }

    expect(rounds).toBeGreaterThan(1); // more than one round actually ran
    expect(sawRoundKills).toBe(true); // and rounds were decided by kills
    // the cumulative tally still accrues across the whole match
    expect(seatIds.reduce((s, id) => s + (ctl.kills.get(id) ?? 0), 0)).toBeGreaterThan(0);
  });

  it("survives the whole resolution beat, then clears on the next round", () => {
    cover("round-mvp-tally");
    const ctl = new MatchController("mvp2", 4242, allBots(), FAST);
    const seatIds = [...ctl.seats.keys()];
    tickUntil(ctl, "combat");
    tickUntil(ctl, "resolution");
    const atRoundEnd = seatIds.map((s) => ctl.roundKills.get(s) ?? 0);
    expect(atRoundEnd.some((k) => k > 0)).toBe(true);

    // the winner presentation reads these all through `resolution` — the reset
    // is at COMBAT ENTRY, not at concludeCombat, so they must not blank here
    while (ctl.phase.phase === "resolution") {
      ctl.tick();
      expect(seatIds.map((s) => ctl.roundKills.get(s) ?? 0)).toEqual(atRoundEnd);
    }
    // …and the shop intermission still shows the finished round's numbers.
    // ASSERTED, not branched on: behind an `if` the reset check — the whole
    // point of this case — could silently never run and still report green.
    expect(ctl.phase.phase).toBe("intermission");
    expect(seatIds.map((s) => ctl.roundKills.get(s) ?? 0)).toEqual(atRoundEnd);
    tickUntil(ctl, "combat");
    expect(seatIds.map((s) => ctl.roundKills.get(s) ?? 0)).toEqual(seatIds.map(() => 0));
  });
});

/**
 * round-mvp-bye — the residual of the round-MVP fix above. With 3 alive teams
 * the format hands one team a BYE, and enterCombat parks EVERY seat dead before
 * reviving only the seats belonging to a pairing. The bye team therefore ends
 * the round alive:false / roundKills:0 / roundDeaths:0 — byte-identical to a
 * team that was instantly wiped, and it never even emits a death event (the
 * parking mutates hp directly). If it happened to lead the standings, the
 * presentation picked it, found no survivors and no scorers, and degenerated to
 * its lowest seatId: 「每回合都是同一個英雄」 for that round.
 *
 * TeamState.roundOutcome is the signal that closes it: NONE at combat entry,
 * FOUGHT where enterCombat places a team into a duel zone, WON/LOST at
 * settleRound. The bye team is the only one that never leaves NONE.
 */
describe("bye rounds are marked, so the sit-out team is never presented (round-mvp-bye)", () => {
  const tickUntil = (ctl: MatchController, target: string, guard = 60000): void => {
    let n = 0;
    while (ctl.phase.phase !== target && ctl.phase.phase !== "matchEnd" && n < guard) {
      ctl.tick();
      n++;
    }
  };

  it("a SPENT team is FOUGHT, not NONE — the bye is unreachable now (owner 2026-07-27)", () => {
    cover("round-mvp-bye");
    // WHAT THIS TEST USED TO DO, and why it changed. It set team 3's health to 0
    // to force the 3-alive state `pairTeams` answers with one duel + a bye, then
    // pinned the bye team's roundOutcome at NONE — the #173 fingerprint that
    // separates 「輪空」 from 「被團滅」. Owner's ruling removes elimination, so a
    // 0-health team is never dropped from the pairing and a 4-team match can no
    // longer produce a bye at all. `pairTeams`' bye branch is still correct and
    // is still pinned as a pure function in match.test.ts.
    //
    // The behaviour worth pinning HERE is the replacement: a team whose pool is
    // spent is placed into a duel like everyone else, so it reads FOUGHT (then
    // WON/LOST), NOT the NONE that would make the round-end presentation skip it.
    const ctl = new MatchController("bye1", 9090, allBots(), FAST);
    tickUntil(ctl, "intermission");
    const spent = asTeamId(3);
    ctl.lives.set(spent, 0);
    tickUntil(ctl, "combat");
    expect(ctl.phase.phase).toBe("combat");
    expect(ctl.bye).toBeNull();

    // combat entry marks participation for ALL FOUR teams — including the spent one
    for (const pairing of ctl.pairings) {
      expect(ctl.roundOutcome.get(pairing.sideA)).toBe(ROUND_OUTCOME.FOUGHT);
      expect(ctl.roundOutcome.get(pairing.sideB)).toBe(ROUND_OUTCOME.FOUGHT);
    }
    expect(ctl.roundOutcome.get(spent)).toBe(ROUND_OUTCOME.FOUGHT);

    tickUntil(ctl, "resolution");
    expect(ctl.phase.phase).toBe("resolution");

    // two duels settled → two winners, two losers, nobody left on NONE
    const outcomes = [...ctl.roundOutcome.values()];
    expect(outcomes.filter((o) => o === ROUND_OUTCOME.WON)).toHaveLength(2);
    expect(outcomes.filter((o) => o === ROUND_OUTCOME.LOST)).toHaveLength(2);
    expect(outcomes.filter((o) => o === ROUND_OUTCOME.NONE)).toHaveLength(0);

    // the snapshot mirrors it, so every client (including a late joiner) agrees
    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());
    const wire = state.teams.map((t) => ({ teamId: t.teamId, roundOutcome: t.roundOutcome }));
    expect(wire).toHaveLength(4);
    for (const t of wire) expect(t.roundOutcome).toBe(ctl.roundOutcome.get(asTeamId(t.teamId)));
    // …and the spent team's `eliminated` flag KEEPS its 生命耗盡 meaning (#193's
    // leave-through-settlement gate reads exactly this), it just no longer
    // removes anyone from the match.
    expect(state.teams.find((t) => t.teamId === (spent as number))!.eliminated).toBe(true);
  });

  it("survives the whole resolution beat, then resets at the next combat entry", () => {
    cover("round-mvp-bye");
    const ctl = new MatchController("bye2", 9090, allBots(), FAST);
    tickUntil(ctl, "intermission");
    ctl.lives.set(asTeamId(3), 0); // pool spent — still plays (owner 2026-07-27)
    tickUntil(ctl, "combat");
    tickUntil(ctl, "resolution");
    const atRoundEnd = [...ctl.roundOutcome.values()];
    expect(atRoundEnd).toContain(ROUND_OUTCOME.WON);

    // the presentation reads this all through `resolution` — the reset is at
    // COMBAT ENTRY, exactly like the K/D tallies, so it must not blank here
    while (ctl.phase.phase === "resolution") {
      ctl.tick();
      expect([...ctl.roundOutcome.values()]).toEqual(atRoundEnd);
    }
    // ASSERTED, not branched on — a conditional here can skip the reset check
    expect(ctl.phase.phase).toBe("intermission");
    expect([...ctl.roundOutcome.values()]).toEqual(atRoundEnd);
    tickUntil(ctl, "combat");
    // a new round starts from a clean slate; only this round's duelists are FOUGHT
    const byeNow = ctl.bye;
    for (const [teamId, outcome] of ctl.roundOutcome) {
      const fighting = ctl.pairings.some((p) => p.sideA === teamId || p.sideB === teamId);
      expect(outcome).toBe(fighting ? ROUND_OUTCOME.FOUGHT : ROUND_OUTCOME.NONE);
    }
    if (byeNow !== null) expect(ctl.roundOutcome.get(byeNow)).toBe(ROUND_OUTCOME.NONE);
  });

  it("marks both duelists on an ordinary 4-team round (no bye, nobody left NONE)", () => {
    cover("round-mvp-bye");
    const ctl = new MatchController("bye3", 4242, allBots(), FAST);
    tickUntil(ctl, "combat");
    expect(ctl.bye).toBeNull(); // round 1: all four teams fight
    tickUntil(ctl, "resolution");
    const alive = [...ctl.lives.entries()].filter(([, l]) => l > 0).map(([t]) => t);
    for (const teamId of alive) {
      expect([ROUND_OUTCOME.WON, ROUND_OUTCOME.LOST]).toContain(ctl.roundOutcome.get(teamId));
    }
    expect([...ctl.roundOutcome.values()].filter((o) => o === ROUND_OUTCOME.WON)).toHaveLength(2);
  });

  it("is deterministic across same-seed replays (the tallies draw no rng)", () => {
    cover("round-mvp-bye");
    // roundOutcome/roundWins are pure re-projections of duelWinners/pairings —
    // they draw no rng and touch nothing in packages/shared/src/sim.
    //
    // NOTE ON WHAT THIS CAN AND CANNOT PROVE: run-vs-run equality proves the
    // sim is reproducible from a seed. It CANNOT prove the digest is the same
    // as before this change (both runs would move together), so the test is
    // named for the guarantee it actually gives. The stronger claim is covered
    // structurally instead: nothing here writes to the world.
    const run = (): number => {
      const ctl = new MatchController("bye4", 777, allBots(), FAST);
      runToEnd(ctl);
      return ctl.world.digest();
    };
    expect(run()).toBe(run());
  });
});

/**
 * round-win-counter (task #93) — TeamState.roundWins is what the client's
 * victory gate (vfx/victoryTrigger) edge-detects to fire the SMALL round-win
 * firework. It was declared in the schema and read by the client but never
 * written by anything on the server, so that half of the round beat could not
 * fire at all. These pin the three properties the gate depends on: it rises on
 * a duel win, it is projected on the wire, and it is NEVER reset mid-match.
 */
describe("round-win counter feeds the victory gate (round-win-counter)", () => {
  const tickUntil = (ctl: MatchController, target: string, guard = 60000): void => {
    let n = 0;
    while (ctl.phase.phase !== target && ctl.phase.phase !== "matchEnd" && n < guard) {
      ctl.tick();
      n++;
    }
  };

  it("rises by exactly one for the duel winner, and not for the loser or the bye", () => {
    cover("round-win-counter");
    const ctl = new MatchController("rw1", 4242, allBots(), FAST);
    for (const teamId of ctl.lives.keys()) expect(ctl.roundWins.get(teamId)).toBe(0);
    tickUntil(ctl, "combat");
    tickUntil(ctl, "resolution");
    for (const [teamId, outcome] of ctl.roundOutcome) {
      const wins = ctl.roundWins.get(teamId) ?? -1;
      expect(wins).toBe(outcome === ROUND_OUTCOME.WON ? 1 : 0);
    }
  });

  it("is a MATCH-lifetime counter: it survives the reset that blanks roundOutcome", () => {
    cover("round-win-counter");
    const ctl = new MatchController("rw2", 9090, allBots(), FAST);
    tickUntil(ctl, "combat");
    tickUntil(ctl, "resolution");
    const afterRound1 = new Map(ctl.roundWins);
    expect([...afterRound1.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(0);

    expect(ctl.phase.phase).toBe("resolution");
    tickUntil(ctl, "intermission");
    tickUntil(ctl, "combat");
    // combat entry blanked roundOutcome — the win counter must NOT follow it,
    // or the client's `roundWins > lastRoundWins` edge never fires again
    for (const [teamId, wins] of afterRound1) {
      expect(ctl.roundWins.get(teamId)).toBeGreaterThanOrEqual(wins);
    }
    tickUntil(ctl, "resolution");
    const total = [...ctl.roundWins.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan([...afterRound1.values()].reduce((a, b) => a + b, 0));
  });

  it("rides the wire so every client sees the same counter", () => {
    cover("round-win-counter");
    const ctl = new MatchController("rw3", 4242, allBots(), FAST);
    tickUntil(ctl, "combat");
    tickUntil(ctl, "resolution");
    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());
    const wire = [...state.teams];
    expect(wire).toHaveLength(4);
    for (const t of wire) expect(t.roundWins).toBe(ctl.roundWins.get(asTeamId(t.teamId)));
    expect(wire.filter((t) => t.roundWins === 1)).toHaveLength(2); // two duels, two winners
  });
});
