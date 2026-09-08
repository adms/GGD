/** Research-only semantic IR. No hero-name dispatch, engine writes or automatic acceptance. */
import { z } from '../../GGD-community-hero-forge/packages/shared/node_modules/zod/index.js';
import { SLOTS } from './intake.mjs';

const obj = (shape: any) => z.object(shape).strict();
const enumOf = (values: string[]) => z.enum(values as [string, ...string[]]);
export const TIERS = ['極小', '小', '中', '大', '極大'];
export const ORIGINS = ['坦克', '砲手', '鬥士', '射手', '法鬥', '法師', '狂戰', '硬輔', '法刺', '軟輔'];
const tier = enumOf(TIERS), damageType = enumOf(['physical', 'magic', 'true']);
const number = (min: number, max: number) => z.number().finite().min(min).max(max);
const seconds = number(1 / 30, 60), key = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/);
const quote = z.string().min(2).max(1000), text = z.string().min(1).max(2000);
const damage = { damageType: damageType.nullable(), tier: tier.nullable() };
const push = obj({ distance: number(0.1, 10).nullable(), direction: enumOf(['caster', 'facing']), subtractGap: z.boolean() });
const action = (op: string, fields: any) => obj({ op: z.literal(op), evidence: quote, ...fields });
export const ACTIONS: Record<string, any> = {
  attack_proc: action('attack_proc', { ...damage, cooldown: number(0, 300),
    targetHpBelow: number(0.001, 1).nullable() }),
  damage: action('damage', damage),
  dot: action('dot', { ...damage, duration: seconds, interval: seconds }),
  heal_self: action('heal_self', { amount: number(1, 10000).nullable() }),
  shield_self: action('shield_self', { duration: seconds, amount: number(1, 10000).nullable(),
    absorbs: enumOf(['all', 'physical', 'magic']), stacking: enumOf(['keep_larger', 'replace']) }),
  buff_self: action('buff_self', { duration: seconds, moveSpeedTier: tier.nullable(), attackSpeedPct: number(0.01, 1).nullable() }),
  control: action('control', { control: enumOf(['root', 'stun', 'fear', 'slow']), duration: seconds, slowPct: number(0.01, 0.9).nullable() }),
  knockback: action('knockback', { ...push.shape }),
  area_pulses: action('area_pulses', { ...damage, count: number(1, 30).int(), interval: seconds,
    firstDelay: seconds.nullable(), radiusTier: tier, anchor: enumOf(['point', 'caster']) }),
  barrage: action('barrage', { ...damage, count: number(1, 30).int(), interval: seconds.nullable(),
    scatterRadius: number(0.1, 10).nullable(), hitRadius: number(0.1, 10).nullable() }),
  chain: action('chain', { ...damage, totalTargets: number(1, 24).int(), decay: number(0.01, 1), jumpRange: number(0.1, 20).nullable() }),
  combo: action('combo', { ...damage, strikes: number(1, 20).int().nullable(), duration: number(0.1, 10),
    lock: enumOf(['root', 'stun', 'none']), casterGuard: enumOf(['none', 'all', 'magic']), finisherTier: tier.nullable() }),
  leap: action('leap', { ...damage, apexHeight: number(0, 5).nullable(), duration: number(0.1, 3).nullable(),
    distance: number(0.1, 10).nullable(), landRadius: number(0.1, 10).nullable(), pushOnLand: push.nullable() }),
  resource: action('resource', { key, initial: number(0, 20).int(), max: number(1, 20).int(), reset: enumOf(['round']),
    gain: enumOf(['valid_skill_damage_once_per_cast']), amount: number(1, 20).int() }),
  output_modifier: action('output_modifier', { key, duration: seconds, percent: number(-0.9, 0.9), ownership: z.literal('same_caster') }),
  spend_health: action('spend_health', { maxHpPct: number(0.001, 0.5), minimumHp: number(1, 1000).int() }),
  counter_window: action('counter_window', { ...damage, duration: number(0.1, 3).nullable(),
    eligible: enumOf(['basic_only', 'nearby_attack']), maxTriggers: z.literal(1),
    radius: number(0.1, 5).nullable(), facingArc: number(1, 360).nullable() }),
};
const children = z.array(z.lazy(() => zAction)).min(1).max(12);
ACTIONS.projectile = action('projectile', { onHit: children });
ACTIONS.status_branch = action('status_branch', { key, ownership: enumOf(['same_caster', 'any_caster']),
  consume: z.literal(true), present: children, missing: children });
export const zAction: any = z.lazy(() => z.discriminatedUnion('op', Object.values(ACTIONS) as any));
const cost = obj({ key, count: number(1, 20).int() });
export const zSlot = obj({ delivery: enumOf(['passive', 'self', 'targeted', 'ground']),
  rangeTier: tier.nullable(), windup: number(0, 10).nullable(), actions: z.array(zAction).max(16),
  cost: cost.nullable(), sourceEvidence: z.array(quote).min(1).max(20),
  mechanismGaps: z.array(text).max(12), tuningNotes: z.array(text).max(12),
  vfxRecommendation: z.string().min(1).max(160).nullable() });
export const zIR = obj({ schema: z.literal('hero-semantic-ir@1'),
  hero: obj({ origin: enumOf(ORIGINS), originBasis: enumOf(['source', 'proposal']), identitySummary: text,
    identityEvidence: z.array(quote).min(1).max(20) }),
  relations: z.array(obj({ from: enumOf(SLOTS), to: enumOf(SLOTS),
    kind: enumOf(['independent', 'resource', 'conditional']), evidence: quote })).max(20),
  slots: obj(Object.fromEntries(SLOTS.map((s: string) => [s, zSlot]))) });

export function walkActions(actions: any[], fn: (action: any, depth: number) => void, depth = 0) {
  if (depth > 4) throw new Error('IR_DEPTH');
  for (const a of actions) {
    fn(a, depth);
    for (const field of ['onHit', 'present', 'missing']) if (a[field]) walkActions(a[field], fn, depth + 1);
  }
}

export function validateIR(input: unknown, source: any) {
  // Bound before lazy schema recursion, including direct non-JSON callers.
  let count = 0;
  const structuralWalk = (v: any, depth = 0) => {
    if (depth > 24 || ++count > 10000) throw new Error('IR_SIZE_DEPTH');
    if (v && typeof v === 'object') for (const child of Object.values(v)) structuralWalk(child, depth + 1);
  };
  structuralWalk(input);
  const ir = zIR.parse(input);
  const sourceSlots = Object.fromEntries(source.slots.map((s: any) => [s.slot, s.originalText]));
  const supplements = (source.supplements ?? source.sources?.filter((s: any) => s.id !== 'hero-original') ?? []).map((s: any) => s.text).join('\n');
  const allText = source.hero.originalText + '\n' + supplements;
  const checkQuote = (q: string, original: string) => { if (!original.includes(q)) throw new Error(`UNANCHORED_EVIDENCE:${q}`); };
  for (const q of ir.hero.identityEvidence) checkQuote(q, allText);
  if (ir.hero.originBasis === 'source' && !allText.includes(`出身：${ir.hero.origin}`)) throw new Error('UNSOURCED_ORIGIN');
  const declared = new Map<string, { slot: string; action: any }>(), resources = new Map<string, any>();
  const gaps: { slot: string; reason: string }[] = [];
  for (const slot of SLOTS) {
    const s = ir.slots[slot];
    for (const q of s.sourceEvidence) checkQuote(q, sourceSlots[slot]);
    if ((slot === 'PASSIVE') !== (s.delivery === 'passive')) throw new Error('PASSIVE_DELIVERY');
    if (!s.actions.length && !s.mechanismGaps.length) throw new Error('EMPTY_SLOT_UNDECLARED');
    if (slot === 'PASSIVE' && s.cost) throw new Error('PASSIVE_COST');
    for (const g of s.mechanismGaps) gaps.push({ slot, reason: g });
    walkActions(s.actions, (a, depth) => {
      checkQuote(a.evidence, sourceSlots[slot] + '\n' + supplements);
      const passive = ['resource', 'attack_proc'].includes(a.op);
      if (passive !== (s.delivery === 'passive') || (passive && depth)) throw new Error('ACTION_DELIVERY');
      if (depth && ['spend_health', 'counter_window', 'area_pulses', 'barrage', 'leap', 'combo'].includes(a.op)) throw new Error('ACTION_CONTEXT');
      if (['heal_self', 'shield_self', 'buff_self', 'counter_window'].includes(a.op) && s.delivery !== 'self' && a.op !== 'heal_self') throw new Error('SELF_DELIVERY_REQUIRED');
      if (['control', 'dot', 'chain', 'combo', 'knockback', 'status_branch', 'projectile', 'output_modifier'].includes(a.op) && s.delivery !== 'targeted') throw new Error('TARGETED_DELIVERY_REQUIRED');
      if (['leap', 'barrage'].includes(a.op) && s.delivery !== 'ground') throw new Error('GROUND_DELIVERY_REQUIRED');
      if (a.op === 'area_pulses' && s.delivery !== (a.anchor === 'caster' ? 'self' : 'ground')) throw new Error('PULSE_DELIVERY');
      if (a.op === 'dot' && (a.duration < a.interval || Math.abs(a.duration / a.interval - Math.round(a.duration / a.interval)) > 1e-8)) throw new Error('DOT_TICK_BUDGET');
      if (a.op === 'buff_self' && a.moveSpeedTier === null && a.attackSpeedPct === null) throw new Error('EMPTY_BUFF');
      if (a.op === 'control' && (a.control === 'slow') !== (a.slowPct !== null)) throw new Error('CONTROL_MAGNITUDE');
      if (a.op === 'resource') {
        if (a.initial > a.max || a.amount > a.max || resources.has(a.key)) throw new Error('RESOURCE_DECLARATION');
        resources.set(a.key, a);
      }
      if (['resource', 'output_modifier'].includes(a.op)) {
        if (declared.has(a.key)) throw new Error('DUPLICATE_SYMBOL');
        declared.set(a.key, { slot, action: a });
      }
      if (a.op === 'output_modifier' && a.percent === 0) throw new Error('ZERO_OUTPUT_MODIFIER');
      if (a.op === 'counter_window' && a.eligible === 'nearby_attack') gaps.push({ slot, reason: '近身技能分類尚未驗證；目前只能產生 basic_only 的明示預覽，不是完整反擊。' });
    });
  }
  for (const slot of SLOTS) {
    const s = ir.slots[slot];
    if (s.cost && (!resources.has(s.cost.key) || resources.get(s.cost.key).max < s.cost.count)) throw new Error('UNDECLARED_OR_IMPOSSIBLE_COST');
    walkActions(s.actions, a => {
      if (a.op === 'status_branch' && (declared.get(a.key)?.action.op !== 'output_modifier' || declared.get(a.key)?.slot === slot)) throw new Error('UNDECLARED_BRANCH_STATUS');
    });
    const dependencies: { from: string; kind: string }[] = [];
    if (s.cost) dependencies.push({ from: declared.get(s.cost.key)!.slot, kind: 'resource' });
    walkActions(s.actions, a => { if (a.op === 'status_branch') dependencies.push({ from: declared.get(a.key)!.slot, kind: 'conditional' }); });
    for (const d of dependencies) if (!ir.relations.some((r: any) => r.from === d.from && r.to === slot && r.kind === d.kind)) throw new Error('UNDECLARED_RELATION');
    for (const r of ir.relations) if (r.to === slot && r.kind === 'independent' && dependencies.some(d => d.from === r.from)) throw new Error('INDEPENDENCE_CONTRADICTION');
  }
  for (const r of ir.relations) { checkQuote(r.evidence, allText); if (r.from === r.to) throw new Error('SELF_RELATION'); }
  return { ir, gaps, completeMechanismClaim: gaps.length === 0, semanticQualified: false, releaseQualified: false };
}

// Compact typed contract for the model; generated from the same strict validators.
// Zod v3 internals are deliberately pinned by the engine snapshot/package lock.
function describe(s: any): any {
  const d = s._def;
  if (d.typeName === 'ZodNullable') return { type: describe(d.innerType), nullable: true };
  if (d.typeName === 'ZodString') return d.checks?.some((c: any) => c.kind === 'regex') ? 'ASCII symbol [a-z][a-z0-9_-]{0,31}' : 'string';
  if (d.typeName === 'ZodNumber') return `number ${JSON.stringify(d.checks)}`;
  if (d.typeName === 'ZodBoolean') return 'boolean';
  if (d.typeName === 'ZodEnum') return d.values.join(' | ');
  if (d.typeName === 'ZodLiteral') return JSON.stringify(d.value);
  if (d.typeName === 'ZodArray') return 'array of semantic actions (same catalog, max depth 4)';
  if (d.typeName === 'ZodObject') return Object.fromEntries(Object.entries(d.shape()).map(([k, v]) => [k, describe(v)]));
  throw new Error(`UNSUPPORTED_SCHEMA_DESCRIPTION:${d.typeName}`);
}
export const actionCatalog = () => Object.fromEntries(Object.entries(ACTIONS).map(([op, s]) => [op, describe(s)]));
