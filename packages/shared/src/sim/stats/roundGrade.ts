/**
 * roundGrade —— 每回合 S~D 評價與改善建議的**唯一**推導處 (#212 回合勝利畫面 /
 * #232 商店右側評價卡)。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼它不是 rating.ts 的一部分
 * ─────────────────────────────────────────────────────────────────────────────
 * `rating.ts` 評的是**整場**:輸入是 `PlayerMatchStats`(從英雄生成起累積、
 * 整場不歸零),輸出是 12 階的 S+ … C-,消費者是結算畫面 (#25)。
 *
 * 這一份評的是**一個回合**:輸入是一份 DELTA(`RoundPerformance`,一回合之內
 * 打出來的量),輸出是 owner 點名的 5 階 S~D,消費者是回合勝利畫面與下一場的
 * 商店卡。兩者的分母、時間尺度、階數都不同,硬併成一支會讓「這一場打得很好但
 * 整場落後」這種常態變成無法表達。
 *
 * ⚠️ 但**推導只有這一支**。#212 與 #232 都呼叫 {@link gradeRound};任何一邊
 * 自己算一次分數,兩個畫面就會在同一個回合給玩家兩個不同的等第,而玩家沒有辦法
 * 分辨哪一個是真的。`roundGrade.test.ts` 用突變測試釘住「等第是從統計推導出來
 * 的」——把 {@link roundGradeScore} 改成常數,五條戰績會全部收斂成同一階。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 公式(可稽核)
 * ─────────────────────────────────────────────────────────────────────────────
 * 七個軸,每一軸是一個飽和比值 ∈ [0,1]:
 *
 *   combat    = (K+A)/max(1,D)               / refs.kda
 *   damage    = damageDealt                  / refs.damage
 *   tanking   = (damageTaken+damageBlocked)  / refs.tanking
 *   survival  = survivedTicks                / ctx.roundTicks
 *   support   = healingDone/refs.healing 與 ccAppliedTicks/refs.ccTicks
 *               依 mix.supportHealShare 混合
 *   objective = (mobKills + bossKills*mix.bossKillWeight) / refs.objective
 *   accuracy  = abilityHits/(abilityHits+abilityWhiffs)
 *               (沒有射出任何技能彈 → mix.neutralAccuracy,不獎不罰)
 *
 *   score = Σ weights[axis]·axis / Σ weights[axis]      ∈ [0,1]
 *   grade = 第一個 score >= cuts[g] 的 g,都不到就是 D
 *
 * 每一個數字都在 {@link RoundGradeConfig} 裡,沒有一個寫死在算式中(第一守則)。
 * 出貨值見 `content/config/round-grade.json`,Zod 見
 * `content/schema/roundGrade.ts`,後台欄位清單見該檔檔頭。
 *
 * ⚠️ 純度:這是 sim/**。沒有 Math.random / Date.now / 三角函式 / 冪次;軸的
 * 迭代順序永遠是 {@link GRADE_AXES} 這個固定陣列,不是物件的 key 順序,所以
 * 同樣的輸入在任何引擎上都給同樣的字串陣列。
 */

/** owner 點名的五階。索引越小越好,`ROUND_GRADES.indexOf` 可直接比大小。 */
export const ROUND_GRADES = ["S", "A", "B", "C", "D"] as const;
export type RoundGrade = (typeof ROUND_GRADES)[number];

/**
 * 七個評價軸,**固定順序**。這個陣列同時是:權重表的鍵、建議碼表的鍵、以及
 * 所有迭代的順序來源 —— 所以不管是誰在讀,軸的順序都一樣。
 */
export const GRADE_AXES = [
  "combat",
  "damage",
  "tanking",
  "survival",
  "support",
  "objective",
  "accuracy",
] as const;
export type GradeAxis = (typeof GRADE_AXES)[number];

/** 七個軸的分數,每個 ∈ [0,1]。 */
export type AxisScores = Readonly<Record<GradeAxis, number>>;

/** S/A/B/C 的下界。低於 `C` 就是 D —— D 沒有自己的門檻,它是「都不到」。 */
export interface RoundGradeCuts {
  S: number;
  A: number;
  B: number;
  C: number;
}

/** 每個軸在總分裡的權重。不必和為 1,{@link roundGradeScore} 會正規化。 */
export type RoundGradeWeights = Readonly<Record<GradeAxis, number>>;

/** 各軸的「滿分參考值」——打到這個量,那一軸就是 1.0。 */
export interface RoundGradeRefs {
  /** (K+A)/D 到多少算滿分 */
  kda: number;
  /** 一回合對敵方英雄的傷害 */
  damage: number;
  /** 一回合的承傷 + 減免 */
  tanking: number;
  /** 一回合的治療量 */
  healing: number;
  /** 一回合施加的控制 tick 數 */
  ccTicks: number;
  /** 一回合的目標擊殺數(小怪 + 加權後的王) */
  objective: number;
}

/** 三個混合係數 —— 它們原本會是算式裡的魔術數字。 */
export interface RoundGradeMix {
  /** support 軸裡治療佔的比重,剩下的給控制。0 = 只看控制,1 = 只看治療。 */
  supportHealShare: number;
  /** 一次王擊殺在 objective 軸上等於幾隻小怪 */
  bossKillWeight: number;
  /** 完全沒有射出技能彈時 accuracy 軸給的分(不獎不罰的中位) */
  neutralAccuracy: number;
}

export interface RoundGradeConfig {
  cuts: RoundGradeCuts;
  weights: RoundGradeWeights;
  refs: RoundGradeRefs;
  mix: RoundGradeMix;
  /** 一張卡最多列幾條改善建議 */
  adviceCount: number;
  /** 分數 >= 這個值的軸不會被列成「要改善」 */
  adviceCeiling: number;
  /** 分數 >= 這個值的軸才會被列成「打得好」 */
  praiseFloor: number;
}

/**
 * 出貨預設 —— **缺文件時讀的就是這一份**,不是空表。
 *
 * ⚠️ 這裡每一個數字都要和 `content/config/round-grade.json` 一字不差,
 * `roundGrade.test.ts` 的 drift 斷言在守。兩者存在的理由不同:JSON 是操作者會
 * 改的出貨值,這一份是內容掛掉時遊戲仍然評得出等第的保險絲。
 *
 * 參考值的量級是從 `rating.ts` 的整場參考值除以典型回合數推來的:整場
 * DMG_REF = 12000、TANK_REF = 18000、HEAL_REF = 6000,一場約 6~7 個戰鬥回合,
 * 所以一回合的滿分線落在 2000 / 3000 / 1000。CC 300 tick = 10 秒 @30Hz,和
 * rating.ts 的 CC_REF 同義但同樣是「一個回合之內」。
 */
export const DEFAULT_ROUND_GRADE_CONFIG: RoundGradeConfig = {
  cuts: { S: 0.8, A: 0.65, B: 0.5, C: 0.32 },
  weights: {
    combat: 0.2,
    damage: 0.22,
    tanking: 0.12,
    survival: 0.16,
    support: 0.1,
    objective: 0.1,
    accuracy: 0.1,
  },
  refs: {
    kda: 4,
    damage: 2000,
    tanking: 3000,
    healing: 1000,
    ccTicks: 300,
    objective: 8,
  },
  mix: {
    supportHealShare: 0.6,
    bossKillWeight: 10,
    neutralAccuracy: 0.5,
  },
  adviceCount: 3,
  adviceCeiling: 0.6,
  praiseFloor: 0.7,
};

/**
 * 每個可調欄位的 **[下界, 上界]**。
 *
 * ⚠️ 上界不是裝飾。`validateField` 在 2026-07-29 之前只檢查下界,所以 0.5 打成
 * 5 會過後台、在下游才被靜默夾掉(同 #277)。後台頁要直接讀這張表當 min/max,
 * {@link normalizeRoundGradeConfig} 也讀它,兩邊守的是同一組數字。
 *
 * 鍵是**點路徑**,和後台表單的欄位 id 一致。
 */
export const ROUND_GRADE_BOUNDS: Readonly<Record<string, readonly [number, number]>> =
  Object.freeze({
    "cuts.S": [0, 1],
    "cuts.A": [0, 1],
    "cuts.B": [0, 1],
    "cuts.C": [0, 1],
    "weights.combat": [0, 10],
    "weights.damage": [0, 10],
    "weights.tanking": [0, 10],
    "weights.survival": [0, 10],
    "weights.support": [0, 10],
    "weights.objective": [0, 10],
    "weights.accuracy": [0, 10],
    "refs.kda": [0.1, 100],
    "refs.damage": [1, 1000000],
    "refs.tanking": [1, 1000000],
    "refs.healing": [1, 1000000],
    "refs.ccTicks": [1, 100000],
    "refs.objective": [1, 10000],
    "mix.supportHealShare": [0, 1],
    "mix.bossKillWeight": [0, 1000],
    "mix.neutralAccuracy": [0, 1],
    adviceCount: [0, 7],
    adviceCeiling: [0, 1],
    praiseFloor: [0, 1],
  });

/**
 * 一個玩家在**一個回合**打出來的量。全部是 DELTA,不是整場累積。
 *
 * 這個介面刻意只描述「評分需要的欄位」,`RoundPlayerRecord`
 * (stats/matchLedger.ts)是它的超集 —— 所以 ledger 的紀錄可以直接餵進來,而
 * 這一支不必反過來 import ledger(單向相依,沒有循環)。
 */
export interface RoundPerformance {
  kills: number;
  deaths: number;
  assists: number;
  damageDealt: number;
  damageTaken: number;
  damageBlocked: number;
  healingDone: number;
  ccAppliedTicks: number;
  abilityHits: number;
  abilityWhiffs: number;
  /** 這一回合擊殺的小怪(殭屍)數 */
  mobKills: number;
  /** 這一回合擊殺的王(殭屍王 / 守衛 / 塔)數 */
  bossKills: number;
  /** 這一回合活著的 tick 數 */
  survivedTicks: number;
}

/** 評分需要的回合脈絡。`roundTicks` 是 survival 軸的分母。 */
export interface RoundGradeContext {
  /** 這個回合的戰鬥總長度(tick)。0 → survival 軸算 0(沒有可比的基準)。 */
  roundTicks: number;
}

/** 一條改善建議 / 一句稱讚。`code` 是**代號**,翻譯留給 client。 */
export interface RoundAdvice {
  axis: GradeAxis;
  /** i18n 代號。UI 自己查表,sim 不產生任何顯示字串。 */
  code: string;
  /** 那一軸的分數 ∈ [0,1] —— UI 要畫進度條就用它 */
  score: number;
  /**
   * 這一軸還能賺回多少總分:`weight × (adviceCeiling − score)`。
   * 建議是照它由大到小排的 —— 「哪裡最值得練」,不是「哪裡最低分」。一個權重
   * 0.02 的軸拿 0 分,不該擠掉權重 0.25 拿 0.4 分的軸。
   */
  gain: number;
}

/** {@link gradeRound} 的完整輸出 —— #212 與 #232 都讀這一個物件。 */
export interface RoundGradeResult {
  grade: RoundGrade;
  /** 加權平均 ∈ [0,1]。UI 要顯示百分比就用它,不要自己再算一次。 */
  score: number;
  axes: AxisScores;
  /** 要改善的軸,最值得練的排前面 */
  advice: RoundAdvice[];
  /** 打得好的軸,最高分排前面 */
  strengths: RoundAdvice[];
}

/** 每個軸的改善建議代號(i18n key)。 */
export const ADVICE_CODES: Readonly<Record<GradeAxis, string>> = Object.freeze({
  combat: "advice.combat.trades",
  damage: "advice.damage.output",
  tanking: "advice.tanking.frontline",
  survival: "advice.survival.positioning",
  support: "advice.support.utility",
  objective: "advice.objective.mobs",
  accuracy: "advice.accuracy.aim",
});

/** 每個軸的稱讚代號(i18n key)。 */
export const PRAISE_CODES: Readonly<Record<GradeAxis, string>> = Object.freeze({
  combat: "praise.combat.trades",
  damage: "praise.damage.output",
  tanking: "praise.tanking.frontline",
  survival: "praise.survival.positioning",
  support: "praise.support.utility",
  objective: "praise.objective.mobs",
  accuracy: "praise.accuracy.aim",
});

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function clampTo(n: number, key: string, fallback: number): number {
  const b = ROUND_GRADE_BOUNDS[key];
  if (!Number.isFinite(n)) return fallback;
  if (!b) return n;
  return n < b[0] ? b[0] : n > b[1] ? b[1] : n;
}

/** 安全除法 —— 分母 <= 0 一律回 0,不會生出 Infinity 或 NaN 污染總分。 */
function ratio(num: number, den: number): number {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return 0;
  return num / den;
}

/**
 * 把操作者(或壞掉的文件)給的設定夾回可用範圍。
 *
 * 兩件事:
 *  1. 每個欄位夾進 {@link ROUND_GRADE_BOUNDS}(**上下界都夾**),非數字退回預設。
 *  2. **門檻強制遞減**:S >= A >= B >= C。後台把 A 打成 0.9 而 S 是 0.8 的話,
 *     A 會被夾成 0.8 —— 而不是讓 `roundGradeFromScore` 產生一個永遠拿不到 A
 *     的階梯(那會是一個沒有任何錯誤訊息的靜默故障)。
 */
export function normalizeRoundGradeConfig(raw: Partial<RoundGradeConfig> | undefined): RoundGradeConfig {
  const d = DEFAULT_ROUND_GRADE_CONFIG;
  const rawCuts = raw?.cuts;
  const S = clampTo(rawCuts?.S ?? d.cuts.S, "cuts.S", d.cuts.S);
  let A = clampTo(rawCuts?.A ?? d.cuts.A, "cuts.A", d.cuts.A);
  let B = clampTo(rawCuts?.B ?? d.cuts.B, "cuts.B", d.cuts.B);
  let C = clampTo(rawCuts?.C ?? d.cuts.C, "cuts.C", d.cuts.C);
  if (A > S) A = S;
  if (B > A) B = A;
  if (C > B) C = B;

  const weights = {} as Record<GradeAxis, number>;
  for (const axis of GRADE_AXES) {
    const v = raw?.weights?.[axis];
    weights[axis] = clampTo(v ?? d.weights[axis], `weights.${axis}`, d.weights[axis]);
  }

  const refKeys = ["kda", "damage", "tanking", "healing", "ccTicks", "objective"] as const;
  const refs = {} as RoundGradeRefs;
  for (const k of refKeys) {
    const v = raw?.refs?.[k];
    refs[k] = clampTo(v ?? d.refs[k], `refs.${k}`, d.refs[k]);
  }

  const mixKeys = ["supportHealShare", "bossKillWeight", "neutralAccuracy"] as const;
  const mix = {} as RoundGradeMix;
  for (const k of mixKeys) {
    const v = raw?.mix?.[k];
    mix[k] = clampTo(v ?? d.mix[k], `mix.${k}`, d.mix[k]);
  }

  return {
    cuts: { S, A, B, C },
    weights,
    refs,
    mix,
    adviceCount: Math.trunc(clampTo(raw?.adviceCount ?? d.adviceCount, "adviceCount", d.adviceCount)),
    adviceCeiling: clampTo(raw?.adviceCeiling ?? d.adviceCeiling, "adviceCeiling", d.adviceCeiling),
    praiseFloor: clampTo(raw?.praiseFloor ?? d.praiseFloor, "praiseFloor", d.praiseFloor),
  };
}

/**
 * 讀一份 `config.round-grade@1` 文件。
 *
 * ⚠️ 缺文件 / schema 不符 → **出貨預設**,不是空設定。回空的話 Σweights = 0,
 * 每個人的分數都會是 0,於是全場都拿 D —— 功能還在跑、畫面照畫,但等第完全
 * 失去意義而且不會有任何錯誤。這是這個檔案最容易犯的錯。
 */
export function roundGradeFromDoc(doc: unknown): RoundGradeConfig {
  if (!doc || typeof doc !== "object") return DEFAULT_ROUND_GRADE_CONFIG;
  const d = doc as { schema?: unknown; grade?: unknown };
  if (d.schema !== "config.round-grade@1" || !d.grade || typeof d.grade !== "object") {
    return DEFAULT_ROUND_GRADE_CONFIG;
  }
  return normalizeRoundGradeConfig(d.grade as Partial<RoundGradeConfig>);
}

/**
 * 七個軸的分數。**這裡是唯一把戰績變成分數的地方** —— 任何一軸想換公式,
 * 改這裡,兩個畫面同時跟著動。
 */
export function roundAxisScores(
  perf: RoundPerformance,
  ctx: RoundGradeContext,
  cfg: RoundGradeConfig = DEFAULT_ROUND_GRADE_CONFIG,
): AxisScores {
  const deaths = perf.deaths > 1 ? perf.deaths : 1;
  const kda = ratio(perf.kills + perf.assists, deaths);
  const shots = perf.abilityHits + perf.abilityWhiffs;
  const healPart = clamp01(ratio(perf.healingDone, cfg.refs.healing));
  const ccPart = clamp01(ratio(perf.ccAppliedTicks, cfg.refs.ccTicks));
  const share = cfg.mix.supportHealShare;
  const objectiveRaw = perf.mobKills + perf.bossKills * cfg.mix.bossKillWeight;

  return Object.freeze({
    combat: clamp01(ratio(kda, cfg.refs.kda)),
    damage: clamp01(ratio(perf.damageDealt, cfg.refs.damage)),
    tanking: clamp01(ratio(perf.damageTaken + perf.damageBlocked, cfg.refs.tanking)),
    survival: clamp01(ratio(perf.survivedTicks, ctx.roundTicks)),
    support: clamp01(healPart * share + ccPart * (1 - share)),
    objective: clamp01(ratio(objectiveRaw, cfg.refs.objective)),
    accuracy: shots > 0 ? clamp01(ratio(perf.abilityHits, shots)) : clamp01(cfg.mix.neutralAccuracy),
  });
}

/**
 * 加權平均 ∈ [0,1]。
 *
 * ⚠️ 這一行就是「等第從統計推導」的那一行。把它換成常數,
 * `roundGrade.test.ts` 的 "五條不同戰績拿到五個不同等第" 會紅。
 */
export function roundGradeScore(
  axes: AxisScores,
  cfg: RoundGradeConfig = DEFAULT_ROUND_GRADE_CONFIG,
): number {
  let num = 0;
  let den = 0;
  for (const axis of GRADE_AXES) {
    const w = cfg.weights[axis];
    num += w * axes[axis];
    den += w;
  }
  return den > 0 ? clamp01(num / den) : 0;
}

/** 分數 → 等第。`cuts` 已由 {@link normalizeRoundGradeConfig} 保證遞減。 */
export function roundGradeFromScore(
  score: number,
  cfg: RoundGradeConfig = DEFAULT_ROUND_GRADE_CONFIG,
): RoundGrade {
  if (score >= cfg.cuts.S) return "S";
  if (score >= cfg.cuts.A) return "A";
  if (score >= cfg.cuts.B) return "B";
  if (score >= cfg.cuts.C) return "C";
  return "D";
}

/**
 * 要改善的軸 —— 照「還能賺回多少總分」由大到小排,不是照分數由小到大。
 *
 * 權重 0 的軸永遠不會被列:它對總分沒有貢獻,叫玩家去練那一項是在浪費他的
 * 時間。並列時照 {@link GRADE_AXES} 的固定順序決勝,所以輸出是決定性的。
 */
export function roundAdvice(
  axes: AxisScores,
  cfg: RoundGradeConfig = DEFAULT_ROUND_GRADE_CONFIG,
): RoundAdvice[] {
  const out: (RoundAdvice & { order: number })[] = [];
  GRADE_AXES.forEach((axis, order) => {
    const score = axes[axis];
    const w = cfg.weights[axis];
    if (w <= 0 || score >= cfg.adviceCeiling) return;
    out.push({ axis, code: ADVICE_CODES[axis], score, gain: w * (cfg.adviceCeiling - score), order });
  });
  out.sort((a, b) => (b.gain !== a.gain ? b.gain - a.gain : a.order - b.order));
  return out.slice(0, Math.max(0, cfg.adviceCount)).map(({ axis, code, score, gain }) => ({ axis, code, score, gain }));
}

/** 打得好的軸 —— #212 的「評價」那一半,照分數由高到低。 */
export function roundStrengths(
  axes: AxisScores,
  cfg: RoundGradeConfig = DEFAULT_ROUND_GRADE_CONFIG,
): RoundAdvice[] {
  const out: (RoundAdvice & { order: number })[] = [];
  GRADE_AXES.forEach((axis, order) => {
    const score = axes[axis];
    const w = cfg.weights[axis];
    if (w <= 0 || score < cfg.praiseFloor) return;
    out.push({ axis, code: PRAISE_CODES[axis], score, gain: w * score, order });
  });
  out.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.order - b.order));
  return out.slice(0, Math.max(0, cfg.adviceCount)).map(({ axis, code, score, gain }) => ({ axis, code, score, gain }));
}

/**
 * **入口**:一份回合戰績 → 等第 + 分數 + 七軸 + 建議 + 稱讚。
 *
 * #212(回合勝利畫面)與 #232(商店評價卡)都呼叫這一支。誰要多一個欄位就在
 * {@link RoundGradeResult} 上加,不要在消費端自己再算一次。
 */
export function gradeRound(
  perf: RoundPerformance,
  ctx: RoundGradeContext,
  cfg: RoundGradeConfig = DEFAULT_ROUND_GRADE_CONFIG,
): RoundGradeResult {
  const axes = roundAxisScores(perf, ctx, cfg);
  const score = roundGradeScore(axes, cfg);
  return {
    grade: roundGradeFromScore(score, cfg),
    score,
    axes,
    advice: roundAdvice(axes, cfg),
    strengths: roundStrengths(axes, cfg),
  };
}

/** 等第的名次(0 = S,4 = D)—— 要比較兩個等第誰高時用它,不要比字串。 */
export function roundGradeRank(g: RoundGrade): number {
  return ROUND_GRADES.indexOf(g);
}
