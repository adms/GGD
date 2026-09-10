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
import { zVfxScriptDoc, type VfxScriptAuthoredDoc, type VfxScriptDoc } from "../schema/vfxScript";
import { expandVfxScriptDoc } from "../vfxSubtypes/expand";
import type { VfxSubtypeDoc } from "../schema/vfxSubtype";
import { heroTemplateInstanceCard, heroTemplateInstances } from "./templateVersions";
import { heroNeedsCounterpart, instantiateHeroBodies } from "./forms";
import { championRoster } from "../statNormalization";

export interface HeroDraftGeneratorOptions {
  heroId: string;
  heroName: string;
  modelKey?: string;
  medians?: StatMedians;
  templateParamsById?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  presentation?: HeroPresentation;
}

export interface GeneratedHeroDraft {
  templateInstances?: readonly TemplateDoc[];
  champion: ChampionDoc;
  relatedChampions: readonly ChampionDoc[];
  abilityDrafts: Readonly<Record<HeroSlot, AbilityDoc>>;
  standaloneAbilities: readonly [AbilityDoc, AbilityDoc];
  vfxScripts: readonly VfxScriptAuthoredDoc[];
  warnings: readonly ForgeWarning[];
}

export type CompiledHeroDraft = Omit<GeneratedHeroDraft, "vfxScripts"> & {
  /**
   * ⭐ **展開後**的 script —— 給編輯器預覽用（它要看到最終長什麼樣）。
   * ⛔⛔ **不要拿它當出貨文件**：展開＝把 `content/vfx-subtypes/` 那塊積木的段落
   * **烘平**進來 ⇒ 那塊積木從此有了 N 個住處（第〇·四守則）。
   */
  vfxScripts: readonly VfxScriptDoc[];
  /**
   * ⭐⭐ **作者稿**（保留 `call`）—— ⭐ 這一份才是要寫進 `content/` 的。
   *
   * ⚠️ ⭐ 出貨的載入器**自己會展開**（`registries.ts` 的 `expandVfxScriptDoc()`）
   * ⇒ ⭐ 送作者稿出去，玩家看到的東西**一模一樣**，⛔ 而積木仍然只有一個住處。
   *
   * ⚠️⚠️ ⭐ 這一格是**踩出來的**：在它出現之前 `heroPackage.ts` 寫的是展開後的那一份
   * ⇒ ⭐ 七名 LOL 英雄的 `.r` 一上架就是烘平的，⛔ 而作者稿裡明明寫著 `call`。
   */
  authoredVfxScripts: readonly VfxScriptAuthoredDoc[];
};

export interface HeroDraftCompileFailure {
  slot: HeroSlot;
  phase: TemplateFailurePhase | "schema";
  refs: readonly string[];
  message: string;
}

export type CompiledHeroDraftResult =
  | { ok: true; draft: CompiledHeroDraft }
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
  const cards = slotPlan.products.map(({ template }) => heroTemplateInstanceCard(plan, template));
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
    ...instantiateHeroBodies(champion, HERO_SLOTS.some((slot) => plan.slots[slot].capabilityIds.includes("championForm"))),
    ...(plan.templateVersions ? { templateInstances: heroTemplateInstances(plan) } : {}),
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
  vfxSubtypes: readonly VfxSubtypeDoc[] = [],
): CompiledHeroDraftResult {
  const catalog = new Map(templates.map((template) => [template.id, template]));
  for (const template of generated.templateInstances ?? []) catalog.set(template.id, template);
  const runtime = createRuntimeResolver(catalog, configs);
  const abilityDrafts = {} as Record<HeroSlot, AbilityDoc>;
  const failures: HeroDraftCompileFailure[] = [];
  const subtypeCatalog = new Map(vfxSubtypes.map((doc) => [doc.id, doc]));
  const vfxScripts: VfxScriptDoc[] = [];
  for (const script of generated.vfxScripts) {
    try { vfxScripts.push(expandVfxScriptDoc(script, (id) => subtypeCatalog.get(id))); }
    catch (error) { failures.push({ slot: HERO_SLOTS.find((slot) => generated.abilityDrafts[slot].id === script.abilityId) ?? "Q", phase: "schema", refs: [script.id], message: String(error) }); }
  }

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
    // Main intentionally discards duplicate effect kinds and effects on pure
    // passives. In a live authoring form that must be a visible error, never a
    // successful package that silently loses the author's extra behavior.
    if (source.effects.length > 0) {
      const base = resolveTemplateExpansion({ ...source, effects: [] } as unknown as Record<string, unknown>, catalog);
      if (base.ok) {
        const baseEffects = base.merged.effects;
        const kinds = new Set(Array.isArray(baseEffects) ? baseEffects.map((effect: { kind: string }) => effect.kind) : []);
        const conflicts = source.effects.flatMap((effect, index) => !Array.isArray(baseEffects) || baseEffects.length === 0 || kinds.has(effect.kind)
          ? [`abilityOverrides.effects.${index}: ${effect.kind} ${!Array.isArray(baseEffects) || baseEffects.length === 0 ? "無主動產品可執行追加效果" : "已由產品產出，請改產品參數或加入另一個產品"}`] : []);
        if (conflicts.length) { failures.push({ slot, phase: "schema", refs: resolution.refs, message: conflicts.join("; ") }); continue; }
      }
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
  // Planned capabilities are hints; the compiled executable graph is authoritative.
  const needsCounterpart = heroNeedsCounterpart(Object.values(abilityDrafts));
  const bodies = instantiateHeroBodies(champion, needsCounterpart);
  const roster = championRoster([bodies.champion, ...bodies.relatedChampions]);
  const resolved = resolveChampionRuntimeStats(bodies.champion, configs, roster);
  // Start both bodies from the resolved base. Transform bonuses live in skills;
  // the shared resolver still applies the configured form/origin policy.
  const runtimeBodies = instantiateHeroBodies(resolved, needsCounterpart);
  const runtimeRoster = championRoster([runtimeBodies.champion, ...runtimeBodies.relatedChampions]);
  return {
    ok: true,
    draft: {
      ...generated,
      vfxScripts,
      // ⭐ 作者稿原樣帶出去 —— ⛔ 出貨要用這一份（見型別上的說明）。
      authoredVfxScripts: generated.vfxScripts,
      champion: runtimeBodies.champion,
      relatedChampions: runtimeBodies.relatedChampions.map((body) => resolveChampionRuntimeStats(body, configs, runtimeRoster)),
      abilityDrafts,
      standaloneAbilities: [abilityDrafts.PASSIVE, abilityDrafts.EX],
    },
  };
}
