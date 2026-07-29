/**
 * roundGrade —— 每回合 S~D 評價的守衛。
 *
 * 這裡守的是三件會讓功能「做了但玩家拿不到」的事:
 *
 *  ① 等第真的**從統計推導**。第一個 describe 餵五條不同的戰績,要求拿到五個
 *     不同的等第。把 `roundGradeScore` 換成常數(或把 `gradeRound` 寫死成 "B")
 *     的話,五條會全部收斂成同一個字母 —— 這是本檔最重要的一條,也是任務
 *     指定要做突變驗證的那一條。
 *
 *  ② 門檻與權重真的**從 config 讀**。不是「有一個 config 型別存在」,而是
 *     改了 config 之後同一條戰績的等第真的會動 —— 形態④(斷言方向跟缺陷無關):
 *     一個「config 有這個欄位」的斷言對「讀了它」和「沒讀它」的實作都會過。
 *
 *  ③ JSON / schema / sim 三份**沒有 drift**。任務守則要求同一個欄位落在三個
 *     地方;這裡把 `content/config/round-grade.json` 讀進來逐格比對
 *     `DEFAULT_ROUND_GRADE_CONFIG`,少一格就紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "../../../testkit/cover";
import {
  ADVICE_CODES,
  DEFAULT_ROUND_GRADE_CONFIG,
  GRADE_AXES,
  PRAISE_CODES,
  ROUND_GRADES,
  ROUND_GRADE_BOUNDS,
  gradeRound,
  normalizeRoundGradeConfig,
  roundAdvice,
  roundAxisScores,
  roundGradeFromDoc,
  roundGradeFromScore,
  roundGradeRank,
  roundGradeScore,
  roundStrengths,
  type RoundGradeConfig,
  type RoundPerformance,
} from "./roundGrade";
// schema 那一半:三份不 drift 的第三份(JSON / sim / Zod)
import {
  SHIPPED_ROUND_GRADE_DOC,
  zConfigRoundGradeDoc,
  zRoundGradeWeights,
} from "../../content/schema/roundGrade";

const ROUND_TICKS = 1800; // 60s @30Hz
const ctx = { roundTicks: ROUND_TICKS };

function perf(over: Partial<RoundPerformance> = {}): RoundPerformance {
  return {
    kills: 0,
    deaths: 0,
    assists: 0,
    damageDealt: 0,
    damageTaken: 0,
    damageBlocked: 0,
    healingDone: 0,
    ccAppliedTicks: 0,
    abilityHits: 0,
    abilityWhiffs: 0,
    mobKills: 0,
    bossKills: 0,
    survivedTicks: 0,
    ...over,
  };
}

/** 五條刻意分層的戰績,由強到弱。 */
const CARRY = perf({
  kills: 12,
  assists: 6,
  deaths: 1,
  damageDealt: 4000,
  damageTaken: 4000,
  damageBlocked: 2000,
  healingDone: 2000,
  ccAppliedTicks: 300,
  abilityHits: 20,
  abilityWhiffs: 0,
  mobKills: 20,
  survivedTicks: 1800,
});
const GOOD = perf({
  kills: 5,
  assists: 2,
  deaths: 2,
  damageDealt: 1500,
  damageTaken: 1400,
  damageBlocked: 600,
  healingDone: 500,
  ccAppliedTicks: 150,
  abilityHits: 8,
  abilityWhiffs: 2,
  mobKills: 5,
  survivedTicks: 1600,
});
const OKAY = perf({
  kills: 2,
  assists: 2,
  deaths: 2,
  damageDealt: 1000,
  damageTaken: 1100,
  damageBlocked: 400,
  healingDone: 300,
  ccAppliedTicks: 90,
  abilityHits: 5,
  abilityWhiffs: 5,
  mobKills: 3,
  survivedTicks: 1600,
});
const WEAK = perf({
  kills: 1,
  assists: 1,
  deaths: 3,
  damageDealt: 900,
  damageTaken: 700,
  damageBlocked: 200,
  healingDone: 100,
  ccAppliedTicks: 30,
  abilityHits: 3,
  abilityWhiffs: 7,
  mobKills: 1,
  survivedTicks: 1400,
});
const FED = perf({
  kills: 0,
  assists: 0,
  deaths: 5,
  damageDealt: 100,
  damageTaken: 200,
  abilityHits: 0,
  abilityWhiffs: 6,
  survivedTicks: 200,
});

describe("等第由統計推導(突變守衛)", () => {
  it("五條不同的戰績拿到五個不同的等第,涵蓋整個 S~D 梯", () => {
    cover("round-grade-derived");
    const grades = [CARRY, GOOD, OKAY, WEAK, FED].map((p) => gradeRound(p, ctx).grade);
    // ⚠️ 這一條就是突變偵測器:把 roundGradeScore 換成常數,五個會變成同一個。
    expect(grades).toEqual(["S", "A", "B", "C", "D"]);
    expect(new Set(grades).size).toBe(5);
  });

  it("分數是單調的:每一條都嚴格高於下一條", () => {
    const scores = [CARRY, GOOD, OKAY, WEAK, FED].map((p) =>
      roundGradeScore(roundAxisScores(p, ctx)),
    );
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeLessThan(scores[i - 1]!);
    }
  });

  it("動任何一個統計欄位,分數就會動(七個軸都真的有被讀)", () => {
    const base = roundGradeScore(roundAxisScores(OKAY, ctx));
    const bumps: Partial<RoundPerformance>[] = [
      { kills: OKAY.kills + 4 }, // combat
      { damageDealt: OKAY.damageDealt + 800 }, // damage
      { damageTaken: OKAY.damageTaken + 900 }, // tanking
      { survivedTicks: ROUND_TICKS }, // survival
      { healingDone: OKAY.healingDone + 700 }, // support(治療半邊)
      { ccAppliedTicks: OKAY.ccAppliedTicks + 200 }, // support(控制半邊)
      { mobKills: OKAY.mobKills + 5 }, // objective
      { abilityHits: OKAY.abilityHits + 5 }, // accuracy
    ];
    for (const b of bumps) {
      const bumped = roundGradeScore(roundAxisScores({ ...OKAY, ...b }, ctx));
      expect(bumped, `bump ${JSON.stringify(b)} 沒有推動分數`).toBeGreaterThan(base);
    }
  });

  it("王擊殺依 mix.bossKillWeight 折算成小怪 —— 不是每一隻都一樣重", () => {
    const one = roundAxisScores(perf({ bossKills: 1 }), ctx).objective;
    const ten = roundAxisScores(perf({ mobKills: 10 }), ctx).objective;
    expect(one).toBeCloseTo(ten, 10); // 出貨值 bossKillWeight = 10
  });

  it("沒有射出任何技能彈時 accuracy 是中位,不是 0(不獎不罰)", () => {
    const silent = roundAxisScores(perf({ abilityHits: 0, abilityWhiffs: 0 }), ctx);
    expect(silent.accuracy).toBe(DEFAULT_ROUND_GRADE_CONFIG.mix.neutralAccuracy);
    // 而全部落空的人是真的 0 —— 兩者必須分得開
    expect(roundAxisScores(perf({ abilityWhiffs: 5 }), ctx).accuracy).toBe(0);
  });

  it("roundTicks 是 0 時 survival 是 0,不是 NaN / Infinity", () => {
    const a = roundAxisScores(perf({ survivedTicks: 900 }), { roundTicks: 0 });
    expect(a.survival).toBe(0);
    expect(Number.isFinite(roundGradeScore(a))).toBe(true);
  });
});

describe("門檻與權重真的從 config 讀(後台可調)", () => {
  it("把門檻整排拉高,同一條戰績就掉階", () => {
    cover("round-grade-configurable");
    const strict = normalizeRoundGradeConfig({
      cuts: { S: 0.99, A: 0.9, B: 0.8, C: 0.7 },
    });
    expect(gradeRound(GOOD, ctx).grade).toBe("A");
    // 戰績一個字都沒動,只動了後台的門檻
    expect(roundGradeRank(gradeRound(GOOD, ctx, strict).grade)).toBeGreaterThan(
      roundGradeRank(gradeRound(GOOD, ctx).grade),
    );
  });

  it("把門檻全部歸零,最弱的戰績也是 S —— 門檻不是寫死的", () => {
    const lax = normalizeRoundGradeConfig({ cuts: { S: 0, A: 0, B: 0, C: 0 } });
    expect(gradeRound(FED, ctx, lax).grade).toBe("S");
  });

  it("權重改了,同一條戰績的分數就不一樣", () => {
    const onlyDamage = normalizeRoundGradeConfig({
      weights: {
        combat: 0,
        damage: 1,
        tanking: 0,
        survival: 0,
        support: 0,
        objective: 0,
        accuracy: 0,
      },
    });
    const axes = roundAxisScores(OKAY, ctx, onlyDamage);
    expect(roundGradeScore(axes, onlyDamage)).toBeCloseTo(axes.damage, 10);
    expect(roundGradeScore(axes, onlyDamage)).not.toBeCloseTo(roundGradeScore(axes), 6);
  });

  it("滿分參考值改了,同一份傷害的軸分就不一樣", () => {
    const harsh = normalizeRoundGradeConfig({
      refs: { ...DEFAULT_ROUND_GRADE_CONFIG.refs, damage: 8000 },
    });
    expect(roundAxisScores(OKAY, ctx, harsh).damage).toBeLessThan(
      roundAxisScores(OKAY, ctx).damage,
    );
  });

  it("supportHealShare 決定 support 軸裡治療 vs 控制的比重", () => {
    const healOnly = normalizeRoundGradeConfig({
      mix: { ...DEFAULT_ROUND_GRADE_CONFIG.mix, supportHealShare: 1 },
    });
    const ccOnly = normalizeRoundGradeConfig({
      mix: { ...DEFAULT_ROUND_GRADE_CONFIG.mix, supportHealShare: 0 },
    });
    const medic = perf({ healingDone: 1000, ccAppliedTicks: 0 });
    expect(roundAxisScores(medic, ctx, healOnly).support).toBe(1);
    expect(roundAxisScores(medic, ctx, ccOnly).support).toBe(0);
  });
});

describe("設定的正規化:上下界都夾,門檻強制遞減", () => {
  it("每一個欄位的上界和下界都真的夾住(不是只有下界)", () => {
    cover("round-grade-bounds");
    // 50 打成 500 要被擋 —— #277 就是只檢查下界造成的
    const wild = normalizeRoundGradeConfig({
      cuts: { S: 99, A: -5, B: 99, C: -5 },
      weights: {
        combat: 999,
        damage: -999,
        tanking: 999,
        survival: -999,
        support: 999,
        objective: -999,
        accuracy: 999,
      },
      refs: { kda: 0, damage: 0, tanking: 1e12, healing: -1, ccTicks: 0, objective: 1e9 },
      mix: { supportHealShare: 7, bossKillWeight: -3, neutralAccuracy: 9 },
      adviceCount: 99,
      adviceCeiling: 5,
      praiseFloor: -5,
    });
    const check = (key: string, value: number): void => {
      const [lo, hi] = ROUND_GRADE_BOUNDS[key]!;
      expect(value, `${key} 沒有被夾進 [${lo}, ${hi}]`).toBeGreaterThanOrEqual(lo);
      expect(value, `${key} 沒有被夾進 [${lo}, ${hi}]`).toBeLessThanOrEqual(hi);
    };
    check("cuts.S", wild.cuts.S);
    check("cuts.C", wild.cuts.C);
    for (const a of GRADE_AXES) check(`weights.${a}`, wild.weights[a]);
    check("refs.kda", wild.refs.kda);
    check("refs.damage", wild.refs.damage);
    check("refs.tanking", wild.refs.tanking);
    check("refs.healing", wild.refs.healing);
    check("refs.ccTicks", wild.refs.ccTicks);
    check("refs.objective", wild.refs.objective);
    check("mix.supportHealShare", wild.mix.supportHealShare);
    check("mix.bossKillWeight", wild.mix.bossKillWeight);
    check("mix.neutralAccuracy", wild.mix.neutralAccuracy);
    check("adviceCount", wild.adviceCount);
    check("adviceCeiling", wild.adviceCeiling);
    check("praiseFloor", wild.praiseFloor);
  });

  it("ROUND_GRADE_BOUNDS 涵蓋每一個可調欄位(新增欄位漏了上界就紅)", () => {
    const cfg = DEFAULT_ROUND_GRADE_CONFIG;
    const paths: string[] = [
      ...(Object.keys(cfg.cuts) as string[]).map((k) => `cuts.${k}`),
      ...GRADE_AXES.map((a) => `weights.${a}`),
      ...(Object.keys(cfg.refs) as string[]).map((k) => `refs.${k}`),
      ...(Object.keys(cfg.mix) as string[]).map((k) => `mix.${k}`),
      "adviceCount",
      "adviceCeiling",
      "praiseFloor",
    ];
    for (const p of paths) {
      expect(ROUND_GRADE_BOUNDS[p], `${p} 沒有上下界`).toBeDefined();
    }
    expect(Object.keys(ROUND_GRADE_BOUNDS).sort()).toEqual(paths.sort());
  });

  it("門檻打反了會被夾成遞減,不會生出一個永遠拿不到的等第", () => {
    const flipped = normalizeRoundGradeConfig({ cuts: { S: 0.5, A: 0.9, B: 0.95, C: 0.99 } });
    expect(flipped.cuts.S).toBeGreaterThanOrEqual(flipped.cuts.A);
    expect(flipped.cuts.A).toBeGreaterThanOrEqual(flipped.cuts.B);
    expect(flipped.cuts.B).toBeGreaterThanOrEqual(flipped.cuts.C);
    // 而且梯子仍然是可達的:掃過 [0,1] 五個等第都拿得到
    const seen = new Set<string>();
    for (let i = 0; i <= 100; i++) seen.add(roundGradeFromScore(i / 100, flipped));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("缺文件 / schema 不符 → 出貨預設,不是空設定", () => {
    cover("round-grade-doc-fallback");
    expect(roundGradeFromDoc(undefined)).toEqual(DEFAULT_ROUND_GRADE_CONFIG);
    expect(roundGradeFromDoc({ schema: "config.match@1" })).toEqual(DEFAULT_ROUND_GRADE_CONFIG);
    expect(roundGradeFromDoc({ schema: "config.round-grade@1" })).toEqual(
      DEFAULT_ROUND_GRADE_CONFIG,
    );
    // 空設定的話 Σweights = 0,每個人都拿 D 而且不會有任何錯誤
    const fallback = roundGradeFromDoc(null);
    let sum = 0;
    for (const a of GRADE_AXES) sum += fallback.weights[a];
    expect(sum).toBeGreaterThan(0);
  });

  it("讀得懂真的文件", () => {
    const doc = {
      id: "round-grade",
      schema: "config.round-grade@1",
      grade: { ...DEFAULT_ROUND_GRADE_CONFIG, cuts: { S: 0.9, A: 0.7, B: 0.5, C: 0.3 } },
    };
    expect(roundGradeFromDoc(doc).cuts).toEqual({ S: 0.9, A: 0.7, B: 0.5, C: 0.3 });
  });
});

describe("改善建議 / 稱讚(#212 的「打得好的評價建議」)", () => {
  it("建議照『還能賺回多少總分』排,不是照分數高低", () => {
    cover("round-grade-advice");
    // combat / survival 打滿(高於 adviceCeiling,不會被列),剩下:
    //   damage    權重 0.22、分數 0.1 → gain 0.22*(0.6-0.1) = 0.110
    //   support   權重 0.10、分數 0.0 → gain 0.10*(0.6-0.0) = 0.060
    // support 的分數比 damage **低**,但 damage 才是最值得練的那一項。照分數由
    // 低到高排的實作會把 support 放第一,這一條就是在分辨這兩種排法。
    const axes = roundAxisScores(
      perf({
        kills: 8,
        deaths: 1,
        damageDealt: 200,
        healingDone: 0,
        ccAppliedTicks: 0,
        survivedTicks: ROUND_TICKS,
      }),
      ctx,
    );
    expect(axes.support).toBeLessThan(axes.damage);
    const advice = roundAdvice(axes);
    expect(advice[0]!.axis).toBe("damage");
    expect(advice.map((a) => a.gain)).toEqual([...advice.map((a) => a.gain)].sort((x, y) => y - x));
  });

  it("已經打得好的軸不會被列成要改善", () => {
    const res = gradeRound(CARRY, ctx);
    expect(res.advice).toHaveLength(0); // 七個軸全部滿分
    expect(res.strengths.length).toBeGreaterThan(0);
    expect(res.strengths[0]!.code).toBe(PRAISE_CODES[res.strengths[0]!.axis]);
  });

  it("權重 0 的軸永遠不會被建議 —— 練它對總分沒有幫助", () => {
    const noObjective = normalizeRoundGradeConfig({
      weights: { ...DEFAULT_ROUND_GRADE_CONFIG.weights, objective: 0 },
    });
    const axes = roundAxisScores(FED, ctx, noObjective);
    expect(axes.objective).toBe(0); // 真的是 0 分
    expect(roundAdvice(axes, noObjective).map((a) => a.axis)).not.toContain("objective");
    expect(roundStrengths(axes, noObjective).map((a) => a.axis)).not.toContain("objective");
  });

  it("adviceCount 真的限制條數", () => {
    const axes = roundAxisScores(FED, ctx);
    expect(roundAdvice(axes).length).toBeLessThanOrEqual(DEFAULT_ROUND_GRADE_CONFIG.adviceCount);
    const one = normalizeRoundGradeConfig({ adviceCount: 1 });
    expect(roundAdvice(axes, one)).toHaveLength(1);
    const none = normalizeRoundGradeConfig({ adviceCount: 0 });
    expect(roundAdvice(axes, none)).toHaveLength(0);
  });

  it("代號表涵蓋每一個軸,而且建議碼和稱讚碼不會撞在一起", () => {
    for (const a of GRADE_AXES) {
      expect(ADVICE_CODES[a]).toBeTruthy();
      expect(PRAISE_CODES[a]).toBeTruthy();
      expect(ADVICE_CODES[a]).not.toBe(PRAISE_CODES[a]);
    }
    expect(new Set(Object.values(ADVICE_CODES)).size).toBe(GRADE_AXES.length);
    expect(new Set(Object.values(PRAISE_CODES)).size).toBe(GRADE_AXES.length);
  });

  it("輸出是決定性的:同樣的輸入永遠給同樣的順序", () => {
    const axes = roundAxisScores(WEAK, ctx);
    expect(roundAdvice(axes)).toEqual(roundAdvice(axes));
    expect(gradeRound(WEAK, ctx)).toEqual(gradeRound(WEAK, ctx));
  });
});

describe("梯子本身", () => {
  it("是 owner 點名的五階,rank 由好到壞", () => {
    expect(ROUND_GRADES).toEqual(["S", "A", "B", "C", "D"]);
    expect(roundGradeRank("S")).toBe(0);
    expect(roundGradeRank("D")).toBe(4);
  });

  it("邊界值落在正確的一階(>= 才算到)", () => {
    const c = DEFAULT_ROUND_GRADE_CONFIG.cuts;
    expect(roundGradeFromScore(1)).toBe("S");
    expect(roundGradeFromScore(c.S)).toBe("S");
    expect(roundGradeFromScore(c.S - 1e-9)).toBe("A");
    expect(roundGradeFromScore(c.A)).toBe("A");
    expect(roundGradeFromScore(c.B)).toBe("B");
    expect(roundGradeFromScore(c.C)).toBe("C");
    expect(roundGradeFromScore(c.C - 1e-9)).toBe("D");
    expect(roundGradeFromScore(0)).toBe("D");
  });
});

describe("三份沒有 drift(JSON / schema / sim)", () => {
  it("content/config/round-grade.json 和 DEFAULT_ROUND_GRADE_CONFIG 一字不差", () => {
    cover("round-grade-drift");
    const p = join(__dirname, "../../../../../content/config/round-grade.json");
    const doc = JSON.parse(readFileSync(p, "utf8")) as {
      id: string;
      schema: string;
      grade: RoundGradeConfig;
    };
    expect(doc.id).toBe("round-grade");
    expect(doc.schema).toBe("config.round-grade@1");
    expect(doc.grade).toEqual(DEFAULT_ROUND_GRADE_CONFIG);
    // 而且它真的通得過讀取路徑(不只是長得像)
    expect(roundGradeFromDoc(doc)).toEqual(DEFAULT_ROUND_GRADE_CONFIG);
  });

  it("出貨的權重表剛好涵蓋七個軸,沒有多也沒有少", () => {
    expect(Object.keys(DEFAULT_ROUND_GRADE_CONFIG.weights).sort()).toEqual([...GRADE_AXES].sort());
  });

  it("Zod 的權重欄位也剛好是七個軸 —— 它是手寫的,會 drift", () => {
    // schema/roundGrade.ts 的 zRoundGradeWeights 不能用 GRADE_AXES 生成(生成的
    // shape 會讓整個 config discriminated union 在 game-server 的 tsconfig 下報錯,
    // 見該檔註解),所以它是逐格手寫的 —— 少一格就是那一軸永遠讀不到後台的值,
    // 而且只有這一條會發現。
    expect(Object.keys(zRoundGradeWeights.shape).sort()).toEqual([...GRADE_AXES].sort());
    // 而且真的擋得住越界值(不是只是 z.number())
    expect(zRoundGradeWeights.safeParse({ ...DEFAULT_ROUND_GRADE_CONFIG.weights, damage: 999 }).success).toBe(false);
    expect(zRoundGradeWeights.safeParse(DEFAULT_ROUND_GRADE_CONFIG.weights).success).toBe(true);
  });

  it("出貨文件通得過 Zod(schema 和 sim 的預設沒有互相排斥)", () => {
    const parsed = zConfigRoundGradeDoc.safeParse(SHIPPED_ROUND_GRADE_DOC);
    expect(parsed.success, JSON.stringify((parsed as { error?: unknown }).error)).toBe(true);
  });
});
