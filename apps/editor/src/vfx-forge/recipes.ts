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
  { id: "classic-beam-fire", familyId: "classic-horizontal-beam", familyLabel: "經典橫向光束", typeId: "type1", variantLabel: "橘金持續型", label: "經典橘金氣功砲", description: "原作 ReviveHuman＋FragDriller 蝗蟲模型組合；可調長寬、朝向、透明度、顏色與翻滾" },
  { id: "classic-beam-blue", familyId: "classic-horizontal-beam", familyLabel: "經典橫向光束", typeId: "type2", variantLabel: "藍白持續型", label: "經典藍白氣功砲", description: "原作 ReviveHuman＋FragDriller 蝗蟲模型組合；同一組積木改色為藍白光束" },
  { id: "classic-beam-holy", familyId: "classic-horizontal-beam", familyLabel: "經典橫向光束", typeId: "type3", variantLabel: "黃藍聖光型", label: "黃藍聖光砲", description: "同一組模型積木改為黃金外層與藍色核心" },
  { id: "classic-beam-void", familyId: "classic-horizontal-beam", familyLabel: "經典橫向光束", typeId: "type4", variantLabel: "紫黑虛空型", label: "紫黑虛空砲", description: "同一組模型積木改為紫黑外層與亮紫核心" },
  { id: "classic-beam-inferno", familyId: "classic-horizontal-beam", familyLabel: "經典橫向光束", typeId: "type5", variantLabel: "紅橘高熱型", label: "紅橘高熱砲", description: "同一組模型積木改為紅橘高熱輪廓" },
  { id: "classic-beam-electric", familyId: "classic-horizontal-beam", familyLabel: "經典橫向光束", typeId: "type6", variantLabel: "青藍電能型", label: "青藍電能砲", description: "同一組模型積木改為青藍電能輪廓" },
  { id: "energy-beam-lightning-thin", familyId: "classic-horizontal-beam", familyLabel: "經典橫向光束", typeId: "type7", variantLabel: "細束雷射型", label: "細束青藍雷射", description: "只用 Main 通用 beam primitive 的快速細束版本" },
  { id: "energy-beam-lightning-wide", familyId: "classic-horizontal-beam", familyLabel: "經典橫向光束", typeId: "type8", variantLabel: "寬幅雷電型", label: "寬幅青藍電砲", description: "只用 Main 通用 beam-lg primitive 的寬幅版本" },
  { id: "energy-beam-holy-wide", familyId: "classic-horizontal-beam", familyLabel: "經典橫向光束", typeId: "type9", variantLabel: "寬幅聖光型", label: "寬幅黃白聖光砲", description: "只用 Main 通用 holy beam-lg primitive 的寬幅版本" },
  { id: "energy-beam-void-wide", familyId: "classic-horizontal-beam", familyLabel: "經典橫向光束", typeId: "type10", variantLabel: "寬幅虛空型", label: "寬幅紫黑虛空砲", description: "只用 Main 通用 void beam-lg primitive 的寬幅版本" },
  { id: "rider-dash-beam-blue", familyId: "dash-beam", familyLabel: "突進接光束", typeId: "type1", variantLabel: "藍白騎乘型", label: "Rider 突進＋藍光束", description: "真 Rider 本體突進、藍白橫向光束與命中動畫" },
  { id: "line-blast-fire", familyId: "projectile-impact", familyLabel: "投射後命中", typeId: "type1", variantLabel: "火球爆炸型", label: "定距火球＋落點爆炸", description: "FireBlast MDL 真正飛行，抵達後才爆炸" },
  { id: "dash-slash-void", familyId: "dash-slash", familyLabel: "衝刺斬擊", typeId: "type1", variantLabel: "黑紫單發型", label: "黑紫衝刺斬", description: "真正施法者高速穿越，搭配 Main 收據中的單發大型主斬弧與震動" },
  { id: "shockwave-dash-light", familyId: "dash-slash", familyLabel: "衝刺斬擊", typeId: "type2", variantLabel: "衝擊波追身型", label: "衝擊波＋追身光斬", description: "A 段朝目標放衝擊波，B 段替 ability 的真實衝刺補上揮劍與斬光" },
  { id: "combo-slash-holy", familyId: "combo-finisher", familyLabel: "連段終結技", typeId: "type1", variantLabel: "直立光柱型", label: "黃藍多段斬＋終結柱", description: "每段一個角色攻擊／受擊動畫與一個分時單斬弧，第七段黃藍光柱" },
  { id: "avalon-counter-chain", familyId: "combo-finisher", familyLabel: "連段終結技", typeId: "type2", variantLabel: "反擊橫向光束型", label: "理想鄉反擊七斬", description: "反彈成功起手、六次換位斬擊與第七段黃藍橫向終結砲" },
  { id: "reflect-counter-open", familyId: "defense-reaction", familyLabel: "防禦反應", typeId: "type1", variantLabel: "反彈火花型", label: "反彈成功起手", description: "只由 reflectSuccess 觸發的防禦火花；不猜 blockSuccess" },
  { id: "avalon-guard-window", familyId: "defense-reaction", familyLabel: "防禦反應", typeId: "type2", variantLabel: "持續防禦窗型", label: "Avalon 防禦窗", description: "啟動防禦姿勢與結界；只有反彈成功才播放格擋火花" },
  { id: "perfect-parry", familyId: "defense-reaction", familyLabel: "防禦反應", typeId: "type3", variantLabel: "完美盾反型", label: "完美盾反", description: "防禦窗先架勢，反彈成功才出現格擋火花、反擊動作與目標後退" },
  { id: "chain-lightning-storm", familyId: "chain-lightning", familyLabel: "連鎖雷擊", typeId: "type1", variantLabel: "多起點風暴型", label: "多起點連鎖雷擊", description: "以錯開的雷擊起點表現多條獨立連鎖，不把所有跳躍疊成一次爆炸" },
  { id: "bankai-transform", familyId: "transform-aura", familyLabel: "變身氣場", typeId: "type1", variantLabel: "高速黑紅型", label: "高速變身氣場", description: "變身動作、閃光、黑紅氣場與高速殘影，數值與外觀切換仍由 ability JSON 決定" },
] as const;

export type VfxForgeRecipeId = typeof VFX_FORGE_RECIPES[number]["id"];
export const VFX_FORGE_RECIPE_FAMILIES = [...new Set(VFX_FORGE_RECIPES.map((recipe) => recipe.familyId))]
  .map((familyId) => ({
    id: familyId,
    label: VFX_FORGE_RECIPES.find((recipe) => recipe.familyId === familyId)!.familyLabel,
    recipes: VFX_FORGE_RECIPES.filter((recipe) => recipe.familyId === familyId),
  }));
export const CLASSIC_BEAM_MODEL_KEY = "w3x.stock.revivehuman";
export const CLASSIC_BEAM_CORE_MODEL_KEY = "w3x.stock.fragdriller";

export interface VfxForgeRecipeTrigger {
  on: VfxScriptSegment["on"];
  atMs?: number;
  strikeIndex?: number;
}

type ClassicModelBeamStyle = "fire" | "blue" | "holy" | "void" | "inferno" | "electric";

const CLASSIC_MODEL_BEAM_RECIPE_STYLE: Partial<Record<VfxForgeRecipeId, ClassicModelBeamStyle>> = {
  "classic-beam-fire": "fire",
  "classic-beam-blue": "blue",
  "classic-beam-holy": "holy",
  "classic-beam-void": "void",
  "classic-beam-inferno": "inferno",
  "classic-beam-electric": "electric",
};

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
  const classicModelStyle = CLASSIC_MODEL_BEAM_RECIPE_STYLE[id];
  if (classicModelStyle) {
    segments = classicBeam(
      classicModelStyle,
      options.includeModelCore ?? true,
      options.trigger ?? { on: "castEffect" },
      options.beamAnchor ?? "self",
      options.beamYawOffsetDeg ?? 0,
    );
  } else if (
    id === "energy-beam-lightning-thin" || id === "energy-beam-lightning-wide" ||
    id === "energy-beam-holy-wide" || id === "energy-beam-void-wide"
  ) {
    segments = primitiveBeam(id);
  } else if (id === "line-blast-fire") segments = lineBlastFire();
  else if (id === "dash-slash-void") segments = dashSlashVoid();
  else if (id === "shockwave-dash-light") segments = shockwaveDashLight();
  else if (id === "combo-slash-holy") {
    segments = comboSlashHoly(options.includeFinalColumn ?? true, options.activationMode === "active");
  }
  else if (id === "reflect-counter-open") segments = reflectCounterOpen();
  else if (id === "avalon-counter-chain") segments = avalonCounterChain();
  else if (id === "rider-dash-beam-blue") segments = riderDashBeamBlue();
  else if (id === "avalon-guard-window") segments = avalonGuardWindow();
  else if (id === "chain-lightning-storm") segments = chainLightningStorm();
  else if (id === "bankai-transform") segments = bankaiTransform();
  else segments = perfectParry();
  return completeActionAnimations(segments, { activationMode: options.activationMode });
}

/**
 * Original W3X grammar: one locust unit wearing ReviveHuman is the long body;
 * one h008/FragDriller is its compact energetic core. The model documents map
 * their baked Y long-axis onto the aim direction, while scaleAxis controls
 * length independently from thickness. Endpoint particles only clarify charge
 * and contact; they are not a beam assembled from a row of flares.
 *
 * White rectangles seen during cold deterministic seeks were an Editor shader
 * readiness artifact. Main's ModelFxRig already restores WC3 additive blending
 * and honours alpha. VfxForgeStage prewarms that same runtime rig before proof
 * capture; never "fix" the artifact by deleting the source models again.
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
  style: ClassicModelBeamStyle,
  includeModelCore: boolean,
  trigger: VfxForgeRecipeTrigger,
  anchor: "self" | "target",
  yawOffsetDeg: number,
  sideOffsetU = 0,
): VfxScriptSegment[] {
  const segments: VfxScriptSegment[] = [];
  const palette = {
    fire: { outer: [1, 0.38, 0.04], core: [1, 0.9, 0.58], impact: "fx.prim.holy.explosion", impactScale: 1.05 },
    blue: { outer: [0.12, 0.42, 1], core: [0.72, 0.9, 1], impact: "fx.prim.lightning.pulse-lg", impactScale: 0.9 },
    holy: { outer: [1, 0.72, 0.18], core: [0.2, 0.55, 1], impact: "fx.prim.holy.explosion", impactScale: 1.05 },
    void: { outer: [0.34, 0.04, 0.62], core: [0.82, 0.3, 1], impact: "fx.prim.void.pulse-lg", impactScale: 0.95 },
    inferno: { outer: [1, 0.08, 0.01], core: [1, 0.52, 0.08], impact: "fx.prim.fire.explosion", impactScale: 1.05 },
    electric: { outer: [0.02, 0.68, 1], core: [0.7, 1, 1], impact: "fx.prim.lightning.pulse-lg", impactScale: 0.9 },
  } as const satisfies Record<ClassicModelBeamStyle, {
    outer: readonly [number, number, number];
    core: readonly [number, number, number];
    impact: string;
    impactScale: number;
  }>;
  const chosen = palette[style];
  const outerTint = chosen.outer;
  const coreTint = chosen.core;
  if (includeModelCore) {
    segments.push(zVfxScriptSegment.parse({
      kind: "modelFx", ...triggerFields(trigger), modelKey: CLASSIC_BEAM_MODEL_KEY,
      path: "static", anchor, scale: 2.65,
      scaleAxis: [1, 1, 2.68], spinDegPerSec: 720,
      clip: "idle", tint: outerTint, alpha: 0.82,
      // Main's shipped beam-roll family places the source dummy 150 WC3 units
      // in front of the caster. Keep the Editor macro on that measured baseline
      // instead of hiding a renderer gap with a per-skill offset.
      lifeSec: 1.2, offsetForwardU: 2.75, heightU: 0,
      ...(sideOffsetU === 0 ? {} : { offsetSideU: sideOffsetU }),
      ...(yawOffsetDeg === 0 ? {} : { yawOffsetDeg }),
    }));
    segments.push(zVfxScriptSegment.parse({
      kind: "modelFx", ...triggerFields(trigger, 35), modelKey: CLASSIC_BEAM_CORE_MODEL_KEY,
      path: "static", anchor, scale: 3.65,
      scaleAxis: [0.82, 0.82, 2.2], spinDegPerSec: -540,
      clip: "idle", clipTimeScale: 0.15,
      tint: coreTint, alpha: 0.58,
      lifeSec: 1.15, offsetForwardU: 2.75, heightU: 0,
      ...(sideOffsetU === 0 ? {} : { offsetSideU: sideOffsetU }),
      ...(yawOffsetDeg === 0 ? {} : { yawOffsetDeg }),
    }));
  }
  const outerRgb = outerTint.map((value) => Math.round(value * 255)) as [number, number, number];
  const coreRgb = coreTint.map((value) => Math.round(value * 255)) as [number, number, number];
  // When ability JSON already owns the model body, the card may still provide
  // a small charge cue. The from-blank model recipe omits it: real framebuffer
  // proof showed this generic pulse expanding into a character-covering ball.
  if (!includeModelCore) {
    segments.push(zVfxScriptSegment.parse({
      kind: "vfx", ...triggerFields(trigger),
      vfxId: style === "blue" || style === "electric" ? "fx.prim.lightning.pulse-sm" :
        style === "void" ? "fx.prim.void.pulse-sm" : "fx.prim.holy.pulse-sm",
      at: anchor, durationSec: 0.32, offsetForwardU: 0.5,
      w3xScale: 0.7, tint: coreRgb, flyHeight: 72, alpha: 0.62,
      ...(sideOffsetU === 0 ? {} : { offsetSideU: sideOffsetU }),
    }));
  }
  segments.push(zVfxScriptSegment.parse({
    kind: "vfx", ...triggerFields(trigger, 650),
    vfxId: chosen.impact,
    at: "target", durationSec: 0.46, w3xScale: chosen.impactScale,
    tint: outerRgb, flyHeight: 68, alpha: 0.68,
  }));
  return segments;
}

function primitiveBeam(
  id: Extract<VfxForgeRecipeId,
    "energy-beam-lightning-thin" | "energy-beam-lightning-wide" |
    "energy-beam-holy-wide" | "energy-beam-void-wide">,
): VfxScriptSegment[] {
  const styles = {
    "energy-beam-lightning-thin": { beam: "fx.prim.lightning.beam", impact: "fx.prim.lightning.pulse-sm", tint: [80, 220, 255], scale: 1.1 },
    "energy-beam-lightning-wide": { beam: "fx.prim.lightning.beam-lg", impact: "fx.prim.lightning.pulse-lg", tint: [95, 195, 255], scale: 1.7 },
    "energy-beam-holy-wide": { beam: "fx.prim.holy.beam-lg", impact: "fx.prim.holy.explosion", tint: [255, 222, 118], scale: 1.7 },
    "energy-beam-void-wide": { beam: "fx.prim.void.beam-lg", impact: "fx.prim.void.pulse-lg", tint: [165, 62, 255], scale: 1.7 },
  } as const;
  const chosen = styles[id];
  return [
    zVfxScriptSegment.parse({ kind: "anim", on: "castStart", at: "caster", pulse: "cast", clipWindowMs: 720 }),
    zVfxScriptSegment.parse({
      kind: "vfx", on: "castEffect", vfxId: chosen.beam, at: "self",
      offsetForwardU: 0.7, durationSec: 0.82, w3xScale: chosen.scale,
      tint: chosen.tint, flyHeight: 70, alpha: 0.78,
    }),
    zVfxScriptSegment.parse({
      kind: "vfx", on: "castEffect", atMs: 520, vfxId: chosen.impact, at: "target",
      durationSec: 0.38, w3xScale: chosen.scale * 0.62,
      tint: chosen.tint, flyHeight: 65, alpha: 0.68,
    }),
    zVfxScriptSegment.parse({ kind: "anim", on: "castEffect", atMs: 520, at: "target", pulse: "hurt", clipWindowMs: 460 }),
    zVfxScriptSegment.parse({ kind: "screenShake", on: "castEffect", atMs: 500, amplitude: chosen.scale > 1.2 ? 0.38 : 0.24, durationSec: 0.32 }),
  ];
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
      at: "target", durationSec: 0.34, w3xScale: 2.45,
      tint: [176, 54, 255], flyHeight: 68, alpha: 0.9,
    }),
    zVfxScriptSegment.parse({
      // One compact impact bloom clarifies contact without adding a second
      // slash. The actor swing plus the single arc remain the blade grammar.
      kind: "vfx", on: "castEffect", atMs: 390, vfxId: "fx.prim.void.pulse-sm",
      at: "target", durationSec: 0.26, w3xScale: 0.9,
      tint: [118, 26, 205], flyHeight: 48, alpha: 0.68,
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

function avalonGuardWindow(): VfxScriptSegment[] {
  return [
    zVfxScriptSegment.parse({ kind: "anim", on: "castStart", at: "caster", pulse: "cast", clipWindowMs: 650 }),
    zVfxScriptSegment.parse({
      kind: "vfx", on: "castEffect", vfxId: "fx.prim.holy.pulse-lg", at: "self",
      durationSec: 2, w3xScale: 1.65, tint: [255, 220, 112], flyHeight: 76, alpha: 0.58,
    }),
    zVfxScriptSegment.parse({ kind: "anim", on: "reflectSuccess", at: "caster", pulse: "guard", clipWindowMs: 520 }),
    zVfxScriptSegment.parse({
      kind: "vfx", on: "reflectSuccess", vfxId: "fx.prim.holy.nova", at: "self",
      durationSec: 0.36, w3xScale: 1.15, tint: [255, 244, 188], flyHeight: 74, alpha: 0.75,
    }),
  ];
}

function chainLightningStorm(): VfxScriptSegment[] {
  const strikes = [
    { atMs: 260, side: -1.5, scale: 1.25 },
    { atMs: 430, side: 0.2, scale: 1.5 },
    { atMs: 610, side: 1.45, scale: 1.2 },
  ];
  return [
    zVfxScriptSegment.parse({ kind: "anim", on: "castStart", at: "caster", pulse: "cast", clipWindowMs: 760 }),
    zVfxScriptSegment.parse({
      kind: "vfx", on: "castEffect", vfxId: "fx.prim.lightning.pulse-lg", at: "self",
      durationSec: 0.55, w3xScale: 1.25, tint: [130, 205, 255], flyHeight: 84, alpha: 0.66,
    }),
    ...strikes.flatMap(({ atMs, side, scale }) => [
      zVfxScriptSegment.parse({
        kind: "vfx", on: "castEffect", atMs, vfxId: "fx.prim.lightning.beam-lg", at: "target",
        durationSec: 0.42, offsetSideU: side, w3xScale: scale,
        tint: [96, 186, 255], flyHeight: 86, alpha: 0.72,
      }),
      zVfxScriptSegment.parse({
        kind: "vfx", on: "castEffect", atMs: atMs + 90, vfxId: "fx.prim.lightning.nova", at: "target",
        durationSec: 0.3, offsetSideU: side, w3xScale: 0.75,
        tint: [225, 246, 255], flyHeight: 52, alpha: 0.7,
      }),
      zVfxScriptSegment.parse({ kind: "anim", on: "castEffect", atMs: atMs + 90, at: "target", pulse: "hurt", clipWindowMs: 360 }),
    ]),
    zVfxScriptSegment.parse({ kind: "screenShake", on: "castEffect", atMs: 700, amplitude: 0.38, durationSec: 0.32 }),
  ];
}

function bankaiTransform(): VfxScriptSegment[] {
  return [
    zVfxScriptSegment.parse({ kind: "anim", on: "castStart", at: "caster", pulse: "cast", clipWindowMs: 850 }),
    zVfxScriptSegment.parse({
      kind: "vfx", on: "castEffect", vfxId: "fx.prim.void.summon", at: "self",
      durationSec: 1.2, w3xScale: 1.45, tint: [105, 12, 35], flyHeight: 65, alpha: 0.68,
    }),
    zVfxScriptSegment.parse({
      kind: "vfx", on: "castEffect", atMs: 180, vfxId: "fx.prim.blood.nova-lg", at: "self",
      durationSec: 0.7, w3xScale: 1.35, tint: [220, 30, 50], flyHeight: 58, alpha: 0.58,
    }),
    zVfxScriptSegment.parse({
      kind: "vfx", on: "castEffect", atMs: 420, vfxId: "fx.prim.void.dash", at: "self",
      durationSec: 0.8, w3xScale: 1.8, tint: [42, 16, 28], flyHeight: 78, alpha: 0.62,
    }),
    zVfxScriptSegment.parse({ kind: "screenFlash", on: "castEffect", colorRgb: [170, 25, 45], peakAlpha: 0.2, durationSec: 0.22 }),
    zVfxScriptSegment.parse({ kind: "screenShake", on: "castEffect", amplitude: 0.28, durationSec: 0.45 }),
  ];
}

function perfectParry(): VfxScriptSegment[] {
  return [
    zVfxScriptSegment.parse({ kind: "anim", on: "castStart", at: "caster", pulse: "guard", clipWindowMs: 900 }),
    zVfxScriptSegment.parse({
      kind: "vfx", on: "castEffect", vfxId: "fx.prim.holy.pulse-sm", at: "self",
      durationSec: 0.75, w3xScale: 0.85, tint: [170, 225, 255], flyHeight: 76, alpha: 0.55,
    }),
    zVfxScriptSegment.parse({ kind: "anim", on: "reflectSuccess", at: "caster", pulse: "guard", clipWindowMs: 420 }),
    zVfxScriptSegment.parse({
      kind: "vfx", on: "reflectSuccess", vfxId: "fx.prim.holy.arc", at: "target",
      durationSec: 0.32, w3xScale: 1.45, tint: [238, 250, 255], flyHeight: 74, alpha: 0.76,
    }),
    zVfxScriptSegment.parse({ kind: "anim", on: "reflectSuccess", atMs: 80, at: "target", pulse: "hurt", clipWindowMs: 520 }),
    zVfxScriptSegment.parse({
      kind: "bodyMove", on: "reflectSuccess", atMs: 80, at: "target", mode: "arc",
      offset: { x: 0, y: 0.12, z: 1.8 }, durationMs: 420,
    }),
    zVfxScriptSegment.parse({ kind: "screenShake", on: "reflectSuccess", atMs: 80, amplitude: 0.36, durationSec: 0.3 }),
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
      // This family is an authoritative rapid combo: keep exactly one readable
      // arc per strike. The primitive is an impact arc, so it stays on the
      // target hit point while the paired caster attack animation supplies the
      // swing; do not let seven successive arcs read as screen-sized projectiles.
      durationSec: 0.3, w3xScale: 1.6, flyHeight: 68, alpha: 0.82,
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
        // Yellow is the outer column; the blue layer below is its centred core.
        w3xScale: 2, tint: [255, 210, 70], alpha: 0.22,
      }),
      zVfxScriptSegment.parse({
        kind: "vfx", on: "strike", strikeIndex: 7, atMs: 45,
        vfxId: "fx.prim.lightning.beam-lg", at: "target", durationSec: 0.9,
        w3xScale: 1.28, tint: [70, 180, 255], alpha: 0.32,
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
    // One source-faithful locust pair: ReviveHuman is the gold body and
    // h008/FragDriller is the blue core. Do not stack two complete recipes.
    ...classicBeam("holy", true, { on: "strike", strikeIndex: 7, atMs: 220 }, "self", 0, 0),
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
    ...classicBeam("blue", true, { on: "castEffect" }, "self", 0),
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
