/**
 * SCRATCH PROBE (forensics, task #265) — the live-path hypotheses that the
 * #221 unit tests never exercise. Real champion docs, real spawnChampion, real
 * shipped combat-env, and the ORDER SHAPES a human's client actually emits.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { normalizeCombatEnv, type CombatEnvKey } from "./combatEnv";
import { Stat } from "./stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame, Order } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../..");
const CONTENT_DIR = join(ROOT, "content");

const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;
const LANE_Z = Z0.center.z + 12;
const SABER = "godie-e002" as ChampionId;
const DUMMY = "godie-hart" as ChampionId;
const IMMOBILE = 1e-9;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const res = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(res.store);
});

function env() {
  const doc = Configs.tryGet("combat-env") as
    | { multipliers?: Partial<Record<CombatEnvKey, number>> }
    | undefined;
  return normalizeCombatEnv(doc?.multipliers);
}

function makeWorld(meId: ChampionId, gap: number) {
  const world = new SimWorld(SKELETON_ARENA, 20260726);
  world.combatEnv = env();
  world.combatActive = true;
  const me = spawnChampion(world, {
    championId: meId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: LANE_Z },
    zone: 0,
  });
  const foe = spawnChampion(world, {
    championId: DUMMY,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: Z0.center.x + gap, z: LANE_Z },
    zone: 0,
  });
  world.stats.get(foe)!.final[Stat.MoveSpeed] = IMMOBILE;
  return { world, me, foe };
}

function stepN(
  world: SimWorld,
  me: EntityId,
  foe: EntityId,
  n: number,
  intents: Map<SeatId, IntentFrame> = NO_INTENTS,
): number {
  let hits = 0;
  const foeHp = world.health.get(foe)!;
  for (let i = 0; i < n; i++) {
    foeHp.hp = foeHp.maxHp;
    world.stats.get(foe)!.final[Stat.MoveSpeed] = IMMOBILE;
    world.step(i === 0 ? intents : NO_INTENTS);
    for (const e of world.events) {
      const d = e.data as { source?: EntityId; origin?: string };
      if (e.type === "damage" && d.source === me && d.origin === "basic") hits++;
    }
  }
  return hits;
}

function order(o: Order): Map<SeatId, IntentFrame> {
  return new Map([[asSeatId(0), { order: o, commands: [] }]]);
}

describe("live-path probes", () => {
  it("H0 baseline: Saber with NO orders attacks an in-reach enemy", () => {
    const { world, me, foe } = makeWorld(SABER, 1.3);
    const hits = stepN(world, me, foe, 300);
    console.log("H0 idle Saber hits:", hits, "target:", world.nav.get(me)!.attackTarget);
    expect(hits).toBeGreaterThan(0);
  });

  it("H1 right-click-the-GROUND next to an enemy: does the walk ever end?", () => {
    // The exact human gesture: right-click the floor BEHIND/AT the enemy.
    // mapRightClick -> { kind: "move", point } whenever no enemy body is hovered.
    const { world, me, foe } = makeWorld(SABER, 6);
    const foeT = world.transform.get(foe)!;
    const hits = stepN(world, me, foe, 600, order({ kind: "move", point: { x: foeT.pos.x, z: foeT.pos.z } }));
    const nav = world.nav.get(me)!;
    console.log("H1 hits:", hits, "order:", JSON.stringify(nav.order), "moveTarget:", JSON.stringify(nav.moveTarget), "attackTarget:", nav.attackTarget);
    console.log("H1 final gap:", Math.hypot(world.transform.get(me)!.pos.x - foeT.pos.x, world.transform.get(me)!.pos.z - foeT.pos.z));
  });

  it("H2 right-click a point INSIDE an obstacle / outside the zone", () => {
    const { world, me, foe } = makeWorld(SABER, 3);
    // a point far outside the zone boundary -> MovementSystem clamps, never arrives
    const hits = stepN(world, me, foe, 600, order({ kind: "move", point: { x: Z0.center.x + 400, z: LANE_Z } }));
    const nav = world.nav.get(me)!;
    console.log("H2 hits:", hits, "order:", JSON.stringify(nav.order), "moveTarget:", JSON.stringify(nav.moveTarget));
  });

  it("H3 a move order to a point a WALL/pillar blocks", () => {
    const { world, me, foe } = makeWorld(SABER, 3);
    // SKELETON_ARENA keeps r1.8 obstacles at |z| = 8 relative to zone centre
    const hits = stepN(world, me, foe, 600, order({ kind: "move", point: { x: Z0.center.x, z: Z0.center.z + 8 } }));
    const nav = world.nav.get(me)!;
    console.log("H3 hits:", hits, "order:", JSON.stringify(nav.order), "moveTarget:", JSON.stringify(nav.moveTarget));
  });

  it("H4 a STICK/touch joystick that re-sends a move order EVERY tick", () => {
    const { world, me, foe } = makeWorld(SABER, 1.3);
    let hits = 0;
    const foeHp = world.health.get(foe)!;
    for (let i = 0; i < 300; i++) {
      foeHp.hp = foeHp.maxHp;
      const t = world.transform.get(me)!;
      // TouchInput/GamepadInput shape: a point one step ahead in the stick dir,
      // re-issued every frame while the stick is held.
      const o = order({ kind: "move", point: { x: t.pos.x + 0.5, z: t.pos.z } });
      world.step(o);
      for (const e of world.events) {
        const d = e.data as { source?: EntityId; origin?: string };
        if (e.type === "damage" && d.source === me && d.origin === "basic") hits++;
      }
    }
    console.log("H4 stick-held hits:", hits, "attackTarget:", world.nav.get(me)!.attackTarget);
  });

  it("H5 one stick nudge then RELEASE (order stops arriving)", () => {
    const { world, me, foe } = makeWorld(SABER, 1.3);
    const t = world.transform.get(me)!;
    const hits = stepN(world, me, foe, 300, order({ kind: "move", point: { x: t.pos.x + 0.5, z: t.pos.z } }));
    const nav = world.nav.get(me)!;
    console.log("H5 hits:", hits, "order:", JSON.stringify(nav.order), "moveTarget:", JSON.stringify(nav.moveTarget));
  });

  it("H6 combatActive false (what a client prediction world looks like)", () => {
    const { world, me, foe } = makeWorld(SABER, 1.3);
    world.combatActive = false;
    const hits = stepN(world, me, foe, 300);
    console.log("H6 hits with combatActive=false:", hits);
  });
});
