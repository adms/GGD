/** Pure bounded IR lowering, then the unmodified current GGD compiler. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateIR } from './semantic-ir.mts';
import { SLOTS } from './intake.mjs';
import { shippedHeroCatalog } from '../../GGD-community-hero-forge/packages/shared/testkit/heroPackageFixture.ts';
import { compileHeroPackageProject } from '../../GGD-community-hero-forge/packages/shared/src/content/import/heroPackage.ts';
import { zHeroProject } from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/schema.ts';
import { pinHeroPlanTemplates } from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/templateVersions.ts';
import { HERO_PROJECT_SCHEMA, HERO_PLAN_SCHEMA, HERO_SECTION_IDS } from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/constants.ts';
import { defaultHeroPresentation } from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/presentation.ts';
import { archetypeForOrigin, ORIGIN_ATTACK_TYPE } from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge.ts';
import { defaultParamsFor, paramsSchemaFor } from '../../GGD-community-hero-forge/packages/shared/src/content/templates/paramsSchema.ts';
import type { TemplateDoc } from '../../GGD-community-hero-forge/packages/shared/src/content/schema/template.ts';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
export const hash = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
export function checkEnginePins() {
  for (const p of JSON.parse(fs.readFileSync(path.join(here, 'current-engine-v1/source-pins.json'), 'utf8'))) {
    assert.equal(hash(fs.readFileSync(path.join(root, p.path))), p.sha256, `ENGINE_DRIFT:${p.path}`);
  }
}
export function currentCatalog() {
  const catalog = shippedHeroCatalog();
  const pins = [...catalog.documents].map(([key, v]) => ({ key, sha256: hash(JSON.stringify(v)) })).sort((a, b) => a.key.localeCompare(b.key));
  assert.deepEqual(pins, JSON.parse(fs.readFileSync(path.join(here, 'current-engine-v1/catalog-pins.json'), 'utf8')), 'CATALOG_DRIFT');
  return catalog;
}

export function lowerIR(input: unknown, source: any) {
  const checked = validateIR(input, source), { ir } = checked;
  const namespace = `ir-${hash(source.id).slice(0, 10)}`;
  const symbol = (key: string) => `${namespace}.${key}`;
  const proposals: any[] = [];
  function proposed(a: any, field: string, fallback: any, location: string) {
    if (a[field] !== null) return a[field];
    proposals.push({ location, field, value: fallback, basis: 'research-preview-policy-not-source', requiresTuning: true });
    return fallback;
  }
  function effects(actions: any[], slot: string, prefix: string): any[] {
    return actions.flatMap((a, i) => {
      const loc = `${prefix}.${i}`, statusId = `${namespace}.${slot.toLowerCase()}.${hash(loc).slice(0, 8)}`;
      const dt = () => proposed(a, 'damageType', 'magic', loc);
      const amount = () => ({ damageTier: proposed(a, 'tier', '極小', loc) });
      const hit = () => ({ kind: 'damage', damageType: dt(), amount: amount() });
      const kb = (v: any) => ({ kind: 'knockback', distance: proposed(v, 'distance', 0.4, loc), speed: 8, from: v.direction, subtractGap: v.subtractGap });
      switch (a.op) {
        case 'damage': return [hit()];
        case 'dot': return [{ kind: 'dot', damageType: dt(), amountPerTick: amount(), durationSec: a.duration, intervalSec: a.interval, tickOnApply: false }];
        case 'heal_self': return [{ kind: 'heal', applyTo: 'self', amount: { flat: proposed(a, 'amount', 100, loc) } }];
        case 'shield_self': return [{ kind: 'shield', amount: { flat: proposed(a, 'amount', 100, loc) }, duration: a.duration,
          absorbs: a.absorbs, stackKey: statusId, onExisting: a.stacking === 'keep_larger' ? 'keepLarger' : 'replace' }];
        case 'buff_self': return [{ kind: 'applyBuff', applyTo: 'self', duration: a.duration, modifiers: [
          ...(a.moveSpeedTier ? [{ stat: 'ms', op: 'pctAdd', msBonusTier: a.moveSpeedTier }] : []),
          ...(a.attackSpeedPct ? [{ stat: 'as', op: 'pctAdd', value: a.attackSpeedPct }] : []),
        ] }];
        case 'control': return [{ kind: 'applyStatus', statusId, duration: a.duration,
          ...(a.control === 'slow' ? { moveSpeedMult: 1 - a.slowPct } : { [{ root: 'root', stun: 'stun', fear: 'feared' }[a.control]!]: true }) }];
        case 'knockback': return [kb(a)];
        case 'area_pulses': return [{ kind: 'delayed', shape: 'circle', radius: 1, radiusTier: a.radiusTier, side: 'enemies',
          anchor: a.anchor, delaySec: proposed(a, 'firstDelay', a.interval, loc), count: a.count, intervalSec: a.interval,
          targetMode: 'reresolve', hitOncePerTarget: false, effects: [hit()] }];
        case 'barrage': return [{ kind: 'randomArea', who: 'target', count: [a.count],
          intervalSec: proposed(a, 'interval', 0.2, loc), scatterRadius: proposed(a, 'scatterRadius', 0.5, loc), firstAtCast: true,
          effects: [{ kind: 'damageArea', radius: proposed(a, 'hitRadius', 2.75, loc), damageType: dt(), amount: amount(), includeOrigin: true }] }];
        case 'chain': return [{ kind: 'chainLightning', shape: 'single', jumps: a.totalTargets, damageType: dt(), amount: amount(),
          jumpRange: proposed(a, 'jumpRange', 4.5, loc), decay: a.decay, revisit: false }];
        case 'combo': {
          const strikes = proposed(a, 'strikes', 3, loc), interval = a.duration / (strikes + 1);
          return [
            ...(a.lock === 'none' ? [] : [{ kind: 'applyStatus', statusId, duration: a.duration, [a.lock]: true }]),
            ...(a.casterGuard === 'none' ? [] : [{ kind: 'invulnerable', applyTo: 'self', durationSec: a.duration,
              blocksDamage: a.casterGuard, blocksControl: false }]),
            { kind: 'delayed', shape: 'single', targetMode: 'frozen', delaySec: interval, intervalSec: interval,
              count: strikes, effects: [hit()], stopOnCasterDeath: true },
            { kind: 'delayed', shape: 'single', targetMode: 'frozen', delaySec: a.duration,
              effects: [{ kind: 'damage', damageType: dt(), amount: { damageTier: proposed(a, 'finisherTier', '小', loc) } }], stopOnCasterDeath: true },
          ];
        }
        case 'leap': return [{ kind: 'leap', applyTo: 'self', mode: 'toPoint', apexHeight: proposed(a, 'apexHeight', 0, loc),
          durationSec: proposed(a, 'duration', 0.3, loc), ...(a.distance === null ? {} : { throwDistance: a.distance }),
          landRadius: proposed(a, 'landRadius', 2.75, loc), onLand: [hit(), ...(a.pushOnLand ? [kb(a.pushOnLand)] : [])] }];
        case 'output_modifier': return [{ kind: 'applyBuff', sourceScope: 'caster', statusId: symbol(a.key), stackKey: symbol(a.key),
          maxStacks: 1, duration: a.duration, modifiers: ['ad', 'ap'].map(stat => ({ stat, op: 'pctAdd', value: a.percent })),
          polarity: a.percent < 0 ? 'debuff' : 'buff', dispellable: true }];
        case 'spend_health': return [{ kind: 'spendHealth', amount: { flat: 0 }, pctMaxHealth: a.maxHpPct, minimumHp: a.minimumHp }];
        case 'projectile': return [{ kind: 'spawnProjectile', projectileId: 'imported.bolt.void', onHit: effects(a.onHit, slot, loc + '.onHit') }];
        case 'status_branch': return [{ kind: 'consumeStatus', shape: 'single', statusId: symbol(a.key), count: 'all',
          ...(a.ownership === 'same_caster' ? { appliedBy: 'self' } : {}),
          onConsumed: effects(a.present, slot, loc + '.present'), onMissing: effects(a.missing, slot, loc + '.missing') }];
        case 'counter_window': return [{ kind: 'applyBuff', applyTo: 'self', duration: proposed(a, 'duration', 0.5, loc),
          modifiers: [], statusId, stackKey: statusId, maxStacks: 1, hooks: [{ on: 'onDamageTaken', victim: 'enemy', damageSource: 'basic',
            maxTriggers: 1, onConsumed: 'detachSource', condition: { all: [
              { kind: 'distance', op: '<=', value: proposed(a, 'radius', 2.5, loc) },
              ...(a.facingArc === null ? [] : [{ kind: 'facing', subject: 'self', arcDegrees: a.facingArc }]),
            ] }, effects: [{ ...hit(), incomingPct: { perRank: [0], negateOriginal: false, maxChainDepth: 0 } }] }] }];
        default: throw new Error(`UNLOWERED_ACTION:${a.op}`);
      }
    });
  }
  const slots = Object.fromEntries(SLOTS.map((slot: string) => {
    const s = ir.slots[slot], products: any[] = [];
    const product = (ref: string, params: any) => products.push({ ref, params });
    if (slot === 'PASSIVE') for (const a of s.actions) {
      if (a.op === 'attack_proc') product('tpl-event-passive', { hooks: [{ on: 'onBasicAttack', target: 'event', victim: 'enemy',
        internalCooldown: a.cooldown, ...(a.targetHpBelow === null ? {} : { condition: { kind: 'stat', subject: 'target', stat: 'hp', mode: 'percent', op: '<', value: a.targetHpBelow } }),
        effects: [{ kind: 'damage', damageType: proposed(a, 'damageType', 'magic', slot), amount: { damageTier: proposed(a, 'tier', '極小', slot) } }] }] });
      else if (a.op === 'resource') {
        product('tpl-mark-stacks', { markId: symbol(a.key), initial: a.initial, max: a.max, durationSec: -1, resetOn: a.reset, lethalMode: 'none', perStackLost: [] });
        product('tpl-event-passive', { hooks: [{ on: 'onDamageDealt', target: 'self', victim: 'enemy', oncePerCast: true,
          effects: [{ kind: 'applyStatus', statusId: symbol(a.key), stacks: a.amount, duration: 1 }] }] });
      }
    } else if (s.actions.length) product('tpl-effect-sequence', { castType: s.delivery, castTimeSec: proposed(s, 'windup', 0, slot),
      radius: 2.75, side: 'enemies', effects: effects(s.actions, slot, slot) });
    return [slot, { products, abilityOverrides: { ...(s.rangeTier ? { rangeTier: s.rangeTier } : {}),
      ...(s.cost ? { statusCost: { statusId: symbol(s.cost.key), count: s.cost.count } } : {}) } }];
  }));
  return { ...checked, namespace, slots, proposals, automaticAccept: false };
}

export function compileIR(input: unknown, source: any, catalog = currentCatalog()) {
  const lowered = lowerIR(input, source), { ir } = lowered;
  const templates = [...catalog.documents].filter(([k]) => k.startsWith('ability-templates/')).map(([, v]) => v as TemplateDoc);
  const templateMap = new Map(templates.map(t => [t.id, t]));
  const sourceSlots = Object.fromEntries(source.slots.map((s: any) => [s.slot, s]));
  const projectId = `research12b-${source.id}`, sourceLock = { canonicalId: null, versionId: null };
  const slots = Object.fromEntries(SLOTS.map((slot: string) => {
    const s = lowered.slots[slot];
    assert(s.products.length, 'CANNOT_COMPILE_EMPTY_SLOT');
    for (const p of s.products) {
      const t = templateMap.get(p.ref); assert(t && t.status === 'enabled', 'DISABLED_TEMPLATE');
      assert(Object.keys(p.params).every(k => Object.hasOwn(t.params, k)), 'UNKNOWN_PARAMETER');
      paramsSchemaFor(t).parse({ ...defaultParamsFor(t), ...p.params });
    }
    return [slot, { slot, name: sourceSlots[slot].name, purpose: sourceSlots[slot].originalText,
      maxRank: slot === 'R' ? 3 : slot === 'PASSIVE' || slot === 'EX' ? 1 : 4,
      products: s.products.map((p: any, i: number) => ({ instanceId: `${slot.toLowerCase()}-${i + 1}`, template: { ...p, inheritDefaults: true } })),
      abilityOverrides: { provenance: 'editor-json', ...s.abilityOverrides }, templateConflictPolicy: 'reject',
      capabilityIds: [...new Set(s.products.flatMap((p: any) => templateMap.get(p.ref)!.requires))], directionOptionIds: [], fallbackOptionIds: [] }];
  }));
  const project = zHeroProject.parse({ schema: HERO_PROJECT_SCHEMA, projectId, revision: 1, sourceLock,
    brief: { name: source.hero.name, concept: source.hero.originalText, moveNames: Object.fromEntries(SLOTS.map((s: string) => [s, sourceSlots[s].name])) },
    acceptedPlan: { schema: HERO_PLAN_SCHEMA, planId: `${projectId}.plan`, title: source.hero.name,
      summary: ir.hero.identitySummary, sourceLock, origin: ir.hero.origin, archetype: archetypeForOrigin(ir.hero.origin),
      attackType: ORIGIN_ATTACK_TYPE[ir.hero.origin] ?? 'melee', budget: { power: 50, complexity: 40 }, statOverrides: {}, slots },
    presentation: defaultHeroPresentation(), receipts: [],
    sections: Object.fromEntries(HERO_SECTION_IDS.map(id => [id, { revision: 1, state: 'draft', fieldOwnership: {} }])),
    validationState: Object.fromEntries(HERO_SECTION_IDS.map(id => [id, { revision: 1, status: 'idle', diagnosticCodes: [] }])),
    sourceDesign: { schema: 'ggd-hero-source-design@1', sourceSha256: source.hero.sourceSha256, name: source.hero.name,
      identity: source.hero.originalText, ownerText: source.hero.originalText,
      reviewText: (source.supplements ?? source.sources?.filter((s: any) => s.id !== 'hero-original') ?? []).map((s: any) => s.text).join('\n'),
      slots: Object.fromEntries(SLOTS.map((slot: string) => [slot, { name: sourceSlots[slot].name, ownerDescription: sourceSlots[slot].originalText,
        baselineBehavior: '', requiredRefinement: '', refinementContracts: [] }])) } });
  project.acceptedPlan = pinHeroPlanTemplates(project.acceptedPlan!, templates);
  const built = compileHeroPackageProject(project, catalog, false);
  return { lowered, project, compiled: built.compiled, runtimeDocuments: built.runtime.length,
    dependencies: built.dependencies.length, automaticAccept: false, releaseQualified: false };
}
