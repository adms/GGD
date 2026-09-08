/** Research-only real-engine scenario harness. No skill implementation or source edits. */
import { createHeroSimulationBaseline } from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/simulationBaseline.ts';
import { extendRegistryContext, withRegistryContext } from '../../GGD-community-hero-forge/packages/shared/src/sim/content/registryContext.ts';
import { Abilities, registerChampion } from '../../GGD-community-hero-forge/packages/shared/src/sim/content/registry.ts';
import { SimWorld } from '../../GGD-community-hero-forge/packages/shared/src/sim/SimWorld.ts';
import { spawnChampion } from '../../GGD-community-hero-forge/packages/shared/src/sim/spawnChampion.ts';
import { asSeatId, asTeamId } from '../../GGD-community-hero-forge/packages/shared/src/ids.ts';
import { normalizeCombatEnv } from '../../GGD-community-hero-forge/packages/shared/src/sim/combatEnv.ts';
import { castAbility, learnEx } from '../../GGD-community-hero-forge/packages/shared/src/sim/abilities/abilitySystem.ts';
import { abilityInstanceFor } from '../../GGD-community-hero-forge/packages/shared/src/sim/abilities/innateActive.ts';
import { attachSource, recomputeStats } from '../../GGD-community-hero-forge/packages/shared/src/sim/stats/statPipeline.ts';
import { Stat } from '../../GGD-community-hero-forge/packages/shared/src/sim/stats/statTypes.ts';
import { ModOp } from '../../GGD-community-hero-forge/packages/shared/src/sim/stats/modifiers.ts';

export function engineProbe(compiled: any, catalog: any, name: string, fn: (r: any) => any, seed = 20260908) {
  const baseline = createHeroSimulationBaseline(catalog.documents);
  const context = extendRegistryContext(baseline.context, `source-probe-${name}`, () => {
    for (const a of Object.values(compiled.abilityDrafts) as any[]) Abilities.register(a.id, a);
    registerChampion(compiled.champion, { overrideAbilities: true });
  });
  return withRegistryContext(context, () => {
    const world = new SimWorld(baseline.arena, seed); Object.assign(world, structuredClone(baseline.rules));
    world.ultGateOverride = true; world.combatActive = true;
    world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
    world.combatFeel = { ...world.combatFeel, autoEngage: { ...world.combatFeel.autoEngage, enabled: false } };
    const c = baseline.arena.zones[0]!.center;
    const actors = [0, 1, 2].map(seat => spawnChampion(world, { zone: 0, championId: compiled.champion.id,
      seatId: asSeatId(seat), teamId: asTeamId(seat === 1 ? 1 : 0),
      pos: { x: c.x + (seat === 1 ? 2 : seat === 0 ? 0 : -3), z: c.z + 10 }, level: 18 }));
    const [caster, foe, other] = actors;
    for (const actor of actors) {
      world.nav.get(actor)!.order = { kind: 'hold' };
      attachSource(world, actor, { id: 'source-probe-no-regen', kind: 'item', modifiers: [
        { stat: Stat.HealthRegen, op: ModOp.Flat, value: -10000 },
        { stat: Stat.AbilityPower, op: ModOp.Flat, value: 100 },
        { stat: Stat.MaxHealth, op: ModOp.Flat, value: 100000 },
        { stat: Stat.MaxMana, op: ModOp.Flat, value: 10000 }] });
      recomputeStats(world, actor);
      const h = world.health.get(actor)!; h.hp = h.maxHp; h.mana = h.maxMana;
      for (const slot of ['Q', 'W', 'E', 'R'] as const) world.abilities.get(actor)!.slots[slot].rank = 1;
      learnEx(world, actor);
    }
    world.transform.get(caster)!.facing = { x: 1, z: 0 }; world.rebuildGrid();
    const events: any[] = [], frames: any[] = [];
    const snapshot = () => frames.push({ tick: world.tick, actors: actors.map(id => ({ id,
      position: structuredClone(world.transform.get(id)!.pos), hp: world.health.get(id)!.hp,
      mana: world.health.get(id)!.mana, override: structuredClone(world.nav.get(id)?.override ?? null) })) });
    const step = (count = 1) => { for (let n = 0; n < count; n++) { world.step(new Map()); events.push(...structuredClone(world.events)); snapshot(); } };
    const cast = (slot: any, target?: any, actor = caster) => {
      abilityInstanceFor(world.abilities.get(actor)!, slot)!.cooldownRemainingTicks = 0;
      const a = compiled.abilityDrafts[slot], start = world.events.length;
      const outcome = castAbility(world, actor, slot, target ?? (a.castType === 'self' ? { type: 'self' }
        : a.castType === 'ground' ? { type: 'point', point: { ...world.transform.get(foe)!.pos } } : { type: 'entity', entityId: foe }));
      events.push(...structuredClone(world.events.slice(start))); snapshot(); return outcome;
    };
    const hits = (slot: string) => events.filter(e => e.type === 'damage' && e.data.source === caster &&
      e.data.target === foe && String(e.data.origin).includes(compiled.abilityDrafts[slot].id));
    snapshot();
    try { const evidence = fn({ world, caster, foe, other, cast, step, hits, frames, events });
      return { name, seed, passed: true, evidence, frames, events }; }
    catch (e) { return { name, seed, passed: false, error: String(e), frames, events }; }
  });
}

export function effectNodes(effects: any[]): any[] {
  return effects.flatMap(e => [e, ...Object.entries(e).flatMap(([key, value]) =>
    ['effects', 'onHit', 'onLand', 'onConsumed', 'onMissing', 'perStrike', 'finisher', 'finalEffects'].includes(key) && Array.isArray(value) ? effectNodes(value) : [])]);
}
