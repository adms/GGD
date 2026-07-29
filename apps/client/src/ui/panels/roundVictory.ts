/**
 * roundVictory — 回合勝利畫面的 PURE 模型 (#212).
 *
 * owner: 「回合顯示勝利：需要顯示自己隊伍 3d model 與打得好的評價建議及
 *         團隊累積積分」
 *
 * 三件事,三個歸屬:
 *   3D 模型   render/RoundWinnerStage(#143 已經在做,MVP 在前、整隊排成一列)
 *   評價/建議 這一支 —— 但**推導不在這裡**,見 §1
 *   累積積分  panels/teamLedger(唯一計算處,結算畫面讀同一支)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 1. 等第是 `gradeRound()` 算的,這個檔案一格都不算
 * ═══════════════════════════════════════════════════════════════════════════
 * `sim/stats/roundGrade` 是 S~D 的**唯一**推導處,它的檔頭把理由寫死了:兩個
 * 畫面各推一份,同一個回合就會給玩家兩個不同的等第,而玩家沒有辦法分辨哪一個
 * 是真的。所以這裡只做兩件事 —— 把線上有的事實**填成** `RoundPerformance`,
 * 然後把 `gradeRound` 吐出來的東西翻成中文。分數、切階、排序建議全部是它的。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 2. 七個軸裡,線上只餵得起三個 —— 其餘四個權重設 0,不是餵零
 * ═══════════════════════════════════════════════════════════════════════════
 * `RoundPerformance` 要 13 個欄位。逐個對過 `SeatState`(protocol/schema.ts)
 * 之後,**per-round 真的在線上的只有**:`roundKills`、`roundDeaths`、
 * `alive`、`mobKills`(整場累積,見下)。damageDealt / damageTaken /
 * damageBlocked / healingDone / ccAppliedTicks / abilityHits / abilityWhiffs
 * 通通只活在伺服器的 `PlayerMatchStats` 裡,而且是**整場累積**、只在 match 結束
 * 的 `matchSettlement` 事件裡到過客戶端一次。
 *
 * 把那些欄位填 0 會是災難性的**安靜**錯誤:`damage`/`tanking`/`support` 三軸
 * 恆為 0、`accuracy` 落到中位 0.5,加權之後每個人的分數都被同一個常數壓著,
 * 於是全場長期拿 C/D —— 畫面照畫、沒有任何錯誤,而等第完全失去意義。
 * (`roundGrade.ts` 自己在 `roundGradeFromDoc` 的註解裡點名了這個形態。)
 *
 * 正確做法是 barrier lane 已經留好的那一個:**權重設 0**。
 *   · `roundGradeScore` 用 Σweights 正規化 → 分母只剩看得見的三軸,分數不會被
 *     四個結構性的 0 稀釋。
 *   · `roundAdvice` / `roundStrengths` 明文 `if (w <= 0) return` → 看不見的軸
 *     永遠不會變成建議。叫玩家去練一件這個畫面根本沒有量到的事,比不給建議更糟。
 * 三個活著的軸保留出貨值的**相對比例**(combat .2 / survival .16 / objective
 * .1),所以這不是另一套權重,是同一套的一個子集。
 *
 * 面板把看得到什麼直接印在卡片上({@link ROUND_VICTORY_BASIS}),理由和
 * `roundReport.ROUND_GRADE_BASIS` 一樣:等第不可以讓玩家以為它看過它沒看過的東西。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 3. 三個軸各自怎麼填
 * ═══════════════════════════════════════════════════════════════════════════
 * combat     `roundKills` / `roundDeaths` 直接進。`assists` 線上沒有 → 0,
 *            所以這一軸只獎勵親手拿的人頭。這是**低估**不是造假。
 * survival   線上只有 `alive` 布林。但「被復活過(#84)比乾淨活著差、死兩次比
 *            死一次差」這條規則 `roundReport.roundSurvivalScore` 已經有了而且
 *            有測試 —— 所以這裡**呼叫它**再乘上一個單位刻度,不另寫一條。
 *            (survivedTicks/roundTicks 這個比值就是這樣被造出來的。)
 * objective  `SeatState.mobKills` 是**整場累積**(schema.ts 明講,而且
 *            MobSystem 的回合拆除刻意不清它)。所以這一回合的擊殺數是
 *            `本回合的值 − 上一回合記錄的值`,上一回合的值由 teamLedger 這條
 *            線上的呼叫端提供。拿不到前值 → 差為 0,寧可少算不要多算。
 *            `bossKills` 線上沒有 → 0。
 */
import { ROUND_OUTCOME } from "@ggd/shared/protocol/schema";
import {
  DEFAULT_ROUND_GRADE_CONFIG,
  GRADE_AXES,
  ADVICE_CODES,
  PRAISE_CODES,
  gradeRound,
  normalizeRoundGradeConfig,
  type GradeAxis,
  type RoundAdvice,
  type RoundGrade,
  type RoundGradeConfig,
  type RoundGradeResult,
  type RoundPerformance,
} from "@ggd/shared/sim/stats/roundGrade";
import { roundSurvivalScore } from "./roundReport";
import type { TeamLedgerEntry } from "./teamLedger";

/**
 * survival 軸的刻度。`gradeRound` 要的是 `survivedTicks / ctx.roundTicks`,
 * 而線上只有一個布林 + 陣亡次數,所以這裡把 `roundSurvivalScore` 的 [0,1]
 * 乘回一個固定分母。100 是刻度不是時間 —— 用 tick 數會讓人以為這是量到的秒數。
 */
export const SURVIVAL_UNIT = 100;

/** 這個畫面量得到的軸。其餘四個權重是 0(見 §2)。 */
export const ROUND_VICTORY_AXES: readonly GradeAxis[] = ["combat", "survival", "objective"];

/**
 * 這個畫面用的評分設定 —— 出貨設定的**子集**,不是第二套。
 * 走 `normalizeRoundGradeConfig`,所以上下界與門檻遞減仍然由 barrier lane 守。
 */
export const ROUND_VICTORY_GRADE_CONFIG: RoundGradeConfig = normalizeRoundGradeConfig({
  ...DEFAULT_ROUND_GRADE_CONFIG,
  weights: Object.fromEntries(
    GRADE_AXES.map((axis) => [
      axis,
      ROUND_VICTORY_AXES.includes(axis) ? DEFAULT_ROUND_GRADE_CONFIG.weights[axis] : 0,
    ]),
  ) as Record<GradeAxis, number>,
});

/** 印在卡片上的「這個等第看過什麼」。少了它,等第就是在冒充它沒量到的東西。 */
export const ROUND_VICTORY_BASIS = "只計 擊殺·陣亡·存活·殭屍 · 傷害與命中率在結算畫面";

/** 一個座位這一回合的線上事實。全部來自 `SeatView`,沒有一個是推出來的。 */
export interface RoundVictorySeat {
  seatId: number;
  teamId: number;
  championId: string;
  displayName: string;
  roundKills: number;
  roundDeaths: number;
  alive: boolean;
  /** `SeatView.mobKills` —— **整場累積**,見 §3 */
  mobKills: number;
}

export interface RoundVictoryInput {
  matchId: string;
  /** `HudState.round` —— 剛打完的那一回合 */
  round: number;
  /** 本機座位的 teamId,`null` = 觀戰 / 還沒有座位 */
  localTeamId: number | null;
  /** 本機座位的 seatId,`null` = 觀戰。決定卡片上那個大字母是誰的。 */
  selfSeatId: number | null;
  /** 本機隊伍的 `TeamView.roundOutcome` */
  outcome: number;
  seats: readonly RoundVictorySeat[];
  /** seatId → 上一回合結束時的 `mobKills`。缺 = 差為 0(見 §3)。 */
  prevMobKills: Readonly<Record<number, number>>;
}

/** 一條翻成中文的建議 / 稱讚。`score` 是它自己的證據。 */
export interface RoundVictoryLine {
  axis: GradeAxis;
  code: string;
  text: string;
  /** 那一軸的分數 ∈ [0,1] —— 面板要畫條就用它 */
  score: number;
}

export interface RoundVictoryMember {
  seat: RoundVictorySeat;
  grade: RoundGradeResult;
  /** 這一回合的積分,進 teamLedger 的就是它 */
  points: number;
  /** 這一回合的殭屍擊殺 DELTA(不是整場累積) */
  mobKillsThisRound: number;
}

export type RoundVictoryState = "victory" | "defeat" | "undecided" | "bye" | "no-seat";

export interface RoundVictoryModel {
  state: RoundVictoryState;
  round: number;
  /** 本機隊伍的成員,分數高的在前 */
  members: RoundVictoryMember[];
  /** 本機玩家自己那一列(members 裡的一個),沒有座位時 null */
  self: RoundVictoryMember | null;
  /** 自己這一回合的評價與建議;沒有座位時 null */
  grade: RoundGradeResult | null;
  advice: RoundVictoryLine[];
  strengths: RoundVictoryLine[];
  headline: string;
  /** 要寫進 teamLedger 的那一批(本機看得到的所有座位,不只自己這隊) */
  ledgerEntries: TeamLedgerEntry[];
}

// ────────────────────────────────────────────────────────────── the wording ──

/**
 * 每個軸的建議文字。**七個軸都要有**,即使有四個在這個畫面永遠不會出現 ——
 * `roundVictory.test.ts` 逐個比對 `ADVICE_CODES` / `PRAISE_CODES`,所以上游多
 * 加一個軸會讓測試紅,而不是讓畫面印出一個 i18n 代號給玩家看。
 */
export const ADVICE_TEXT: Readonly<Record<GradeAxis, string>> = Object.freeze({
  combat: "換血吃虧了 —— 先手前確認隊友跟得上,不要單獨進場",
  damage: "傷害輸出偏低 —— 技能冷卻好就要打出去,不要囤著",
  tanking: "沒有替隊伍擋下傷害 —— 前排位置再往前一點",
  survival: "活得不夠久 —— 血量低於一半就先脫離,回來再打",
  support: "治療與控制的貢獻少 —— 控制技留給對方的關鍵技能",
  objective: "殭屍清得少 —— 波次來的時候先清怪,那是金幣與等級",
  accuracy: "技能空了不少 —— 預判走位,或等對方交出位移再放",
});

/** 每個軸的稱讚文字。同上,七個都要有。 */
export const PRAISE_TEXT: Readonly<Record<GradeAxis, string>> = Object.freeze({
  combat: "換血打得漂亮,這波是你帶起來的",
  damage: "輸出穩定,傷害是隊上的主力",
  tanking: "替隊伍吃下傷害,前排站得很好",
  survival: "全程站住沒有倒下,位置抓得準",
  support: "治療與控制都到位,團隊被你撐住了",
  objective: "殭屍清得乾淨,資源全被你吃下來",
  accuracy: "技能命中率很高,幾乎沒有空放",
});

/** 等第 → 一句只講這一回合的中文標題。 */
export const ROUND_VICTORY_HEADLINE: Readonly<Record<RoundGrade, string>> = Object.freeze({
  S: "這回合你就是主角",
  A: "打得很好的一回合",
  B: "穩,但還有空間",
  C: "這回合吃了虧",
  D: "這回合幾乎沒打出來",
});

/** 等第顏色,和商店戰報卡同一套(玩家在兩個畫面看到的是同一個 S)。 */
export const ROUND_VICTORY_COLOR: Readonly<Record<RoundGrade, string>> = Object.freeze({
  S: "#f2c637",
  A: "#46c8b0",
  B: "#7f97c8",
  C: "#8d97ad",
  D: "#c9736b",
});

// ─────────────────────────────────────────────────────────────── the maths ──

/**
 * 線上事實 → `RoundPerformance`。看不見的欄位一律 0,而它們對應的軸權重是 0
 * (§2),所以那些 0 進不了分數。
 */
export function roundVictoryPerformance(
  seat: RoundVictorySeat,
  mobKillsThisRound: number,
): RoundPerformance {
  return {
    kills: Math.max(0, seat.roundKills),
    deaths: Math.max(0, seat.roundDeaths),
    assists: 0, // 線上沒有
    damageDealt: 0, // weight 0
    damageTaken: 0, // weight 0
    damageBlocked: 0, // weight 0
    healingDone: 0, // weight 0
    ccAppliedTicks: 0, // weight 0
    abilityHits: 0, // weight 0
    abilityWhiffs: 0, // weight 0
    mobKills: Math.max(0, mobKillsThisRound),
    bossKills: 0, // 線上沒有
    survivedTicks: Math.round(roundSurvivalScore(seat.alive, seat.roundDeaths) * SURVIVAL_UNIT),
  };
}

/** 一個座位的評價 —— 入口只有 `gradeRound`(§1)。 */
export function roundVictoryGrade(
  seat: RoundVictorySeat,
  mobKillsThisRound: number,
  cfg: RoundGradeConfig = ROUND_VICTORY_GRADE_CONFIG,
): RoundGradeResult {
  return gradeRound(roundVictoryPerformance(seat, mobKillsThisRound), { roundTicks: SURVIVAL_UNIT }, cfg);
}

/**
 * 分數 → 積分點數。整數,因為它會被跨回合加總後印在畫面上,而
 * 「37.4218 分」不是任何人想讀的東西。
 */
export function roundVictoryPoints(grade: RoundGradeResult): number {
  return Math.round(grade.score * 100);
}

/** `RoundAdvice[]` → 翻好的中文行。 */
function toLines(
  entries: readonly RoundAdvice[],
  table: Readonly<Record<GradeAxis, string>>,
): RoundVictoryLine[] {
  return entries.map((e) => ({ axis: e.axis, code: e.code, text: table[e.axis], score: e.score }));
}

/** 這一回合的殭屍擊殺 DELTA(§3)。 */
export function mobKillsDelta(
  seat: RoundVictorySeat,
  prev: Readonly<Record<number, number>>,
): number {
  const before = prev[seat.seatId];
  if (typeof before !== "number" || !Number.isFinite(before)) return 0;
  return Math.max(0, seat.mobKills - before);
}

/**
 * 整個回合勝利畫面,一次算完。
 *
 * `state` 的四種「沒有可評的東西」和商店戰報卡分得一樣細,理由也一樣:輪空的
 * 隊伍被 `enterCombat` 停在場邊、零殺零死不活著,和被瞬間清台的隊伍在數字上
 * **一模一樣**,只有 `roundOutcome` 分得出來(#173 就是這個 bug)。給輪空的人
 * 一個 D 是拿字母重演那個 bug。
 */
export function buildRoundVictory(input: RoundVictoryInput): RoundVictoryModel {
  const blank: Omit<RoundVictoryModel, "state" | "headline"> = {
    round: input.round,
    members: [],
    self: null,
    grade: null,
    advice: [],
    strengths: [],
    ledgerEntries: [],
  };

  if (input.localTeamId === null) {
    return { ...blank, state: "no-seat", headline: "觀戰中 —— 這回合沒有你的數據" };
  }
  if (input.outcome === ROUND_OUTCOME.NONE) {
    return { ...blank, state: "bye", headline: `第 ${input.round} 回合輪空 —— 沒有上場,不評分` };
  }

  // 帳本收的是**本機看得到的所有座位**,不只自己這隊 —— 團隊積分是一張排行,
  // 只記自己那一隊的話它就只是個人分數換了個標籤。
  const graded = input.seats.map((seat) => {
    const delta = mobKillsDelta(seat, input.prevMobKills);
    const grade = roundVictoryGrade(seat, delta);
    return {
      seat,
      grade,
      points: roundVictoryPoints(grade),
      mobKillsThisRound: delta,
    } satisfies RoundVictoryMember;
  });

  const members = graded
    .filter((m) => m.seat.teamId === input.localTeamId)
    // 分數高的在前;同分照 seatId 升冪,所以排序是決定性的
    .sort((a, b) => (b.points !== a.points ? b.points - a.points : a.seat.seatId - b.seat.seatId));

  const self = members.find((m) => m.seat.seatId === input.selfSeatId) ?? null;
  const grade = self?.grade ?? null;
  const state: RoundVictoryState =
    input.outcome === ROUND_OUTCOME.WON
      ? "victory"
      : input.outcome === ROUND_OUTCOME.LOST
        ? "defeat"
        : "undecided";

  return {
    state,
    round: input.round,
    members,
    self,
    grade,
    advice: grade ? toLines(grade.advice, ADVICE_TEXT) : [],
    strengths: grade ? toLines(grade.strengths, PRAISE_TEXT) : [],
    headline: grade
      ? ROUND_VICTORY_HEADLINE[grade.grade]
      : state === "victory"
        ? "隊伍拿下這回合"
        : "這回合結束",
    ledgerEntries: graded.map((m) => ({
      seatId: m.seat.seatId,
      teamId: m.seat.teamId,
      points: m.points,
    })),
  };
}

/** 兩張代號表都必須被翻譯過 —— 測試用,不是裝飾。 */
export function untranslatedAxes(): GradeAxis[] {
  return GRADE_AXES.filter(
    (axis) =>
      !ADVICE_CODES[axis] ||
      !PRAISE_CODES[axis] ||
      !ADVICE_TEXT[axis] ||
      !PRAISE_TEXT[axis],
  );
}
