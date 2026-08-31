import type { VfxScriptDoc, VfxScriptSegment } from "@ggd/shared/content/schema/vfxScript";
import { zVfxScriptSegment } from "@ggd/shared/content/schema/vfxScript";
import { normalizeComboTable, resolveComboFamilies } from "@ggd/shared/sim/effects/comboFamilies";
import { comboStrikeOffsets } from "@ggd/shared/sim/effects/comboStrikes";

export type AssetDrop = { collection: "models" | "vfx"; id: string };
export type AssetPlacement = { forwardU: number; sideU: number };

export interface ForgeAbility {
  id: string;
  name?: string;
  castTimeSec?: number;
  effects?: unknown[];
}

export interface TriggerCue {
  on: VfxScriptSegment["on"];
  atMs: number;
  strikeIndex?: number;
  label: string;
}

const SIM_DT_SEC = 1 / 30;

function firstCombo(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = firstCombo(child);
      if (found) return found;
    }
    return null;
  }
  if (node === null || typeof node !== "object") return null;
  const rec = node as Record<string, unknown>;
  if (rec.kind === "comboStrikes") return rec;
  for (const child of Object.values(rec)) {
    const found = firstCombo(child);
    if (found) return found;
  }
  return null;
}

/**
 * Build the preview clock from the same ability + combo-family truth used by
 * the sim. VFX script data never invents damage cadence or strike count.
 */
export function deriveTriggerCues(ability: ForgeAbility, comboConfig: unknown): TriggerCue[] {
  const castMs = Math.max(0, ability.castTimeSec ?? 0) * 1000;
  const cues: TriggerCue[] = [
    { on: "castStart", atMs: 0, label: "施法提交" },
    { on: "castEffect", atMs: castMs, label: castMs > 0 ? "吟唱完成" : "立即結算" },
  ];

  const resolved = resolveComboFamilies(
    ability as unknown as Record<string, unknown>,
    normalizeComboTable(comboConfig),
  );
  const combo = firstCombo(resolved);
  if (!combo) return cues;

  const offsets = comboStrikeOffsets(combo as never, SIM_DT_SEC);
  offsets.forEach((ticks, i) => {
    cues.push({
      on: "strike",
      atMs: castMs + ticks * SIM_DT_SEC * 1000,
      strikeIndex: i + 1,
      label: `第 ${i + 1} 段`,
    });
  });
  if (Array.isArray(combo.finisher) && combo.finisher.length > 0 && offsets.length > 0) {
    const gapTicks = Math.round(Math.max(0, Number(combo.finisherDelaySec ?? 0)) / SIM_DT_SEC);
    if (gapTicks > 0) {
      cues.push({
        on: "strike",
        atMs: castMs + (offsets[offsets.length - 1]! + gapTicks) * SIM_DT_SEC * 1000,
        strikeIndex: offsets.length + 1,
        label: `收尾第 ${offsets.length + 1} 段`,
      });
    }
  }
  return cues.sort((a, b) => a.atMs - b.atMs || (a.strikeIndex ?? 0) - (b.strikeIndex ?? 0));
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
