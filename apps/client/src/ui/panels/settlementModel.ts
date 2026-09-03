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
import { ROUND_OUTCOME } from "@ggd/shared/protocol/schema";
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
 * ⭐ GH#973 —— 結算卡片上一欄可以讀的**每一個數字的名字**。
 * `keyof PlayerMatchStats` ∪ 結算層自己算出來的那幾個（今天只有 `mobKills`）。
 *
 * ⚠️ 它存在的理由是**反方向**（第二守則⑫）：在此之前欄位表是一個手寫陣列，
 * 於是「有資料而沒有欄位」結構上問不出來 —— `world.mobKills` 從 #215 起就在數，
 * 一場十回合量到 **2,748 隻**，而結算頁上**零欄**（GH#973 的量測）。
 * ⭐ 有了這一格，守衛才問得出「每一個今天真的會非零的數字，是不是要嘛有欄位、
 * 要嘛在 {@link SETTLEMENT_DATA_WITHOUT_COLUMN} 上帶著一個可以被反駁的理由」。
 */
export type SettlementDatum = keyof PlayerMatchStats | "mobKills";

/**
 * 結算層才有、⛔ 不在 `PlayerMatchStats` 上的數字。
 * `null` = **這一份封包沒有帶**（舊伺服器 / 手寫夾具）⇒ 那一列**不印**，
 * ⛔ 不是印 0 —— 一個分不出「沒有」與「零」的數字就是第一·五守則的空宣稱。
 */
export interface SettlementExtras {
  /** 整場殭屍擊殺（{@link settlementMobKills} 的輸出） */
  mobKills: number | null;
}

/** 什麼都沒帶的結算層資料 —— 手寫夾具與舊伺服器落到這裡。 */
export const NO_SETTLEMENT_EXTRAS: SettlementExtras = { mobKills: null };

/**
 * ⭐ 整場殭屍擊殺 —— 把**封包裡已經有的**每回合差值加總。
 *
 * ⛔ 為什麼不是加一格 `SettlementPlayer.mobKills`：這個數字**已經在線上了**。
 * `MatchSettlement.rounds[*].players[*].mobKills` 是 `world.mobKills` 的每回合
 * 差值（`MatchController.recordLedgerRound` + `foldFinalRoundResidual`），而
 * `foldFinalRoundResidual` 保證最後一回合把殘量摺回去 ⇒ ⭐ **Σ 差值 ≡ 伺服器的
 * 累積值**。2026-09-03 用三場真的比賽 × 12 席逐席量過：**36/36 逐位元相等**
 * （`settlementColumns.test.ts` 是它的閘）。多送一格等於第二個住處（第〇·四守則）。
 *
 * `null` ⇒ 這一份封包沒有 `rounds`（舊伺服器 / 夾具）⇒ 那一列不印。
 */
export function settlementMobKills(
  settlement: MatchSettlement | null,
  seatId: number,
): number | null {
  if (!settlement?.rounds) return null;
  let sum = 0;
  for (const r of settlement.rounds) {
    const mine = r.players.find((p) => p.seatId === seatId);
    if (mine) sum += mine.mobKills;
  }
  return sum;
}

/** 一個座位的結算層資料。面板拿它餵 {@link buildStatBreakdown}。 */
export function settlementExtras(
  settlement: MatchSettlement | null,
  seatId: number,
): SettlementExtras {
  return { mobKills: settlementMobKills(settlement, seatId) };
}

/**
 * 結算卡片上的**一欄**。
 *
 * ⭐ `sources` 是這一欄**讀了哪幾個數字**的機器可讀宣告，⛔ 不是註解 ——
 * 守衛從兩個方向讀它：①每一欄宣告的來源都要是真的存在的數字（⛔ 不可以憑空
 * 發明一欄）②每一個真的會非零的數字都要被某一欄涵蓋（⛔ 或明示豁免）。
 */
export interface SettlementColumn {
  key: string;
  label: string;
  /** 這一欄讀的數字。⚠️ 少寫一個 = 那個數字會被守衛當成「沒有欄位」而紅。 */
  sources: readonly SettlementDatum[];
  /** `null` ⇒ 這一份封包沒有這個數字 ⇒ **不印這一列**（⛔ 不是印 0）。 */
  render(stats: PlayerMatchStats, extras: SettlementExtras): string | null;
}

/**
 * 結算卡片的**欄位表** —— 順序就是畫面順序。
 *
 * ⚠️ 兩個消費端的格線都是 **2 欄**，所以相鄰兩列會排在同一橫列上：
 * 守護塔那一對必須落在**偶數索引**（「打了多少」與「打掉幾座」分開看沒有意義）。
 * ⇒ ⭐ 新欄位一律插在那一對**之後**，⛔ 不要插在它前面。
 */
export const SETTLEMENT_COLUMNS: readonly SettlementColumn[] = [
  {
    key: "kda",
    label: "KDA",
    sources: ["kills", "deaths", "assists"],
    render: (s) => `${formatKda(s)}  (${kdaRatio(s).toFixed(1)})`,
  },
  { key: "damageDealt", label: "傷害輸出", sources: ["damageDealt"], render: (s) => formatInt(s.damageDealt) },
  { key: "damageTaken", label: "承受傷害", sources: ["damageTaken"], render: (s) => formatInt(s.damageTaken) },
  { key: "damageBlocked", label: "抵擋傷害", sources: ["damageBlocked"], render: (s) => formatInt(s.damageBlocked) },
  // ⭐ GH#729 —— 守護塔是**中立目標物**，所以拆塔的輸出刻意不併進 `damageDealt`
  // （那一格的語意是「對敵方英雄的輸出」，而 rating.ts 就是照那個語意打分）。
  // ⚠️ 代價是：整場專心拆塔的人在此之前結算頁上**一個數字都沒有** —— sim 早就
  // 在數了（matchStats.guardianDamage / guardiansSlain），只是沒有人把它畫出來
  // （失敗形態⑧：算出來了但從沒送到玩家眼前）。⇒ 自己兩列。
  // ⭐ GH#973 量到（2026-09-03，三場真的比賽 × 12 席）：`guardianDamage`
  // **36/36 席非零**、`guardiansSlain` 28/36 —— ⛔ 守護塔**不是**裝飾性欄位，
  // 票文「今天還有守護塔嗎」的假前提在這裡被推翻。⇒ 兩列都留著。
  { key: "guardianDamage", label: "守護塔輸出", sources: ["guardianDamage"], render: (s) => formatInt(s.guardianDamage) },
  { key: "guardiansSlain", label: "守護塔擊破", sources: ["guardiansSlain"], render: (s) => formatInt(s.guardiansSlain) },
  // ⭐ GH#973 —— **殭屍波是每一回合的主要活動，而結算頁上零欄**（owner 2026-09-02：
  // 「遊戲回合評價 跟 遊戲整場結算評價反饋 似乎有點過時了」）。量到的底數：一場
  // 十回合 12 席打死 **2,748 隻**，36/36 席非零 —— 比守護塔那兩欄還普遍。
  // ⚠️ 回合評價那一半**早就接上了**（`roundVictory.ts` 的 objective 軸讀
  // `SeatState.mobKills`），⛔ 只有整場結算漏掉 —— 這一列就是那個缺口。
  {
    key: "mobKills",
    label: "殭屍擊殺",
    sources: ["mobKills"],
    render: (_s, x) => (x.mobKills === null ? null : formatInt(x.mobKills)),
  },
  { key: "healingDone", label: "治療量", sources: ["healingDone"], render: (s) => formatInt(s.healingDone) },
  { key: "cc", label: "控制時間", sources: ["ccAppliedTicks"], render: (s) => `${ticksToSeconds(s.ccAppliedTicks)}s` },
  { key: "accuracy", label: "技能命中率", sources: ["abilityHits", "abilityWhiffs"], render: (s) => formatAccuracy(s) },
  { key: "basic", label: "普攻命中", sources: ["basicAttackHits"], render: (s) => formatInt(s.basicAttackHits) },
  // ⭐ GH#729 —— 首殺賞金（`bountyGold`）**已經含在** `goldEarned` 裡
  // （`grantGold` 一律走 `recordGold`），所以它是括號裡的**子行**，⛔ 不是第二列：
  // 另開一列會讓玩家把同一筆錢加兩次。⚠️「含」這個字是那個語意的唯一載體 ——
  // 拿掉它，卡面就在說一件不會發生的事（第一·五守則）。
  // 沒吃到賞金就不長括號，與下面的「救援復活」同一個慣例。
  {
    key: "gold",
    label: "取得金錢",
    sources: ["goldEarned", "bountyGold"],
    render: (s) =>
      s.bountyGold > 0
        ? `${formatInt(s.goldEarned)} (含賞金 ${formatInt(s.bountyGold)})`
        : formatInt(s.goldEarned),
  },
  { key: "largest", label: "最大單次傷害", sources: ["largestSingleHit"], render: (s) => formatInt(s.largestSingleHit) },
  { key: "flowers", label: "治療花", sources: ["flowersEaten"], render: (s) => formatInt(s.flowersEaten) },
  // task #84: a rescue never erases a death, so it needs its own row or it
  // is invisible on the card. Received is shown beside it so a revived
  // player can see why their death count is not the whole story.
  {
    key: "revives",
    label: "救援復活",
    sources: ["revivesPerformed", "revivesReceived"],
    render: (s) =>
      s.revivesReceived > 0
        ? `${formatInt(s.revivesPerformed)} (被救 ${formatInt(s.revivesReceived)})`
        : formatInt(s.revivesPerformed),
  },
  { key: "alive", label: "存活時間", sources: ["timeAliveTicks"], render: (s) => `${ticksToSeconds(s.timeAliveTicks)}s` },
];

/**
 * ⭐ 今天**真的有值**但刻意**沒有欄位**的那些 —— 每一列一個**可以被反駁的理由**。
 *
 * ⛔ 這不是豁免名單，是一張**帳單**：守衛拿真的比賽量出「哪幾個數字會非零」，
 * 凡是既不在 {@link SETTLEMENT_COLUMNS} 也不在這裡的，就紅並指名它。
 * ⇒ 下一個往 `PlayerMatchStats` 加欄位的人**必須做一次選擇**，
 *   ⛔ 而不是像 `mobKills` 那樣安靜地缺席好幾個月。
 */
export const SETTLEMENT_DATA_WITHOUT_COLUMN: Readonly<Record<string, string>> = {
  xp: "它是**等級**的來源，⛔ 不是一個玩家會拿來互相比較的量；等級本身已經在卡面上。",
  abilityCasts:
    "「技能命中率」那一欄的分母已經是它（hits+whiffs）。⭐ 單獨的施放次數⛔ 不會改變玩家下一場的打法。",
  killParticipation:
    "KDA 那一欄與 `reflectionHints` 的「團戰參與度不足」已經在講同一件事；再開一欄是同一個事實的第二個數字（第〇·四守則）。",
  multikills:
    "由 `reflectionHints` 的「打出多殺」表達。⚠️ 量到只有 18/36 席非零 ⇒ 開一欄會讓**一半的人**看到一個 0。",
  coinsCollected:
    "⛔ **確認是缺口，⛔ 不是設計**：2026-09-03 三場真的比賽量到 **0/36**（出貨 `goldDrop` 是開著的，而 bot 從不投幣）。⭐ 到期條件 = 有任何一場量到非零，那一天它就該有一欄。",
};

/**
 * The ordered per-stat breakdown shown on a player's settlement card. Pure —
 * the component just renders these label/value pairs.
 *
 * ⭐ 表在 {@link SETTLEMENT_COLUMNS}，這一支只做「渲染 + 丟掉沒有值的列」。
 * ⚠️ `extras` 省略 ⇒ 結算層的那幾格是 `null` ⇒ 它們的列**不出現**（⛔ 不是 0）。
 */
export function buildStatBreakdown(
  stats: PlayerMatchStats,
  extras: SettlementExtras = NO_SETTLEMENT_EXTRAS,
): StatRow[] {
  const out: StatRow[] = [];
  for (const col of SETTLEMENT_COLUMNS) {
    const value = col.render(stats, extras);
    if (value === null) continue;
    out.push({ key: col.key, label: col.label, value });
  }
  return out;
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
  /**
   * Is this seat's champion STILL STANDING as the round resolves? Projected from
   * the authoritative entity snapshot (EntityState.alive), which the server does
   * not touch again between concludeCombat and the next enterCombat — so during
   * the round-end beat it means exactly "survived this round". This is the GATE
   * on the round MVP: 回合表現最好的人的底線門檻是必須最後還活著.
   * NOT `roundDeaths === 0`: a champion who was rescued by a revive circle (#84)
   * died this round yet is standing at the end, and is eligible.
   */
  alive: boolean;
  /**
   * Kills/deaths scored by this seat IN THE ROUND THAT JUST ENDED — the
   * server-authoritative per-round tallies (SeatState.roundKills/roundDeaths,
   * zeroed at every combat entry). Cumulative totals would present the match's
   * overall best killer every single round, which is the bug this replaced.
   */
  roundKills: number;
  roundDeaths: number;
}

/** The team fields the round-leader ranking reads (a RoomStore TeamView satisfies it). */
export interface RoundTeamView {
  teamId: number;
  lives: number;
  eliminated: boolean;
  placement: number;
  /**
   * What this team DID in the round that just ended — a protocol ROUND_OUTCOME
   * value (TeamState.roundOutcome), server-authoritative and reset at every
   * combat entry. NONE means it did not fight: it drew the BYE, it is
   * eliminated, or the round is not settled yet.
   *
   * The round-end presentation cannot derive this from anything else on the
   * snapshot: enterCombat parks a bye team's seats dead without ever emitting a
   * death, so a bye team reads alive:false / roundKills:0 / roundDeaths:0 on
   * every seat — byte-identical to a team that was instantly wiped.
   */
  roundOutcome: number;
}

/**
 * Is the MATCH decided (≤1 team still alive)? The round that eliminates the
 * penultimate team is a round-end that IS the match end — that beat belongs to
 * the settlement's local-win quote (moment 2), not the round-leader quote.
 */
export function matchDecided(teams: readonly RoundTeamView[]): boolean {
  return teams.filter((t) => !t.eliminated).length <= 1;
}

/**
 * ⭐ GH#126 —— 結算畫面的**團隊生命值**列，名次順序。
 *
 * 為什麼這一支要存在（而不是在 JSX 裡再排一次）：`compareTeamStanding` 已經是
 * 這個檔案裡「誰排在誰前面」的**唯一**答案，而 commit 97944609「取消淘汰」把
 * 團隊生命降級成純計分板之後，伺服器的 `finalStandings()` 正是拿 teamHealth
 * 遞減決定全場 2/3/4 名 —— 也就是說**生命值就是「你為什麼是第 3 名」的唯一解釋**。
 * 排序邏輯在畫面上分岔一次，玩家看到的名次就會跟他讀到的數字對不起來。
 *
 * ⚠️ 在此之前 `lives` 在整個客戶端只被這支**未匯出**的比較器當排序鍵讀過 ——
 * **拿來排序 ≠ 畫在畫面上**，而結算是唯一會看名次的畫面。
 *
 * ⛔ 不做任何格式化：純排序，回傳新陣列，輸入不被修改。
 */
export function settlementTeamLives<T extends RoundTeamView>(teams: readonly T[]): T[] {
  return [...teams].sort(compareTeamStanding);
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
 * Round-MVP comparator: the better performer OF THIS ROUND sorts first.
 * The chain is total and made only of authoritative integers, so it can never be
 * ambiguous and every client orders the roster identically:
 *   1. most round-kills
 *   2. fewest round-deaths   (survived the round better)
 *   3. lowest seatId         (final, always-decisive stable tiebreak)
 */
function compareRoundMvp(a: RoundSeatView, b: RoundSeatView): number {
  if (a.roundKills !== b.roundKills) return b.roundKills - a.roundKills;
  if (a.roundDeaths !== b.roundDeaths) return a.roundDeaths - b.roundDeaths;
  return a.seatId - b.seatId;
}

/**
 * The champion presented at the round-end beat: the ROUND MVP of the best-placed
 * team that ACTUALLY FOUGHT this round. Reads ONLY authoritative schema state
 * (roundOutcome / lives / eliminated / placement / teamId / seatId / alive /
 * per-round K/D), so every client computes the SAME champion, shows the SAME
 * model and plays the SAME clip — genuinely per-round, because the inputs change
 * every round.
 *
 * Three stages, not one ranking:
 *   CANDIDATES — teams that WON a duel this round; failing that, teams that at
 *          least FOUGHT; failing that, every team. A team that drew the BYE won
 *          nothing that round, so it must never be the subject of a round-WIN
 *          presentation — and it is the case that broke this selector before:
 *          a bye team is parked dead with an all-zero tally, so the alive gate
 *          found no survivors, the ranking degenerated to the lowest seatId, and
 *          「每回合都是同一個英雄」 came back for that round. Preferring winners
 *          also stops the round's LOSER being presented, which standings alone
 *          permit (settleRound has already deducted lives by the time the client
 *          reads the snapshot, so a loser at 3→2 outranks a winner at 1).
 *          The ladder ENDS at `teams` on purpose: pre-combat, legacy and
 *          fault-path snapshots are all-NONE, and there the answer must stay
 *          exactly what it was before this stage existed rather than vanish.
 *   GATE — 回合表現最好的人的底線門檻是必須最後還活著: only seats still ALIVE as
 *          the round resolves are eligible, however many kills a dead one got.
 *          If the chosen team was wiped too (mutual wipe / fire-ring / timeout
 *          win), the gate opens to the whole roster rather than presenting
 *          nobody.
 *   RANK — compareRoundMvp over the eligible seats.
 *
 * A zero-kill round therefore still resolves (fewest deaths, then lowest seat).
 * The GATE/RANK stages are retried down the ranking, so a candidate whose seats
 * have no championId yet hands the beat to the next-best team rather than
 * blanking it. Returns null ONLY when no team anywhere has a champion locked in.
 */
export function roundLeaderChampion(
  seats: readonly RoundSeatView[],
  teams: readonly RoundTeamView[],
): string | null {
  if (teams.length === 0 || seats.length === 0) return null;
  // MEMBERSHIP, never `!== NONE`: an inequality also accepts `undefined` and any
  // out-of-range value, so a RoundTeamView built by some future producer (a
  // replay/spectator projection, a hand-built fixture) would classify a BYE team
  // as a participant — the exact failure this selector exists to prevent.
  const won = (t: RoundTeamView): boolean => t.roundOutcome === ROUND_OUTCOME.WON;
  const fought = (t: RoundTeamView): boolean =>
    t.roundOutcome === ROUND_OUTCOME.FOUGHT ||
    t.roundOutcome === ROUND_OUTCOME.LOST ||
    won(t);
  const winners = teams.filter(won);
  const participants = teams.filter(fought);
  const candidates = winners.length > 0 ? winners : participants.length > 0 ? participants : teams;
  // Walk the ranking rather than indexing [0]: "never blank the presentation"
  // is only true if a candidate with NO champion locked in (the #130 shape, or a
  // seat list that has not caught up with the team list) falls through to the
  // next-best team instead of silencing the whole beat. The `teams` tail means
  // null now says "no champion anywhere", which is the only case that should.
  const ordered = [...candidates].sort(compareTeamStanding);
  const fallback = [...teams].sort(compareTeamStanding);
  for (const team of [...ordered, ...fallback]) {
    const roster = seats.filter((s) => s.teamId === team.teamId && s.championId);
    if (roster.length === 0) continue;
    const survivors = roster.filter((s) => s.alive);
    const eligible = survivors.length > 0 ? survivors : roster;
    return [...eligible].sort(compareRoundMvp)[0]!.championId;
  }
  return null;
}

/**
 * The whole winning TEAM's champions, MVP first — what the round-end stage
 * actually presents (owner, 2026-07-27: 「勝利的時候應該秀隊伍三人的模組」).
 *
 * Deliberately built ON TOP of {@link roundLeaderChampion} rather than beside
 * it: that function already owns every hard-won rule about which team counts
 * (BYE teams excluded by MEMBERSHIP, winners before participants, a team with
 * nobody locked in falling through to the next), and forking those rules into a
 * second selector is how the model on screen and the voice you hear drift apart.
 * So the MVP is resolved first, its TEAM is read off that seat, and the rest of
 * the roster is appended behind it.
 *
 * MVP FIRST is load-bearing twice over: the taunt belongs to `[0]`, and on a
 * narrow viewport the leftmost card is the one a player looks at.
 *
 * Empty ⇒ present nothing, exactly as a null champion did.
 */
export function roundWinnerTeamChampions(
  seats: readonly RoundSeatView[],
  teams: readonly RoundTeamView[],
): string[] {
  const mvp = roundEndQuoteChampion(seats, teams);
  if (!mvp) return [];
  const mvpSeat = seats.find((s) => s.championId === mvp);
  if (!mvpSeat) return [mvp];
  const mates = seats
    .filter((s) => s.teamId === mvpSeat.teamId && s.championId && s.championId !== mvp)
    .sort(compareRoundMvp)
    .map((s) => s.championId);
  return [mvp, ...mates];
}

/**
 * The champion whose quote plays at a ROUND-end settlement (moment 3): the
 * round's MVP (roundLeaderChampion), EXCEPT on the match-deciding round (whose
 * beat is the settlement's local-win quote). Null ⇒ silent (no round-end quote
 * this round). The round-winner MODEL (#143, GameApp.updateRoundWinner) resolves
 * through this very function, so the hero on screen and the voice you hear are
 * always the same champion — do not fork the selection.
 */
export function roundEndQuoteChampion(
  seats: readonly RoundSeatView[],
  teams: readonly RoundTeamView[],
): string | null {
  if (matchDecided(teams)) return null;
  return roundLeaderChampion(seats, teams);
}
