import { forgeChampion, type ForgeWarning, type StatMedians } from "../heroForge";
import { defaultAbilityMaxRank, zAbilityDoc, type AbilityDoc } from "../schema/ability";
import { zChampionDoc, type ChampionDoc } from "../schema/champion";
import type { TemplateDoc } from "../schema/template";
import { resolveTemplateExpansion, type TemplateFailurePhase } from "../templates/resolve";
import { HERO_SLOTS, type HeroSlot } from "./constants";
import type { HeroPlan } from "./plan";
import { abilityPresentationFields, type HeroPresentation } from "./presentation";
import { createRuntimeResolver } from "../runtimeResolver";
import { resolveChampionRuntimeStats } from "../championRuntimeResolver";
import { zVfxScriptDoc, type VfxScriptDoc } from "../schema/vfxScript";

export interface HeroDraftGeneratorOptions {
  heroId: string;
  heroName: string;
  modelKey?: string;
  medians?: StatMedians;
  templateParamsById?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  presentation?: HeroPresentation;
}

export interface GeneratedHeroDraft {
  champion: ChampionDoc;
  abilityDrafts: Readonly<Record<HeroSlot, AbilityDoc>>;
  standaloneAbilities: readonly [AbilityDoc, AbilityDoc];
  vfxScripts: readonly VfxScriptDoc[];
  warnings: readonly ForgeWarning[];
}

export interface HeroDraftCompileFailure {
  slot: HeroSlot;
  phase: TemplateFailurePhase | "schema";
  refs: readonly string[];
  message: string;
}

export type CompiledHeroDraftResult =
  | { ok: true; draft: GeneratedHeroDraft }
  | { ok: false; failures: readonly HeroDraftCompileFailure[] };

function fillRankColumns(value: unknown, maxRank: number): unknown {
  if (Array.isArray(value)) return value.map((entry) => fillRankColumns(entry, maxRank));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
    if (key === "perRank" && Array.isArray(entry) && entry.length > 0 && entry.length < maxRank) {
      return [key, Array.from({ length: maxRank }, (_, index) => entry[Math.min(index, entry.length - 1)])];
    }
    return [key, fillRankColumns(entry, maxRank)];
  }));
}

function buildAbility(plan: HeroPlan, slot: HeroSlot, options: HeroDraftGeneratorOptions): AbilityDoc {
  const slotPlan = plan.slots[slot];
  const maxRank = slotPlan.maxRank ?? defaultAbilityMaxRank(slot);
  const cards = slotPlan.products.map(({ template }) => ({
    ...template,
    // Persist only the author's overrides. Defaults resolve from the template.
    params: template.params,
  }));
  return zAbilityDoc.parse({
    schema: "ability@1",
    id: `${options.heroId}.${slot.toLowerCase()}`,
    name: slotPlan.name,
    description: slotPlan.purpose,
    slot,
    ...(slot === "PASSIVE" ? { innateKind: "passive" as const } : {}),
    castType: slot === "PASSIVE" ? "self" : "targeted",
    maxRank,
    cooldown: Array.from({ length: maxRank }, () => slotPlan.tuning.cooldownSec),
    manaCost: Array.from({ length: maxRank }, () => slotPlan.tuning.manaCost),
    range: slotPlan.tuning.range,
    effects: [],
    template: cards.length === 1 ? cards[0] : { cards, onConflict: slotPlan.templateConflictPolicy },
    ...(options.presentation ? abilityPresentationFields(options.presentation.slots[slot]) : {}),
    ...slotPlan.abilityOverrides,
  });
}

export function generateHeroDraft(plan: HeroPlan, options: HeroDraftGeneratorOptions): GeneratedHeroDraft {
  const forged = forgeChampion({
    id: options.heroId,
    name: options.heroName,
    description: plan.summary,
    origin: plan.origin,
    attackType: plan.attackType,
    archetype: plan.archetype,
    // The legacy forge fallback is a render-test key rather than a content
    // document. New hero projects must start from a real model reference so
    // their first dependency closure can pass without hidden repair work.
    modelKey: options.modelKey ?? "champ.thorne",
    medians: options.medians,
    overrides: plan.statOverrides,
  });
  const abilityDrafts = Object.fromEntries(HERO_SLOTS.map((slot) => [slot, buildAbility(plan, slot, options)])) as Record<HeroSlot, AbilityDoc>;
  const embedded = (slot: "Q" | "W" | "E" | "R") => {
    const { schema: _schema, ...ability } = abilityDrafts[slot];
    return ability;
  };
  const champion = zChampionDoc.parse({
    ...forged.draft,
    origin: plan.origin,
    statOverrides: plan.statOverrides,
    baseStats: {},
    growth: {},
    attributes: undefined,
    ...(options.presentation ? {
      modelKey: options.presentation.modelKey,
      ...(options.presentation.championIcon ? { icon: options.presentation.championIcon } : {}),
    } : {}),
    abilities: { Q: embedded("Q"), W: embedded("W"), E: embedded("E"), R: embedded("R") },
    exAbility: abilityDrafts.EX.id,
    passiveAbility: abilityDrafts.PASSIVE.id,
    skillOrder: ["Q", "W", "E", "R"],
    buildPriority: [],
    tags: [],
  });
  return {
    champion,
    abilityDrafts,
    standaloneAbilities: [abilityDrafts.PASSIVE, abilityDrafts.EX],
    vfxScripts: HERO_SLOTS.flatMap((slot) => {
      const script = options.presentation?.slots[slot].script;
      if (!script) return [];
      if (script.abilityId !== abilityDrafts[slot].id || script.id !== abilityDrafts[slot].id) throw new Error(`${slot} 演出腳本必須綁定這份英雄的技能。`);
      return [zVfxScriptDoc.parse(script)];
    }),
    warnings: forged.warnings,
  };
}

/**
 * Compile all six generated slots through the exact template resolver used by
 * content registration.  The editor must never simulate the placeholder
 * `effects: []` skeleton: this is the seam that makes its live result equal to
 * what the game will register after import.
 */
export function compileGeneratedHeroDraft(
  generated: GeneratedHeroDraft,
  templates: readonly TemplateDoc[],
  configs: readonly { schema?: string }[] = [],
): CompiledHeroDraftResult {
  const catalog = new Map(templates.map((template) => [template.id, template]));
  const runtime = createRuntimeResolver(catalog, configs);
  const abilityDrafts = {} as Record<HeroSlot, AbilityDoc>;
  const failures: HeroDraftCompileFailure[] = [];

  for (const slot of HERO_SLOTS) {
    const source = generated.abilityDrafts[slot];
    // Legacy draft values remain editable, but runtime equips innate/EX at
    // rank 1 and core slots at the shared native limits. Overrides cannot
    // manufacture ranks that the game will never learn.
    if (source.maxRank !== defaultAbilityMaxRank(slot)) {
      failures.push({ slot, phase: "schema", refs: [], message: `${slot}.maxRank 必須為 ${defaultAbilityMaxRank(slot)}；已保留原值 ${source.maxRank}，請在最高階級欄位修正。` });
      continue;
    }
    const resolution = resolveTemplateExpansion(source as unknown as Record<string, unknown>, catalog);
    if (!resolution.ok) {
      failures.push({
        slot,
        phase: resolution.failure.phase,
        refs: resolution.failure.refs,
        message: resolution.failure.message,
      });
      continue;
    }
    // Validate authoring before resolving runtime-only defaults, exactly as
    // registration does. Preset resolution intentionally fills inactive runtime
    // fields; applying authoring refinements afterwards would reject valid docs.
    const parsed = zAbilityDoc.safeParse(fillRankColumns(resolution.merged, source.maxRank));
    if (!parsed.success) {
      failures.push({
        slot,
        phase: "schema",
        refs: resolution.refs,
        message: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      });
      continue;
    }
    if (parsed.data.maxRank !== defaultAbilityMaxRank(slot)) {
      failures.push({ slot, phase: "schema", refs: resolution.refs, message: `${slot}.maxRank 與遊戲升級規則不符。` });
      continue;
    }
    abilityDrafts[slot] = runtime.resolve(parsed.data);
  }

  if (failures.length > 0) return { ok: false, failures };

  const embedded = (slot: "Q" | "W" | "E" | "R") => {
    const { schema: _schema, ...ability } = abilityDrafts[slot];
    return ability;
  };
  const champion: ChampionDoc = {
    ...generated.champion,
    abilities: {
      Q: embedded("Q"),
      W: embedded("W"),
      E: embedded("E"),
      R: embedded("R"),
    },
  };
  return {
    ok: true,
    draft: {
      ...generated,
      champion: resolveChampionRuntimeStats(champion, configs),
      abilityDrafts,
      standaloneAbilities: [abilityDrafts.PASSIVE, abilityDrafts.EX],
    },
  };
}
