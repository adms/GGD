import { ORIGIN_ATTACK_TYPE, archetypeForOrigin } from "../heroForge";
import type { Origin } from "../statNormalization";
import { DEFAULT_TEMPLATE_CONFLICT, type TemplateDoc } from "../schema/template";
import { defaultParamsFor } from "../templates/paramsSchema";
import { expand } from "../templates/expand";
import { HERO_PLAN_SCHEMA, HERO_SLOTS, type HeroSlot } from "./constants";
import { zHeroPlan, type HeroPlan, type HeroSourceLock } from "./plan";
import type { HeroSummary } from "./proposal";

export interface DeterministicPlannerInput {
  projectId: string;
  brief: Omit<HeroSummary, "sourceLock">;
  sourceLock: HeroSourceLock;
  origin: Origin;
  attackType?: "melee" | "ranged";
  availableTemplateIds: readonly string[];
  availableTemplates?: readonly TemplateDoc[];
}

const PROFILES = [
  { suffix: "steady", title: "穩健案", power: 48, complexity: 28, offset: 0 },
  { suffix: "balanced", title: "平衡案", power: 55, complexity: 45, offset: 1 },
  { suffix: "experimental", title: "實驗案", power: 62, complexity: 68, offset: 2 },
] as const;

const SLOT_TEMPLATE_PREFERENCES: Readonly<Record<HeroSlot, readonly string[]>> = {
  PASSIVE: ["tpl-on-attack", "tpl-on-hit-react", "tpl-mark-stacks"],
  Q: ["tpl-single-strike", "tpl-instant-blast", "tpl-line-sweep"],
  W: ["tpl-buff-self", "tpl-proxy-cast", "tpl-random-barrage"],
  E: ["tpl-leap-strike", "tpl-teleport", "tpl-charge-push"],
  R: ["tpl-ground-nova", "tpl-orbit-array", "tpl-traveling-wave"],
  EX: ["tpl-instant-blast", "tpl-lock-combo", "tpl-random-barrage"],
};

const PURPOSES: Readonly<Record<HeroSlot, string>> = {
  PASSIVE: "建立英雄的長期辨識度。",
  Q: "提供主要、可重複使用的輸出手段。",
  W: "補上防御、資源或狀態互動。",
  E: "提供位移或戰場位置調整。",
  R: "形成主要團戰節點。",
  EX: "提供高強度但有清楚風險的收尾手段。",
};

export function templateFitsHeroSlot(template: TemplateDoc, slot: HeroSlot): boolean {
  try {
    const passive = expand(template, defaultParamsFor(template)).innateKind === "passive";
    return slot === "PASSIVE" ? passive : !passive;
  } catch {
    return false;
  }
}

/** Editable starter values; authoring persists only explicit product choices. */
export function heroTemplateDefaultParams(template: TemplateDoc): Record<string, unknown> {
  const defaults = defaultParamsFor(template);
  // A zero-ICD reaction can bounce damage indefinitely between mirrored heroes.
  // This is an editable starter override, not a runtime balance rule.
  if ("internalCooldown" in template.params && !(Number(defaults.internalCooldown) > 0)) defaults.internalCooldown = 0.5;
  return defaults;
}

function pickTemplate(slot: HeroSlot, offset: number, available: readonly string[], catalog: ReadonlyMap<string, TemplateDoc>): string {
  const compatible = available.filter((id) => {
    const template = catalog.get(id);
    return template ? templateFitsHeroSlot(template, slot) : SLOT_TEMPLATE_PREFERENCES[slot].includes(id);
  });
  const preferred = SLOT_TEMPLATE_PREFERENCES[slot].filter((id) => compatible.includes(id));
  const candidates = preferred.length > 0 ? preferred : compatible;
  if (candidates.length === 0) throw new Error("Hero planner requires at least one allowlisted template.");
  return candidates[offset % candidates.length]!;
}

export function createDeterministicHeroPlans(input: DeterministicPlannerInput): readonly HeroPlan[] {
  const attackType = input.attackType ?? ORIGIN_ATTACK_TYPE[input.origin] ?? "melee";
  const templateById = new Map((input.availableTemplates ?? []).map((template) => [template.id, template]));
  return PROFILES.map((profile) => {
    const slots = Object.fromEntries(
      HERO_SLOTS.map((slot) => {
        const templateId = pickTemplate(slot, profile.offset, input.availableTemplateIds, templateById);
        const template = templateById.get(templateId);
        const defaultParams = template ? heroTemplateDefaultParams(template) : null;
        // A mirrored pair of zero-ICD on-hit reflect passives can bounce one
        // damage packet until the effect-operation guard stops the tick. The
        // designer may still choose zero explicitly, but generated candidates
        // must start from the safe, visibly editable value.
        const plannedParams = template && defaultParams && "internalCooldown" in template.params
          ? { internalCooldown: defaultParams.internalCooldown }
          : {};
        return [slot, {
          slot,
          name: input.brief.moveNames[slot] ?? `${input.brief.name}・${slot}`,
          purpose: PURPOSES[slot],
          products: [{ instanceId: `${slot.toLowerCase()}-1`, template: { ref: templateId, inheritDefaults: true, params: plannedParams ?? {} } }],
          templateConflictPolicy: DEFAULT_TEMPLATE_CONFLICT,
          tuning: {
            cooldownSec: slot === "PASSIVE" ? 0 : slot === "EX" ? 60 : 10,
            manaCost: slot === "PASSIVE" ? 0 : slot === "EX" ? 100 : 40,
            range: slot === "PASSIVE" ? 0 : 6,
          },
          capabilityIds: [...(templateById.get(templateId)?.requires ?? [])],
          directionOptionIds: [],
          fallbackOptionIds: [],
        }];
      }),
    );
    return zHeroPlan.parse({
      schema: HERO_PLAN_SCHEMA,
      planId: `${input.projectId.slice(0, 48)}.${profile.suffix}`,
      title: profile.title,
      summary: input.brief.concept,
      sourceLock: input.sourceLock,
      origin: input.origin,
      archetype: archetypeForOrigin(input.origin),
      attackType,
      budget: { power: profile.power, complexity: profile.complexity },
      statOverrides: {},
      slots,
    });
  });
}
