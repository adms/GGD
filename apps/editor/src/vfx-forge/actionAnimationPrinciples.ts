import type { VfxScriptDoc, VfxScriptSegment } from "@ggd/shared/content/schema/vfxScript";

export interface ActionAnimationIssue {
  readonly code:
    | "CAST_ACTION_MISSING"
    | "TIMELINE_ACTION_MISSING"
    | "SLASH_ACTION_MISSING"
    | "SLASH_OVERDRAWN"
    | "MULTI_CRESCENT_BRICK"
    | "PASSIVE_CAST_TRIGGER";
  readonly message: string;
  readonly segmentIndexes: readonly number[];
}

const VISIBLE_KINDS = new Set<VfxScriptSegment["kind"]>(["vfx", "modelFx", "bodyMove"]);

export interface ActionAnimationOptions {
  /**
   * True only when the authoritative ability graph contains comboStrikes.
   * A VFX arrangement is never allowed to declare itself a rapid barrage.
   */
  readonly allowRapidBarrage?: boolean;
  /** Passive skills react to combat events; they must never be given a fake cast. */
  readonly activationMode?: "active" | "passive";
}

function isSlash(segment: VfxScriptSegment): boolean {
  return (segment.kind === "vfx" && /(?:^|[.-])slash(?:[.-]|$)/i.test(segment.vfxId)) ||
    (segment.kind === "modelFx" && /(?:^|[.-])(?:slash|crescent)(?:[.-]|$)/i.test(segment.modelKey));
}

/** Main's current slash primitives each burst 26 crescent sprites. */
function isCurrentMultiCrescentBrick(segment: VfxScriptSegment): boolean {
  return segment.kind === "vfx" && /^fx\.prim\.[a-z0-9-]+\.slash(?:-lg)?$/i.test(segment.vfxId);
}

function actionActorFor(impact: VfxScriptSegment): "caster" | "target" {
  if (impact.on === "projectileHit") return "target";
  if (impact.kind === "bodyMove" && impact.at === "target") return "target";
  return "caster";
}

function triggerMatches(
  action: VfxScriptSegment,
  impact: VfxScriptSegment,
  actor = actionActorFor(impact),
): boolean {
  if (action.kind !== "anim" || (action.at ?? "target") !== actor || action.on !== impact.on) return false;
  if (impact.on !== "strike") return true;
  return action.strikeIndex === undefined || action.strikeIndex === impact.strikeIndex;
}

function actionCovers(action: VfxScriptSegment, impact: VfxScriptSegment): boolean {
  if (!triggerMatches(action, impact) || action.kind !== "anim") return false;
  const actionAt = action.atMs ?? 0;
  const impactAt = impact.atMs ?? 0;
  const window = action.clipWindowMs ?? 520;
  return impactAt >= Math.max(0, actionAt - 80) && impactAt <= actionAt + window;
}

function rapidBarrage(slashes: readonly VfxScriptSegment[]): boolean {
  if (slashes.length < 3) return false;
  const timed = slashes
    .filter((segment): segment is Extract<VfxScriptSegment, { kind: "vfx" }> => segment.kind === "vfx")
    .map((segment) => ({ at: segment.atMs ?? 0, scale: segment.w3xScale ?? 1 }))
    .sort((a, b) => a.at - b.at);
  if (timed.some((entry) => entry.scale > 1.15)) return false;
  if (timed[timed.length - 1]!.at - timed[0]!.at > 900) return false;
  return timed.slice(1).every((entry, index) => entry.at - timed[index]!.at >= 45);
}

/**
 * Deterministic authoring guard for melee readability.
 *
 * - every active visual recipe owns at least one caster action;
 * - every strike/movement beat is covered by an action window;
 * - one ordinary action window owns one large slash, not a fan of crescents;
 * - a true rapid barrage is the narrow exception: 3+ small, time-separated arcs.
 *
 * This inspects presentation only. It never guesses damage or movement truth.
 */
export function actionAnimationIssues(
  doc: VfxScriptDoc,
  options: ActionAnimationOptions = {},
): ActionAnimationIssue[] {
  const issues: ActionAnimationIssue[] = [];
  const indexed = doc.segments.map((segment, index) => ({ segment, index }));
  const visible = indexed.filter(({ segment }) => VISIBLE_KINDS.has(segment.kind));
  const actions = indexed.filter(
    ({ segment }) => segment.kind === "anim" && segment.at === "caster",
  );

  const passive = options.activationMode === "passive";
  if (passive) {
    const fakeCast = indexed.filter(
      ({ segment }) => segment.on === "castStart" || segment.on === "castEffect",
    );
    if (fakeCast.length > 0) {
      issues.push({
        code: "PASSIVE_CAST_TRIGGER",
        message: "純被動技能不能使用 castStart／castEffect；請綁到真正的命中、防禦、反彈或其他權威事件。",
        segmentIndexes: fakeCast.map(({ index }) => index),
      });
    }
  }
  if (!passive && doc.segments.some((segment) => segment.kind !== "anim") && actions.length === 0) {
    issues.push({
      code: "CAST_ACTION_MISSING",
      message: "技能有可見演出，但沒有施法者的施展／攻擊動作。",
      segmentIndexes: visible.map(({ index }) => index),
    });
  }

  const allActions = indexed.filter(({ segment }) => segment.kind === "anim");
  for (const { segment, index } of visible) {
    // A passive never receives a fake cast, but a real reflect/strike/projectile
    // event can and should animate the reacting actor. Purely periodic/passive
    // effects stay in hook.effects because vfx-script has no such trigger.
    if (passive && (segment.on === "castStart" || segment.on === "castEffect")) continue;
    if (!allActions.some(({ segment: action }) => actionCovers(action, segment))) {
      issues.push({
        code: isSlash(segment) ? "SLASH_ACTION_MISSING" : "TIMELINE_ACTION_MISSING",
        message: isSlash(segment)
          ? "斬擊特效沒有同一傷害節點的角色攻擊動作。"
          : "時間軸的可見／傷害／位移節點沒有相同觸發與時間窗的角色動作。",
        segmentIndexes: [index],
      });
    }
  }

  for (const { segment, index } of indexed) {
    if (!isCurrentMultiCrescentBrick(segment)) continue;
    issues.push({
      code: "MULTI_CRESCENT_BRICK",
      message: "這顆現有 slash 積木本身會一次發出26個月牙；一般斬擊必須改用 Main 提供的 single-arc 積木。",
      segmentIndexes: [index],
    });
  }

  const slashGroups = new Map<string, { segment: VfxScriptSegment; index: number }[]>();
  for (const entry of indexed.filter(({ segment }) => isSlash(segment))) {
    // A generic strike segment means "once per strike"; it shares one action
    // window with every other generic strike segment. Specific strikeIndex
    // groups remain independent damage points.
    const key = `${entry.segment.on}:${entry.segment.strikeIndex ?? "each"}`;
    const group = slashGroups.get(key) ?? [];
    group.push(entry);
    slashGroups.set(key, group);
  }
  for (const group of slashGroups.values()) {
    const slashes = group.map(({ segment }) => segment);
    if (slashes.length <= 1 || (options.allowRapidBarrage === true && rapidBarrage(slashes))) continue;
    issues.push({
      code: "SLASH_OVERDRAWN",
      message: "一個普通攻擊動作只能搭配一個主斬擊；多個小斬光只保留給明確的極速連斬。",
      segmentIndexes: group.map(({ index }) => index),
    });
  }
  return issues;
}

/**
 * Proves that an ability, not its VFX, owns a real rapid multi-strike mechanic.
 * This intentionally only recognizes the authoritative effect kind. Names,
 * notes and a convenient cluster of little arcs are not evidence.
 */
export function hasAuthoritativeRapidMultiStrike(ability: unknown): boolean {
  const seen = new Set<object>();
  const visit = (value: unknown): boolean => {
    if (typeof value !== "object" || value === null) return false;
    if (seen.has(value)) return false;
    seen.add(value);
    if (Array.isArray(value)) return value.some(visit);
    const record = value as Record<string, unknown>;
    if (record.kind === "comboStrikes") return true;
    return Object.values(record).some(visit);
  };
  return visit(ability);
}

export function activationModeForAbility(ability: unknown): "active" | "passive" {
  if (typeof ability !== "object" || ability === null) return "active";
  const record = ability as Record<string, unknown>;
  if (record.slot === "PASSIVE" || record.innateKind === "passive") return "passive";
  // Passive enhancements can live in Q/W/E/R/EX. They are pure passive only
  // when a passive rank block exists and there is no active effect payload;
  // hybrid skills keep their active action path while the passive panel still
  // exposes the reactive half.
  const hasPassive = typeof record.passive === "object" && record.passive !== null;
  const activeEffects = Array.isArray(record.effects) && record.effects.length > 0;
  return hasPassive && !activeEffects ? "passive" : "active";
}

/** Add only missing action bricks; callers still run actionAnimationIssues. */
export function completeActionAnimations(
  segments: readonly VfxScriptSegment[],
  options: Pick<ActionAnimationOptions, "activationMode"> = {},
): VfxScriptSegment[] {
  const completed = [...segments];
  const visible = segments.filter((segment) => VISIBLE_KINDS.has(segment.kind));
  const passive = options.activationMode === "passive";
  const hasCasterAction = completed.some(
    (segment) => segment.kind === "anim" && segment.at === "caster",
  );

  // Every authored active/reaction scene starts with an actual actor, even if
  // the only original brick is sound, flash or hideBody. Pick a trigger that
  // can really fire for this script; never invent a behavior event.
  if (!passive && segments.some((segment) => segment.kind !== "anim") && !hasCasterAction) {
    const first = visible[0] ?? segments[0]!;
    const on = first.on === "reflectSuccess"
      ? "reflectSuccess"
      : first.on === "strike"
        ? "strike"
        : "castStart";
    completed.unshift({
      kind: "anim",
      on,
      ...(on === "strike" && first.strikeIndex !== undefined
        ? { strikeIndex: first.strikeIndex }
        : {}),
      at: "caster",
      pulse: on === "strike" ? "attack" : "cast",
      clipWindowMs: 650,
    });
  }

  // One action can cover several particle/model layers inside the same time
  // window. A later beat, another strikeIndex, projectile impact or body move
  // gets its own actor pulse instead of leaving the model frozen behind VFX.
  for (const impact of visible) {
    if (passive && (impact.on === "castStart" || impact.on === "castEffect")) continue;
    if (completed.some((action) => actionCovers(action, impact))) continue;
    const actor = actionActorFor(impact);
    completed.push({
      kind: "anim",
      on: impact.on,
      ...(impact.atMs === undefined ? {} : { atMs: impact.atMs }),
      ...(impact.on === "strike" && impact.strikeIndex !== undefined
        ? { strikeIndex: impact.strikeIndex }
        : {}),
      at: actor,
      pulse: actor === "target"
        ? "hurt"
        : impact.on === "castStart" || impact.on === "reflectSuccess"
          ? "cast"
          : "attack",
      clipWindowMs: impact.kind === "bodyMove" ? Math.max(520, impact.durationMs) : 650,
    });
  }
  return completed;
}
