/**
 * roundReport — the PURE model behind 中場商店's 「上一回合戰報」 (task #265,
 * owner's #232: 「每回合進商店：右側顯示 S~D 評價 + 改善建議」).
 *
 * No React, no store, no DOM: every branch below is node-testable, which is the
 * whole point — a coaching line nobody can feed data to is a coaching line
 * nobody can prove is true.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 1. WHY THIS IS NOT A SECOND RATING SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════
 * The settlement screen (#25) already grades a player: `sim/stats/rating.ts`
 * blends ten sub-scores into a `composite ∈ [0,1]` and cuts it into the 12-step
 * ladder S+ … C-. The failure mode this module has to avoid is the shop saying
 * "B" while the settlement says "A" for reasons nobody can reconstruct.
 *
 * So the LADDER is not re-invented. {@link roundGrade} folds its composite
 * through rating.ts's own {@link gradeFromScore}, i.e. through the same
 * `GRADE_CUTS` table the settlement uses, and the S~D letter the owner asked
 * for is a FOLD of that 12-step result, not a parallel scale:
 *
 *     S+ S  S-  →  S        A+ A  A-  →  A        B+ B  B-  →  B
 *     C+ C      →  C        C-         →  D
 *
 * The card prints BOTH (「A」 大字 + 「對應結算階梯 A-」 小字), so the two
 * scales are visibly one scale. `roundReport.test.ts` asserts the D band is
 * exactly rating.ts's C- band, read from `GRADE_CUTS` — if #25 re-tunes its
 * cuts, this card moves with it or the test goes red.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 2. WHY THE WEIGHTS ARE DIFFERENT (and why that is not a contradiction)
 * ═══════════════════════════════════════════════════════════════════════════
 * `rating.compositeScore()` CANNOT be called here, for two hard reasons that
 * are properties of the system, not of this file:
 *
 *   (a) ITS INPUT DOES NOT EXIST PER ROUND. `PlayerMatchStats` (damageDealt,
 *       damageTaken, abilityHits, timeAliveTicks, killParticipation, …) lives
 *       only inside SimWorld on the server, is CUMULATIVE from champion spawn,
 *       and is never reset per round — so there is no such number as "the
 *       damage I did this round" anywhere in the system, server included. It
 *       reaches a client exactly once, in the one-shot `matchSettlement` event
 *       at match end. Filling a `PlayerMatchStats` with kills/deaths and zeros
 *       would make eight of the ten sub-scores read 0, `acc` fall to its
 *       neutral 0.5 and `surv` to 1.0 — a grade made of padding.
 *
 *   (b) HALF ITS WEIGHT IS A LOBBY PERCENTILE. `composite = 0.5·roleScore +
 *       0.5·lobbyPercentile`, and a one-player lobby percentiles to 1.0 — a
 *       floor of B+ before any play at all. The 12 seats' per-round stats are
 *       not on the wire, so there is no lobby to percentile against.
 *
 * What IS server-authoritative per round, and therefore what this grade is
 * honestly made of: `SeatState.roundKills` / `roundDeaths` (#173, zeroed at
 * every combat entry), `seat.alive`, and `TeamState.roundOutcome`. Four facts,
 * three axes, weights declared below and printed on the card as
 * 「只計 勝負·擊殺·陣亡·存活」 so the player is never told the letter saw
 * something it did not.
 *
 * The two grades therefore differ the way a set score differs from a match
 * score: same ladder, different window, both labelled. 本回合 B / 全場 A is a
 * fact about two rounds' worth of play, not a disagreement.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 3. NO NUMBER ON THIS CARD IS DERIVED
 * ═══════════════════════════════════════════════════════════════════════════
 * #125's rule — every displayed number is the post-multiplier FINAL value —
 * has nothing to bite on here by construction: the card shows only counters
 * (kills, deaths), a currency balance (gold), a streak (statStacks/20) and an
 * outcome enum. No damage, cooldown, range or stat magnitude appears, so there
 * is no combat-env multiplier to apply and no way for this card to print a
 * base value where the settlement prints a scaled one.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 4. THE HINTS: EVERY LINE CARRIES ITS OWN EVIDENCE
 * ═══════════════════════════════════════════════════════════════════════════
 * The settlement's `reflectionHints()` cannot be reused verbatim and it would
 * be a lie to pretend otherwise: nine of its ten branches read fields the
 * client does not have (abilityHits, damageDealt, healingDone, ccAppliedTicks,
 * flowersEaten, killParticipation, timeAliveTicks, revivesPerformed), and
 * every threshold it does have is a WHOLE-MATCH threshold (`deaths >= 6`,
 * `damageDealt >= 12000`) that a ≤90 s round cannot reach. Applied here it
 * would fall through to its two generic fallbacks on nearly every round —
 * 「全面發揮，繼續保持這個節奏」 every single time. That is precisely the
 * 廢話 this task exists to avoid.
 *
 * So the hints are rebuilt on the facts that DO exist, under one rule: every
 * hint carries an `evidence` string naming the field and value it came from,
 * and `roundReport.test.ts` asserts (i) evidence is never empty and (ii) the
 * number in the evidence literally appears in the shown text. A hint that
 * cannot point at a number cannot be written. When nothing qualifies the card
 * shows the stat rows and one honest line — never an invented tip.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 5. INSUFFICIENT DATA IS A STATE, NOT A GRADE
 * ═══════════════════════════════════════════════════════════════════════════
 * Three cases produce a C-shaped number out of nothing, and all three are
 * refused rather than graded:
 *
 *   NOT_STARTED  `round <= 1`. PhaseMachine goes champSelect → round = 1 →
 *                intermission, and only `resolution` increments. So the
 *                intermission at round 1 is BEFORE any combat: every tally is
 *                0 and the outcome is NONE. The report is about round − 1.
 *   BYE          `roundOutcome === NONE` with a round already played. A bye
 *                team is parked dead by enterCombat WITHOUT emitting deaths,
 *                so its seats read alive:false / roundKills:0 / roundDeaths:0
 *                — byte-identical to a team that was instantly wiped. Only
 *                `roundOutcome` can tell them apart (schema.ts says so
 *                explicitly, and #173 is the bug that proved it).
 *   NO_CHAMPION  no seat / no champion (#130's un-locked player, a spectator).
 *
 * The one case deliberately NOT handled here is the shop mounted during
 * COMBAT for a defeated player: the round is still running, so its tallies are
 * a live count, not a result. {@link roundReportPhaseShows} gates on the
 * intermission and the panel renders nothing in combat.
 */
import { ROUND_OUTCOME } from "@ggd/shared/protocol/schema";
import { GRADE_CUTS, GRADES, gradeFromScore, type Grade } from "@ggd/shared/sim/stats/rating";
import { INVENTORY_SLOTS } from "@ggd/shared/sim/economy/shop";
import { STAT_TICK_TARGET } from "@ggd/shared/sim/economy/itemTiers";

/** The intermission is the only phase that has a FINISHED round to report on. */
export const ROUND_REPORT_PHASE = "intermission";

/** True when the phase has a settled previous round (see the module doc §5). */
export function roundReportPhaseShows(phase: string): boolean {
  return phase === ROUND_REPORT_PHASE;
}

// ────────────────────────────────────────────────────────────── the ladder ──

/** The owner's S~D scale — a FOLD of rating.ts's 12-step ladder, never a rival. */
export type RoundGrade = "S" | "A" | "B" | "C" | "D";

/** Best → worst, so a test can assert the fold is monotonic. */
export const ROUND_GRADES: readonly RoundGrade[] = ["S", "A", "B", "C", "D"] as const;

/**
 * Fold a #25 grade into the owner's S~D scale. The bottom rung is renamed
 * rather than invented: `C-` is already rating.ts's "below everything else"
 * bucket, so `D` is that exact band under the name the owner asked for.
 */
export function foldGrade(grade: Grade): RoundGrade {
  return grade === "C-" ? "D" : (grade.charAt(0) as RoundGrade);
}

/** Colour per letter, mirroring settlementModel's tier palette (+ D). */
export const ROUND_GRADE_COLOR: Record<RoundGrade, string> = {
  S: "#f2c637", // gold  — same as settlementModel TIER_COLOR.S
  A: "#46c8b0", // teal
  B: "#7f97c8", // grey-blue
  C: "#8d97ad", // grey
  D: "#c9736b", // muted red: the band #25 calls C-
};

/** One short 中文 headline per letter. Deliberately about THIS round only. */
export const ROUND_GRADE_HEADLINE: Record<RoundGrade, string> = {
  S: "這回合你就是主角",
  A: "打得很好的一回合",
  B: "穩，但還有空間",
  C: "這回合吃了虧",
  D: "這回合幾乎沒打出來",
};

// ──────────────────────────────────────────────────────────── the composite ──

/**
 * A round is one 3v3 duel, so THREE champion kills is the whole enemy team —
 * the "I wiped them by myself" anchor. Deliberately not rating.ts's KDA_REF (5),
 * which is a whole-match ratio anchor and unreachable inside a ≤90 s round.
 * Only champion kills reach `roundKills` (MatchController filters non-champion
 * victims), so zombie waves (#215) cannot inflate this axis.
 */
export const ROUND_KILL_REF = 3;

/**
 * The three axes and their weights. Tuned against the real shape of a round
 * (numbers in roundReport.test.ts, which pins each of these cases):
 *
 *   won  · alive · 0 kills  → 0.54  B+ → B   carried by the team
 *   won  · alive · 1 kill   → 0.69  A+ → A   the median winning round
 *   won  · alive · 2 kills  → 0.85  S   → S
 *   won  · alive · 3 kills  → 1.00  S+  → S  solo wipe
 *   won  · died  · 0 kills  → 0.30  C+  → C
 *   lost · died  · 1 kill   → 0.27  C   → C  traded once on the way down
 *   lost · died  · 0 kills  → 0.11  C-  → D  the floor, and it is reachable
 *
 * `frag` carries the most weight on purpose: it is the only axis a player can
 * move on their own. `win` is deliberately the LIGHTEST — a 3-man team result
 * should tilt one player's letter, not decide it.
 */
export const ROUND_WEIGHTS = { win: 0.22, frag: 0.46, surv: 0.32 } as const;

/** ROUND_OUTCOME → [0,1]. A fought-but-undecided round sits just under half. */
export function roundOutcomeScore(outcome: number): number {
  if (outcome === ROUND_OUTCOME.WON) return 1;
  if (outcome === ROUND_OUTCOME.FOUGHT) return 0.45;
  if (outcome === ROUND_OUTCOME.LOST) return 0.15;
  return 0; // NONE — never graded (see §5), scored 0 only for totality
}

/**
 * Survival in [0,1]. Being revived (#84) is a real, worse-than-clean outcome,
 * so `alive` with deaths on the board is not full marks — and dying twice is
 * strictly worse than dying once, which a bare `alive` boolean cannot say.
 */
export function roundSurvivalScore(alive: boolean, deaths: number): number {
  if (alive) return deaths <= 0 ? 1 : 0.55;
  return deaths <= 1 ? 0.25 : 0;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export interface RoundFacts {
  /** TeamState.roundOutcome (protocol ROUND_OUTCOME) */
  outcome: number;
  /** SeatState.roundKills — server-authoritative, champion kills only */
  kills: number;
  /** SeatState.roundDeaths */
  deaths: number;
  /** seat.alive at the moment the round settled */
  alive: boolean;
}

/** The [0,1] composite this card grades on. Same shape as rating.ts's, fewer axes. */
export function roundCompositeScore(f: RoundFacts): number {
  const win = roundOutcomeScore(f.outcome);
  const frag = clamp01(f.kills / ROUND_KILL_REF);
  const surv = roundSurvivalScore(f.alive, f.deaths);
  const w = ROUND_WEIGHTS;
  return clamp01(w.win * win + w.frag * frag + w.surv * surv);
}

/** The #25 12-step grade for a round — the value the card prints in small type. */
export function roundMatchGrade(f: RoundFacts): Grade {
  return gradeFromScore(roundCompositeScore(f));
}

/** The owner's S~D letter for a round. */
export function roundGrade(f: RoundFacts): RoundGrade {
  return foldGrade(roundMatchGrade(f));
}

/**
 * The composite below which a round grades D — read OUT of rating.ts's own cut
 * table (the bottom of the `C` band) rather than typed again, so #25 re-tuning
 * its ladder moves this card with it instead of silently splitting the two.
 */
export const ROUND_D_CEILING = GRADE_CUTS[GRADES.indexOf("C")]!;

// ─────────────────────────────────────────────────────────────── the report ──

export type RoundReportState = "graded" | "not-started" | "bye" | "no-champion";

export interface RoundStatRow {
  key: string;
  label: string;
  value: string;
  /** "good" / "bad" tint the value; undefined = neutral */
  tone?: "good" | "bad";
}

export interface RoundHint {
  key: string;
  tone: "praise" | "tip";
  /** the 中文 line shown to the player */
  text: string;
  /**
   * The FIELDS AND VALUES this line was derived from, as `field=value` pairs —
   * e.g. `roundDeaths=2,survivalPct=25`.
   *
   * Not decoration. `roundReport.test.ts` asserts, for EVERY hint every builder
   * can emit, that it is non-empty AND that every number rendered in `text`
   * appears as one of these values. That makes "no number on this card that
   * does not come from a real field" a property the suite checks rather than a
   * promise the author made — a new hint with an invented figure fails.
   */
  evidence: string;
}

/** Cap, mirroring settlementModel.MAX_REFLECTION_HINTS so both cards read alike. */
export const MAX_ROUND_HINTS = 3;

export interface RoundReportInput {
  /** HudState.phase */
  phase: string;
  /** HudState.round — the round ABOUT TO BE PLAYED (see §5) */
  round: number;
  /** HudState.phaseSecondsLeft — how long the shop stays open */
  secondsLeft: number;
  /** false when the local seat has no champion (#130 / spectator) */
  hasChampion: boolean;
  facts: RoundFacts;
  /** seat.gold */
  gold: number;
  /** seat.unspentPoints — skill points not yet spent */
  unspentPoints: number;
  /** seat.items.length */
  itemCount: number;
  /** seat.statStacks (#82's 屬性強化 streak) */
  statStacks: number;
  /** seat.statCapstonePct — non-zero once 傳說·萬象強化 is earned */
  statCapstonePct: number;
  /** seat.offers.length — un-answered 三選一 draws */
  pendingOffers: number;
  /** cheapest catalogue price the player can currently afford, or null */
  cheapestAffordable: number | null;
  /** how many catalogue entries the player can afford right now */
  affordableCount: number;
}

export interface RoundReport {
  state: RoundReportState;
  /** the round this card is ABOUT (`round - 1`); 0 when nothing has been played */
  roundNumber: number;
  grade: RoundGrade | null;
  /** the 12-step #25 grade the letter folded from — printed so the two agree on screen */
  matchGrade: Grade | null;
  score: number | null;
  /** one line: the grade headline, or WHY there is no grade */
  headline: string;
  stats: RoundStatRow[];
  hints: RoundHint[];
}

const OUTCOME_LABEL: Record<number, string> = {
  [ROUND_OUTCOME.WON]: "勝利",
  [ROUND_OUTCOME.LOST]: "敗北",
  [ROUND_OUTCOME.FOUGHT]: "未分勝負",
  [ROUND_OUTCOME.NONE]: "輪空",
};

/** The stat rows — every one a raw server counter (see §3). */
export function roundStatRows(input: RoundReportInput): RoundStatRow[] {
  const { facts } = input;
  const rows: RoundStatRow[] = [
    {
      key: "outcome",
      label: "回合結果",
      value: OUTCOME_LABEL[facts.outcome] ?? "未知",
      ...(facts.outcome === ROUND_OUTCOME.WON
        ? { tone: "good" as const }
        : facts.outcome === ROUND_OUTCOME.LOST
          ? { tone: "bad" as const }
          : {}),
    },
    {
      key: "kd",
      label: "擊殺 / 陣亡",
      value: `${facts.kills} / ${facts.deaths}`,
      ...(facts.kills > 0 && facts.deaths === 0 ? { tone: "good" as const } : {}),
    },
    {
      key: "alive",
      label: "收場狀態",
      value: facts.alive ? "存活到最後" : "倒在場上",
      ...(facts.alive ? { tone: "good" as const } : { tone: "bad" as const }),
    },
    { key: "gold", label: "手上金幣", value: `${input.gold} g` },
  ];
  // #82's stat path only exists while the capstone has not landed.
  if (input.statCapstonePct === 0) {
    rows.push({
      key: "stacks",
      label: "屬性強化",
      value: `${input.statStacks} / ${STAT_TICK_TARGET}`,
    });
  }
  return rows;
}

/**
 * The coaching lines. Priority order = cost of ignoring it: an un-answered
 * draft is thrown away outright, unspent skill points and gold are power the
 * player already owns and is not using, and the reflective lines come last
 * because the stat rows above already state those numbers.
 *
 * Praise leads when it is earned, because a card that only ever nags stops
 * being read — but it never displaces an actionable line: everything below is
 * a single ordered list, capped at {@link MAX_ROUND_HINTS}.
 */
export function roundHints(input: RoundReportInput): RoundHint[] {
  const { facts } = input;
  const out: RoundHint[] = [];

  // ── earned praise ────────────────────────────────────────────────────────
  // `kills > 0` is NOT decoration. Without it a 0-kill won round opened with
  // 「零陣亡拿下這回合，0 殺 —— 保持這個站位」 while the letter on the SAME card
  // was held down to B *because* 0 kills zeroed frag — the heaviest axis at
  // {@link ROUND_WEIGHTS}.frag. The card congratulated the player for the exact
  // thing that cost them the grade. Praise that contradicts the letter it sits
  // next to is worse than no praise: it teaches the player to stop reading.
  if (
    facts.outcome === ROUND_OUTCOME.WON &&
    facts.deaths === 0 &&
    facts.alive &&
    facts.kills > 0
  ) {
    out.push({
      key: "clean-win",
      tone: "praise",
      text: `零陣亡拿下這回合，${facts.kills} 殺 —— 保持這個站位`,
      evidence: `roundDeaths=0,roundKills=${facts.kills}`,
    });
  } else if (facts.outcome === ROUND_OUTCOME.WON && facts.deaths === 0 && facts.alive) {
    // Won it, never died, never killed. Both halves in ONE line so the honest
    // half cannot be sliced off by MAX_ROUND_HINTS the way a separate
    // "no-kills" tip was (it ordered last, and any unspent offer or skill point
    // pushed it out — i.e. essentially always).
    out.push({
      key: "clean-win-no-frag",
      tone: "praise",
      text: `零陣亡拿下這回合 —— 但 0 擊殺，評價裡最重的擊殺項（佔 ${Math.round(
        ROUND_WEIGHTS.frag * 100,
      )}%）整項掛零`,
      evidence: `roundDeaths=0,roundKills=0,fragWeightPct=${Math.round(ROUND_WEIGHTS.frag * 100)}`,
    });
  } else if (facts.outcome === ROUND_OUTCOME.LOST && facts.kills >= 2) {
    out.push({
      key: "traded-well",
      tone: "praise",
      text: `隊伍輸了，但你自己帶走 ${facts.kills} 個 —— 不是你的問題`,
      evidence: `roundKills=${facts.kills}`,
    });
  }

  // ── things that expire while this card is on screen ───────────────────────
  if (input.pendingOffers > 0) {
    out.push({
      key: "pending-offer",
      tone: "tip",
      text: `還有 ${input.pendingOffers} 張三選一沒選 —— 直接開打會隨機幫你選`,
      evidence: `pendingOffers=${input.pendingOffers}`,
    });
  }
  if (input.unspentPoints > 0) {
    out.push({
      key: "skill-points",
      tone: "tip",
      text: `${input.unspentPoints} 點技能點還沒加 —— 現在點完再開打`,
      evidence: `unspentPoints=${input.unspentPoints}`,
    });
  }
  if (input.cheapestAffordable !== null && input.affordableCount > 0) {
    const slots = Math.max(0, INVENTORY_SLOTS - input.itemCount);
    const room = slots > 0 ? `，裝備欄還空 ${slots} 格` : "";
    out.push({
      key: "unspent-gold",
      tone: "tip",
      text: `${input.gold} 金沒花，買得起 ${input.affordableCount} 件${room} —— 商店還剩 ${input.secondsLeft} 秒`,
      evidence:
        `gold=${input.gold},affordable=${input.affordableCount},` +
        `freeSlots=${slots},secondsLeft=${input.secondsLeft}`,
    });
  }
  // #82/#104: buying ANY normal item zeroes the streak, so the warning has to
  // land BEFORE the click, not after it.
  if (
    input.statCapstonePct === 0 &&
    input.statStacks > 0 &&
    input.statStacks < STAT_TICK_TARGET
  ) {
    out.push({
      key: "stat-path",
      tone: "tip",
      text: `屬性強化 ${input.statStacks}/${STAT_TICK_TARGET} —— 買任何一般道具都會把它歸零`,
      evidence: `statStacks=${input.statStacks},statTarget=${STAT_TICK_TARGET}`,
    });
  }

  // ── what the letter actually saw ─────────────────────────────────────────
  // These two explain the GRADE rather than merely restating a stat row: they
  // name the axis the round lost points on, which is the only "advice" this
  // data set can honestly give.
  if (facts.deaths > 0) {
    const survPct = Math.round(roundSurvivalScore(facts.alive, facts.deaths) * 100);
    out.push({
      key: "deaths",
      tone: "tip",
      text: `這回合陣亡 ${facts.deaths} 次 —— 存活項因此只拿 ${survPct}%`,
      evidence: `roundDeaths=${facts.deaths},survivalPct=${survPct}`,
    });
  }
  if (facts.kills === 0) {
    const fragPct = Math.round(ROUND_WEIGHTS.frag * 100);
    out.push({
      key: "no-kills",
      tone: "tip",
      text: `這回合 0 擊殺 —— 評價裡最重的擊殺項（佔 ${fragPct}%）整項掛零`,
      evidence: `roundKills=0,fragWeightPct=${fragPct}`,
    });
  }

  return out.slice(0, MAX_ROUND_HINTS);
}

/**
 * The whole card, in one pure call. Insufficient-data states carry a reason and
 * NO grade — showing a C for a bye round is the #173 bug wearing a letter.
 */
export function buildRoundReport(input: RoundReportInput): RoundReport {
  const roundNumber = Math.max(0, input.round - 1);
  const blank: Omit<RoundReport, "state" | "headline"> = {
    roundNumber,
    grade: null,
    matchGrade: null,
    score: null,
    stats: [],
    hints: [],
  };

  if (!input.hasChampion) {
    return { ...blank, state: "no-champion", headline: "還沒有英雄 —— 這回合沒有可評的數據" };
  }
  if (input.round <= 1) {
    return {
      ...blank,
      state: "not-started",
      headline: "第一場還沒開打 —— 每回合結束後這裡會給你戰報",
    };
  }
  if (input.facts.outcome === ROUND_OUTCOME.NONE) {
    return {
      ...blank,
      state: "bye",
      headline: `第 ${roundNumber} 回合輪空 —— 沒有上場，不評分`,
    };
  }

  const score = roundCompositeScore(input.facts);
  const matchGrade = gradeFromScore(score);
  const grade = foldGrade(matchGrade);
  return {
    state: "graded",
    roundNumber,
    grade,
    matchGrade,
    score,
    headline: ROUND_GRADE_HEADLINE[grade],
    stats: roundStatRows(input),
    hints: roundHints(input),
  };
}

/**
 * The line shown when a graded round produced no evidence-backed hint at all.
 * Per the task's own rule — 想不出有依據的建議時不要硬擠一條 — this is a
 * statement about the card, not invented coaching.
 */
export const NO_HINT_LINE = "沒有要提醒的 —— 這回合打得很穩";

/** The footnote that keeps the letter honest about what it could and could not see. */
export const ROUND_GRADE_BASIS = "只計 勝負·擊殺·陣亡·存活 · 傷害等完整數據在結算畫面";
