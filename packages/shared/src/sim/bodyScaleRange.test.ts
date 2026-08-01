/**
 * 身體放大倍數 → 攻擊距離 (GH#252) —— **行為**守衛,不是「欄位等於 1.2」。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 這一支問的唯一問題:**他實際上打得到多遠?**
 * ════════════════════════════════════════════════════════════════════════════
 * {@link maxHittingGap} 對真的 `SimWorld` 做二分搜尋,找出「還打得出一次普攻」的
 * 最大間距。斷言讀的是真的 `basicAttack` 事件,不是 `world.stats` 上的一個數字
 * (失敗形態 ⑦「掃屬性代替掃行為」),更不是 `rules.attackRangeCurve[1].rangeMult`
 * (那只證明 JSON 沒被改壞)。
 *
 * 射程來源刻意走 `spawnChampion` → `recomputeStats` → `finalizeStat`,不是測試
 * 自己往 `final[Stat.AttackRange]` 塞值 —— 出貨的那條路上,體型是 `ChampionDef`
 * 的一個欄位,測試自己塞值就等於把被測的東西換掉(失敗形態 ⑤)。
 *
 * ⚠️ 量距離用的是 **SELA(遠程,卡面射程 11)**,不是近戰的 THORNE。近戰卡面
 * 1.6,而 `BasicAttackSystem` 的 `reachTo` 有一條「貼身一定打得到」的地板
 * (`selfR + tgtR + 0.1` = 1.3);1.6 × 1.0 / 1.2 / 1.3 三個答案全都擠在
 * 1.6–2.08 這一段裡,離那條地板只有 0.3。用遠程角色量,三個答案是 11.0 / 13.2 /
 * 14.3,而地板在 1.3 —— 斷言量到的是這個機制本身,不是那條地板。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 突變紀錄(每一條都真的跑過:改壞 → 紅 → 改回 → 綠)
 * ════════════════════════════════════════════════════════════════════════════
 *   · `statPipeline.ts` 拿掉 `rangeScale: attackRangeScaleFactor(...)`
 *       → 「體型 2.0 打得比一般體型遠」紅(13.20 變回 11.00)
 *   · `bodyScale.ts` 內插改成 `return lo.rangeMult`(取下界不內插)
 *       → 「斷點之間會內插」紅(2.5 給 1.20 而不是 1.25)
 *   · `bodyScale.ts` 拿掉「小於第一個斷點 → 第一列」那一行(改成往下外推)
 *       → 「小體型被夾在第一列」紅(0.5 給 0.90 而不是 1.00)
 *   · `bodyScale.ts` 拿掉「大於最後一個斷點 → 最後一列」那一行(改成往上外推)
 *       → 「大體型被夾在最後一列」紅(8.0 給 1.80 而不是 1.30)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { Champions, registerChampion } from "./content/registry";
import { registerSkeletonContent, SELA, THORNE } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import { Stat } from "./stats/statTypes";
import {
  CURVE_MAX_POINTS,
  DEFAULT_ATTACK_RANGE_CURVE,
  DEFAULT_BODY_SCALE_RULES,
  attackRangeScaleFactor,
  bodyScaleRulesFromDoc,
  normalizeAttackRangeCurve,
  normalizeBodyScaleRules,
} from "./bodyScale";
import { zConfigBodyScaleDoc } from "../content/schema/config";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const Z0 = SKELETON_ARENA.zones[0]!;

/** 遠程基準射程 —— 由英雄卡決定,不是常數,所以從卡片讀回來。 */
const SELA_RANGE = SELA.baseStats[Stat.AttackRange] as number;
/** 近戰基準射程(只有「連動是雙向的嗎」那一段會用到)。 */
const THORNE_RANGE = THORNE.baseStats[Stat.AttackRange] as number;

function registerScaled(id: string, from: typeof SELA, bodyScale: number | undefined): ChampionId {
  const cid = id as ChampionId;
  registerChampion({ ...from, id: cid, bodyScale });
  return cid;
}

/**
 * 站定不動。
 *
 * ⚠️ **不可以填 0**。`MovementSystem` 讀的是
 * `world.stats.get(id)?.final[Stat.MoveSpeed] || DEFAULT_MOVE_SPEED`,而 `||`
 * 對 0 是 falsy —— 填 0 的單位會用**預設移速**走過去,於是「靠近之後打得到」被
 * 當成「射程夠」,而那個綠燈對放大與沒放大都會亮(失敗形態 ④)。
 */
function freeze(world: SimWorld, id: EntityId): void {
  const sc = world.stats.get(id)!;
  sc.final[Stat.MoveSpeed] = 1e-9;
  sc.final[Stat.AttackSpeed] = 2;
  sc.dirty = false;
}

/** 兩個敵對英雄,間距 `gap`,兩邊都釘在原地;回報這幾 tick 裡的普攻次數。 */
function attacksAt(attackerId: ChampionId, gap: number, ticks = 40): number {
  const world = new SimWorld(SKELETON_ARENA, 11);
  const a = spawnChampion(world, {
    championId: attackerId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x - gap / 2, z: Z0.center.z },
    zone: 0,
  });
  const b = spawnChampion(world, {
    championId: registerScaled("probe.target", THORNE, undefined),
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: Z0.center.x + gap / 2, z: Z0.center.z },
    zone: 0,
  });
  freeze(world, a);
  freeze(world, b);
  // ⚠️ 每一 tick 都把座標釘回去。光把 `MoveSpeed` 設 0 **不夠**:實測間距 2.0
  // 起跑、移速 0,40 tick 之後兩具身體仍然收斂到 1.40 —— 追擊/分離那一層有自己
  // 的位移來源。
  const posA = { x: Z0.center.x - gap / 2, z: Z0.center.z };
  const posB = { x: Z0.center.x + gap / 2, z: Z0.center.z };

  let attacks = 0;
  for (let k = 0; k < ticks; k++) {
    world.transform.get(a)!.pos = { ...posA };
    world.transform.get(b)!.pos = { ...posB };
    world.nav.get(a)!.attackTarget = b;
    world.step(new Map());
    attacks += world.events.filter((e) => e.type === "basicAttack").length;
  }
  return attacks;
}

/**
 * **他打得到多遠?** —— 二分搜尋「還打得出一次普攻」的最大間距。
 *
 * 命中與否對間距是單調的(兩具身體都被釘死,所以每一 tick 的距離就是 `gap`,
 * 而 `BasicAttackSystem` 的條件是 `dist <= reach`),所以二分是對的。
 * 30 次疊代把 [0.5, 40] 收斂到 ~4e-5,足以分辨 13.20 與 13.75。
 */
function maxHittingGap(championId: ChampionId): number {
  let lo = 0.5; // 貼身一定打得到
  let hi = 40; // 遠超過任何出貨射程 × 任何合法倍率
  expect(attacksAt(championId, lo)).toBeGreaterThan(0);
  expect(attacksAt(championId, hi)).toBe(0);
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (attacksAt(championId, mid) > 0) lo = mid;
    else hi = mid;
  }
  return lo;
}

beforeEach(() => {
  Champions.clear();
  registerSkeletonContent();
});

describe("GH#252 —— 出貨曲線:他實際上打得到多遠", () => {
  it("一般體型(1.0)= 卡面射程,一格都沒有多", () => {
    expect(maxHittingGap(registerScaled("probe.s10", SELA, 1))).toBeCloseTo(SELA_RANGE, 2);
  });

  it("斷點上(2.0)= 1.20× —— owner 給的那個數字,量出來的", () => {
    // owner 2026-08-01:「2x body, 1.2x 攻擊距離」。11.0 × 1.2 = 13.2。
    expect(maxHittingGap(registerScaled("probe.s20", SELA, 2))).toBeCloseTo(SELA_RANGE * 1.2, 2);
  });

  it("斷點上(3.0)= 1.30× —— 遞減,不是等比", () => {
    // 等比的話 3 倍體型會是 33.0(比整個決鬥區直徑還長);曲線給的是 14.3。
    const reach = maxHittingGap(registerScaled("probe.s30", SELA, 3));
    expect(reach).toBeCloseTo(SELA_RANGE * 1.3, 2);
    expect(reach).toBeLessThan(SELA_RANGE * 3);
  });

  it("斷點之間(2.5)= 1.25× —— 中間真的有內插,不是取到下面那一個斷點", () => {
    // 取下界的實作會給 1.20(= 13.20);內插給 1.25(= 13.75)。
    const reach = maxHittingGap(registerScaled("probe.s25", SELA, 2.5));
    expect(reach).toBeCloseTo(SELA_RANGE * 1.25, 2);
    expect(reach).toBeGreaterThan(SELA_RANGE * 1.2 + 0.1);
  });

  it("比第一個斷點小(0.5)被夾住 = 1.00× —— 小隻的不會被扣射程", () => {
    // 往下外推的實作會給 1 + (0.5−1)×0.2 = 0.90(= 9.9)。夾住給 11.0。
    expect(maxHittingGap(registerScaled("probe.s05", SELA, 0.5))).toBeCloseTo(SELA_RANGE, 2);
  });

  it("比最後一個斷點大(8.0)被夾住 = 1.30× —— 表外的體型不會自己長出去", () => {
    // 往上外推(用 2→3 那一段的斜率)會給 1.30 + 5×0.10 = 1.80(= 19.8)。
    const reach = maxHittingGap(registerScaled("probe.s80", SELA, 8));
    expect(reach).toBeCloseTo(SELA_RANGE * 1.3, 2);
    // 和 3.0 那一位一模一樣 —— 這就是「夾住」的意思
    expect(reach).toBeCloseTo(maxHittingGap(registerScaled("probe.s30b", SELA, 3)), 2);
  });

  it("沒填 bodyScale 的英雄逐位元不受影響(113 位裡的 89 位)", () => {
    expect(maxHittingGap(registerScaled("probe.none", SELA, undefined))).toBeCloseTo(
      SELA_RANGE,
      2,
    );
  });

  it("近戰也吃同一條曲線(不是只有遠程接得到線)", () => {
    const normal = maxHittingGap(registerScaled("probe.m10", THORNE, 1));
    const big = maxHittingGap(registerScaled("probe.m20", THORNE, 2));
    expect(normal).toBeCloseTo(THORNE_RANGE, 2);
    expect(big).toBeCloseTo(THORNE_RANGE * 1.2, 2);
    expect(big).toBeGreaterThan(normal);
  });
});

describe("GH#252 —— 曲線是欄位,兩端都夾得住", () => {
  it("總開關關掉 = 1,即使曲線還留著", () => {
    const r = normalizeBodyScaleRules({ ...DEFAULT_BODY_SCALE_RULES, enabled: false });
    expect(attackRangeScaleFactor(3, r)).toBe(1);
    expect(attackRangeScaleFactor(0.6, r)).toBe(1);
  });

  it("關掉總開關之後,場上真的沒有人多打一寸", () => {
    // 純函式回 1 不等於 sim 也回 1 —— 這一條走真的世界。
    const id = registerScaled("probe.off", SELA, 3);
    const world = new SimWorld(SKELETON_ARENA, 3);
    world.bodyScaleRules = normalizeBodyScaleRules({
      ...DEFAULT_BODY_SCALE_RULES,
      enabled: false,
    });
    const e = spawnChampion(world, {
      championId: id,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { ...Z0.center },
      zone: 0,
    });
    expect(world.stats.get(e)!.final[Stat.AttackRange]).toBeCloseTo(SELA_RANGE, 5);
  });

  it("換一條 owner 自己的曲線,結果跟著換(這一頁真的是可調的)", () => {
    const r = normalizeBodyScaleRules({
      enabled: true,
      attackRangeCurve: [
        { bodyScale: 1, rangeMult: 1 },
        { bodyScale: 4, rangeMult: 2 },
      ],
    });
    expect(attackRangeScaleFactor(1, r)).toBeCloseTo(1, 10);
    expect(attackRangeScaleFactor(2.5, r)).toBeCloseTo(1.5, 10); // 一半的路 → 一半的增量
    expect(attackRangeScaleFactor(4, r)).toBeCloseTo(2, 10);
    expect(attackRangeScaleFactor(9, r)).toBeCloseTo(2, 10); // 夾住
  });

  it("整條壓平成 1 = 這個機制不存在(＝改成欄位之前的行為)", () => {
    const r = normalizeBodyScaleRules({
      enabled: true,
      attackRangeCurve: [
        { bodyScale: 0.1, rangeMult: 1 },
        { bodyScale: 10, rangeMult: 1 },
      ],
    });
    for (const s of [0.5, 1, 1.5, 3, 8]) expect(attackRangeScaleFactor(s, r)).toBeCloseTo(1, 10);
  });
});

describe("GH#252 —— 正規化:垃圾進去也不可以生出 NaN / Infinity", () => {
  it("超界的斷點被夾回區間,不是被丟掉也不是照收", () => {
    const c = normalizeAttackRangeCurve([
      { bodyScale: -5, rangeMult: 120 }, // 兩格都超界:0.1 / 3
      { bodyScale: 3, rangeMult: 1.3 },
    ]);
    expect(c[0]).toEqual({ bodyScale: 0.1, rangeMult: 3 });
    expect(c[1]).toEqual({ bodyScale: 3, rangeMult: 1.3 });
  });

  it("順序反了會被排好 —— 內插不會因為表的順序而變成亂的", () => {
    const c = normalizeAttackRangeCurve([
      { bodyScale: 3, rangeMult: 1.3 },
      { bodyScale: 1, rangeMult: 1 },
      { bodyScale: 2, rangeMult: 1.2 },
    ]);
    expect(c.map((p) => p.bodyScale)).toEqual([1, 2, 3]);
    expect(attackRangeScaleFactor(2.5, { enabled: true, attackRangeCurve: c })).toBeCloseTo(
      1.25,
      10,
    );
  });

  it("重複的體型被去掉 —— 兩列同樣的 x 會讓內插除以 0(= Infinity 射程)", () => {
    const c = normalizeAttackRangeCurve([
      { bodyScale: 1, rangeMult: 1 },
      { bodyScale: 2, rangeMult: 1.2 },
      { bodyScale: 2, rangeMult: 2.5 },
      { bodyScale: 3, rangeMult: 1.3 },
    ]);
    expect(c.map((p) => p.bodyScale)).toEqual([1, 2, 3]);
    expect(c[1]!.rangeMult).toBe(1.2); // 先宣告的那一列贏
    const f = attackRangeScaleFactor(2.4, { enabled: true, attackRangeCurve: c });
    expect(Number.isFinite(f)).toBe(true);
  });

  it("認不得的列被丟掉;剩不到兩列就整條回出貨曲線", () => {
    expect(normalizeAttackRangeCurve([{ bodyScale: "2", rangeMult: 1.2 }, null, 7])).toEqual(
      DEFAULT_ATTACK_RANGE_CURVE,
    );
    expect(normalizeAttackRangeCurve([])).toEqual(DEFAULT_ATTACK_RANGE_CURVE);
    expect(normalizeAttackRangeCurve(undefined)).toEqual(DEFAULT_ATTACK_RANGE_CURVE);
    expect(normalizeAttackRangeCurve("不是陣列")).toEqual(DEFAULT_ATTACK_RANGE_CURVE);
  });

  it("超過上限的列數被切掉,而且切掉之後仍然是一條合法的曲線", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      bodyScale: 0.5 + i * 0.4,
      rangeMult: 1 + i * 0.05,
    }));
    const c = normalizeAttackRangeCurve(many);
    expect(c.length).toBe(CURVE_MAX_POINTS);
    expect(c.every((p, i) => i === 0 || p.bodyScale > c[i - 1]!.bodyScale)).toBe(true);
  });

  it("整份規則吃到垃圾也不生 NaN —— NaN 一路乘下去就是全場沒有人打得到人", () => {
    for (const junk of [{}, { enabled: "yes" }, { attackRangeCurve: {} }, null, 7, "x"]) {
      const r = normalizeBodyScaleRules(junk);
      for (const s of [undefined, 0, -1, 0.5, 1, 2.5, 99, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(Number.isFinite(attackRangeScaleFactor(s, r))).toBe(true);
      }
    }
  });
});

describe("GH#252 —— 出貨的那一份文件", () => {
  const doc: unknown = JSON.parse(
    readFileSync(join(CONTENT_DIR, "config/body-scale.json"), "utf-8"),
  );

  it("content/config/body-scale.json 過得了自己的 Zod schema", () => {
    const parsed = zConfigBodyScaleDoc.safeParse(doc);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("解析出 owner 2026-08-01 給的那三個數字,一個位元都沒有加工", () => {
    const rules = bodyScaleRulesFromDoc(doc);
    expect(rules.enabled).toBe(true);
    expect(rules.attackRangeCurve.map((p) => [p.bodyScale, p.rangeMult])).toEqual([
      [1, 1],
      [2, 1.2],
      [3, 1.3],
    ]);
    // 出貨最大體型 3.0(godie-o030)必須落在表上,否則那一位吃的是夾住的值而
    // 不是 owner 審過的值
    expect(attackRangeScaleFactor(3, rules)).toBeCloseTo(1.3, 10);
  });

  it("Zod 擋得住三種真的會發生的打錯", () => {
    const base = doc as Record<string, unknown>;
    const withCurve = (curve: unknown): unknown => ({ ...base, attackRangeCurve: curve });
    // ① 順序錯 / 重複(內插會除以 0)
    expect(
      zConfigBodyScaleDoc.safeParse(
        withCurve([
          { bodyScale: 3, rangeMult: 1.3 },
          { bodyScale: 1, rangeMult: 1 },
        ]),
      ).success,
    ).toBe(false);
    expect(
      zConfigBodyScaleDoc.safeParse(
        withCurve([
          { bodyScale: 2, rangeMult: 1.2 },
          { bodyScale: 2, rangeMult: 1.3 },
        ]),
      ).success,
    ).toBe(false);
    // ② 把百分比當倍率填(120 → 120 倍射程)
    expect(
      zConfigBodyScaleDoc.safeParse(
        withCurve([
          { bodyScale: 1, rangeMult: 1 },
          { bodyScale: 2, rangeMult: 120 },
        ]),
      ).success,
    ).toBe(false);
    // ③ 只填一列(不成一條曲線)
    expect(zConfigBodyScaleDoc.safeParse(withCurve([{ bodyScale: 1, rangeMult: 1 }])).success).toBe(
      false,
    );
  });

  it("缺文件 / schema 打錯 → 出貨預設,不是「關掉」也不是空表", () => {
    expect(bodyScaleRulesFromDoc(undefined)).toEqual(DEFAULT_BODY_SCALE_RULES);
    expect(bodyScaleRulesFromDoc({ schema: "config.body-scale@2" })).toEqual(
      DEFAULT_BODY_SCALE_RULES,
    );
  });

  it("舊形狀的覆蓋層(attackRangeCoefficient)→ 出貨曲線,不是 NaN", () => {
    // 2026-08-01 早上出貨的是一個係數;如果有人存過那個形狀的 overlay,讀回來
    // 必須是一條合法曲線而不是「沒有曲線」。
    const old = {
      id: "body-scale",
      schema: "config.body-scale@1",
      enabled: true,
      attackRangeCoefficient: 1,
      minScale: 0.1,
      maxScale: 4,
    };
    const rules = bodyScaleRulesFromDoc(old);
    expect(rules.attackRangeCurve).toEqual(DEFAULT_ATTACK_RANGE_CURVE);
    expect(attackRangeScaleFactor(3, rules)).toBeCloseTo(1.3, 10);
  });
});

describe("GH#252 —— 技能距離刻意不連動(把這個決定釘住)", () => {
  it("體型放大只動 Stat.AttackRange,技能距離的來源一個位元都沒動", () => {
    const world = new SimWorld(SKELETON_ARENA, 3);
    const id = spawnChampion(world, {
      championId: registerScaled("probe.abil", SELA, 3),
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { ...Z0.center },
      zone: 0,
    });
    expect(world.stats.get(id)!.final[Stat.AttackRange]).toBeCloseTo(SELA_RANGE * 1.3, 5);
    expect(world.combatEnv.abilityRange).toBe(1); // 預設表;出貨值 0.6 由內容注入
  });
});
