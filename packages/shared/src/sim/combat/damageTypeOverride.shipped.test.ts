/**
 * 無視防禦 / 真實傷害 —— THE SHIPPED DOCS, not a fixture.
 *
 * `damageTypeOverride.test.ts` proves the mechanism on hand-built sources. That
 * is exactly CLAUDE.md 失敗形態 ⑤ if it is the ONLY guard: a mechanism test that
 * writes its own `ModifierSource` passes just as happily on a tree where no item
 * carries the field, i.e. on a world where the three weapons still do nothing.
 *
 * So this file:
 *   1. reads `content/items/*.json` off disk;
 *   2. pins WHICH items carry the field and with WHICH scope (a ratchet — a
 *      fourth item, or a `"basic"` typo'd into `"all"`, goes red);
 *   3. EQUIPS the real doc through the real `attachItemSource` and fires a real
 *      packet through `combatResolveSystem`, so the thing under test is the
 *      thing the player gets;
 *   4. records the 惡夢魔王碎片 × 死之王套裝 AP number rather than capping it.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import type { ItemDoc } from "../../content/schema/item";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { zeroStats, Stat } from "../stats/statTypes";
import { ModOp } from "../stats/modifiers";
import { attachSource, recomputeStats } from "../stats/statPipeline";
import { itemModifierSource } from "../economy/itemSource";
import { combatResolveSystem } from "./damage";
import type { ItemDef } from "../content/defs";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";
import * as V from "../math/vec2";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");

/**
 * THE ROSTER. Every item in the shipped tree that converts damage type, and the
 * exact 效能 line each one is paying for.
 *
 * ⚠️ THIS IS A RATCHET, in BOTH directions. A third item quietly gaining the
 * field goes red (nobody audited its scope); one of these two losing it goes
 * red (the owner's prose becomes a lie again). The scope is spelled out because
 * a `"basic"` → `"all"` slip is invisible in review and would drag item procs
 * (`hook:`), mob and guardian packets into the conversion as well.
 *
 * ⚠️⚠️ 2026-08-01 — that sentence used to say the slip 「turns every DoT tick …
 * into true damage」, which implied `"ability"` does NOT cover a DoT. It does:
 * an ability's burn ticks with `ability:<id>` (`effects/dot.ts` → `dotTick.ts`),
 * and owner ruled that a spell's lingering burn IS 技能傷害. The behavioural
 * proof lives in `damageTypeOverride.test.ts`'s 「技能留下的延燒」 block.
 *
 * ⚠️⚠️ 2026-08-12 — 霸王破甲槍 `godie-i00f` LEFT this roster, 三件 → 兩件, and
 * that is the ratchet doing its job rather than being edited around: owner ruled
 * 「霸王破甲槍⋯改成百分百穿透」, so the doc now carries `penetration
 * {scope:"basic", armorPct:1}` and NO `damageTypeOverride`. 它的出貨守衛搬到
 * `combat/penetration.test.ts`（同型的雙向 ratchet + 真的裝上去打一發）。
 * ⛔ The two mechanisms are NOT synonyms — see `combat/penetration.ts` 檔頭.
 */
const EXPECTED: Record<
  string,
  { name: string; scope: string; becomes: string; impactType?: string; line: string }
> = {
  "godie-i01d": {
    name: "死之王的長槍",
    scope: "basic",
    becomes: "true",
    line: "[無視] 普通攻擊無視防禦給予傷害",
  },
  "godie-i067": {
    name: "惡夢魔王碎片",
    scope: "ability",
    becomes: "true",
    // ⚠️ PINNED, and it is the only one of the three that carries the field:
    // it is the only weapon that converts MAGIC, so it is the only one where
    // 「does the conversion also hand out a knockdown」 has an observable answer.
    // 「original」 = it does not. Flipping this doc to "converted" (or deleting
    // the key and defaulting it the other way) is a CC buff to every spell the
    // holder casts, and owner's 效能 line says nothing about crowd control.
    impactType: "original",
    line: "[真實傷害] 所有裝備者技能傷害都轉為真實傷害",
  },
};

let items: ItemDoc[];

beforeAll(async () => {
  registerSkeletonContent();
  items = (await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store.all<ItemDoc>(
    "items",
  );
});

const Z0 = SKELETON_ARENA.zones[0]!;
const Y = 14;

/** A dummy with a real StatsComp — the two things the mechanism reads. */
function dummy(
  world: SimWorld,
  seat: number,
  team: number,
  x: number,
  opts: { armor?: number; mr?: number } = {},
): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x, z: Y },
    vel: V.v2(),
    facing: { x: 1, z: 0 },
    radius: 0.6,
    zone: 0,
  });
  world.health.set(id, { hp: 100_000, maxHp: 100_000, mana: 0, maxMana: 0, alive: true, shields: [] });
  world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
  world.status.set(id, { effects: [] });
  const final = zeroStats();
  final[Stat.Armor] = opts.armor ?? 0;
  final[Stat.MagicResist] = opts.mr ?? 0;
  world.stats.set(id, { championId: "dummy" as ChampionId, final, dirty: false, sources: [] });
  return id;
}

/** HP actually lost by `target` from ONE packet. */
function hpLost(
  world: SimWorld,
  source: EntityId,
  target: EntityId,
  amount: number,
  type: "physical" | "magic" | "true",
  origin: string,
): number {
  const before = world.health.get(target)!.hp;
  world.damageQueue.push({ source, target, amount, type, crit: false, origin });
  combatResolveSystem(world);
  return before - world.health.get(target)!.hp;
}

const doc = (id: string): ItemDoc => {
  const d = items.find((i) => i.id === id);
  if (!d) throw new Error(`content/items/${id}.json is missing`);
  return d;
};

describe("the shipped 無視/真實傷害 roster", () => {
  it("is exactly these two items, with exactly these scopes", () => {
    const found = Object.fromEntries(
      items
        .filter((d) => (d as { damageTypeOverride?: unknown }).damageTypeOverride !== undefined)
        .map((d) => [
          d.id as string,
          (d as { damageTypeOverride?: { scope: string; becomes: string } }).damageTypeOverride!,
        ]),
    );
    expect(Object.keys(found).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const [id, want] of Object.entries(EXPECTED)) {
      expect(found[id], `${want.name} (${id})`).toMatchObject({
        scope: want.scope,
        becomes: want.becomes,
      });
      // `impactType` is only pinned where the doc declares it — omitting it is
      // legal (ABSENT = "original") and is what the two `"basic"` weapons do.
      // ⚠️ MUTATION: change `"impactType": "original"` to `"converted"` in
      // `content/items/godie-i067.json` — this line goes red, and so does the
      // 「the shipped shard does not hand its spells a knockdown」 test below.
      if (want.impactType !== undefined) {
        expect(
          (found[id] as { impactType?: string }).impactType,
          `${want.name} (${id}) impactType`,
        ).toBe(want.impactType);
      }
    }
  });

  it("each one's owner prose still contains the 效能 line the field is paying for", () => {
    // 第三守則: the field is justified by the description. If owner rewrites the
    // line, this goes red and somebody has to re-read the mechanism against the
    // new words rather than assume the old mapping survived.
    for (const [id, want] of Object.entries(EXPECTED)) {
      expect(doc(id).description ?? "", `${want.name} (${id})`).toContain(want.line);
    }
  });
});

describe("the REAL doc, equipped through the REAL attach path", () => {
  it("死之王的長槍 makes an equipped champion's basic attack ignore armour", () => {
    const world = new SimWorld(SKELETON_ARENA, 42);
    const a = dummy(world, 0, 0, Z0.center.x);
    const b = dummy(world, 1, 1, Z0.center.x + 3, { armor: 100 });

    // Control FIRST, on the same world: 100 armor halves it.
    expect(hpLost(world, a, b, 100, "physical", "basic")).toBeCloseTo(50, 9);

    // …now equip the shipped doc through the ONE builder the shop/draft/preview
    // all use. Nothing here is hand-written except the slot number.
    const def = doc("godie-i01d") as unknown as ItemDef;
    attachSource(world, a, itemModifierSource(world, a, "godie-i01d" as ItemId, 0, def));
    expect(hpLost(world, a, b, 100, "physical", "basic")).toBeCloseTo(100, 9);
    // ⚠️ MUTATION: delete `damageTypeOverride: def.damageTypeOverride` from
    // `economy/itemSource.ts` — the fixture suite stays fully green and this
    // single line goes 100 → 50. That is the whole point of this file.
  });

  it("惡夢魔王碎片 converts ABILITY damage and leaves the holder's autos physical", () => {
    const world = new SimWorld(SKELETON_ARENA, 42);
    const a = dummy(world, 0, 0, Z0.center.x);
    const b = dummy(world, 1, 1, Z0.center.x + 3, { armor: 100, mr: 100 });
    const def = doc("godie-i067") as unknown as ItemDef;
    attachSource(world, a, itemModifierSource(world, a, "godie-i067" as ItemId, 0, def));

    expect(hpLost(world, a, b, 100, "magic", "ability:x.q")).toBeCloseTo(100, 9);
    // 「技能傷害」 — the autos are NOT part of the promise, and must not come free.
    expect(hpLost(world, a, b, 100, "physical", "basic")).toBeCloseTo(50, 9);
  });

  it("惡夢魔王碎片 does NOT hand the holder's spells a knockdown they never had", () => {
    /*
     * THE SIDE EFFECT NOBODY CHOSE. `applyImpact` gates knockdown on
     * `type !== "magic"`; the shard re-stamps magic → true before that line, so
     * before `impactType` existed, equipping this item silently added a hard CC
     * to every spell its holder cast. owner's 效能 line promises damage-type
     * conversion and nothing else.
     *
     * This is the SHIPPED-DOC half of the guard (失敗形態 ⑤): the fixture suite
     * would stay green on a tree where `content/items/godie-i067.json` said
     * `impactType: "converted"`.
     */
    const world = new SimWorld(SKELETON_ARENA, 42);
    // Small `maxHp` + adjacent bodies, or the %-HP knockback rule (GH#193)
    // produces a zero-length shove and `applyImpact` returns before the gate —
    // the test would then pass for a reason unrelated to the defect (失敗形態 ④).
    const a = dummy(world, 0, 0, Z0.center.x);
    const b = dummy(world, 1, 1, Z0.center.x + 1.3);
    for (const id of [a, b]) Object.assign(world.health.get(id)!, { hp: 5000, maxHp: 5000 });
    const def = doc("godie-i067") as unknown as ItemDef;
    attachSource(world, a, itemModifierSource(world, a, "godie-i067" as ItemId, 0, def));

    const knocked = (type: "physical" | "magic", origin: string): boolean => {
      world.events.length = 0;
      world.damageQueue.push({ source: a, target: b, amount: 2000, type, crit: false, origin });
      combatResolveSystem(world);
      world.health.get(b)!.hp = 5000; // keep the punching bag alive for the next probe
      return world.events.some((e) => e.type === "knockdown");
    };

    // CONTROL: a heavy physical blow from the SAME armed holder still floors the
    // victim, so 「no knockdown」 below cannot be 「nothing ever knocks down」.
    expect(knocked("physical", "basic"), "a heavy physical auto must still knock down").toBe(true);
    // THE PROMISE: the spell is converted to true damage (asserted above) but
    // stays knockdown-free.
    expect(knocked("magic", "ability:x.q"), "the converted spell gained a knockdown").toBe(false);
  });
});

describe("平衡 —— the AP number is REPORTED, not silently capped", () => {
  it("惡夢魔王碎片 + 死之王套裝 is AP ×3.0 (pctAdd shares one bucket), and nothing clamps it", () => {
    /*
     * owner's 效能 lines put 「總 AP 額外 + 100%」 on 惡夢魔王碎片 AND on the
     * 死之王套裝 bonus. `stats/statPipeline.ts` folds
     *     final = (base + Σflat) · (1 + ΣpctAdd) · Π(1 + pctMult)
     * so two +100% `pctAdd` entries are ×(1 + 1.0 + 1.0) = ×3.0 — NOT ×4, and
     * NOT ×2. Every point of that AP is then delivered by 惡夢魔王碎片 as TRUE
     * damage, i.e. against no magic resist at all.
     *
     * This test exists to make that number visible and to go red if anybody
     * quietly inserts a cap: capping is owner's call (CLAUDE.md 第一守則 — a
     * balance ceiling belongs in the editor, not in a sim constant), and a cap
     * added here without changing the card would make the card lie.
     */
    // A REAL champion through the REAL pipeline — a hand-made StatsComp would
    // skip `recomputeStats`'s base/attribute/combatEnv layers and the ratio
    // below would then prove nothing about a live match (失敗形態 ⑤).
    const world = new SimWorld(SKELETON_ARENA, 42);
    const c = Z0.center;
    const a = spawnChampion(world, {
      championId: "sela" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: c.x, z: Y },
      zone: 0,
    });
    const sc = world.stats.get(a)!;
    const baseAp = sc.final[Stat.AbilityPower];
    // The ratios below are only meaningful against a non-zero base.
    expect(baseAp).toBeGreaterThan(0);

    const shard = doc("godie-i067") as unknown as ItemDef;
    // ⚠️ 碎片自己的 pctAdd 也從文件讀 —— 這裡原本寫死 ×2 / ×3.0,而 owner
    //    2026-08-10 把套裝從 +100% 調成 +300%,於是這一條用「疊加規則壞了」
    //    的訊息紅,真相只是數字被調過（第四個住處）。守的是**規則**:
    //    pctAdd 共用同一個桶,所以是相加不是相乘。
    const shardPct = (shard.modifiers ?? [])
      .filter((m) => m.stat === Stat.AbilityPower && m.op === ModOp.PercentAdd)
      .reduce((a, m) => a + m.value, 0);
    expect(shardPct).toBeGreaterThan(0);
    attachSource(world, a, itemModifierSource(world, a, "godie-i067" as ItemId, 0, shard));
    recomputeStats(world, a);
    expect(sc.final[Stat.AbilityPower]).toBeCloseTo(baseAp * (1 + shardPct), 6); // shard alone

    // The 死之王套裝 bonus is the SAME shape (`ap pctAdd 1.0`) delivered as its
    // own source, so it lands in the same pctAdd bucket. Read the number off the
    // shipped set doc rather than typing 1.0 here, so a re-balance of the set
    // moves this expectation instead of hiding behind it.
    const spear = doc("godie-i01d") as unknown as {
      sets?: { modifiers?: { stat: string; op: string; value: number }[] }[];
    };
    const setAp = spear.sets?.[0]?.modifiers?.find((m) => m.stat === "ap");
    expect(setAp, "死之王套裝 no longer carries an ap bonus — re-read this test").toBeDefined();
    expect(setAp!.op).toBe("pctAdd");
    attachSource(world, a, {
      id: "set:godie-set-lichking",
      kind: "item",
      modifiers: [{ stat: Stat.AbilityPower, op: ModOp.PercentAdd, value: setAp!.value }],
    });
    recomputeStats(world, a);

    // THE RULE: ×(1 + Σ pctAdd) —— ADDITIVE, one shared bucket. Every number
    // is read off the shipped docs; nothing here is a literal.
    expect(sc.final[Stat.AbilityPower]).toBeCloseTo(baseAp * (1 + shardPct + setAp!.value), 6);
    // ⛔ and NOT the multiplicative reading — that is the drift that would matter
    expect(sc.final[Stat.AbilityPower]).not.toBeCloseTo(
      baseAp * (1 + shardPct) * (1 + setAp!.value),
      6,
    );
  });
});
