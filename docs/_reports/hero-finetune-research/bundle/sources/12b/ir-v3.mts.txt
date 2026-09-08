/** Short serialization of the same IR2 mechanics. No missing mechanic is inferred. */
import assert from 'node:assert/strict';
import { z } from '../../GGD-community-hero-forge/packages/shared/node_modules/zod/index.js';
import { ACTIONS, ORIGINS } from './semantic-ir.mts';
import { validateIR2, compileIR2 } from './ir-v2.mts';
import { SLOTS } from './intake.mjs';

const object = (s: any) => z.object(s).strict();
const nullableOptional = (s: any) => s._def.typeName === 'ZodNullable' ? s.optional() : s;
const key = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/);
const ref = z.string().regex(/^(H|S)\d+$/);
const actionSchemas: any = {};
const actionList = () => z.array(z.lazy(() => zShortAction)).min(1).max(12);
for (const [op, schema] of Object.entries(ACTIONS)) {
  const shape: any = {};
  for (const [field, value] of Object.entries(schema.shape)) {
    if (field === 'evidence') continue;
    shape[field] = ['onHit', 'present', 'missing'].includes(field) ? actionList() : nullableOptional(value);
  }
  actionSchemas[op] = object(shape);
}
export const zShortAction: any = z.lazy(() => z.discriminatedUnion('op', Object.values(actionSchemas) as any));
const shortSlot = object({ delivery: z.enum(['passive', 'self', 'targeted', 'ground']),
  rangeTier: z.enum(['極小', '小', '中', '大', '極大']).nullable().optional(),
  windup: z.number().finite().min(0).max(10).nullable().optional(),
  actions: z.array(zShortAction).max(16), cost: object({ key, count: z.number().int().min(1).max(20) }).nullable().optional(),
  mechanismGaps: z.array(z.string().min(1).max(2000)).max(12).optional(),
  tuningNotes: z.array(z.string().min(1).max(2000)).max(12).optional() });
export const zIR3 = object({ schema: z.literal('hero-mechanism-plan@3'),
  hero: object({ origin: z.enum(ORIGINS as [string, ...string[]]), originBasis: z.enum(['source', 'proposal']),
    identitySummary: z.string().min(1).max(2000), identityRefs: z.array(ref).min(1).max(20) }),
  relations: z.array(object({ from: z.enum(SLOTS), to: z.enum(SLOTS),
    kind: z.enum(['independent', 'resource', 'conditional']), ref })).max(20),
  slots: object(Object.fromEntries(SLOTS.map((s: string) => [s, shortSlot]))) });

export function sourceReferences(source: any) {
  const entries: any[] = [];
  const add = (prefix: string, text: string) => {
    let i = 0;
    for (const line of text.split('\n').map(x => x.trim()).filter(Boolean)) {
      // No normalization/rewording: references always point at a contiguous original line.
      if (line.length <= 1000) entries.push({ id: `${prefix}${i++}`, text: line });
      else for (let start = 0; start < line.length; start += 1000) entries.push({ id: `${prefix}${i++}`, text: line.slice(start, start + 1000) });
    }
  };
  add('H', source.hero.originalText);
  add('S', (source.supplements ?? source.sources?.filter((s: any) => s.id !== 'hero-original') ?? []).map((s: any) => s.text).join('\n'));
  assert(new Set(entries.map(e => e.id)).size === entries.length);
  return entries;
}
function bounded(input: any) {
  let nodes = 0;
  const visit = (v: any, depth = 0) => { if (++nodes > 10000 || depth > 24) throw new Error('IR_SIZE_DEPTH');
    if (v && typeof v === 'object') for (const x of Object.values(v)) visit(x, depth + 1); };
  visit(input);
}
export function expandIR3(input: any, source: any) {
  bounded(input); const ir = zIR3.parse(input), refs = new Map(sourceReferences(source).map(x => [x.id, x.text]));
  const quote = (id: string) => { const text = refs.get(id); assert(text, `UNKNOWN_SOURCE_REFERENCE:${id}`); return text; };
  assert.equal(new Set(ir.hero.identityRefs).size, ir.hero.identityRefs.length, 'DUPLICATE_IDENTITY_REF');
  const slots = Object.fromEntries(SLOTS.map((slot: string) => {
    const text = source.slots.find((s: any) => s.slot === slot)?.originalText;
    assert(typeof text === 'string' && text.length >= 2 && text.length <= 1000, 'SOURCE_SLOT_CONTEXT_BOUNDS');
    const expand = (a: any): any => {
      const answer: any = { op: a.op, evidence: text };
      for (const [field, type] of Object.entries(ACTIONS[a.op].shape) as any) {
        if (['op', 'evidence'].includes(field)) continue;
        answer[field] = ['onHit', 'present', 'missing'].includes(field) ? a[field].map(expand)
          : Object.hasOwn(a, field) ? a[field] : type._def.typeName === 'ZodNullable' ? null : undefined;
        assert(answer[field] !== undefined, `MISSING_MECHANIC_FIELD:${a.op}.${field}`);
      }
      return answer;
    };
    const s = ir.slots[slot];
    return [slot, { delivery: s.delivery, rangeTier: s.rangeTier ?? null, windup: s.windup ?? null,
      cost: s.cost ?? null, actions: s.actions.map(expand), mechanismGaps: s.mechanismGaps ?? [], tuningNotes: s.tuningNotes ?? [] }];
  }));
  return { schema: 'hero-semantic-ir@2', hero: { origin: ir.hero.origin, originBasis: ir.hero.originBasis,
    identitySummary: ir.hero.identitySummary, identityEvidence: ir.hero.identityRefs.map(quote) },
    relations: ir.relations.map(({ ref: id, ...r }: any) => ({ ...r, evidence: quote(id) })), slots };
}
export function validateIR3(input: unknown, source: any) {
  const ir2 = expandIR3(input, source), checked = validateIR2(ir2, source);
  return { ...checked, ir3: input, expandedIR2: ir2, automaticAccept: false,
    actionEvidencePolicy: 'whole-slot source context is script-owned provenance, NOT a claim of action entailment',
    requiresWholeSourceSemanticReview: true };
}
export function compileIR3(input: unknown, source: any, catalog: any) {
  const checked = validateIR3(input, source);
  return { ...compileIR2(checked.expandedIR2, source, catalog), ir3: input,
    sourceContextOwnedByScript: true, sourceEntailmentVerified: false };
}
/** CPU fixtures only: never feed this answer transformation into a test prompt. */
export function compactIR2(input: any, source: any) {
  const refs = sourceReferences(source);
  const refFor = (quote: string) => { const found = refs.find(e => e.text.includes(quote));
    assert(found, `NO_LINE_REFERENCE:${quote}`); return found.id; };
  const compact = (a: any): any => Object.fromEntries(Object.entries(a).filter(([k, v]) => k !== 'evidence' && v !== null)
    .map(([k, v]) => [k, ['onHit', 'present', 'missing'].includes(k) ? (v as any[]).map(compact) : v]));
  const slots = Object.fromEntries(SLOTS.map((slot: string) => [slot, Object.fromEntries(Object.entries(input.slots[slot])
    .filter(([k, v]) => !['sourceEvidence', 'vfxRecommendation'].includes(k) && v !== null && !(Array.isArray(v) && !v.length && ['tuningNotes', 'mechanismGaps'].includes(k)))
    .map(([k, v]) => [k, k === 'actions' ? (v as any[]).map(compact) : v]))]));
  const { identityEvidence, ...hero } = input.hero;
  return zIR3.parse({ schema: 'hero-mechanism-plan@3', hero: { ...hero, identityRefs: [...new Set(identityEvidence.map(refFor))] },
    relations: input.relations.map(({ evidence, ...r }: any) => ({ ...r, ref: refFor(evidence) })), slots });
}

// Machine-generated compact field catalog. Optional means null, never an inferred action/value.
function describe(s: any): any {
  if (s === zShortAction) return 'action';
  const d = s._def;
  if (d.typeName === 'ZodOptional') return { optional: describe(d.innerType) };
  if (d.typeName === 'ZodNullable') return { nullable: describe(d.innerType) };
  if (d.typeName === 'ZodLazy') return describe(d.getter());
  if (d.typeName === 'ZodString') return 'string';
  if (d.typeName === 'ZodNumber') return { number: d.checks.filter((x: any) => x.kind !== 'finite') };
  if (d.typeName === 'ZodBoolean') return 'boolean';
  if (d.typeName === 'ZodLiteral') return { constant: d.value };
  if (d.typeName === 'ZodEnum') return d.values;
  if (d.typeName === 'ZodArray') return { array: describe(d.type), min: d.minLength?.value, max: d.maxLength?.value };
  if (d.typeName === 'ZodObject') return Object.fromEntries(Object.entries(d.shape()).map(([k, v]) => [k, describe(v)]));
  throw new Error(`UNSUPPORTED_SHORT_CONTRACT:${d.typeName}`);
}
export function shortContract() {
  return { root: { schema: 'hero-mechanism-plan@3', hero: describe(zIR3.shape.hero), relations: describe(zIR3.shape.relations),
    slots: Object.fromEntries(SLOTS.map((s: string) => [s, 'slot'])) }, slot: describe(shortSlot),
    actions: Object.fromEntries(Object.entries(actionSchemas).map(([op, s]: any) => [op, describe(s)])),
    rules: ['strict objects: no unlisted keys', 'all six slots required', 'optional nullable fields omitted => null',
      'omitted mechanismGaps/tuningNotes => []', 'all other fields required; missing mechanics are never filled in',
      'identityRefs and relation ref are IDs from sourceReferences, not quotes',
      'action provenance is attached by script; source faithfulness still requires independent validation'] };
}
