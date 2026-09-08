/** Versioned responsibility change, not post-hoc repair of v1 answers. */
import { z } from '../../GGD-community-hero-forge/packages/shared/node_modules/zod/index.js';
import { zIR, zSlot, validateIR, walkActions } from './semantic-ir.mts';
import { compileIR } from './ir-compiler.mts';
import { SLOTS } from './intake.mjs';

const slot = zSlot.omit({ sourceEvidence: true, vfxRecommendation: true });
export const zIR2 = zIR.extend({ schema: z.literal('hero-semantic-ir@2'),
  slots: z.object(Object.fromEntries(SLOTS.map((s: string) => [s, slot]))).strict() }).strict();

export function toIR1(input: any, source: any) {
  // Same bounded prewalk as v1, before a recursive schema is entered.
  let nodes = 0;
  const visit = (v: any, depth = 0) => {
    if (++nodes > 10000 || depth > 24) throw new Error('IR_SIZE_DEPTH');
    if (v && typeof v === 'object') for (const c of Object.values(v)) visit(c, depth + 1);
  };
  visit(input); const ir = zIR2.parse(input);
  return { ...ir, schema: 'hero-semantic-ir@1', slots: Object.fromEntries(SLOTS.map((s: string) => [s,
    { ...ir.slots[s], sourceEvidence: [source.slots.find((x: any) => x.slot === s).originalText], vfxRecommendation: null }])) };
}

export function validateIR2(input: unknown, source: any) {
  const canonical = toIR1(input, source), checked = validateIR(canonical, source);
  const declarations = new Map<string, { slot: string; op: string }>();
  for (const s of SLOTS) walkActions(checked.ir.slots[s].actions, (a: any) => {
    if (['resource', 'output_modifier'].includes(a.op)) declarations.set(a.key, { slot: s, op: a.op });
  });
  const edges = new Set<string>(), declaredRelations = new Set<string>();
  for (const s of SLOTS) {
    const value = checked.ir.slots[s];
    if (value.cost) edges.add(`${declarations.get(value.cost.key)!.slot}:${s}:resource`);
    walkActions(value.actions, (a: any) => {
      if (a.op === 'status_branch') edges.add(`${declarations.get(a.key)!.slot}:${s}:conditional`);
    });
  }
  for (const r of checked.ir.relations) {
    const edge = `${r.from}:${r.to}:${r.kind}`;
    if (declaredRelations.has(edge)) throw new Error('DUPLICATE_RELATION');
    declaredRelations.add(edge);
    if (r.kind !== 'independent' && !edges.has(edge)) throw new Error(`UNBACKED_RELATION:${edge}`);
  }
  return { ...checked, ir2: input, canonicalMetadataOnly: true, automaticAccept: false };
}

export function compileIR2(input: unknown, source: any, catalog: any) {
  const checked = validateIR2(input, source);
  return { ...compileIR(checked.ir, source, catalog), ir2: input, sourceMetadataOwnedByScript: true };
}
