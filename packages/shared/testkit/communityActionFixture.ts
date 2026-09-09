import { communityCombatFixture } from "./communityCombatFixture";
import { castAbility } from "../src/sim/abilities/abilitySystem";
import { abilityInstanceFor } from "../src/sim/abilities/innateActive";
import { attachSource, recomputeStats } from "../src/sim/stats/statPipeline";
import { Stat } from "../src/sim/stats/statTypes";
import { ModOp } from "../src/sim/stats/modifiers";
import { DEFAULT_HITSTOP } from "../src/sim/combat/hitstopHold";
import { mobRulesFromConfig, type MobWavesConfigLike } from "../src/sim/mobs";
import { markCount } from "../src/sim/marks";
import { asSeatId, type EntityId, type StatusId } from "../src/ids";
import type { CastableSlot, CastTarget } from "../src/sim/intents";

/** Real compiled batch hero, deterministic live combat, no incidental auto-acquire. */
export function communityActionFixture(number: string, rank = 1) {
  const r = communityCombatFixture(number, rank);
  const { world } = r;
  const events: typeof world.events = [];
  world.combatFeel = { ...world.combatFeel,
    knockback: { ...world.combatFeel.knockback, maxBodies: 0 },
    hitstop: { ...DEFAULT_HITSTOP, scale: 0 } };
  const arena = r.source.catalog.documents.get("config/arena-rules") as unknown as { mobWaves: MobWavesConfigLike };
  world.combatActive = true;
  world.mobRules = { ...mobRulesFromConfig(arena.mobWaves, world.dt), autoWaves: false,
    inertSeats: new Set([0, 1, 2, 3].map(asSeatId)) };
  const origin = { ...world.transform.get(r.caster)!.pos };
  for (const id of [r.caster, r.ally, r.enemy, r.distant]) {
    attachSource(world, id, { id: "test:stable-combat", kind: "item", modifiers: [
      { stat: Stat.MaxHealth, op: ModOp.Override, value: 100000 },
      { stat: Stat.HealthRegen, op: ModOp.Override, value: 0 },
      { stat: Stat.ManaRegen, op: ModOp.Override, value: 0 },
    ] });
    recomputeStats(world, id); world.health.get(id)!.hp = 50000;
  }
  const place = (id: EntityId, x: number, z = 0) => {
    const t = world.transform.get(id)!;
    t.pos = { x: origin.x + x, z: origin.z + z }; t.vel = { x: 0, z: 0 }; t.facing = { x: 1, z: 0 };
    const nav = world.nav.get(id)!; nav.order = { kind: "hold" }; nav.attackTarget = null;
    world.rebuildGrid();
  };
  place(r.caster, 0); place(r.enemy, 1.8); place(r.ally, -8); place(r.distant, 12);
  const step = (ticks = 1) => {
    for (let i = 0; i < ticks; i++) { world.step(new Map()); events.push(...world.events); }
  };
  const ready = (slot: CastableSlot, caster = r.caster) => {
    abilityInstanceFor(world.abilities.get(caster)!, slot)!.cooldownRemainingTicks = 0;
    world.health.get(caster)!.mana = world.health.get(caster)!.maxMana;
  };
  const cast = (slot: CastableSlot, target: CastTarget, ticks = 0, caster = r.caster) => {
    const start = world.events.length;
    const result = castAbility(world, caster, slot, target);
    events.push(...world.events.slice(start)); if (result === "ok") step(ticks);
    return result;
  };
  const count = (name: string, id = r.caster) => markCount(world, id, `${r.project.projectId}.${name}` as StatusId);
  const hits = (slot: string) => events.filter(e => e.type === "damage" && e.data.origin === `ability:${r.project.projectId}.${slot.toLowerCase()}`);
  const attack = (source = r.enemy, target = r.caster) => {
    const nav = world.nav.get(source)!; nav.order = { kind: "attackTarget", entity: target }; nav.attackTarget = target;
  };
  const hold = (id = r.enemy) => { const nav = world.nav.get(id)!; nav.order = { kind: "hold" }; nav.attackTarget = null; };
  step();
  return { ...r, origin, events, place, step, ready, cast, count, hits, attack, hold };
}
