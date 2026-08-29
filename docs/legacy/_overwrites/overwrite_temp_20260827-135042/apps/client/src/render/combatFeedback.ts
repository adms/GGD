/**
 * combatFeedback — the PURE tunables + math AND the SINGLE ORCHESTRATOR for the
 * client "combat juice" layer (Capcom-style 打擊感). Every decision worth testing
 * lives here and touches neither Babylon nor the DOM: camera-shake
 * magnitude/decay/duration, the hit-flash colour per damage type, the
 * quality-tier gates that keep the ~700 fps baseline intact — and, new here,
 * `planImpactFeedback`, which turns ONE sim `ImpactProfile` into ONE coordinated
 * set of reactions so every channel crosses the light→heavy boundary on the
 * SAME frame at the SAME threshold (the audit's "single unified hit-weight"
 * fix — no more five decoupled constants each picking their own "heavy" cut).
 *
 * The imperative shells consume these:
 *   • CameraRig      — queues shake impulses, decays them via shakeDecayEnvelope
 *   • EntityViewRegistry — on `hitImpact`, calls planImpactFeedback and DISPATCHES
 *       the freeze + victim flash + attacker flash it returns onto the two views
 *   • GameApp        — drives `planCameraReaction` (below) with EVERY drained
 *       event and hands what comes back to CameraRig.addShake / exPunchIn; that
 *       is the camera wave that CONSUMES the plan's `shake` REQUEST (the
 *       directional kick) and fires the EX 特寫 punch-in.
 *
 * AUTHORITATIVE HITSTOP (client only): the sim owns the freeze — a deterministic
 * tick freeze of the two involved entities carried on `ImpactProfile.hitstopTicks`
 * (replicated in world.hitstop). The client NO LONGER re-derives a freeze curve
 * from the damage amount; it reads the sim's tick count verbatim so the struck
 * model un-freezes EXACTLY with the body, and a fully-blocked hit (dmg 0 but
 * impact ≥ the sim's floor) still freezes both bodies. This module never feeds
 * the sim, so trig/float here can't desync anything.
 */
import { damageFlashRgb, normalizeDamageSchool } from "./damagePalette";
import type { Quality } from "./RenderConfig";

// ---------------------------------------------------------------------------
// hit flash (ChampionView)
// ---------------------------------------------------------------------------

export type DmgType = "physical" | "magic" | "true";

/**
 * VICTIM FLASH colour for a landed hit — THREE-WAY as of owner's 2026-08-01
 * ruling (「紅物理; 紫魔法; 白真實」). It used to be `magic ? magenta : red`,
 * which made 真實傷害 pixel-identical to 物理傷害 on the struck body.
 *
 * The values live in `content/config/damage-colors.json` → `render/damagePalette`,
 * NOT here: this palette has been overruled twice in two days and a hex literal
 * in this file costs a rebuild per word (第一守則).
 *
 * WHY 真實 IS A CYAN-WHITE AND NOT WHITE. The overlay draws with ALPHA_COMBINE,
 * i.e. a straight lerp `out = base·(1−a) + flash·a`, so a white flash can only
 * push all three channels UP. Measured against the real w3x tints in
 * content/config/unit-tints.json, that is a no-op on every pale model —
 * ΔLuminance 0.03 for an untinted light rig, 0.04 for 白木老樹精, 0.09 for
 * 神性的流失 — i.e. literal white would have re-created the very complaint
 * (「看不出來」) on the very damage type it was meant to fix. `#33FFFF`
 * ([0.2, 1, 1]) is the palest colour that still clears the floor on all seven
 * measured tints. `render/damagePalette.test.ts` re-measures all three against
 * those tints; the suite below only asserts they stay pairwise distinct.
 */
export function flashColorFor(dmgType: string | undefined): [number, number, number] {
  return damageFlashRgb(normalizeDamageSchool(dmgType));
}

// ───────────────────────── THE VICTIM-FLASH LAYERING (read this first) ───────
// The victim flash carries TWO things, and they are layered, not competing:
//
//   LAYER 1 — DAMAGE TYPE (the system read, `flashColorFor` above).
//     Physical = red, magic = magenta, true = cyan-white — one hue per school,
//     none of them shared. This is combat legibility: it is how you know at a
//     glance what is chewing through you. It is the DEFAULT and it covers every
//     basic attack and every un-authored ability — i.e. the overwhelming
//     majority of hits in a match. NOTHING may take it away: no champion doc
//     authors a flash (all 112 that carry `hitFeel` author only
//     hitstop/shake/knockback), so a basic attack ALWAYS reads its damage type.
//
//   LAYER 2 — ABILITY ELEMENT (`hitFeel.flashColor`, 31 authored ability docs).
//     A named R/E/Q may name its own hue: 神聖 gold, ice blue, fire orange,
//     void violet. This does not DESTROY the type read, it REFINES it — the
//     player already knows the source (they watched the cast, they heard the
//     name), so on that one hit the flash is free to say WHICH spell rather
//     than merely WHICH damage school. The coarse read stays on the 99%.
//
//   THE GUARD — the authored hue is then forced through `legibleFlashColor`,
//     because layer 2 must not be allowed to break the thing layer 1 was
//     measured for. See that function.
//
// This is wired end to end as of the false-completions pass: `hitFeel.flashColor`
// / `flashMs` were accepted by the schema, replicated by the sim on every
// hitImpact, decoded into `ImpactProfile` right here — and then dropped on the
// floor, because `planImpactFeedback` rebuilt the flash from `flashColorFor` +
// `TIER_FX[tier].flashMs` unconditionally. 31 abilities shipped dead content.
// If you are about to "simplify" the resolver below back into a straight
// `flashColorFor(ctx.dmgType)` — that is the bug, and it is silent.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimum CHROMATIC SPREAD (max channel − min channel) an authored flash colour
 * must have before it is drawn.
 *
 * Anchored to a measurement, not to taste: the overlay draws with ALPHA_COMBINE
 * (`out = base·(1−a) + flash·a`), so what the eye actually sees is `a·|flash −
 * base|` per channel. Against a PALE model — the worst case, and the one the
 * palette above was retuned for — a low-spread colour has nothing to move:
 *
 *   flash              spread   max Δ vs a 0.9 base @ a=0.6
 *   [1, .15, .15] red    0.85    0.45     ← physical default (#FF2626)
 *   [.20,1,  1  ] cyan   0.80    0.42     ← true default (#33FFFF, 2026-08-01)
 *   [1, .35, .90] magic  0.65    0.33     ← the PALEST accepted default (#FF59E6)
 *   [1, .92, .60] gold   0.40    0.18     ← authored (godie-e007.r, +5 more)
 *   [.85,.92,1.0] azure  0.15    0.06     ← authored (godie-u00j.q, godie-hart.r)
 *   [1, 1,   1  ] white  0.00    0.06     ← the case the docstring above rejects
 *
 * 0.65 is the magenta's spread — i.e. "no authored colour may be less chromatic
 * than the palest colour the measurement pass was willing to accept". Eight of
 * the 31 authored docs sit under it and would otherwise flash invisibly.
 *
 * ⚠️ The three defaults are now OPERATOR-EDITABLE (`config/damage-colors.json`),
 * so this floor is what stops an authored colour going invisible, NOT what stops
 * a default doing it. `damagePalette.test.ts` re-measures the three defaults
 * against the real w3x tints, which is the assertion that actually protects
 * them; nothing clamps the doc at runtime.
 */
export const FLASH_MIN_SPREAD = 0.65;

/**
 * Bring an AUTHORED flash colour up to the legibility floor WITHOUT changing
 * what the author meant. The operation is a pure saturation boost about the
 * colour's own max channel — `c' = max − (max − c)·s` — which preserves the max
 * channel, the hue order and the ratios between the channel deltas, so the
 * author's gold stays gold and their azure stays azure; they just stop being
 * washed out. (Scaling toward black would have been the naive fix and is the
 * wrong one: it DIVIDES the spread, making the invisibility worse.)
 *
 * Only ever applied to authored colours. The two defaults in `flashColorFor`
 * are left alone — they were measured against the real w3x model tints in
 * content/config/unit-tints.json and are not to be second-guessed by a formula.
 */
export function legibleFlashColor(rgb: readonly [number, number, number]): [number, number, number] {
  const r = clamp01(rgb[0]);
  const g = clamp01(rgb[1]);
  const b = clamp01(rgb[2]);
  const max = Math.max(r, g, b);
  const spread = max - Math.min(r, g, b);
  // Already chromatic enough (fire orange, deep violet…) → author's value, verbatim.
  if (spread >= FLASH_MIN_SPREAD) return [r, g, b];
  // A pure greyscale authored colour (spread 0) has NO hue to preserve — there
  // is no direction to saturate in, so fall back to the PHYSICAL flash rather
  // than emitting a flash that cannot be seen. Read from the palette, not
  // re-typed here: two copies of the same red is two things that can drift, and
  // the drift would show up as one ability flashing a colour nothing else uses.
  if (spread <= 1e-6) return damageFlashRgb("physical");
  const s = FLASH_MIN_SPREAD / spread;
  return [clamp01(max - (max - r) * s), clamp01(max - (max - g) * s), clamp01(max - (max - b) * s)];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ───────────────────── 擋下的一擊 ⛔ 不閃「受傷紅」(GH#741 / 舊 #43) ──────────
/**
 * ⭐ **粒子說擋下了、模型說被打中。**
 *
 * `ImpactProfile.isBlock` 從 2026 年初就騎在同一份 payload 上（宣告 `:211`、
 * 解析 `:276`、塞進 plan `:465`），⛔ 而 {@link resolveVictimFlash} 從來沒有讀過它
 * ⇒ 一發被完全擋下的攻擊，接觸點放的是 `sparkKind:"block"` 的**冷白**火花，
 * 身體卻同時閃**物理紅** —— 兩個通道對同一次命中說相反的話（失敗形態⑧的親戚：
 * 值已經送到了，消費端不讀）。
 *
 * ── ⛔ 為什麼**不是**「改成白閃」──────────────────────────────────────────
 * 這個檔頭已經量過一次：身體閃光走 `ALPHA_COMBINE`（`out = base·(1−a) + flash·a`），
 * 所以**純白只能把三個通道往上推** —— 對著 `content/config/unit-tints.json` 的
 * 七個真實 w3x 色調量到 ΔLuminance 0.03–0.09，也就是在**最需要它的那些淡色模型上
 * 等於沒閃**。⭐ 這正是 `flashColorFor("true")` 最後變成 `#33FFFF` 而不是白色的原因。
 * ⇒ 格擋色也**必須**清得過同一條可見度地板（{@link FLASH_MIN_SPREAD}），
 * ⛔ 不可以憑「鋼灰比較像格擋」挑一個灰。
 *
 * `[0.25, 0.45, 0.95]` 的 spread 是 **0.70**（≥ 0.65 的地板），而且它與三個學派色
 * 都不同族：物理紅 / 魔法洋紅 / 真傷**淡**青白 —— 這一格是**深**鋼藍。
 *
 * ⚠️ 格擋**覆蓋**技能自己寫的 `hitFeel.flashColor`：「這一發被擋下了」是系統狀態，
 * 它比「這一發是火屬性」重要。⛔ 反過來會讓 31 支有色技能的格擋各閃各的顏色。
 */
export type BlockFlashMode =
  /** 深鋼藍、較短、較淡 —— ⭐ 出貨預設（我挑的） */
  | "steel"
  /** 完全不閃（火花＋音效＋hitstop 仍在）—— 最保守的一格 */
  | "none"
  /** ⛔ 2026-08-27 之前的行為：照樣閃受傷色。**一鍵 rollback 就是這一格** */
  | "damage";

/** 格擋身體閃光的色（0..1）。spread 0.70 —— 清得過 {@link FLASH_MIN_SPREAD}。 */
export const BLOCK_FLASH_RGB: readonly [number, number, number] = [0.25, 0.45, 0.95];
/** 格擋閃光相對於該 tier 的強度倍率（擋下 ≠ 受傷，所以比受傷淡）。 */
export const BLOCK_FLASH_ALPHA_SCALE = 0.75;
/** 格擋閃光相對於該 tier 的長度倍率（短促＝「彈開了」）。 */
export const BLOCK_FLASH_MS_SCALE = 0.7;

/** ⭐ 出貨值。⛔ 改這裡不叫改設定 —— 設定走 {@link setBlockFlashMode}。 */
export const SHIPPED_BLOCK_FLASH_MODE: BlockFlashMode = "steel";

let blockFlash: BlockFlashMode = SHIPPED_BLOCK_FLASH_MODE;

/**
 * 由 `ContentDb.load()` 灌入（樣板逐字照 `vfxPresets.setImpactRingScale`）。
 * ⚠️ 認不得的值 = 出貨預設，⛔ 不是「關掉」（`voxelBodyFor` 那條三態規矩）。
 */
export function setBlockFlashMode(mode: unknown): void {
  blockFlash =
    mode === "steel" || mode === "none" || mode === "damage" ? mode : SHIPPED_BLOCK_FLASH_MODE;
}

/** 現在生效的那一格（守衛用）。 */
export function blockFlashMode(): BlockFlashMode {
  return blockFlash;
}

/**
 * ATTACKER (source) flash on a LANDED hit — a brief WHITE impact pop on the
 * body that dealt the blow (task #69). The victim's red flash reads "I'm being
 * hit"; the attacker needs the complementary "I connected" beat, which melee
 * autos were missing entirely. White (not red) so it never reads as the
 * attacker taking damage, and short so back-to-back autos don't strobe. Drawn
 * through the same per-mesh renderOverlay channel as the victim flash, so it
 * likewise never mutates a shared .glb material.
 */
export const ATTACKER_FLASH_RGB: readonly [number, number, number] = [1, 1, 1];
/** Attacker impact-pop duration (ms) — shorter than the victim flash. */
export const ATTACKER_FLASH_MS = 70;

/** Overlay strength of the hit flash (0..1). */
export const FLASH_ALPHA = 0.6;
/**
 * Hit-flash duration. 80 ms was ~2.4 sim ticks at 30 Hz — long enough to be
 * dropped by a frame hitch. Autos land only every ~2 s, so there is no strobe
 * risk in going longer, and 130 ms reads as a deliberate hit.
 */
export const FLASH_MS = 130;

// ---------------------------------------------------------------------------
// ImpactProfile — the ONE sim-computed hit-weight (client-side mirror)
// ---------------------------------------------------------------------------

/**
 * Client mirror of the sim's `ImpactProfile` (packages/shared sim/combat/damage).
 * The wire carries it untyped on `hitImpact.data.profile` (Record<string,unknown>);
 * this is the shape the client narrows it to. Kept verbatim in step with the
 * STAGE-1 contract — do not diverge the field set.
 */
export type ImpactTier = "light" | "medium" | "heavy" | "crit";
/** Camera-shake character: aimed along the hit vector, or a radial ring. */
export type ShakeStyle = "directional" | "omni";
/**
 * Which hit-spark identity the client plays (mirrors the sim's SparkKind). The
 * client maps each to a distinct tint + intensity so a counter reads RED, a
 * block cool-white, an ice hit icy, etc. — the "distinct per profile.sparkKind"
 * contract. `ice` is content-opt-in only (the sim never defaults to it).
 */
export type SparkKind = "hit" | "heavy" | "counter" | "block" | "magic" | "ice";
export interface ImpactProfile {
  tier: ImpactTier;
  /** authoritative freeze ticks applied to BOTH fighters (crit/guardBreak-emphasised). */
  hitstopTicks: number;
  /** victim-only action-lock ticks (>= hitstopTicks). Client does not gate on it. */
  hitstunTicks: number;
  /** unit push direction (victim away from source); {0,0} when none. */
  knockbackDir: { x: number; z: number };
  /** push distance actually applied this hit (0 = no shove). */
  knockbackMag: number;
  isEX: boolean;
  isBlock: boolean;
  isCounter?: boolean;
  // ---- COSMETIC hints (client channels; damage-derived default, hitFeel-overridable) ----
  // Kept verbatim in step with the sim's ImpactProfile (sim/combat/damage.ts +
  // sim/combat/hitFeel.ts). `asImpactProfile` fills each with a tier-derived
  // default when a pre-#133 replay omits it, so downstream code never sees undefined.
  /** camera shake amplitude hint (0..~1.4). */
  shakeMag: number;
  /** shake character: aimed along the hit vector, or a radial ring. */
  shakeStyle: ShakeStyle;
  /** hit-spark identity the client plays (contact-point spark selection). */
  sparkKind: SparkKind;
  /**
   * AUTHORED-ONLY victim body-flash colour [r,g,b] 0..1. `undefined` is the
   * COMMON case and means "content named no hue" → the damage-type default.
   * Do NOT backfill this with a default; the absence is the whole signal.
   */
  flashColor?: [number, number, number];
  /** AUTHORED-ONLY victim body-flash duration (ms); `undefined` → tier default. */
  flashMs?: number;
  /** one-shot directional camera kick magnitude. */
  camKick: number;
  /** cosmetic client-side EX freeze ticks (0 = none). */
  exFreeze: number;
}

// ---- client mirror of the sim's damage-derived cosmetic DEFAULT curve ---------
// (sim/combat/hitFeel.ts). Only used to backfill a pre-#133 wire payload that
// predates the cosmetic fields, so an old replay still reads coherently.
// NOTE there is deliberately NO flash entry here: the flash pair is
// authored-or-absent on the wire, and its default is TIER_FX/flashColorFor
// below — one table, not a mirror that silently diverges from it.
const SHAKE_BY_TIER: Record<ImpactTier, number> = { light: 0.35, medium: 0.6, heavy: 0.85, crit: 1.0 };
const CAMKICK_BY_TIER: Record<ImpactTier, number> = { light: 0.15, medium: 0.3, heavy: 0.5, crit: 0.65 };
const EX_FREEZE_DEFAULT_TICKS = 8;

/**
 * Narrow an untyped `hitImpact.data.profile` into an ImpactProfile, or null when
 * the field is absent/malformed (older replays, non-hit events). Defensive:
 * the client must never throw on a wire payload it doesn't recognise.
 */
export function asImpactProfile(v: unknown): ImpactProfile | null {
  if (!hasImpactProfile(v)) return null;
  const p = v as Record<string, unknown> & { tier: ImpactTier; hitstopTicks: number };
  const tier = p.tier;
  const dir = p.knockbackDir as { x?: unknown; z?: unknown } | undefined;
  const isEX = Boolean(p.isEX);
  // AUTHORED-ONLY: narrow when the wire carries a real triple, otherwise leave
  // the field OFF the object entirely. `planImpactFeedback` reads the absence
  // as "no content override" — writing a placeholder here would erase that.
  const rgb = p.flashColor as unknown;
  const flashColor: [number, number, number] | undefined =
    Array.isArray(rgb) && rgb.length >= 3 && rgb.every((c) => typeof c === "number")
      ? [rgb[0] as number, rgb[1] as number, rgb[2] as number]
      : undefined;
  const out: ImpactProfile = {
    tier,
    hitstopTicks: p.hitstopTicks,
    hitstunTicks: typeof p.hitstunTicks === "number" ? p.hitstunTicks : 0,
    knockbackDir: {
      x: typeof dir?.x === "number" ? dir.x : 0,
      z: typeof dir?.z === "number" ? dir.z : 0,
    },
    knockbackMag: typeof p.knockbackMag === "number" ? p.knockbackMag : 0,
    isEX,
    isBlock: Boolean(p.isBlock),
    isCounter: p.isCounter === undefined ? undefined : Boolean(p.isCounter),
    // COSMETIC fields — narrow when present, else backfill the tier-derived
    // default so a pre-#133 replay (which omits them) still reads coherently.
    shakeMag: typeof p.shakeMag === "number" ? p.shakeMag : SHAKE_BY_TIER[tier],
    shakeStyle: p.shakeStyle === "omni" || p.shakeStyle === "directional" ? p.shakeStyle : tier === "crit" || isEX ? "omni" : "directional",
    sparkKind: isSparkKind(p.sparkKind) ? p.sparkKind : "hit",
    camKick: typeof p.camKick === "number" ? p.camKick : CAMKICK_BY_TIER[tier],
    exFreeze: typeof p.exFreeze === "number" ? p.exFreeze : isEX ? EX_FREEZE_DEFAULT_TICKS : 0,
  };
  if (flashColor) out.flashColor = flashColor;
  if (typeof p.flashMs === "number") out.flashMs = p.flashMs;
  return out;
}

/**
 * ALLOCATION-FREE probe: does this untyped `hitImpact.data.profile` carry a
 * usable ImpactProfile? Exactly the acceptance test `asImpactProfile` applies,
 * without building the narrowed object — so the per-frame event drain can ask
 * "does this batch speak #133?" (see `batchCarriesImpactProfile`) for the price
 * of two property reads.
 */
export function hasImpactProfile(
  v: unknown,
): v is { tier: ImpactTier; hitstopTicks: number } {
  if (typeof v !== "object" || v === null) return false;
  const p = v as { tier?: unknown; hitstopTicks?: unknown };
  const t = p.tier;
  return (
    (t === "light" || t === "medium" || t === "heavy" || t === "crit") &&
    typeof p.hitstopTicks === "number"
  );
}

/** Type guard for the SparkKind union off an untyped wire field. */
function isSparkKind(v: unknown): v is SparkKind {
  return (
    v === "hit" || v === "heavy" || v === "counter" || v === "block" || v === "magic" || v === "ice"
  );
}

// ---------------------------------------------------------------------------
// tier weight table — the SINGLE scalar every channel scales from
// ---------------------------------------------------------------------------

/**
 * Per-tier reaction tunables. `weight` (0..1) is the one scalar shake/spark/sfx
 * scale from so light→heavy crosses on the same tier for every channel. The
 * flash durations stay short (收尾精準): even a crit flash clears well under
 * 200 ms so back-to-back hits never strobe.
 */
interface TierFx {
  /** 0..1 hit-weight — shake amp, damage-number emphasis, sfx variant all scale from this. */
  weight: number;
  /** victim flash duration (ms) and overlay strength (0..1); the HUE is the school's. */
  flashMs: number;
  flashAlpha: number;
  /** attacker white "I connected" pop — shorter + lighter than the victim flash. */
  attackerMs: number;
  attackerAlpha: number;
}

const TIER_FX: Record<ImpactTier, TierFx> = {
  light: { weight: 0.35, flashMs: 110, flashAlpha: 0.5, attackerMs: 60, attackerAlpha: 0.45 },
  medium: { weight: 0.6, flashMs: 130, flashAlpha: 0.6, attackerMs: 70, attackerAlpha: 0.55 },
  heavy: { weight: 0.85, flashMs: 160, flashAlpha: 0.72, attackerMs: 85, attackerAlpha: 0.68 },
  crit: { weight: 1.0, flashMs: 185, flashAlpha: 0.85, attackerMs: 95, attackerAlpha: 0.8 },
};

/** 0..1 hit-weight for a tier — the single scalar every channel scales from. */
export function tierWeight(tier: ImpactTier): number {
  return TIER_FX[tier].weight;
}

// ---------------------------------------------------------------------------
// planImpactFeedback — the ONE orchestrator
// ---------------------------------------------------------------------------

/** A flash instruction: overlay colour, strength, and how long to hold it. */
export interface FlashSpec {
  rgb: [number, number, number];
  alpha: number;
  ms: number;
}

/**
 * A camera-shake REQUEST (not an applied shake). combatFeedback is the single
 * authority for how hard a tier shakes; the CAMERA wave consumes this through
 * `resolveCameraKick` (below), which layers on the local-perspective (taken vs
 * self) + quality/reduced-motion + teamfight-crowding multipliers the shell
 * alone knows. `dir` is the knockback vector — the hit direction the camera
 * kicks ALONG (audit P1 directional kick). `amp` is the pre-multiplier base.
 */
export interface ShakeRequest {
  amp: number;
  durationMs: number;
  dir: { x: number; z: number };
  /** shake character: aimed along `dir` (directional) or a radial ring (omni). */
  style: ShakeStyle;
  /**
   * One-shot translational camera KICK magnitude (tier/EX-scaled, block-softened)
   * — the hard directional shove on the contact frame the camera wave layers on
   * top of the ringing jitter. 0 = no kick. Consumed by CameraRig.addShake(dir…).
   */
  camKick: number;
}

/**
 * The coordinated reaction set for ONE landed hit, all keyed off ONE tier.
 * `freeze*` are AUTHORITATIVE (the sim's hitstopTicks, never re-derived), so the
 * animation freeze un-freezes exactly with the body and a fully-blocked hit
 * (dmg 0, impact ≥ the sim floor) still freezes both fighters.
 */
export interface ImpactFeedbackPlan {
  tier: ImpactTier;
  isBlock: boolean;
  isEX: boolean;
  /** authoritative sim freeze applied to BOTH fighters. 0 = no freeze (chip). */
  freezeTicks: number;
  freezeMs: number;
  /**
   * Victim flash: the ability's AUTHORED element hue when `hitFeel.flashColor`
   * named one, else the damage-school palette (red / magenta / cyan-white,
   * `config/damage-colors.json`). Alpha is always the
   * tier's. See `resolveVictimFlash`.
   */
  victimFlash: FlashSpec;
  /** attacker white pop, tier-scaled. */
  attackerFlash: FlashSpec;
  /** camera-shake REQUEST — consumed by the camera wave, NOT applied here. */
  shake: ShakeRequest;
  // ----- reserved hook / request points (a LATER wave consumes them) --------
  // SPARKS  : VfxSystem already reads `profile` off the same hitImpact event;
  //           it should switch its spark heaviness to `tier` (do NOT spawn here).
  // CAMERA  : DONE — `shake` (amp + dir + camKick) is consumed by
  //           resolveCameraKick → GameApp → CameraRig.addShake(dir…).
  // SFX     : ✅ DONE (GH#763, 2026-08-27) — `combatSfxKey` now picks
  //           hit-light / hit-medium / hit-heavy off this event's `tier`
  //           (see apps/client/src/audio/…; guard `hitWeightTier.test.ts` runs
  //           shipping content → shipping damage pipeline → the event the sim
  //           really emits → shipping `combatSfxKey`). Still: do NOT play audio
  //           here — this module builds the REQUEST, the audio layer consumes it.
  //           ⚠️ This line said "should" for weeks while it was already the
  //           blocking item on #763 — a comment that describes a TODO after the
  //           TODO is done is the 第三守則 failure shape (prose outliving its
  //           expiry with nothing going red).
  // NUMBER  : the floating damage number (#92) already emphasises crit/kill; it
  //           should read `tier` so its pop crosses the same boundary. Spawned
  //           in the UI layer, not here.
}

/**
 * Resolve the victim flash for one hit — the LAYERING described at the top of
 * this file, in one place so there is exactly one answer to "what colour was
 * that flash and why".
 *
 *   authored `flashColor` → the ability's element hue, saturation-guarded.
 *   nothing authored      → the measured damage-type palette (the 99% case).
 *
 * Duration follows the same rule (authored ms, else the tier's). ALPHA is
 * deliberately NOT authorable: it is the tier's hit-weight, the one scalar
 * every channel in this module crosses light→heavy on together, and letting
 * content pick it would re-open the "five decoupled constants" bug the
 * orchestrator exists to close. It is also what ui/combatText.ts's contrast
 * analysis assumes when it sizes the damage number's black ring against the
 * flash it is born on top of.
 */
export function resolveVictimFlash(
  profile: ImpactProfile,
  dmgType: string | undefined,
): FlashSpec {
  const fx = TIER_FX[profile.tier];
  return {
    rgb: profile.flashColor ? legibleFlashColor(profile.flashColor) : flashColorFor(dmgType),
    alpha: fx.flashAlpha,
    ms: profile.flashMs ?? fx.flashMs,
  };
}

/**
 * Turn ONE sim `ImpactProfile` into ONE coordinated reaction set. Pure: returns
 * data, dispatches nothing (the imperative shell applies freeze + flashes and
 * hands `shake` to the camera wave). Every channel is scaled by the SAME tier,
 * except the freeze, which is taken VERBATIM from the sim's authoritative tick
 * count so the client and sim un-freeze on the identical frame.
 */
export function planImpactFeedback(
  profile: ImpactProfile,
  ctx: { dmgType?: string; tickMs: number },
): ImpactFeedbackPlan {
  const fx = TIER_FX[profile.tier];
  // shake amplitude follows the profile's (hitFeel-overridable) cosmetic
  // `shakeMag` scaled into world units, clamped to the impulse cap. The camera
  // wave layers the local-perspective + quality multipliers on top of this base.
  const amp = Math.min(SHAKE_MAX_AMP, Math.max(0, profile.shakeMag) * SHAKE_MAX_AMP);
  return {
    tier: profile.tier,
    isBlock: profile.isBlock,
    isEX: profile.isEX,
    freezeTicks: profile.hitstopTicks,
    freezeMs: Math.max(0, profile.hitstopTicks) * ctx.tickMs,
    // THE HIT-FEEL OVERRIDE LANDS HERE. `resolveVictimFlash` layers the
    // ability's authored element hue over the damage-type default (and
    // guarantees the result is actually visible). This used to read
    // `flashColorFor(ctx.dmgType)` directly, which made hitFeel.flashColor /
    // .flashMs dead content on 31 shipped abilities. Keep the call.
    victimFlash: resolveVictimFlash(profile, ctx.dmgType),
    attackerFlash: { rgb: [...ATTACKER_FLASH_RGB], alpha: fx.attackerAlpha, ms: fx.attackerMs },
    shake: {
      amp,
      durationMs: shakeDurationMs(amp),
      dir: { ...profile.knockbackDir },
      style: profile.shakeStyle,
      camKick: Math.max(0, profile.camKick),
    },
  };
}

// ---------------------------------------------------------------------------
// camera shake (CameraRig + GameApp)
// ---------------------------------------------------------------------------

/** Absolute cap on a single shake impulse's amplitude (world units). */
export const SHAKE_MAX_AMP = 0.85;
/** Damage → base amplitude slope (world units per point of damage). */
const SHAKE_DMG_SLOPE = 0.006;
/** Multipliers layered onto the base amplitude. */
const SHAKE_CRIT_MULT = 1.5;
const SHAKE_KILL_MULT = 2.2;
/** Taking damage shakes harder than landing your own hit (self = a tiny kick). */
const SHAKE_TAKEN_MULT = 1.4;
const SHAKE_SELF_MULT = 0.45;

export interface ImpactShakeInput {
  amount: number;
  crit?: boolean;
  killingBlow?: boolean;
  /** true = the local player is the victim; false = the local player's own hit. */
  taken?: boolean;
}

/**
 * Peak shake amplitude (world units) for an impact. Scales with damage, is
 * bigger on crit/killingBlow, stronger when you TAKE damage than when you land
 * a hit, and is clamped to SHAKE_MAX_AMP. Pure + monotonic in `amount`.
 */
export function impactShakeAmp(input: ImpactShakeInput): number {
  const amount = Math.max(0, input.amount);
  if (amount <= 0) return 0;
  let amp = amount * SHAKE_DMG_SLOPE;
  if (input.crit) amp *= SHAKE_CRIT_MULT;
  if (input.killingBlow) amp *= SHAKE_KILL_MULT;
  amp *= input.taken ? SHAKE_TAKEN_MULT : SHAKE_SELF_MULT;
  return Math.min(SHAKE_MAX_AMP, amp);
}

/**
 * Shake impulse duration (ms). Retuned CRISP (收尾精準): a heavy hit rings for
 * ≤260 ms instead of the old 460 ms wool, so the frame settles fast after the
 * 破碎 shove. A light hit clears in ~120 ms.
 */
export function shakeDurationMs(amp: number): number {
  const a = Math.max(0, Math.min(SHAKE_MAX_AMP, amp));
  return 120 + (a / SHAKE_MAX_AMP) * 140; // 120..260 ms (was 160..460)
}

/**
 * Decaying envelope of a shake impulse over its life: 1 at birth, 0 at (and
 * past) `durationMs`. CUBIC ease-out (was quadratic) so the tail dies HARDER —
 * at 70% of the window a cubic tail is ~2.7% vs the quadratic ~9%, the crisp
 * snap-to-rest a Capcom impact settles with instead of a woolly ring. Pure; the
 * sole "shake impulse decay math".
 */
export function shakeDecayEnvelope(ageMs: number, durationMs: number): number {
  if (!(durationMs > 0) || ageMs <= 0) return ageMs <= 0 ? 1 : 0;
  if (ageMs >= durationMs) return 0;
  const t = 1 - ageMs / durationMs;
  return t * t * t;
}

// ---------------------------------------------------------------------------
// hitstop micro-jitter (ChampionView) — the 破碎 "buzz" on the frozen views
// ---------------------------------------------------------------------------

/**
 * Peak amplitude (world units) of the client-only shiver applied to the two
 * frozen fighter bodies during the hitstop window. ~0.02u reads as a 1–2px
 * buzz at the default closest dolly without ever dragging the body off its
 * frozen pose. Purely cosmetic (never touches the sim / the world transform).
 */
export const HITSTOP_SHIVER_AMP = 0.02;
/** Shiver oscillation rate (rad/ms) — a fast ~19 Hz buzz, not a wobble. */
const SHIVER_FREQ = 0.12;

/**
 * The tiny positional shiver offset for a body FROZEN by hitstop, at wall-clock
 * `nowMs`. High-frequency, sub-pixel-to-1px, and — crucially for 收尾精準 — it
 * only exists WHILE the caller is frozen (the caller stops applying it the
 * instant the window ends, so there is zero settle tail). `phase` decorrelates
 * the two fighters so attacker + victim don't buzz in lock-step. Amplitude eases
 * DOWN over the last `HITSTOP_SHIVER_TAPER_MS` of the window for a clean release.
 * Pure — no rng, no allocation on the hot path beyond the returned literal.
 */
export const HITSTOP_SHIVER_TAPER_MS = 60;
export function hitstopShiver(
  nowMs: number,
  freezeEndMs: number,
  phase: number,
): { x: number; z: number } {
  const remainMs = freezeEndMs - nowMs;
  if (remainMs <= 0) return { x: 0, z: 0 };
  // taper the last slice so the buzz fades to nothing right as the freeze lifts
  const taper = remainMs >= HITSTOP_SHIVER_TAPER_MS ? 1 : remainMs / HITSTOP_SHIVER_TAPER_MS;
  const a = HITSTOP_SHIVER_AMP * taper;
  return {
    x: a * Math.sin(nowMs * SHIVER_FREQ + phase),
    z: a * Math.cos(nowMs * SHIVER_FREQ * 1.31 + phase),
  };
}

// ---------------------------------------------------------------------------
// quality-tier gates (GameApp) — keep the ~700 fps baseline; low tier off
// ---------------------------------------------------------------------------

/**
 * Whether the heavy full-screen post-fx (the red damage vignette) may run.
 * OFF on the mobile/low tier — a full-screen pass is the one thing
 * that can dent the fps baseline on weak GPUs. Camera shake / flash / particles
 * stay on every tier (they are near-free).
 */
export function heavyPostFxEnabled(quality: Quality): boolean {
  return quality === "desktop";
}

/**
 * Camera-shake amplitude multiplier per tier (gently reduced on mobile), and the
 * ACCESSIBILITY kill-switch: under `prefers-reduced-motion` it returns 0, which
 * zeroes every camera reaction downstream — the ring jitter, the directional
 * kick AND the EX punch-in (they all gate on `scale > 0`). Motion-sensitive
 * players keep the flash/spark/sfx/hitstop channels, which do not move the view.
 */
export function cameraShakeScaleFor(quality: Quality, reducedMotion = false): number {
  if (reducedMotion) return 0;
  return quality === "mobile" ? 0.5 : 1;
}

// ---------------------------------------------------------------------------
// camera REACTION — the ONE event→camera dispatcher (audit P1: directional
// kick + EX 特寫). This is the wave the ShakeRequest was computed for: without
// it CameraRig.addShake(opts) and CameraRig.exPunchIn have no runtime caller
// and the camera only rattles undirected off the legacy scalar path.
// ---------------------------------------------------------------------------

/**
 * Hard cap on the one-shot translational shove handed to CameraRig (kick
 * magnitude, pre-KICK_GAIN). A crit EX taken to the face resolves to ~0.9
 * un-capped; 0.6 (≈0.54 world units of eye travel) is the point past which the
 * lurch starts throwing the framing off the fight instead of selling the blow.
 */
export const KICK_MAX_MAG = 0.6;

/** At most this many camera impulses out of ONE drained batch reach the rig. */
export const SHAKE_MAX_PER_FRAME = 3;

/**
 * Diminishing multiplier for the Nth camera impulse inside ONE drained batch —
 * the TEAMFIGHT guard. The rig SUMS its live impulses, so five simultaneous AoE
 * ticks would otherwise stack into a screen-quake. The first hit lands at full
 * strength, the 2nd/3rd are halved and thirded, the 4th and beyond are dropped:
 * a crowded frame still reads as "I'm getting hammered" without the nausea.
 */
export function shakeCrowdingScale(indexInFrame: number): number {
  if (!(indexInFrame > 0)) return 1;
  if (indexInFrame >= SHAKE_MAX_PER_FRAME) return 0;
  return 1 / (1 + indexInFrame);
}

/** A RESOLVED camera impulse — literally the arguments CameraRig.addShake takes. */
export interface CameraKick {
  amp: number;
  durationMs: number;
  /** UNIT hit vector the eye is shoved along ({0,0} on an omni ring). */
  dir: { x: number; z: number };
  style: ShakeStyle;
  /** one-shot translational kick magnitude (0 = ring jitter only). */
  kick: number;
}

export interface CameraKickCtx {
  /** true = the local player is the victim; false = the local player's own hit. */
  taken: boolean;
  /** quality × reduced-motion multiplier (0 = no camera motion at all). */
  scale: number;
  /** how many impulses already fired this drained batch (crowding guard). */
  crowdIndex?: number;
}

/**
 * Turn combatFeedback's tier-authored `ShakeRequest` into the concrete impulse
 * the rig takes, layering the three multipliers the shell owns: local
 * PERSPECTIVE (taking a hit shakes harder than landing one — the same
 * SHAKE_TAKEN/SELF_MULT the legacy scalar path uses, so the two paths stay in
 * tune), QUALITY/reduced-motion, and TEAMFIGHT crowding. Both amplitude and
 * kick are clamped, so the ceiling is identical to the legacy path's.
 *
 * Returns null when nothing should fire — the caller must then NOT count it
 * against its crowd budget.
 */
export function resolveCameraKick(req: ShakeRequest, ctx: CameraKickCtx): CameraKick | null {
  const perspective = ctx.taken ? SHAKE_TAKEN_MULT : SHAKE_SELF_MULT;
  const scale = Math.max(0, ctx.scale) * perspective * shakeCrowdingScale(ctx.crowdIndex ?? 0);
  if (!(scale > 0)) return null;
  const amp = Math.min(SHAKE_MAX_AMP, Math.max(0, req.amp) * scale);
  if (!(amp > 0)) return null;
  // A directional request needs a real vector: a {0,0} knockbackDir (chip hit,
  // no shove resolved) degrades to the radial ring rather than a NaN direction.
  const len = Math.hypot(req.dir.x, req.dir.z);
  const directional = req.style === "directional" && len > 1e-6;
  return {
    amp,
    durationMs: shakeDurationMs(amp),
    dir: directional ? { x: req.dir.x / len, z: req.dir.z / len } : { x: 0, z: 0 },
    style: directional ? "directional" : "omni",
    kick: directional ? Math.min(KICK_MAX_MAG, Math.max(0, req.camKick) * scale) : 0,
  };
}

// ---- EX cinematic punch-in (audit P1 特寫) ---------------------------------

/** How far the EX punch-in dollies the eye toward the fight (world units). */
export const EX_PUNCH_DEPTH = 2.2;
/** Punch-in beat length (ms): in fast, brief hold, crisp cubic ease back out. */
export const EX_PUNCH_MS = 300;
/**
 * Floor on the gap between two punch-ins. The rig's punch is a single scalar so
 * it can never STACK, but a re-fire would restart the beat; this keeps one EX =
 * one push-in even if the wire ever repeats the cast event.
 */
export const EX_PUNCH_MIN_INTERVAL_MS = 500;

/** Minimal shape of a drained wire event (structurally an EventMessage). */
export interface CombatEventLike {
  type: string;
  data: Record<string, unknown>;
}

export interface CameraReactionCtx {
  /** local champion's entity id (null before the seat resolves). */
  localId: number | null;
  /** quality × reduced-motion multiplier — 0 disables EVERY camera reaction. */
  scale: number;
  /** impulses already fired this drained batch (teamfight crowding guard). */
  crowdIndex: number;
  /**
   * True when the CURRENT drained batch carries at least one profiled
   * `hitImpact` (see `batchCarriesImpactProfile`). The sim emits `damage` and
   * `hitImpact` back-to-back for the SAME landed hit, so without this the
   * legacy scalar shake and the new directional kick would BOTH fire — one hit,
   * two shakes. When set, the legacy path stands down and the profiled kick is
   * the only one that reaches the rig; a pre-#133 batch (no profiles anywhere)
   * still gets the legacy shake, so old replays keep their feel.
   */
  batchProfiled: boolean;
  /** ms since the last EX punch-in fired (Infinity when none yet). */
  sinceExPunchMs: number;
  /** sim tick length (ms) — freeze-window maths inside planImpactFeedback. */
  tickMs: number;
}

/** What ONE drained event asks the camera to do. */
export interface CameraReaction {
  /** a shake/kick impulse to hand CameraRig.addShake, or null. */
  kick: CameraKick | null;
  /** fire CameraRig.exPunchIn (the EX 特寫). */
  exPunch: boolean;
}

/** Shared "this event moves no camera" result — frozen, never mutated. */
const NO_REACTION: CameraReaction = Object.freeze({ kick: null, exPunch: false });

/**
 * Does this drained batch speak #133? Scanned ONCE per frame, before the events
 * are dispatched, because `damage` arrives BEFORE its `hitImpact` twin and the
 * legacy path has to know to stand down at the moment it sees the damage.
 */
export function batchCarriesImpactProfile(events: readonly CombatEventLike[]): boolean {
  for (const ev of events) {
    if (ev.type === "hitImpact" && hasImpactProfile(ev.data.profile)) return true;
  }
  return false;
}

/**
 * THE dispatcher: one drained event in, the camera reactions it warrants out.
 * Pure — it moves nothing itself; the shell (GameApp) applies what it returns to
 * CameraRig and bumps its crowd index / EX clock accordingly.
 *
 *   hitImpact (profiled) → the DIRECTIONAL kick off the unified ImpactProfile
 *   damage               → the legacy scalar ring, ONLY on a pre-#133 batch
 *   abilityCast (EX)     → the cinematic punch-in, once per cast
 */
export function planCameraReaction(ev: CombatEventLike, ctx: CameraReactionCtx): CameraReaction {
  if (!(ctx.scale > 0)) return NO_REACTION; // reduced motion / shake disabled
  switch (ev.type) {
    case "hitImpact": {
      const kick = impactCameraKick(ev, ctx);
      return kick ? { kick, exPunch: false } : NO_REACTION;
    }
    case "damage": {
      if (ctx.batchProfiled) return NO_REACTION; // the profiled kick owns this hit
      const kick = legacyCameraKick(ev, ctx);
      return kick ? { kick, exPunch: false } : NO_REACTION;
    }
    case "abilityCast":
      return wantsExPunch(ev, ctx) ? { kick: null, exPunch: true } : NO_REACTION;
    default:
      return NO_REACTION;
  }
}

/** Numeric wire field, or null when absent/malformed. */
function numOf(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

/**
 * Which side of the hit the local player is on, or null when they are not
 * involved — a third party's exchange must never move your camera.
 */
function localPerspective(
  data: Record<string, unknown>,
  localId: number | null,
): { taken: boolean } | null {
  if (localId === null) return null;
  if (numOf(data.target) === localId) return { taken: true };
  if (numOf(data.source) === localId) return { taken: false };
  return null;
}

/** The DIRECTIONAL kick for a profiled `hitImpact` (the #133 path). */
function impactCameraKick(ev: CombatEventLike, ctx: CameraReactionCtx): CameraKick | null {
  const profile = asImpactProfile(ev.data.profile);
  if (!profile) return null; // pre-profile replay → the legacy path covers it
  const side = localPerspective(ev.data, ctx.localId);
  if (!side) return null;
  const dmgType = (ev.data.dmgType ?? ev.data.type) as string | undefined;
  const plan = planImpactFeedback(profile, { dmgType, tickMs: ctx.tickMs });
  return resolveCameraKick(plan.shake, {
    taken: side.taken,
    scale: ctx.scale,
    crowdIndex: ctx.crowdIndex,
  });
}

/**
 * The LEGACY undirected ring off the rich `damage` payload — kept verbatim for
 * pre-#133 servers/replays that never emit a profile. Suppressed batch-wide the
 * moment a profiled hitImpact is present (see CameraReactionCtx.batchProfiled).
 */
function legacyCameraKick(ev: CombatEventLike, ctx: CameraReactionCtx): CameraKick | null {
  const amount = numOf(ev.data.amount) ?? 0;
  if (amount <= 0) return null;
  const side = localPerspective(ev.data, ctx.localId);
  if (!side) return null;
  // impactShakeAmp already folds in the taken/self perspective — do NOT layer
  // resolveCameraKick's perspective multiplier on top of it a second time.
  const raw =
    impactShakeAmp({
      amount,
      crit: Boolean(ev.data.crit),
      killingBlow: Boolean(ev.data.killingBlow),
      taken: side.taken,
    }) *
    Math.max(0, ctx.scale) *
    shakeCrowdingScale(ctx.crowdIndex);
  const amp = Math.min(SHAKE_MAX_AMP, raw);
  if (!(amp > 0)) return null;
  return { amp, durationMs: shakeDurationMs(amp), dir: { x: 0, z: 0 }, style: "omni", kick: 0 };
}

/**
 * Should this `abilityCast` fire the EX 特寫? ONLY the local player's own EX
 * slot, and only once per beat. Deliberately keyed off the CAST (one event per
 * super) rather than the EX's hitImpacts — a multi-tick EX would otherwise
 * punch in on every damage tick.
 */
function wantsExPunch(ev: CombatEventLike, ctx: CameraReactionCtx): boolean {
  if (ev.data.slot !== "EX") return false; // Q/W/E/R never punch in
  if (ctx.localId === null || numOf(ev.data.caster) !== ctx.localId) return false;
  return ctx.sinceExPunchMs >= EX_PUNCH_MIN_INTERVAL_MS;
}
