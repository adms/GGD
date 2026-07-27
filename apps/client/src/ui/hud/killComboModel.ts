/**
 * killComboModel — the DISPLAY half of 連殺 combo (owner, 2026-07-27:
 * 「戰鬥時擊殺殭屍或英雄間隔5秒內會顯示 combo 連殺數量」).
 *
 * The COUNT is not decided here. It is computed in the sim off `world.tick`
 * (packages/shared/src/sim/combat/killCombo.ts) and arrives on the wire as the
 * `killCombo` event, so every client shows the same number and the replay
 * reproduces it. This module answers only the two questions a screen has:
 *
 *   ① IS IT STILL UP, and in which phase of its life? — `killComboDisplay`
 *   ② WHERE MAY IT PAINT, and how big?                — `killComboRect` + tiers
 *
 * Both are pure functions over plain numbers, so the whole thing is testable in
 * node without a DOM, a Babylon context or a running match — the same shape as
 * `controlLegendModel` and `hudLayout`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISION 2 — HOW A BIG NUMBER LOOKS DIFFERENT FROM A SMALL ONE
 *
 * 「50 連殺的字級跟 3 連殺不該一樣」. Five TIERS, each a step up in size, weight
 * and heat, so the reading is pre-attentive: you know it is a big one from the
 * corner of your eye, mid-fight, without parsing the digits.
 *
 *   2–4    連殺   34px  amber     the chain exists
 *   5–9    強襲   46px  orange    a real streak
 *   10–19  血洗   60px  ember     + glow
 *   20–49  修羅   76px  crimson   + glow + shake
 *   50+    天災   96px  gold      + glow + shake, the round-9 sweep number
 *
 * The tiers are OPEN-ENDED at the top on purpose — the owner's ruling is 「不設
 * 上限」. 天災 is where the ladder stops NAMING things, not where the count
 * stops: 137 連殺 renders as 137.
 *
 * WHY IT STARTS AT 2 (`KILL_COMBO_MIN_SHOWN`, shared with the sim): a 「1 連殺」
 * after every single zombie is not information, it is a flicker; and it would
 * make the 2 that follows read as a countdown rather than a chain.
 *
 * EXIT: the number does not blink out. It holds for the sim's own 5-second
 * window and then plays a short `out` phase (shrink + fade), so the eye sees the
 * chain END rather than the counter disappearing between glances. The exit is
 * the ONLY thing on this side that lives past the sim's window, and it is
 * cosmetic — `count` never grows during it (the sim already refused to chain).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISION 3 — WHERE IT GOES (#107 safe-area contract)
 *
 * Not a `hudLayout` corner slot. The registry is a FOUR-CORNER model and this
 * is horizontally centred, exactly like the PhaseTimer / AbilityBar clusters
 * that `controlLegendModel` already declares as "the two unslotted clusters".
 * So the rule it obeys is the same one they obey: it is measured against the
 * reserved rects of every persistent slot and it never lands on one.
 *
 * The band it takes is the CENTRE CORRIDOR — under the top-centre cluster
 * (`TOP_CENTRE_BAND_END`: PhaseTimer at top:10, SpectatorHint at top:64) and
 * ABOVE the bottom-centre ability cluster (`ABILITY_CLUSTER_H`: the AbilityBar
 * at bottom:14 and the ResourceBars at bottom:128). It is BOTTOM-anchored in
 * that corridor — sitting just over the ability bar, which is both where a
 * fighting game puts a combo counter and the half of the corridor the round-1
 * ControlLegend strip does not use (the strip is TOP-anchored in the same band;
 * `killCombo.test.ts` proves the two never overlap at any guard viewport).
 *
 * The width is then CLIPPED by whatever really reaches into that y-band from
 * either side — on a 667x375 phone that is the re-homed minimap and the revive
 * banner on the left and the audio cluster on the right, and only the rectangles
 * know it. Too little room ⇒ `null`, i.e. no counter. Null is a real answer:
 * a combo number painted over the player's own HP bar is worse than no combo
 * number, and the #107 contract is not negotiable for juice.
 *
 * NOT COVERED, BY CONSTRUCTION: the ability bar, the equipment bar, the
 * minimap, the ping chip and the build-stamp band all sit outside this
 * corridor — the last two inside the bottom `HUD_STAMP_BAND` gutter, which is
 * `ABILITY_CLUSTER_H` px below the corridor's floor.
 */
import {
  HUD_GAP,
  HUD_SLOTS,
  hudSlotRect,
  hudRectsOverlap,
  hudStampBandRect,
  type HudRect,
  type HudSlotId,
  type HudViewport,
} from "./hudLayout";
import {
  ABILITY_CLUSTER_H,
  ABILITY_CLUSTER_W,
  TOP_CENTRE_BAND_END,
  controlLegendRect,
  legendRows,
} from "../controlLegendModel";
import { KILL_COMBO_MIN_SHOWN, KILL_COMBO_WINDOW_MS } from "@ggd/shared/sim/combat/killCombo";

export { KILL_COMBO_MIN_SHOWN, KILL_COMBO_WINDOW_MS };

/* ═══════════════════════════════════════════════════════════════════════════
 * ① LIFETIME
 * ═══════════════════════════════════════════════════════════════════════════ */

/** How long the shrink-and-fade exit runs AFTER the sim's window has lapsed. */
export const KILL_COMBO_EXIT_MS = 420;

/**
 * How often the component re-asks "am I still up?". The counter has no other
 * clock — it is driven by discrete kill events, not by a per-frame stream — so
 * a cheap timer is what retires it. 80 ms is well under the threshold at which
 * the exit would look late, and 12 wake-ups a second cost nothing.
 */
export const KILL_COMBO_POLL_MS = 80;

/** What the store holds: the last combo the LOCAL player was credited with. */
export interface KillComboState {
  /** chain length from the sim (1 = a lone kill, which the display ignores) */
  count: number;
  /** `performance.now()`-style ms when that kill's event was received */
  atMs: number;
  /** bumps on every credited kill — restarts the pop animation on a re-hit */
  seq: number;
}

export type KillComboPhase = "live" | "out";

export interface KillComboDisplay {
  count: number;
  /** 1..5 — see the tier table in the module doc */
  tier: number;
  /** 連殺 / 強襲 / 血洗 / 修羅 / 天災 */
  label: string;
  /** px */
  fontSize: number;
  color: string;
  glow: boolean;
  shake: boolean;
  phase: KillComboPhase;
  /** 0..1 — 1 while live, ramping to 0 across the exit */
  opacity: number;
  seq: number;
}

interface Tier {
  min: number;
  label: string;
  fontSize: number;
  color: string;
  glow: boolean;
  shake: boolean;
}

/** Ascending; the LAST entry whose `min` is reached wins. Open-ended at the top. */
const TIERS: readonly Tier[] = [
  { min: 2, label: "連殺", fontSize: 34, color: "#ffd76a", glow: false, shake: false },
  { min: 5, label: "強襲", fontSize: 46, color: "#ffa63d", glow: false, shake: false },
  { min: 10, label: "血洗", fontSize: 60, color: "#ff6b3d", glow: true, shake: false },
  { min: 20, label: "修羅", fontSize: 76, color: "#ff3d6b", glow: true, shake: true },
  { min: 50, label: "天災", fontSize: 96, color: "#ffe08a", glow: true, shake: true },
];

/** The tier a count falls in (1-based index into TIERS). */
export function killComboTier(count: number): number {
  let tier = 1;
  for (let i = 0; i < TIERS.length; i++) {
    if (count >= TIERS[i]!.min) tier = i + 1;
  }
  return tier;
}

/**
 * PURE: what the screen should show, or `null` for "nothing".
 *
 * Two independent reasons for null, and they are different failures:
 *   • `count < KILL_COMBO_MIN_SHOWN` — there is no CHAIN yet;
 *   • the window plus the exit has elapsed — the chain is OVER.
 * The second is the one that must never silently stop working: without it the
 * last combo of the round would sit on screen for the rest of the match.
 */
export function killComboDisplay(
  state: KillComboState | null,
  nowMs: number,
): KillComboDisplay | null {
  if (!state || state.count < KILL_COMBO_MIN_SHOWN) return null;
  const age = nowMs - state.atMs;
  if (age < 0) return null; // a clock that ran backwards shows nothing, never a stuck number
  if (age > KILL_COMBO_WINDOW_MS + KILL_COMBO_EXIT_MS) return null;
  const t = TIERS[killComboTier(state.count) - 1]!;
  const out = age > KILL_COMBO_WINDOW_MS;
  const exited = out ? (age - KILL_COMBO_WINDOW_MS) / KILL_COMBO_EXIT_MS : 0;
  return {
    count: state.count,
    tier: killComboTier(state.count),
    label: t.label,
    fontSize: t.fontSize,
    color: t.color,
    glow: t.glow,
    shake: t.shake,
    phase: out ? "out" : "live",
    // clamped rather than trusted: a late poll must not produce a negative alpha
    opacity: Math.max(0, Math.min(1, 1 - exited)),
    seq: state.seq,
  };
}

/** The line the player reads. Exported so the test cannot drift from the view. */
export function killComboText(count: number): string {
  return `${count} 連殺`;
}

/**
 * Advance widths in `em`, for measuring `killComboText` WITHOUT a layout engine.
 *
 * The counter renders in a heavy sans with `font-variant-numeric: tabular-nums`,
 * so every digit is the same width by construction — that is what makes a
 * static estimate honest here rather than a guess. CJK ideographs are full-width
 * by definition of the script, not by font choice.
 *
 * Deliberately a slight OVER-estimate: erring wide shrinks the glyph a little
 * more than strictly needed, which is invisible. Erring narrow puts 「殺」 on
 * its own line, which is the bug this exists to kill.
 */
export const COMBO_EM_DIGIT = 0.58;
export const COMBO_EM_SPACE = 0.3;
export const COMBO_EM_CJK = 1.0;

/** Width of `killComboText(count)` in `em`, at any font size. */
export function killComboTextEm(count: number): number {
  const digits = String(Math.max(0, Math.trunc(count))).length;
  // 「連殺」 = two ideographs; the space is the one in killComboText
  return digits * COMBO_EM_DIGIT + COMBO_EM_SPACE + 2 * COMBO_EM_CJK;
}

/**
 * The glyph size that actually fits the box — bounded by BOTH axes.
 *
 * ⚠️ THE BUG THIS FIXES (owner, 2026-07-27: 「殺字有時候會換行 特別是數量大的時候」).
 * The size used to be `min(tierFontSize, rect.h * 0.62)` — HEIGHT ONLY. At the
 * 天災 tier (96px) 「50 連殺」 needs 3.46em ≈ 332px, and the corridor is 260px
 * wide, so the line wrapped and 「殺」 dropped to a line of its own. The box was
 * authored believing it was "wide enough for 「137 連殺」 at the top tier"; that
 * was never measured, and 137 at 96px needs ~377px.
 *
 * Shrinking beats widening: `rect` is the box the layout proved is FREE, and
 * widening it would walk into the ability bar / legend the placement rules
 * exist to avoid. A slightly smaller 天災 is still enormous.
 */
export function killComboNumberSize(count: number, boxW: number, boxH: number, tierFontSize: number): number {
  const byHeight = Math.round(boxH * 0.62);
  // 4% side breathing room so the glow does not sit flush against the edge
  const byWidth = Math.floor((boxW * 0.96) / killComboTextEm(count));
  // never below 12px: at that point the counter has stopped being juice and is
  // just noise, and the placement rules should have returned null instead
  return Math.max(12, Math.min(tierFontSize, byHeight, byWidth));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ② PLACEMENT
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Preferred box. Wide enough for 「137 連殺」 at the top tier, no wider. */
export const KILL_COMBO_PREF_W = 260;
export const KILL_COMBO_PREF_H = 120;
/** Below either of these the corridor cannot hold a legible counter → null. */
export const KILL_COMBO_MIN_W = 150;
export const KILL_COMBO_MIN_H = 56;

export interface KillComboPlacementOpts {
  touch: boolean;
  /**
   * The round-1 ControlLegend (#187) is on screen. It is TOP-anchored in this
   * very corridor, and on a landscape phone the corridor is only ~70-100px
   * tall, so the two genuinely cannot both fit there.
   *
   * WHEN THEY CANNOT, THE COUNTER YIELDS — `killComboRect` returns null. That
   * is the #107 precedence rule applied honestly: the legend is the box that
   * teaches a first-time player the controls, and it is dismissible; the combo
   * counter is juice. The cost is close to zero in practice: the legend is
   * ROUND 1 only, and round 1 has no zombies at all (mobs start at round 3),
   * so a combo there needs a champion double-kill inside 5 s.
   */
  legendUp: boolean;
  /** local players on this machine; >1 = split-screen (see the mount gate) */
  couchPlayers?: number;
}

/**
 * The legend's OWN rect for each binding set it could be showing, taken from
 * `controlLegendRect` rather than guessed — so the two boxes can never disagree
 * about where the legend is.
 *
 * ONE RECT PER MODE, not their union. The union would be a lie on desktop,
 * where the keyboard legend is a LEFT COLUMN and the gamepad legend is a
 * CENTRED STRIP: bridging them produces a phantom block covering half the
 * screen, and the counter would refuse to paint anywhere. Clearing each
 * candidate separately is both conservative and true — whichever the legend
 * turns out to be, the counter is off it.
 */
function legendObstacles(viewport: HudViewport, opts: KillComboPlacementOpts): HudRect[] {
  if (!opts.legendUp) return [];
  const couchPlayers = opts.couchPlayers ?? 1;
  const out: HudRect[] = [];
  for (const mode of ["keyboard", "gamepad", "touch"] as const) {
    const r = controlLegendRect(viewport, {
      touch: opts.touch,
      couchPlayers,
      rows: legendRows(mode),
    });
    if (r) out.push({ x: r.x, y: r.y, w: r.w, h: r.h });
  }
  return out;
}

/**
 * Every rect the counter must stay off: the reserved box of each PERSISTENT
 * corner slot (dev-only transients excluded, per hudLayout's own rule that a
 * settings-gated overlay never shrinks the real UI), the two centred clusters
 * that own no corner, and — while it is up — the round-1 control legend.
 */
export function killComboObstacles(
  viewport: HudViewport,
  opts: KillComboPlacementOpts,
): { id: string; rect: HudRect }[] {
  const touch = opts.touch;
  const out = HUD_SLOTS.filter((s) => !s.transient).map((s) => ({
    id: s.id,
    rect: hudSlotRect(s.id as HudSlotId, viewport, touch),
  }));
  // the bottom-centre ability cluster (AbilityBar + ResourceBars) — declared in
  // controlLegendModel because no corner owns it, reused here rather than
  // restated so the two cannot disagree about where the player's bars are.
  out.push({
    id: "ability-cluster",
    rect: {
      x: Math.max(0, (viewport.width - ABILITY_CLUSTER_W) / 2),
      y: Math.max(0, viewport.height - ABILITY_CLUSTER_H),
      w: Math.min(ABILITY_CLUSTER_W, viewport.width),
      h: Math.min(ABILITY_CLUSTER_H, viewport.height),
    },
  });
  // the build-stamp / ping gutter (#245, #272)
  out.push({ id: "stamp-band", rect: hudStampBandRect(viewport) });
  legendObstacles(viewport, opts).forEach((rect, i) =>
    out.push({ id: `control-legend-${i}`, rect }),
  );
  return out;
}

/**
 * The rectangle the counter may paint in, or `null` when this viewport has no
 * room for it.
 *
 * BOTTOM-ANCHORED in the centre corridor: it rides just above the ability
 * cluster — where a fighting game puts a combo counter, and the half of the
 * corridor the TOP-anchored round-1 ControlLegend strip does not want.
 */
export function killComboRect(
  viewport: HudViewport,
  opts: KillComboPlacementOpts,
): HudRect | null {
  const mid = viewport.width / 2;
  const bottom = viewport.height - ABILITY_CLUSTER_H - HUD_GAP;
  let top = TOP_CENTRE_BAND_END + HUD_GAP;

  // A legend that is up AND CENTRED (its `strip` shape) owns the top of this
  // corridor outright, so the counter starts below it. Its desktop `column`
  // shape hugs the left flank instead and is handled by the side scan below —
  // which is why this test is on the RECT's geometry, not on "is it up".
  for (const legend of legendObstacles(viewport, opts)) {
    if (legend.x < mid && legend.x + legend.w > mid) {
      top = Math.max(top, legend.y + legend.h + HUD_GAP);
    }
  }

  const corridor = bottom - top;
  if (corridor < KILL_COMBO_MIN_H) return null;

  const h = Math.min(KILL_COMBO_PREF_H, corridor);
  const y = bottom - h;

  // How far chrome reaches INTO this y-band, per side. Measured from the rects
  // rather than from a corner's widest slot: at 812x375 the bottom-right stack
  // climbs into bands a corner-based guess never sees.
  let left = 0;
  let right = 0;
  for (const { rect: r } of killComboObstacles(viewport, opts)) {
    if (r.y >= y + h || r.y + r.h <= y) continue; // no vertical overlap
    // Anything STRADDLING the centre line leaves no centred gap at all — say so
    // rather than paint over it. (The ability cluster on a viewport too short to
    // hold both; a legend strip that reaches all the way down.)
    if (r.x < mid && r.x + r.w > mid) return null;
    if (r.x + r.w <= mid) left = Math.max(left, r.x + r.w);
    else right = Math.max(right, viewport.width - r.x);
  }

  // Stay CENTRED on the viewport (an off-centre combo number reads as a bug),
  // so the usable half-width is bounded by the WORSE of the two sides.
  const halfFree = Math.min(mid - left, mid - right) - HUD_GAP;
  const w = Math.min(KILL_COMBO_PREF_W, halfFree * 2);
  if (w < KILL_COMBO_MIN_W) return null;

  return { x: Math.round((viewport.width - w) / 2), y: Math.round(y), w: Math.round(w), h };
}

/**
 * Everything the resolved rect actually touches — empty is the only passing
 * answer. Named ids rather than a boolean so the guard's failure says WHICH
 * piece of chrome the counter landed on.
 *
 * ⚠️ DELIBERATELY NOT BUILT FROM `killComboObstacles`. Checking the placement
 * against the very list the placement consulted is a tautology: drop a slot
 * from that list and the counter lands on it while this function, reading the
 * same shortened list, still reports "clear" — a green tick certifying the
 * defect. So the check re-derives its rects from `HUD_SLOTS` and the two
 * centred clusters independently. The duplication IS the guard.
 */
export function killComboCollisions(
  viewport: HudViewport,
  opts: KillComboPlacementOpts,
): string[] {
  const rect = killComboRect(viewport, opts);
  if (!rect) return [];
  const touch = opts.touch;
  const hits: string[] = [];
  for (const s of HUD_SLOTS) {
    if (s.transient) continue;
    if (hudRectsOverlap(rect, hudSlotRect(s.id as HudSlotId, viewport, touch))) hits.push(s.id);
  }
  const cluster: HudRect = {
    x: Math.max(0, (viewport.width - ABILITY_CLUSTER_W) / 2),
    y: Math.max(0, viewport.height - ABILITY_CLUSTER_H),
    w: Math.min(ABILITY_CLUSTER_W, viewport.width),
    h: Math.min(ABILITY_CLUSTER_H, viewport.height),
  };
  if (hudRectsOverlap(rect, cluster)) hits.push("ability-cluster");
  if (hudRectsOverlap(rect, hudStampBandRect(viewport))) hits.push("stamp-band");
  legendObstacles(viewport, opts).forEach((r, i) => {
    if (hudRectsOverlap(rect, r)) hits.push(`control-legend-${i}`);
  });
  return hits.sort();
}
