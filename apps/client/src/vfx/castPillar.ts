/**
 * castPillar — the PURE half of the 0.6 s cast telegraph light pillar.
 *
 * 需求原話：「castTimeSec 沒有設定 的預設都要改成 0.6s，原本有設定的都 +0.3s，
 * 所以施展技能的時候都要帶一段 0.6秒的施展光柱光芒來提示」
 *
 * The reference is a Final Fantasy VII limit-break column: a vertical shaft of
 * light erupting around the caster, a blazing yellow-white CORE, orange/red
 * flame FRINGES, energy converging upward, the character silhouetted inside it.
 *
 * Three rules this module exists to enforce, all of them testable without
 * Babylon:
 *
 * 1. HONEST BY CONSTRUCTION. Nothing here knows the number 0.6. The shape is
 *    parameterised on `u` = progress through the AUTHORITATIVE cast window
 *    (`castBegin.castTimeSec/ticks` → `castEnd`/`castInterrupt`), so a 0.35 s
 *    cast and a 2 s cast both rise, hold and pay off across their own real
 *    window. When the content lane changes a cast time, this follows for free.
 *    A cast that is INTERRUPTED is snuffed downward and never flashes — a
 *    pillar that keeps burning after a stun is a lie, and so is one that pays
 *    off the release the victim never actually ate.
 *
 * 2. IT MUST NOT WHITE OUT A TEAMFIGHT. This now fires on EVERY cast in the
 *    game rather than the 10 abilities that had a cast time, and a 3v3v3v3
 *    arena can put 12 champions on screen. `crowdAlphaScale` is the guard:
 *    per-pillar alpha falls as the concurrent count rises, so total screen
 *    luminance grows sub-linearly (12 pillars ≈ 5.4 pillars' worth of light,
 *    not 12) while a lone caster still gets the full FF7 column.
 *
 * 3. IT MUST NOT DROWN THE GROUND TELEGRAPH. The victim needs WHO / WHERE /
 *    HOW LONG, and "where" is the Telegraph ring at the AoE point — not the
 *    column at the caster's feet. The base flare is deliberately smaller and
 *    dimmer than the telegraph's own fill (asserted against Telegraph's
 *    exported `BASE_ALPHA`, not against a copied literal).
 *
 * ELEMENT AWARENESS. 依文潔琳's ice spells erupting in orange fire is exactly
 * the mismatch the owner has objected to before, so the fringe colour is the
 * ability's own element, resolved from the `fx.prim.<element>.<primitive>`
 * vfxKey the #79 bindings produce, then from the doc's own tint, and only then
 * from the FF7 gold default. The core is that colour whitened toward the
 * blazing yellow-white of the reference, so an ice cast reads as a white-blue
 * column and a fire cast as a white-gold one.
 */
import { elementStyle, elementFromVfxKey, type Element } from "../render/vfx/elements";
import { hotToCoolStops, popShrinkStops, type BurstSpec, type Rgb } from "./vfxPresets";
// GH#494 —— 上升餘燼的壽命/重力/阻力是**後台可調**的（`config.feel-fx@1.castMotes`）。
import { feelFx, type ConfigFeelFxDoc } from "./feelFx";

// ---------------------------------------------------------------------------
// Geometry / timing constants (world units, ms)
// ---------------------------------------------------------------------------

/**
 * Column height. The overhead health bar anchors at y = 2.45 (see
 * render/overheadAnchors), so 6.4 towers well over the champion and its HUD
 * without leaving the frame at the closest camera zoom.
 */
export const PILLAR_HEIGHT = 6.4;

/**
 * Outer flame shell radius. Larger than a champion's body radius (blob shadows
 * use 0.55) so the caster stands INSIDE the column rather than behind it —
 * that is what produces the FF7 silhouette read.
 */
export const SHELL_RADIUS = 0.82;

/**
 * Inner core radius. NARROWER than the body on purpose: the core is drawn with
 * ordinary depth testing, so the champion mesh occludes it and the character
 * reads as a dark silhouette against the blazing shaft.
 */
export const CORE_RADIUS = 0.26;

/** Base flare radius on the floor. Kept under the smallest authored AoE. */
export const GROUND_RADIUS = 0.95;

/** The shell tapers as it rises — a flame column, not a pipe. */
export const SHELL_TOP_TAPER = 0.62;

/** Peak alphas at a SINGLE-caster crowd level (before `crowdAlphaScale`). */
export const SHELL_PEAK_ALPHA = 0.75;
export const CORE_PEAK_ALPHA = 0.9;
/** Deliberately dim: the AoE telegraph owns "where", this only says "here". */
export const GROUND_PEAK_ALPHA = 0.42;

/** Release flash after a cast RESOLVES (castEnd). */
export const RELEASE_MS = 180;
/** Snuff-out after a cast is INTERRUPTED (stun / knockdown / death). */
export const EXTINGUISH_MS = 110;

/** Hard ceiling on concurrent pillars (12 champions + guardian headroom). */
export const MAX_PILLARS = 16;

/** Rising-mote pulse cadence per pillar (ms). */
export const MOTE_PERIOD_MS = 150;
/** Motes per pulse at full budget and a single caster. */
export const MOTE_COUNT = 6;

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export interface PillarPalette {
  /** blazing yellow-white shaft */
  core: Rgb;
  /** flame fringe — the ability's element colour */
  fringe: Rgb;
  /** resolved element, or null when it fell back to a doc tint / the default */
  element: Element | null;
}

/** FF7 limit-break gold: the fallback when an ability declares no element. */
export const DEFAULT_FRINGE: Rgb = [1.0, 0.55, 0.18];

/** How far the core is whitened from the fringe colour (0 = fringe, 1 = white). */
export const CORE_WHITEN = 0.6;

function mixWhite(rgb: Rgb, t: number): Rgb {
  return [rgb[0] + (1 - rgb[0]) * t, rgb[1] + (1 - rgb[1]) * t, rgb[2] + (1 - rgb[2]) * t];
}

/** Chroma (max − min channel) of a colour. 0 = grey/white, 1 = fully saturated. */
export function chromaOf(rgb: Rgb): number {
  return Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]);
}

/**
 * Least chroma a doc colour may have and still be usable as the FRINGE.
 *
 * MEASURED, not chosen for tidiness. `tintOfDoc` reads `colorStops[0]`, and the
 * imported WC3 flame docs — including `fx.ember-bolt-cast`, the placeholder 285
 * abilities still point at — open on a WHITE-HOT stop `[1,1,1,1]` and only
 * reach their real hue at the SECOND stop `[1,0.6,0.2]`. `brighten` then
 * normalises white to white, so 297 of 554 abilities (53.6%) resolved to a
 * pure-white column: `emissiveColor` and the vertex colours both read
 * [1,1,1] in a live match, and the on-screen light the pillar added measured
 * RGB [15,13,13] — a colourless grey flare, not the owner's FF7 reference.
 * A colour this desaturated carries no hue to show, so it is refused here and
 * the gold default takes over.
 */
export const TINT_MIN_CHROMA = 0.12;

/**
 * Normalize a tint to full brightness so a dim authored colour still produces a
 * LIGHT pillar. A near-black doc colour (peak ≈ 0) falls back to the default —
 * a black column is not a telegraph.
 */
function brighten(rgb: Rgb): Rgb {
  const peak = Math.max(rgb[0], rgb[1], rgb[2]);
  if (!(peak > 0.05)) return DEFAULT_FRINGE;
  return [rgb[0] / peak, rgb[1] / peak, rgb[2] / peak];
}

/**
 * The pillar's fringe hue read out of a vfx doc's whole colour RAMP rather than
 * its first stop.
 *
 * A flame doc is authored hot→cool: white-hot birth, hue in the middle, black
 * death. Taking stop 0 gets the white and taking the last gets the black; the
 * hue lives in between. So every stop (plus the legacy 2-stop `color.start`) is
 * considered and the most CHROMATIC one wins, after being normalised to full
 * brightness so a dim orange is not beaten by a pale one.
 *
 * Returns null when the doc carries no usable hue at all — the caller then
 * falls back to the FF7 gold, which is what the owner's reference actually
 * shows and is a far better default than "whatever grey came out of Kenney".
 */
export function pillarTintFromRamp(
  stops: readonly (readonly [number, readonly number[]])[] | undefined,
  legacyStart: readonly number[] | null | undefined,
): Rgb | null {
  let best: Rgb | null = null;
  let bestChroma = TINT_MIN_CHROMA;
  const consider = (c: readonly number[] | null | undefined): void => {
    if (!c || c.length < 3) return;
    const raw: Rgb = [c[0] as number, c[1] as number, c[2] as number];
    if (Math.max(raw[0], raw[1], raw[2]) <= 0.05) return; // black stop: no hue
    const norm = brighten(raw);
    const ch = chromaOf(norm);
    if (ch > bestChroma) {
      bestChroma = ch;
      best = norm;
    }
  };
  if (stops) for (const s of stops) consider(s[1]);
  consider(legacyStart);
  return best;
}

/**
 * Resolve a cast's palette. Precedence, strongest first:
 *   1. the `fx.prim.<element>.…` vfxKey the #79 roster bindings emit,
 *   2. the ability's own vfx doc tint (imported WC3 docs, no element in the id),
 *   3. the FF7 gold default.
 *
 * Step 2 is guarded by `TINT_MIN_CHROMA`: a grey/white doc colour is NOT a
 * colour, and letting it through is what made every second cast in the game
 * erupt colourless.
 */
export function pillarPalette(vfxKey: string | undefined, docTint: Rgb | null): PillarPalette {
  const element = elementFromVfxKey(vfxKey);
  if (element) {
    const fringe = elementStyle(element).color;
    return { core: mixWhite(fringe, CORE_WHITEN), fringe, element };
  }
  const lit = docTint ? brighten(docTint) : null;
  const fringe = lit && chromaOf(lit) >= TINT_MIN_CHROMA ? lit : DEFAULT_FRINGE;
  return { core: mixWhite(fringe, CORE_WHITEN), fringe, element: null };
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export type PillarPhase = "cast" | "release" | "extinguish";

export interface PillarShape {
  /** 0..1 of PILLAR_HEIGHT */
  height: number;
  /** multiplier on the built radii */
  radius: number;
  shellAlpha: number;
  coreAlpha: number;
  groundAlpha: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Fraction of the cast window the column takes to reach full height. */
export const RISE_FRACTION = 0.26;

/**
 * The column at progress `u` within `phase`.
 *
 * cast        — erupts (ease-out over the first RISE_FRACTION of the window),
 *               then holds full height while the core INTENSIFIES quadratically
 *               and the shell converges inward: "it is about to go off".
 * release     — a short outward/upward flash that decays to exactly 0.
 * extinguish  — collapses DOWNWARD and dies dimmer than it lived, with no
 *               flash at all, so an interrupt never looks like a resolve.
 */
export function pillarShape(phase: PillarPhase, u: number): PillarShape {
  const t = clamp01(u);
  if (phase === "cast") {
    const rise = clamp01(t / RISE_FRACTION);
    const eased = 1 - (1 - rise) * (1 - rise) * (1 - rise); // easeOutCubic
    const fadeIn = clamp01(t / 0.14);
    return {
      height: eased,
      radius: 1 - 0.22 * Math.pow(t, 1.5), // energy converging inward/upward
      shellAlpha: SHELL_PEAK_ALPHA * fadeIn * (0.72 + 0.28 * t),
      coreAlpha: CORE_PEAK_ALPHA * clamp01(t / 0.2) * (0.45 + 0.55 * t * t),
      groundAlpha: GROUND_PEAK_ALPHA * clamp01(t / 0.1) * (1 - 0.35 * t),
    };
  }
  if (phase === "release") {
    const decay = (1 - t) * (1 - t);
    return {
      height: 1 + 0.35 * t,
      radius: 1 + 0.9 * t,
      shellAlpha: SHELL_PEAK_ALPHA * 1.5 * decay,
      coreAlpha: CORE_PEAK_ALPHA * 1.7 * decay,
      groundAlpha: GROUND_PEAK_ALPHA * (1 - t),
    };
  }
  const decay = (1 - t) * (1 - t);
  return {
    height: 1 - 0.7 * t,
    radius: 1 - 0.4 * t,
    shellAlpha: SHELL_PEAK_ALPHA * 0.85 * decay,
    coreAlpha: CORE_PEAK_ALPHA * 0.85 * decay,
    groundAlpha: GROUND_PEAK_ALPHA * 0.85 * decay,
  };
}

// ---------------------------------------------------------------------------
// Crowding
// ---------------------------------------------------------------------------

/** Slope of the crowd roll-off. Higher = harsher dimming per extra caster. */
export const CROWD_K = 0.11;
/** A pillar never dims below this — a cast must stay readable in a brawl. */
export const MIN_CROWD_SCALE = 0.4;

/**
 * Per-pillar alpha multiplier when `active` pillars are burning at once.
 *
 * The problem this solves is additive blending: N columns at full alpha sum to
 * N times the light, and 12 of them is a white screen on exactly the frames
 * that matter most. A 1/(1+k(N-1)) roll-off makes TOTAL luminance grow
 * sub-linearly while keeping every individual column above a readable floor.
 */
export function crowdAlphaScale(active: number): number {
  if (active <= 1) return 1;
  return Math.max(MIN_CROWD_SCALE, 1 / (1 + CROWD_K * (active - 1)));
}

/** Total screen light of `active` pillars, in single-pillar units. */
export function crowdTotalLuminance(active: number): number {
  return Math.max(0, active) * crowdAlphaScale(Math.max(0, active));
}

/** Motes per pulse: crowd-attenuated and quality-scaled, never below 1. */
export function motesPerPulse(active: number, budgetScale: number): number {
  const n = Math.round(MOTE_COUNT * budgetScale * crowdAlphaScale(active));
  return Math.max(1, Math.min(MOTE_COUNT, n));
}

// ---------------------------------------------------------------------------
// Rising motes — the "energy converging upward" layer
// ---------------------------------------------------------------------------

/**
 * A pulse of embers born in a ring at the caster's feet and pulled UPWARD
 * (positive gravity) with heavy drag, so their outward birth velocity dies
 * almost immediately and they read as motes drawn INTO the column.
 *
 * ⭐ GH#494 —— owner 2026-08-21：「你在施展技能的時候會釋放一個粒子特效，最後會
 * 飄散到天空，這個**特效存活時間真的太長了，請你砍半，不需要後半段飄到天空**」。
 *
 * ⚠️ **只砍壽命是錯的修法**：粒子會在還往上衝的時候被剪掉，看起來像畫面破圖。
 * 所以三格一起動，而且方向是「讓上升**在壽命結束之前自己收斂**」：
 *
 * | | 之前 | 出貨 | 為什麼 |
 * |---|---:|---:|---|
 * | `lifetimeSec` | 0.35–0.7 | 0.175–0.35 | owner 說的「砍半」 |
 * | `gravityY`（往上） | 7.5 | 3 | 爬升的**力道**減半 ⇒ 不會衝出畫面上緣 |
 * | `drag`（每秒保留幾成速度） | 0.86 | 0.7 | 煞得更快 ⇒ 餘燼在**還看得見**的時候停住 |
 *
 * ⭐ 保留的是「energy converging INTO the column」那個讀法：粒子仍然從腳邊的環
 * 往上被吸，只是它在光柱的高度就收斂了，⛔ 不再變成一路飄到天空的髒東西。
 * 三格都是後台可調（`config.feel-fx@1.castMotes`），因為「多久算太久」是體感，
 * ⛔ 不是事實 —— 寫死＝owner 想微調就要重建 client 映像。
 */
export function moteSpec(
  palette: PillarPalette,
  motes: ConfigFeelFxDoc["castMotes"] = feelFx().castMotes,
): BurstSpec {
  // 後台可以把 min 填得比 max 大（兩格是各自獨立的欄位）；夾在這裡而不是讓
  // `min > max` 靜默流進粒子系統 —— 那會變成一個沒有人看得懂的視覺缺陷。
  const lo = Math.min(motes.lifetimeMinSec, motes.lifetimeMaxSec);
  const hi = Math.max(motes.lifetimeMinSec, motes.lifetimeMaxSec);
  return {
    count: MOTE_COUNT,
    lifetimeSec: { min: lo, max: hi },
    speed: { min: 0.5, max: 1.4 },
    sizeStops: popShrinkStops(0.22, { popT: 0.3 }),
    colorStops: hotToCoolStops(palette.fringe, { peakAlpha: 0.85 }),
    blend: "additive",
    gravityY: motes.gravityY, // UP: the one place in this codebase gravity is inverted
    drag: motes.drag,
    stretched: true,
    tailLength: 1.8,
    flatRing: { radius: SHELL_RADIUS * 0.78, height: 0.12 },
    texture: "assets/textures/particles/spark_05_rotated.png",
  };
}

/** Pool key for a palette's motes — bounded by the element count + 1. */
export function motePoolKey(palette: PillarPalette): string {
  return `castpillar/${palette.element ?? "default"}`;
}
