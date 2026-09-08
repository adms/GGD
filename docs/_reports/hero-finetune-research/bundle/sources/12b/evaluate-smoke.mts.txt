/** Postprocess only. No repair, GPU, deployment, or original content writes. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assessEnvelope } from './smoke-contract.mjs';
import { shippedHeroCatalog } from '../../GGD-community-hero-forge/packages/shared/testkit/heroPackageFixture.ts';
import { compileHeroPackageProject } from '../../GGD-community-hero-forge/packages/shared/src/content/import/heroPackage.ts';
import { zHeroProject } from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/schema.ts';
import { pinHeroPlanTemplates } from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/templateVersions.ts';
import { HERO_PROJECT_SCHEMA, HERO_PLAN_SCHEMA, HERO_SECTION_IDS, HERO_SLOTS } from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/constants.ts';
import { defaultHeroPresentation } from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/presentation.ts';
import { archetypeForOrigin, ORIGIN_ATTACK_TYPE } from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge.ts';
import { ORIGINS } from '../../GGD-community-hero-forge/packages/shared/src/content/statNormalization.ts';
import { defaultParamsFor, paramsSchemaFor } from '../../GGD-community-hero-forge/packages/shared/src/content/templates/paramsSchema.ts';
import type { TemplateDoc } from '../../GGD-community-hero-forge/packages/shared/src/content/schema/template.ts';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
assert.equal(process.argv.length, 4, 'USAGE: node --import tsx evaluate-smoke.mts RUN_DIRECTORY NEW_REPORT_DIRECTORY');
const run = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
assert.equal(path.dirname(run), here, 'RUN_SCOPE'); assert(!fs.existsSync(out), 'REFUSE_OVERWRITE');
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const hash = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const state = read(path.join(run, 'state.json')), protocol = read(path.join(run, 'manifest.json'));
assert.equal(state.status, 'completed-inference-only', 'WORKER_NOT_TERMINAL');
assert.equal(state.workerPid, null);
const raw = read(path.join(run, 'raw.json')), requests = read(path.join(run, 'requests.json'));
assert(raw.complete && raw.results.length === protocol.heroCount && requests.length === protocol.heroCount, 'INCOMPLETE_ACCOUNTING');
assert.equal(hash(JSON.stringify(requests)), protocol.requestSha256, 'REQUEST_DRIFT');
assert.equal(raw.metadata.manifestSha256, hash(fs.readFileSync(path.join(run, 'manifest.json'))), 'PROTOCOL_DRIFT');
for (const [file, expected] of Object.entries(state.checkerPinsBeforeInference)) assert.equal(hash(fs.readFileSync(path.join(here, file))), expected, 'CHECKER_CHANGED_AFTER_INFERENCE');
const pins = read(path.join(here, 'current-engine-v1/source-pins.json'));
const checkPins = () => { for (const pin of pins) assert.equal(hash(fs.readFileSync(path.join(root, pin.path))), pin.sha256, 'ENGINE_DRIFT'); };
checkPins();
const catalog = shippedHeroCatalog();
const actualCatalogPins = [...catalog.documents].map(([key, doc]) => ({ key, sha256: hash(JSON.stringify(doc)) })).sort((a, b) => a.key.localeCompare(b.key));
assert.deepEqual(actualCatalogPins, read(path.join(here, 'current-engine-v1/catalog-pins.json')), 'CATALOG_DRIFT');
const templates = [...catalog.documents].filter(([key]) => key.startsWith('ability-templates/')).map(([, v]) => v as TemplateDoc);
const templateMap = new Map(templates.map(t => [t.id, t]));
const catalogInput = read(path.join(run, 'catalog.json'));
const results: any[] = [], projects: any[] = [];

for (let i = 0; i < requests.length; i++) {
  const request = requests[i], result = raw.results[i];
  assert.equal(result.id, request.id); assert.equal(result.requestDigest, request.requestDigest);
  const source = JSON.parse(request.messages[1].content).source;
  const assessment = assessEnvelope(result.envelope, source, catalogInput);
  const row: any = { id: request.id, normalizeOk: assessment.normalization.ok, unwrapped: assessment.normalization.unwrapped,
    contractOk: Boolean(assessment.contract), error: assessment.error, parameterErrors: [],
    compiler: { attempted: false, ok: false }, semanticAdjudication: 'pending-manual',
    automaticAccept: false, releaseQualified: false };
  if (assessment.contract) {
    const value = assessment.normalization.value;
    row.modelClaim = value.status;
    row.slotClaims = Object.fromEntries(HERO_SLOTS.map(slot => [slot, value.slots[slot].status]));
    for (const slot of HERO_SLOTS) for (const product of value.slots[slot].templates) {
      const template = templateMap.get(product.ref)!;
      const checked = paramsSchemaFor(template).safeParse({ ...defaultParamsFor(template), ...product.params });
      if (!checked.success) row.parameterErrors.push({ slot, ref: product.ref, issues: checked.error.issues });
    }
    if (!ORIGINS.includes(value.hero.origin)) row.compiler.reason = 'no-authorable-origin-provided';
    else if (!HERO_SLOTS.every(slot => value.slots[slot].templates.length > 0)) row.compiler.reason = 'missing-one-or-more-slot-products';
    else if (row.parameterErrors.length) row.compiler.reason = 'invalid-template-parameters';
    else {
      row.compiler.attempted = true;
      try {
        const projectId = `research12b-smoke-${source.id}`, sourceLock = { canonicalId: null, versionId: null };
        const sourceSlots = Object.fromEntries(source.slots.map((s: any) => [s.slot, s]));
        const slots = Object.fromEntries(HERO_SLOTS.map(slot => [slot, {
          slot, name: sourceSlots[slot].name, purpose: sourceSlots[slot].originalText,
          maxRank: slot === 'R' ? 3 : slot === 'PASSIVE' || slot === 'EX' ? 1 : 4,
          products: value.slots[slot].templates.map((t: any, index: number) => ({ instanceId: `${slot.toLowerCase()}-${index + 1}`,
            template: { ref: t.ref, params: t.params, inheritDefaults: true } })),
          abilityOverrides: { provenance: 'editor-json', ...value.slots[slot].abilityOverrides },
          templateConflictPolicy: 'reject', capabilityIds: [...new Set(value.slots[slot].templates.flatMap((t: any) => templateMap.get(t.ref)!.requires))],
          directionOptionIds: [], fallbackOptionIds: [],
        }]));
        const project = zHeroProject.parse({ schema: HERO_PROJECT_SCHEMA, projectId, revision: 1, sourceLock,
          brief: { name: source.hero.name, concept: source.hero.originalText,
            moveNames: Object.fromEntries(HERO_SLOTS.map(s => [s, sourceSlots[s].name])) },
          acceptedPlan: { schema: HERO_PLAN_SCHEMA, planId: `${projectId}.plan`, title: source.hero.name,
            summary: value.hero.identitySummary, sourceLock, origin: value.hero.origin,
            archetype: archetypeForOrigin(value.hero.origin), attackType: ORIGIN_ATTACK_TYPE[value.hero.origin] ?? 'melee',
            budget: { power: 50, complexity: 40 }, statOverrides: {}, slots },
          presentation: defaultHeroPresentation(), receipts: [],
          sections: Object.fromEntries(HERO_SECTION_IDS.map(id => [id, { revision: 1, state: 'draft', fieldOwnership: {} }])),
          validationState: Object.fromEntries(HERO_SECTION_IDS.map(id => [id, { revision: 1, status: 'idle', diagnosticCodes: [] }])),
          sourceDesign: { schema: 'ggd-hero-source-design@1', sourceSha256: source.hero.sourceSha256,
            name: source.hero.name, identity: source.hero.originalText, ownerText: source.hero.originalText,
            reviewText: (source.supplements ?? []).map((s: any) => s.text).join('\n'),
            slots: Object.fromEntries(HERO_SLOTS.map(slot => [slot, { name: sourceSlots[slot].name,
              ownerDescription: sourceSlots[slot].originalText, baselineBehavior: '', requiredRefinement: '', refinementContracts: [] }])) },
        });
        project.acceptedPlan = pinHeroPlanTemplates(project.acceptedPlan!, templates);
        const built = compileHeroPackageProject(project, catalog, false);
        row.compiler = { attempted: true, ok: true, runtimeDocuments: built.runtime.length, dependencies: built.dependencies.length };
        projects.push({ id: request.id, project, compiled: built.compiled, unvalidated: true, releaseQualified: false });
      } catch (error) { row.compiler.error = String(error instanceof Error ? error.message : error); }
    }
  }
  results.push(row);
}
checkPins();
fs.mkdirSync(out, { recursive: true });
const put = (p: string, value: unknown) => fs.writeFileSync(path.join(out, p), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
put('results.json', results); put('unvalidated-projects.private.json', projects);
const summary = { schema: 'ggd-hero12b-smoke-assessment@1', generatedAt: new Date().toISOString(),
  sourceRun: path.basename(run), rawSha256: hash(fs.readFileSync(path.join(run, 'raw.json'))),
  evaluatorSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
  counts: { attemptedHeroes: results.length, normalized: results.filter(r => r.normalizeOk).length,
    responseContractPassed: results.filter(r => r.contractOk).length, compiled: results.filter(r => r.compiler.ok).length,
    semanticsVerified: 0, automaticallyAccepted: 0 },
  knownCorpusExposed: true, noOutputRepair: true, releaseQualified: false,
  limits: ['Postprocessor implements the predeclared structural/compiler metrics; it is not a newly certified semantic scorer.',
    'Source names and original descriptions are deterministically preserved, not generated by the model.',
    'Literal source quoting does not establish complete requirement coverage.',
    'Successful compilation still requires source fidelity and behavior validation.'] };
put('manifest.json', summary); console.log(JSON.stringify({ ...summary, results }, null, 2));
