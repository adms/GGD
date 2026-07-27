/**
 * progressChart — the PURE model behind 結算畫面's 「查看戰績變化」 panel
 * (owner, 2026-07-27: 「改成看自己+隊友每回合戰績變化（RANK + 傷害 + 殭屍數
 * 折線圖）並給出玩法的進步建議，而非回到排行榜」).
 *
 * No React, no DOM, no store: scoring and coaching are decidable in the node
 * vitest env, which is the point — a chart nobody can feed numbers to is a
 * chart nobody can prove is honest.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 1. WHAT 「RANK」 MEANS HERE  (owner ruling, 2026-07-27)
 * ═══════════════════════════════════════════════════════════════════════════
 * The chart's RANK axis is the player's PER-ROUND MVP PLACEMENT among all 12
 * players in the match, 1..12 with 1 best. It is deliberately NOT:
 *   · the TEAM's placement that round (3 teams share one number — a chart of it
 *     says nothing about the individual), nor
 *   · the ranked-ladder rating (that lives on the lobby leaderboard, which is
 *     exactly the screen this panel exists to STOP navigating to).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 2. THE MVP FORMULA — AND WHY THE PREVIOUS ONE WAS BROKEN
 * ═══════════════════════════════════════════════════════════════════════════
 * The formula #280 shipped was:
 *
 *     存活HP比例 × 3000  +  對英雄傷害 × 7
 *
 * The owner's stated intent was 「讓活下來的人有比較高的權重」. That formula does
 * the OPPOSITE. Surviving at full HP is worth 3000; 3000/7 ≈ 428 damage buys the
 * same score, and 428 damage is roughly one or two basic attacks. So a player who
 * died having landed three autos outscored a player who finished the round
 * untouched. DO NOT REINSTATE IT.
 *
 * It also had a second, deeper problem the replacement is shaped around: it
 * scored RAW MAGNITUDES. This game's magnitudes move by an order of magnitude
 * across a match — Lv3 → Lv50, zombie waves 15 → 50 → 0 (#215's round-10 clean
 * final has none at all), inventory empty → six slots. Coefficients tuned on
 * round 3 are guaranteed to be wrong by round 9.
 *
 * So EVERY magnitude term below is a SHARE: the player's value divided by the
 * sum over all 12 players IN THAT ROUND. A share is unit-free and self-scaling,
 * so one weight table is correct in every round of every match. Round 10's zero
 * zombies need no special case at all: the denominator is 0, {@link share}
 * returns 0 for everyone, and the term simply drops out. **A zero denominator
 * must never produce NaN** — one NaN poisons a sort and silently scrambles the
 * whole ranking.
 *
 *     MVP = 生存 + 輸出 + 承擔 + 支援 + 戰功 − 代價
 *
 *     生存 = 存活HP比例(0~1) × 200  +  存活時間佔比 × 100
 *     輸出 = 對英雄傷害佔比 × 250
 *     承擔 = (damageTaken + damageBlocked) 佔比 × 150
 *     支援 = healingDone佔比 × 80  +  ccAppliedTicks佔比 × 40  +  revivesPerformed × 300
 *     戰功 = kills × 60  +  assists × 25  +  殭屍擊倒佔比 × 60
 *     代價 = deaths × 80
 *
 * PER-TERM REASONING (owner-specified where noted):
 *
 *  · 生存 is TWO terms, not one. HP% rewards walking away untouched. Time-alive
 *    share rewards lasting in a fight you could not walk away from — round 10 is
 *    a 12-player royale where 9 people are GOING to die, and only the time term
 *    can separate the man who lasted 8 seconds from the man who lasted 80.
 *  · 承擔 (tank) and 支援 (support) are NEW. Of 114 champions, two whole role
 *    families scored permanently last under the old formula: soaking damage and
 *    healing allies produced literally zero points.
 *  · 復活隊友 × 300 is the owner's OWN number (the proposal was 30):
 *    「復活隊友是一個風險及樂趣很高的指標」. One revive is worth more than
 *    surviving the round at full health. That is deliberate, not a typo.
 *  · 殭屍 uses a SHARE so round 9's 50 zombies cannot drown out round 3's 15.
 *  · deaths cost only 80 because a death is ALREADY punished by the 300 points
 *    of 生存 it forfeits; charging more is double-counting. The 80 that remains
 *    is what keeps a revive (#84) a RESCUE rather than a freebie — a revived
 *    player's HP and survival score come back, but the 80 does not, so a round
 *    you died in still reads differently from one you did not.
 *
 * KNOWN AND ACCEPTED (owner, 2026-07-27): `damageTaken` is not filtered by
 * attacker type, so zombie damage counts toward 承擔 in rounds 8–9. 扛殭屍 is
 * work too, and because the term is a share it cannot inflate the total. Do not
 * "fix" this by splitting it.
 *
 * NOT SCORED, ON PURPOSE: 技能命中率 and 未花費金錢 feed {@link progressAdvice}
 * only. Scoring them would push players to farm the metric (whiff-avoidance by
 * never casting; hoarding gold to look thrifty); coaching on them quotes a real
 * number AND names a concrete action.
 */
import type { RoundStatDelta, RoundStatsEntry } from "@ggd/shared/protocol/messages";
import type { PlayerMatchStats } from "@ggd/shared/sim/stats/matchStats";
import { TICK_HZ } from "@ggd/shared/constants";
import { ITEM_TIER_PRICE } from "@ggd/shared/sim/economy/itemTiers";

// ───────────────────────────────────────────────────────────────── shares ──

/**
 * `value / total`, and **0 when the total is 0** — never NaN, never Infinity.
 *
 * This is the single most load-bearing line in the file. Round 10 ships with
 * `mobsPerWaveCap: 0` (#215's 乾淨總決賽), so the zombie denominator is exactly
 * 0 for all 12 players; a bare division would make every MVP score NaN, and
 * `NaN` compares false against everything, so `Array.sort` would leave the
 * ranking in arbitrary order while looking like it worked. Same for the healing
 * denominator in any round nobody healed.
 */
export function share(value: number, total: number): number {
  if (!(total > 0)) return 0;
  const r = value / total;
  return Number.isFinite(r) ? r : 0;
}

/** Weights of the MVP formula. Exported so tests state the same numbers once. */
export const MVP_WEIGHTS = {
  /** 存活HP比例 (a LEVEL in 0..1, already normalised — no share needed) */
  hpRatio: 200,
  /** 存活時間佔比 */
  timeAlive: 100,
  /** 對英雄傷害佔比 */
  damageDealt: 250,
  /** (damageTaken + damageBlocked) 佔比 */
  soak: 150,
  /** healingDone 佔比 */
  healing: 80,
  /** ccAppliedTicks 佔比 */
  cc: 40,
  /** FLAT per revive — owner-specified 300, not a share (see module doc) */
  revive: 300,
  /** FLAT per champion kill */
  kill: 60,
  /** FLAT per assist */
  assist: 25,
  /** 殭屍擊倒佔比 */
  mobKills: 60,
  /** FLAT penalty per death */
  death: 80,
} as const;

/** Per-round denominators: the sum over ALL 12 players of each shared axis. */
export interface RoundTotals {
  timeAliveTicks: number;
  damageDealt: number;
  soak: number;
  healingDone: number;
  ccAppliedTicks: number;
  mobKills: number;
}

/** Sum every shared axis across the round's whole 12-player field. */
export function roundTotals(players: readonly RoundStatDelta[]): RoundTotals {
  const t: RoundTotals = {
    timeAliveTicks: 0,
    damageDealt: 0,
    soak: 0,
    healingDone: 0,
    ccAppliedTicks: 0,
    mobKills: 0,
  };
  for (const p of players) {
    t.timeAliveTicks += p.timeAliveTicks;
    t.damageDealt += p.damageDealt;
    t.soak += p.damageTaken + p.damageBlocked;
    t.healingDone += p.healingDone;
    t.ccAppliedTicks += p.ccAppliedTicks;
    t.mobKills += p.mobKills;
  }
  return t;
}

/** One player's MVP score for one round. See the module doc for every term. */
export function mvpScore(p: RoundStatDelta, totals: RoundTotals): number {
  const w = MVP_WEIGHTS;
  const survival = p.hpRatio * w.hpRatio + share(p.timeAliveTicks, totals.timeAliveTicks) * w.timeAlive;
  const output = share(p.damageDealt, totals.damageDealt) * w.damageDealt;
  const soak = share(p.damageTaken + p.damageBlocked, totals.soak) * w.soak;
  const support =
    share(p.healingDone, totals.healingDone) * w.healing +
    share(p.ccAppliedTicks, totals.ccAppliedTicks) * w.cc +
    p.revivesPerformed * w.revive;
  const merit = p.kills * w.kill + p.assists * w.assist + share(p.mobKills, totals.mobKills) * w.mobKills;
  const cost = p.deaths * w.death;
  return survival + output + soak + support + merit - cost;
}

/**
 * Every non-BYE player's MVP placement for one round: seatId → 1..N, 1 = best.
 *
 * BYE seats are OMITTED, never ranked last. A team that drew the bye did not
 * play; enterCombat parks its seats dead with an all-zero tally, so scoring
 * them would put them at the bottom of a round they were not in — a chart that
 * says 「你第 8 回合掉到第 12 名」 about a round the player sat out is simply a
 * lie, and #173 is the bug that proved the two states are otherwise identical
 * on the wire.
 *
 * Ties break on seatId ascending, so the order is total and every client that
 * receives the same payload draws the same chart.
 */
export function roundMvpRanks(players: readonly RoundStatDelta[]): Map<number, number> {
  const totals = roundTotals(players);
  const scored = players
    .filter((p) => !p.bye)
    .map((p) => ({ seatId: p.seatId, score: mvpScore(p, totals) }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.seatId - b.seatId));
  const out = new Map<number, number>();
  scored.forEach((s, i) => out.set(s.seatId, i + 1));
  return out;
}

// ─────────────────────────────────────────────────────────────── the series ──

/** One plotted point. `value === null` ⇒ the player was not in this round (BYE). */
export interface ChartPoint {
  round: number;
  value: number | null;
}

/** One player's line across the whole match. */
export interface SeriesLine {
  seatId: number;
  /** true for the signed-in player — the component draws this one loudest */
  isLocal: boolean;
  points: ChartPoint[];
}

/** The three charts the owner asked for, plus the round axis they share. */
export interface ProgressSeries {
  /** x-axis: the settled round numbers, ascending */
  rounds: number[];
  /** MVP placement 1..12 (1 is best — the component inverts the y-axis) */
  rank: SeriesLine[];
  /** damage to enemy CHAMPIONS, per round */
  damage: SeriesLine[];
  /** zombies (#215) put down, per round */
  mobKills: SeriesLine[];
  /** how many players the rank axis can hold (the 1..N of the deepest round) */
  maxRank: number;
}

/** Fixed axis depth: a full lobby is 12 players, so RANK runs 1..12. */
export const RANK_AXIS_MAX = 12;

/**
 * Build all three series for the local player and their two teammates.
 *
 * `seatIds` is the whole TEAM (including the local seat) — the owner asked for
 * 「自己 + 隊友（同隊三人）都要在圖上」. Scoring, though, always ranks against
 * ALL 12 players in the round: a placement among your own three teammates would
 * be a different (and much less interesting) number.
 */
export function buildProgressSeries(
  rounds: readonly RoundStatsEntry[],
  seatIds: readonly number[],
  localSeatId: number | null,
): ProgressSeries {
  const roundNums = rounds.map((r) => r.round);
  const ranksPerRound = rounds.map((r) => roundMvpRanks(r.players));
  let maxRank = 0;
  for (const m of ranksPerRound) for (const v of m.values()) if (v > maxRank) maxRank = v;

  const line = (
    seatId: number,
    pick: (p: RoundStatDelta, roundIdx: number) => number | null,
  ): SeriesLine => ({
    seatId,
    isLocal: localSeatId !== null && seatId === localSeatId,
    points: rounds.map((r, i) => {
      const p = r.players.find((x) => x.seatId === seatId);
      // absent seat OR a bye round ⇒ a HOLE in the line, not a zero. Plotting 0
      // damage for a round the player never fought reads as "you did nothing",
      // which is a different claim from "you were not there".
      if (!p || p.bye) return { round: r.round, value: null };
      return { round: r.round, value: pick(p, i) };
    }),
  });

  return {
    rounds: roundNums,
    rank: seatIds.map((s) => line(s, (p, i) => ranksPerRound[i]?.get(p.seatId) ?? null)),
    damage: seatIds.map((s) => line(s, (p) => p.damageDealt)),
    mobKills: seatIds.map((s) => line(s, (p) => p.mobKills)),
    maxRank: Math.max(maxRank, RANK_AXIS_MAX),
  };
}

// ──────────────────────────────────────────────────────────────── the advice ──

export interface ProgressAdvice {
  key: string;
  tone: "praise" | "tip";
  /** the 中文 line shown to the player — ALWAYS contains at least one figure */
  text: string;
  /**
   * `field=value` pairs this line was derived from.
   *
   * Not decoration, and not optional. `progressChart.test.ts` asserts for every
   * line every branch can emit that (i) evidence is non-empty and (ii) EVERY
   * number printed in `text` appears among these values. That turns 「建議不能
   * 變成罐頭字串」 into a property the suite checks: a canned line has no number
   * to point at, so it cannot be written here at all.
   */
  evidence: string;
}

/** Cap, mirroring settlementModel.MAX_REFLECTION_HINTS so the cards read alike. */
export const MAX_PROGRESS_ADVICE = 4;

export interface ProgressAdviceInput {
  /** the whole per-round history, oldest first */
  rounds: readonly RoundStatsEntry[];
  localSeatId: number;
  /** the local player's TEAM seat ids (including their own) */
  teamSeatIds: readonly number[];
  /** whole-match scoreboard for the local player (accuracy lives here) */
  stats: PlayerMatchStats;
  /** the local seat's UNSPENT gold balance at match end (SeatView.gold) */
  goldLeft: number;
}

/**
 * Inclusive round range, as BOTH the 中文 label 「第 3-5 回合」 and the bare
 * `3-5` token that goes into `evidence`.
 *
 * The two are returned together deliberately. The evidence guard checks every
 * digit printed in `text`, and the round numbers in a label like 「第 3-6 回合」
 * are digits — so a label whose range is not also cited fails the check. That
 * is correct behaviour, not test friction: 「第 3-6 回合」 is a claim about which
 * rounds the advice looked at, and it has to be checkable like any other figure.
 */
function roundRange(nums: readonly number[]): { label: string; token: string } {
  if (nums.length === 0) return { label: "", token: "" };
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return lo === hi
    ? { label: `第 ${lo} 回合`, token: `${lo}` }
    : { label: `第 ${lo}-${hi} 回合`, token: `${lo}-${hi}` };
}

function sumOver(
  rounds: readonly RoundStatsEntry[],
  seatId: number,
  only: (r: RoundStatsEntry) => boolean,
  pick: (p: RoundStatDelta) => number,
): number {
  let n = 0;
  for (const r of rounds) {
    if (!only(r)) continue;
    const p = r.players.find((x) => x.seatId === seatId);
    if (!p || p.bye) continue;
    n += pick(p);
  }
  return n;
}

/**
 * Coaching lines derived from the per-round history — 「從數據推出來的具體話，
 * 不是罐頭」. Every branch below quotes a figure it computed AND names an action.
 *
 * Ordered by how much the player can do about it: the zombie/econ lines point at
 * a habit that is changeable next match, the trend line explains what the chart
 * above already shows, and praise comes last so it never displaces a fixable
 * problem. Capped at {@link MAX_PROGRESS_ADVICE}.
 */
export function progressAdvice(input: ProgressAdviceInput): ProgressAdvice[] {
  const { rounds, localSeatId, teamSeatIds, stats, goldLeft } = input;
  const out: ProgressAdvice[] = [];
  const mates = teamSeatIds.filter((s) => s !== localSeatId);

  // ── 殭屍: the rounds that actually HAD zombies, and who farmed them ────────
  // #215 schedules zombies from round 3 and switches them off entirely in round
  // 10, so "which rounds had zombies" is a property of the data, never a
  // constant to hard-code here.
  const mobRounds = rounds.filter((r) => r.players.some((p) => p.mobKills > 0));
  if (mobRounds.length > 0 && mates.length > 0) {
    const inMob = (r: RoundStatsEntry): boolean => mobRounds.includes(r);
    const mine = sumOver(rounds, localSeatId, inMob, (p) => p.mobKills);
    const mateTotals = mates.map((s) => sumOver(rounds, s, inMob, (p) => p.mobKills));
    const best = Math.max(...mateTotals);
    const range = roundRange(mobRounds.map((r) => r.round));
    if (mine < best) {
      out.push({
        key: "mob-low",
        tone: "tip",
        text: `你在${range.label}只打倒 ${mine} 隻殭屍，隊友最多打了 ${best} 隻 —— 那幾回合殭屍最多，多清幾隻能更快升級也更快湊裝`,
        evidence: `mobRounds=${range.token},myMobKills=${mine},bestMateMobKills=${best}`,
      });
    } else if (mine > best) {
      out.push({
        key: "mob-high",
        tone: "praise",
        text: `${range.label}你清掉 ${mine} 隻殭屍，全隊最多（隊友最多 ${best} 隻）—— 等級和金錢的領先就是這樣來的`,
        evidence: `mobRounds=${range.token},myMobKills=${mine},bestMateMobKills=${best}`,
      });
    }
  }

  // ── MVP 排名走勢: first third vs last third of the rounds actually played ──
  const myRanks: { round: number; rank: number }[] = [];
  for (const r of rounds) {
    const rank = roundMvpRanks(r.players).get(localSeatId);
    if (rank !== undefined) myRanks.push({ round: r.round, rank });
  }
  if (myRanks.length >= 4) {
    const cut = Math.max(1, Math.floor(myRanks.length / 3));
    const early = myRanks.slice(0, cut);
    const late = myRanks.slice(-cut);
    const avg = (xs: { rank: number }[]): number =>
      Math.round((xs.reduce((a, x) => a + x.rank, 0) / xs.length) * 10) / 10;
    const e = avg(early);
    const l = avg(late);
    const eR = roundRange(early.map((x) => x.round));
    const lR = roundRange(late.map((x) => x.round));
    // MAX_LEVEL is quoted in the slide line, so it is cited like any other
    // figure rather than typed as prose.
    const maxLevel = 50;
    if (l - e >= 1.5) {
      out.push({
        key: "rank-slide",
        tone: "tip",
        text: `你的 MVP 排名從${eR.label}的平均 ${e} 名掉到${lR.label}的 ${l} 名 —— 後段每個人都上到 ${maxLevel} 級，前期的裝備差距會被放大，中場記得把錢花完`,
        evidence: `earlyRounds=${eR.token},lateRounds=${lR.token},earlyAvgRank=${e},lateAvgRank=${l},maxLevel=${maxLevel}`,
      });
    } else if (e - l >= 1.5) {
      out.push({
        key: "rank-climb",
        tone: "praise",
        text: `你的 MVP 排名從${eR.label}的平均 ${e} 名爬到${lR.label}的 ${l} 名 —— 愈打愈強，這套養成節奏是對的`,
        evidence: `earlyRounds=${eR.token},lateRounds=${lR.token},earlyAvgRank=${e},lateAvgRank=${l}`,
      });
    }
  }

  // ── 技能命中率 (NOT scored — see the module doc) ───────────────────────────
  const shots = stats.abilityHits + stats.abilityWhiffs;
  if (shots >= 6) {
    const acc = Math.round((stats.abilityHits / shots) * 100);
    if (acc < 45) {
      out.push({
        key: "accuracy-low",
        tone: "tip",
        text: `技能命中率只有 ${acc}%（${stats.abilityHits}/${shots} 發）—— 按住 Q 會出現範圍預告圈，先瞄準再放，或等敵人被控住再出手`,
        evidence: `accuracyPct=${acc},abilityHits=${stats.abilityHits},shots=${shots}`,
      });
    } else if (acc >= 70) {
      out.push({
        key: "accuracy-high",
        tone: "praise",
        text: `技能命中率 ${acc}%（${stats.abilityHits}/${shots} 發），幾乎不浪費 —— 繼續用範圍預告圈抓時機`,
        evidence: `accuracyPct=${acc},abilityHits=${stats.abilityHits},shots=${shots}`,
      });
    }
  }

  // ── 沒花完的錢 (NOT scored) ────────────────────────────────────────────────
  if (goldLeft >= ITEM_TIER_PRICE.POWERFUL) {
    const items = Math.floor(goldLeft / ITEM_TIER_PRICE.POWERFUL);
    out.push({
      key: "unspent-gold",
      tone: "tip",
      text: `你結束時還有 ${goldLeft} 金沒花，那是 ${items} 件 ${ITEM_TIER_PRICE.POWERFUL} 金的強力道具 —— 中場商店把錢花完再開打`,
      evidence: `goldLeft=${goldLeft},affordablePowerful=${items},powerfulPrice=${ITEM_TIER_PRICE.POWERFUL}`,
    });
  }

  // ── 陣亡集中在哪一回合 ─────────────────────────────────────────────────────
  let worst: { round: number; deaths: number } | null = null;
  for (const r of rounds) {
    const p = r.players.find((x) => x.seatId === localSeatId);
    if (!p || p.bye) continue;
    if (!worst || p.deaths > worst.deaths) worst = { round: r.round, deaths: p.deaths };
  }
  if (worst && worst.deaths >= 2) {
    out.push({
      key: "death-spike",
      tone: "tip",
      text: `第 ${worst.round} 回合你一場就陣亡 ${worst.deaths} 次 —— 那一回合的站位值得重看，每次陣亡直接扣 ${MVP_WEIGHTS.death} 分 MVP`,
      evidence: `worstRound=${worst.round},deaths=${worst.deaths},deathPenalty=${MVP_WEIGHTS.death}`,
    });
  }

  // ── 復活隊友 (owner's 300-point axis) ──────────────────────────────────────
  const revives = rounds.reduce(
    (a, r) => a + (r.players.find((x) => x.seatId === localSeatId)?.revivesPerformed ?? 0),
    0,
  );
  if (revives > 0) {
    out.push({
      key: "revives",
      tone: "praise",
      text: `你救起隊友 ${revives} 次 —— 這是 MVP 分裡最重的單項（每次 ${MVP_WEIGHTS.revive} 分），比滿血活到最後還值錢`,
      evidence: `revivesPerformed=${revives},revivePoints=${MVP_WEIGHTS.revive}`,
    });
  }

  // ── 撐場時間 (the round-10 royale axis) ────────────────────────────────────
  const last = rounds[rounds.length - 1];
  const lastMine = last?.players.find((x) => x.seatId === localSeatId);
  if (last && lastMine && !lastMine.bye && lastMine.deaths > 0) {
    const secs = Math.round(lastMine.timeAliveTicks / TICK_HZ);
    const fieldBest = Math.max(...last.players.filter((p) => !p.bye).map((p) => p.timeAliveTicks));
    const bestSecs = Math.round(fieldBest / TICK_HZ);
    if (bestSecs > secs) {
      out.push({
        key: "last-stand",
        tone: "tip",
        text: `最後一回合你撐了 ${secs} 秒，全場最久的人撐了 ${bestSecs} 秒 —— 最後一場沒有殭屍只有英雄，活得久本身就是分數`,
        evidence: `myAliveSec=${secs},bestAliveSec=${bestSecs}`,
      });
    }
  }

  return out.slice(0, MAX_PROGRESS_ADVICE);
}

/**
 * The line shown when NOTHING above qualified. It is a statement ABOUT the card
 * rather than invented coaching — the same rule roundReport.NO_HINT_LINE keeps.
 * Deliberately carries no fabricated figure.
 */
export const NO_ADVICE_LINE = "這場沒有明顯的短板 —— 每回合的數字都在圖上，自己比對隊友的線";
