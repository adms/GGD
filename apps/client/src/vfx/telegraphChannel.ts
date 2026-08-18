/**
 * telegraphChannel — the READABILITY half of the #228 cast telegraph: which
 * CHANNEL a warning belongs to (mine / my ally's / incoming), how loud it may
 * be, and how many may be on the floor at once.
 *
 * WHY A SEPARATE MODULE. Everything here is a pure decision over plain numbers,
 * and every one of those decisions is a playtest complaint waiting to happen
 * (「不明顯」 / 「看不出來是誰放的」 / 「畫面全是圈圈」). Keeping it out of the
 * Babylon layer means it can be swept in a node test instead of being judged by
 * eye once and then silently drifting.
 *
 * THE THREE CHANNELS, and why hue alone is not one of them.
 *   • ENEMY  — crimson, SOLID ring + filled magic circle, brightness and pulse
 *     ramping to maximum as the wind-up completes. This is the only channel a
 *     player must react to, so it is the only one allowed to be the loudest
 *     thing on the floor.
 *   • ALLY   — cyan, OUTLINE only, low alpha, no pulse. It says "something is
 *     landing there, it is not aimed at you".
 *   • SELF   — amber, matching the #152 hold-preview's own AoE amber so your
 *     own cast reads as continuous with the ring you were just aiming with.
 *
 *   Before this, the enemy telegraph was `[0.95,0.45,0.2]` amber and the #152
 *   self-preview AoE ring was `[1.0,0.62,0.23]` amber — the same colour, so an
 *   incoming lethal AoE and your own aiming preview were indistinguishable.
 *   That alone is most of 「預告特效不明顯」.
 *
 *   Hue is NOT the only carrier: task #85 desaturates the whole scene while a
 *   player is dead-spectating, and colour-blind players exist. So each channel
 *   also differs in FILL (enemy filled, ally outline), in EDGE (self dashed,
 *   enemy solid — "this is incoming"), and in URGENCY (only the enemy channel
 *   ramps brightness + pulses).
 *   ⚠️ The dash used to be SHARED vocabulary with the #152 hold-preview ("I am
 *   aiming"). GH#367 made that preview a solid rim + translucent fill (owner's
 *   own spec), so this layer is now the only one dashing — which turns "how do
 *   you tell your own cast from an incoming one" back into a live DESIGN
 *   question rather than a settled convention. ⇒ GH#376 made all five carriers
 *   admin fields; see `applyTelegraphChannelStyles` below.
 *
 * UNKNOWN FAILS DANGEROUS. Before the seat/team wiring is up `relationOf`
 * answers "unknown". Painting an unresolved caster as benign would hide a real
 * incoming AoE; painting it as dangerous costs, at worst, a red ring under your
 * own feet for the first frames of a match. So unknown maps to the ENEMY
 * channel deliberately.
 */
import type { Rgb } from "./vfxPresets";

/** Relationship of the CASTER to the local player (VfxSystem.relationOf). */
export type TelegraphRelation = "self" | "ally" | "enemy" | "unknown";

/** How much of the telegraph a given cast is allowed to draw this frame. */
export type TelegraphTier = "full" | "outline" | "drop";

export interface TelegraphPalette {
  /** outer ring / corridor edge */
  ring: Rgb;
  /** magic-circle fill (ignored in the outline tier) */
  fill: Rgb;
  /** peak alpha at the END of the wind-up */
  alpha: number;
  /** dashed edge = "I am aiming" (#152 language); solid = "this is incoming" */
  dashed: boolean;
  /** urgency pulse at full wind-up, Hz. 0 = never pulses. */
  pulseHz: number;
  /** brightness at wind-up start, as a fraction of `alpha` */
  startAlphaFactor: number;
}

/**
 * ENEMY danger crimson. Deliberately far from BOTH #152 previews
 * (`RANGE_COLOR` blue `[0.45,0.75,1.0]`, `AOE_COLOR` amber `[1.0,0.62,0.23]`)
 * and from the cast-scorch decals, which are dark and desaturated.
 */
export const ENEMY_PALETTE: TelegraphPalette = {
  ring: [1.0, 0.22, 0.14],
  fill: [1.0, 0.36, 0.2],
  alpha: 0.95,
  dashed: false,
  pulseHz: 6,
  startAlphaFactor: 0.55,
};

/** ALLY: team cyan, outline-grade alpha, never pulses — context, not a threat. */
export const ALLY_PALETTE: TelegraphPalette = {
  ring: [0.35, 0.8, 1.0],
  fill: [0.35, 0.8, 1.0],
  alpha: 0.45,
  dashed: false,
  pulseHz: 0,
  startAlphaFactor: 0.7,
};

/** SELF: the #152 hold-preview amber, dashed, so your own cast reads as yours. */
export const SELF_PALETTE: TelegraphPalette = {
  ring: [1.0, 0.62, 0.23],
  fill: [1.0, 0.62, 0.23],
  alpha: 0.6,
  dashed: true,
  pulseHz: 0,
  startAlphaFactor: 0.7,
};

/**
 * ⭐ GH#376 —— 三條通道現在是**後台欄位**（`config.range-guide@1` 的
 * `telegraph.{self,ally,incoming}`），而不是三個編譯進去的常數。
 *
 * 為什麼：#367 把 hold 預覽改成「實心邊框 + 半透明填滿」（owner 明說的規格）之後，
 * 「虛線＝我在瞄」那個共用語彙沒有了 —— 虛線只剩這一層在用。要不要換一套區分
 * 方式是一個**設計決定**，⛔ 不是一個可以在註解裡辯護的常數（第一守則）。
 * 所以 ring / fill / alpha / dashed / pulseHz 五格都可調，操作者可以把「自己 vs
 * 來襲」換成任何一組色相＋虛實＋脈動的組合。
 *
 * ⚠️ `startAlphaFactor`（起手期間的亮度爬升）刻意**留在程式裡**：它是「快落地了」
 * 的時間曲線，不是「這一圈是誰的」的分辨器，而這一格管的是後者。
 *
 * ⚠️ 沒有人套用文件之前，這張表**就是**上面那三顆常數本人（同一個物件參照）——
 * 出貨行為與 GH#376 之前逐位元相同。
 */
const BASE_PALETTES: Readonly<Record<"self" | "ally" | "incoming", TelegraphPalette>> = {
  self: SELF_PALETTE,
  ally: ALLY_PALETTE,
  incoming: ENEMY_PALETTE,
};

let livePalettes: Readonly<Record<"self" | "ally" | "incoming", TelegraphPalette>> = BASE_PALETTES;

/** 一條通道**可調**的那五格（`config.range-guide@1` 解析後的樣子）。 */
export type TelegraphChannelStyle = Pick<
  TelegraphPalette,
  "ring" | "fill" | "alpha" | "dashed" | "pulseHz"
>;

/**
 * 由 `ui/rangeGuideConfig` 的 `applyRangeGuideDoc()` 推進來（`ContentDb.load` 呼叫）。
 * `null` = 回到出貨常數。⛔ 這一支沒有被呼叫 = 後台那三組欄位存了也不會上地板。
 */
export function applyTelegraphChannelStyles(
  styles: Readonly<Record<"self" | "ally" | "incoming", TelegraphChannelStyle>> | null,
): void {
  livePalettes = styles
    ? {
        self: { ...SELF_PALETTE, ...styles.self },
        ally: { ...ALLY_PALETTE, ...styles.ally },
        incoming: { ...ENEMY_PALETTE, ...styles.incoming },
      }
    : BASE_PALETTES;
}

export function paletteFor(relation: TelegraphRelation): TelegraphPalette {
  switch (relation) {
    case "self":
      return livePalettes.self;
    case "ally":
      return livePalettes.ally;
    // "unknown" fails DANGEROUS — see the header.
    default:
      return livePalettes.incoming;
  }
}

/**
 * Peak alpha at wind-up fraction `t` (0→1). The enemy channel starts dim and
 * ramps to full so "it is about to land" is legible without reading the fill
 * size — a second, non-hue urgency carrier (#85 desaturation, colour blindness).
 */
export function telegraphAlpha(p: TelegraphPalette, t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return p.alpha * (p.startAlphaFactor + (1 - p.startAlphaFactor) * clamped);
}

/**
 * Pulse multiplier on top of `telegraphAlpha`. Silent (1.0) until the last
 * third of the wind-up, then a ±12 % shimmer at `pulseHz` — a "NOW" tell that
 * survives both desaturation and a crowded floor. Returns 1 for channels with
 * `pulseHz === 0`.
 */
export function telegraphPulse(p: TelegraphPalette, t: number, nowMs: number): number {
  if (p.pulseHz <= 0 || t < PULSE_FROM_T) return 1;
  const ramp = (t - PULSE_FROM_T) / (1 - PULSE_FROM_T);
  return 1 + PULSE_DEPTH * ramp * Math.sin((nowMs / 1000) * p.pulseHz * Math.PI * 2);
}

/** Wind-up fraction at which the urgency pulse starts. */
export const PULSE_FROM_T = 0.66;
/** Peak pulse depth (±fraction of alpha). */
export const PULSE_DEPTH = 0.12;

// ---------------------------------------------------------------------------
// Screen budget
// ---------------------------------------------------------------------------

/**
 * How many telegraphs may draw their FULL treatment (filled magic circle +
 * resolve kick) at once. At the #161 camera pitch on a 390 px-tall phone a
 * median post-multiplier AoE (3.6 u) already covers ~300 px, so the real risk
 * is not "too faint" but "the floor is fog". Precedent: `MAX_PILLARS = 16` in
 * castPillar.ts, which is cheaper per instance.
 */
export const FULL_TIER_CAP = 6;

/**
 * Hard ceiling on CONCURRENT telegraphs of any tier. Past it, only warnings
 * that a player must react to survive — an ally's or your own cast is context
 * and can be dropped, an incoming one never is (dropping the enemy warning is
 * the exact bug #228 is about).
 */
export const TOTAL_TIER_CAP = 12;

/**
 * Tier for ONE new telegraph, given how many are already live. Decided at spawn
 * (not re-decided per frame) so a telegraph never changes its look mid-wind-up,
 * which would itself read as a state change the player has to interpret.
 */
export function telegraphTier(liveCount: number, relation: TelegraphRelation): TelegraphTier {
  if (liveCount < FULL_TIER_CAP) return "full";
  if (liveCount < TOTAL_TIER_CAP) return "outline";
  return relation === "self" || relation === "ally" ? "drop" : "outline";
}
