/**
 * `grantAttribute.maxAttributeBasis` —— THE DEFAULT, MEASURED.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS (and why the census could not be closed without it)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `content/fieldAdoption.test.ts` reported `maxAttributeBasis` at 0 of 4 —— no
 * content document sets it. That is the CORRECT resting state: the field is an
 * override, the ceiling ships from the code default `e.maxAttributeBasis ??
 * "base"` (`effects/grantAttribute.ts`), and 蒼月潮 07-00 獸化心靈 —— the only
 * shipped doc with a `maxAttribute` at all —— wants exactly that default,
 * because its JASS reads `GetHeroStatBJ(1,GetKillingUnit(),false)`: bonuses
 * OUT.
 *
 * But "zero adoption is correct because the default is live" is only half an
 * argument. The other half is 第二守則: IS THE DEFAULT OBSERVABLE? It was not.
 * MEASURED 2026-08-01, before this file existed: flipping the default to
 * `?? "total"` in `effects/grantAttribute.ts` left EVERY pre-existing test that
 * so much as mentions `maxAttribute*` green —
 * `sim/laneB.innates.test.ts` 16/16, `sim/itemAttributes.test.ts` 14/14,
 * `content/killTriggerSchema.test.ts` 8/8. (Those three are the complete set:
 * `grep -rn maxAttribute packages/shared/src --include=*.test.ts` names no
 * others, and `maxAttribute` itself is authored on exactly one content doc.)
 * Concretely —
 *
 *   · `laneB.innates.test.ts` ② drives the real 120-AGI ceiling end to end, but
 *     it walks AGI up through `champ.attrBonus` alone and equips nothing, so
 *     base and total are the same number in that world and the basis cannot
 *     matter;
 *   · `itemAttributes.test.ts` §5 proves `liveAttribute(…, "base")` and
 *     `liveAttribute(…, "total")` DISAGREE once a weapon is equipped, but it
 *     never runs `grantAttribute`, so it says nothing about which one the
 *     ceiling asks;
 *   · `killTriggerSchema.test.ts` only parses the doc.
 *
 * So the axis existed, both readings existed, and nothing anywhere joined them.
 * That is failure form ④: every assertion in the repo passed for a defect on
 * this line as readily as for the correct code.
 *
 * ── THE ONE SITUATION THAT SEPARATES THE TWO READINGS ─────────────────────
 *
 * A hero whose BASE 敏捷 is under 120 while his TOTAL 敏捷 (equipment counted)
 * is over it. Under `"base"` he is still earning; under `"total"` his innate is
 * silently retired by a weapon he bought. 四魂之玉 godie-i00z (「力敏智+30」)
 * makes that window real rather than hypothetical; 朗基努斯之槍 godie-i018
 * (+12 敏捷) is the same shape and its own authoringNote is where this axis is
 * written down: 「原作也用過 false(蒼月潮 07-00 的 120 敏上限),所以 basis 是
 * 欄位不是寫死」.
 *
 * ⚠️ WHY THE WINDOW IS 30 POINTS WIDE AND NOT 1. The first version of this file
 * set base 敏捷 to 119 and equipped the +12 spear — and it went red for a reason
 * that has nothing to do with the basis: KILLING GRANTS XP. Eight kills level
 * 蒼月潮 up, level feeds `championAttribute`'s growth term, and BASE 敏捷 walked
 * over 120 by itself before the 8th kill resolved. The ceiling was refusing
 * correctly and the test was wrong. Hence the wide window AND the explicit
 * 「still under the cap when the payout was decided」 assertion below: without it
 * this file could go green or red for the growth curve rather than for the line
 * it is guarding.
 *
 * ⚠️ NO FIXTURES. 蒼月潮 is spawned from the real `content/` tree and the spear
 * is the real `ItemDef`; deleting `maxAttribute: 120` from
 * `content/abilities/godie-hpb1.passive.json`, or the ceiling branch from
 * `effects/grantAttribute.ts`, takes this file down with it.
 *
 * ── MUTATIONS RUN (not asserted from memory —— each one was applied, the file
 *    was run, and the result recorded) ──────────────────────────────────────
 *   ① `e.maxAttributeBasis ?? "base"` → `?? "total"`
 *      → tests ① and ② both RED (② because its DEFAULT-basis control stops
 *        paying too). The three files listed above stayed 38/38 green, which is
 *        the whole reason this file had to be written.
 *   ② `liveAttribute(world, id, attr, e.maxAttributeBasis ?? "base")`
 *      → `liveAttribute(world, id, attr, "base")` (field ignored, default pinned)
 *      → test ② alone RED; test ① correctly stays green, because the default
 *        really is still `"base"`.
 * Both were reverted and the file re-run 3/3 green.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentStore } from "../content/store";
import {
  registerAll,
  Arenas,
  Configs,
  Models,
  StatusEffects,
  VfxDefs,
} from "../content/registries";
import { zChampionDoc } from "../content/schema/champion";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
} from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { runEffects } from "./effects/effectRunner";
import { attachItemSource } from "./economy/itemSource";
import { recomputeStats } from "./stats/statPipeline";
import { liveAttribute } from "./stats/attrSources";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId, type SeatId } from "../ids";
import type { EffectDef } from "./effects/effect";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;

/** ② 獸矛傳承使 - 蒼月潮. Carries 07-00 獸化心靈 (+1 敏 per 8 kills, cap 120). */
const USHIO = "godie-hpb1" as ChampionId;
/** 四魂之玉 —— 「力敏智+30」, the equipment half of the base/total split. */
const SHIKON = "godie-i00z" as ItemId;
/** A neutral body to kill. 麻倉葉's 天生技 is a `vision` grant: no stat, no CC. */
// ⭐ 2026-08-20（GH#479）：原本是麻倉葉 godie-nplh，他隨退場批次進了 `_legacy`。
// 21-00 灼眼的天生技同樣只給 `vision`，不碰任何一格屬性。
const DUMMY = "godie-e008" as ChampionId;
/** The doc's own hidden ceiling —— war3map.j:14163 `GetHeroStatBJ(AGI) < 120`. */
const CAP = 120;

function docs(collection: string): Record<string, unknown>[] {
  return readdirSync(join(CONTENT_DIR, collection))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map(
      (f) =>
        JSON.parse(readFileSync(join(CONTENT_DIR, collection, f), "utf-8")) as Record<
          string,
          unknown
        >,
    );
}

beforeAll(() => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const store = new ContentStore();
  // ability-templates first: `registerAll` expands 鑄技工坊 refs at registration.
  for (const c of ["ability-templates", "abilities"] as const) {
    for (const doc of docs(c)) store.add(c, doc.id as string, doc);
  }
  for (const doc of docs("champions")) {
    const parsed = zChampionDoc.safeParse(doc);
    if (parsed.success) store.add("champions", parsed.data.id, parsed.data);
  }
  for (const c of ["items", "projectiles", "status-effects", "vfx"] as const) {
    for (const doc of docs(c)) store.add(c, doc.id as string, doc);
  }
  registerAll(store);
});

const LINE_X = Z0.center.x + 12;
const P = (dz: number): { x: number; z: number } => ({ x: LINE_X, z: Z0.center.z + dz });

let seat = 0;
function spawn(world: SimWorld, championId: ChampionId, team: 0 | 1, at: { x: number; z: number }): EntityId {
  return spawnChampion(world, {
    championId,
    seatId: asSeatId(seat++),
    teamId: asTeamId(team),
    pos: at,
    zone: 0,
  });
}

function idle(world: SimWorld, ticks = 1): void {
  for (let k = 0; k < ticks; k++) {
    for (const [, nav] of world.nav) {
      nav.attackTarget = null;
      nav.moveTarget = null;
      nav.order = null;
    }
    world.step(NO_INTENTS);
  }
}

/** Fire the SHIPPED doc's own `onKill` hook by killing `n` real bodies. */
function killTimes(world: SimWorld, killer: EntityId, n: number): void {
  for (let i = 0; i < n; i++) {
    const prey = spawn(world, DUMMY, 1, P(4 + (i % 3)));
    const hp = world.health.get(prey)!;
    world.damageQueue.push({
      source: killer,
      target: prey,
      amount: hp.maxHp * 4,
      type: "true",
      crit: false,
      origin: "test",
    });
    idle(world, 1);
  }
}

/** The jewel's own 敏捷 grant, read off the shipped doc rather than typed here. */
function shikonAgi(): number {
  return Items.get(SHIKON).attributes?.agi ?? 0;
}

/**
 * 蒼月潮 standing in THE WINDOW: base 敏捷 below the cap, total 敏捷 above it.
 *
 * The base is walked up through `champ.attrBonus.agi`, which is where the 三選一
 * 能力屬性強化 card and every previous `grantAttribute` payout land — so this is
 * the same accumulator a real match fills, not a back door. The gap is then
 * covered by equipping the real jewel.
 *
 * Base is parked just ABOVE `CAP - agi(四魂之玉)` — the lowest value that still
 * puts the TOTAL over the ceiling — which leaves the whole rest of the jewel's
 * grant as headroom for the level growth the kills themselves cause.
 */
function ushioInTheWindow(seed: number): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, seed);
  const id = spawn(world, USHIO, 0, P(0));
  idle(world, 1);
  const champ = world.champion.get(id)!;

  const floor = CAP - shikonAgi();
  while (liveAttribute(world, id, "agi", "base")! <= floor) champ.attrBonus.agi += 1;

  attachItemSource(world, id, SHIKON, 0, Items.get(SHIKON));
  recomputeStats(world, id);
  return { world, id };
}

describe("grantAttribute.maxAttributeBasis —— 「哪一種三圍」 is a FIELD, and its default is 「base」", () => {
  it("SETUP: the window is real —— base < 120 <= total once the spear is on", () => {
    // Guard the guard. If the spear ever stops granting 敏捷, or the champion's
    // growth curve changes, both assertions below would pass for the wrong
    // reason (base === total again) and this file would go quietly useless.
    const { world, id } = ushioInTheWindow(6101);
    const base = liveAttribute(world, id, "agi", "base")!;
    const total = liveAttribute(world, id, "agi", "total")!;
    expect(base).toBeLessThan(CAP);
    expect(total).toBeGreaterThanOrEqual(CAP);
  });

  it("① the DEFAULT is 「base」: an equipped +12 敏捷 does NOT retire 獸化心靈 early", () => {
    // ⚠️ MUTATION ①: `e.maxAttributeBasis ?? "base"` → `?? "total"` in
    // `effects/grantAttribute.ts`. RUN 2026-08-01 → this assertion goes RED
    // (0 instead of 1). Reverted; green again.
    const { world, id } = ushioInTheWindow(6102);
    const champ = world.champion.get(id)!;
    const before = champ.attrBonus.agi;

    killTimes(world, id, 8); // exactly one payout's worth

    // GUARD THE GUARD: the kills grant XP and XP grants growth, so BASE 敏捷
    // moves on its own. If it ever crosses the cap here the assertion below
    // would be measuring the growth curve instead of the basis.
    expect(liveAttribute(world, id, "agi", "base")!).toBeLessThan(CAP);
    expect(liveAttribute(world, id, "agi", "total")!).toBeGreaterThanOrEqual(CAP);

    expect(champ.attrBonus.agi).toBe(before + 1);
  });

  it("② the OTHER reading is expressible: `maxAttributeBasis:\"total\"` refuses the same payout", () => {
    // The field is READ, not merely defaulted — otherwise ① would also pass
    // against a hard-coded `"base"`, and the census row would be exempted for a
    // mechanism nobody can actually reach from the editor.
    //
    // ⚠️ MUTATION ②: replace `e.maxAttributeBasis ?? "base"` with the literal
    // `"base"`. RUN 2026-08-01 → this assertion goes RED (the payout lands).
    // Reverted; green again.
    const { world, id } = ushioInTheWindow(6103);
    const champ = world.champion.get(id)!;
    const before = champ.attrBonus.agi;

    const TOTAL_CEILING: EffectDef[] = [
      { kind: "grantAttribute", attr: "agi", amount: 1, maxAttribute: CAP, maxAttributeBasis: "total", mode: "flat" },
    ];
    runEffects(TOTAL_CEILING, {
      world,
      caster: id,
      rank: 1,
      targets: [id],
      origin: "test:total-ceiling",
      rng: world.rng,
    });
    expect(champ.attrBonus.agi).toBe(before);

    // CONTROL, same world, same tick: the identical effect with the DEFAULT
    // basis pays. So ② is about the basis and not about the effect being inert
    // on this champion (失敗形態 ④).
    const BASE_CEILING: EffectDef[] = [
      { kind: "grantAttribute", attr: "agi", amount: 1, maxAttribute: CAP, mode: "flat" },
    ];
    runEffects(BASE_CEILING, {
      world,
      caster: id,
      rank: 1,
      targets: [id],
      origin: "test:base-ceiling",
      rng: world.rng,
    });
    expect(champ.attrBonus.agi).toBe(before + 1);
  });
});
