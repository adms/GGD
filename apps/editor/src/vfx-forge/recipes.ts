import {
  zVfxScriptSegment,
  type VfxScriptSegment,
} from "@ggd/shared/content/schema/vfxScript";

/**
 * Editor-side macros: expand into ordinary vfx-script@1 blocks, so the player
 * gets no second schema and authors can still edit every resulting brick.
 */
export const VFX_FORGE_RECIPES = [
  { id: "classic-beam-fire", label: "經典橘金氣功砲", description: "ReviveHuman MDL 橫放主體＋橘金粒子外暈" },
  { id: "classic-beam-blue", label: "經典藍白氣功砲", description: "ReviveHuman MDL 橫放主體＋藍白粒子外暈" },
  { id: "line-blast-fire", label: "定距火球＋落點爆炸", description: "FireBlast MDL 真正飛行，抵達後才爆炸" },
  { id: "dash-slash-void", label: "黑紫衝刺斬", description: "隱藏本體、移動角色殘像、交叉斬痕與命中震動" },
  { id: "shockwave-dash-light", label: "衝擊波＋追身光斬", description: "A 段先放衝擊波，B 段用角色模型分身衝刺斬穿" },
  { id: "combo-slash-holy", label: "黃藍多段斬＋終結柱", description: "每段攻擊／受擊動畫、交叉斬光與第七段 MDL 光柱" },
  { id: "reflect-counter-open", label: "反彈成功起手", description: "只由 reflectSuccess 觸發的防禦火花；不猜 blockSuccess" },
] as const;

export type VfxForgeRecipeId = typeof VFX_FORGE_RECIPES[number]["id"];
export const CLASSIC_BEAM_MODEL_KEY = "w3x.stock.revivehuman";

export interface VfxForgeRecipeTrigger {
  on: VfxScriptSegment["on"];
  atMs?: number;
  strikeIndex?: number;
}

export function buildVfxForgeRecipe(
  id: VfxForgeRecipeId,
  options: {
    includeModelCore?: boolean;
    includeFinalColumn?: boolean;
    trigger?: VfxForgeRecipeTrigger;
    beamAnchor?: "self" | "target";
    beamYawOffsetDeg?: number;
    dashModelKey?: string;
  } = {},
): VfxScriptSegment[] {
  if (id === "classic-beam-fire" || id === "classic-beam-blue") {
    return classicBeam(
      id === "classic-beam-fire",
      options.includeModelCore ?? true,
      options.trigger ?? { on: "castEffect" },
      options.beamAnchor ?? "self",
      options.beamYawOffsetDeg ?? 0,
    );
  }
  if (id === "line-blast-fire") return lineBlastFire();
  if (id === "dash-slash-void") return dashSlashVoid();
  if (id === "shockwave-dash-light") return shockwaveDashLight(options.dashModelKey ?? "imported.sd2");
  if (id === "combo-slash-holy") return comboSlashHoly(options.includeFinalColumn ?? true);
  return reflectCounterOpen();
}

/**
 * The classic beam is deliberately MDL-first. `w3x.stock.revivehuman` declares
 * fxLongAxis:"y"; the shipped model rig rotates that source pillar onto +Z,
 * so a single stretched model becomes the horizontal body. Particles only add
 * two bounded halo pulses. With the model's two emitters this stays at the
 * shipped maxConcurrentAdditive=6 instead of whitening the frame.
 */
function triggerFields(trigger: VfxForgeRecipeTrigger, relativeMs = 0): Pick<VfxScriptSegment, "on" | "atMs" | "strikeIndex"> {
  const atMs = (trigger.atMs ?? 0) + relativeMs;
  return {
    on: trigger.on,
    ...(atMs === 0 ? {} : { atMs }),
    ...(trigger.on === "strike" && trigger.strikeIndex !== undefined
      ? { strikeIndex: trigger.strikeIndex }
      : {}),
  };
}

function classicBeam(
  fire: boolean,
  includeModelCore: boolean,
  trigger: VfxForgeRecipeTrigger,
  anchor: "self" | "target",
  yawOffsetDeg: number,
): VfxScriptSegment[] {
  const segments: VfxScriptSegment[] = [];
  if (includeModelCore) {
    segments.push(zVfxScriptSegment.parse({
      kind: "modelFx", ...triggerFields(trigger), modelKey: CLASSIC_BEAM_MODEL_KEY,
      path: "static", anchor, scale: 2.5,
      scaleAxis: [0.48, 0.48, 2.68], spinDegPerSec: 180,
      clip: "idle", clipTimeScale: 0.18,
      tint: fire ? [1, 0.34, 0.03] : [0.08, 0.36, 1], alpha: fire ? 0.64 : 0.5,
      lifeSec: 1.1, offsetForwardU: 0.8, heightU: 0,
      ...(yawOffsetDeg === 0 ? {} : { yawOffsetDeg }),
    }));
  }
  const vfxId = fire ? "fx.forge.beam.fire" : "fx.forge.beam.blue";
  const outerTint = fire ? [255, 132, 20] : [65, 155, 255];
  const coreTint = fire ? [255, 242, 190] : [215, 242, 255];
  // Two pulses × outer/core; together with the MDL's two own emitters the
  // maximum simultaneous additive systems is six (GH#900 shipped budget).
  for (const atMs of [0, 430]) {
    segments.push(zVfxScriptSegment.parse({
      kind: "vfx", ...triggerFields(trigger, atMs), vfxId, at: anchor,
      durationSec: 0.62, offsetForwardU: 0.8, w3xScale: 2.2,
      // ReviveHuman's compositor pivot sits around hand/chest height. Keep the
      // helpers near that centreline but visibly subordinate: full-size
      // additive sprites at the exact model height collapsed into a white card.
      tint: outerTint, flyHeight: 72, alpha: 0.24,
      ...(yawOffsetDeg === 0 ? {} : { facingDeg: yawOffsetDeg }),
    }));
    segments.push(zVfxScriptSegment.parse({
      kind: "vfx", ...triggerFields(trigger, atMs + 35), vfxId, at: anchor,
      durationSec: 0.62, offsetForwardU: 0.8, w3xScale: 1,
      tint: coreTint, flyHeight: 72, alpha: 0.28,
      ...(yawOffsetDeg === 0 ? {} : { facingDeg: yawOffsetDeg }),
    }));
  }
  return segments;
}

/** JASS A04R: one FireBlast locust travels 12u, then the endpoint explodes. */
function lineBlastFire(): VfxScriptSegment[] {
  return [
    zVfxScriptSegment.parse({
      kind: "modelFx", on: "castEffect", modelKey: "imported.fireblast",
      path: "forward", speed: 27.5, distance: 12, spinDegPerSec: 360,
      scale: 4.5, lifeSec: 0.5, offsetForwardU: 0.8, heightU: 0.8,
      trailVfxId: "fx.prim.fire.bolt", trailIntervalSec: 0.08,
    }),
    zVfxScriptSegment.parse({
      kind: "vfx", on: "castEffect", atMs: 440, vfxId: "fx.prim.fire.explosion",
      at: "self", offsetForwardU: 12.8, durationSec: 0.52,
      w3xScale: 1.45, tint: [255, 72, 18], flyHeight: 80, alpha: 0.82,
    }),
    zVfxScriptSegment.parse({
      kind: "vfx", on: "castEffect", atMs: 440, vfxId: "fx.fam.shockwave-ring.fire.s150",
      at: "self", offsetForwardU: 12.8, durationSec: 0.52,
      w3xScale: 1.1, flyHeight: 12, alpha: 0.64,
    }),
    zVfxScriptSegment.parse({
      kind: "screenShake", on: "castEffect", atMs: 440, amplitude: 0.42, durationSec: 0.45,
    }),
  ];
}

function dashSlashVoid(): VfxScriptSegment[] {
  return [
    zVfxScriptSegment.parse({ kind: "hideBody", on: "castEffect", at: "caster", durationMs: 650 }),
    zVfxScriptSegment.parse({
      kind: "modelFx", on: "castEffect", modelKey: "imported.linainvers",
      path: "toTarget", speed: 24, clip: "attack", clipTimeScale: 2.8,
      scale: 1.2, lifeSec: 0.65, offsetSideU: 0.55,
    }),
    zVfxScriptSegment.parse({
      kind: "vfx", on: "castEffect", atMs: 120, vfxId: "fx.prim.void.slash",
      at: "target", durationSec: 0.42, w3xScale: 2,
      tint: [118, 28, 210], flyHeight: 72, alpha: 0.85, facingDeg: 52,
    }),
    zVfxScriptSegment.parse({
      kind: "vfx", on: "castEffect", atMs: 150, vfxId: "fx.prim.arcane.slash-lg",
      at: "target", durationSec: 0.36, w3xScale: 1.6,
      tint: [230, 138, 255], flyHeight: 76, alpha: 0.76, facingDeg: -48,
    }),
    zVfxScriptSegment.parse({ kind: "anim", on: "castEffect", atMs: 280, at: "target", pulse: "hurt", clipWindowMs: 520 }),
    zVfxScriptSegment.parse({ kind: "screenShake", on: "castEffect", atMs: 280, amplitude: 0.38, durationSec: 0.32 }),
  ];
}

function shockwaveDashLight(modelKey: string): VfxScriptSegment[] {
  return [
    zVfxScriptSegment.parse({
      kind: "vfx", on: "castEffect", vfxId: "fx.forge.beam.blue", at: "self",
      durationSec: 0.55, offsetForwardU: 0.55, w3xScale: 2.8,
      tint: [90, 205, 255], flyHeight: 55, alpha: 0.78,
    }),
    zVfxScriptSegment.parse({ kind: "hideBody", on: "castEffect", atMs: 330, at: "caster", durationMs: 620 }),
    zVfxScriptSegment.parse({
      kind: "modelFx", on: "castEffect", atMs: 330, modelKey,
      path: "toTarget", speed: 22, clip: "attack", clipTimeScale: 2.4,
      scale: 1.05, lifeSec: 0.62, offsetSideU: 0.28,
    }),
    zVfxScriptSegment.parse({
      kind: "vfx", on: "castEffect", atMs: 430, vfxId: "fx.prim.holy.slash-lg",
      at: "target", durationSec: 0.42, w3xScale: 2.1,
      tint: [255, 208, 88], flyHeight: 72, alpha: 0.8, facingDeg: 48,
    }),
    zVfxScriptSegment.parse({
      kind: "vfx", on: "castEffect", atMs: 650, vfxId: "fx.prim.fire.explosion",
      at: "target", durationSec: 0.34, w3xScale: 0.9, flyHeight: 68, alpha: 0.65,
    }),
    zVfxScriptSegment.parse({ kind: "anim", on: "castEffect", atMs: 650, at: "target", pulse: "hurt", clipWindowMs: 520 }),
    zVfxScriptSegment.parse({ kind: "screenShake", on: "castEffect", atMs: 650, amplitude: 0.42, durationSec: 0.34 }),
  ];
}

function comboSlashHoly(includeFinalColumn: boolean): VfxScriptSegment[] {
  const segments: VfxScriptSegment[] = [
    zVfxScriptSegment.parse({ kind: "anim", on: "strike", at: "caster", pulse: "attack", clipWindowMs: 320 }),
    zVfxScriptSegment.parse({ kind: "anim", on: "strike", at: "target", pulse: "hurt", clipWindowMs: 520 }),
    zVfxScriptSegment.parse({
      kind: "vfx", on: "strike", vfxId: "fx.prim.holy.slash", at: "target",
      durationSec: 0.34, w3xScale: 1.5, flyHeight: 82, alpha: 0.82, facingDeg: 52,
    }),
    zVfxScriptSegment.parse({
      kind: "vfx", on: "strike", atMs: 35, vfxId: "fx.prim.lightning.slash", at: "target",
      durationSec: 0.32, w3xScale: 1.6, flyHeight: 82, alpha: 0.82, facingDeg: -58,
    }),
  ];
  if (includeFinalColumn) {
    segments.push(
      zVfxScriptSegment.parse({
        kind: "vfx", on: "strike", strikeIndex: 7,
        vfxId: "fx.prim.holy.beam-lg", at: "target", durationSec: 0.95,
        w3xScale: 2.5, tint: [255, 210, 70], alpha: 0.52, offsetSideU: -0.24,
      }),
      zVfxScriptSegment.parse({
        kind: "vfx", on: "strike", strikeIndex: 7, atMs: 45,
        vfxId: "fx.prim.lightning.beam-lg", at: "target", durationSec: 0.9,
        w3xScale: 3.2, tint: [70, 180, 255], alpha: 0.62, offsetSideU: 0.24,
      }),
    );
  }
  return segments;
}

function reflectCounterOpen(): VfxScriptSegment[] {
  return [zVfxScriptSegment.parse({
    // `fx.avalon.reflect-spark` is also a semantic key for the generic
    // rainbow-arc planner. A reactive trace can contain more than one
    // reflectSuccess, so using it here re-spawned screen-wide lightning on
    // every cue. The recipe needs a bounded guard flash, not a second arc
    // system; the slash chain and finisher remain separate bricks.
    kind: "vfx", on: "reflectSuccess", vfxId: "fx.prim.holy.pulse-sm",
    at: "self", durationSec: 0.2, w3xScale: 0.52, flyHeight: 82, alpha: 0.42,
  })];
}

/** Existing ability-owned MDL bodies must not be emitted again by the script. */
export function abilityUsesModel(ability: unknown, modelKey: string): boolean {
  const visit = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(visit);
    if (value === null || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    if (record["kind"] === "spawnModelFx" && record["modelKey"] === modelKey) return true;
    return Object.values(record).some(visit);
  };
  return visit(ability);
}
