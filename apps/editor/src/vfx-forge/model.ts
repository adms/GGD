import type { VfxScriptDoc, VfxScriptSegment } from "@ggd/shared/content/schema/vfxScript";
import { zVfxScriptSegment } from "@ggd/shared/content/schema/vfxScript";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { eventOriginBelongsToAbility } from "../preview/eventOwnership";

export type AssetDrop = { collection: "models" | "vfx"; id: string };
export type AssetPlacement = { forwardU: number; sideU: number };

export interface ForgeAbility {
  id: string;
  name?: string;
  slot?: string;
  castTimeSec?: number;
  effects?: unknown[];
  passive?: unknown;
}

export type ForgeReactionTrigger = "reflectSuccess";

export interface ScheduledSimEvent {
  atMs: number;
  event: EventMessage;
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
  events: readonly { type: string; tick: number; data: Record<string, unknown> }[],
  abilityId: string,
): ScheduledSimEvent[] {
  const cast = events.find((event) => event.type === "abilityCast" && event.data["abilityId"] === abilityId);
  const reaction = events.find((event) => event.type === "reflectSuccess");
  const baseTick = cast?.tick ?? reaction?.tick ?? events.reduce((min, event) => Math.min(min, event.tick), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(baseTick)) return [];
  return events.map((event) => ({
    atMs: Math.max(0, event.tick - baseTick) * SIM_TICK_MS,
    event: event as EventMessage,
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
    case "hideBody": return segment.durationMs;
    case "anim": return segment.clipWindowMs ?? 500;
    case "sound": return 0;
  }
}

export function segmentFromAsset(asset: AssetDrop, placement?: AssetPlacement): VfxScriptSegment {
  const offsets = placement
    ? {
        ...(placement.forwardU !== 0 ? { offsetForwardU: placement.forwardU } : {}),
        ...(placement.sideU !== 0 ? { offsetSideU: placement.sideU } : {}),
      }
    : {};
  return asset.collection === "models"
    ? checked({
        kind: "modelFx",
        on: placement ? "castStart" : "castEffect",
        modelKey: asset.id,
        path: "static",
        anchor: placement ? "self" : "point",
        lifeSec: 1,
        ...offsets,
      })
    : checked({
        kind: "vfx",
        on: placement ? "castStart" : "castEffect",
        vfxId: asset.id,
        at: placement ? "self" : "point",
        durationSec: 1,
        ...offsets,
      });
}

export function newSegment(kind: VfxScriptSegment["kind"]): VfxScriptSegment {
  const seeds: Record<VfxScriptSegment["kind"], unknown> = {
    modelFx: { kind, on: "castEffect", modelKey: "model-id", path: "static", anchor: "point", lifeSec: 1 },
    vfx: { kind, on: "castEffect", vfxId: "vfx-id", at: "point", durationSec: 1 },
    floatingText: { kind, on: "castStart", text: "招式名稱" },
    screenFlash: { kind, on: "castEffect", colorRgb: [255, 255, 255], peakAlpha: 0.25, durationSec: 0.2 },
    screenShake: { kind, on: "castEffect", amplitude: 0.2, durationSec: 0.25 },
    sound: { kind, on: "castEffect", soundKey: "ability.cast" },
    anim: { kind, on: "castEffect", at: "caster", pulse: "cast" },
    hideBody: { kind, on: "castEffect", at: "caster", durationMs: 500 },
  };
  return checked(seeds[kind]);
}

function checked(value: unknown): VfxScriptSegment {
  const parsed = zVfxScriptSegment.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return parsed.data;
}

export function newScript(abilityId: string): VfxScriptDoc {
  return {
    id: abilityId,
    schema: "vfx-script@1",
    abilityId,
    notes: "VFX Forge 建立；只記錄演出，不複製傷害、次數或時序規則。",
    segments: [newSegment("floatingText")],
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
