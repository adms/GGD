/**
 * settlementModel — PURE view logic behind the victory-settlement screen
 * (task #25, part C). No React / no DOM, so every branch unit-tests in the node
 * vitest env exactly like ranking.ts / champSelectFilter.ts. Holds:
 *   - grade → tier / colour / headline mapping (the big colored S+…C- grade),
 *   - data-driven reflection-hint generation (stat line → short 中文 coaching),
 *   - the per-stat breakdown row builder + stat formatters (accuracy, KDA,
 *     time-alive, etc.),
 *   - the per-player ranking sort + local-card lookup.
 *
 * The MatchEndPanel + settlement components are the JSX shell over these.
 * Portrait/icon resolution stays in the component (it needs the content DB);
 * everything numeric/textual lives here so it is deterministic + testable.
 */
import { TICK_HZ } from "@ggd/shared/constants";
import type { PlayerMatchStats } from "@ggd/shared/sim/stats/matchStats";
import type { Grade } from "@ggd/shared/sim/stats/rating";
import type { MatchSettlement, SettlementPlayer } from "@ggd/shared/protocol/messages";

// ------------------------------------------------------------------ grade ---

export type GradeTier = "S" | "A" | "B" | "C";

/** The letter tier of a grade (S+/S/S- → "S", etc.). */
export function gradeTier(grade: Grade): GradeTier {
  return grade.charAt(0) as GradeTier;
}

/**
 * Big-grade colour by tier: S gold, A teal (blue/green), B grey-blue, C grey.
 * Mirrors the handoff mapping so the S+ splash reads gold and a C- reads muted.
 */
const TIER_COLOR: Record<GradeTier, string> = {
  S: "#f2c637", // gold
  A: "#46c8b0", // teal / blue-green
  B: "#7f97c8", // grey-blue
  C: "#8d97ad", // grey
};

/** Colour for the big settlement grade. */
export function gradeColor(grade: Grade): string {
  return TIER_COLOR[gradeTier(grade)];
}

/** A short 中文 headline under the big grade, keyed off the tier. */
const TIER_HEADLINE: Record<GradeTier, string> = {
  S: "傳說級表現",
  A: "穩健發揮",
  B: "中規中矩",
  C: "還有進步空間",
};

/** One-line headline shown beside/under the big grade. */
export function gradeHeadline(grade: Grade): string {
  // S+ deserves a louder line than a bare S-.
  if (grade === "S+") return "壓倒性的傳說表現";
  return TIER_HEADLINE[gradeTier(grade)];
}

// -------------------------------------------------------------- formatters ---

/** Skillshot accuracy as a percent string, or "—" when no skillshots thrown. */
export function formatAccuracy(stats: PlayerMatchStats): string {
  const shots = stats.abilityHits + stats.abilityWhiffs;
  if (shots <= 0) return "—";
  return `${Math.round((stats.abilityHits / shots) * 100)}%`;
}

/** Raw accuracy in [0,1], or null when the champion threw no skillshots. */
export function accuracyRatio(stats: PlayerMatchStats): number | null {
  const shots = stats.abilityHits + stats.abilityWhiffs;
  if (shots <= 0) return null;
  return stats.abilityHits / shots;
}

/** "K / D / A" tally string. */
export function formatKda(stats: PlayerMatchStats): string {
  return `${stats.kills} / ${stats.deaths} / ${stats.assists}`;
}

/** (K+A)/max(1,D), the classic KDA ratio. */
export function kdaRatio(stats: PlayerMatchStats): number {
  return (stats.kills + stats.assists) / Math.max(1, stats.deaths);
}

/** Sim ticks → whole seconds, e.g. survival / CC durations. */
export function ticksToSeconds(ticks: number): number {
  return Math.round(ticks / TICK_HZ);
}

/** Compact integer with thousands separators. */
export function formatInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// -------------------------------------------------------- stat breakdown ----

export interface StatRow {
  key: string;
  label: string;
  value: string;
}

/**
 * The ordered per-stat breakdown shown on a player's settlement card. Pure —
 * the component just renders these label/value pairs.
 */
export function buildStatBreakdown(stats: PlayerMatchStats): StatRow[] {
  return [
    { key: "kda", label: "KDA", value: `${formatKda(stats)}  (${kdaRatio(stats).toFixed(1)})` },
    { key: "damageDealt", label: "傷害輸出", value: formatInt(stats.damageDealt) },
    { key: "damageTaken", label: "承受傷害", value: formatInt(stats.damageTaken) },
    { key: "damageBlocked", label: "抵擋傷害", value: formatInt(stats.damageBlocked) },
    { key: "healingDone", label: "治療量", value: formatInt(stats.healingDone) },
    { key: "cc", label: "控制時間", value: `${ticksToSeconds(stats.ccAppliedTicks)}s` },
    { key: "accuracy", label: "技能命中率", value: formatAccuracy(stats) },
    { key: "basic", label: "普攻命中", value: formatInt(stats.basicAttackHits) },
    { key: "gold", label: "取得金錢", value: formatInt(stats.goldEarned) },
    { key: "largest", label: "最大單次傷害", value: formatInt(stats.largestSingleHit) },
    { key: "flowers", label: "治療花", value: formatInt(stats.flowersEaten) },
    // task #84: a rescue never erases a death, so it needs its own row or it
    // is invisible on the card. Received is shown beside it so a revived
    // player can see why their death count is not the whole story.
    {
      key: "revives",
      label: "救援復活",
      value:
        stats.revivesReceived > 0
          ? `${formatInt(stats.revivesPerformed)} (被救 ${formatInt(stats.revivesReceived)})`
          : formatInt(stats.revivesPerformed),
    },
    { key: "alive", label: "存活時間", value: `${ticksToSeconds(stats.timeAliveTicks)}s` },
  ];
}

// ---------------------------------------------------------- reflection hints ---

export interface ReflectionHint {
  tone: "praise" | "tip";
  /** short 中文 line, e.g. "技能命中率偏低，試著在敵人被控時再出手" */
  text: string;
}

const CARRY_ROLES = new Set(["marksman", "mage", "assassin"]);
const FRONTLINE_ROLES = new Set(["tank", "bruiser", "fighter"]);

/** Cap on how many hints we surface (keeps the card readable). */
export const MAX_REFLECTION_HINTS = 3;

/**
 * Data-driven, deterministic coaching lines derived from a player's own stat
 * line + role + grade. Praise and tips are collected in priority order, then
 * capped. Always returns at least one line. No lobby context needed — every
 * threshold is absolute so a single scoreboard is enough (and testable).
 */
export function reflectionHints(stats: PlayerMatchStats, role: string, grade: Grade): ReflectionHint[] {
  const r = (role ?? "").toLowerCase();
  const out: ReflectionHint[] = [];
  const acc = accuracyRatio(stats);
  const shots = stats.abilityHits + stats.abilityWhiffs;
  const soak = stats.damageTaken + stats.damageBlocked;
  const kda = kdaRatio(stats);

  // — accuracy —
  if (shots >= 4 && acc !== null && acc < 0.4) {
    out.push({ tone: "tip", text: "技能命中率偏低，試著在敵人被控時再出手" });
  } else if (shots >= 6 && acc !== null && acc >= 0.7) {
    out.push({ tone: "praise", text: "技能命中精準，關鍵一擊毫不浪費" });
  }

  // — deaths / survival —
  if (stats.deaths >= 6 && kda < 1.5) {
    out.push({ tone: "tip", text: "陣亡次數偏高，注意站位與撤退時機" });
  } else if (stats.deaths === 0 && stats.timeAliveTicks > 0) {
    out.push({ tone: "praise", text: "全場零陣亡，走位滴水不漏" });
  }

  // — team presence —
  if (stats.killParticipation <= 1 && stats.timeAliveTicks >= TICK_HZ * 60) {
    out.push({ tone: "tip", text: "團戰參與度不足，多跟上隊友的節奏" });
  }

  // — role-specific output / soak / sustain —
  if (CARRY_ROLES.has(r)) {
    if (stats.damageDealt >= 12000) {
      out.push({ tone: "praise", text: "輸出爆表，穩坐隊伍核心" });
    } else if (stats.damageDealt < 4000) {
      out.push({ tone: "tip", text: "輸出不足，把握輸出視窗打出傷害" });
    }
  }
  if (FRONTLINE_ROLES.has(r) && soak >= 15000) {
    out.push({ tone: "praise", text: "前排扛傷穩健，替隊友擋下大量傷害" });
  }
  if (r === "support") {
    if (stats.healingDone >= 3000) {
      out.push({ tone: "praise", text: "治療量充沛，後排的定心丸" });
    } else if (stats.healingDone < 500) {
      out.push({ tone: "tip", text: "治療量偏低，記得替隊友補血補盾" });
    }
  }

  // — lockdown / objectives —
  if (stats.ccAppliedTicks >= TICK_HZ * 5) {
    out.push({ tone: "praise", text: "控制拉滿，替隊伍創造輸出空間" });
  }
  if (stats.multikills >= 1) {
    out.push({ tone: "praise", text: "打出多殺，一波帶走敵人" });
  }
  // — rescue (task #84) — a revive costs a 3s stationary channel next to the
  // team that just scored, so it is worth calling out on its own.
  if (stats.revivesPerformed >= 2) {
    out.push({ tone: "praise", text: "多次踩圈救回隊友，關鍵時刻穩住團隊" });
  } else if (stats.revivesPerformed === 1) {
    out.push({ tone: "praise", text: "冒著危險救回隊友，這一波值得" });
  }
  if (stats.flowersEaten === 0) {
    out.push({ tone: "tip", text: "沒有搶到治療花，注意地圖資源" });
  } else if (stats.flowersEaten >= 3) {
    out.push({ tone: "praise", text: "積極控制治療花，資源運營出色" });
  }

  // — fallback so the card never shows an empty reflection —
  if (out.length === 0) {
    const tier = gradeTier(grade);
    out.push(
      tier === "S" || tier === "A"
        ? { tone: "praise", text: "全面發揮，繼續保持這個節奏" }
        : { tone: "tip", text: "穩紮穩打，下一場再突破自己" },
    );
  }

  return out.slice(0, MAX_REFLECTION_HINTS);
}

// -------------------------------------------------------------- ranking ------

/**
 * The per-player ranking table order: ascending `rank` (1 = best), ties broken
 * by seatId so the order is stable/deterministic. Returns a new array; the
 * input is never mutated.
 */
export function sortSettlementRanking(perPlayer: readonly SettlementPlayer[]): SettlementPlayer[] {
  return [...perPlayer].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.seatId - b.seatId;
  });
}

/** The signed-in player's own settlement card (by seat), or null. */
export function localSettlementCard(
  perPlayer: readonly SettlementPlayer[],
  localSeatId: number | null,
): SettlementPlayer | null {
  if (localSeatId === null) return null;
  return perPlayer.find((p) => p.seatId === localSeatId) ?? null;
}

/** Whether the given team placed first (won). winnerTeam === -1 ⇒ undecided. */
export function isWinner(winnerTeam: number, teamId: number | null): boolean {
  return teamId !== null && winnerTeam >= 0 && winnerTeam === teamId;
}

// --------------------------------------------------------------- quote VO ----
// task #139 — the champion whose famous-quote (名言) clip speaks at the two
// post-match beats. All decisions are PURE + schema-authoritative so the client
// shells (MatchEndPanel / RoundEndVoice) stay thin and every branch unit-tests.

/**
 * The champion whose quote plays on the LOCAL player's MATCH-victory settlement
 * (moment 2). Local-only + win-only: returns the local champion's id ONLY when
 * the local seat's team WON; null otherwise (loss, spectator, missing seat, no
 * payload, or an empty champ). Each client resolves its OWN champion and nothing
 * is broadcast, so nobody ever hears another player's line at the settlement.
 */
export function localWinQuoteChampion(
  settlement: MatchSettlement | null,
  localSeatId: number | null,
): string | null {
  if (!settlement || settlement.perPlayer.length === 0) return null;
  const local = localSettlementCard(settlement.perPlayer, localSeatId);
  if (!local) return null;
  return isWinner(settlement.winnerTeam, local.teamId) ? local.champ || null : null;
}

/** The seat fields the round-leader ranking reads (a RoomStore SeatView satisfies it). */
export interface RoundSeatView {
  seatId: number;
  teamId: number;
  championId: string;
}

/** The team fields the round-leader ranking reads (a RoomStore TeamView satisfies it). */
export interface RoundTeamView {
  teamId: number;
  lives: number;
  eliminated: boolean;
  placement: number;
}

/**
 * Is the MATCH decided (≤1 team still alive)? The round that eliminates the
 * penultimate team is a round-end that IS the match end — that beat belongs to
 * the settlement's local-win quote (moment 2), not the round-leader quote.
 */
export function matchDecided(teams: readonly RoundTeamView[]): boolean {
  return teams.filter((t) => !t.eliminated).length <= 1;
}

/** Standing comparator: the better-placed team sorts first (see roundLeaderChampion). */
function compareTeamStanding(a: RoundTeamView, b: RoundTeamView): number {
  // an alive team always outranks an eliminated one
  if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
  if (a.eliminated) {
    // both out: the one that survived longer (lower placement number) ranks first
    if (a.placement !== b.placement) return a.placement - b.placement;
    return a.teamId - b.teamId;
  }
  // both alive: more lives first, ties to the lower teamId
  if (a.lives !== b.lives) return b.lives - a.lives;
  return a.teamId - b.teamId;
}

/**
 * The champion currently in FIRST PLACE by team standing — the round's rank-1
 * player. Reads ONLY authoritative schema fields (lives / eliminated / placement
 * / teamId / seatId), so every client computes the SAME champion and plays the
 * SAME clip. The leading team's representative is its lowest-seatId champion.
 * Returns null when there are no teams/seats or the leader has no champion.
 */
export function roundLeaderChampion(
  seats: readonly RoundSeatView[],
  teams: readonly RoundTeamView[],
): string | null {
  if (teams.length === 0 || seats.length === 0) return null;
  const leader = [...teams].sort(compareTeamStanding)[0]!;
  const champs = seats
    .filter((s) => s.teamId === leader.teamId && s.championId)
    .sort((a, b) => a.seatId - b.seatId);
  return champs[0]?.championId ?? null;
}

/**
 * The champion whose quote plays at a ROUND-end settlement (moment 3): the
 * round's rank-1 champion, EXCEPT on the match-deciding round (whose beat is the
 * settlement's local-win quote). Null ⇒ silent (no round-end quote this round).
 */
export function roundEndQuoteChampion(
  seats: readonly RoundSeatView[],
  teams: readonly RoundTeamView[],
): string | null {
  if (matchDecided(teams)) return null;
  return roundLeaderChampion(seats, teams);
}
