import type { VfxScriptDoc, VfxScriptSegment } from "@ggd/shared/content/schema/vfxScript";
import { isSingleArcVfxId } from "./presentationContract";

export interface ActionAnimationIssue {
  readonly code:
    | "CAST_ACTION_MISSING"
    | "TIMELINE_ACTION_MISSING"
    | "TARGET_REACTION_MISSING"
    | "SLASH_ACTION_MISSING"
    | "SLASH_OVERDRAWN"
    | "MULTI_CRESCENT_BRICK"
    | "PASSIVE_CAST_TRIGGER";
  readonly message: string;
  readonly segmentIndexes: readonly number[];
}

const AUTO_COMPLETABLE_ACTION_ISSUES = new Set<ActionAnimationIssue["code"]>([
  "CAST_ACTION_MISSING",
  "TIMELINE_ACTION_MISSING",
  "TARGET_REACTION_MISSING",
  "SLASH_ACTION_MISSING",
]);

/** True only when the safe fixer can solve at least one reported issue by adding actor pulses. */
export function hasAutoCompletableActionIssue(
  issues: readonly ActionAnimationIssue[],
): boolean {
  return issues.some((issue) => AUTO_COMPLETABLE_ACTION_ISSUES.has(issue.code));
}

export interface AbilityActivationConflict {
  readonly code: "ABILITY_ACTIVATION_CONFLICT";
  readonly descriptionMode: "active" | "passive";
  readonly runtimeMode: "active" | "passive";
  readonly message: string;
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
  /**
   * Authoritative cues emitted by the real SimWorld preview. These close the
   * blind spot where a combo/projectile hit exists in gameplay but the script
   * omitted every visible segment at that beat.
   */
  readonly requiredTimelineCues?: readonly ActionTimelineCue[];
}

export interface ActionTimelineCue {
  readonly on: VfxScriptSegment["on"];
  readonly strikeIndex?: number;
}

function isSlash(segment: VfxScriptSegment): boolean {
  return (segment.kind === "vfx" && (
    isSingleArcVfxId(segment.vfxId) || /(?:^|[.-])slash(?:[.-]|$)/i.test(segment.vfxId)
  )) ||
    (segment.kind === "modelFx" && /(?:^|[.-])(?:slash|crescent)(?:[.-]|$)/i.test(segment.modelKey));
}

/** Legacy slash primitives burst 26 crescents; receipted `.arc` bricks are the safe replacement. */
function isCurrentMultiCrescentBrick(segment: VfxScriptSegment): boolean {
  return segment.kind === "vfx" && /^fx\.prim\.[a-z0-9-]+\.slash(?:-lg)?$/i.test(segment.vfxId);
}

function actionActorFor(impact: VfxScriptSegment): "caster" | "target" {
  if (impact.on === "projectileHit") return "target";
  if (impact.kind === "bodyMove" && impact.at === "target") return "target";
  return "caster";
}

function requiredActionActors(impact: VfxScriptSegment): readonly ("caster" | "target")[] {
  // A combo strike is an authoritative damage beat, not just a presentation
  // anchor. Both bodies must visibly participate or a perfectly timed slash
  // can still pass while the victim remains a mannequin.
  if (impact.on === "strike") return ["caster", "target"];
  return [actionActorFor(impact)];
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

function actionCovers(
  action: VfxScriptSegment,
  impact: VfxScriptSegment,
  actor = actionActorFor(impact),
): boolean {
  if (!triggerMatches(action, impact, actor) || action.kind !== "anim") return false;
  const actionAt = action.atMs ?? 0;
  const impactAt = impact.atMs ?? 0;
  const window = action.clipWindowMs ?? 520;
  return impactAt >= Math.max(0, actionAt - 80) && impactAt <= actionAt + window;
}

function actionCoversCue(
  action: VfxScriptSegment,
  cue: ActionTimelineCue,
  actor: "caster" | "target",
): boolean {
  if (action.kind !== "anim" || (action.at ?? "target") !== actor || action.on !== cue.on) return false;
  if (cue.on === "strike" && action.strikeIndex !== undefined && action.strikeIndex !== cue.strikeIndex) return false;
  // Segment offsets are relative to the authoritative event. A reaction that
  // starts hundreds of milliseconds later cannot cover the hit itself.
  return (action.atMs ?? 0) <= 80;
}

function requiredActorsForCue(cue: ActionTimelineCue): readonly ("caster" | "target")[] {
  if (cue.on === "strike") return ["caster", "target"];
  if (cue.on === "projectileHit") return ["target"];
  return [];
}

function uniqueRequiredCues(cues: readonly ActionTimelineCue[]): ActionTimelineCue[] {
  const out: ActionTimelineCue[] = [];
  const seen = new Set<string>();
  for (const cue of cues) {
    if (requiredActorsForCue(cue).length === 0) continue;
    const key = `${cue.on}:${cue.strikeIndex ?? "each"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cue);
  }
  return out;
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
  const castActions = indexed.filter(
    ({ segment }) =>
      segment.kind === "anim" &&
      segment.at === "caster" &&
      (segment.on === "castStart" || segment.on === "castEffect"),
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
  // A strike/reaction pulse later in the timeline is not a cast action. Every
  // active script has at least one segment (schema min=1), so require an
  // explicit caster action on the actual cast channel even when the authored
  // presentation currently contains only sound, text, or target animation.
  if (!passive && castActions.length === 0) {
    issues.push({
      code: "CAST_ACTION_MISSING",
      message: "主動技能缺少施法者在 castStart／castEffect 的真正施展動作；後續 strike／反應動作不能冒充起手。",
      segmentIndexes: indexed.map(({ index }) => index),
    });
  }

  const allActions = indexed.filter(({ segment }) => segment.kind === "anim");
  for (const { segment, index } of visible) {
    // A passive never receives a fake cast, but a real reflect/strike/projectile
    // event can and should animate the reacting actor. Purely periodic/passive
    // effects stay in hook.effects because vfx-script has no such trigger.
    if (passive && (segment.on === "castStart" || segment.on === "castEffect")) continue;
    for (const actor of requiredActionActors(segment)) {
      if (allActions.some(({ segment: action }) => actionCovers(action, segment, actor))) continue;
      const targetReaction = actor === "target" && segment.on === "strike";
      issues.push({
        code: targetReaction
          ? "TARGET_REACTION_MISSING"
          : isSlash(segment) ? "SLASH_ACTION_MISSING" : "TIMELINE_ACTION_MISSING",
        message: targetReaction
          ? "斬擊傷害節點有施法者動作，但缺少同一刀的目標受擊反應。"
          : isSlash(segment)
            ? "斬擊特效沒有同一傷害節點的角色攻擊動作。"
            : "時間軸的可見／傷害／位移節點沒有相同觸發與時間窗的角色動作。",
        segmentIndexes: [index],
      });
    }
  }

  // Gameplay truth can own a damage beat even when the authored script owns no
  // particle/model/bodyMove at that trigger. Use only real SimWorld cues; never
  // infer a combo from prose or from a convenient fan of slash sprites.
  for (const cue of uniqueRequiredCues(options.requiredTimelineCues ?? [])) {
    const relatedVisible = visible.some(({ segment }) =>
      segment.on === cue.on &&
      (cue.on !== "strike" || segment.strikeIndex === undefined || segment.strikeIndex === cue.strikeIndex),
    );
    // A visible beat already went through the stricter action-window check
    // above. This branch exists only for the otherwise invisible gameplay beat.
    if (relatedVisible) continue;
    for (const actor of requiredActorsForCue(cue)) {
      if (allActions.some(({ segment }) => actionCoversCue(segment, cue, actor))) continue;
      const targetReaction = actor === "target";
      issues.push({
        code: targetReaction ? "TARGET_REACTION_MISSING" : "TIMELINE_ACTION_MISSING",
        message: targetReaction
          ? `真 ${cue.on}${cue.strikeIndex ? ` #${cue.strikeIndex}` : ""} 傷害點缺少目標受擊反應。`
          : `真 ${cue.on}${cue.strikeIndex ? ` #${cue.strikeIndex}` : ""} 傷害點缺少施法者攻擊動作。`,
        segmentIndexes: [],
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
  // Mirror Main's cast ladder exactly:
  //   innateCastBlock(def) runs first and opens PASSIVE only for
  //   innateKind:"active"; every other PASSIVE shape remains uncastable.
  // `innateKind` is schema-forbidden on Q/W/E/R/EX, so it must never override
  // their effect shape here either.
  if (record.slot === "PASSIVE") {
    return record.innateKind === "active" ? "active" : "passive";
  }
  // Passive enhancements can live in Q/W/E/R/EX. They are pure passive only
  // when a passive rank block exists and effects is empty (`isPassiveOnly`);
  // hybrid skills keep their active action path while the passive panel still
  // exposes the reactive half.
  const hasPassive = typeof record.passive === "object" && record.passive !== null;
  const activeEffects = Array.isArray(record.effects) && record.effects.length > 0;
  return hasPassive && !activeEffects ? "passive" : "active";
}

/**
 * Detect only an explicit [主動]/[被動] header contradiction. Historical
 * prose uses many other labels ([主動攻擊], [輔助], [靈氣]…), so absence of an
 * exact tag is intentionally not guessed. This guard never changes Owner text
 * or runtime structure; it only prevents authoring VFX against two conflicting
 * truths.
 */
export function activationConflictForAbility(ability: unknown): AbilityActivationConflict | null {
  if (typeof ability !== "object" || ability === null) return null;
  const record = ability as Record<string, unknown>;
  if (typeof record.description !== "string") return null;
  const header = record.description.trimStart().split(/\r?\n/, 1)[0]?.replaceAll("**", "") ?? "";
  const tags = new Set([...header.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]));
  const explicitActive = tags.has("主動");
  const explicitPassive = tags.has("被動");
  // [主動][被動] is an intentional hybrid declaration; the runtime remains
  // castable while the passive panel covers its reactive half.
  if (explicitActive === explicitPassive) return null;
  const descriptionMode = explicitActive ? "active" : "passive";
  const runtimeMode = activationModeForAbility(record);
  if (descriptionMode === runtimeMode) return null;
  return {
    code: "ABILITY_ACTIVATION_CONFLICT",
    descriptionMode,
    runtimeMode,
    message: descriptionMode === "passive"
      ? "技能說明標示[被動]，但 Main 結構會走主動施放；Editor 仍預覽真 runtime，但一致前禁止送審。"
      : "技能說明標示[主動]，但 Main 結構會拒絕施放；Editor 仍預覽真 runtime，但一致前禁止送審。",
  };
}

/** Add only missing action bricks; callers still run actionAnimationIssues. */
export function completeActionAnimations(
  segments: readonly VfxScriptSegment[],
  options: Pick<ActionAnimationOptions, "activationMode" | "requiredTimelineCues"> = {},
): VfxScriptSegment[] {
  const completed = [...segments];
  const visible = segments.filter((segment) => VISIBLE_KINDS.has(segment.kind));
  const passive = options.activationMode === "passive";
  const hasCastAction = completed.some(
    (segment) =>
      segment.kind === "anim" &&
      segment.at === "caster" &&
      (segment.on === "castStart" || segment.on === "castEffect"),
  );

  // Every authored active/reaction scene starts with an actual actor, even if
  // the only original brick is sound, flash or hideBody. Pick a trigger that
  // can really fire for this script; never invent a behavior event.
  if (!passive && segments.length > 0 && !hasCastAction) {
    completed.unshift({
      kind: "anim",
      on: "castStart",
      at: "caster",
      pulse: "cast",
      clipWindowMs: 650,
    });
  }

  // One action can cover several particle/model layers inside the same time
  // window. A later beat, another strikeIndex, projectile impact or body move
  // gets its own actor pulse instead of leaving the model frozen behind VFX.
  for (const impact of visible) {
    if (passive && (impact.on === "castStart" || impact.on === "castEffect")) continue;
    for (const actor of requiredActionActors(impact)) {
      if (completed.some((action) => actionCovers(action, impact, actor))) continue;
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
          : impact.on === "reflectSuccess"
            ? "guard"
            : impact.on === "castStart"
              ? "cast"
              : "attack",
        clipWindowMs: impact.kind === "bodyMove" ? Math.max(520, impact.durationMs) : 650,
      });
    }
  }

  // If gameplay emits a beat that has no presentation brick at all, add actor
  // pulses directly on that proven trigger. The first missing actor receives a
  // generic strike pulse (covers every index); when the author already chose
  // per-index actions, preserve that granularity and fill only the missing one.
  for (const cue of uniqueRequiredCues(options.requiredTimelineCues ?? [])) {
    for (const actor of requiredActorsForCue(cue)) {
      if (completed.some((action) => actionCoversCue(action, cue, actor))) continue;
      const alreadySpecific = completed.some((action) =>
        action.kind === "anim" && action.on === cue.on && (action.at ?? "target") === actor,
      );
      completed.push({
        kind: "anim",
        on: cue.on,
        ...(cue.on === "strike" && cue.strikeIndex !== undefined && alreadySpecific
          ? { strikeIndex: cue.strikeIndex }
          : {}),
        at: actor,
        pulse: actor === "target" ? "hurt" : "attack",
        clipWindowMs: 650,
      });
    }
  }
  return completed;
}
