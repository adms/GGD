/**
 * 獸矛，一路走到底 —— 「攻擊觸發」這張卡真的能表達它自己的範本了。
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM `sim/content/condition.test.ts`.
 * That file proves the MECHANISM (a condition gates a hook). This one proves the
 * CHAIN: the shipped `content/ability-templates/tpl-on-attack.json` on disk →
 * `expand()` → a real `HookDef` → `fireHooks` inside a real `SimWorld.step()` →
 * hp actually moving on a real body. Every link is the shipping one; nothing is
 * hand-rolled.
 *
 * That distinction is the whole point. Before this lane, 蒼月潮 07-002
 * 獸矛持有者 — 「在攻擊非英雄部隊時，當該部隊血量低於35%將直接死亡，並有1%機率
 * 造成英雄直接死亡」 — could only be authored on this card as 「12.5% 機率造成
 * 100 傷害」, because `chance` was the entire vocabulary. owner's verdict on that
 * approximation was 看不懂也不合理. A test that only checked 「the template has a
 * condition slot」 would be failure mode ⑦ all over again; what has to be true is
 * that a mob at 34 % dies to it and a champion at 34 % does not.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { zTemplateDoc, type TemplateDoc } from "../schema/template";
import { defaultParamsFor } from "./paramsSchema";
import { expand } from "./expand";
import { SimWorld } from "../../sim/SimWorld";
import { SKELETON_ARENA } from "../../sim/world/ArenaDef";
import { registerSkeletonContent, SELA, THORNE } from "../../sim/content/skeleton";
import { spawnChampion } from "../../sim/spawnChampion";
import { attachSource } from "../../sim/stats/statPipeline";
import { fireHooks } from "../../sim/effects/hooks";
import { MOB_MODEL_KEY, spawnMob, type MobRules } from "../../sim/mobs";
import { describeCondition } from "../../sim/content/condition";
import { asSeatId, asTeamId, type EntityId } from "../../ids";

const TEMPLATE = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../content/ability-templates/tpl-on-attack.json",
);

const loadTemplate = (): TemplateDoc =>
  zTemplateDoc.parse(JSON.parse(readFileSync(TEMPLATE, "utf8")));

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;

const MOB_RULES: MobRules = {
  fromRound: 1,
  firstWaveTicks: 1,
  waveIntervalTicks: 999,
  mobsPerWaveCap: 1,
  maxAlivePerZone: 9,
  level: 1,
  maxHp: 40_000, // 大於 9999，否則「有沒有加成」會被血量夾限吃掉
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

/** 獸矛的真值：處決傷害 9999，只在原作講的那兩種情況下發生。 */
const EXECUTE = 9999;

/**
 * 原作那張卡，用範本的 param 槽填出來 —— 條件用**範本自己的預設值**
 * (`defaultParamsFor`)，也就是說：設計師在鑄技工坊打開這張卡看到的那一組條件，
 * 就是下面被實際跑起來的那一組。
 */
function beastSpearParams(t: TemplateDoc): Record<string, unknown> {
  return {
    ...defaultParamsFor(t),
    bonusDamage: { flat: EXECUTE, ratios: [] },
    damageType: "true",
  };
}

interface Stage {
  world: SimWorld;
  hero: EntityId;
  foe: EntityId;
  mob: EntityId;
}

function stage(seed = 11): Stage {
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
  // 英雄也要撐得住 9999，否則「英雄那 1% 到底有沒有打中」讀不出來
  const fh = world.health.get(foe)!;
  fh.maxHp = 40_000;
  fh.hp = 40_000;
  world.step(new Map());
  return { world, hero, foe, mob };
}

const hp = (w: SimWorld, id: EntityId): number => w.health.get(id)!.hp;

/** 把範本展開成真的 hook，掛上英雄，揮一刀，回傳目標實際掉的血。 */
function swingWithTemplate(
  s: Stage,
  params: Record<string, unknown>,
  target: EntityId,
  t: TemplateDoc,
): number {
  const ex = expand(t, params);
  const hook = ex.passive?.ranks[0]?.hooks?.[0];
  expect(hook, "on-attack 展開後必須有一條 hook").toBeTruthy();
  attachSource(s.world, s.hero, { id: "beast-spear", kind: "item", hooks: [hook!] });
  const before = hp(s.world, target);
  fireHooks(s.world, s.hero, "onBasicAttack", target);
  s.world.step(new Map());
  return before - hp(s.world, target);
}

/** 掉了半個處決以上 = 加成真的落下去了（另外半個是同一 tick 的自然回血）。 */
const executed = (lost: number): boolean => lost > EXECUTE / 2;

describe("獸矛 —— tpl-on-attack 終於說得出自己的範本", () => {
  it("★ 打非英雄、血量 30% → 處決真的落下去了", () => {
    cover("tpl-on-attack-execute-mob");
    const t = loadTemplate();
    const s = stage();
    const h = s.world.health.get(s.mob)!;
    h.hp = h.maxHp * 0.3;
    expect(executed(swingWithTemplate(s, beastSpearParams(t), s.mob, t))).toBe(true);
  });

  it("★ 打非英雄、血量 60% → 一點都沒有（門檻真的是門檻）", () => {
    const t = loadTemplate();
    const s = stage();
    const h = s.world.health.get(s.mob)!;
    h.hp = h.maxHp * 0.6;
    expect(executed(swingWithTemplate(s, beastSpearParams(t), s.mob, t))).toBe(false);
  });

  it("★ 打英雄、血量 30% → 不會直接處決（1% 那條是另一個分支，400 刀裡幾乎不會中）", () => {
    const t = loadTemplate();
    // 這裡刻意跑 30 刀而不是 1 刀：如果「非英雄」那個閘沒生效，30 刀會刀刀處決；
    // 而 1% 的分支在 30 刀裡命中的機率只有 26%，所以「30 刀裡處決次數 <= 3」
    // 同時排除了「閘沒生效」和「1% 被寫成 100%」兩種壞法。
    let executes = 0;
    for (let i = 0; i < 30; i++) {
      const s = stage(500 + i);
      const h = s.world.health.get(s.foe)!;
      h.hp = h.maxHp * 0.3;
      if (executed(swingWithTemplate(s, beastSpearParams(t), s.foe, t))) executes++;
    }
    expect(executes).toBeLessThanOrEqual(3);
  });

  it("★ 1% 的英雄處決分支真的存在 —— 跑夠多刀就會中", () => {
    const t = loadTemplate();
    let executes = 0;
    for (let i = 0; i < 600; i++) {
      const s = stage(9000 + i);
      const h = s.world.health.get(s.foe)!;
      h.hp = h.maxHp * 0.9; // 血量門檻那一支對英雄本來就不適用
      if (executed(swingWithTemplate(s, beastSpearParams(t), s.foe, t))) executes++;
    }
    // 600 刀、p=0.01 → 期望 6，3σ ≈ ±7.3。下界訂 1 是刻意的：這一條要證明的是
    // 「分支存在」，不是「機率精準」（精準度由 condition.test.ts 的 400 次
    // 3σ 那條負責）。上界 20 擋掉「1% 被當成 10%」這種壞法。
    expect(executes).toBeGreaterThanOrEqual(1);
    expect(executes).toBeLessThanOrEqual(20);
  });

  it("★ 範本的預設值仍然是安全的 —— 套卡的人不會一存檔就拿到必定 +9999", () => {
    cover("tpl-on-attack-safe-default");
    const t = loadTemplate();
    const params = defaultParamsFor(t);
    // 出貨預設的傷害是 100 級距，不是處決級距。
    const ex = expand(t, params);
    const hook = ex.passive?.ranks[0]?.hooks?.[0];
    const flat = hook?.effects[0]?.kind === "damage" ? hook.effects[0].amount.perRank?.[0] : undefined;
    expect(flat).toBeLessThanOrEqual(200);
    // 而且它是**有閘**的：滿血的英雄挨這一刀什麼事都沒有。
    const s = stage();
    expect(swingWithTemplate(s, params, s.foe, t)).toBeLessThan(50);
  });

  it("★ 沒填 condition 的展開，跟條件系統上線前逐位元相同（optional 就是 optional）", () => {
    cover("tpl-on-attack-condition-optional");
    const t = loadTemplate();
    const withDefault = expand(t, defaultParamsFor(t));
    const withoutCondition = expand(t, { ...defaultParamsFor(t), condition: undefined });
    expect(withDefault.passive?.ranks[0]?.hooks?.[0]?.condition).toBeTruthy();
    expect(withoutCondition.passive?.ranks[0]?.hooks?.[0]?.condition).toBeUndefined();
  });

  it("★ condition 槽真的會改變展開結果（它不是一個被忽略的表單欄位）", () => {
    // paramsSchema.test.ts 的「anti-silence」探針只掃 number 槽，掃不到這一個。
    // 沒有這一條，把 expand.ts 裡的 `condition:` 那一行刪掉，全套測試會全綠。
    cover("tpl-on-attack-condition-not-inert");
    const t = loadTemplate();
    const base = JSON.stringify(expand(t, defaultParamsFor(t)));
    const moved = JSON.stringify(
      expand(t, { ...defaultParamsFor(t), condition: { kind: "chance", p: 0.5 } }),
    );
    expect(moved).not.toBe(base);
  });

  it("★ 卡片上印出來的那句人話，是從範本預設的條件物件推導的", () => {
    cover("tpl-on-attack-describe");
    const t = loadTemplate();
    const cond = defaultParamsFor(t).condition as Parameters<typeof describeCondition>[0];
    expect(describeCondition(cond)).toBe(
      "（目標不是英雄 且 目標生命 < 35%） 或 （目標是英雄 且 1% 機率）",
    );
  });
});
