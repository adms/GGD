/**
 * settle-grade-color / settle-hints / settle-stat-format / settle-rank-table:
 * the pure settlement view-model — grade→colour/headline, data-driven reflection
 * hints, stat formatters, and the ranking-table sort. No React/DOM.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { ROUND_OUTCOME } from "@ggd/shared/protocol/schema";
import { createMatchStats, type PlayerMatchStats } from "@ggd/shared/sim/stats/matchStats";
import type { Grade } from "@ggd/shared/sim/stats/rating";
import type { MatchSettlement, SettlementPlayer } from "@ggd/shared/protocol/messages";
import {
  gradeTier,
  gradeColor,
  gradeHeadline,
  formatAccuracy,
  accuracyRatio,
  formatKda,
  kdaRatio,
  ticksToSeconds,
  buildStatBreakdown,
  reflectionHints,
  sortSettlementRanking,
  localSettlementCard,
  isWinner,
  localWinQuoteChampion,
  matchDecided,
  roundLeaderChampion,
  roundEndQuoteChampion,
  roundWinnerTeamChampions,
  type RoundSeatView,
  type RoundTeamView,
} from "./settlementModel";
import type { ModelDoc } from "@ggd/shared/content";
import {
  planRoundWinnerShow,
  type RoundWinnerAuthority,
} from "../../render/RoundWinnerStage";

/**
 * 出貨呼叫端的那一支 —— `GameApp.updateRoundWinner` 呼叫的就是它。
 * 這個檔案以前是 `readFileSync(GameApp.ts)` + 三條 regex(失敗形態 ⑥),
 * 現在改成把同一支函式真的跑一遍。
 */
const WINNER_DOC = { modelKey: "champ.test", url: "/x.glb" } as unknown as ModelDoc;

/** GH#265:沒有伺服器逐區答案的那一份快照(決賽單場 / 舊快照 / 純觀眾)。 */
const NO_DUELS: RoundWinnerAuthority = { duels: [], zone: -1 };

function stats(over: Partial<PlayerMatchStats> = {}): PlayerMatchStats {
  return { ...createMatchStats(), ...over };
}

function player(over: Partial<SettlementPlayer> = {}): SettlementPlayer {
  return {
    seatId: 0,
    accountId: "acc",
    champ: "sela",
    teamId: 0,
    role: "mage",
    grade: "B",
    rank: 1,
    stats: stats(),
    ...over,
  };
}

describe("grade → colour / tier / headline (settle-grade-color)", () => {
  it("maps every grade to its letter tier", () => {
    cover("settle-grade-color");
    const cases: [Grade, string][] = [
      ["S+", "S"], ["S", "S"], ["S-", "S"],
      ["A+", "A"], ["A", "A"], ["A-", "A"],
      ["B+", "B"], ["B", "B"], ["B-", "B"],
      ["C+", "C"], ["C", "C"], ["C-", "C"],
    ];
    for (const [g, tier] of cases) expect(gradeTier(g)).toBe(tier);
  });

  it("S grades are gold, C grades are grey; each tier has a distinct colour", () => {
    cover("settle-grade-color");
    expect(gradeColor("S+")).toBe("#f2c637"); // gold
    expect(gradeColor("S")).toBe(gradeColor("S-")); // same tier ⇒ same colour
    const colors = new Set([gradeColor("S"), gradeColor("A"), gradeColor("B"), gradeColor("C")]);
    expect(colors.size).toBe(4); // four distinct tier colours
  });

  it("gives every grade a non-empty headline; S+ is louder than a bare tier", () => {
    cover("settle-grade-color");
    for (const g of ["S+", "S", "A", "B", "C-"] as Grade[]) {
      expect(gradeHeadline(g).length).toBeGreaterThan(0);
    }
    expect(gradeHeadline("S+")).not.toBe(gradeHeadline("S"));
  });
});

describe("stat formatters + breakdown (settle-stat-format)", () => {
  it("formats accuracy, and shows — when no skillshots were thrown", () => {
    cover("settle-stat-format");
    expect(formatAccuracy(stats({ abilityHits: 0, abilityWhiffs: 0 }))).toBe("—");
    expect(accuracyRatio(stats({ abilityHits: 0, abilityWhiffs: 0 }))).toBeNull();
    expect(formatAccuracy(stats({ abilityHits: 3, abilityWhiffs: 1 }))).toBe("75%");
    expect(accuracyRatio(stats({ abilityHits: 3, abilityWhiffs: 1 }))).toBeCloseTo(0.75, 6);
  });

  it("formats KDA tally + ratio and converts ticks to seconds", () => {
    cover("settle-stat-format");
    const s = stats({ kills: 5, deaths: 2, assists: 7 });
    expect(formatKda(s)).toBe("5 / 2 / 7");
    expect(kdaRatio(s)).toBeCloseTo(6, 6);
    expect(kdaRatio(stats({ kills: 3, deaths: 0, assists: 0 }))).toBeCloseTo(3, 6); // /max(1,D)
    expect(ticksToSeconds(300)).toBe(10); // 30 Hz
  });

  it("builds a non-empty, labelled breakdown", () => {
    cover("settle-stat-format");
    const rows = buildStatBreakdown(stats({ damageDealt: 12345, ccAppliedTicks: 150 }));
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(rows.every((r) => r.label.length > 0 && r.value.length > 0)).toBe(true);
    expect(rows.find((r) => r.key === "damageDealt")?.value).toBe("12,345");
    expect(rows.find((r) => r.key === "cc")?.value).toBe("5s");
  });
});

describe("reflection hints (settle-hints)", () => {
  it("flags low skillshot accuracy with the coaching tip", () => {
    cover("settle-hints");
    const hints = reflectionHints(stats({ abilityHits: 1, abilityWhiffs: 9 }), "mage", "C");
    expect(hints.some((h) => h.tone === "tip" && h.text.includes("命中率偏低"))).toBe(true);
  });

  it("praises precise skillshots", () => {
    cover("settle-hints");
    const hints = reflectionHints(stats({ abilityHits: 9, abilityWhiffs: 1 }), "mage", "S");
    expect(hints.some((h) => h.tone === "praise" && h.text.includes("命中精準"))).toBe(true);
  });

  it("flags a high death count", () => {
    cover("settle-hints");
    const hints = reflectionHints(stats({ deaths: 8, kills: 1, assists: 2 }), "fighter", "C");
    expect(hints.some((h) => h.tone === "tip" && h.text.includes("陣亡次數偏高"))).toBe(true);
  });

  it("gives role-specific praise (support sustain) and caps the list", () => {
    cover("settle-hints");
    const hints = reflectionHints(
      stats({ healingDone: 5000, ccAppliedTicks: 300, flowersEaten: 4, multikills: 2 }),
      "support",
      "S",
    );
    expect(hints.some((h) => h.text.includes("治療量充沛"))).toBe(true);
    expect(hints.length).toBeLessThanOrEqual(3);
  });

  it("always returns at least one line (fallback on an empty statline)", () => {
    cover("settle-hints");
    expect(reflectionHints(stats(), "mage", "S").length).toBeGreaterThanOrEqual(1);
    expect(reflectionHints(stats(), "mage", "C").length).toBeGreaterThanOrEqual(1);
  });
});

describe("ranking table builder (settle-rank-table)", () => {
  it("sorts ascending by rank, ties broken by seatId, without mutating input", () => {
    cover("settle-rank-table");
    const input = [
      player({ seatId: 3, rank: 2 }),
      player({ seatId: 1, rank: 1 }),
      player({ seatId: 5, rank: 2 }),
      player({ seatId: 2, rank: 3 }),
    ];
    const snapshot = input.map((p) => p.seatId);
    const sorted = sortSettlementRanking(input);
    expect(sorted.map((p) => [p.rank, p.seatId])).toEqual([
      [1, 1],
      [2, 3],
      [2, 5],
      [3, 2],
    ]);
    expect(input.map((p) => p.seatId)).toEqual(snapshot); // pure
  });

  it("finds the local card by seat and resolves the winner flag", () => {
    cover("settle-rank-table");
    const players = [player({ seatId: 0, teamId: 0 }), player({ seatId: 4, teamId: 1 })];
    expect(localSettlementCard(players, 4)?.seatId).toBe(4);
    expect(localSettlementCard(players, 9)).toBeNull();
    expect(localSettlementCard(players, null)).toBeNull();
    expect(isWinner(1, 1)).toBe(true);
    expect(isWinner(1, 0)).toBe(false);
    expect(isWinner(-1, 0)).toBe(false); // undecided
  });
});

// ---------------------------------------------------------------------------
// task #139 — the champion-quote (名言) resolvers behind the two post-match beats
// ---------------------------------------------------------------------------

function settlement(over: Partial<MatchSettlement> = {}): MatchSettlement {
  return {
    matchId: "m1",
    winnerTeam: 0,
    perPlayer: [
      player({ seatId: 0, teamId: 0, champ: "godie-e008" }),
      player({ seatId: 1, teamId: 1, champ: "sela" }),
    ],
    ...over,
  };
}

/**
 * A round seat. Defaults: alive, a blank round (0 kills / 0 deaths) — so a test
 * that says nothing about performance exercises the pure-tiebreak path.
 */
function rseat(
  seatId: number,
  teamId: number,
  championId: string,
  over: Partial<RoundSeatView> = {},
): RoundSeatView {
  return { seatId, teamId, championId, alive: true, roundKills: 0, roundDeaths: 0, ...over };
}

/**
 * A round team. `roundOutcome` DEFAULTS TO NONE on purpose: every pre-#173 case
 * below therefore feeds an all-NONE board and exercises the selector's final
 * "no outcome information → pure standings" fallback, which is exactly the
 * legacy path that must not have moved. Defaulting it to WON instead would
 * silently rewrite what those 11 cases test.
 */
function rteam(teamId: number, over: Partial<RoundTeamView> = {}): RoundTeamView {
  return { teamId, lives: 3, eliminated: false, placement: 0, roundOutcome: ROUND_OUTCOME.NONE, ...over };
}

describe("moment 2 — local-win settlement quote (settle-win-quote)", () => {
  it("returns the LOCAL champion only when the local seat's team won", () => {
    cover("settle-win-quote");
    // local seat 0 is on team 0, which won → its champion speaks
    expect(localWinQuoteChampion(settlement({ winnerTeam: 0 }), 0)).toBe("godie-e008");
    // local seat 1 is on the LOSING team → silent (no other player's line here)
    expect(localWinQuoteChampion(settlement({ winnerTeam: 0 }), 1)).toBeNull();
  });

  it("is silent for a spectator / missing seat, an undecided winner, and no payload", () => {
    cover("settle-win-quote");
    expect(localWinQuoteChampion(settlement(), 9)).toBeNull(); // seat not in the board
    expect(localWinQuoteChampion(settlement(), null)).toBeNull(); // spectator
    expect(localWinQuoteChampion(settlement({ winnerTeam: -1 }), 0)).toBeNull(); // undecided
    expect(localWinQuoteChampion(null, 0)).toBeNull(); // payload not yet arrived
    expect(localWinQuoteChampion(settlement({ perPlayer: [] }), 0)).toBeNull(); // empty board
  });

  it("treats a winner with an empty champ id as nothing to say", () => {
    cover("settle-win-quote");
    const s = settlement({ perPlayer: [player({ seatId: 0, teamId: 0, champ: "" })] });
    expect(localWinQuoteChampion(s, 0)).toBeNull();
  });
});

describe("moment 3 — round-end rank-1 champion (settle-round-quote)", () => {
  it("picks the leading (most-lives) team, and within it a blank round falls to the lowest seat", () => {
    cover("settle-round-quote");
    const seats = [
      rseat(0, 0, "aaa"),
      rseat(1, 0, "bbb"), // same team, nothing to separate them → higher seatId loses
      rseat(2, 1, "ccc"),
    ];
    const teams = [rteam(0, { lives: 1 }), rteam(1, { lives: 3 })]; // team 1 leads
    expect(roundLeaderChampion(seats, teams)).toBe("ccc");
    // flip the lead → the other team's MVP wins
    expect(roundLeaderChampion(seats, [rteam(0, { lives: 3 }), rteam(1, { lives: 1 })])).toBe("aaa");
  });

  it("ranks alive teams above eliminated ones, ties on lives break to lower teamId", () => {
    cover("settle-round-quote");
    const seats = [rseat(0, 0, "aaa"), rseat(1, 1, "bbb"), rseat(2, 2, "ccc")];
    // team 2 has the most lives but is eliminated → an alive team leads
    const teams = [rteam(0, { lives: 2 }), rteam(1, { lives: 2 }), rteam(2, { lives: 9, eliminated: true, placement: 3 })];
    expect(roundLeaderChampion(seats, teams)).toBe("aaa"); // tie 2==2 → lower teamId 0
  });

  it("returns null when there are no teams/seats or the leader has no champion", () => {
    cover("settle-round-quote");
    expect(roundLeaderChampion([], [rteam(0)])).toBeNull();
    expect(roundLeaderChampion([rseat(0, 0, "aaa")], [])).toBeNull();
    // leader team's only seat has no champion locked in yet
    expect(roundLeaderChampion([rseat(0, 0, "")], [rteam(0)])).toBeNull();
  });

  it("matchDecided is true once ≤1 team is still alive", () => {
    cover("settle-round-quote");
    expect(matchDecided([rteam(0), rteam(1)])).toBe(false);
    expect(matchDecided([rteam(0), rteam(1, { eliminated: true })])).toBe(true);
    expect(matchDecided([rteam(0, { eliminated: true }), rteam(1, { eliminated: true })])).toBe(true);
  });

  it("roundEndQuoteChampion skips the match-deciding round, else names the leader", () => {
    cover("settle-round-quote");
    const seats = [rseat(0, 0, "aaa"), rseat(1, 1, "bbb")];
    // two teams alive → a real round-end: the leader speaks to everyone
    expect(roundEndQuoteChampion(seats, [rteam(0, { lives: 3 }), rteam(1, { lives: 1 })])).toBe("aaa");
    // the round that eliminates the penultimate team IS the match end → silent
    // here (moment 2's local-win quote owns that beat)
    expect(roundEndQuoteChampion(seats, [rteam(0, { lives: 3 }), rteam(1, { eliminated: true, placement: 2 })])).toBeNull();
  });
});

/**
 * The reported bug: 「我好像怎麼勝利都是結果都是放出黑崎一護的 3d model 勝利畫面?」 —
 * every round presented the SAME champion. The old selector took the leading
 * team's LOWEST-SEATID champion, and seat↔champion is fixed for a whole match,
 * so while one team kept the lead the presentation could not change. The winner
 * is now that ROUND's MVP: alive-gated, then ranked on the server-authoritative
 * per-round tallies.
 */
describe("round-end winner = the leading team's round MVP (settle-round-mvp)", () => {
  const leadingTeams = [rteam(0, { lives: 3 }), rteam(1, { lives: 1 })]; // team 0 leads

  it("presents the round's top killer, NOT the lowest-seat champion", () => {
    cover("settle-round-mvp");
    const seats = [
      rseat(2, 0, "ichigo", { roundKills: 0 }), // lowest seat: what the bug always showed
      rseat(7, 0, "luffy", { roundKills: 3 }), // actually carried the round
      rseat(3, 1, "enemy", { roundKills: 9 }), // losing team — never eligible
    ];
    expect(roundLeaderChampion(seats, leadingTeams)).toBe("luffy");
  });

  it("presents a DIFFERENT champion when a different teammate tops the next round", () => {
    cover("settle-round-mvp");
    // round N: seat 7 carries. round N+1: seat 2 carries. Same seats, same
    // standings — only the per-round tallies moved. This is the regression guard.
    const roundA = [rseat(2, 0, "ichigo", { roundKills: 0 }), rseat(7, 0, "luffy", { roundKills: 3 })];
    const roundB = [rseat(2, 0, "ichigo", { roundKills: 2 }), rseat(7, 0, "luffy", { roundKills: 1 })];
    expect(roundLeaderChampion(roundA, leadingTeams)).toBe("luffy");
    expect(roundLeaderChampion(roundB, leadingTeams)).toBe("ichigo");
    expect(roundLeaderChampion(roundA, leadingTeams)).not.toBe(roundLeaderChampion(roundB, leadingTeams));
  });

  it("is PER-ROUND: last round's hero is not re-presented on a round it did nothing in", () => {
    cover("settle-round-mvp");
    // the tallies are reset server-side at each combat entry, so a champion that
    // dominated round 1 arrives at round 2 with 0 — and loses to whoever scored.
    const round1 = [rseat(2, 0, "ichigo", { roundKills: 5 }), rseat(7, 0, "luffy", { roundKills: 0 })];
    const round2 = [rseat(2, 0, "ichigo", { roundKills: 0 }), rseat(7, 0, "luffy", { roundKills: 1 })];
    expect(roundLeaderChampion(round1, leadingTeams)).toBe("ichigo");
    expect(roundLeaderChampion(round2, leadingTeams)).toBe("luffy");
  });

  it("breaks a kill tie deterministically: fewest round-deaths, then lowest seatId", () => {
    cover("settle-round-mvp");
    // equal kills → the one who died less
    const byDeaths = [
      rseat(1, 0, "aaa", { roundKills: 2, roundDeaths: 1 }),
      rseat(5, 0, "bbb", { roundKills: 2, roundDeaths: 0 }),
    ];
    expect(roundLeaderChampion(byDeaths, leadingTeams)).toBe("bbb");
    // fully tied → the lowest seatId, and the answer never depends on input order
    const tied = [
      rseat(5, 0, "bbb", { roundKills: 2, roundDeaths: 0 }),
      rseat(1, 0, "aaa", { roundKills: 2, roundDeaths: 0 }),
      rseat(9, 0, "ccc", { roundKills: 2, roundDeaths: 0 }),
    ];
    expect(roundLeaderChampion(tied, leadingTeams)).toBe("aaa");
    expect(roundLeaderChampion([...tied].reverse(), leadingTeams)).toBe("aaa");
  });

  it("still resolves a champion in a round nobody scored a kill in", () => {
    cover("settle-round-mvp");
    // e.g. a fire-ring / timeout win: 0 kills all round → deaths, then seat
    const seats = [
      rseat(2, 0, "ichigo", { roundKills: 0, roundDeaths: 1 }),
      rseat(7, 0, "luffy", { roundKills: 0, roundDeaths: 0 }),
    ];
    expect(roundLeaderChampion(seats, leadingTeams)).toBe("luffy");
  });

  // ---- the alive GATE: 回合表現最好的人的底線門檻是必須最後還活著 ----

  it("gates on survival: a DEAD 3-kill seat loses to a LIVING 1-kill seat", () => {
    cover("settle-round-mvp");
    const seats = [
      rseat(2, 0, "ichigo", { roundKills: 3, roundDeaths: 1, alive: false }),
      rseat(7, 0, "luffy", { roundKills: 1, alive: true }),
    ];
    expect(roundLeaderChampion(seats, leadingTeams)).toBe("luffy");
  });

  it("never presents a dead top-killer while ANY teammate is still standing", () => {
    cover("settle-round-mvp");
    // the survivor did nothing at all — being alive is the baseline threshold
    const seats = [
      rseat(2, 0, "ichigo", { roundKills: 6, alive: false }),
      rseat(4, 0, "zoro", { roundKills: 4, alive: false }),
      rseat(7, 0, "luffy", { roundKills: 0, roundDeaths: 0, alive: true }),
    ];
    expect(roundLeaderChampion(seats, leadingTeams)).toBe("luffy");
  });

  it("a rescued champion (died, revived, standing) is eligible", () => {
    cover("settle-round-mvp");
    // #84 revive circle: roundDeaths > 0 yet alive at the end → still gated IN,
    // which is why the gate reads `alive` and not `roundDeaths === 0`.
    const seats = [
      rseat(2, 0, "ichigo", { roundKills: 3, roundDeaths: 1, alive: true }),
      rseat(7, 0, "luffy", { roundKills: 1, roundDeaths: 0, alive: true }),
    ];
    expect(roundLeaderChampion(seats, leadingTeams)).toBe("ichigo");
  });

  it("falls back to the best performer when the leading team was wiped too", () => {
    cover("settle-round-mvp");
    // mutual wipe / fire-ring: nobody on the leading team is alive → present the
    // round's best performer anyway rather than nothing at all.
    const seats = [
      rseat(2, 0, "ichigo", { roundKills: 1, alive: false }),
      rseat(7, 0, "luffy", { roundKills: 4, alive: false }),
    ];
    expect(roundLeaderChampion(seats, leadingTeams)).toBe("luffy");
  });

  it("keeps the winner MODEL and the round-end VO on the one selector", () => {
    cover("settle-round-mvp");
    const seats = [
      rseat(2, 0, "ichigo", { roundKills: 0 }),
      rseat(7, 0, "luffy", { roundKills: 3 }),
      rseat(3, 1, "enemy", { roundKills: 9 }),
    ];
    // the VO's champion IS the leader champion on any non-deciding round…
    expect(roundEndQuoteChampion(seats, leadingTeams)).toBe(roundLeaderChampion(seats, leadingTeams));
    // …and GameApp builds the centre-screen models from that same call. Since
    // 2026-07-27 the stage shows the whole winning TEAM (owner:「勝利的時候應該
    // 秀隊伍三人的模組」), so GameApp calls roundWinnerTeamChampions — which is
    // itself built ON TOP of roundEndQuoteChampion and returns it at [0]. The
    // linkage this test protects is unchanged and is asserted directly below,
    // in code rather than by regex: MVP === the VO's champion === team[0].
    expect(roundWinnerTeamChampions(seats, leadingTeams)[0]).toBe(
      roundEndQuoteChampion(seats, leadingTeams),
    );
    // …and that SAME champion is handed to the stage as the taunt context.
    // Without it the stage's `if (!champ) return` silently drops the whole
    // 嘲諷台詞 half of #93 — selector and presentation wired but not connected.
    //
    // ⚠️ This USED to be three `expect(GameApp.ts).toMatch(/…/)` regexes —
    // 失敗形態 ⑥ (掃字串代替行為) in its textbook form: it went red the moment
    // GH#257 legitimately changed that call site, while the actual defect it
    // claimed to guard (the taunt losing its champion) would have sailed past
    // any of the wordings it did not happen to spell out. The presentation was
    // extracted into `planRoundWinnerShow` precisely so this can be exercised —
    // the SAME function `GameApp.updateRoundWinner` calls, run for real here.
    // GH#265: 這幾條驗的是「嘲諷屬於誰」,不是「哪一區贏」,所以權威來源留空 ——
    // 空的 `duels` 就是「這一份快照沒帶配對」,函式照舊走推導路徑。
    const plan = planRoundWinnerShow(seats, leadingTeams, 5, () => WINNER_DOC, NO_DUELS);
    expect(plan).not.toBeNull();
    expect(plan!.ctx.championId).toBe(roundEndQuoteChampion(seats, leadingTeams));
    expect(plan!.ctx.round).toBe(5);
    // and it stays the MVP even when the gold crown is SOMEBODY ELSE (GH#257):
    // the taunt is keyed championId+round on every client, so re-keying it off
    // the podium would silently change which joke the whole lobby hears.
    const settled = [
      rteam(0, { lives: 3, roundOutcome: ROUND_OUTCOME.WON }),
      rteam(1, { lives: 1, roundOutcome: ROUND_OUTCOME.LOST }),
    ];
    const crowned = [
      { ...rseat(2, 0, "ichigo", { roundKills: 0, alive: false }), roundDeathTick: 900 },
      { ...rseat(7, 0, "luffy", { roundKills: 3, alive: false }), roundDeathTick: 100 },
      { ...rseat(3, 1, "enemy", { roundKills: 9, alive: false }), roundDeathTick: 50 },
    ];
    const crownedPlan = planRoundWinnerShow(crowned, settled, 5, () => WINNER_DOC, NO_DUELS);
    expect(crownedPlan!.members[0]!.championId).toBe("ichigo"); // 金冠 = 活最久
    expect(crownedPlan!.members[0]!.medal).toBe("gold");
    expect(crownedPlan!.ctx.championId).toBe("luffy"); // 嘲諷 = 回合 MVP
  });
});

/**
 * settle-round-bye — the #173 residual of the fix above. With 3 alive teams the
 * round format hands one team a BYE, and enterCombat parks every seat of it dead
 * without ever emitting a death: alive:false, roundKills:0, roundDeaths:0 on
 * every seat. If that team happens to lead the standings, the old selector chose
 * it, found no survivors, opened the gate to an all-zero roster and fell back to
 * the lowest seatId — i.e. 「每回合都是同一個英雄」 came straight back for that
 * round. The cure is the server-authoritative TeamState.roundOutcome: prefer a
 * team that actually WON a duel, then any team that FOUGHT, then (only when no
 * outcome is known at all) everyone.
 */
describe("a bye leader never wins the round presentation (settle-round-bye)", () => {
  it("skips the standings leader that sat the round out", () => {
    cover("settle-round-bye");
    const teams = [
      rteam(0, { lives: 3, roundOutcome: ROUND_OUTCOME.NONE }), // BYE — leads on lives
      rteam(1, { lives: 2, roundOutcome: ROUND_OUTCOME.WON }),
      rteam(2, { lives: 1, roundOutcome: ROUND_OUTCOME.LOST }),
    ];
    const seats = [
      // the parked bye roster — the exact fingerprint of the bug
      rseat(0, 0, "bye-low", { alive: false }),
      rseat(1, 0, "bye-mid", { alive: false }),
      rseat(2, 0, "bye-high", { alive: false }),
      // the team that actually won its duel
      rseat(3, 1, "carry", { roundKills: 2, alive: true }),
      rseat(4, 1, "support", { roundKills: 0, alive: true }),
      // the team that lost it
      rseat(6, 2, "loser", { roundKills: 1, alive: false }),
    ];
    expect(roundLeaderChampion(seats, teams)).toBe("carry");
    expect(roundLeaderChampion(seats, teams)).not.toBe("bye-low"); // the old answer
  });

  it("prefers a participant even when the bye team has living, scoring seats", () => {
    cover("settle-round-bye");
    // belt-and-braces: participation is decided by roundOutcome, never inferred
    // from alive/K-D — a snapshot where the bye roster still reads alive (e.g.
    // read a tick before the parking lands) must not flip the answer.
    const teams = [rteam(0, { lives: 3 }), rteam(1, { lives: 1, roundOutcome: ROUND_OUTCOME.WON })];
    const seats = [
      rseat(0, 0, "bye-hero", { roundKills: 9, alive: true }),
      rseat(3, 1, "fighter", { roundKills: 0, alive: true }),
    ];
    expect(roundLeaderChampion(seats, teams)).toBe("fighter");
  });

  it("never presents the round's LOSER, even when it still out-standings the winner", () => {
    cover("settle-round-bye");
    // settleRound has ALREADY deducted the loser's lives by the time the client
    // reads this, and the loser can still be ahead (3→2 beats 1). Standings
    // alone would celebrate the team that just lost its duel.
    const teams = [
      rteam(0, { lives: 2, roundOutcome: ROUND_OUTCOME.LOST }),
      rteam(1, { lives: 1, roundOutcome: ROUND_OUTCOME.WON }),
    ];
    const seats = [
      rseat(0, 0, "beaten", { roundKills: 5, alive: true }),
      rseat(3, 1, "victor", { roundKills: 1, alive: true }),
    ];
    expect(roundLeaderChampion(seats, teams)).toBe("victor");
  });

  it("picks the better-standing winner when a 4-team round has two duels", () => {
    cover("settle-round-bye");
    const teams = [
      rteam(0, { lives: 1, roundOutcome: ROUND_OUTCOME.WON }),
      rteam(1, { lives: 3, roundOutcome: ROUND_OUTCOME.WON }),
      rteam(2, { lives: 1, roundOutcome: ROUND_OUTCOME.LOST }),
      rteam(3, { lives: 1, roundOutcome: ROUND_OUTCOME.LOST }),
    ];
    const seats = [
      rseat(0, 0, "winner-a", { roundKills: 3, alive: true }),
      rseat(3, 1, "winner-b", { roundKills: 0, alive: true }),
    ];
    expect(roundLeaderChampion(seats, teams)).toBe("winner-b");
  });

  it("falls back to any PARTICIPANT when the duel is unresolved (fault path)", () => {
    cover("settle-round-bye");
    // forceAdvanceOnFault skips settleRound, so both duelists stay FOUGHT and no
    // team is WON. The bye team must still be excluded.
    const teams = [
      rteam(0, { lives: 3, roundOutcome: ROUND_OUTCOME.NONE }), // bye
      rteam(1, { lives: 2, roundOutcome: ROUND_OUTCOME.FOUGHT }),
      rteam(2, { lives: 2, roundOutcome: ROUND_OUTCOME.FOUGHT }),
    ];
    const seats = [
      rseat(0, 0, "bye-low", { alive: false }),
      rseat(3, 1, "fought-a", { roundKills: 1, alive: true }),
      rseat(6, 2, "fought-b", { roundKills: 4, alive: true }),
    ];
    // team 1 and 2 are level on lives → the lower teamId leads; its MVP speaks
    expect(roundLeaderChampion(seats, teams)).toBe("fought-a");
  });

  it("is byte-identical to the pure-standings answer when NO outcome is known", () => {
    cover("settle-round-bye");
    // pre-combat / legacy / un-projected snapshots are all-NONE. The ladder ends
    // at `teams`, so the answer must be exactly what it was before this stage.
    const teams = [rteam(0, { lives: 3 }), rteam(1, { lives: 1 })];
    const seats = [
      rseat(2, 0, "ichigo", { roundKills: 0 }),
      rseat(7, 0, "luffy", { roundKills: 3 }),
      rseat(3, 1, "enemy", { roundKills: 9 }),
    ];
    expect(roundLeaderChampion(seats, teams)).toBe("luffy");
  });

  it("still never returns null for a non-empty board", () => {
    cover("settle-round-bye");
    // the whole board sat out (all-NONE, everyone parked) → the presentation
    // must still have a hero rather than silently showing nothing.
    const teams = [rteam(0, { lives: 3 })];
    const seats = [rseat(5, 0, "solo", { alive: false })];
    expect(roundLeaderChampion(seats, teams)).toBe("solo");
    // …and the VO rides the same selector on a non-deciding round
    const twoTeams = [rteam(0, { lives: 3, roundOutcome: ROUND_OUTCOME.WON }), rteam(1, { lives: 1 })];
    expect(roundEndQuoteChampion(seats, twoTeams)).toBe(roundLeaderChampion(seats, twoTeams));
  });

  /**
   * The 16 legacy cases above default roundOutcome to NONE, so they all resolve
   * through the ladder's THIRD rung. At a REAL settled round end at least two
   * teams are WON/LOST, so none of them exercises the rung production takes.
   * These mirror the four ranking-shape cases onto the WON path, so the GATE
   * and RANK stages are proven where they actually run.
   */
  describe("the same GATE and RANK on the path production takes", () => {
    /** a settled 2-duel board: `won` leads, everyone else LOST. */
    const settled = (): RoundTeamView[] => [
      rteam(0, { lives: 3, roundOutcome: ROUND_OUTCOME.WON }),
      rteam(1, { lives: 2, roundOutcome: ROUND_OUTCOME.LOST }),
      rteam(2, { lives: 2, roundOutcome: ROUND_OUTCOME.LOST }),
    ];

    it("ALIVE GATE: a dead top-scorer loses to a living teammate", () => {
      cover("settle-round-mvp");
      const seats = [
        rseat(0, 0, "dead-ace", { roundKills: 5, alive: false }),
        rseat(1, 0, "survivor", { roundKills: 1, alive: true }),
        rseat(9, 1, "enemy", { roundKills: 9, alive: true }),
      ];
      expect(roundLeaderChampion(seats, settled())).toBe("survivor");
    });

    it("DEATHS TIEBREAK: level on kills, the one who died less presents", () => {
      cover("settle-round-mvp");
      const seats = [
        rseat(0, 0, "traded", { roundKills: 2, roundDeaths: 2, alive: true }),
        rseat(1, 0, "clean", { roundKills: 2, roundDeaths: 0, alive: true }),
      ];
      expect(roundLeaderChampion(seats, settled())).toBe("clean");
    });

    it("SEAT TIEBREAK: a blank round on the winning team falls to the lowest seat", () => {
      cover("settle-round-mvp");
      const seats = [
        rseat(2, 0, "low", { alive: true }),
        rseat(5, 0, "high", { alive: true }),
      ];
      expect(roundLeaderChampion(seats, settled())).toBe("low");
    });

    it("WIPED WINNER: a timeout/mutual-wipe win still presents its best corpse", () => {
      cover("settle-round-mvp");
      const seats = [
        rseat(0, 0, "corpse-a", { roundKills: 1, alive: false }),
        rseat(1, 0, "corpse-b", { roundKills: 3, alive: false }),
      ];
      expect(roundLeaderChampion(seats, settled())).toBe("corpse-b");
    });

    it("never blanks the beat when the top candidate has no champion locked in", () => {
      cover("settle-round-bye");
      // the #130 shape (a seat that never locked one) / a seat list that has not
      // caught up with the team list. Indexing the ranking at [0] and giving up
      // silenced the WHOLE presentation even though three teams had champions.
      const seats = [
        rseat(0, 0, "", { alive: true }), // winning team, nothing locked in
        rseat(1, 0, "", { alive: true }),
        rseat(3, 1, "runner-up", { alive: true }),
      ];
      expect(roundLeaderChampion(seats, settled())).toBe("runner-up");
      // null still means what it should: no champion ANYWHERE
      expect(roundLeaderChampion([rseat(0, 0, "", {})], settled())).toBeNull();
    });

    it("counts participation by MEMBERSHIP, so a malformed outcome is not a participant", () => {
      cover("settle-round-bye");
      // `!== NONE` also accepts undefined / out-of-range, which would classify a
      // bye team as a fighter — the exact bug this signal exists to prevent.
      const teams = [
        { teamId: 0, lives: 3, eliminated: false, placement: 0 } as unknown as RoundTeamView,
        rteam(1, { lives: 1, roundOutcome: ROUND_OUTCOME.WON }),
      ];
      const seats = [
        rseat(0, 0, "malformed", { roundKills: 9, alive: true }),
        rseat(3, 1, "real-winner", { alive: true }),
      ];
      expect(roundLeaderChampion(seats, teams)).toBe("real-winner");
    });
  });
});
