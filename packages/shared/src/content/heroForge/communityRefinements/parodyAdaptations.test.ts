import { beforeAll, describe, expect, it } from 'vitest';
import { communityActionFixture } from '../../../../testkit/communityActionFixture';
import { registerSkeletonContent } from '../../../sim/content/skeleton';
import { hasStatus } from '../../../sim/effects/effectCommon';
import { Stat } from '../../../sim/stats/statTypes';
import { recomputeStats } from '../../../sim/stats/statPipeline';
import type { StatusId } from '../../../ids';
import type { CastableSlot, CastTarget } from '../../../sim/intents';
import { evaluateCombo, loadBaseline } from '../../../../../../tools/community-hero-forge/parody/sim-harness.mjs';

beforeAll(registerSkeletonContent);
describe('GH#1132 local parody adaptations preserve cores and apply real costs', () => {
  it.each([
    ['01', 'W', 'slow25'], ['02', 'W', 'slow25'], ['03', 'EX', 'slow20'],
    ['04', 'R', 'root'], ['21', 'EX', 'magic-break'], ['24', 'EX', 'numbness'],
    ['26', 'R', 'root'], ['28', 'W', 'slow30'],
  ] as const)('%s %s applies its own finite %s cost', (number, slot, status) => {
    const r = communityActionFixture(number); r.place(r.ally, -1);
    if (number === '24') r.step(100); // Earn real idle electricity.
    if (number === '26') { // Observe an actual enemy attack to earn target-scoped clues.
      r.world.damageQueue.push({ source: r.enemy, target: r.caster, amount: 100, type: 'physical', crit: false, origin: 'basic' }); r.step();
    }
    const ability = r.compiled.abilityDrafts[slot];
    const target: CastTarget = ability.castType === 'self' ? { type: 'self' }
      : { type: 'entity', entityId: ability.targetsEnemies === false ? r.ally : r.enemy };
    expect(hasStatus(r.world, r.caster, status as StatusId, r.caster)).toBe(false);
    expect(r.cast(slot as CastableSlot, target, Math.ceil(((ability.castTimeSec ?? 0) + .1) / r.world.dt))).toBe('ok');
    expect(hasStatus(r.world, r.caster, status as StatusId, r.caster)).toBe(true);
    expect(hasStatus(r.world, r.ally, status as StatusId, r.caster)).toBe(false);
    r.step(Math.ceil(5 / r.world.dt)); expect(hasStatus(r.world, r.caster, status as StatusId, r.caster)).toBe(false);
  });
  it('Misaka W causes E to restore health, with matched ablated and unprepared controls', () => {
    const r = communityActionFixture('20'), { baseline } = loadBaseline();
    const result = evaluateCombo(r.compiled, { source: 'W', target: 'E', metric: { actor: 'caster', field: 'hp' }, expect: 'increase', waitSec: .8, observeSec: 1.2, remove: { slot: 'E', kind: 'heal', conditionalOnly: true } }, { baseline });
    expect(result.validationErrors).toEqual([]); expect(result.status, JSON.stringify(result.values)).toBe('passed');
  });
  it('Sakura leap moves the body without damage; sword trades ranged reach for AD and attack speed, then restores it', () => {
    const r = communityActionFixture('27'); const start = { ...r.world.transform.get(r.caster)!.pos };
    expect(r.cast('E', { type: 'point', point: { x: start.x + 3, z: start.z } }, 30)).toBe('ok');
    expect(r.world.transform.get(r.caster)!.pos.x).toBeGreaterThan(start.x + 2);
    expect(r.hits('E')).toHaveLength(0);
    recomputeStats(r.world, r.caster); const base = { ...r.world.stats.get(r.caster)!.final };
    expect(r.cast('R', { type: 'self' }, 6)).toBe('ok'); recomputeStats(r.world, r.caster);
    const sword = r.world.stats.get(r.caster)!.final;
    expect(sword[Stat.AttackRange]).toBeLessThan(base[Stat.AttackRange]);
    expect(sword[Stat.AttackDamage]).toBeGreaterThan(base[Stat.AttackDamage]);
    expect(sword[Stat.AttackSpeed]).toBeGreaterThan(base[Stat.AttackSpeed]);
    r.step(130); recomputeStats(r.world, r.caster); expect(r.world.stats.get(r.caster)!.final).toEqual(base);
  });
  it('Sunraku speed window lowers both defenses and recovers after the window', () => {
    const r = communityActionFixture('31'); const base = { ...r.world.stats.get(r.caster)!.final };
    expect(r.cast('R', { type: 'self' }, 10)).toBe('ok'); recomputeStats(r.world, r.caster);
    const stats = r.world.stats.get(r.caster)!.final;
    expect(stats[Stat.Armor]).toBeLessThan(base[Stat.Armor]); expect(stats[Stat.MagicResist]).toBeLessThan(base[Stat.MagicResist]);
    r.step(100); recomputeStats(r.world, r.caster);
    expect(r.world.stats.get(r.caster)!.final[Stat.Armor]).toBe(base[Stat.Armor]);
    expect(r.world.stats.get(r.caster)!.final[Stat.MagicResist]).toBe(base[Stat.MagicResist]);
  });
});
