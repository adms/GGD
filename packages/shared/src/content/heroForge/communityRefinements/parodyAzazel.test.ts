import { beforeAll, describe, expect, it } from 'vitest';
import { communityActionFixture } from '../../../../testkit/communityActionFixture';
import { registerSkeletonContent } from '../../../sim/content/skeleton';
import { resolveAbilityRadius } from '../../../sim/abilities/abilitySystem';
import { abilityInstanceFor } from '../../../sim/abilities/innateActive';
import { adjustMarkCount } from '../../../sim/marks';
import { hasStatus } from '../../../sim/effects/effectCommon';
import { runEffects } from '../../../sim/effects/effectRunner';
import { clearPools } from '../../../sim/clearPools';
import { Stat } from '../../../sim/stats/statTypes';
import { recomputeStats } from '../../../sim/stats/statPipeline';
import { tauntedBy } from '../../../sim/taunt';
import type { EntityId, StatusId } from '../../../ids';
import { compileHeroPackageProject, type HeroPackageReplay } from '../../import/heroPackage';
import { worldCombatRules } from '../../worldCombatRules';
import previous from '../../../../../../tools/community-hero-forge/parody/baseline-refinements.json';

beforeAll(registerSkeletonContent);
function setup() {
  const r = communityActionFixture('32');
  // The final-zero authoring values are compiled for the shipped operator rules,
  // not this fixture's default neutral environment.
  const rules = worldCombatRules([...r.source.catalog.documents].filter(([key]) => key.startsWith('config/')).map(([, doc]) => doc));
  r.world.combatEnv = rules.combatEnv; r.world.baseBonus = rules.baseBonus;
  r.world.perLevelBonus = rules.perLevelBonus; r.world.statCaps = rules.statCaps;
  for (const id of [r.caster, r.enemy, r.ally, r.distant]) recomputeStats(r.world, id);
  const point = () => ({ type: 'point' as const, point: { ...r.world.transform.get(r.caster)!.pos } });
  const status = (suffix: string, id = r.enemy, by = r.caster) => hasStatus(r.world, id, `${r.project.projectId}.${suffix}` as StatusId, by);
  const stats = (id = r.enemy) => { recomputeStats(r.world, id); return { ...r.world.stats.get(id)!.final }; };
  const seconds = (n: number) => r.step(Math.ceil(n / r.world.dt));
  // Only boundary cases seed energy. The full two-stage timeline earns it from three real casts.
  const seed = (who = r.caster, n = 3) => adjustMarkCount(r.world, who, `${r.project.projectId}.negative-energy` as StatusId, n);
  const rCast = (who = r.caster) => r.cast('R', point(), Math.ceil(1 / r.world.dt), who);
  const exCast = (who = r.caster) => r.cast('EX', point(), Math.ceil(.2 / r.world.dt), who);
  const setEnemy = (id: EntityId, distance: number) => { r.world.team.get(id)!.teamId = r.world.team.get(r.enemy)!.teamId; r.place(id, distance); };
  return { ...r, point, status, stats, seconds, seed, rCast, exCast, setEnemy };
}

describe('GH#1132 Azazel approved largest-area reversal and sage-time', () => {
  it('keeps the tested v1 passive, punch, rain and counter payloads for rollback comparison', () => {
    const r = setup(), old = communityActionFixture('32', 1, previous.refinements['32']);
    for (const slot of ['PASSIVE', 'Q', 'W', 'E'] as const) {
      const current = r.compiled.abilityDrafts[slot], before = old.compiled.abilityDrafts[slot];
      for (const key of ['effects', 'passive', 'statusCost', 'castType', 'castTimeSec', 'range', 'radius', 'cooldown', 'manaCost'] as const) expect(current[key]).toEqual(before[key]);
    }
  });
  it('earns Q/W/R energy, boosts and taunts both enemies, then removes defenses and restores all stats', () => {
    const r = setup(); r.place(r.enemy, 1.3); r.setEnemy(r.distant, 8); r.place(r.ally, -2);
    const base = r.stats(), farBase = r.stats(r.distant), friendly = r.stats(r.ally);
    expect(r.cast('Q', { type: 'entity', entityId: r.enemy }, 12)).toBe('ok');
    expect(r.cast('W', { type: 'point', point: { ...r.world.transform.get(r.enemy)!.pos } }, 40)).toBe('ok');
    expect(r.count('negative-energy')).toBe(2);
    const hp = r.world.health.get(r.caster)!.hp;
    expect(r.rCast()).toBe('ok'); expect(r.count('negative-energy')).toBe(3);
    // HP payment is once per cast, independent of the number of targets.
    expect(hp - r.world.health.get(r.caster)!.hp).toBe(r.world.health.get(r.caster)!.maxHp * .03);
    for (const id of [r.enemy, r.distant]) expect(r.status('r.curse', id)).toBe(true);
    expect(r.status('r.curse', r.ally)).toBe(false);
    expect(r.exCast()).toBe('ok'); expect(r.count('negative-energy')).toBe(0);
    expect(r.hits('EX')).toHaveLength(0);
    for (const id of [r.enemy, r.distant]) {
      expect(r.status('r.curse', id)).toBe(false); expect(r.status('ex.boon', id)).toBe(true);
      expect(r.stats(id)[Stat.OutputDamagePct]).toBeCloseTo(.1); expect(tauntedBy(r.world, id)).toBe(r.caster);
      expect(r.status('ex.sage', id)).toBe(false);
    }
    expect(r.stats(r.ally)).toEqual(friendly); expect(tauntedBy(r.world, r.ally)).toBeNull();
    r.seconds(2);
    for (const [id, initial] of [[r.enemy, base], [r.distant, farBase]] as const) {
      const stats = r.stats(id); expect(r.status('ex.sage', id)).toBe(true);
      expect(stats[Stat.OutputDamagePct]).toBe(0);
      expect(stats[Stat.Armor]).toBe(0); expect(stats[Stat.MagicResist]).toBe(0);
      expect(stats[Stat.AttackSpeed]).toBeCloseTo(initial[Stat.AttackSpeed] * .4);
      expect(stats[Stat.MoveSpeed]).toBeCloseTo(initial[Stat.MoveSpeed] * .4);
      expect(tauntedBy(r.world, id)).toBeNull();
    }
    r.seconds(3.1); expect(r.stats()).toEqual(base); expect(r.stats(r.distant)).toEqual(farBase);
  });
  it('uses the shipped largest radius and excludes targets outside that circle or in another zone', () => {
    const r = setup(); const radius = resolveAbilityRadius(r.world, r.compiled.abilityDrafts.R.radius!);
    expect(radius).toBeGreaterThan(8); expect(r.compiled.abilityDrafts.R.radiusTier).toBe('極大');
    expect(r.compiled.abilityDrafts.EX.radius).toBe(r.compiled.abilityDrafts.R.radius);
    r.setEnemy(r.distant, radius + 1); r.rCast(); r.seed(); r.exCast();
    expect(r.status('r.curse', r.distant)).toBe(false); expect(tauntedBy(r.world, r.distant)).toBeNull();
    r.seconds(2); expect(r.status('ex.sage', r.distant)).toBe(false);
    const z = setup(); z.setEnemy(z.distant, 2); z.world.transform.get(z.distant)!.zone = 1;
    z.rCast(); z.seed(); z.exCast(); expect(tauntedBy(z.world, z.distant)).toBeNull(); expect(z.status('ex.boon', z.distant)).toBe(false);
  });
  it.each(['clean', 'expired', 'cleansed'] as const)('%s targets retain the ordinary EX branch, with taunt but no later sage debuff', mode => {
    const r = setup();
    if (mode !== 'clean') r.rCast();
    if (mode === 'expired') r.seconds(4.1);
    if (mode === 'cleansed') clearPools(r.world, r.enemy, { pools: { buffs: true }, polarity: 'debuff', requireDispellable: true });
    r.seed(); r.exCast(); expect(r.hits('EX')).toHaveLength(1); expect(r.stats()[Stat.OutputDamagePct]).toBeCloseTo(-.2);
    expect(tauntedBy(r.world, r.enemy)).toBe(r.caster); expect(r.status('ex.boon')).toBe(false);
    r.seconds(2.1); expect(r.status('ex.sage')).toBe(false); expect(r.stats()[Stat.OutputDamagePct]).toBe(0);
  });
  it('cannot reverse a different caster curse and does not delete that curse', () => {
    const r = setup(); r.place(r.ally, -1); r.rCast(r.ally); r.seed(); r.exCast();
    expect(r.status('r.curse', r.enemy, r.ally)).toBe(true); expect(r.status('ex.boon')).toBe(false);
    expect(r.hits('EX')).toHaveLength(1); r.seconds(2.1); expect(r.status('ex.sage')).toBe(false);
  });
  it('the scheduled consequence survives caster death; an enemy can dispel sage-time and regain defenses', () => {
    const r = setup(), base = r.stats(); r.rCast(); r.seed(); r.exCast();
    r.world.health.get(r.caster)!.alive = false; r.seconds(2);
    expect(r.status('ex.sage')).toBe(true); expect(r.stats()[Stat.Armor]).toBe(0);
    clearPools(r.world, r.enemy, { pools: { buffs: true }, polarity: 'debuff', requireDispellable: true });
    expect(r.stats()).toEqual(base);
  });
  it('uses existing auto-target taunt semantics separately from status-control immunity', () => {
    const r = setup(); r.rCast();
    runEffects([{ kind: 'invulnerable', durationSec: 3, blocksDamage: 'none', blocksControl: true }], {
      world: r.world, caster: r.enemy, targets: [r.enemy], rank: 1, origin: 'fixture', rng: r.world.rng,
    });
    r.seed(); r.exCast(); expect(tauntedBy(r.world, r.enemy)).toBe(r.caster); expect(r.status('ex.boon')).toBe(true);
    expect(r.world.tauntRules.overridesManualOrder).toBe(false);
  });
  it.each([0, 1, 2])('refuses %i energy without spending mana, cooldown or stacks', n => {
    const r = setup(); if (n) r.seed(r.caster, n);
    const mana = r.world.health.get(r.caster)!.mana;
    expect(r.exCast()).toBe('no-resource'); expect(r.count('negative-energy')).toBe(n);
    expect(r.world.health.get(r.caster)!.mana).toBe(mana);
    expect(abilityInstanceFor(r.world.abilities.get(r.caster)!, 'EX')!.cooldownRemainingTicks).toBe(0);
    expect(tauntedBy(r.world, r.enemy)).toBeNull();
  });
  it('the trusted importer accepts the current six-slot kit and keeps original descriptions separate', () => {
    const r = setup(), original = JSON.stringify(r.project);
    const result = compileHeroPackageProject(r.project, r.source.catalog);
    const replay = (result.scenarios as { replay: HeroPackageReplay }).replay;
    expect(replay.kit.status).toBe('accepted'); expect(replay.errors).toEqual([]);
    expect(replay.kit.rejectedSlots).toEqual([]); expect(JSON.stringify(r.project)).toBe(original);
    expect(r.project.sourceDesign).toEqual(r.source.project.sourceDesign);
    expect(r.project.acceptedPlan!.slots.EX.purpose).toContain('賢者時間');
  });
});
