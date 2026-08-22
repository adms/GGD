/** 一次性量尺 —— 量完就刪。⛔ 不是守衛。 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA, type ArenaDef } from "./world/ArenaDef";
import { registerSkeletonContent, SELA, THORNE } from "./content/skeleton";
import { Statuses } from "./content/registry";
import { spawnChampion } from "./spawnChampion";
import { runEffects } from "./effects/effectRunner";
import { attachSource, recomputeStats } from "./stats/statPipeline";
import { ModOp } from "./stats/modifiers";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type StatusId } from "../ids";
import { Stat } from "./stats/statTypes";

const WEAK_TAG = "probe-weak-family";
const WEAK = "probe-weakening" as StatusId;

beforeAll(() => {
  registerSkeletonContent();
  Statuses.register(WEAK, { polarity: "debuff", tags: [WEAK_TAG] });
});

const OPEN_ARENA: ArenaDef = {
  id: "arena.balance-open",
  name: "probe",
  zones: SKELETON_ARENA.zones.map((z) => ({ ...z, obstacles: [] })),
};
const ZONE0 = OPEN_ARENA.zones[0]!;
const CHIP = 1;
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

function realAttacksPerSec(sheetAs: number, chip: boolean): number {
  const w = new SimWorld(OPEN_ARENA, 31);
  w.combatActive = true;
  const me = champ(w, "thorne", ZONE0.center.x, ZONE0.center.z + 12);
  const bag = champ(w, "thorne", ZONE0.center.x + 1.0, ZONE0.center.z + 12, 2);
  const sc = w.stats.get(me)!;
  const bagHp = w.health.get(bag)!;
  const bagSc = w.stats.get(bag)!;
  let hits = 0;
  for (let i = 0; i < 300; i++) {
    sc.final[Stat.AttackSpeed] = sheetAs;
    bagHp.hp = bagHp.maxHp;
    bagSc.final[Stat.MoveSpeed] = 0;
    if (chip) {
      sc.final[Stat.AttackDamage] = CHIP;
      bagSc.final[Stat.AttackDamage] = CHIP;
    }
    w.step(new Map());
    for (const ev of w.events) {
      const d = ev.data as { source?: EntityId; origin?: string };
      if (ev.type === "damage" && d.source === me && d.origin === "basic") hits++;
    }
  }
  return hits / 10;
}

function capsSwings(capRaise: number | null, chip: boolean): number {
  const w = new SimWorld(OPEN_ARENA, 4);
  w.combatActive = true;
  const attacker = champ(w, "thorne", ZONE0.center.x, ZONE0.center.z + 12);
  const dummy = champ(w, "thorne", ZONE0.center.x + 1.0, ZONE0.center.z + 12, 2);
  const mods = [{ stat: Stat.AttackSpeed, op: ModOp.Flat, value: 999 }];
  if (capRaise !== null) mods.push({ stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: capRaise });
  attachSource(w, attacker, { id: "t:as", kind: "buff", modifiers: mods });
  recomputeStats(w, attacker);
  let swings = 0;
  const pos = { ...w.transform.get(dummy)!.pos };
  for (let i = 0; i < 90; i++) {
    const hp = w.health.get(dummy)!;
    hp.hp = hp.maxHp;
    w.transform.get(dummy)!.pos = { ...pos };
    w.nav.get(attacker)!.attackTarget = dummy;
    if (chip) {
      w.stats.get(attacker)!.final[Stat.AttackDamage] = CHIP;
      w.stats.get(dummy)!.final[Stat.AttackDamage] = CHIP;
    }
    w.step(new Map());
    for (const e of w.events) if (e.type === "basicAttack" && e.data.source === attacker) swings++;
  }
  return swings;
}

const C = SKELETON_ARENA.zones[0]!.center;
function weaknessSwings(weakened: boolean, chip: boolean): number {
  const world = new SimWorld(SKELETON_ARENA, 7);
  world.combatActive = true;
  world.weaknessRules = { statusTag: WEAK_TAG, attackSpeedMult: 0.25, damageDealtMult: 0.25 };
  const hero = spawnChampion(world, {
    championId: SELA.id, seatId: asSeatId(0), teamId: asTeamId(0),
    pos: { x: C.x, z: C.z }, zone: 0,
  });
  const foe = spawnChampion(world, {
    championId: THORNE.id, seatId: asSeatId(1), teamId: asTeamId(1),
    pos: { x: C.x + 1, z: C.z }, zone: 0,
  });
  world.step(new Map());
  if (weakened) {
    runEffects([{ kind: "applyStatus", statusId: WEAK, duration: 30 }], {
      world, caster: hero, rank: 1, targets: [hero], origin: "probe", rng: world.rng,
    });
  }
  let n = 0;
  for (let i = 0; i < 120; i++) {
    world.nav.get(hero)!.attackTarget = foe;
    if (chip) {
      world.stats.get(hero)!.final[Stat.AttackDamage] = CHIP;
      world.stats.get(foe)!.final[Stat.AttackDamage] = CHIP;
    }
    world.step(new Map());
    if (world.events.some((e) => e.type === "basicAttack")) n += 1;
  }
  return n;
}

describe("probe", () => {
  it("measures", () => {
    for (const chip of [false, true] as const) {
      const a: string[] = [];
      for (const sheet of [1.0, 2.0, 2.5, 3.0, 4.0, 6.0]) a.push(`${sheet}→${realAttacksPerSec(sheet, chip)}`);
      // eslint-disable-next-line no-console
      console.log(`chip=${chip} AS bench: ${a.join("  ")}`);
    }
    for (const chip of [false, true] as const) {
      // eslint-disable-next-line no-console
      console.log(`chip=${chip} caps: capped=${capsSwings(null, chip)} unlocked=${capsSwings(10, chip)}`);
    }
    for (const chip of [false, true] as const) {
      // eslint-disable-next-line no-console
      console.log(`chip=${chip} weakness: normal=${weaknessSwings(false, chip)} weak=${weaknessSwings(true, chip)}`);
    }
    expect(true).toBe(true);
  });
});
