/**
 * 貫雷槍 (godie-i01g) — THE SHIPPED DOC, driven through the real sim.
 *
 * The owner's prose IS the spec:
 *   [緩慢] 8%的機率造成敵方緩速，移動速度 -2，持續 0.6秒
 *   [伸長] 近戰攻擊距離+4；遠戰攻擊距離+2
 *   [重創] 敵方攻擊時吸血效果降低50%吸血回復量
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM `economy/itemGatedModifiers.test.ts`.
 * That one proves the MECHANISM on synthetic content. This one proves the
 * SHIPPED DOC uses it — CLAUDE.md 失敗形態 ⑤ 「被測的不是出貨的那個」, which in
 * this repo has already shipped once as a test that hand-wrote the flags the
 * real snapshot never sets. Every assertion below reads
 * `content/items/godie-i01g.json` through the same registry the game reads.
 *
 * WHAT IS ASSERTED, AND AGAINST WHICH CONSUMER — never a property:
 *   [伸長] → `reachTo()`, the function `BasicAttackSystem` gates the swing on
 *            and `OrderSystem` stops the chase at.
 *   [緩慢] → `movementHold().speedMult`, the ONE judge of 「這個 tick 走多快」,
 *            reached by stepping the whole pipeline until a real auto-attack
 *            procs it (no hand-called hook).
 *   [重創] → `stats.final[lifesteal]` on the ATTACKER, which is the exact value
 *            `combat/damage.ts` multiplies the heal by.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentStore } from "../content/store";
import { registerAll } from "../content/registries";
import { Champions, Items } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { grantItemFree } from "./economy/shop";
import { recomputeStats, attachSource } from "./stats/statPipeline";
import { reachTo } from "./systems/BasicAttackSystem";
import { combatResolveSystem } from "./combat/damage";
import { movementHold } from "./movementHold";
import { Stat } from "./stats/statTypes";
import { ModOp } from "./stats/modifiers";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;

const LANCE = "godie-i01g" as ItemId;
/** 神騎寶貝-皮卡丘 / 神奇寶貝兒-皮卡丘 — a SHIPPED melee↔ranged transform pair. */
const MELEE = "godie-o02l" as ChampionId;
const RANGED = "godie-ofar" as ChampionId;

/** The three numbers the owner wrote, restated here so a doc edit is visible. */
const MELEE_RANGE_BONUS = 4;
const RANGED_RANGE_BONUS = 2;
const SLOW_STATUS = "slow30";
const SLOW_MULT = 0.7;
const SLOW_SEC = 0.6;
const PROC_CHANCE = 0.08;
const GRIEVOUS_PCT = -0.5;

function docs(collection: string): Record<string, unknown>[] {
  return readdirSync(join(CONTENT_DIR, collection))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(CONTENT_DIR, collection, f), "utf-8")) as Record<string, unknown>);
}

beforeAll(() => {
  const store = new ContentStore();
  for (const c of ["ability-templates", "abilities", "champions", "projectiles", "status-effects", "items"] as const) {
    for (const doc of docs(c)) store.add(c, doc.id as string, doc);
  }
  registerAll(store);
});

let seat = 0;
function spawn(world: SimWorld, championId: ChampionId, team: 0 | 1, dx: number): EntityId {
  return spawnChampion(world, {
    championId,
    seatId: asSeatId(seat++),
    teamId: asTeamId(team),
    pos: { x: Z0.center.x + dx, z: Z0.center.z + 8 },
    zone: 0,
  });
}

// ---------------------------------------------------------------------------
// [伸長]
// ---------------------------------------------------------------------------

describe("貫雷槍 [伸長] — 近戰攻擊距離+4；遠戰攻擊距離+2", () => {
  it("THE SHIPPED DOC authors two gated rows, not one ungated one", () => {
    // Names the file to edit. The behaviour assertions below are the real
    // guards — this one exists so a failure says WHERE, not just WHAT.
    cover("lance-shenchang-doc");
    const mods = Items.get(LANCE).modifiers ?? [];
    const rows = mods.filter((m) => m.stat === Stat.AttackRange);
    expect(rows.length).toBe(2);
    expect(rows.find((m) => m.requires?.attackType === "melee")?.value).toBe(MELEE_RANGE_BONUS);
    expect(rows.find((m) => m.requires?.attackType === "ranged")?.value).toBe(RANGED_RANGE_BONUS);
  });

  it("moves the SWING GATE by +4 on a melee body and +2 on a ranged one", () => {
    cover("lance-shenchang-reach");
    const world = new SimWorld(SKELETON_ARENA, 31);
    expect(Champions.get(MELEE).attackType).toBe("melee");
    expect(Champions.get(RANGED).attackType).toBe("ranged");

    const mBare = spawn(world, MELEE, 0, -10);
    const mArmed = spawn(world, MELEE, 0, -8);
    const rBare = spawn(world, RANGED, 0, 6);
    const rArmed = spawn(world, RANGED, 0, 8);
    expect(grantItemFree(world, mArmed, LANCE)).toBeGreaterThanOrEqual(0);
    expect(grantItemFree(world, rArmed, LANCE)).toBeGreaterThanOrEqual(0);
    for (const id of [mBare, mArmed, rBare, rArmed]) recomputeStats(world, id);

    // Big enough radii that body contact never dominates reachTo's max().
    const reach = (id: EntityId): number => reachTo(world.stats.get(id)!, 0.4, 0.4);
    const env = world.combatEnv.attackRange;
    expect(reach(mArmed) - reach(mBare)).toBeCloseTo(MELEE_RANGE_BONUS * env, 5);
    expect(reach(rArmed) - reach(rBare)).toBeCloseTo(RANGED_RANGE_BONUS * env, 5);
    // and the two are genuinely DIFFERENT gains — not the same row twice
    expect(reach(mArmed) - reach(mBare)).toBeGreaterThan(reach(rArmed) - reach(rBare));
  });
});

// ---------------------------------------------------------------------------
// [緩慢]
// ---------------------------------------------------------------------------

describe("貫雷槍 [緩慢] — an 8% on-attack slow that really slows", () => {
  it("THE SHIPPED DOC: onBasicAttack, chance 0.08, slow30 for 0.6s", () => {
    cover("lance-slow-doc");
    const hook = (Items.get(LANCE).passive ?? []).find((h) => h.on === "onBasicAttack");
    expect(hook, "貫雷槍's [緩慢] hook").toBeDefined();
    expect(hook!.chance).toBe(PROC_CHANCE);
    const eff = hook!.effects[0]!;
    expect(eff.kind).toBe("applyStatus");
    if (eff.kind !== "applyStatus") throw new Error("unreachable");
    expect(eff.statusId).toBe(SLOW_STATUS);
    expect(eff.duration).toBe(SLOW_SEC);
    expect(eff.moveSpeedMult).toBe(SLOW_MULT);
  });

  it("a real auto-attack eventually lands it, and the VICTIM actually walks slower", () => {
    cover("lance-slow-behaviour");
    // Full pipeline, no hand-called hook: two hostile champions inside melee
    // reach auto-engage (#221), swing, and the seeded rng decides. Seed is
    // fixed, so "eventually" is a deterministic number of ticks.
    const world = new SimWorld(SKELETON_ARENA, 4242);
    const holder = spawn(world, MELEE, 0, -0.6);
    const victim = spawn(world, MELEE, 1, 0.6);
    grantItemFree(world, holder, LANCE);
    // The victim must not die before the 8% lands, and must not slow the holder
    // back (only the holder carries the lance, so only one direction procs).
    world.health.get(victim)!.maxHp = 1e9;
    world.health.get(victim)!.hp = 1e9;
    world.health.get(holder)!.maxHp = 1e9;
    world.health.get(holder)!.hp = 1e9;
    // The one thing a player does: order the attack. Everything after this —
    // approach, swing cadence, the damage packet, `fireHooks(onBasicAttack)`,
    // the proc roll, the status attach, `movementHold` — is the real pipeline.
    world.nav.get(holder)!.attackTarget = victim;

    let slowed = false;
    for (let t = 0; t < 3000 && !slowed; t++) {
      world.step(NO_INTENTS);
      slowed = movementHold(world, victim).speedMult < 1;
    }
    expect(slowed, "貫雷槍 never slowed anybody in 100 seconds of auto-attacks").toBe(true);
    // THE NUMBER, off the consumer that decides how fast the body moves.
    expect(movementHold(world, victim).speedMult).toBeCloseTo(SLOW_MULT, 6);
    // …and it is the SHIPPED marker, so the client's status strip names it.
    expect(
      world.status.get(victim)!.effects.some((e) => String(e.statusId) === SLOW_STATUS),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// [重創]
// ---------------------------------------------------------------------------

describe("貫雷槍 [重創] — the ATTACKER's lifesteal is halved, once, not compounded", () => {
  const BASE_LIFESTEAL = 0.4;

  /** A duel where `attacker` swings at the lance `holder`. */
  function setup(): { world: SimWorld; holder: EntityId; attacker: EntityId } {
    const world = new SimWorld(SKELETON_ARENA, 77);
    const holder = spawn(world, MELEE, 0, -0.6);
    const attacker = spawn(world, MELEE, 1, 0.6);
    grantItemFree(world, holder, LANCE);
    attachSource(world, attacker, {
      id: "test:lifesteal",
      kind: "augment",
      modifiers: [{ stat: Stat.Lifesteal, op: ModOp.Flat, value: BASE_LIFESTEAL }],
    });
    world.health.get(holder)!.maxHp = 1e9;
    world.health.get(holder)!.hp = 1e9;
    recomputeStats(world, holder);
    recomputeStats(world, attacker);
    return { world, holder, attacker };
  }

  /** One resolved BASIC-attack packet from `attacker` into `holder`. */
  function swing(world: SimWorld, attacker: EntityId, holder: EntityId): void {
    world.damageQueue.push({
      source: attacker,
      target: holder,
      amount: 10,
      type: "physical",
      crit: false,
      origin: "basic",
    });
    combatResolveSystem(world);
    recomputeStats(world, attacker);
  }

  const lifestealOf = (world: SimWorld, id: EntityId): number =>
    world.stats.get(id)!.final[Stat.Lifesteal];

  it("one basic attack into the lance holder halves the attacker's lifesteal", () => {
    cover("lance-grievous-halves");
    const { world, holder, attacker } = setup();
    const before = lifestealOf(world, attacker);
    expect(before).toBeGreaterThan(0);
    swing(world, attacker, holder);
    expect(lifestealOf(world, attacker)).toBeCloseTo(before * (1 + GRIEVOUS_PCT), 6);
  });

  it("FIVE attacks still halve it — `stackKey` stops 0.5^n compounding", () => {
    // THE TRAP THIS PINS: without `stackKey`/`maxStacks`, every hit attaches a
    // NEW `buff:<origin>#<tick>` source, and `pctMult` MULTIPLIES across
    // sources — five swings would leave 0.5^5 = 3.1 % of the attacker's
    // lifesteal, i.e. a different effect wearing the same words.
    cover("lance-grievous-no-compound");
    const { world, holder, attacker } = setup();
    const before = lifestealOf(world, attacker);
    for (let i = 0; i < 5; i++) {
      swing(world, attacker, holder);
      world.tick++; // distinct ticks: the un-keyed source id is per-tick
    }
    expect(lifestealOf(world, attacker)).toBeCloseTo(before * (1 + GRIEVOUS_PCT), 6);
  });

  it("lands on the ATTACKER, never on the lance holder himself", () => {
    cover("lance-grievous-target");
    const { world, holder, attacker } = setup();
    attachSource(world, holder, {
      id: "test:lifesteal",
      kind: "augment",
      modifiers: [{ stat: Stat.Lifesteal, op: ModOp.Flat, value: BASE_LIFESTEAL }],
    });
    recomputeStats(world, holder);
    const holderBefore = lifestealOf(world, holder);
    swing(world, attacker, holder);
    recomputeStats(world, holder);
    expect(lifestealOf(world, holder)).toBeCloseTo(holderBefore, 6);
  });

  it("a NON-basic hit does not apply it — 「敵方攻擊時」 means an attack", () => {
    cover("lance-grievous-basic-only");
    const { world, holder, attacker } = setup();
    const before = lifestealOf(world, attacker);
    world.damageQueue.push({
      source: attacker,
      target: holder,
      amount: 10,
      type: "magic",
      crit: false,
      origin: "arena:fire-ring",
    });
    combatResolveSystem(world);
    recomputeStats(world, attacker);
    expect(lifestealOf(world, attacker)).toBeCloseTo(before, 6);
  });
});
