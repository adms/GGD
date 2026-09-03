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
  /** Exact brick selected by the deterministic one-click assembler. */
  readonly selectedVfxId: string | null;
  /**
   * An authored VFX that cannot be played as a standalone world-space brick.
   * The original binding remains untouched; only this editable baseline uses
   * the safe generic replacement.
   */
  readonly fallbackFromVfxId: string | null;
  /**
   * Hooks that are authored in Skill Forge's effect graph rather than as a
   * direct vfx-script@1 trigger. This is a routing note, not an engine blocker:
   * Main's hook vocabulary and spawnVfx/spawnModelFx effects are the supported
   * no-code path for these events.
   */
  readonly effectGraphHooks: readonly string[];
  /** Direct vfx-script timeline coverage is intentionally reported separately. */
  readonly scriptTimelineGaps: readonly string[];
  readonly blockers: readonly string[];
}

export interface BasicVisualBuildOptions {
  /**
   * VFX documents that require a host model/bone and therefore cannot be used
   * by a standalone `vfx` timeline segment. The caller derives this set from
   * the loaded VFX registry; no ability id or imported family is hard-coded.
   */
  readonly standaloneIneligibleVfxIds?: ReadonlySet<string>;
}

export const BASIC_VISUAL_SAFE_GENERIC_VFX_ID = "fx.prim.arcane.pulse";

export type BasicVisualProofSource =
  | "acceptance-fixture"
  | "editor-basic-script"
  | "runtime-effect-graph";

export interface BasicVisualProofRoute {
  readonly mode: "script" | "runtime";
  readonly source: BasicVisualProofSource;
  readonly script: VfxScriptDoc;
}

/**
 * Decide which presentation the 42/46 proof actually renders.
 *
 * A previous batch loaded the one-click Editor draft but rendered every
 * ordinary ability in `runtime` mode.  That could produce clean screenshots
 * while proving none of the bricks the designer had just assembled.  Active
 * skills therefore render their generated script over the real Sim schedule;
 * passive hooks that cannot address vfx-script@1 stay on their truthful
 * effect-graph/runtime route and are never disguised as a cast.
 */
export function basicVisualProofRoute(
  abilityId: string,
  fixture: VfxScriptDoc | null,
  basic: BasicVisualDraft,
): BasicVisualProofRoute {
  if (fixture) return { mode: "script", source: "acceptance-fixture", script: fixture };
  if (basic.script) return { mode: "script", source: "editor-basic-script", script: basic.script };
  return {
    mode: "runtime",
    source: "runtime-effect-graph",
    script: runtimeAuditPlaceholderScript(abilityId),
  };
}

const DIRECT_SCRIPT_HOOK = new Map<string, VfxScriptSegment["on"]>([
  ["onReflectSuccess", "reflectSuccess"],
]);

/**
 * Hooks whose successful proc cannot currently address a vfx-script@1 row.
 * This is derived from the ability graph, never from labels or prose.
 */
export function vfxScriptTimelineGaps(ability: unknown): string[] {
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
  options: BasicVisualBuildOptions = {},
): BasicVisualDraft {
  const activationMode = activationModeForAbility(ability);
  const scriptTimelineGaps = vfxScriptTimelineGaps(ability);
  const supportedReaction = [...hookEventsOf(ability)]
    .map((hook) => DIRECT_SCRIPT_HOOK.get(hook))
    .find((trigger): trigger is VfxScriptSegment["on"] => trigger !== undefined);
  if (activationMode === "passive" && supportedReaction === undefined) {
    return {
      script: null,
      visualSource: "none",
      selectedVfxId: null,
      fallbackFromVfxId: null,
      effectGraphHooks: scriptTimelineGaps,
      scriptTimelineGaps,
      blockers: [],
    };
  }

  const authoredVfx = firstVfxKey(ability);
  const fallbackFromVfxId = authoredVfx && options.standaloneIneligibleVfxIds?.has(authoredVfx)
    ? authoredVfx
    : null;
  const vfxId = singleArcReplacement(
    fallbackFromVfxId === null
      ? authoredVfx ?? BASIC_VISUAL_SAFE_GENERIC_VFX_ID
      : BASIC_VISUAL_SAFE_GENERIC_VFX_ID,
  );
  const visualSource = authoredVfx && fallbackFromVfxId === null ? "ability-vfx" : "safe-generic";
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
    selectedVfxId: vfxId,
    fallbackFromVfxId,
    effectGraphHooks: scriptTimelineGaps,
    scriptTimelineGaps,
    blockers: [],
  };
}

/**
 * Schema-valid, invisible placeholder used only while the batch renders an
 * ability's real runtime events. It is never offered for save/promotion and it
 * never fabricates castStart/castEffect for a passive ability.
 */
export function runtimeAuditPlaceholderScript(abilityId: string): VfxScriptDoc {
  return zVfxScriptDoc.parse({
    id: abilityId,
    schema: "vfx-script@1",
    abilityId,
    notes: "Editor runtime-only visual audit placeholder; not authoring content and never promotable.",
    segments: [{ kind: "sound", on: "reflectSuccess", soundKey: "editor.audit.silent" }],
  });
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
