/** Hand-authored development fixtures from complete source-review-v1 texts.
 * Not independently approved Gold, not training data, never supplied to model.
 * Values absent from sources are explicit preview proposals, not accuracy labels.
 */
import fs from 'node:fs';
import { REVIEWS } from './review-seeds-v1.mjs';
import { SLOTS } from './intake.mjs';
export const SELECTED = ['community7-warwick', 'community7-leesin', 'community7-missfortune', 'community37-32'];
export const sources = JSON.parse(fs.readFileSync(new URL('./source-review-v1/model-inputs.json', import.meta.url), 'utf8'));
export function makeFixture(source: any) {
  const original = Object.fromEntries(source.slots.map((s: any) => [s.slot, s.originalText]));
  const A = (slot: string, op: string, fields: any) => ({ op, evidence: original[slot], ...fields });
  const hit = (slot: string, damageType: string | null = null, tier: string | null = null) => A(slot, 'damage', { damageType, tier });
  const ir: any = { schema: 'hero-semantic-ir@1', hero: { origin: '法鬥', originBasis: 'proposal',
    identitySummary: REVIEWS[source.id].identity.join('；'), identityEvidence: REVIEWS[source.id].identity }, relations: [],
    slots: Object.fromEntries(SLOTS.map((slot: string) => [slot, { delivery: slot === 'PASSIVE' ? 'passive' : 'targeted',
      rangeTier: null, windup: null, actions: [], cost: null, sourceEvidence: [original[slot]], mechanismGaps: [], tuningNotes: [], vfxRecommendation: null }])) };
  const set = (slot: string, delivery: string, actions: any[], extra = {}) => Object.assign(ir.slots[slot], { delivery, actions, ...extra });
  const attack = (type: string, targetHpBelow: number | null = null) => A('PASSIVE', 'attack_proc', { damageType: type, tier: '極小', cooldown: 2, targetHpBelow });
  const buff = (slot: string) => A(slot, 'buff_self', { duration: 3, moveSpeedTier: '極小', attackSpeedPct: 0.2 });
  const shield = (slot: string, stacking = 'keep_larger') => A(slot, 'shield_self', { duration: 3, amount: null, absorbs: 'all', stacking });
  if (source.id === 'community7-warwick') {
    Object.assign(ir.hero, { origin: '狂戰', originBasis: 'source' });
    set('PASSIVE', 'passive', [attack('magic', 0.35)]);
    set('Q', 'targeted', [A('Q', 'dot', { damageType: null, tier: null, duration: 3, interval: 1 }), A('Q', 'heal_self', { amount: null })]);
    set('W', 'self', [buff('W')]);
    set('E', 'targeted', [hit('E'), A('E', 'control', { control: 'fear', duration: 0.8, slowPct: null })], { rangeTier: '極小' });
    set('R', 'targeted', [A('R', 'combo', { damageType: null, tier: null, strikes: null, duration: 0.9,
      lock: 'root', casterGuard: 'none', finisherTier: null })]);
    set('EX', 'self', [shield('EX')]);
  } else if (source.id === 'community7-leesin') {
    Object.assign(ir.hero, { origin: '鬥士', originBasis: 'source' });
    ir.relations.push({ from: 'Q', to: 'EX', kind: 'independent', evidence: '聲波與追擊分為 Q／EX，無二段重施放' });
    set('PASSIVE', 'passive', [attack('physical')]);
    set('Q', 'targeted', [hit('Q')], { rangeTier: '中' });
    set('W', 'self', [shield('W', 'replace'), A('W', 'buff_self', { duration: 3, moveSpeedTier: null, attackSpeedPct: 0.2 })]);
    set('E', 'ground', [hit('E', 'physical', '小')], { rangeTier: '極小' });
    set('R', 'ground', [A('R', 'leap', { damageType: null, tier: null, apexHeight: 0, duration: null,
      distance: 2, landRadius: null, pushOnLand: { distance: null, direction: 'facing', subtractGap: true } })],
      { tuningNotes: ['2 GGD 進身距離是測試提案；擊退方向與落地時序是機制要求。'] });
    set('EX', 'ground', [A('EX', 'leap', { damageType: null, tier: null, apexHeight: 1, duration: null,
      distance: null, landRadius: null, pushOnLand: null })], { tuningNotes: ['跳躍高度 1 為測試提案，不是來源固定值。'] });
  } else if (source.id === 'community7-missfortune') {
    Object.assign(ir.hero, { origin: '射手', originBasis: 'source' });
    set('PASSIVE', 'passive', [attack('physical')]);
    set('Q', 'targeted', [hit('Q', 'physical'), A('Q', 'chain', { damageType: 'physical', tier: null, totalTargets: 2, decay: 1, jumpRange: null })]);
    set('W', 'self', [buff('W')]);
    set('E', 'ground', [A('E', 'area_pulses', { damageType: 'magic', tier: '極小', count: 3, interval: 1,
      firstDelay: 1, radiusTier: '小', anchor: 'point' })], { tuningNotes: ['半徑級距為測試提案；每秒極小級傷害是來源要求。'] });
    set('R', 'ground', [A('R', 'barrage', { damageType: 'physical', tier: null, count: 6, interval: null, scatterRadius: null, hitRadius: null })]);
    set('EX', 'self', [shield('EX', 'replace')]);
  } else if (source.id === 'community37-32') {
    const mod = (slot: string, key: string, percent: number, duration: number) => A(slot, 'output_modifier', { key, percent, duration, ownership: 'same_caster' });
    ir.relations.push({ from: 'PASSIVE', to: 'EX', kind: 'resource', evidence: '消耗三層負面能量' },
      { from: 'R', to: 'EX', kind: 'conditional', evidence: '已處於「萎靡」的目標移除原詛咒，改獲短暫的有限輸出增益' });
    set('PASSIVE', 'passive', [A('PASSIVE', 'resource', { key: 'energy', initial: 0, max: 3, reset: 'round', gain: 'valid_skill_damage_once_per_cast', amount: 1 })]);
    set('Q', 'targeted', [hit('Q', 'physical', '小'), A('Q', 'knockback', { distance: 0.4, direction: 'caster', subtractGap: false })], { rangeTier: '極小', windup: 0.2 });
    set('W', 'ground', [A('W', 'area_pulses', { damageType: 'magic', tier: '極小', count: 3, interval: 0.45,
      firstDelay: 0.05, radiusTier: '小', anchor: 'point' })], { windup: 0.1 });
    set('E', 'self', [A('E', 'counter_window', { damageType: 'physical', tier: '小', duration: null, eligible: 'nearby_attack', maxTriggers: 1, radius: null, facingArc: null })]);
    set('R', 'targeted', [A('R', 'spend_health', { maxHpPct: 0.03, minimumHp: 1 }),
      A('R', 'projectile', { onHit: [hit('R', 'magic', '小'), mod('R', 'curse', -0.15, 4)] })], { windup: 0.8 });
    set('EX', 'targeted', [A('EX', 'status_branch', { key: 'curse', ownership: 'same_caster', consume: true,
      present: [mod('EX', 'boon', 0.1, 2)], missing: [hit('EX', 'magic', '小'), mod('EX', 'excurse', -0.2, 2)] })],
      { cost: { key: 'energy', count: 3 } });
  } else throw new Error('NO_REVIEWED_FIXTURE');
  return ir;
}
export const fixtures = SELECTED.map(id => { const source = sources.find((s: any) => s.id === id); return { id, source, ir: makeFixture(source),
  author: 'manual-development-source-review', trainingAdmitted: false, completeSemanticGold: false, releaseQualified: false }; });
