import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Snapshot/format existing teachers only. This is deliberately not a content
// repairer, admission-by-compiler shortcut, or training process.
export const SLOTS = ['PASSIVE', 'Q', 'W', 'E', 'R', 'EX'];
export const sha = value => createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);
const compact = value => JSON.stringify(value);
const PUB = 'outputs/community-hero-asset-integration/editor-publication-20260907';
const MATERIAL = 'materials/community-hero-forge/manifest.json';

export function contained(root, relative) {
  assert(relative && !path.isAbsolute(relative), 'RELATIVE_PATH_REQUIRED');
  const file = path.resolve(root, relative);
  assert(file.startsWith(path.resolve(root) + path.sep), 'PATH_ESCAPE');
  // Existing parents may contain symlinks. Only read bytes inside the source.
  const real = fs.realpathSync(file);
  assert(real.startsWith(fs.realpathSync(root) + path.sep), 'SYMLINK_ESCAPE');
  return real;
}

export function verifiedBytes(root, entry) {
  const bytes = fs.readFileSync(contained(root, entry.path));
  assert.equal(bytes.length, entry.bytes, `SIZE_DRIFT:${entry.path}`);
  assert.equal(sha(bytes), entry.sha256.replace(/^sha256:/, ''), `HASH_DRIFT:${entry.path}`);
  return bytes;
}

export function parseOwnerSources(moduleText, tsvText) {
  const prefix = 'const OWNER_SKILL_SOURCE_BASE_OVERRIDES = ';
  const start = moduleText.indexOf(prefix);
  const end = moduleText.indexOf('\n};', start);
  assert(start >= 0 && end > start, 'OWNER_BASE_LITERAL_MISSING');
  // Parse the JSON literal, never execute a source module during ingestion.
  const result = JSON.parse(moduleText.slice(start + prefix.length, end + 2));
  let current;
  const rows = [];
  for (const line of tsvText.replaceAll('\r', '').split('\n').slice(1)) {
    const match = line.match(/^(godie-[^\t]+)\t([^\t]+)\t([\s\S]*)$/);
    if (match) {
      if (current) rows.push(current);
      current = {id: match[1], name: match[2], description: match[3]};
    } else if (current) current.description += '\n' + line;
  }
  if (current) rows.push(current);
  for (const row of rows) {
    let text = row.description;
    if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1).replaceAll('""', '"');
    assert(/\[(主動|被動)\]/.test(text.split('\n')[0]), `OWNER_ACTIVATION_MISSING:${row.id}`);
    result[row.id] = {description: text};
  }
  return result;
}

export function communityRequest(project, independent) {
  const source = project.sourceDesign;
  assert(source?.ownerText && source?.identity, 'INDEPENDENT_COMMUNITY_SOURCE_MISSING');
  // sourceSha256 is the source document's digest, not necessarily this hero
  // excerpt's hash. Compare the excerpt to the independently pinned sidecar.
  assert(independent, 'INDEPENDENT_SIDECAR_REQUIRED');
  assert.equal(source.ownerText, independent.ownerText, 'OWNER_SOURCE_TEXT_DRIFT');
  assert.equal(source.identity, independent.identity, 'OWNER_IDENTITY_TEXT_DRIFT');
  assert.equal(source.name, project.brief.name, 'OWNER_IDENTITY_MISMATCH');
  // Do not copy baselineBehavior/requiredRefinement, template IDs, or parameters
  // from the answer into the question. Keep all independent cross-slot prose.
  return {
    heroName: source.name, identity: source.identity, ownerText: source.ownerText,
    reviewText: source.reviewText,
    slots: Object.fromEntries(SLOTS.map(slot => {
      const s = source.slots[slot];
      assert(s?.name && s?.ownerDescription, `SOURCE_SLOT_MISSING:${slot}`);
      assert.equal(s.ownerDescription, independent.slots[slot]?.ownerDescription, `OWNER_SLOT_TEXT_DRIFT:${slot}`);
      assert.equal(s.name, independent.slots[slot]?.name, `OWNER_SLOT_NAME_DRIFT:${slot}`);
      return [slot, {name: s.name, description: s.ownerDescription}];
    })),
  };
}

export function nativeRequest(champion, abilities, identity, owner) {
  const slots = {};
  const missing = [];
  for (const slot of SLOTS) {
    const ability = abilities[slot];
    const source = ability && owner[ability.id];
    if (source?.description) slots[slot] = {name: ability.name, description: source.description};
    else missing.push(slot);
  }
  return {
    request: {heroName: champion.name, identity: identity?.description ?? null, slots},
    missing, identityMissing: !identity?.description,
  };
}

export function presentationSelection(presentation) {
  // Numeric VFX art tuning and upload payloads are not learning targets. This
  // projection is a recommendation contract, not yet a playable HeroProject.
  return {
    modelKey: presentation.modelKey,
    championIcon: presentation.championIcon,
    slots: Object.fromEntries(SLOTS.map(slot => {
      const p = presentation.slots[slot];
      return [slot, {
        gameplayEvent: p.gameplayEvent, icon: p.icon, sfxKey: p.sfxKey,
        vfxLayers: p.vfxLayers.map(layer => ({vfxKey: layer.vfxKey, ...(layer.attachTo ? {attachTo: layer.attachTo} : {})})),
        scriptSelections: (p.script?.segments ?? []).map(segment => Object.fromEntries(
          ['kind', 'on', 'at', 'vfxId', 'subtypeId', 'pulse', 'sfxKey', 'replaces'].filter(key => key in segment).map(key => [key, clone(segment[key])]),
        )),
      }];
    })),
  };
}

export function communityTarget(project) {
  assert(project.acceptedPlan, 'TEACHER_PLAN_MISSING');
  const plan = clone(project.acceptedPlan);
  delete plan.templateVersions; // Full pinned versions remain in teacher artifacts.
  delete plan.generatorVersion;
  return {format: 'hero-plan', plan, presentationSelection: presentationSelection(project.presentation)};
}

export function nativeTarget(champion, abilities) {
  const hero = clone(champion);
  delete hero.abilities; // One authoritative six-slot set; no duplicate mirrors.
  return {format: 'native-content', champion: hero, abilities: clone(abilities)};
}

export function activationConflicts(hero) {
  if (hero.target.format !== 'native-content') return [];
  const tag = text => [...new Set((text?.split('\n')[0] ?? '').match(/\[(?:主動|被動)\]/g) ?? [])];
  return SLOTS.flatMap(slot => {
    const source = hero.request.slots[slot]?.description;
    const answer = hero.target.abilities[slot]?.description;
    const sourceTags = tag(source), answerTags = tag(answer);
    if (sourceTags.length !== 1 || answerTags.length !== 1 || sourceTags[0] === answerTags[0]) return [];
    return [{heroId: hero.id, slot, teacherSha256: hero.teacherSha256,
      reason: 'source-teacher-activation-version-conflict',
      evidence: {sourceFirstLine: source.split('\n')[0], teacherFirstLine: answer.split('\n')[0],
        sourcePath: hero.provenance.sourcePath,
        interpretation: 'Explicit activation labels disagree. Exclude this pairing; do not infer that the newer teacher or engine is wrong.'}}];
  });
}

export function catalogContext(bricks, capabilities, revision) {
  assert.equal(bricks.capabilityFingerprint, capabilities.fingerprint, 'CATALOG_FINGERPRINT_MISMATCH');
  return {revision, fingerprint: capabilities.fingerprint,
    // Exclude usedBy/exemplars/hero-specific recipes. This catalog is identical
    // for every candidate on this engine revision and never selected by target.
    bricks: bricks.bricks.map(b => ({id: b.id, layer: b.layer,
      params: b.params.map(p => Object.fromEntries(Object.entries(p).filter(([key]) => key !== 'origin')))})),
    constraints: Object.fromEntries(['conditionLeafFields', 'hookFields', 'abilityFields', 'simCapabilities',
      'planned', 'unsupported', 'knownBroken', 'deprecatedFields'].filter(k => k in capabilities).map(k => [k, clone(capabilities[k])])),
  };
}

export function makeExamples(hero, decisions = []) {
  const exclusions = decisions.filter(d => d.heroId === hero.id);
  for (const d of exclusions) {
    assert.equal(d.teacherSha256, hero.teacherSha256, 'STALE_EXCLUSION');
    assert(d.reason && d.evidence, 'EXCLUSION_EVIDENCE_REQUIRED');
    assert(d.slot === 'HERO' || SLOTS.includes(d.slot), 'EXCLUSION_SLOT');
  }
  const examples = [];
  for (const task of ['HERO', ...SLOTS]) {
    const issues = [];
    if (!hero.request.identity) issues.push('INDEPENDENT_IDENTITY_SOURCE_MISSING');
    const required = task === 'HERO' ? SLOTS : [task];
    for (const slot of required) {
      if (!hero.request.slots[slot]) issues.push(`INDEPENDENT_SLOT_SOURCE_MISSING:${slot}`);
      const answer = hero.target.format === 'hero-plan' ? hero.target.plan.slots[slot] : hero.target.abilities[slot];
      if (!answer) issues.push(`TEACHER_SLOT_MISSING:${slot}`);
    }
    const affected = exclusions.filter(d => d.slot === task || (task === 'HERO' && SLOTS.includes(d.slot)));
    issues.push(...affected.map(d => `KNOWN_BAD_TEACHER:${d.slot}:${d.reason}`));
    let target = hero.target;
    if (task !== 'HERO') target = hero.target.format === 'hero-plan'
      ? {format: 'hero-slot', slot: clone(hero.target.plan.slots[task]), presentationSelection: hero.target.presentationSelection.slots[task]}
      : {format: 'native-slot', ability: clone(hero.target.abilities[task])};
    examples.push({
      id: `${hero.id}:${task}`, heroId: hero.id, groupId: hero.groupId,
      task: task === 'HERO' ? 'whole-hero-generation' : 'slot-generation', slot: task,
      request: {...clone(hero.request), task: task === 'HERO' ? '生成完整英雄及六槽配置' : `生成 ${task} 槽配置；其他槽需求只作跨槽上下文`},
      target, issues,
      pairingEligible: issues.length === 0,
      // Pairing is not semantic or E2E admission. No JSONL train export here.
      trainingAdmitted: false, releaseQualified: false,
      teacherSha256: hero.teacherSha256, inputKind: 'reconstructed-input',
      provenance: hero.provenance,
    });
  }
  return examples;
}

export function build({workspace, sourceRepo, sourceCommit, decisions = []}) {
  assert(/^[a-f0-9]{40}$/.test(sourceCommit), 'EXACT_SOURCE_COMMIT_REQUIRED');
  const materialBytes = execFileSync('git', ['show', `${sourceCommit}:${MATERIAL}`], {cwd: sourceRepo, maxBuffer: 32 * 1024 * 1024});
  const material = JSON.parse(materialBytes);
  const entries = new Map(material.files.map(entry => [entry.path, entry]));
  const pins = {[`${sourceCommit}:${MATERIAL}`]: sha(materialBytes)};
  function read(relative, pinned = false) {
    const entry = entries.get(relative);
    assert(!pinned || entry, `MANIFEST_ENTRY_MISSING:${relative}`);
    const bytes = pinned ? verifiedBytes(workspace, entry) : fs.readFileSync(contained(workspace, relative));
    pins[relative] = sha(bytes);
    return JSON.parse(bytes);
  }
  const meta = read(`${PUB}/existing-catalog-baseline.json`, true);
  const version = meta.versionId.replace(/^sha256:/, '');
  const baseline = `outputs/community-hero-asset-integration/existing-catalog-baselines/works/${sha(meta.workId)}/versions/${version}`;
  const catalogVersion = read(`${baseline}/catalog-version.json`, true);
  const archiveEntries = new Map(catalogVersion.files.map(entry => [entry.path, entry]));
  function catalogFile(relative) {
    const entry = archiveEntries.get(relative);
    if (!entry) return null;
    const bytes = verifiedBytes(path.join(workspace, baseline), entry);
    pins[`${baseline}/${relative}`] = sha(bytes);
    return JSON.parse(bytes);
  }
  const sourceModule = 'ggd-editor-pack-v2/tools/hero_skill_source_overrides.mjs';
  const ownerTsv = 'ggd-editor-pack-v2/tools/owner_skill_descriptions_20260808.tsv';
  const moduleBytes = fs.readFileSync(contained(workspace, sourceModule));
  const tsvBytes = fs.readFileSync(contained(workspace, ownerTsv));
  pins[sourceModule] = sha(moduleBytes); pins[ownerTsv] = sha(tsvBytes);
  const owner = parseOwnerSources(moduleBytes.toString(), tsvBytes.toString());
  const identities = read('outputs/forge-mechanism-priority-r3-20260906/main-hero-inventory-v2.json');
  const identityById = new Map(identities.rows.map(row => [row.id, row]));
  const packageAudit = read(`${PUB}/generator-rebuild/current-package-audit.json`, true);
  const heroes = [];
  const artifacts = {};
  for (const item of catalogVersion.heroes.filter(hero => hero.catalog === 'shipping')) {
    const champion = catalogFile(item.path);
    assert(champion?.id === item.id, 'CATALOG_ID_MISMATCH');
    const abilities = {};
    for (const slot of SLOTS) {
      const id = slot === 'PASSIVE' ? champion.passiveAbility : slot === 'EX' ? champion.exAbility : champion.abilities?.[slot]?.id;
      // Standalone files are authoritative. Do not silently fall back to an
      // embedded mirror when the referenced source is missing.
      const ability = id && catalogFile(`catalog/abilities/${id}.json`);
      if (ability) { assert.equal(ability.slot, slot, 'ABILITY_SLOT_MISMATCH'); abilities[slot] = ability; }
    }
    const source = nativeRequest(champion, abilities, identityById.get(item.id), owner);
    const teacher = {champion, abilities};
    const teacherSha256 = sha(compact(teacher));
    const groupId = champion.transform?.role === 'alternate' ? champion.transform.counterpartId : champion.id;
    artifacts[item.id] = teacher;
    heroes.push({id: item.id, groupId, family: 'adopted-catalog', name: champion.name,
      teacherSha256, request: source.request, target: nativeTarget(champion, abilities),
      provenance: {teacherVersion: meta.versionId, gameRevision: catalogVersion.gameRevision,
        sourcePath: `${baseline}/${item.path}`, identitySourceRevision: identities.revision,
        sourceKind: 'independent-owner-text-plus-prior-identity-inventory',
        originalCodexModel: 'unknown', originalCodexEffort: 'unknown',
        priorExposure: 'existing-teacher-pool; historical-evaluations-become-seen-regression-if-trained'},
    });
  }
  for (const audit of packageAudit.rows) {
    const number = String(audit.number).padStart(2, '0');
    const id = `community-review-${number}-20260907`;
    const file = `${PUB}/generator-rebuild/${number}/after/${id}-draft.json`;
    const payload = read(file, true);
    const project = payload.payload?.project;
    assert.equal(project?.projectId, id, 'COMMUNITY_ID_MISMATCH');
    assert.equal(project.revision, audit.revision, 'COMMUNITY_REVISION_MISMATCH');
    assert.equal(project.brief.name, audit.name, 'COMMUNITY_NAME_MISMATCH');
    assert(audit.ownerTextAndSixSlotSourceExact && audit.sixSlotKitAccepted, 'ARCHIVED_RECEIPT_MISSING');
    const recipePath = `materials/community-hero-forge/recipes/${number}.upload-recipe.json`;
    const recipeBytes = execFileSync('git', ['show', `${sourceCommit}:${recipePath}`], {cwd: sourceRepo, maxBuffer: 4 * 1024 * 1024});
    pins[`${sourceCommit}:${recipePath}`] = sha(recipeBytes);
    const recipe = JSON.parse(recipeBytes);
    assert.equal(recipe.projectId, id, 'RECIPE_ID_MISMATCH');
    const independent = {ownerText: recipe.sourceOwnerText, identity: recipe.identity, slots: Object.fromEntries(recipe.slots.map(s => [s.slot, s]))};
    artifacts[id] = project;
    heroes.push({id, groupId: id, family: 'community37', name: project.brief.name,
      teacherSha256: sha(compact(project)), request: communityRequest(project, independent), target: communityTarget(project),
      provenance: {teacherVersion: project.revision, sourcePath: file,
        packageDigest: audit.packageDigest, gameRevision: audit.base.gameRevision,
        sourceKind: 'independent-sourceDesign-ownerText', originalCodexModel: 'unknown', originalCodexEffort: 'unknown',
        preservedRefinementNotes: project.refinementNotes ?? {},
        sourceNotesAreNotCurrentMechanismVerdicts: true,
        priorExposure: 'existing-teacher-pool; historical-evaluations-become-seen-regression-if-trained'},
    });
  }
  assert.equal(heroes.filter(h => h.family === 'adopted-catalog').length, 71, 'ADOPTED_ROSTER_DRIFT');
  assert.equal(heroes.filter(h => h.family === 'community37').length, 37, 'COMMUNITY_ROSTER_DRIFT');
  for (const d of decisions) assert(heroes.some(h => h.id === d.heroId), 'UNKNOWN_EXCLUSION_HERO');
  const allDecisions = [...decisions, ...heroes.flatMap(activationConflicts)];
  const examples = heroes.flatMap(hero => makeExamples(hero, allDecisions));
  const catalogs = {};
  for (const revision of new Set(heroes.map(h => h.provenance.gameRevision))) {
    assert(/^[a-f0-9]{40}$/.test(revision), 'CATALOG_REVISION_REQUIRED');
    const docs = {};
    for (const name of ['ggd-bricks', 'ggd-runtime-capabilities']) {
      const file = `docs/editor-contract/${name}.json`;
      const bytes = execFileSync('git', ['show', `${revision}:${file}`], {cwd: sourceRepo, maxBuffer: 4 * 1024 * 1024});
      pins[`${revision}:${file}`] = sha(bytes); docs[name] = JSON.parse(bytes);
    }
    catalogs[revision] = catalogContext(docs['ggd-bricks'], docs['ggd-runtime-capabilities'], revision);
  }
  const count = predicate => examples.filter(predicate).length;
  return {manifest: {
    schema: 'ggd-codex-distillation-pairs@1', sourceCommit, inputPins: pins,
    counts: {adoptedRecords: 71, communityHeroes: 37, legacyRecordsExcluded: catalogVersion.heroes.filter(h => h.catalog === 'legacy').length,
      heroRecords: heroes.length, candidatePairs: examples.length,
      wholeHeroPairs: count(r => r.slot === 'HERO'), slotPairs: count(r => r.slot !== 'HERO'),
      independentSourcePaired: count(r => r.pairingEligible),
      pairedWholeHeroes: count(r => r.pairingEligible && r.slot === 'HERO'),
      pairedSlots: count(r => r.pairingEligible && r.slot !== 'HERO'),
      excludedPairing: count(r => !r.pairingEligible), knownBadDecisions: allDecisions.length,
      ownerSlotSourcesAvailable: Object.keys(owner).length, trainingAdmitted: 0},
    scope: 'Existing teacher formatting; not semantic admission, schema/compile/E2E proof, or training.',
    pending: ['version-bound known-gap screening', 'full output integration and validators', 'catalog-conditioned token preflight', 'hero/near-duplicate split freeze'],
    externalNewHeroBatchUsed: false, trainingStarted: false, decisions: allDecisions,
    sourceSelection: '71 shipped records from pinned adopted catalog plus pinned 37 projects; 48 legacy records excluded; transformed records are not independent heroes.',
  }, heroes, examples, artifacts, catalogs};
}

export function writeNew(out, data) {
  assert(!fs.existsSync(out), 'OUTPUT_ALREADY_EXISTS');
  fs.mkdirSync(out, {recursive: true});
  const hashes = {};
  for (const [name, value] of Object.entries(data)) {
    if (name === 'manifest') continue;
    const filename = `${name}.json`;
    const bytes = JSON.stringify(value, null, 2) + '\n';
    fs.writeFileSync(path.join(out, filename), bytes, {flag: 'wx'});
    hashes[filename] = sha(bytes);
  }
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({...data.manifest,
    outputs: hashes, scriptSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url)))}, null, 2) + '\n', {flag: 'wx'});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.equal(args.shift(), 'build', 'USAGE: build --workspace PATH --source-repo PATH --source-commit SHA --out NEW_DIR [--decisions FILE]');
  const options = {};
  while (args.length) { const key = args.shift(); assert(args.length && /^--[a-z-]+$/.test(key), 'ARGUMENT'); options[key] = args.shift(); }
  const required = ['--workspace', '--source-repo', '--source-commit', '--out'];
  for (const key of required) assert(options[key], `MISSING:${key}`);
  for (const key of Object.keys(options)) assert([...required, '--decisions'].includes(key), `UNKNOWN:${key}`);
  const data = build({workspace: path.resolve(options['--workspace']), sourceRepo: path.resolve(options['--source-repo']),
    sourceCommit: options['--source-commit'], decisions: options['--decisions'] ? JSON.parse(fs.readFileSync(options['--decisions'])) : []});
  writeNew(path.resolve(options['--out']), data);
  console.log(JSON.stringify(data.manifest.counts));
}
