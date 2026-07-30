/**
 * 觸發條件 —— 行為守衛 (owner 2026-07-30 「on-attack by condition」).
 *
 * ⛔ 這份檔案裡**沒有一條**斷言長成「schema 有這個欄位」或「條件物件長這樣」。
 * 那是失敗形態 ⑦(掃屬性代替掃行為)——「`{kind:"stat"}` 解析得出來」是一個屬性,
 * 「血量 34% 的小兵真的多掉了 9999」才是行為。每一條都跑真的 `SimWorld.step()`,
 * 走真的 `fireHooks` → `runEffects` → `damageQueue`,讀的是 `world.health` 上真的
 * 血量差。
 *
 * 也刻意**不用** `it.each(從磁碟掃出來的清單)` —— 那種守衛在內容被刪光的時候
 * 不是失敗,是**根本不存在**(下限只有 `toBeGreaterThan(0)` 的那種)。這裡每一條
 * 案例都是手寫的、固定的、必須成立的。
 *
 * 覆蓋(對照 lane 需求逐條):
 *   ① 條件成立 → 傷害真的多了 / 不成立 → 沒多       …… 見「② 執行門檻」
 *   ② 機率:固定 seed 跑 N 次,觸發次數落在期望區間 …… 見「④ 機率是條件」
 *   ③ 組合:一真一假 → all 不觸發、any 觸發          …… 見「⑤ 組合技」
 *   ④ 決定性:同 seed 兩次逐位元相同 + 抽籤次數只跟樹形有關 …… 見「⑥ 決定性」
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA, THORNE } from "./skeleton";
import { spawnChampion } from "../spawnChampion";
import { attachSource } from "../stats/statPipeline";
import { fireHooks } from "../effects/hooks";
import { Rng } from "../math/rng";
import { MONSTER_TEAM, MOB_MODEL_KEY, spawnMob, type MobRules } from "../mobs";
import { asSeatId, asTeamId, type EntityId } from "../../ids";
import type { HookDef } from "../stats/modifiers";
import type { EffectDef } from "../effects/effect";
import {
  conditionChanceCount,
  conditionDepth,
  describeCondition,
  drawChances,
  evaluateCondition,
  hookConditionLabels,
  retargetStatLeaf,
  setStatLeafMode,
  statSupportsPercent,
  type EffectCondition,
} from "./condition";
import { zEffectCondition } from "../../content/schema/condition";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;

/** Mob rules tuned so a spawned zombie is a stable, readable punching bag. */
const MOB_RULES: MobRules = {
  fromRound: 1,
  firstWaveTicks: 1,
  waveIntervalTicks: 999,
  mobsPerWaveCap: 1,
  maxAlivePerZone: 9,
  level: 1,
  maxHp: 10_000,
  moveSpeed: 0,
  hpRegenPerSec: 0,
  modelKey: MOB_MODEL_KEY,
  sizeMult: 1,
  tintStrength: 0.65,
  attackDamage: 0,
  attackRangeSq: 0,
  attackCdTicks: 999,
  radius: 0.6,
  rewardGold: 0,
  rewardXp: 0,
  killsPerLevel: 999,
  boss: null,
  special: null,
};

interface Stage {
  world: SimWorld;
  hero: EntityId;
  foe: EntityId;
  mob: EntityId;
}

/**
 * 一位英雄 + 一位敵方英雄 + 一隻小兵,全部在同一個決鬥區。
 *
 * ⚠️ 先跑一 tick 再回傳:broad-phase 是在 `SimWorld.step` 開頭才 rebuild 的,
 * 少了這一步任何走 grid 的效果會在第一 tick 找不到人,而那會讓「條件擋住了」
 * 和「格子還沒建」長得一模一樣。
 */
function stage(seed = 7): Stage {
  const world = new SimWorld(SKELETON_ARENA, seed);
  world.combatActive = true;
  const hero = spawnChampion(world, {
    championId: SELA.id,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  const foe = spawnChampion(world, {
    championId: THORNE.id,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: C.x + 1, z: C.z },
    zone: 0,
  });
  const mob = spawnMob(world, 0, MOB_RULES, 1, 0);
  world.step(new Map());
  return { world, hero, foe, mob };
}

const hp = (w: SimWorld, id: EntityId): number => w.health.get(id)!.hp;

/** Force a body's hp to an exact FRACTION of its current maximum. */
function setHpRatio(w: SimWorld, id: EntityId, ratio: number): void {
  const h = w.health.get(id)!;
  h.hp = h.maxHp * ratio;
}

const BONUS = 500;

/** The on-attack proc under test: +500 true damage, gated by `condition`. */
function procHook(condition?: EffectCondition, chance?: number): HookDef {
  const dmg: EffectDef = {
    kind: "damage",
    damageType: "true", // true damage: no armor/MR variance to reason around
    amount: { flat: BONUS },
  };
  return {
    on: "onBasicAttack",
    effects: [dmg],
    ...(condition !== undefined ? { condition } : {}),
    ...(chance !== undefined ? { chance } : {}),
  };
}

function armProc(w: SimWorld, hero: EntityId, hook: HookDef): void {
  attachSource(w, hero, { id: "test:proc", kind: "item", hooks: [hook] });
}

/**
 * Swing once and let the damage queue actually resolve. Returns hp lost.
 *
 * ⚠️ `fireHooks` by itself deals NO damage — the only damage in a swing is the
 * hook's own payload — but the tick it resolves on also runs `regenSystem`, so
 * a fired proc reads as 499.95 rather than 500. Comparing against `>= BONUS`
 * therefore fails for a proc that DID fire, which is a test bug wearing the
 * costume of a real one. {@link fired} bands it instead: nothing else in this
 * fixture can move hp by more than a regen tick, so 「掉了半個 BONUS 以上」 is an
 * exact reading of 「加成真的落下去了」.
 */
function swing(w: SimWorld, attacker: EntityId, target: EntityId): number {
  const before = hp(w, target);
  fireHooks(w, attacker, "onBasicAttack", target);
  w.step(new Map());
  return before - hp(w, target);
}

/** Did the proc land? (hp lost is BONUS minus one regen tick, or ~0.) */
const fired = (hpLost: number): boolean => hpLost > BONUS / 2;

// ===========================================================================
// ① 「不是英雄」—— kind leaf，正面測試 + not
// ===========================================================================
describe("① 目標種類", () => {
  const notChampion: EffectCondition = {
    not: { kind: "kind", subject: "target", is: "champion" },
  };

  it("★ 打小兵(非英雄) → 加成真的落下去了", () => {
    cover("condition-kind-mob");
    const s = stage();
    armProc(s.world, s.hero, procHook(notChampion));
    expect(fired(swing(s.world, s.hero, s.mob))).toBe(true);
  });

  it("★ 打英雄 → 一點加成都沒有", () => {
    const s = stage();
    armProc(s.world, s.hero, procHook(notChampion));
    // 把條件求值改成永遠 true,這一條就會變成 >= 500 而紅。
    expect(fired(swing(s.world, s.hero, s.foe))).toBe(false);
  });

  /**
   * DECISION 2 in behaviour, BOTH directions. An entity-less event (`onLevelUp`
   * with a `target: "self"` hook) is fired for real and the hp of the body it
   * lands on is read back.
   */
  function selfProcOnLevelUp(cond: EffectCondition): number {
    const s = stage();
    attachSource(s.world, s.hero, {
      id: "test:selfproc",
      kind: "item",
      hooks: [{ ...procHook(cond), target: "self", on: "onLevelUp" }],
    });
    const before = hp(s.world, s.hero);
    fireHooks(s.world, s.hero, "onLevelUp");
    s.world.step(new Map());
    return before - hp(s.world, s.hero);
  }

  it("★ 沒有目標 → subject:\"target\" 的數值條件讀 false，效果不落地", () => {
    cover("condition-no-target");
    expect(
      fired(
        selfProcOnLevelUp({
          kind: "stat",
          subject: "target",
          stat: "hp",
          mode: "percent",
          op: "<",
          value: 0.99,
        }),
      ),
    ).toBe(false);
  });

  it("★ 沒有目標時 `not(目標是英雄)` 是 TRUE —— 兩值邏輯的代價，而且它是被測到的", () => {
    // 這一條是刻意釘住 condition.ts DECISION 2 那段「會嚇到人」的推論：葉子讀
    // false，`not` 就把它翻成 true。它不是缺陷，但它必須是**被測到的**行為，
    // 否則下一個人會以為沒有目標時整棵樹都會被跳過。
    expect(fired(selfProcOnLevelUp(notChampion))).toBe(true);
  });
});

// ===========================================================================
// ② 執行門檻 —— 血量百分比比較（獸矛那一格）
// ===========================================================================
describe("② 血量百分比門檻", () => {
  const below35: EffectCondition = {
    kind: "stat",
    subject: "target",
    stat: "hp",
    mode: "percent",
    op: "<",
    value: 0.35,
  };

  it("★ 目標 30% 血 → 加成真的多了", () => {
    cover("condition-hp-percent");
    const s = stage();
    armProc(s.world, s.hero, procHook(below35));
    setHpRatio(s.world, s.mob, 0.3);
    expect(fired(swing(s.world, s.hero, s.mob))).toBe(true);
  });

  it("★ 目標 50% 血 → 一點都沒多", () => {
    const s = stage();
    armProc(s.world, s.hero, procHook(below35));
    setHpRatio(s.world, s.mob, 0.5);
    expect(fired(swing(s.world, s.hero, s.mob))).toBe(false);
  });

  it("★ 門檻是 CURRENT/MAX，不是絕對值 —— 同樣 3000 血，最大值不同結果就不同", () => {
    const lo = stage();
    armProc(lo.world, lo.hero, procHook(below35));
    const hlo = lo.world.health.get(lo.mob)!;
    hlo.maxHp = 10_000;
    hlo.hp = 3_000; // 30% → 觸發
    expect(fired(swing(lo.world, lo.hero, lo.mob))).toBe(true);

    const hi = stage();
    armProc(hi.world, hi.hero, procHook(below35));
    const hhi = hi.world.health.get(hi.mob)!;
    hhi.maxHp = 6_000;
    hhi.hp = 3_000; // 50% → 不觸發
    expect(fired(swing(hi.world, hi.hero, hi.mob))).toBe(false);
  });

  it("★ 絕對值模式讀的是原始數字，不是比例", () => {
    const s = stage();
    armProc(s.world, s.hero, procHook({
      kind: "stat",
      subject: "target",
      stat: "hp",
      mode: "absolute",
      op: "<",
      value: 4_000,
    }));
    const h = s.world.health.get(s.mob)!;
    h.maxHp = 100_000;
    h.hp = 3_500; // 3.5% —— 百分比模式下也會過，所以改用一個百分比擋不住的值
    expect(fired(swing(s.world, s.hero, s.mob))).toBe(true);

    const s2 = stage();
    armProc(s2.world, s2.hero, procHook({
      kind: "stat",
      subject: "target",
      stat: "hp",
      mode: "absolute",
      op: "<",
      value: 4_000,
    }));
    const h2 = s2.world.health.get(s2.mob)!;
    h2.maxHp = 100_000;
    h2.hp = 5_000;
    expect(fired(swing(s2.world, s2.hero, s2.mob))).toBe(false);
  });
});

// ===========================================================================
// ③ 「我方」條件 —— subject: "self"
// ===========================================================================
describe("③ 自己的數值也是條件", () => {
  const selfLow: EffectCondition = {
    kind: "stat",
    subject: "self",
    stat: "hp",
    mode: "percent",
    op: "<=",
    value: 0.4,
  };

  it("★ 自己殘血 → 觸發（法師保命那一類的形狀）", () => {
    cover("condition-self-stat");
    const s = stage();
    armProc(s.world, s.hero, procHook(selfLow));
    setHpRatio(s.world, s.hero, 0.2);
    expect(fired(swing(s.world, s.hero, s.foe))).toBe(true);
  });

  it("★ 自己滿血 → 不觸發", () => {
    const s = stage();
    armProc(s.world, s.hero, procHook(selfLow));
    expect(fired(swing(s.world, s.hero, s.foe))).toBe(false);
  });
});

// ===========================================================================
// ④ 機率也是條件 —— 固定 seed 跑 N 次，落在期望區間
// ===========================================================================
describe("④ 機率是一種條件", () => {
  /** N 次獨立揮擊裡，加成真的落下去的次數。 */
  function procCount(p: number, trials: number, seed: number): number {
    let hits = 0;
    for (let i = 0; i < trials; i++) {
      // 每次都是一個全新的世界，seed 隨 i 前進 —— 同一顆 seed 重跑會拿到
      // 完全相同的 hits，這是下一節「決定性」直接依賴的性質。
      const s = stage(seed + i);
      armProc(s.world, s.hero, procHook({ kind: "chance", p }));
      if (fired(swing(s.world, s.hero, s.foe))) hits++;
    }
    return hits;
  }

  it("★ p=0.25 跑 400 次 → 觸發次數落在 3σ 區間內（不是「有觸發過」）", () => {
    cover("condition-chance-distribution");
    const N = 400;
    const p = 0.25;
    const hits = procCount(p, N, 1000);
    // σ = sqrt(N·p·(1−p)) = sqrt(400·0.25·0.75) = 8.66 → 3σ ≈ 26
    const mean = N * p;
    const sigma3 = 26;
    expect(hits).toBeGreaterThan(mean - sigma3);
    expect(hits).toBeLessThan(mean + sigma3);
    // 而且它必須真的在「隨機」，不是常數 —— 兩個端點都不可以是 N 或 0。
    expect(hits).not.toBe(0);
    expect(hits).not.toBe(N);
  });

  it("★ p=0 從不觸發 / p=1 每次觸發（邊界不是靠運氣過的）", () => {
    expect(procCount(0, 40, 2000)).toBe(0);
    expect(procCount(1, 40, 3000)).toBe(40);
  });

  it("★ 同一顆 seed 重跑 → 觸發次數逐位元相同", () => {
    expect(procCount(0.25, 120, 4242)).toBe(procCount(0.25, 120, 4242));
  });
});

// ===========================================================================
// ⑤ 組合技 —— all / any / not，一真一假
// ===========================================================================
describe("⑤ 組合技", () => {
  /** 真:目標是英雄。假:目標血量 < 1%（沒人這麼殘）。 */
  const T: EffectCondition = { kind: "kind", subject: "target", is: "champion" };
  const F: EffectCondition = {
    kind: "stat",
    subject: "target",
    stat: "hp",
    mode: "percent",
    op: "<",
    value: 0.01,
  };

  /** Does a proc gated by `cond` actually land on the enemy CHAMPION? */
  const lands = (cond: EffectCondition): boolean => {
    const s = stage();
    armProc(s.world, s.hero, procHook(cond));
    return fired(swing(s.world, s.hero, s.foe));
  };

  it("★ all:[真,假] → 不觸發", () => {
    cover("condition-compose");
    expect(lands({ all: [T, F] })).toBe(false);
  });

  it("★ any:[真,假] → 觸發", () => {
    expect(lands({ any: [T, F] })).toBe(true);
  });

  it("★ all:[真,真] 觸發 / any:[假,假] 不觸發", () => {
    expect(lands({ all: [T, T] })).toBe(true);
    expect(lands({ any: [F, F] })).toBe(false);
  });

  it("★ not 真的反轉，而且可以巢狀在 all 裡", () => {
    expect(lands({ not: T })).toBe(false);
    expect(lands({ not: F })).toBe(true);
    expect(lands({ all: [T, { not: F }] })).toBe(true);
  });

  it("★ 順序不影響結果 —— all:[假,真] 和 all:[真,假] 一樣不觸發", () => {
    expect(lands({ all: [F, T] })).toBe(false);
    expect(lands({ any: [F, T] })).toBe(true);
  });
});

// ===========================================================================
// ⑥ 決定性 —— 抽籤次數只跟「樹的形狀」有關，跟世界狀態無關
// ===========================================================================
describe("⑥ 決定性", () => {
  /**
   * 這一節就是 condition.ts DECISION 1 的守衛。把短路求值加回去(或者把兩個
   * phase 的走訪順序反過來)，下面第一條就會紅：抽籤次數會開始跟著 hp/種類跑。
   */
  const twoChances: EffectCondition = {
    all: [
      { kind: "chance", p: 0.5 },
      { kind: "kind", subject: "target", is: "champion" },
      { kind: "chance", p: 0.5 },
    ],
  };

  it("★ 抽籤次數 = 樹裡 chance 葉子的數量，不論條件成不成立", () => {
    cover("condition-determinism");
    const s = stage();
    const rngBefore = s.world.rng.state;
    evaluateCondition(s.world, twoChances, { self: s.hero, target: s.foe }); // 中間那格 TRUE
    const usedWhenTrue = s.world.rng.state;

    const s2 = stage();
    expect(s2.world.rng.state).toBe(rngBefore); // 同 seed，同起點
    evaluateCondition(s2.world, twoChances, { self: s2.hero, target: s2.mob }); // 中間那格 FALSE
    // 一個小兵、一個英雄 —— 中間那個 kind 葉子答案相反，而 rng 走到同一格。
    expect(s2.world.rng.state).toBe(usedWhenTrue);
  });

  it("★ 完全沒有目標時也一樣抽滿", () => {
    const s = stage();
    const before = s.world.rng.state;
    evaluateCondition(s.world, twoChances, { self: s.hero });
    const after = s.world.rng.state;

    const s2 = stage();
    evaluateCondition(s2.world, twoChances, { self: s2.hero, target: s2.foe });
    expect(s2.world.rng.state).toBe(after);
    expect(after).not.toBe(before); // 真的有抽
  });

  /**
   * ⭐ 短路求值的真正代價 —— 這一條是 M2 突變唯一抓得到的地方。
   *
   * 抽籤在 phase 1 就做完了，所以「phase 2 短路」不會少抽任何一次 rng ——
   * `world.rng.state` 兩邊一模一樣，光看 rng 狀態的守衛**抓不到它**（我第一版
   * 就是這樣，M2 全綠）。真正壞掉的是 CURSOR：`all` 提早 return 之後，它底下
   * 那個 chance 葉子沒有被消費，於是**後面那個葉子讀到了別人的籤**。
   *
   * 下面這棵樹把那個錯位放大成一個可觀測的布林：
   *
   *     any:[ all:[ 恆假, chance(p=0) ],   ← rolls[0] = false
   *           chance(p=1) ]                 ← rolls[1] = true
   *
   *   · 正確（不短路）：all = 假 && 假 = 假；any = 假 || 真 = **真** → 傷害落地
   *   · 短路：all 讀到恆假就 return，rolls[0] 沒被消費 →
   *     外層那個 chance 讀到 rolls[0]=false → any = **假** → 一點傷害都沒有
   *
   * p=0 / p=1 讓它跟運氣完全無關：兩個結果是確定的，不是機率性的。
   */
  it("★ 短路會讓籤錯位 —— all 底下沒被消費的籤不可以流到別的葉子", () => {
    cover("condition-no-shortcircuit");
    const alwaysFalse: EffectCondition = {
      kind: "stat",
      subject: "target",
      stat: "hp",
      mode: "percent",
      op: "<",
      value: 0, // 沒有人的血量 < 0%
    };
    const s = stage();
    armProc(s.world, s.hero, procHook({
      any: [{ all: [alwaysFalse, { kind: "chance", p: 0 }] }, { kind: "chance", p: 1 }],
    }));
    expect(fired(swing(s.world, s.hero, s.foe))).toBe(true);
  });

  /**
   * ⭐ 上面那一條只釘了 `all`。**`any` 一樣會錯位，而且沒有人守。**
   *
   * 2026-07-31 駁斥者實測：把 `evalNode` 的 `any` 分支改成短路
   * （`for (…) { if (evalNode(…)) return true; } return false;`）之後，
   * **這個檔案的 53 條全部照樣綠**。兩個分支是同構的 —— 修好一個而只守一個，
   * 就是第③種故障（可以從實作刪掉但測試還是全綠）在同一個函式裡的另一半。
   *
   * 這棵樹的算法：籤是 [T, F, T]（phase 1 依走訪序抽好）。
   *   · 正確（不短路）：內層 any 吃掉 rolls[0]=T 與 rolls[1]=F → 真；
   *     外層 all 的第二支 chance 讀 rolls[2]=T → **all = 真 && 真 = 真**
   *   · 短路：any 讀到 rolls[0]=T 就 return，**rolls[1] 沒被消費** →
   *     外層 chance 讀到 rolls[1]=F → **all = 真 && 假 = 假**
   * p 全是 0 或 1，所以這條斷言與運氣完全無關。
   */
  it("★ 短路會讓籤錯位 —— any 底下沒被消費的籤不可以流到別的葉子", () => {
    cover("condition-no-shortcircuit");
    const s = stage();
    expect(
      evaluateCondition(
        s.world,
        {
          all: [
            { any: [{ kind: "chance", p: 1 }, { kind: "chance", p: 0 }] },
            { kind: "chance", p: 1 },
          ],
        },
        { self: s.hero, target: s.foe },
      ),
    ).toBe(true);
  });

  it("★ 同一棵樹的葉子順序決定它拿到哪一支籤（p=1 在前 / 在後結果不同）", () => {
    // 兩棵樹的 chance 葉子集合完全一樣，只有位置不同 —— 只要 phase 1/phase 2
    // 的走訪順序有任何一邊被改動，這兩個答案就會互換。
    const s1 = stage();
    expect(
      evaluateCondition(
        s1.world,
        { all: [{ kind: "chance", p: 1 }, { any: [{ kind: "chance", p: 0 }, { kind: "kind", subject: "target", is: "champion" }] }] },
        { self: s1.hero, target: s1.foe },
      ),
    ).toBe(true);
    const s2 = stage();
    expect(
      evaluateCondition(
        s2.world,
        { all: [{ kind: "chance", p: 0 }, { any: [{ kind: "chance", p: 1 }, { kind: "kind", subject: "target", is: "champion" }] }] },
        { self: s2.hero, target: s2.foe },
      ),
    ).toBe(false);
  });

  it("★ drawChances 的次數 == conditionChanceCount（宣告值就是實際值）", () => {
    for (const cond of [
      twoChances,
      { kind: "chance", p: 0.3 } as EffectCondition,
      { any: [{ not: { kind: "chance", p: 0.1 } }, { kind: "chance", p: 0.9 }] } as EffectCondition,
      { kind: "kind", subject: "self", is: "champion" } as EffectCondition,
    ]) {
      const out: boolean[] = [];
      drawChances(cond, new Rng(5), out);
      expect(out.length).toBe(conditionChanceCount(cond));
    }
  });

  it("★ 同 seed 打完整場 → rng 狀態與血量逐位元相同", () => {
    const run = (): { rng: number; heroHp: number; foeHp: number } => {
      const s = stage(31337);
      armProc(s.world, s.hero, procHook({
        all: [
          { kind: "chance", p: 0.4 },
          { kind: "stat", subject: "target", stat: "hp", mode: "percent", op: "<", value: 0.9 },
        ],
      }));
      for (let i = 0; i < 40; i++) {
        fireHooks(s.world, s.hero, "onBasicAttack", s.foe);
        s.world.step(new Map());
      }
      return { rng: s.world.rng.state, heroHp: hp(s.world, s.hero), foeHp: hp(s.world, s.foe) };
    };
    expect(run()).toEqual(run());
  });
});

// ===========================================================================
// ⑦ 內部冷卻與條件的互動 —— 條件不成立不可以燒掉 ICD
// ===========================================================================
describe("⑦ 條件失敗不燒內部冷卻", () => {
  it("★ 條件擋掉的那一下不記 hookLastFired，下一下條件成立時照樣觸發", () => {
    cover("condition-icd");
    const s = stage();
    armProc(s.world, s.hero, {
      ...procHook({
        kind: "stat",
        subject: "target",
        stat: "hp",
        mode: "percent",
        op: "<",
        value: 0.35,
      }),
      internalCooldown: 100, // 一整場只能觸發一次
    });
    // 滿血 → 擋掉。若這一下燒了 ICD，後面那一下就再也不會觸發。
    expect(fired(swing(s.world, s.hero, s.mob))).toBe(false);
    setHpRatio(s.world, s.mob, 0.2);
    expect(fired(swing(s.world, s.hero, s.mob))).toBe(true);
  });
});

// ===========================================================================
// ⑧ 舊行為零位移 —— 沒有 condition 的 hook 完全不變
// ===========================================================================
describe("⑧ 沒有 condition 的 hook 一個位元都沒動", () => {
  it("★ 無條件 hook 照常觸發，而且不消耗任何 rng", () => {
    cover("condition-absent-noop");
    const s = stage();
    armProc(s.world, s.hero, procHook());
    const before = s.world.rng.state;
    expect(fired(swing(s.world, s.hero, s.foe))).toBe(true);
    expect(s.world.rng.state).toBe(before);
  });

  it("★ `chance` 這一欄的抽籤位置沒有被條件系統推移", () => {
    // 沒有 condition 時 evaluateCondition 立刻回 true 且不抽籤，所以一個
    // 只有 `chance` 的 hook 的 rng 消耗必須跟條件系統上線前完全一樣：一次。
    const s = stage();
    armProc(s.world, s.hero, procHook(undefined, 0.5));
    const before = s.world.rng.state;
    swing(s.world, s.hero, s.foe);
    const probe = new Rng(before);
    probe.chance(0.5);
    expect(s.world.rng.state).toBe(probe.state);
  });
});

// ===========================================================================
// ⑨ 人話 —— 玩家/編輯器看到的那一句是從同一個物件推導的
// ===========================================================================
describe("⑨ 條件文字", () => {
  it("★ 獸矛那一句真的讀得懂", () => {
    cover("condition-describe");
    const beastSpear: EffectCondition = {
      any: [
        {
          all: [
            { not: { kind: "kind", subject: "target", is: "champion" } },
            { kind: "stat", subject: "target", stat: "hp", mode: "percent", op: "<", value: 0.35 },
          ],
        },
        {
          all: [
            { kind: "kind", subject: "target", is: "champion" },
            { kind: "chance", p: 0.01 },
          ],
        },
      ],
    };
    expect(describeCondition(beastSpear)).toBe(
      "（目標不是英雄 且 目標生命 < 35%） 或 （目標是英雄 且 1% 機率）",
    );
  });

  it("★ 改條件，句子就跟著改（它不是手打的）", () => {
    const a = describeCondition({
      kind: "stat",
      subject: "target",
      stat: "hp",
      mode: "percent",
      op: "<",
      value: 0.35,
    });
    const b = describeCondition({
      kind: "stat",
      subject: "target",
      stat: "hp",
      mode: "percent",
      op: "<",
      value: 0.5,
    });
    expect(a).toBe("目標生命 < 35%");
    expect(b).toBe("目標生命 < 50%");
    expect(a).not.toBe(b);
  });

  it("★ 沒有條件 → null（卡片上不會多印一行空的）", () => {
    expect(describeCondition(undefined)).toBeNull();
  });

  it("★ 道具/技能的條件列表是去重過的，而且照著 hook 的順序", () => {
    const labels = hookConditionLabels({
      passive: [
        { condition: { kind: "chance", p: 0.15 } },
        { condition: { kind: "chance", p: 0.15 } }, // 重複，只印一次
        { condition: { kind: "kind", subject: "target", is: "mob" } },
        {}, // 無條件的 hook 不貢獻任何一行
      ],
    });
    expect(labels).toEqual(["觸發條件：15% 機率", "觸發條件：目標是小兵"]);
  });
});

// ===========================================================================
// ⑩ 上下界與 percent 的分母 —— 錯的東西必須在 schema 就被擋下來
// ===========================================================================
describe("⑩ schema 邊界", () => {
  const ok = (c: unknown): boolean => zEffectCondition.safeParse(c).success;

  it("★ 只有 hp/mp 開放 percent，其餘只能 absolute", () => {
    cover("condition-percent-domain");
    expect(statSupportsPercent("hp")).toBe(true);
    expect(statSupportsPercent("mp")).toBe(true);
    expect(statSupportsPercent("attackSpeed")).toBe(false);
    expect(ok({ kind: "stat", subject: "self", stat: "hp", mode: "percent", op: "<", value: 0.3 }))
      .toBe(true);
    // 攻速的百分比沒有分母 —— 這一行必須是 parse error，不是被默默改寫。
    expect(
      ok({ kind: "stat", subject: "self", stat: "attackSpeed", mode: "percent", op: "<", value: 0.3 }),
    ).toBe(false);
  });

  it("★ percent 的值是 0..1；35 打成 35 會被擋（上界，不是只有下界）", () => {
    const leaf = (value: number): unknown => ({
      kind: "stat",
      subject: "target",
      stat: "hp",
      mode: "percent" as const,
      op: "<" as const,
      value,
    });
    expect(ok(leaf(0.35))).toBe(true);
    expect(ok(leaf(35))).toBe(false);
    expect(ok(leaf(-0.1))).toBe(false);
  });

  it("★ 機率的上下界都在", () => {
    expect(ok({ kind: "chance", p: 0 })).toBe(true);
    expect(ok({ kind: "chance", p: 1 })).toBe(true);
    expect(ok({ kind: "chance", p: 1.5 })).toBe(false);
    expect(ok({ kind: "chance", p: -0.01 })).toBe(false);
  });

  it("★ 空的 all/any 不可授權（空 all 恆真、空 any 恆假，兩個都是靜默的謊）", () => {
    expect(ok({ all: [] })).toBe(false);
    expect(ok({ any: [] })).toBe(false);
  });

  it("★ 巢狀深度有上限，而且回報的深度就是實際深度", () => {
    let deep: EffectCondition = { kind: "chance", p: 0.5 };
    for (let i = 0; i < 8; i++) deep = { not: deep };
    expect(conditionDepth(deep)).toBe(9);
    expect(ok(deep)).toBe(false);
    expect(ok({ not: { not: { kind: "chance", p: 0.5 } } })).toBe(true);
  });

  it("★ 未知的欄位會被擋下來（打錯字不會變成靜默的無條件）", () => {
    expect(ok({ kind: "chance", p: 0.5, chnace: 1 })).toBe(false);
    expect(ok({ kind: "stat", subject: "enemy", stat: "hp", op: "<", value: 1 })).toBe(false);
  });
});

// ===========================================================================
// ⑪ 小兵/召喚物/守護者的 kind 判定不是「不是英雄就算」
// ===========================================================================
describe("⑪ kind 是四個正面測試", () => {
  it("★ 小兵 is mob 成立、is champion / is summon / is guardian 都不成立", () => {
    cover("condition-kind-positive");
    const s = stage();
    const ctx = { self: s.hero, target: s.mob };
    expect(evaluateCondition(s.world, { kind: "kind", subject: "target", is: "mob" }, ctx)).toBe(true);
    for (const is of ["champion", "summon", "guardian"] as const) {
      expect(evaluateCondition(s.world, { kind: "kind", subject: "target", is }, ctx)).toBe(false);
    }
  });

  it("★ 英雄 is champion 成立，is mob 不成立", () => {
    const s = stage();
    const ctx = { self: s.hero, target: s.foe };
    expect(evaluateCondition(s.world, { kind: "kind", subject: "target", is: "champion" }, ctx)).toBe(
      true,
    );
    expect(evaluateCondition(s.world, { kind: "kind", subject: "target", is: "mob" }, ctx)).toBe(false);
  });

  it("★ 小兵是在敵對陣營上的（測試佈景本身沒有偷偷把它放到自己隊）", () => {
    const s = stage();
    expect(s.world.team.get(s.mob)?.teamId).toBe(MONSTER_TEAM);
  });
});

// ===========================================================================
// ⑫ 編輯器的兩個修復 —— 「編輯器也要配合」那一半的守衛
//
// 這兩個 helper 住在 shared 而不是 React 元件裡，正是為了讓它們可以被**跑真的
// zod**驗證，而不是靠一個這個 repo 沒有 renderer 的 DOM 測試。
// ===========================================================================
describe("⑫ 下拉選單切換時的修復", () => {
  const hpPercent = {
    kind: "stat",
    subject: "target",
    stat: "hp",
    mode: "percent",
    op: "<",
    value: 0.35,
  } as const;

  it("★ 生命%→攻速：mode 必須被修成 absolute，否則存下去的是一個 parse error", () => {
    cover("condition-editor-retarget");
    const next = retargetStatLeaf(hpPercent, "attackSpeed");
    // 讀的是**真的 schema**，不是「mode 欄位等於 absolute」這種屬性斷言。
    expect(zEffectCondition.safeParse(next).success).toBe(true);
    // 沒修的話長這樣，而它是一個會在存檔時才炸的錯：
    expect(zEffectCondition.safeParse({ ...hpPercent, stat: "attackSpeed" }).success).toBe(false);
  });

  it("★ 切換之後 0.35 不可以被當成「攻速 0.35」帶過去 —— 那是一個永遠不成立的閘", () => {
    const next = retargetStatLeaf(hpPercent, "attackSpeed");
    expect(next.value).toBe(0);
    // 修復後的葉子在真的世界裡是有意義的（每個人的攻速都 < 99）。
    const s = stage();
    expect(
      evaluateCondition(
        s.world,
        { ...next, op: "<", value: 99 } as EffectCondition,
        { self: s.hero, target: s.foe },
      ),
    ).toBe(true);
  });

  it("★ 反方向切換（攻速→生命）保住 absolute，不會憑空生出一個百分比", () => {
    const asLeaf = retargetStatLeaf(hpPercent, "attackSpeed");
    const back = retargetStatLeaf(asLeaf, "hp");
    expect(zEffectCondition.safeParse(back).success).toBe(true);
    expect(back.mode).toBe("absolute");
  });

  it("★ setStatLeafMode 對沒有分母的屬性是 no-op，不是靜默寫壞", () => {
    const asLeaf = retargetStatLeaf(hpPercent, "attackSpeed");
    expect(setStatLeafMode(asLeaf, "percent")).toEqual(asLeaf);
    expect(zEffectCondition.safeParse(setStatLeafMode(asLeaf, "percent")).success).toBe(true);
  });

  it("★ absolute→percent 會把超出 0..1 的舊數字夾回合法範圍", () => {
    const abs = {
      kind: "stat",
      subject: "target",
      stat: "hp",
      mode: "absolute",
      op: "<",
      value: 4000,
    } as const;
    expect(zEffectCondition.safeParse(setStatLeafMode(abs, "percent")).success).toBe(true);
  });
});
