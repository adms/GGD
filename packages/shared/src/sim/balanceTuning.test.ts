/**
 * 平衡調整守衛 —— #265 (初始 HP +300 / 生命倍率 4→3)、#267 (近戰攻速上限)、
 * #270 (競技場燃燒 = 真實傷害)。
 *
 * 每一條都斷言**出貨路徑**上的行為，不是斷言常數本身：
 *   · HP 走 `spawnChampion` → `recomputeStats` 寫進 `world.health.maxHp`
 *     （客戶端選角/商店預覽走同一個 `championStatBase`，所以顯示不會和戰鬥打架）
 *   · 攻速走 `recomputeStats` 的夾限（商店即時預覽跑的是同一支函式）
 *   · 火圈走 `fireRingSystem` 真的扣血的那一步
 *
 * 為什麼不用 `expect(src).toMatch(...)` 掃原始碼：那分不出程式碼和註解。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA, type ArenaDef } from "./world/ArenaDef";
import { registerSkeletonContent, THORNE, SELA } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import { normalizeCombatEnv, DEFAULT_COMBAT_ENV } from "./combatEnv";
import {
  CHAMPION_BASE_HEALTH_BONUS,
  championStatBase,
  championStatGrowth,
} from "./stats/attributes";
import { attachSource, recomputeStats } from "./stats/statPipeline";
import { STAT_CLAMPS, Stat } from "./stats/statTypes";
import { ModOp } from "./stats/modifiers";
import { DEFAULT_DAMAGE_POINT_MELEE } from "./systems/BasicAttackSystem";
import { beginCombatFireRing, fireRingRulesFromConfig } from "./fireRing";
import { mobRulesFromConfig } from "./mobs";

beforeAll(() => registerSkeletonContent());

const DT = 1 / 30;

/** Skeleton geometry minus the centre pillars (see FireRingSystem.test.ts). */
const OPEN_ARENA: ArenaDef = {
  id: "arena.balance-open",
  name: "Balance Test Arena",
  zones: SKELETON_ARENA.zones.map((z) => ({ ...z, obstacles: [] })),
};
const ZONE0 = OPEN_ARENA.zones[0]!;

let nextSeat = 0;
function champ(w: SimWorld, id: string, x: number, z: number, team = 1): EntityId {
  return spawnChampion(w, {
    championId: id as ChampionId,
    seatId: asSeatId(nextSeat++ % 12),
    teamId: asTeamId(team),
    pos: { x, z },
    zone: 0,
  });
}

const step = (w: SimWorld, n = 1): void => {
  for (let i = 0; i < n; i++) w.step(new Map());
};

/** The champion's RAW card value for `stat` at level 1 (no attributes, no bonus). */
const rawCard = (def: typeof THORNE, stat: Stat): number => def.baseStats[stat] ?? 0;

// ---------------------------------------------------------------- #265 HP
describe("#265 全英雄初始 HP +300，加在生命倍率之前 (balance-265-base-hp)", () => {
  it("+300 進的是 BASE，所以 ×倍率之後是 (raw+attr+300)×env，不是 base×env+300", () => {
    cover("balance-265-base-hp");
    // owner 的數字，寫死。其餘斷言用常數是為了好讀，但如果只用常數，把常數改成 0
    // 的變異會讓「期望」跟著一起變 0 而全部通過 —— 所以先在這裡把它釘死。
    expect(CHAMPION_BASE_HEALTH_BONUS).toBe(300);
    const env = normalizeCombatEnv({ maxHealth: 3.0 });

    // 手算英雄卡的三層：w3x 原始值 + 力量項 + #265 的平移項。
    const attrTerm = env.strToMaxHealth * THORNE.attributes!.str;
    const withoutBonus = rawCard(THORNE, Stat.MaxHealth) + attrTerm;
    const expectedBase = withoutBonus + CHAMPION_BASE_HEALTH_BONUS;

    expect(championStatBase(THORNE, Stat.MaxHealth, 1, env)).toBeCloseTo(expectedBase, 9);

    // 出貨路徑：spawnChampion → recomputeStats → world.health.maxHp。
    const w = new SimWorld(OPEN_ARENA, 7);
    w.combatEnv = env;
    const id = champ(w, "thorne", ZONE0.center.x, ZONE0.center.z);
    const maxHp = w.health.get(id)!.maxHp;

    // 這才是 owner 要的那個讀法。
    expect(maxHp).toBeCloseTo(expectedBase * env.maxHealth, 6);
    // 而且明確**不是**另外兩種讀法 —— 這兩行就是「方向」：
    //   倍率後才加 300（會比調整前更脆）
    expect(maxHp).not.toBeCloseTo(withoutBonus * env.maxHealth + CHAMPION_BASE_HEALTH_BONUS, 6);
    //   完全沒加
    expect(maxHp).not.toBeCloseTo(withoutBonus * env.maxHealth, 6);
    // 300 的實際重量：在 ×3 之下是 900 點血。
    expect(maxHp - withoutBonus * env.maxHealth).toBeCloseTo(
      CHAMPION_BASE_HEALTH_BONUS * env.maxHealth,
      6,
    );
  });

  it("+300 是一次性平移，不是每級都拿 —— 每級成長完全不動", () => {
    cover("balance-265-growth-untouched");
    // 常數項在 base(2)−base(1) 相減時抵銷。若有人把它寫成 ×level，這裡會爆。
    const perLevel =
      (THORNE.growth[Stat.MaxHealth] ?? 0) +
      DEFAULT_COMBAT_ENV.strToMaxHealth * THORNE.attributes!.strGrowth;
    expect(championStatGrowth(THORNE, Stat.MaxHealth)).toBeCloseTo(perLevel, 9);
    // 第 5 級 = 基礎 + 4×成長，中間沒有多長出來的 300。
    expect(championStatBase(THORNE, Stat.MaxHealth, 5)).toBeCloseTo(
      championStatBase(THORNE, Stat.MaxHealth, 1) + perLevel * 4,
      9,
    );
  });

  it("只有 maxHealth 拿到 +300 —— 魔力/攻擊/護甲一點都沒動", () => {
    cover("balance-265-health-only");
    const env = DEFAULT_COMBAT_ENV;
    for (const stat of [Stat.MaxMana, Stat.AttackDamage, Stat.Armor, Stat.HealthRegen]) {
      const src = { str: THORNE.attributes!.str, agi: THORNE.attributes!.agi, int: THORNE.attributes!.int };
      const attr =
        stat === Stat.MaxMana
          ? env.intToMaxMana * src.int
          : stat === Stat.AttackDamage
            ? env.strToAttackDamage * src.str
            : stat === Stat.Armor
              ? env.agiToArmor * src.agi
              : env.strToHealthRegen * src.str;
      expect(championStatBase(THORNE, stat, 1, env)).toBeCloseTo(rawCard(THORNE, stat) + attr, 9);
    }
  });

  it("出貨的 combat-env 表把生命倍率鎖在 3.0 (owner: 4=>3)", () => {
    cover("balance-265-env-multiplier");
    const doc = JSON.parse(
      readFileSync(join(__dirname, "../../../../content/config/combat-env.json"), "utf8"),
    ) as { multipliers: Record<string, number> };
    expect(doc.multipliers.maxHealth).toBe(3.0);
    // 回血倍率沒有跟著動 —— 這是 #265 第三問的調查結論，不是順手改的。
    expect(doc.multipliers.healthRegen).toBe(1.0);
  });

  it("#244 的解耦還在：英雄加血不得移動肉鴿小怪的曲線", () => {
    cover("balance-265-mob-decoupled");
    // pre-#244 的 legacy tier（小兵卡沒有 baseHp，借英雄卡當頭像）。
    const cfg = {
      fromRound: 3,
      firstWaveSec: 1,
      waveIntervalSec: 2,
      mobsPerWaveCap: 5,
      maxAlivePerZone: 15,
      mob: {
        maxHp: 24,
        attackDamage: 1.2,
        moveSpeed: 3,
        attackRange: 1.8,
        attackCdSec: 1,
        radius: 0.6,
        championId: "thorne",
        baseLevel: 3,
        levelPerRound: 1,
      },
      reward: { gold: 20, xp: 40, killsPerLevel: 6 },
    };
    const rules = mobRulesFromConfig(cfg, DT, 3);
    const level = rules.level;
    const heroSheet = championStatBase(THORNE, Stat.MaxHealth, level);
    // 小兵讀到的是「不含 #265 平移」的那張表。
    expect(rules.maxHp).toBe(
      Math.round(championStatBase(THORNE, Stat.MaxHealth, level, DEFAULT_COMBAT_ENV, {
        championHealthBonus: false,
      })),
    );
    // 而且和英雄自己的血量差距正好是那 300 —— 若解耦破了，這條會變成 0。
    // 寫死 300 而不是引用常數：常數被改成 0 的變異不能讓期望值跟著溜走。
    expect(Math.round(heroSheet) - rules.maxHp).toBe(300);
  });
});

// ------------------------------------------------------------- #267 攻速
/**
 * #267 owner:「攻速上限分析，近戰攻速可以更高」—— 量完之後**沒有**放寬 2.5，
 * 因為量測顯示夾限根本不是卡住近戰的東西。這一組把量測結果釘成守衛：
 * 若哪天有人只把 STAT_CLAMPS 拉高、卻沒動揮擊管線，面板數字就會開始說謊，
 * 而「飽和點」那條會立刻讓那個差距現形。
 */
describe("#267 近戰攻速：真正的上限在揮擊管線，不在夾限 (balance-267-melee-as)", () => {
  /**
   * 真實揮擊速率：把攻速**寫進 `sc.final`**（那正是 BasicAttackSystem 讀的欄位，
   * 也是 recomputeStats 寫的同一格），打一個不還手、不會死、不會動的木樁 10 秒，
   * 數 `damage`(origin=basic) 事件。這是玩家真的收到的刀數。
   *
   * 為什麼直接寫 `sc.final` 而不是掛 modifier：要量的是「假設面板寫 X，管線給
   * 得出多少」，而面板本身就被 2.5 夾住 —— 走 modifier 永遠問不到 2.5 以上。
   */
  function realAttacksPerSec(sheetAs: number): number {
    const w = new SimWorld(OPEN_ARENA, 31);
    w.combatActive = true;
    const me = champ(w, "thorne", ZONE0.center.x, ZONE0.center.z + 12);
    const bag = champ(w, "thorne", ZONE0.center.x + 1.0, ZONE0.center.z + 12, 2);
    const sc = w.stats.get(me)!;
    const bagHp = w.health.get(bag)!;
    const bagSc = w.stats.get(bag)!;
    let hits = 0;
    for (let i = 0; i < 300; i++) {
      sc.final[Stat.AttackSpeed] = sheetAs; // 面板值（可超過夾限，用來問「拿不拿得到」）
      bagHp.hp = bagHp.maxHp; // 木樁不死
      bagSc.final[Stat.MoveSpeed] = 0; // 木樁不動、也不追人
      step(w);
      for (const ev of w.events) {
        const d = ev.data as { source?: EntityId; origin?: string };
        if (ev.type === "damage" && d.source === me && d.origin === "basic") hits++;
      }
    }
    return hits / 10;
  }

  it("面板 2.5 已經幾乎踩在飽和點上：再往上加，玩家一次都拿不到", () => {
    cover("balance-267-melee-as");
    const cap = STAT_CLAMPS[Stat.AttackSpeed]![1]; // 2.5
    const at2 = realAttacksPerSec(2.0);
    const atCap = realAttacksPerSec(cap);
    const at4 = realAttacksPerSec(4.0); // 假設有人把夾限放寬到 4

    // 2.0 以下，面板說多少就給多少 —— 管線還沒滿。
    expect(at2).toBeGreaterThanOrEqual(1.9);
    expect(at2).toBeLessThanOrEqual(2.1);

    // 到了 2.5 就開始還不出來了（實測 2.3）。
    expect(atCap).toBeLessThan(cap);

    // THE POINT: 面板從 2.5 拉到 4.0（+60%），實際多不到 10%。
    // 這是「放寬夾限玩家拿不到」的證據，也是 #267 沒有動 STAT_CLAMPS 的理由。
    expect(at4).toBeLessThan(atCap * 1.1);
  });

  it("飽和點釘在 2.4 次/秒 —— 這是 0.25s 前搖 +「一次一刀」+ hitstop 的合成上限", () => {
    cover("balance-267-cadence-saturation");
    // 前搖 8 tick、結算佔掉的那一 tick、命中後 hitstop 暫停前搖 —— 三者相加就是
    // 為什麼再高的攻速也換不到更多刀。若有人改了 BasicAttackSystem 的節奏，
    // 這個數字會動，於是這條會紅：那是好事，代表 #267 的槓桿真的被拉了。
    // 這個數字是「前搖 0.25 s」條件下的飽和點 —— 先把條件釘住，否則量到的是別的東西。
    expect(THORNE.attackDamagePoint).toBe(0.25);
    // 而 0.25 也正是 82 位近戰裡 52 位（沒有自己寫 attackDamagePoint 的那些）
    // 會拿到的預設值，所以這個飽和點是整個近戰主流群的飽和點，不是單一個案。
    expect(DEFAULT_DAMAGE_POINT_MELEE).toBe(0.25);

    const saturated = realAttacksPerSec(8.0); // 遠遠超過任何可能的夾限
    expect(saturated).toBeGreaterThanOrEqual(2.3);
    expect(saturated).toBeLessThanOrEqual(2.6);
  });

  it("夾限對沒買攻速的近戰是完全的 no-op —— 它從來沒咬到過他們", () => {
    cover("balance-267-clamp-not-binding");
    const w = new SimWorld(OPEN_ARENA, 12);
    const melee = champ(w, "thorne", ZONE0.center.x - 4, ZONE0.center.z);
    const ranged = champ(w, "sela", ZONE0.center.x + 4, ZONE0.center.z);
    expect(THORNE.attackType).toBe("melee");
    expect(SELA.attackType).toBe("ranged");
    const hi = STAT_CLAMPS[Stat.AttackSpeed]![1];
    // 裸裝近戰離 2.5 還有一大段（實際內容裡近戰 lv1 中位數 0.70、lv18 1.77）。
    expect(w.stats.get(melee)!.final[Stat.AttackSpeed]).toBeLessThan(hi * 0.6);
    expect(w.stats.get(ranged)!.final[Stat.AttackSpeed]).toBeLessThan(hi * 0.6);

    // 下限那一側仍然有效（減速堆到爆也不會低於 0.2）。寫死 0.2、不引用常數：
    // 引用常數的話，把下限改掉的變異會讓期望值跟著一起動而永遠通過。
    expect(STAT_CLAMPS[Stat.AttackSpeed]![0]).toBe(0.2);
    attachSource(w, melee, {
      id: "test.as-crush",
      kind: "item",
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.PercentAdd, value: -5 }],
    });
    recomputeStats(w, melee);
    expect(w.stats.get(melee)!.final[Stat.AttackSpeed]).toBeCloseTo(0.2, 9);
  });
});

// ------------------------------------------------------- #270 火圈真實傷害
describe("#270 競技場燃燒是真實傷害 (balance-270-true-burn)", () => {
  it("護甲/魔抗堆到天上去，燒掉的血一模一樣，事件也標 true", () => {
    cover("balance-270-true-burn");
    const w = new SimWorld(OPEN_ARENA, 21);
    w.combatActive = true;
    // 兩個同樣的英雄，同樣站在邊緣（圈外），只有護甲不同。
    const r = ZONE0.boundaryRadius - 1;
    const naked = champ(w, "thorne", ZONE0.center.x + r, ZONE0.center.z);
    const tank = champ(w, "thorne", ZONE0.center.x - r, ZONE0.center.z, 2);
    attachSource(w, tank, {
      id: "test.plate",
      kind: "item",
      modifiers: [
        { stat: Stat.Armor, op: ModOp.Flat, value: 500 },
        { stat: Stat.MagicResist, op: ModOp.Flat, value: 500 },
      ],
    });
    recomputeStats(w, tank);
    expect(w.stats.get(tank)!.final[Stat.Armor]).toBeGreaterThan(
      w.stats.get(naked)!.final[Stat.Armor] + 100,
    );
    // 同樣的血池（護甲不影響 maxHp），所以「%最大生命」的燒傷應該完全相同。
    expect(w.health.get(tank)!.maxHp).toBeCloseTo(w.health.get(naked)!.maxHp, 9);

    // 立刻點火、立刻縮圈：兩人都在圈外。
    beginCombatFireRing(
      w,
      fireRingRulesFromConfig(
        {
          startSec: 0,
          shrinkSec: 20,
          minRadius: 0.5,
          burnPctPerSecStart: 0.04,
          burnPctPerSecEnd: 0.2,
          maxPctPerSec: 1,
        },
        DT,
      ),
    );

    let nakedBurn = 0;
    let tankBurn = 0;
    let sawTrue = false;
    let events = 0;
    for (let t = 0; t < 120; t++) {
      step(w);
      for (const ev of w.events) {
        if (ev.type !== "fireRingDamage") continue;
        events++;
        const amount = ev.data.amount as number;
        if (ev.data.id === naked) nakedBurn += amount;
        if (ev.data.id === tank) tankBurn += amount;
        if (ev.data.dmgType === "true") sawTrue = true;
        // 每一發都必須標 true，不能只有第一發。
        expect(ev.data.dmgType).toBe("true");
      }
    }
    expect(events).toBeGreaterThan(0); // 守衛不是空的：真的燒了
    expect(sawTrue).toBe(true);
    expect(nakedBurn).toBeGreaterThan(0);
    // 這就是「真實傷害」的定義：護甲一點都沒有省到。
    expect(tankBurn).toBeCloseTo(nakedBurn, 9);
  });

  it("燃燒不吃 combat-env 的 damageDealt —— 它是回合節奏，不是戰鬥數值", () => {
    cover("balance-270-env-independent");
    const burnUnder = (damageDealt: number): number => {
      const w = new SimWorld(OPEN_ARENA, 22);
      w.combatActive = true;
      w.combatEnv = normalizeCombatEnv({ damageDealt });
      const id = champ(w, "thorne", ZONE0.center.x + (ZONE0.boundaryRadius - 1), ZONE0.center.z);
      beginCombatFireRing(
        w,
        fireRingRulesFromConfig(
          {
            startSec: 0,
            shrinkSec: 20,
            minRadius: 0.5,
            burnPctPerSecStart: 0.04,
            burnPctPerSecEnd: 0.2,
            maxPctPerSec: 1,
          },
          DT,
        ),
      );
      let sum = 0;
      for (let t = 0; t < 60; t++) {
        step(w);
        for (const ev of w.events) {
          if (ev.type === "fireRingDamage" && ev.data.id === id) sum += ev.data.amount as number;
        }
      }
      return sum;
    };
    const low = burnUnder(0.25);
    const high = burnUnder(4);
    expect(low).toBeGreaterThan(0);
    expect(high).toBeCloseTo(low, 9);
  });
});
