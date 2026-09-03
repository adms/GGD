import {
  zVfxScriptDoc,
  type VfxScriptDoc,
  type VfxScriptSegment,
} from "@ggd/shared/content/schema/vfxScript";
import {
  activationModeForAbility,
  completeActionAnimations,
  type ActionTimelineCue,
} from "./actionAnimationPrinciples";
import type { ForgeAbility } from "./model";

export interface BasicVisualAbility extends ForgeAbility {
  readonly castType?: string;
  readonly vfxKey?: string;
  readonly vfxLayers?: { vfxKey?: string }[];
}

export interface BasicVisualDraft {
  readonly script: VfxScriptDoc | null;
  readonly visualSource: "ability-vfx" | "safe-generic" | "none";
  readonly unsupportedHooks: readonly string[];
  readonly blockers: readonly string[];
}

const DIRECT_SCRIPT_HOOK = new Map<string, VfxScriptSegment["on"]>([
  ["onReflectSuccess", "reflectSuccess"],
]);

/**
 * Hooks whose successful proc cannot currently address a vfx-script@1 row.
 * This is derived from the ability graph, never from labels or prose.
 */
export function unsupportedCustomVisualHooks(ability: unknown): string[] {
  return [...hookEventsOf(ability)]
    .filter((hook) => !DIRECT_SCRIPT_HOOK.has(hook))
    .sort();
}

/**
 * One-click, editable baseline assembled only from shipped bricks.
 *
 * It is intentionally a starting point, not an artistic pass.  The result
 * always contains a real actor action and uses the ability's existing visual
 * family when available.  Unsupported reactive events are returned as loud
 * blockers instead of being faked with castStart.
 */
export function buildBasicVisualDraft(
  ability: BasicVisualAbility,
  requiredTimelineCues: readonly ActionTimelineCue[] = [],
): BasicVisualDraft {
  const activationMode = activationModeForAbility(ability);
  const unsupportedHooks = unsupportedCustomVisualHooks(ability);
  const supportedReaction = [...hookEventsOf(ability)]
    .map((hook) => DIRECT_SCRIPT_HOOK.get(hook))
    .find((trigger): trigger is VfxScriptSegment["on"] => trigger !== undefined);
  if (activationMode === "passive" && supportedReaction === undefined) {
    return {
      script: null,
      visualSource: "none",
      unsupportedHooks,
      blockers: [
        `純被動的真正觸發點尚不能由 vfx-script@1 選取：${unsupportedHooks.join("、") || "未知 hook"}`,
      ],
    };
  }

  const authoredVfx = firstVfxKey(ability);
  const vfxId = singleArcReplacement(authoredVfx ?? "fx.prim.arcane.pulse");
  const visualSource = authoredVfx ? "ability-vfx" : "safe-generic";
  const on: VfxScriptSegment["on"] = activationMode === "passive"
    ? supportedReaction!
    : "castEffect";
  const at: "self" | "target" | "point" = activationMode === "passive" || ability.castType === "self"
    ? "self"
    : ability.castType === "targeted"
      ? "target"
      : "point";
  const segments: VfxScriptSegment[] = [{
    kind: "vfx",
    on,
    vfxId,
    at,
    durationSec: 0.7,
    ...(vfxId.endsWith(".arc") ? { w3xScale: 1.8 } : {}),
  }];
  const completed = completeActionAnimations(segments, { activationMode, requiredTimelineCues });
  return {
    script: zVfxScriptDoc.parse({
      id: ability.id,
      schema: "vfx-script@1",
      abilityId: ability.id,
      notes: "基本視覺建議：由 Editor 依真實技能結構與既有 VFX 積木產生；仍須人工調整及畫面驗收。",
      segments: completed,
    }),
    visualSource,
    unsupportedHooks,
    blockers: unsupportedHooks.length > 0
      ? [`主動段可預覽，但下列被動／追加階段無法自訂時間軸：${unsupportedHooks.join("、")}`]
      : [],
  };
}

function firstVfxKey(ability: BasicVisualAbility): string | null {
  if (typeof ability.vfxKey === "string" && ability.vfxKey !== "") return ability.vfxKey;
  for (const layer of ability.vfxLayers ?? []) {
    if (typeof layer.vfxKey === "string" && layer.vfxKey !== "") return layer.vfxKey;
  }
  return findNestedVfxKey(ability.effects) ?? findNestedVfxKey(ability.passive);
}

function findNestedVfxKey(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findNestedVfxKey(child);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.kind === "spawnVfx" && typeof record.vfxId === "string") return record.vfxId;
  for (const child of Object.values(record)) {
    const found = findNestedVfxKey(child);
    if (found) return found;
  }
  return null;
}

function hookEventsOf(value: unknown): Set<string> {
  const out = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record.on === "string" && /^on[A-Z]/.test(record.on)) out.add(record.on);
    for (const child of Object.values(record)) visit(child);
  };
  visit(value);
  return out;
}

/** Replace the legacy 26-crescent primitive with Main's same-family single arc. */
function singleArcReplacement(id: string): string {
  const match = /^fx\.prim\.([a-z0-9-]+)\.slash(?:-lg)?$/i.exec(id);
  return match ? `fx.prim.${match[1]}.arc` : id;
}
