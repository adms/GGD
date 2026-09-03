import type { VfxScriptDoc, VfxScriptSegment } from "@ggd/shared/content/schema/vfxScript";
import { zVfxScriptSegment } from "@ggd/shared/content/schema/vfxScript";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import type { PreviewActorPose, PreviewTraceEvent } from "../preview/PreviewController";
import { eventOriginBelongsToAbility } from "../preview/eventOwnership";

export type AssetDrop = { collection: "models" | "vfx"; id: string };
export type AssetPlacement = { forwardU: number; sideU: number };

/** One authoring vocabulary shared by the add toolbar and its acceptance gate. */
export const VFX_FORGE_SEGMENT_KINDS = [
  "modelFx",
  "vfx",
  "floatingText",
  "screenFlash",
  "screenShake",
  "sound",
  "anim",
  "bodyMove",
  "hideBody",
] as const satisfies readonly VfxScriptSegment["kind"][];

export interface ForgeAbility {
  id: string;
  name?: string;
  slot?: string;
  castType?: string;
  castTimeSec?: number;
  effects?: unknown[];
  passive?: unknown;
  vfxKey?: string;
  vfxLayers?: { vfxKey?: string }[];
}

export type ForgeReactionTrigger = "reflectSuccess";

export interface ScheduledSimEvent {
  atMs: number;
  event: EventMessage;
  actorPose?: PreviewActorPose;
}

export interface TriggerCue {
  on: VfxScriptSegment["on"];
  atMs: number;
  strikeIndex?: number;
  label: string;
}

/**
 * Convert the actual SimWorld event trace to a frame clock. No ability timing
 * is recomputed here: if the sim did not emit an event, Forge cannot play it.
 */
export function scheduleSimEvents(
  events: readonly PreviewTraceEvent[],
  abilityId: string,
): ScheduledSimEvent[] {
  const cast = events.find((event) => event.type === "abilityCast" && event.data["abilityId"] === abilityId);
  const reaction = events.find((event) => event.type === "reflectSuccess");
  const baseTick = cast?.tick ?? reaction?.tick ?? events.reduce((min, event) => Math.min(min, event.tick), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(baseTick)) return [];
  // Reactive previews first cast a separate enabler, then inject one incoming
  // hit so the selected passive can react through the real SimWorld path.  The
  // enabler is not part of the selected ability's presentation.  Clamping its
  // earlier ticks to zero made every setup telegraph, pillar and arc explode in
  // one white frame at the start of the EX timeline.  Start the schedule at the
  // selected cast/reaction instead; everything from that point onward remains
  // the exact event order emitted by SimWorld.
  return events
    .filter((event) => event.tick >= baseTick)
    .map((event) => ({
      atMs: (event.tick - baseTick) * SIM_TICK_MS,
      event: event as EventMessage,
      ...(event.actorPose ? { actorPose: event.actorPose } : {}),
    }));
}

export function triggerCuesFromSim(
  schedule: readonly ScheduledSimEvent[],
  ability: ForgeAbility,
): TriggerCue[] {
  const projectileIds = projectileIdsOf(ability);
  const cast = schedule.find(
    ({ event }) => event.type === "abilityCast" && event.data.abilityId === ability.id,
  );
  const cues: TriggerCue[] = [];
  if (cast) {
    const caster = cast.event.data.caster;
    const began = schedule.some(
      ({ event }) => event.type === "castBegin" && event.data.abilityId === ability.id && event.data.caster === caster,
    );
    const end = schedule.find(
      ({ event }) => event.type === "castEnd" && event.data.abilityId === ability.id && event.data.caster === caster,
    );
    cues.push({ on: "castStart", atMs: cast.atMs, label: "施法提交" });
    if (!began || end) {
      cues.push({
        on: "castEffect",
        atMs: end?.atMs ?? cast.atMs,
        label: end ? "吟唱完成" : "立即結算",
      });
    }
  }
  for (const item of schedule) {
    const data = item.event.data;
    if (item.event.type === "reflectSuccess" && eventOriginBelongsToAbility(data.origin, ability.id)) {
      cues.push({ on: "reflectSuccess", atMs: item.atMs, label: "反彈成功" });
    } else if (item.event.type === "comboStrike" && eventOriginBelongsToAbility(data.origin, ability.id)) {
      const strikeIndex = Number(data.index ?? 0);
      cues.push({ on: "strike", atMs: item.atMs, strikeIndex, label: `第 ${strikeIndex} 段` });
    } else if (
      (item.event.type === "projectileSpawn" || item.event.type === "projectileHit") &&
      projectileIds.has(String(data.projectileId ?? ""))
    ) {
      cues.push({ on: item.event.type, atMs: item.atMs, label: item.event.type === "projectileSpawn" ? "彈道生成" : "彈道命中" });
    }
  }
  return cues.sort((a, b) => a.atMs - b.atMs || (a.strikeIndex ?? 0) - (b.strikeIndex ?? 0));
}

/** Map shipped hook vocabulary to the VFX-script trigger without skill IDs. */
export function reactionTriggerOf(ability: ForgeAbility): ForgeReactionTrigger | null {
  const visit = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(visit);
    if (value === null || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    if (record["on"] === "onReflectSuccess") return true;
    return Object.values(record).some(visit);
  };
  return visit(ability.passive) || visit(ability.effects) ? "reflectSuccess" : null;
}

export function projectileIdsOf(ability: ForgeAbility): ReadonlySet<string> {
  const ids = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) { for (const child of node) visit(child); return; }
    if (node === null || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record["kind"] === "spawnProjectile" && typeof record["projectileId"] === "string") {
      ids.add(record["projectileId"]);
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(ability.effects);
  return ids;
}

export function segmentTimes(
  script: VfxScriptDoc,
  cues: readonly TriggerCue[],
): { segmentIndex: number; atMs: number; label: string }[] {
  const out: { segmentIndex: number; atMs: number; label: string }[] = [];
  script.segments.forEach((seg, segmentIndex) => {
    const matches = cues.filter(
      (cue) =>
        cue.on === seg.on &&
        (seg.on !== "strike" || seg.strikeIndex === undefined || seg.strikeIndex === cue.strikeIndex),
    );
    for (const cue of matches) {
      out.push({
        segmentIndex,
        atMs: cue.atMs + (seg.atMs ?? 0),
        label: `${cue.label} · ${seg.kind}`,
      });
    }
  });
  return out.sort((a, b) => a.atMs - b.atMs || a.segmentIndex - b.segmentIndex);
}

export interface RecommendedEvidenceTime {
  atMs: number;
  label: string;
}

const EVIDENCE_KIND_WEIGHT: Record<VfxScriptSegment["kind"], number> = {
  modelFx: 5,
  vfx: 4,
  bodyMove: 3,
  anim: 3,
  hideBody: 2,
  screenFlash: 2,
  screenShake: 1,
  floatingText: 1,
  sound: 0,
};

/**
 * Suggest drawable moments instead of making reviewers guess from the trigger
 * clock. Segment offsets are relative to Sim events, so "castEffect at 1.000s
 * + slash at 350ms" must point to about 1.400s, not 0.350s.
 */
export function recommendedEvidenceTimes(
  script: VfxScriptDoc,
  cues: readonly TriggerCue[],
  limit = 4,
): RecommendedEvidenceTime[] {
  if (limit <= 0) return [];
  const occurrences = segmentTimes(script, cues)
    .map((time) => ({ ...time, segment: script.segments[time.segmentIndex]! }))
    .filter(({ segment }) => EVIDENCE_KIND_WEIGHT[segment.kind] > 0);
  if (occurrences.length === 0) return [];

  const groups: Array<typeof occurrences> = [];
  for (const occurrence of occurrences) {
    const group = groups[groups.length - 1];
    if (!group || occurrence.atMs - group[0]!.atMs > 90) groups.push([occurrence]);
    else group.push(occurrence);
  }

  const candidates = groups.map((group) => {
    const start = group[0]!.atMs;
    const maxTail = Math.max(...group.map(({ segment }) => segmentTailMs(segment)), 0);
    const sampleDelay = Math.min(120, Math.max(40, maxTail * 0.15));
    const kinds = [...new Set(group.map(({ segment }) => segment.kind))];
    return {
      atMs: Math.round(start + sampleDelay),
      label: `${group[0]!.label.split(" · ")[0]} · ${kinds.join("+")}`,
      score: group.reduce((sum, { segment }) => sum + EVIDENCE_KIND_WEIGHT[segment.kind], 0),
    };
  });

  // Always cover the opening and finisher, then fill with the densest distinct
  // beats. A seven-hit combo must not return four adjacent middle slashes while
  // hiding its ending.
  const wanted = Math.min(limit, candidates.length);
  const selected = new Set<number>([0, candidates.length - 1]);
  for (const index of candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => b.candidate.score - a.candidate.score || b.candidate.atMs - a.candidate.atMs)
    .map(({ index }) => index)) {
    if (selected.size >= wanted) break;
    if ([...selected].some((chosen) => Math.abs(candidates[chosen]!.atMs - candidates[index]!.atMs) < 180)) continue;
    selected.add(index);
  }
  for (let index = candidates.length - 1; selected.size < wanted && index >= 0; index--) selected.add(index);

  return [...selected]
    .map((index) => ({ atMs: candidates[index]!.atMs, label: candidates[index]!.label }))
    .sort((a, b) => a.atMs - b.atMs);
}

export function timelineDurationMs(script: VfxScriptDoc, cues: readonly TriggerCue[]): number {
  const lastCue = cues.reduce((m, cue) => Math.max(m, cue.atMs), 0);
  const lastSegment = segmentTimes(script, cues).reduce(
    (m, cue) => Math.max(m, cue.atMs + segmentTailMs(script.segments[cue.segmentIndex]!)),
    0,
  );
  return Math.max(1000, lastCue + 500, lastSegment + 250);
}

function segmentTailMs(segment: VfxScriptSegment): number {
  switch (segment.kind) {
    case "modelFx": {
      const curveEnd = segment.heightKeys?.[segment.heightKeys.length - 1]?.t ?? 0;
      const travel = segment.speed && segment.distance ? segment.distance / segment.speed : 0;
      return Math.max(segment.lifeSec ?? 0, curveEnd, travel, 0.25) * 1000;
    }
    case "vfx": return (segment.durationSec ?? 1) * 1000;
    case "floatingText": return (segment.durationSec ?? 1) * 1000;
    case "screenFlash": return segment.durationSec * 1000;
    case "screenShake": return segment.durationSec * 1000;
    case "bodyMove": return segment.durationMs;
    case "hideBody": return segment.durationMs;
    case "anim": return segment.clipWindowMs ?? 500;
    case "sound": return 0;
  }
}

export function segmentFromAsset(
  asset: AssetDrop,
  placement?: AssetPlacement,
  reactionTrigger?: ForgeReactionTrigger | null,
): VfxScriptSegment {
  const offsets = placement
    ? {
        ...(placement.forwardU !== 0 ? { offsetForwardU: placement.forwardU } : {}),
        ...(placement.sideU !== 0 ? { offsetSideU: placement.sideU } : {}),
      }
    : {};
  return asset.collection === "models"
    ? checked({
        kind: "modelFx",
        on: reactionTrigger ?? (placement ? "castStart" : "castEffect"),
        modelKey: asset.id,
        path: "static",
        anchor: placement ? "self" : "point",
        lifeSec: 1,
        ...offsets,
      })
    : checked({
        kind: "vfx",
        on: reactionTrigger ?? (placement ? "castStart" : "castEffect"),
        vfxId: asset.id,
        at: placement ? "self" : "point",
        durationSec: 1,
        ...offsets,
      });
}

export function newSegment(
  kind: VfxScriptSegment["kind"],
  reactionTrigger?: ForgeReactionTrigger | null,
): VfxScriptSegment {
  const effectTrigger = reactionTrigger ?? "castEffect";
  const openingTrigger = reactionTrigger ?? "castStart";
  const seeds: Record<VfxScriptSegment["kind"], unknown> = {
    modelFx: { kind, on: effectTrigger, modelKey: "model-id", path: "static", anchor: "point", lifeSec: 1 },
    vfx: { kind, on: effectTrigger, vfxId: "vfx-id", at: "point", durationSec: 1 },
    floatingText: { kind, on: openingTrigger, text: "招式名稱" },
    screenFlash: { kind, on: effectTrigger, colorRgb: [255, 255, 255], peakAlpha: 0.25, durationSec: 0.2 },
    screenShake: { kind, on: effectTrigger, amplitude: 0.2, durationSec: 0.25 },
    sound: { kind, on: effectTrigger, soundKey: "ability.cast" },
    anim: { kind, on: effectTrigger, at: "caster", pulse: "cast" },
    bodyMove: {
      kind,
      on: effectTrigger,
      at: "caster",
      mode: "teleport",
      offset: { x: 0, y: 0, z: 0 },
      durationMs: 250,
    },
    hideBody: { kind, on: effectTrigger, at: "caster", durationMs: 500 },
  };
  return checked(seeds[kind]);
}

/**
 * Change only the representation brick while keeping the authored timeline
 * address. A union-card switch must not turn reflectSuccess back into a fake
 * cast, move a combo beat to another strike, or silently jump to time zero.
 */
export function retypeSegment(
  segment: VfxScriptSegment,
  kind: VfxScriptSegment["kind"],
): VfxScriptSegment {
  const next = newSegment(kind, segment.on === "reflectSuccess" ? "reflectSuccess" : null);
  return checked({
    ...next,
    on: segment.on,
    ...(segment.atMs === undefined ? {} : { atMs: segment.atMs }),
    ...(segment.strikeIndex === undefined ? {} : { strikeIndex: segment.strikeIndex }),
  });
}

function checked(value: unknown): VfxScriptSegment {
  const parsed = zVfxScriptSegment.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return parsed.data;
}

export function newScript(
  abilityId: string,
  reactionTrigger?: ForgeReactionTrigger | null,
): VfxScriptDoc {
  return {
    id: abilityId,
    schema: "vfx-script@1",
    abilityId,
    notes: "VFX Forge 建立；只記錄演出，不複製傷害、次數或時序規則。",
    segments: [newSegment("floatingText", reactionTrigger)],
  };
}

export function encodeAssetDrag(asset: AssetDrop): string {
  return JSON.stringify(asset);
}

export function decodeAssetDrag(raw: string): AssetDrop | null {
  try {
    const value = JSON.parse(raw) as Partial<AssetDrop>;
    if ((value.collection === "models" || value.collection === "vfx") && typeof value.id === "string") {
      return { collection: value.collection, id: value.id };
    }
  } catch {
    // Browser drag payloads are untrusted input; malformed means no drop.
  }
  return null;
}

const SIM_TICK_MS = 1000 / 30;
