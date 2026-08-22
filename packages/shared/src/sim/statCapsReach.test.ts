/**
 * 攻速解鎖上限 —— 「玩家真的拿得到嗎」的那一段 (GH#286 稽核).
 *
 * `sim/statCaps.test.ts` 證明的是 **`sc.final[as]` 這個數字變大了**。那是一個
 * 屬性,不是一個行為(失敗形狀 ⑦)。這一支問的是玩家真的感覺得到的三件事:
 *
 *   ① 解鎖之後,英雄在同一段時間裡**真的揮出更多刀**(BasicAttackSystem 的
 *      `basicAttack` 事件數),而不只是面板上的數字變大。#267 的教訓正是
 *      「面板 3 / 4 / 6 / 10 / 30 的實際輸出全部是 2.70」—— 只看 `final[as]`
 *      的守衛在那個世界裡是全綠的。
 *   ② 一支**真的內容技能**(`applyBuff` + `capRaise`,走 `castAbility` →
 *      `effectRunner` → `attachSource`)能解鎖它。原本的守衛全部直接呼叫
 *      `attachSource`,跳過了出貨路徑(失敗形狀 ⑤)。
 *   ③ 一件**道具**能解鎖它 —— owner 點名了「技能、道具...等效果」。道具走的是
 *      `zItemStatModifier` 的健全性帶,而那條帶子對攻速是 4.0,所以一件
 *      `capRaise as 10` 的道具原本會被內容驗證擋在門外。
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, THORNE } from "./content/skeleton";
import { Items, registerChampion } from "./content/registry";
import { spawnChampion } from "./spawnChampion";
import { castAbility } from "./abilities/abilitySystem";
import { buyItem } from "./economy/shop";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId, type SeatId } from "../ids";
import { Stat } from "./stats/statTypes";
import { ModOp } from "./stats/modifiers";
import { attachSource, recomputeStats } from "./stats/statPipeline";
import { zItemDoc } from "../content/schema/item";
import type { IntentFrame } from "./intents";
import type { ChampionDef } from "./content/defs";

const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;
/** 3 秒 @30Hz —— 上限 4 與上限 10 在這段窗口裡的刀數差得非常遠。 */
const WINDOW_TICKS = 90;

beforeAll(() => registerSkeletonContent());
afterEach(() => {
  // 把 thorne 還原成骨架內容。`registerSkeletonContent` 只跑一次(內建 guard),
  // 所以這裡不能 clear 整個 registry —— 那會讓後面的測試找不到英雄。
  registerChampion(THORNE, { overrideAbilities: true });
});

interface Duel {
  world: SimWorld;
  attacker: EntityId;
  dummy: EntityId;
}

/**
 * 一名近戰英雄 + 一個永遠打不死、貼在他面前的木樁。攻擊者的攻速被一個巨大的
 * Flat 灌到爆表,所以**唯一**決定他揮幾刀的東西就是上限。
 */
function duel(capsRaisedTo: number | null): Duel {
  const world = new SimWorld(SKELETON_ARENA, 7);
  const attacker = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: Z0.center.z + 12 },
    zone: 0,
  });
  const dummy = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: Z0.center.x + 1.0, z: Z0.center.z + 12 },
    zone: 0,
  });
  const mods = [{ stat: Stat.AttackSpeed, op: ModOp.Flat, value: 999 }];
  if (capsRaisedTo !== null) {
    mods.push({ stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: capsRaisedTo });
  }
  attachSource(world, attacker, { id: "t:as", kind: "buff", modifiers: mods });
  recomputeStats(world, attacker);
  return { world, attacker, dummy };
}

/**
 * 攻速長凳專用的 chip 傷害 —— `combat/damage.ts` 的 `HITSTOP_MIN_IMPACT` 是 12,
 * 低於它的一擊兩邊都不凍。⛔ 不是出貨值,只需要小於那道 chip 門檻。
 */
const CHIP_AD = 1;

/** 揮出去、而且**真的結算**的刀數(`basicAttack` 只在傷害點發出)。 */
function swingsIn(d: Duel, ticks: number): number {
  let swings = 0;
  const dummyPos = { ...d.world.transform.get(d.dummy)!.pos };
  for (let i = 0; i < ticks; i++) {
    // 木樁永遠站著、永遠滿血:死掉或被推開都會提早結束測量。
    const hp = d.world.health.get(d.dummy)!;
    hp.hp = hp.maxHp;
    d.world.transform.get(d.dummy)!.pos = { ...dummyPos };
    d.world.nav.get(d.attacker)!.attackTarget = d.dummy;
    // ⭐ 檔頭寫「**唯一**決定他揮幾刀的東西就是上限」—— 要讓那句話成立,傷害必須是
    //    chip。hitstop 的長度是**傷害的函式**,而攻擊者自己也被凍
    //    (`BasicAttackSystem`:`if (hitstop > 0) continue`)。
    //    2026-08-23 owner 把初始 AD +32 之後,解鎖側從 30 刀掉到 18 —— 上限一格都沒動,
    //    紅的訊息卻說「上限沒有變成更多刀」。⛔ 修法不是調 1.75 那個門檻,是把
    //    「傷害多大」這個變數從一張量節奏的長凳上拿掉。
    d.world.stats.get(d.attacker)!.final[Stat.AttackDamage] = CHIP_AD;
    d.world.stats.get(d.dummy)!.final[Stat.AttackDamage] = CHIP_AD;
    d.world.step(NO_INTENTS);
    for (const e of d.world.events) {
      if (e.type === "basicAttack" && e.data.source === d.attacker) swings++;
    }
  }
  return swings;
}

describe("解鎖上限真的變成更多刀 (statcaps-cadence)", () => {
  it("CapRaise 10 的英雄在同一段時間裡揮出的刀數,遠多於只有 4.0 的自己", () => {
    cover("statcaps-cadence");
    const capped = duel(null);
    const unlocked = duel(10);

    // 先確認兩邊的**面板數字**確實不同 —— 否則下面比的是同一種實作。
    expect(capped.world.stats.get(capped.attacker)!.final[Stat.AttackSpeed]).toBe(4);
    expect(unlocked.world.stats.get(unlocked.attacker)!.final[Stat.AttackSpeed]).toBe(10);

    const cappedSwings = swingsIn(capped, WINDOW_TICKS);
    const unlockedSwings = swingsIn(unlocked, WINDOW_TICKS);

    // 兩邊都真的在打(木樁測到手了)。
    expect(cappedSwings).toBeGreaterThan(0);

    // ⚠️ 這裡不是「> 一點點」。#267 那個壞掉的世界裡,面板 4 和面板 10 的實際
    // 輸出都是 2.70 次/秒 —— 也就是 `unlockedSwings === cappedSwings`。所以斷言
    // 必須要求一個**只有真的變快才可能達到的比例**:上限 10 / 上限 4 = 2.5 倍,
    // 打七折當門檻仍然遠在「兩者相同」之上。
    expect(unlockedSwings).toBeGreaterThan(cappedSwings * 1.75);
    // 而且不可以超過 cadence 允許的物理上限 —— 一個「乾脆不看冷卻」的實作會爆表。
    expect(unlockedSwings).toBeLessThanOrEqual(WINDOW_TICKS / 3 + 1);
  });

  it("上限被夾在 4.0 時,刀數也被夾住 —— 面板 4 就是 4,不是偷偷更快", () => {
    cover("statcaps-cadence-floor");
    const capped = duel(null);
    const swings = swingsIn(capped, WINDOW_TICKS);
    // baseAttackTime 1.0 / as 4.0 → 每 8 tick 一刀(Math.round(7.5)) → 3 秒 ≤ 12 刀。
    expect(swings).toBeLessThanOrEqual(12);
    expect(swings).toBeGreaterThanOrEqual(8);
  });
});

describe("內容技能真的解得開 (statcaps-ability-path)", () => {
  /** THORNE 的複本,W 換成一支「解鎖攻速上限」的自我 buff。 */
  function unlockerChampion(raiseTo: number): ChampionDef {
    const def = { ...THORNE, abilities: { ...THORNE.abilities } } as ChampionDef;
    def.abilities.W = {
      ...THORNE.abilities.W!,
      castType: "self",
      cooldown: [1, 1, 1, 1, 1],
      manaCost: [0, 0, 0, 0, 0],
      range: 0,
      effects: [
        {
          kind: "applyBuff",
          modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: raiseTo }],
          duration: 6,
        },
      ],
    };
    return def;
  }

  it("castAbility → effectRunner → attachSource 這條出貨路徑把上限抬到 8.0", () => {
    cover("statcaps-ability-path");
    // `registerChampion(..., overrideAbilities)` —— 只換 `Champions` 不夠:
    // 骨架內容已經把 thorne.w 的原始版本註冊進 `Abilities`,而施法讀的是那一份。
    registerChampion(unlockerChampion(8), { overrideAbilities: true });
    const world = new SimWorld(SKELETON_ARENA, 7);
    const id = spawnChampion(world, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: Z0.center.x, z: Z0.center.z + 12 },
      zone: 0,
    });
    attachSource(world, id, {
      id: "t:as",
      kind: "buff",
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.Flat, value: 999 }],
    });
    world.abilities.get(id)!.slots.W.rank = 1;
    recomputeStats(world, id);
    // 施放前:一般上限。
    expect(world.stats.get(id)!.final[Stat.AttackSpeed]).toBe(4);

    expect(castAbility(world, id, "W", { type: "self" })).toBe("ok");
    world.step(NO_INTENTS);
    recomputeStats(world, id);

    // 施放後:技能寫的 8.0 —— 不是 4(技能沒作用)也不是 10(直接開到硬上限)。
    expect(world.stats.get(id)!.final[Stat.AttackSpeed]).toBe(8);
  });

  it("buff 到期後上限自己回來 —— 絕對 tick,不是遞減計數器", () => {
    cover("statcaps-ability-expiry");
    // `registerChampion(..., overrideAbilities)` —— 只換 `Champions` 不夠:
    // 骨架內容已經把 thorne.w 的原始版本註冊進 `Abilities`,而施法讀的是那一份。
    registerChampion(unlockerChampion(8), { overrideAbilities: true });
    const world = new SimWorld(SKELETON_ARENA, 7);
    const id = spawnChampion(world, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: Z0.center.x, z: Z0.center.z + 12 },
      zone: 0,
    });
    attachSource(world, id, {
      id: "t:as",
      kind: "buff",
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.Flat, value: 999 }],
    });
    world.abilities.get(id)!.slots.W.rank = 1;
    castAbility(world, id, "W", { type: "self" });
    world.step(NO_INTENTS);
    recomputeStats(world, id);
    expect(world.stats.get(id)!.final[Stat.AttackSpeed]).toBe(8);

    for (let i = 0; i < 6 * 30 + 2; i++) world.step(NO_INTENTS);
    recomputeStats(world, id);
    expect(world.stats.get(id)!.final[Stat.AttackSpeed]).toBe(4);
  });
});

describe("道具真的解得開 (statcaps-item-path)", () => {
  const CAP_ITEM = {
    id: "t-unlock-blade",
    schema: "item@1",
    name: "解限之刃",
    cost: 1000,
    tier: 3,
    craftRole: "final",
    modifiers: [
      { stat: "as", op: "capRaise", value: 10 },
      // 帶子內的一般攻速加成。單靠它 base 0.7 → 4.7,在沒有解鎖的世界裡會被
      // 夾回 4.0 —— 所以「> 4.0」這一條真的分得出兩種實作。
      { stat: "as", op: "flat", value: 4 },
    ],
    tags: ["as"],
  };

  it("`item@1` 允許一件把攻速上限解鎖到 10 的道具通過內容驗證", () => {
    cover("statcaps-item-schema");
    // owner 點名了「技能、**道具**...等效果」。健全性帶對 as 是 4.0 —— 那是
    // 「一件裝備能給多少攻速」的帶子,對「這件裝備把天花板抬到哪」沒有意義,
    // 而它擋下來的正是這個功能唯一的道具寫法。
    const parsed = zItemDoc.safeParse(CAP_ITEM);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("同一件道具買下去之後,英雄的攻速真的越過 4.0", () => {
    cover("statcaps-item-behaviour");
    const parsed = zItemDoc.parse(CAP_ITEM);
    Items.register(parsed.id as ItemId, {
      id: parsed.id as ItemId,
      name: parsed.name,
      cost: parsed.cost,
      tier: parsed.tier,
      craftRole: parsed.craftRole,
      modifiers: parsed.modifiers,
      tags: parsed.tags,
    } as never);

    const world = new SimWorld(SKELETON_ARENA, 7);
    world.weaponShelfOpen = true;
    const id = spawnChampion(world, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: Z0.center.x, z: Z0.center.z + 12 },
      zone: 0,
    });
    world.champion.get(id)!.gold = 5000;
    recomputeStats(world, id);
    const before = world.stats.get(id)!.final[Stat.AttackSpeed];

    expect(buyItem(world, id, parsed.id as ItemId)).toBe("ok");
    recomputeStats(world, id);
    const after = world.stats.get(id)!.final[Stat.AttackSpeed];

    // 沒有 capRaise 的世界裡 `after` 會**剛好停在 4.0**(flat +4 把它推到 4.7,
    // 一般上限砍回 4.0)。這件道具的整個賣點就是那 0.7。
    expect(after).toBeGreaterThan(4.0);
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThanOrEqual(10.0);
  });
});
