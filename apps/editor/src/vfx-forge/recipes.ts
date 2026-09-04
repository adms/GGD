import {
  zVfxScriptSegment,
  type VfxScriptSegment,
} from "@ggd/shared/content/schema/vfxScript";
import { completeActionAnimations } from "./actionAnimationPrinciples";
import { singleArcVfxId } from "./presentationContract";

/**
 * Editor-side macros: expand into ordinary vfx-script@1 blocks, so the player
 * gets no second schema and authors can still edit every resulting brick.
 */
export const VFX_FORGE_RECIPES = [
  { id: "classic-beam-fire", label: "經典橘金氣功砲", description: "透明安全的橘金雙層長軸粒子；不使用會露出白卡的 ReviveHuman MDL" },
  { id: "classic-beam-blue", label: "經典藍白氣功砲", description: "透明安全的藍白雙層長軸粒子；不使用會露出白卡的 ReviveHuman MDL" },
  { id: "line-blast-fire", label: "定距火球＋落點爆炸", description: "FireBlast MDL 真正飛行，抵達後才爆炸" },
  { id: "dash-slash-void", label: "黑紫衝刺斬", description: "真正施法者高速穿越，搭配 Main 收據中的單發大型主斬弧與震動" },
  { id: "shockwave-dash-light", label: "衝擊波＋追身光斬", description: "A 段朝目標放衝擊波，B 段替 ability 的真實衝刺補上揮劍與斬光" },
  { id: "combo-slash-holy", label: "黃藍多段斬＋終結柱", description: "每段一個角色攻擊／受擊動畫與一個分時單斬弧，第七段黃藍光柱" },
  { id: "reflect-counter-open", label: "反彈成功起手", description: "只由 reflectSuccess 觸發的防禦火花；不猜 blockSuccess" },
  { id: "avalon-counter-chain", label: "理想鄉反擊七斬", description: "反彈成功起手、六次換位斬擊與第七段黃藍橫向終結砲" },
  { id: "rider-dash-beam-blue", label: "Rider 突進＋藍光束", description: "真 Rider 本體突進、藍白橫向光束與命中動畫" },
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
    /** Required: a passive reaction must never inherit an active castStart. */
    activationMode: "active" | "passive";
    includeModelCore?: boolean;
    includeFinalColumn?: boolean;
    trigger?: VfxForgeRecipeTrigger;
    beamAnchor?: "self" | "target";
    beamYawOffsetDeg?: number;
  },
): VfxScriptSegment[] {
  let segments: VfxScriptSegment[];
  if (id === "classic-beam-fire" || id === "classic-beam-blue") {
    segments = classicBeam(
      id === "classic-beam-fire",
      options.includeModelCore ?? false,
      options.trigger ?? { on: "castEffect" },
      options.beamAnchor ?? "self",
      options.beamYawOffsetDeg ?? 0,
    );
  } else if (id === "line-blast-fire") segments = lineBlastFire();
  else if (id === "dash-slash-void") segments = dashSlashVoid();
  else if (id === "shockwave-dash-light") segments = shockwaveDashLight();
  else if (id === "combo-slash-holy") {
    segments = comboSlashHoly(options.includeFinalColumn ?? true, options.activationMode === "active");
  }
  else if (id === "reflect-counter-open") segments = reflectCounterOpen();
  else if (id === "avalon-counter-chain") segments = avalonCounterChain();
  else segments = riderDashBeamBlue();
  return completeActionAnimations(segments, { activationMode: options.activationMode });
}

/**
 * The classic beam is particle-first. The legacy ReviveHuman MDL can still be
 * requested by isolated tests, but Forge recipes default it off: the real
 * framebuffer audit proved its TeamGlow mesh becomes an opaque white card.
 * Two time-separated outer/core pulses keep the long-axis silhouette without
 * accepting a model merely because its schema and asset digest are valid.
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
  sideOffsetU = 0,
  particleAlphaScale = 1,
  pulseOffsetsMs: readonly number[] = [0, 430],
): VfxScriptSegment[] {
  const segments: VfxScriptSegment[] = [];
  if (includeModelCore) {
    segments.push(zVfxScriptSegment.parse({
      kind: "modelFx", ...triggerFields(trigger), modelKey: CLASSIC_BEAM_MODEL_KEY,
      path: "static", anchor, scale: 4,
      // The converted GLB keeps the central ReviveHuman geometry but not the
      // WC3 PRE2 ribbon that made the original beam broad and long.  The model
      // contract explicitly maps axis 3 to the rigged forward axis, so this is
      // a deterministic reconstruction of that missing silhouette rather than
      // a model-local guess.  The old 0.48/2.68 values rendered as a thin line
      // and a single muzzle star at the shipped 18u camera.
      scaleAxis: [0.9, 0.9, 4.4], spinDegPerSec: 180,
      clip: "idle", clipTimeScale: 0.18,
      tint: fire ? [1, 0.34, 0.03] : [0.08, 0.36, 1], alpha: fire ? 0.72 : 0.68,
      lifeSec: 1.1, offsetForwardU: 0.8, heightU: 0,
      ...(sideOffsetU === 0 ? {} : { offsetSideU: sideOffsetU }),
      ...(yawOffsetDeg === 0 ? {} : { yawOffsetDeg }),
    }));
  }
  // Fixtures may only compose resources already shipped by main. Creating a
  // new content/vfx document here would turn an Editor capability check into
  // an unreviewed game-content change. Segment tint supplies the orange/blue
  // identity; the WC3 MDL remains the actual beam body.
  const vfxId = fire ? "fx.prim.holy.beam-flat" : "fx.prim.lightning.beam-flat";
  const outerTint = fire ? [255, 132, 20] : [65, 155, 255];
  const coreTint = fire ? [255, 242, 190] : [215, 242, 255];
  // Two pulses × outer/core leave two systems in the six-slot additive budget
  // for the readable grammar a classic beam needs: a muzzle core and an impact
  // bloom. The previous 1.7× time scale separated the stretched sprites into
  // fast "hairs"; normal travel time plus overlap reads as a sustained beam.
  for (const atMs of pulseOffsetsMs) {
    segments.push(zVfxScriptSegment.parse({
      kind: "vfx", ...triggerFields(trigger, atMs), vfxId, at: anchor,
      durationSec: 1.15, offsetForwardU: 0.8, w3xScale: 3.2, timeScale: 1,
      // ReviveHuman's compositor pivot sits around hand/chest height. Keep the
      // helpers near that centreline but visibly subordinate: full-size
      // additive sprites at the exact model height collapsed into a white card.
      tint: outerTint, flyHeight: 72, alpha: Math.min(1, 0.3 * particleAlphaScale),
      ...(sideOffsetU === 0 ? {} : { offsetSideU: sideOffsetU }),
      ...(yawOffsetDeg === 0 ? {} : { facingDeg: yawOffsetDeg }),
    }));
    segments.push(zVfxScriptSegment.parse({
      kind: "vfx", ...triggerFields(trigger, atMs + 35), vfxId, at: anchor,
      durationSec: 1.15, offsetForwardU: 0.8, w3xScale: 1.4, timeScale: 1,
      tint: coreTint, flyHeight: 72, alpha: Math.min(1, 0.62 * particleAlphaScale),
      ...(sideOffsetU === 0 ? {} : { offsetSideU: sideOffsetU }),
      ...(yawOffsetDeg === 0 ? {} : { facingDeg: yawOffsetDeg }),
    }));
  }
  // Single-pulse callers are combo finishers that already own their opening
  // and impact. The full classic-beam card adds both endpoints so the picture
  // says charge -> sustained body -> hit instead of looking like loose hairs.
  if (pulseOffsetsMs.length > 1) {
    segments.push(zVfxScriptSegment.parse({
      kind: "vfx", ...triggerFields(trigger),
      vfxId: fire ? "fx.prim.holy.pulse-sm" : "fx.prim.lightning.pulse-sm",
      at: anchor, durationSec: 0.42, offsetForwardU: 0.5,
      w3xScale: 1.35, tint: coreTint, flyHeight: 72,
      alpha: Math.min(1, 0.72 * particleAlphaScale),
      ...(sideOffsetU === 0 ? {} : { offsetSideU: sideOffsetU }),
    }));
    segments.push(zVfxScriptSegment.parse({
      kind: "vfx", ...triggerFields(trigger, 650),
      vfxId: fire ? "fx.prim.fire.explosion" : "fx.prim.lightning.pulse-lg",
      at: "target", durationSec: 0.46, w3xScale: fire ? 1.05 : 0.9,
      tint: outerTint, flyHeight: 68,
      alpha: Math.min(1, 0.68 * particleAlphaScale),
    }));
  }
  return segments;
}

/** JASS A04R: a visible fire mass travels 12u, then the endpoint explodes. */
function lineBlastFire(): VfxScriptSegment[] {
  // Three available model carriers were rejected by the real framebuffer:
  // imported.fireblast exposed the diagnostic checker, RedDragon had a card,
  // and Phoenix unfolded a giant white plane late in its animation. Compose a
  // moving fire mass from Main's additive bolt primitive instead. Adjacent
  // short-lived pulses overlap by one step, so it reads as one travelling
  // projectile rather than seven unrelated explosions.
  const travel = [1.2, 3.2, 5.2, 7.2, 9.2, 11.2].map((offsetForwardU, index) =>
    zVfxScriptSegment.parse({
      kind: "vfx", on: "castEffect", atMs: index * 84,
      vfxId: "fx.prim.fire.bolt", at: "self", offsetForwardU,
      durationSec: 0.22, w3xScale: 1.25 + index * 0.04,
      tint: [255, 70 - index * 5, 14], flyHeight: 80, alpha: 0.82,
    }));
  return [
    ...travel,
    zVfxScriptSegment.parse({
      // The ability's authoritative blast radius is 8u.  The small primitive
      // read as a spark at the shipped 18u camera and made the projectile look
      // as if it simply vanished.  Use main's existing large burst and scale
      // it as the visible endpoint body; the following ring remains the fast
      // radial edge.  No damage/radius truth is duplicated here.
      kind: "vfx", on: "castEffect", atMs: 500, vfxId: "fx.prim.fire.explosion-lg",
      at: "self", offsetForwardU: 12.8, durationSec: 0.52,
      w3xScale: 2.2, tint: [255, 72, 18], flyHeight: 80, alpha: 0.78,
    }),
    zVfxScriptSegment.parse({
      kind: "screenShake", on: "castEffect", atMs: 500, amplitude: 0.42, durationSec: 0.45,
    }),
  ];
}

function dashSlashVoid(): VfxScriptSegment[] {
  return [
    // Move the real rendered caster instead of spawning imported.linainvers as
    // a duplicate model.  That GLB contains an alpha-bearing texture declared
    // OPAQUE; the asset gate correctly rejects it because animation can expose
    // a full rectangular card. `bodyMove` is presentation-only and resets by
    // itself, so gameplay position/targeting authority remains in the ability.
    zVfxScriptSegment.parse({
      kind: "anim", on: "castEffect", at: "caster", pulse: "attack", clipWindowMs: 560,
    }),
    zVfxScriptSegment.parse({
      kind: "bodyMove", on: "castEffect", at: "caster", mode: "arc",
      offset: { x: 0.35, y: 0.2, z: 4.5 }, durationMs: 560,
    }),
    zVfxScriptSegment.parse({
      // One receipted arc, not a 26-crescent fan. The actor swing remains the
      // primary motion; this is the single oversized cut that makes it read.
      kind: "vfx", on: "castEffect", atMs: 370, vfxId: singleArcVfxId("void"),
      at: "target", durationSec: 0.3, w3xScale: 1.85,
      tint: [190, 88, 255], flyHeight: 76, alpha: 0.78,
    }),
    zVfxScriptSegment.parse({ kind: "anim", on: "castEffect", atMs: 390, at: "target", pulse: "hurt", clipWindowMs: 520 }),
    zVfxScriptSegment.parse({ kind: "screenShake", on: "castEffect", atMs: 390, amplitude: 0.38, durationSec: 0.32 }),
  ];
}

function shockwaveDashLight(): VfxScriptSegment[] {
  return [
    zVfxScriptSegment.parse({
      kind: "vfx", on: "castEffect", vfxId: "fx.prim.lightning.beam-flat", at: "self",
      durationSec: 0.55, offsetForwardU: 0.55, w3xScale: 2.8,
      // The document already uses aim-relative orientation. Its long tail
      // stays behind the leading edge; applying a 180° layer offset reverses
      // the actual projectile, even though a still frame can make the tail
      // look like it is travelling backward.
      tint: [90, 205, 255], flyHeight: 55, alpha: 0.78,
    }),
    zVfxScriptSegment.parse({
      kind: "anim", on: "castEffect", atMs: 330,
      at: "caster", pulse: "attack", clipWindowMs: 620,
    }),
    // Deliberately no bodyMove/modelFx/hideBody here. godie-nbbc.r already
    // owns delayed -> blink(to:point) in ability JSON. Adding a presentation
    // move on top made the real caster travel twice and overshoot the slash.
    zVfxScriptSegment.parse({
      kind: "vfx", on: "castEffect", atMs: 430, vfxId: singleArcVfxId("holy"),
      at: "target", durationSec: 0.3, w3xScale: 1.45,
      tint: [255, 208, 88], flyHeight: 72, alpha: 0.76,
    }),
    zVfxScriptSegment.parse({
      kind: "vfx", on: "castEffect", atMs: 650, vfxId: "fx.prim.fire.explosion",
      at: "target", durationSec: 0.34, w3xScale: 0.9, flyHeight: 68, alpha: 0.65,
    }),
    zVfxScriptSegment.parse({ kind: "anim", on: "castEffect", atMs: 650, at: "target", pulse: "hurt", clipWindowMs: 520 }),
    zVfxScriptSegment.parse({ kind: "screenShake", on: "castEffect", atMs: 650, amplitude: 0.42, durationSec: 0.34 }),
  ];
}

function comboSlashHoly(includeFinalColumn: boolean, includeOpeningAttack: boolean): VfxScriptSegment[] {
  const segments: VfxScriptSegment[] = [
    ...(includeOpeningAttack
      ? [zVfxScriptSegment.parse({
          // Sword combos open with the character's real attack clip. Using
          // the generic cast clip here is both visually weaker and unsafe for
          // imported.cloud: its Spell animation exposes a legacy opaque mesh
          // in the close Forge camera. The receipted caster.action takeover
          // keeps Main's default cast from playing underneath this choice.
          kind: "anim", on: "castStart", at: "caster", pulse: "attack", clipWindowMs: 650,
        })]
      : []),
    zVfxScriptSegment.parse({ kind: "anim", on: "strike", at: "caster", pulse: "attack", clipWindowMs: 320 }),
    zVfxScriptSegment.parse({ kind: "anim", on: "strike", at: "target", pulse: "hurt", clipWindowMs: 520 }),
    zVfxScriptSegment.parse({
      // Generic strike fires once per authoritative comboStrike: one actor
      // swing, one target reaction and exactly one receipted arc per damage beat.
      kind: "vfx", on: "strike", vfxId: singleArcVfxId("holy"), at: "target",
      // One decisive oversized arc is the readable complement to one actor
      // swing.  The old 1.05 scale disappeared behind the two bodies and
      // encouraged authors to compensate with a 26-crescent fan.
      durationSec: 0.3, w3xScale: 2.25, flyHeight: 82, alpha: 0.9,
    }),
  ];
  if (includeFinalColumn) {
    segments.push(
      zVfxScriptSegment.parse({
        kind: "vfx", on: "strike", strikeIndex: 7,
        vfxId: "fx.prim.holy.beam-lg", at: "target", durationSec: 0.95,
        // Two additive columns used to overlap at 2.5/3.2 scale and hide both
        // actors in the final frame (GPU proof: 7.1% lit, 5.2% highlight).
        // Keep the yellow/blue split, but make the silhouettes readable.
        w3xScale: 1.65, tint: [255, 210, 70], alpha: 0.28,
        offsetForwardU: -0.32, offsetSideU: -0.1,
      }),
      zVfxScriptSegment.parse({
        kind: "vfx", on: "strike", strikeIndex: 7, atMs: 45,
        vfxId: "fx.prim.lightning.beam-lg", at: "target", durationSec: 0.9,
        w3xScale: 1.95, tint: [70, 180, 255], alpha: 0.32,
        offsetForwardU: 0.32, offsetSideU: 0.1,
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

/** Full composite card for an Editor-from-blank Avalon EX reconstruction. */
function avalonCounterChain(): VfxScriptSegment[] {
  const teleportOffsets = [
    { x: -0.8, y: 0, z: 2.6 },
    { x: 0.8, y: 0.1, z: 2.8 },
    { x: -0.65, y: 0.2, z: 3.15 },
    { x: 0.65, y: 0.15, z: 3.1 },
    { x: -0.35, y: 0.35, z: 2.75 },
    { x: 0.35, y: 0.3, z: 2.95 },
  ];
  const bodyMoves = teleportOffsets.map((offset, index) => zVfxScriptSegment.parse({
    kind: "bodyMove", on: "strike", strikeIndex: index + 1,
    at: "caster", mode: "teleport", offset, durationMs: index === 5 ? 260 : 220,
  }));
  return [
    ...reflectCounterOpen(),
    zVfxScriptSegment.parse({
      kind: "floatingText", on: "strike", strikeIndex: 1,
      text: "AVALON · 理想鄉", colorRgb: [255, 232, 160], sizeScale: 1.55, durationSec: 1.1,
    }),
    ...bodyMoves,
    ...comboSlashHoly(false, false),
    // The seventh hit changes from close slash into a charged beam. Give that
    // interval its own follow-through instead of leaving the character frozen
    // while four beam layers continue after the first attack clip ended.
    zVfxScriptSegment.parse({
      kind: "anim", on: "strike", strikeIndex: 7, atMs: 180,
      at: "caster", pulse: "attack", clipWindowMs: 1050,
    }),
    // Keep the orange MDL body and blue particle core slightly separated.
    // Exact overlap made the brighter orange layer erase the requested
    // yellow/blue identity even though both systems were technically alive.
    ...classicBeam(true, false, { on: "strike", strikeIndex: 7, atMs: 220 }, "target", 180, -0.16, 0.9, [0]),
    ...classicBeam(false, false, { on: "strike", strikeIndex: 7, atMs: 245 }, "target", 180, 0.22, 1.25, [0]),
    zVfxScriptSegment.parse({ kind: "screenShake", on: "strike", strikeIndex: 7, amplitude: 0.58, durationSec: 0.7 }),
  ];
}

/** Full composite card for an Editor-from-blank Rider charge reconstruction. */
function riderDashBeamBlue(): VfxScriptSegment[] {
  return [
    zVfxScriptSegment.parse({ kind: "anim", on: "castStart", at: "caster", pulse: "cast", clipWindowMs: 1200 }),
    zVfxScriptSegment.parse({ kind: "anim", on: "castEffect", at: "caster", pulse: "attack", clipWindowMs: 900 }),
    zVfxScriptSegment.parse({
      kind: "bodyMove", on: "castEffect", at: "caster", mode: "arc",
      offset: { x: 0.55, y: 0.7, z: 3 }, durationMs: 900,
    }),
    ...classicBeam(false, false, { on: "castEffect" }, "self", 0),
    zVfxScriptSegment.parse({ kind: "anim", on: "castEffect", atMs: 700, at: "target", pulse: "hurt", clipWindowMs: 560 }),
    zVfxScriptSegment.parse({ kind: "screenShake", on: "castEffect", amplitude: 0.45, durationSec: 0.9 }),
  ];
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
