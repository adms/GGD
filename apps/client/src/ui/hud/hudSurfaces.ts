/**
 * hudSurfaces — the THIRD layer of the #107 safe-area contract.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS STILL MISSING
 * ─────────────────────────────────────────────────────────────────────────────
 * `hudLayout` already declares two things:
 *   · SLOTS  (#42) — corner CHROME, so two pieces of chrome cannot collide;
 *   · PANELS (#107) — a docked / full-screen panel's EDGE, so covered chrome can
 *     see it and yield.
 *
 * Neither can express the thing the owner reported three times on 2026-07-30:
 *
 *   ① 「你的競技場已分出勝負」 covering the round 評價 card. Both are boxes no
 *      registry knows about — the banner hangs off `TOP_CENTRE_BAND_END`, the
 *      card off `topRightClear()` — so neither could see the other, nor the
 *      「Round over」 pill HudRoot pins at `top: 120` in the same phase and the
 *      same centre column.
 *   ② the SCOREBOARD's expanded K/D list. Its slot reserves 26 px; the list that
 *      opens out of it is ~300 px tall and grows straight down through the
 *      `audio-toggle` slot. That slot is `portal: true` — DECLARED to ride above
 *      every panel and never yield — so no z-index could have saved the list.
 *      It had to leave the column.
 *   ③ the 戰績變化 charts, appended to the bottom of a `maxHeight: 92vh`
 *      scrolling card, i.e. below the fold of the one screen the player reads.
 *
 * The common shape: **a box that is neither a corner slot nor an edge-docked
 * panel**. #42's lesson (and #219's brief) is that moving them one at a time
 * only pushes the collision to the next corner — so they get a REGISTRY,
 * resolved rects, and one structural guard:
 *
 *   ⟹ NO TWO SIMULTANEOUSLY-VISIBLE SURFACES MAY OVERLAP, and no managed
 *     surface may overlap a slot that is painted at the same time.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MODEL
 * ─────────────────────────────────────────────────────────────────────────────
 * A surface declares WHEN it can be up (`phases`), WHAT LAYER it paints at
 * (`z`), which panels it deliberately paints INSIDE (`over`), and WHERE it may
 * paint (`place`). Three placements, each a rule rather than a coordinate:
 *
 *   top-band    a centred box that pins its own fixed `top` (the phase clock,
 *               the 觀戰中 pill). RESERVED rows: their components still pin
 *               themselves; declaring them is what lets everything else avoid
 *               them, and it is what `TOP_CENTRE_BAND_END` is cross-checked
 *               against.
 *   top-centre  a centred box that STACKS below that band in declared `order`.
 *               The stack is PHASE-FILTERED, which is the whole fix for ①: the
 *               spectate banner sits at the band end during combat and one row
 *               lower during `resolution`, where 「Round over」 is above it.
 *   inward      a card or drawer docked INSIDE a corner column — its far edge
 *               stops one gap short of the widest slot painted in that corner,
 *               so it provably never lands under the column, and therefore
 *               never under the portal-ed audio cluster (② and half of ①).
 *
 * Each placement is then CLIPPED by the rectangles really painted in the same
 * scene — the free-interval sweep in {@link freeIntervals}, the same technique
 * `controlLegendModel` already uses for the legend strip. Too little room
 * returns `null`, and null is a real answer: a banner painted over the player's
 * 評價 is worse than one that waits for the next screen.
 *
 * ⚠️ A CLIPPING RESOLVER MAKES ITS OWN GUARD VACUOUS, so `hudSurfaces.test.ts`
 * proves three things and not one:
 *   (a) the resolved rects are pairwise disjoint in every scene;
 *   (b) each surface is STILL REALLY VISIBLE at the viewports it must work on
 *       — a resolver that returned null everywhere would satisfy (a) trivially;
 *   (c) the PRE-FIX geometry of all three reports COLLIDES, reproduced from the
 *       numbers the components used to hard-code. Same non-vacuity trick
 *       `hudLayout.test.ts` uses for the shop (`applyDisplaced = false`).
 *
 * ⛔ WHY NOT NEW HUD SLOTS. `hudLayout.test.ts:245` asserts the bottom-left
 * skipTransient stack ends at `fps`, so any non-transient slot with order > 1
 * there fails it — but more fundamentally these are not corner chrome: three of
 * them are centred, and the slot registry is a four-corner model.
 */
import {
  HUD_EDGE,
  HUD_GAP,
  HUD_PANELS,
  HUD_SLOTS,
  HUD_STAMP_BAND,
  HUD_Z,
  hudDisplacedRect,
  hudPanelRect,
  hudRectsOverlap,
  hudSlotCorner,
  hudSlotOffset,
  hudSlotRect,
  hudSlotWidth,
  resolveSlotUnderPanels,
  type HudCorner,
  type HudPanelId,
  type HudPanelSpec,
  type HudRect,
  type HudSlotId,
  type HudSlotSpec,
  type HudViewport,
} from "./hudLayout";
import { TOP_CENTRE_BAND_END } from "../controlLegendModel";
import { roundReportPlacement } from "../panels/roundReportLayout";

/* ═══════════════════════════════════════════════════════════════════════════
 * SCENES — "what is on screen at once"
 * ═══════════════════════════════════════════════════════════════════════════ */

export const HUD_PHASES = [
  "champSelect",
  "intermission",
  "combat",
  "resolution",
  "matchEnd",
] as const;

export type HudPhase = (typeof HUD_PHASES)[number];

/**
 * A concrete moment: the match phase plus the corner-covering panels open in
 * it. The panels are part of the scene rather than derived from the phase
 * because the shop's `phases` (`intermission` + `combat`) say where it CAN
 * mount, not where it does — in combat it is up only for a defeated player. So
 * the guard sweeps both configurations of every phase and the runtime hook
 * passes whatever `useActiveHudPanels()` really reports.
 */
export interface HudScene {
  phase: HudPhase;
  panels: readonly HudPanelSpec[];
}

/** The corner-covering panels a phase CAN have open (the guard's worst case). */
export function panelsForPhase(phase: HudPhase): HudPanelSpec[] {
  return HUD_PANELS.filter((p) => p.covers.length > 0 && p.phases.includes(phase));
}

/** Both configurations of every phase — the guard's scene sweep. */
export function hudScenes(): HudScene[] {
  const out: HudScene[] = [];
  for (const phase of HUD_PHASES) {
    out.push({ phase, panels: [] });
    const withPanels = panelsForPhase(phase);
    if (withPanels.length > 0) out.push({ phase, panels: withPanels });
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE REGISTRY
 * ═══════════════════════════════════════════════════════════════════════════ */

/** A centred box that pins its own fixed `top` (RESERVED; mirrors its owner). */
export interface HudTopBandPlace {
  kind: "top-band";
  /** px from the top edge — the number the component really hard-codes */
  top: number;
  height: number;
  /** upper bound on the painted width (it is centred, so this is not the vw) */
  width: number;
}

/** A centred box that stacks in the top-centre column, below that band. */
export interface HudTopCentrePlace {
  kind: "top-centre";
  /** unique per surface; lower = closer to the top of the column */
  order: number;
  height: number;
  /** the widest it ever paints */
  maxWidth: number;
  /** below this it is not painted at all — a clipped sentence is a lie */
  minWidth: number;
}

/**
 * A card or drawer docked INSIDE a corner column: its far edge stops one
 * {@link HUD_GAP} short of the widest slot painted in that corner, so it can
 * never land under the column — including under the `portal` audio cluster,
 * which rides above every panel and can never yield.
 */
export interface HudInwardPlace {
  kind: "inward";
  corner: HudCorner;
  /**
   * Candidate top edges, tried in order — a LADDER, not a coordinate. The first
   * rung is usually the row of the slot whose button opens the surface (so a
   * drawer reads as belonging to its button); each next rung drops further down
   * the screen, past the centred clusters that split the free interval on a
   * short landscape phone.
   *
   * The resolver takes the FIRST rung that yields the full declared `width`,
   * and otherwise the WIDEST rung that clears `minWidth` — so the preferred
   * placement wins whenever it really works, and a fallback is only used when
   * it buys something.
   */
  tops: readonly HudTopAnchor[];
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
}

export type HudTopAnchor =
  | { slot: HudSlotId }
  | { px: number }
  /** just below the RESERVED top band (the phase clock + 觀戰中 pill) */
  | { belowTopBand: true }
  /** below the whole centred stack that is up in THIS scene */
  | { belowCentreStack: true };

export type HudSurfacePlace = HudTopBandPlace | HudTopCentrePlace | HudInwardPlace;

export interface HudSurfaceSpec {
  id: string;
  /** the file that paints it — kept honest by hudSurfaces.test.ts */
  owner: string;
  /** the phases it can be on screen in */
  phases: readonly HudPhase[];
  /** the layer it paints at; decides which covering panels bury it */
  z: number;
  /** panels this surface deliberately paints INSIDE rather than avoiding */
  over?: readonly HudPanelId[];
  place: HudSurfacePlace;
  /**
   * false = RESERVED: the component still pins itself and the row exists so
   * everything else can avoid it — the same contract `hudLayout` uses for the
   * `leave` / `gold-level` slots before they were re-homed.
   */
  managed: boolean;
  note?: string;
}

const ALL_PHASES = ["champSelect", "intermission", "combat", "resolution", "matchEnd"] as const;
const IN_MATCH = ["champSelect", "intermission", "combat", "resolution"] as const;

/**
 * The 戰績變化 card's width. Stated once, here, beside its reason:
 * `MIN_CHART_COL_PX` (280) plus the card's own 12 px padding on both sides plus
 * a scrollbar's worth of slack, so the responsive grid still yields ONE column
 * wide enough for legible axis labels (`progressChartRender`'s legibility test
 * recomputes exactly that).
 */
export const PROGRESS_CHART_W = 330;

/**
 * THE SURFACE REGISTRY. Order is PRIORITY: a surface is clipped by every
 * surface above it, never the other way round. So the round 評價 card owns its
 * column outright and the centred banner is the one that yields — which is the
 * owner's report ①, stated as a rule instead of as a nudge.
 */
const SURFACES = [
  // ── RESERVED top-centre chrome (pins itself; declared so others avoid it) ──
  {
    id: "phase-timer",
    owner: "ui/components/PhaseTimer.tsx",
    phases: ALL_PHASES,
    z: HUD_Z.slot,
    // `top: 10`, `left: 50%` + translateX(-50%); two rows (12 px label + 18 px
    // clock) inside 6 px padding ⇒ ~52 tall. 240 is the label row at its widest
    // (「Champion Select · Round 10」) plus the 16 px side padding, rounded up.
    place: { kind: "top-band", top: 10, height: 52, width: 240 },
    managed: false,
    note: "RESERVED: the phase clock. Pinned by components/PhaseTimer.tsx; declared so the centred stack and the inward drawers can avoid it.",
  },
  {
    id: "spectator-hint",
    owner: "ui/HudRoot.tsx",
    phases: ["combat", "resolution"],
    z: HUD_Z.slot,
    // `top: 64`, centred nowrap pill: 「☠ 觀戰中 — 下一輪復活」 plus the 陣亡投幣
    // button at its widest (「丟 100金 (G) 10/10」).
    place: { kind: "top-band", top: 64, height: 30, width: 340 },
    managed: false,
    note: "RESERVED: the death-spectator pill (+ 丟 100金). Pinned by HudRoot; declared so nothing lands on it.",
  },

  // ── the resolution 評價 card: it wins the right column outright ────────────
  {
    id: "round-victory",
    owner: "ui/panels/RoundVictoryPanel.tsx",
    phases: ["resolution"],
    z: HUD_Z.screen,
    /**
     * WHY IT MOVED INSIDE THE COLUMN (owner ①). It used to pin
     * `top: topRightClear({gap:8}); right: 16`, i.e. it started just under the
     * audio cluster and ran to the screen edge — so it painted over the ⚙
     * settings slot and the cheats slot beneath it, and the centred spectate
     * banner had no way to know it existed. Docking INSIDE the top-right column
     * fixes both at once: it clears every slot of that corner by construction,
     * and it becomes a rectangle the banner's free-interval sweep can see.
     */
    place: {
      kind: "inward",
      corner: "top-right",
      // 340 tall, NOT the old `maxHeight: 72vh`. Measured against the layout it
      // has to live in: at 720p a 520-tall card reaches y 530 and therefore has
      // to clear the bottom-right equipment bar (372→422), which costs ~100px
      // of WIDTH — and this card is text, so width is what it needs. Its own
      // `overflowY: auto` handles a long advice list.
      //
      // IT PREFERS TO START BELOW THE CENTRED STACK, and that is not cosmetic:
      // the card is 340 wide and outranks the banners, so a card that starts at
      // y 10 eats the banner rows' free interval all the way down. Starting at
      // the stack's floor gives 「Round over」 and the spectate banner their full
      // width back on a 1024-wide desktop, and costs the card nothing — the
      // top-right column runs to y 200 there anyway. The upper rungs are the
      // fallback for short viewports where 340 no longer fits below the stack.
      tops: [{ belowCentreStack: true }, { px: HUD_EDGE }, { belowTopBand: true }],
      width: 340,
      height: 340,
      minWidth: 220,
      minHeight: 150,
    },
    managed: true,
    note: "回合評價 + 建議 + 團隊累積積分 (#212).",
  },

  // ── the settlement's 戰績變化 charts (owner ③: 「太低」 → dock them right) ──
  {
    id: "progress-chart",
    // the file that PLACES it. `panels/ProgressChartPanel.tsx` paints the
    // charts and takes the resolved style as a prop, which is what keeps that
    // whole panel renderable under `react-dom/server` in the node test env.
    owner: "ui/panels/MatchEndPanel.tsx",
    phases: ["matchEnd"],
    z: HUD_Z.screen,
    // it lives INSIDE the settlement screen, so the full-screen match-end panel
    // is not an obstacle for it — that exemption is declared, not assumed.
    over: ["match-end"],
    /**
     * It used to be the LAST child of a `maxHeight: 92vh; overflowY: auto`
     * card, under the 返回大廳 row — so opening it scrolled the grade, the
     * breakdown and the ranking off the top and put the charts below the fold.
     * As its own right-docked card it opens BESIDE the settlement, and
     * `matchEndCardWidth()` hands the card back exactly the width this takes.
     */
    place: {
      kind: "inward",
      corner: "top-right",
      tops: [{ px: HUD_EDGE }],
      width: PROGRESS_CHART_W,
      height: 560,
      minWidth: 300,
      minHeight: 240,
    },
    managed: true,
    note: "每回合戰績變化 line charts, docked right on the settlement screen.",
  },

  // ── the centred stack, below the reserved top band ─────────────────────────
  {
    id: "round-over",
    // split out of HudRoot into its own file precisely so the guard can RENDER
    // it and read the coordinates back (hudSurfacePaint.test.ts) instead of
    // grepping HudRoot for a substring.
    owner: "ui/hud/RoundOverPill.tsx",
    phases: ["resolution"],
    z: HUD_Z.expanded,
    // was `top: 120` — squarely inside the spectate banner's own 106..150 band,
    // in the one phase where both are up.
    place: { kind: "top-centre", order: 0, height: 44, maxWidth: 220, minWidth: 120 },
    managed: true,
    note: "the 「Round over」 pill.",
  },
  {
    id: "spectate-notice",
    owner: "ui/hud/SpectateNotice.tsx",
    phases: ["combat", "resolution"],
    z: HUD_Z.expanded,
    // minWidth 200 is what the COMPACT tier really needs (SpectateNotice's
    // `spectateNoticeTier`): dot 9 + gap 10 + 「已分出勝負」 70 + gap 10 +
    // 前往觀戰 button 80 + 2×10 padding = 199. Below that it is not painted —
    // a banner with its own button clipped off is worse than none.
    place: { kind: "top-centre", order: 1, height: 44, maxWidth: 420, minWidth: 200 },
    managed: true,
    note: "「你的競技場已分出勝負」 + 前往觀戰/返回. Stacks UNDER 「Round over」 during resolution instead of on top of it, and yields the width the 評價 card takes.",
  },

  // ── the scoreboard drawer (owner ②) ───────────────────────────────────────
  // LAST on purpose: it is the only surface here the player opens on demand, so
  // when a 667×375 screen cannot hold both it is the drawer that yields, never
  // the banner that tells you your duel is over.
  {
    id: "scoreboard-list",
    owner: "ui/components/Scoreboard.tsx",
    phases: IN_MATCH,
    z: HUD_Z.expanded,
    /**
     * THE REPORTED BUG. The list used to be flow content inside the 26 px
     * `scoreboard` slot, so it grew straight down through `audio-toggle`
     * (78→122 on a desktop) — and that slot is `portal: true`, i.e. DECLARED to
     * ride above every panel and never yield. Nothing on the z axis could have
     * fixed it; the drawer had to leave the column.
     *
     * `tops` is a two-step ladder rather than one number: aligned with its own
     * button on a desktop, and one row below the top gutter on a 812×375
     * landscape phone, where the centred phase cluster splits the only free
     * interval and the aligned placement resolves to nothing.
     */
    place: {
      kind: "inward",
      corner: "top-right",
      tops: [{ slot: "scoreboard" }, { belowTopBand: true }, { belowCentreStack: true }],
      width: 260,
      height: 300,
      minWidth: 180,
      minHeight: 120,
    },
    managed: true,
    note: "the expanded K/D list. Opens INWARD (left of the top-right column) — it can never fit under a corner the portal-ed audio cluster owns.",
  },
] as const;

export type HudSurfaceId = (typeof SURFACES)[number]["id"];

export const HUD_SURFACES: readonly HudSurfaceSpec[] = SURFACES;

const BY_ID = new Map<string, HudSurfaceSpec>(HUD_SURFACES.map((s) => [s.id, s]));

/** Look up a surface spec (throws on an unknown id — typos fail loudly). */
export function hudSurface(id: HudSurfaceId): HudSurfaceSpec {
  const spec = BY_ID.get(id);
  if (!spec) throw new Error(`hudSurfaces: unknown HUD surface "${id}"`);
  return spec;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * OBSTACLES — what is really painted at the same time
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Is this slot really painted in `scene`, from the point of view of a surface
 * at layer `z`?
 *
 *   · a `transient` slot is a settings-gated dev overlay — hudLayout's own rule
 *     is that those never shrink the real UI;
 *   · a slot whose `displaced` policy is `hide` under an open panel is gone;
 *   · a `portal` slot is ALWAYS painted and always on top (that is the entire
 *     meaning of the flag), so it is an obstacle no matter what covers it —
 *     this is the line that fixes owner report ②;
 *   · an `overlay` slot has DECLARED that it accepts being painted over by a
 *     docking panel (hudLayout: 「`overlay` ALSO means 'accepts being painted
 *     over'」). A surface at the panel layer is exactly that, so the minimap and
 *     the gold readout stop being obstacles for one — and stay obstacles for
 *     the drawer at `HUD_Z.expanded`, which is chrome, not a panel;
 *   · otherwise a slot BURIED under a covering panel painting at or above the
 *     surface's own layer cannot collide with it: the panel is over both.
 */
function slotIsPainted(spec: HudSlotSpec, scene: HudScene, z: number, touch: boolean): boolean {
  if (spec.transient) return false;
  if (spec.portal) return true;
  if (spec.overlay && z >= HUD_Z.screen) return false;
  const id = spec.id as HudSlotId;
  if (resolveSlotUnderPanels(id, touch, scene.panels).hidden) return false;
  const corner = hudSlotCorner(id, touch);
  return !scene.panels.some((p) => p.covers.includes(corner) && p.z >= z);
}

/**
 * Every slot rect a surface at layer `z` has to keep clear of — using the
 * RELOCATED rect for a slot that re-homes under an open panel (the ☰ moving
 * into the top-right column while the shop is docked left is exactly the kind
 * of thing a drawer must not land on).
 */
export function paintedSlotRects(
  vp: HudViewport,
  touch: boolean,
  scene: HudScene,
  z: number,
): { id: string; rect: HudRect }[] {
  const out: { id: string; rect: HudRect }[] = [];
  for (const s of HUD_SLOTS) {
    if (!slotIsPainted(s, scene, z, touch)) continue;
    const id = s.id as HudSlotId;
    const { relocated } = resolveSlotUnderPanels(id, touch, scene.panels);
    out.push({
      id: s.id,
      rect: relocated ? hudDisplacedRect(id, vp, touch) : hudSlotRect(id, vp, touch),
    });
  }
  return out;
}

/**
 * Rects owned by OTHER #107 modules that a surface must also clear. One
 * occupant today — the intermission 上一回合戰報 card, whose placement
 * `panels/roundReportLayout` already resolves against the slot registry. It is
 * read here rather than re-declared so the two cannot drift; this is the
 * extension point for the next module that owns a positioned box.
 */
function foreignObstacles(vp: HudViewport, touch: boolean, scene: HudScene): HudRect[] {
  if (scene.phase !== "intermission") return [];
  const report = roundReportPlacement(vp, touch);
  return report.visible ? [report.rect] : [];
}

/**
 * Can `other` collide with `viewer`? Same burial rule as the slots: a surface
 * that paints INSIDE a terminal panel (`over`) cannot collide with chrome the
 * panel has already covered. Without this the phase clock — z 25, buried under
 * the settlement's z-40 wash — kept carving a 240px hole out of the middle of
 * the match-end screen.
 */
function surfaceIsPainted(other: HudSurfaceSpec, viewer: HudSurfaceSpec, scene: HudScene): boolean {
  if (!other.phases.includes(scene.phase)) return false;
  const over = new Set<string>(viewer.over ?? []);
  return !scene.panels.some((p) => over.has(p.id) && p.z > other.z);
}

/** The panel rects a surface must not paint under (its `over` list is exempt). */
function panelObstacles(vp: HudViewport, spec: HudSurfaceSpec, scene: HudScene): HudRect[] {
  const over = new Set<string>(spec.over ?? []);
  return scene.panels
    .filter((p) => !over.has(p.id) && p.z >= spec.z)
    .map((p) => hudPanelRect(p.id as HudPanelId, vp));
}

/** Widest slot painted in a corner — how far in an `inward` surface must stop. */
export function hudCornerColumnWidth(
  corner: HudCorner,
  touch: boolean,
  scene: HudScene,
  z: number,
): number {
  let w = 0;
  for (const s of HUD_SLOTS) {
    if (!slotIsPainted(s, scene, z, touch)) continue;
    if (hudSlotCorner(s.id as HudSlotId, touch) !== corner) continue;
    w = Math.max(w, hudSlotWidth(s.id as HudSlotId, touch));
  }
  return w;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * FREE-INTERVAL SWEEP
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface HudInterval {
  start: number;
  end: number;
}

/**
 * The horizontal intervals of `[HUD_EDGE, width − HUD_EDGE]` that no obstacle
 * reaches into, over the y-band `[top, bottom)`. Every obstacle is grown by one
 * {@link HUD_GAP} on both sides, so "free" means "free WITH breathing room" —
 * two rects that merely touch pass `hudRectsOverlap` and still read as a bug.
 */
export function freeIntervals(
  band: { top: number; bottom: number },
  obstacles: readonly HudRect[],
  vp: HudViewport,
): HudInterval[] {
  const blocked: HudInterval[] = [];
  for (const r of obstacles) {
    if (!(r.y < band.bottom && band.top < r.y + r.h)) continue;
    blocked.push({ start: r.x - HUD_GAP, end: r.x + r.w + HUD_GAP });
  }
  blocked.sort((a, b) => a.start - b.start);
  const out: HudInterval[] = [];
  const limit = vp.width - HUD_EDGE;
  let cursor = HUD_EDGE;
  for (const b of blocked) {
    if (b.start > cursor) out.push({ start: cursor, end: Math.min(b.start, limit) });
    if (b.end > cursor) cursor = b.end;
    if (cursor >= limit) break;
  }
  if (cursor < limit) out.push({ start: cursor, end: limit });
  return out.filter((i) => i.end > i.start);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE RESOLVER
 * ═══════════════════════════════════════════════════════════════════════════ */

/** The vertical room a surface may use: down to the build-stamp gutter. */
function floorFor(vp: HudViewport): number {
  return vp.height - HUD_STAMP_BAND - HUD_GAP;
}

function resolveTopBand(place: HudTopBandPlace, vp: HudViewport): HudRect | null {
  const w = Math.min(place.width, Math.max(0, vp.width - 2 * HUD_EDGE));
  if (w <= 0 || place.top + place.height > vp.height) return null;
  return { x: (vp.width - w) / 2, y: place.top, w, h: place.height };
}

function resolveTopCentre(
  spec: HudSurfaceSpec,
  place: HudTopCentrePlace,
  vp: HudViewport,
  scene: HudScene,
  obstacles: readonly HudRect[],
): HudRect | null {
  // PHASE-FILTERED STACK: only the centred surfaces really up in this scene
  // push this one down. That is why the banner sits at the band end in combat
  // and one row lower during `resolution`, under 「Round over」.
  let top = TOP_CENTRE_BAND_END + HUD_GAP;
  for (const other of HUD_SURFACES) {
    if (other.id === spec.id || other.place.kind !== "top-centre") continue;
    if (!other.phases.includes(scene.phase)) continue;
    if (other.place.order >= place.order) continue;
    top += other.place.height + HUD_GAP;
  }
  const band = { top, bottom: top + place.height };
  if (band.bottom > floorFor(vp)) return null;
  const mid = vp.width / 2;
  const gaps = freeIntervals(band, obstacles, vp);
  // the interval the centre line falls in, else the widest one — sliding a
  // banner sideways beats not showing it, and the ControlLegend strip already
  // does exactly this.
  const pick =
    gaps.find((g) => g.start <= mid && mid <= g.end) ??
    gaps.reduce<HudInterval | null>(
      (a, b) => (a && a.end - a.start >= b.end - b.start ? a : b),
      null,
    );
  if (!pick) return null;
  const w = Math.min(place.maxWidth, pick.end - pick.start);
  if (w < place.minWidth) return null;
  const x = Math.max(pick.start, Math.min(mid - w / 2, pick.end - w));
  return { x, y: top, w, h: place.height };
}

/** Where the phase-filtered centred stack ends, in px from the top edge. */
function centreStackEnd(scene: HudScene): number {
  let end = TOP_CENTRE_BAND_END;
  for (const s of HUD_SURFACES) {
    if (s.place.kind !== "top-centre" || !s.phases.includes(scene.phase)) continue;
    end += HUD_GAP + s.place.height;
  }
  return end;
}

function topAnchorPx(anchor: HudTopAnchor, touch: boolean, scene: HudScene): number {
  if ("slot" in anchor) return hudSlotOffset(anchor.slot, touch);
  if ("px" in anchor) return anchor.px;
  if ("belowCentreStack" in anchor) return centreStackEnd(scene) + HUD_GAP;
  return TOP_CENTRE_BAND_END + HUD_GAP;
}

function resolveInward(
  place: HudInwardPlace,
  vp: HudViewport,
  touch: boolean,
  scene: HudScene,
  z: number,
  obstacles: readonly HudRect[],
): HudRect | null {
  if (!place.corner.startsWith("top")) {
    throw new Error(`hudSurfaces: inward placement supports top corners only (${place.corner})`);
  }
  const rightSide = place.corner.endsWith("right");
  const colW = hudCornerColumnWidth(place.corner, touch, scene, z);
  // THE LINE THAT MAKES "never under the audio cluster" A FACT: the far edge
  // stops one gap short of the widest slot the corner paints.
  const far = rightSide ? vp.width - HUD_EDGE - colW - HUD_GAP : HUD_EDGE + colW + HUD_GAP;

  let best: HudRect | null = null;
  for (const anchor of place.tops) {
    const top = topAnchorPx(anchor, touch, scene);
    const h = Math.min(place.height, floorFor(vp) - top);
    if (h < place.minHeight) continue;
    // Every free interval this rung offers, walked FROM THE CORNER INWARD, so
    // the first one that fits is the one nearest the corner. (Walking the other
    // way is how the 戰績變化 card first landed on the LEFT of a 1280 screen:
    // two intervals both fitted 330px and the far one was found first.)
    const intervals = freeIntervals({ top, bottom: top + h }, obstacles, vp);
    if (rightSide) intervals.reverse();
    let rung: HudRect | null = null;
    for (const g of intervals) {
      if (rightSide ? g.start >= far : g.end <= far) continue;
      const edge = rightSide ? Math.min(g.end, far) : Math.max(g.start, far);
      const w = Math.min(place.width, rightSide ? edge - g.start : g.end - edge);
      if (w < place.minWidth) continue;
      if (!rung || w > rung.w) rung = { x: rightSide ? edge - w : edge, y: top, w, h };
      if (rung.w >= place.width) break; // nearest interval that fits fully
    }
    if (!rung) continue;
    // the FIRST rung that fits at full width wins outright — a preferred
    // placement is only abandoned when it really costs the surface something.
    if (rung.w >= place.width) return rung;
    if (!best || rung.w > best.w) best = rung;
  }
  return best;
}

/**
 * WHERE A SURFACE MAY PAINT in a concrete viewport + scene, or `null` when
 * there is no honest room. PURE, so the guard and the running HUD ask the same
 * question.
 *
 * ⚠️ CORRECTED 2026-07-30. This used to claim that sharing the resolver means
 * the two 「cannot disagree (failure shape ⑤)」. That is FALSE and was measured:
 * every caller is free to alter the answer on its way to the DOM, and one line
 * in `SpectateNotice`'s hook wrapper —
 *   `const rect = resolved ? { ...resolved, y: SPECTATE_NOTICE_TOP } : null;`
 * — put the banner back on top of the 「Round over」 pill with all 1906 client
 * tests green. A shared resolver is NECESSARY, not sufficient; what actually
 * closes ⑤ is `hudSurfacePaint.test.ts`'s shipped-mount table, which renders the
 * components HudRoot mounts and reads the painted coordinates back.
 */
export function hudSurfaceRect(
  id: HudSurfaceId,
  vp: HudViewport,
  touch: boolean,
  scene: HudScene,
): HudRect | null {
  const spec = hudSurface(id);
  if (!spec.phases.includes(scene.phase)) return null;
  if (spec.place.kind === "top-band") return resolveTopBand(spec.place, vp);

  const obstacles: HudRect[] = [
    ...paintedSlotRects(vp, touch, scene, spec.z).map((s) => s.rect),
    ...panelObstacles(vp, spec, scene),
    ...foreignObstacles(vp, touch, scene),
  ];
  // every HIGHER-PRIORITY surface that is up in this scene (registry order)
  for (const other of HUD_SURFACES) {
    if (other.id === spec.id) break;
    if (!surfaceIsPainted(other, spec, scene)) continue;
    const r = hudSurfaceRect(other.id as HudSurfaceId, vp, touch, scene);
    if (r) obstacles.push(r);
  }

  return spec.place.kind === "top-centre"
    ? resolveTopCentre(spec, spec.place, vp, scene, obstacles)
    : resolveInward(spec.place, vp, touch, scene, spec.z, obstacles);
}

/** Every surface that resolves to a real rect in this scene. */
export function hudResolvedSurfaces(
  vp: HudViewport,
  touch: boolean,
  scene: HudScene,
): { id: string; rect: HudRect }[] {
  const out: { id: string; rect: HudRect }[] = [];
  for (const s of HUD_SURFACES) {
    if (!s.phases.includes(scene.phase)) continue;
    const rect = hudSurfaceRect(s.id as HudSurfaceId, vp, touch, scene);
    if (rect) out.push({ id: s.id, rect });
  }
  return out;
}

/**
 * THE STRUCTURAL CHECK, shared by the guard and its non-vacuity proof.
 *
 * Feed it {@link hudResolvedSurfaces} for the shipped world, or a set of
 * hand-built PRE-FIX rects to prove the guard is not vacuous. Unmanaged
 * (RESERVED) surfaces are obstacles for everyone else but are not themselves
 * checked against slots — the same rule `hudLayout`'s shop guard applies to
 * unmanaged slots, and for the same reason: their pixels belong to another
 * file.
 */
export function hudSurfaceCollisions(
  vp: HudViewport,
  touch: boolean,
  scene: HudScene,
  rects: readonly { id: string; rect: HudRect }[],
): string[] {
  const out: string[] = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!;
      const b = rects[j]!;
      const sa = BY_ID.get(a.id);
      const sb = BY_ID.get(b.id);
      // a surface buried under a panel the other one paints inside cannot
      // collide with it — the panel is between them (see surfaceIsPainted)
      if (sa && sb && (!surfaceIsPainted(sa, sb, scene) || !surfaceIsPainted(sb, sa, scene))) {
        continue;
      }
      if (hudRectsOverlap(a.rect, b.rect)) out.push(`${a.id} ∩ ${b.id}`);
    }
  }
  for (const s of rects) {
    const spec = BY_ID.get(s.id);
    if (spec && !spec.managed) continue;
    const z = spec?.z ?? HUD_Z.expanded;
    for (const slot of paintedSlotRects(vp, touch, scene, z)) {
      if (hudRectsOverlap(s.rect, slot.rect)) out.push(`${s.id} ∩ slot:${slot.id}`);
    }
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * CSS — what the components actually spread
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface HudSurfaceStyle {
  position: "absolute";
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  zIndex: number;
}

/** The absolute-position style for a resolved surface. */
export function hudSurfaceStyle(id: HudSurfaceId, rect: HudRect): HudSurfaceStyle {
  return {
    position: "absolute",
    left: rect.x,
    top: rect.y,
    width: rect.w,
    maxHeight: rect.h,
    zIndex: hudSurface(id).z,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE SETTLEMENT CARD, which has to give back what the chart takes
 * ═══════════════════════════════════════════════════════════════════════════ */

/** The settlement layer's own gutter (MatchEndPanel's `padding: 16`). */
export const MATCH_END_PAD = 16;

/**
 * Below this the two-column settlement is not worth having: a ranking row is
 * seven columns wide (#·portrait·name·評級·分數·KDA·傷害), and squeezing it is a
 * worse outcome than letting the chart card float above it.
 *
 * ⚠️ CORRECTED 2026-07-30. This constant used to be documented as 「under this
 * width the chart falls back to its old in-card position」. THAT WAS FALSE, and
 * measurably so — {@link matchEndCardWidth} returning `null` selects OVERLAY,
 * not the in-card fallback. The in-card fallback is chosen by a DIFFERENT
 * predicate: {@link progressChartSurfaceStyle} returning `null`. The three
 * modes and their measured boundaries (audio column = 100 px wide, so they
 * shift if that cluster is ever resized):
 *
 *   viewport width   mode          what the player sees
 *   ──────────────   ───────────   ─────────────────────────────────────────
 *   < 428            IN-CARD       no docked strip exists at all; the panel
 *                                  falls back into the settlement card's own
 *                                  flow (`marginTop: 12`). Only reachable in
 *                                  PORTRAIT or a hand-narrowed desktop window
 *                                  — 375×812, 390×844 and 414×896 all land
 *                                  here.
 *   428 … 947        OVERLAY       the chart docks at the TOP of the right
 *                                  strip and paints OVER the settlement card,
 *                                  which keeps its full `min(760,96vw)`.
 *                                  Every landscape phone is in this band:
 *                                  at 812×375 the chart is x 364…694 and the
 *                                  card x 26…786, i.e. 330 px of a 760 px card
 *                                  covered. It is opaque, it is dismissable
 *                                  (收起) and the player pressed the button —
 *                                  but it IS a cover, and it is asserted as
 *                                  one in hudSurfacePaint.test.ts rather than
 *                                  described as something else here.
 *   ≥ 948            SIDE-BY-SIDE  the settlement card shrinks to the width
 *                                  this function returns and the chart docks
 *                                  beside it. Nothing overlaps.
 */
export const MATCH_END_CARD_MIN_W = 460;

/** The settlement card's own cap, unchanged: `min(760px, 96vw)`. */
export function matchEndCardCap(vp: HudViewport): number {
  return Math.min(760, vp.width * 0.96);
}

/**
 * The settlement screen's canonical scene. EXPORTED because `MatchEndPanel`,
 * `matchEndCardWidth` and the guard must all resolve the chart against the
 * SAME scene — reading it from the live `useHudSurface` hook while the card
 * width came from this one is exactly how a reserved strip ends up somewhere
 * the card never went.
 */
export function matchEndScene(): HudScene {
  return { phase: "matchEnd", panels: panelsForPhase("matchEnd") };
}

/**
 * The absolute-position style for the 戰績變化 card on the settlement screen,
 * or `null` when this viewport has no docked strip at all (see the table on
 * {@link MATCH_END_CARD_MIN_W}) — in which case `ProgressChartPanel` falls back
 * into the settlement card's flow.
 *
 * ⚠️ CORRECTED 2026-07-30. This used to say 「the shipped MatchEndPanel calls
 * exactly this, so the guard driving it is driving the shipped decision
 * (failure shape ⑤)」. It is not: a guard driving THIS function is driving the
 * DECISION, and the shipped panel still has to hand the result to the chart.
 * Measured — changing `surface={chartStyle}` to `surface={null}` on that mount
 * dropped the 戰績變化 card back into the settlement card's `marginTop: 12` flow
 * (owner report ③, restored) with the whole suite green. What closes ⑤ is
 * `hudSurfacePaint.test.ts` rendering `<MatchEndPanel />` itself.
 */
export function progressChartSurfaceStyle(
  vp: HudViewport,
  touch: boolean,
): HudSurfaceStyle | null {
  const rect = hudSurfaceRect("progress-chart", vp, touch, matchEndScene());
  return rect ? hudSurfaceStyle("progress-chart", rect) : null;
}

/**
 * TWO MODES, and the number says which one you are in.
 *
 *   a number  SIDE-BY-SIDE — the settlement card shrinks to this width and the
 *             戰績變化 card docks in the free strip beside it. Both readable.
 *   null      OVERLAY — the viewport cannot hold both, so the settlement keeps
 *             its full width and the chart card paints OVER it (it is a
 *             deliberate, dismissable answer to a button press, and the player
 *             just asked for it). Either way the chart is at the TOP of the
 *             screen rather than below the fold, which is the reported bug.
 */
export function matchEndCardWidth(
  vp: HudViewport,
  touch: boolean,
  chartOpen: boolean,
): number | null {
  const cap = matchEndCardCap(vp);
  if (!chartOpen) return cap;
  const chart = hudSurfaceRect("progress-chart", vp, touch, matchEndScene());
  if (!chart) return cap;
  const w = Math.min(cap, chart.x - HUD_GAP - 2 * MATCH_END_PAD);
  return w >= MATCH_END_CARD_MIN_W ? w : null;
}

/** The `padding-right` the settlement layer needs so the card clears the chart. */
export function matchEndReserveRight(
  vp: HudViewport,
  touch: boolean,
  chartOpen: boolean,
): number {
  if (!chartOpen) return MATCH_END_PAD;
  if (matchEndCardWidth(vp, touch, chartOpen) === null) return MATCH_END_PAD;
  const chart = hudSurfaceRect("progress-chart", vp, touch, matchEndScene());
  if (!chart) return MATCH_END_PAD;
  return Math.max(MATCH_END_PAD, vp.width - chart.x + HUD_GAP);
}

/** Narrow a store `phase` string onto the registry's phase union. */
export function asHudPhase(phase: string): HudPhase | null {
  return (HUD_PHASES as readonly string[]).includes(phase) ? (phase as HudPhase) : null;
}
