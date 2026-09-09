import { beforeAll, describe, expect, it } from 'vitest';
import { communityRecipeFixture } from '../../../../testkit/communityRecipeFixture';
import { applyCommunityDesignRefinement } from './apply';
import { generateHeroDraft, compileGeneratedHeroDraft, type CompiledHeroDraft } from '../generator';
import type { TemplateDoc } from '../../schema/template';
import { redesignedCases } from '../../../../../../tools/community-hero-forge/parody/test-cases.mjs';
import { evaluateCombo, loadBaseline, probePassiveBehavior, runSequence } from '../../../../../../tools/community-hero-forge/parody/sim-harness.mjs';
import { probeSlots } from '../../../../../../tools/community-hero-forge/parody/slot-probes.mjs';

let baseline: ReturnType<typeof loadBaseline>['baseline'];
beforeAll(() => { baseline = loadBaseline().baseline; });
const cast = (slot: string, extra = {}) => ({ kind: 'cast', slot, waitSec: .3, ...extra });
for (const [number, design] of redesignedCases()) describe(`${number} approved parody: ${design.signature}`, () => {
  let draft: CompiledHeroDraft | undefined;
  const prepared = () => {
    if (draft) return draft;
    const r = communityRecipeFixture(number);
    const templates = [...r.catalog.documents].filter(([k]) => k.startsWith('ability-templates/')).map(([, d]) => d as TemplateDoc);
    const configs = [...r.catalog.documents].filter(([k]) => k.startsWith('config/')).map(([, d]) => d);
    const source = JSON.stringify(r.project), shared = JSON.stringify(templates);
    const project = applyCommunityDesignRefinement(r.project, r.refinement, templates);
    const compiled = compileGeneratedHeroDraft(generateHeroDraft(project.acceptedPlan!, { heroId: project.projectId, heroName: project.brief.name, presentation: project.presentation }), templates, configs);
    expect(compiled.ok, compiled.ok ? '' : JSON.stringify(compiled.failures)).toBe(true);
    expect(project.sourceDesign).toEqual(r.project.sourceDesign);
    expect(JSON.stringify(r.project)).toBe(source); expect(JSON.stringify(templates)).toBe(shared);
    if (!compiled.ok) throw Error('compile failed');
    draft = compiled.draft; return draft;
  };
  for (const [index, combo] of design.combos.entries()) it(`causal combo ${index + 1}: ${combo.source} → ${combo.target}, four matched timelines`, () => {
    const d = prepared(); const result = evaluateCombo(d, combo, { baseline, relatedChampions: d.relatedChampions ?? [] });
    expect(result.validationErrors).toEqual([]);
    expect(result.status, JSON.stringify({ values: result.values, interaction: result.interaction })).toBe('passed');
  });
  it('all five active slots produce real gameplay changes beyond payment or visuals', () => {
    const d = prepared(); const probes = probeSlots(number, d, { baseline, relatedChampions: d.relatedChampions ?? [] });
    expect(probes.filter(p => p.status !== 'passed').map(({ slot, sourceAccepted, controlAccepted, differingTicks }) => ({ slot, sourceAccepted, controlAccepted, differingTicks }))).toEqual([]);
  });
  it('installed passive responds to real inputs, or actually saves a lethal hit once', () => {
    const d = prepared(), options = { baseline, relatedChampions: d.relatedChampions ?? [] };
    if (number === '22') {
      const r = runSequence(d, { ...options, setup: { caster: { hpPct: .001 } }, steps: [cast('Q', { actor: 'foe', target: 'caster' }), { kind: 'wait', waitSec: .7 }] });
      expect(r.after.caster.alive).toBe(true); expect(r.after.caster.marks[`${d.champion.id}.second-chance`]?.count).toBe(0);
    } else {
      const probes = probePassiveBehavior(d, options, design.passiveScenarios ?? []);
      expect(probes.length).toBeGreaterThan(0);
      expect(probes.filter(p => p.status !== 'passed').map(p => ({ event: p.event, error: p.error }))).toEqual([]);
    }
  });
});
