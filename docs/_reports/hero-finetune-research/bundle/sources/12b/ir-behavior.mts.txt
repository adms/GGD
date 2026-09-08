/** Shared pre-inference development probes. This is NOT complete hero qualification. */
import assert from 'node:assert/strict';
import { createHeroSimulationBaseline } from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/simulationBaseline.ts';
import { extendRegistryContext, withRegistryContext } from '../../GGD-community-hero-forge/packages/shared/src/sim/content/registryContext.ts';
import { Abilities, registerChampion } from '../../GGD-community-hero-forge/packages/shared/src/sim/content/registry.ts';
import { SimWorld } from '../../GGD-community-hero-forge/packages/shared/src/sim/SimWorld.ts';
import { spawnChampion } from '../../GGD-community-hero-forge/packages/shared/src/sim/spawnChampion.ts';
import { asSeatId, asTeamId } from '../../GGD-community-hero-forge/packages/shared/src/ids.ts';
import { normalizeCombatEnv } from '../../GGD-community-hero-forge/packages/shared/src/sim/combatEnv.ts';
import { castAbility, learnEx } from '../../GGD-community-hero-forge/packages/shared/src/sim/abilities/abilitySystem.ts';
import { abilityInstanceFor } from '../../GGD-community-hero-forge/packages/shared/src/sim/abilities/innateActive.ts';
import { adjustMarkCount } from '../../GGD-community-hero-forge/packages/shared/src/sim/marks.ts';
import { attachSource, recomputeStats } from '../../GGD-community-hero-forge/packages/shared/src/sim/stats/statPipeline.ts';
import { Stat } from '../../GGD-community-hero-forge/packages/shared/src/sim/stats/statTypes.ts';
import { ModOp } from '../../GGD-community-hero-forge/packages/shared/src/sim/stats/modifiers.ts';
import { hasStatus } from '../../GGD-community-hero-forge/packages/shared/src/sim/effects/effectCommon.ts';
import { clearPools } from '../../GGD-community-hero-forge/packages/shared/src/sim/clearPools.ts';

export function runIRProbes(compiled: any, id: string, catalog: any) {
  const baseline = createHeroSimulationBaseline(catalog.documents), result: any[] = [];
  const context = extendRegistryContext(baseline.context, `ir-probe-${id}`, () => {
    for (const a of Object.values(compiled.abilityDrafts) as any[]) Abilities.register(a.id, a);
    registerChampion(compiled.champion, { overrideAbilities: true });
  });
  function probe(name: string, fn: (r: any) => any) {
    withRegistryContext(context, () => {
      const world = new SimWorld(baseline.arena, 20260908); Object.assign(world, structuredClone(baseline.rules));
      world.ultGateOverride = true; world.combatActive = true;
      world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
      world.combatFeel = { ...world.combatFeel, autoEngage: { ...world.combatFeel.autoEngage, enabled: false } };
      const c = baseline.arena.zones[0]!.center;
      const [caster, foe, other] = [0, 1, 2].map(seat => spawnChampion(world, { zone: 0, championId: compiled.champion.id,
        seatId: asSeatId(seat), teamId: asTeamId(seat === 1 ? 1 : 0), pos: { x: c.x + seat, z: c.z + 10 + (seat === 2 ? 5 : 0) }, level: 18 }));
      for (const actor of [caster, foe, other]) {
        world.nav.get(actor)!.order = { kind: 'hold' };
        attachSource(world, actor, { id: 'fixture-no-regen', kind: 'item', modifiers: [
          { stat: Stat.HealthRegen, op: ModOp.Flat, value: -10000 }, { stat: Stat.AbilityPower, op: ModOp.Flat, value: 100 },
          { stat: Stat.MaxHealth, op: ModOp.Flat, value: 100000 }, { stat: Stat.MaxMana, op: ModOp.Flat, value: 10000 }] });
        recomputeStats(world, actor);
        const health = world.health.get(actor)!; health.hp = health.maxHp; health.mana = health.maxMana;
        for (const slot of ['Q', 'W', 'E', 'R'] as const) world.abilities.get(actor)!.slots[slot].rank = 1;
        learnEx(world, actor);
      }
      world.transform.get(caster)!.facing = { x: 1, z: 0 }; world.rebuildGrid();
      const events: any[] = [];
      const step = (n = 1, intent = new Map()) => { for (let i = 0; i < n; i++) { world.step(intent); events.push(...structuredClone(world.events)); } };
      const cast = (slot: any, actor = caster) => {
        abilityInstanceFor(world.abilities.get(actor)!, slot)!.cooldownRemainingTicks = 0;
        const a = compiled.abilityDrafts[slot], start = world.events.length;
        const outcome = castAbility(world, actor, slot, a.castType === 'self' ? { type: 'self' }
          : a.castType === 'ground' ? { type: 'point', point: { ...world.transform.get(foe)!.pos } } : { type: 'entity', entityId: foe });
        events.push(...structuredClone(world.events.slice(start))); return outcome;
      };
      const hp = (actor = foe) => world.health.get(actor)!.hp;
      const stat = (key: string, actor = foe) => { recomputeStats(world, actor); return (world.stats.get(actor)!.final as any)[key]; };
      const moveFoe = (x: number) => { world.transform.get(foe)!.pos = { x: c.x + x, z: c.z + 10 }; world.rebuildGrid(); };
      const hits = (slot: string) => events.filter(e => e.type === 'damage' && e.data.source === caster && e.data.target === foe && String(e.data.origin).includes(compiled.abilityDrafts[slot].id));
      try { const evidence = fn({ world, caster, foe, other, step, cast, hp, stat, moveFoe, hits, events });
        result.push({ name, passed: true, evidence, events }); }
      catch (error) { result.push({ name, passed: false, error: String(error), events }); }
    });
  }
  if (id !== 'community37-32') {
    const percents = id === 'community7-warwick' ? [0.25, 0.35, 1] : [1];
    for (const pct of percents) probe(`passive-health-${pct}-and-ICD`, r => {
      for (let i = 0; i < 240; i++) {
        r.world.health.get(r.foe).hp = r.world.health.get(r.foe).maxHp * pct; // coherent pipeline maxima, fixed pre-attack boundary
        r.step(1, new Map([[asSeatId(0), { commands: [], order: { kind: 'attackTarget', entity: r.foe } }]]));
      }
      const h = r.hits('PASSIVE');
      if (id === 'community7-warwick' && pct >= 0.35) assert.equal(h.length, 0, 'HP_THRESHOLD');
      else { assert(h.length >= 2, 'NO_PROC'); for (let i = 1; i < h.length; i++) assert(h[i].tick - h[i - 1].tick >= 60, 'ICD'); }
      return { damageEvents: h.length, ticks: h.map((e: any) => e.tick) };
    });
  }
  if (id === 'community7-warwick') {
    probe('Q-immediate-heal-no-immediate-damage-three-DOT-pulses', r => {
      r.world.health.get(r.caster).hp = r.world.health.get(r.caster).maxHp * 0.5; const before = r.hp(r.caster); assert.equal(r.cast('Q'), 'ok');
      r.step(1); assert(r.hp(r.caster) > before, 'MISSING_IMMEDIATE_HEAL'); assert.equal(r.hits('Q').length, 0, 'EXTRA_IMMEDIATE_DAMAGE');
      r.step(100); assert.equal(r.hits('Q').length, 3, 'DOT_COUNT'); return { heal: r.hp(r.caster) - before, pulses: r.hits('Q').length };
    });
    probe('R-no-caster-invulnerability', r => { assert.equal(r.cast('R'), 'ok'); r.step(1);
      assert.equal(r.world.invulnerable.has(r.caster), false); const h = r.hp(r.caster);
      r.world.damageQueue.push({ source: r.foe, target: r.caster, amount: 100, type: 'true', crit: false, origin: 'basic' });
      r.step(1); assert(r.hp(r.caster) < h); return { damageTaken: h - r.hp(r.caster) }; });
  }
  if (id === 'community7-missfortune') {
    for (const slot of ['E', 'R']) for (const movement of ['stay', 'leave', 'enter']) probe(`${slot}-spatial-${movement}`, r => {
      if (movement === 'enter') r.moveFoe(16);
      // Cast at the original point, not the moved target; exact source requires fixed landing area.
      const ability = compiled.abilityDrafts[slot];
      const pos = { ...r.world.transform.get(r.caster).pos, x: r.world.transform.get(r.caster).pos.x + 1 };
      const start = r.world.events.length;
      assert.equal(castAbility(r.world, r.caster, slot as any, { type: 'point', point: pos }), 'ok');
      r.events.push(...structuredClone(r.world.events.slice(start)));
      const untilFirst = Math.ceil((ability.castTimeSec + (slot === 'E' ? 1.1 : 0.1)) / r.world.dt);
      r.step(untilFirst);
      if (movement !== 'stay') r.moveFoe(movement === 'leave' ? 16 : 1);
      r.step(120); const expected = movement === 'stay' ? (slot === 'E' ? 3 : 6) : movement === 'leave' ? 1 : slot === 'E' ? 2 : 5;
      assert.equal(r.hits(slot).length, expected, 'SPATIAL_PULSE_COUNT'); return { hits: r.hits(slot).length };
    });
  }
  if (id === 'community7-leesin') probe('EX-can-cast-without-Q-and-hit-on-landing', r => {
    const start = r.world.tick; assert.equal(r.cast('EX'), 'ok'); r.step(1); assert.equal(r.hits('EX').length, 0, 'EARLY_LAND_DAMAGE');
    r.step(90); assert(r.hits('EX').length > 0); assert(r.hits('EX')[0].tick > start); return { hitTicks: r.hits('EX').map((e: any) => e.tick) };
  });
  if (id === 'community37-32') {
    const cost = compiled.abilityDrafts.EX.statusCost, curse = compiled.abilityDrafts.EX.effects.find((e: any) => e.kind === 'consumeStatus')?.statusId;
    const mark = (r: any, actor = r.caster) => r.world.marks.get(actor)?.get(cost?.statusId)?.count;
    const fill = (r: any) => { assert(cost?.statusId, 'MISSING_COST'); adjustMarkCount(r.world, r.caster, cost.statusId, 3); };
    probe('resource-empty-EX-refusal', r => { assert.equal(r.cast('EX'), 'no-resource'); return { resource: mark(r) }; });
    probe('three-waves-grant-one-resource', r => { assert.equal(r.cast('W'), 'ok'); r.step(50);
      assert.equal(r.hits('W').length, 3); assert.equal(mark(r), 1); return { hits: 3, resource: mark(r) }; });
    for (const mode of ['same', 'other', 'clean', 'expired', 'cleansed']) probe(`EX-branch-${mode}`, r => {
      const ad = r.stat('ad');
      if (!['clean'].includes(mode)) { assert.equal(r.cast('R', mode === 'other' ? r.other : r.caster), 'ok'); r.step(50); }
      if (mode === 'expired') r.step(150);
      if (mode === 'cleansed') clearPools(r.world, r.foe, { pools: { buffs: true }, polarity: 'debuff', requireDispellable: true });
      const hp = r.hp(); fill(r); assert.equal(r.cast('EX'), 'ok'); r.step(2);
      // Ordinary EX damage can itself earn one fresh resource after spending 3. Reversal cannot.
      if (mode === 'same') { assert.equal(r.hp(), hp); assert(r.stat('ad') > ad); assert.equal(mark(r), 0); }
      else { assert(r.hp() < hp); assert(r.stat('ad') < ad); }
      if (mode === 'other') assert(hasStatus(r.world, r.foe, curse, r.other), 'FOREIGN_CURSE_REMOVED');
      return { damage: hp - r.hp(), adBefore: ad, adAfter: r.stat('ad'), resourceAfter: mark(r) };
    });
  }
  return { cases: result, passed: result.filter(r => r.passed).length, total: result.length,
    completeHeroCoverage: false, releaseQualified: false };
}
