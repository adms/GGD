/**
 * hudLayout — the ONE source of truth for in-match HUD corner real estate.
 *
 * WHY THIS EXISTS (task #42): the ☰ pause button, the FPS pill and the
 * team-lives bar each hard-coded `position:absolute; left:10; top:10` in three
 * unrelated files, so they rendered on top of each other, and the expanded perf
 * panel pinned itself at a magic `top:40` that landed under the team bar. HUD
 * chrome is mounted from SEVERAL different React parents (HudRoot, AppRoot's
 * MatchOverlay, a <body> portal for the audio toggle), so a plain flex
 * container can never own the stacking — the corner geometry has to be a shared
 * DECLARATION instead.
 *
 * THE MODEL
 *   - Four corners. Each corner is a stack that grows INWARD from its edge:
 *     top-* stack downward, bottom-* stack upward.
 *   - Every piece of HUD chrome that claims corner space declares a slot here
 *     (corner + order + the height it reserves). It NEVER writes its own
 *     top/left/right/bottom.
 *   - Offsets are computed from the declared heights, not measured from the
 *     DOM: a hidden slot (e.g. the team bar before teams exist) simply leaves
 *     its gap empty. Deterministic, testable in node, and immune to the mount
 *     order of the components.
 *   - `order` is unique per corner and enforced by hudLayout.test.ts, so the
 *     "two components silently claim the same corner" bug cannot come back.
 *
 * SAFE AREA (do not regress): the notch / home-indicator inset is owned ONCE by
 * `#hud-root` in ui/mobile.css (`@media (pointer: coarse)`), which insets the
 * whole HUD layer. Slots therefore use PLAIN px offsets — adding env() here
 * would double-count the inset. The one exception is chrome that escapes
 * #hud-root (the <body>-portaled audio toggle, position:fixed): it composes its
 * own `calc(env(safe-area-inset-*) + offset)` from the raw number this module
 * returns.
 *
 * TOUCH: slots that hold a tappable control declare `touchHeight` >= 44px
 * (Apple HIG). Components size their control from `hudSlotHeight()`, so the
 * touch target and the reserved space can never drift apart.
 *
 * A slot may also live in a DIFFERENT CORNER on coarse pointers
 * (`touchCorner` + `touchOrder`). Phone landscape is ~375-430px tall: a corner
 * that is comfortable on a 720p desktop can be physically impossible there, and
 * the honest fix is to re-home the panel, not to shave pixels off it. The
 * minimap does exactly this (desktop bottom-right, like LoL; touch top-left,
 * like Wild Rift / Mobile Legends, because bottom-right is the ability arc).
 *
 * WIDTH: every slot also RESERVES a width. Same contract as the height — a
 * declared upper bound on what the component paints, not a DOM measurement — so
 * `hudSlotRect()` can hand the layout tests a real rectangle per viewport and
 * the minimap guard can prove the map lands on empty screen.
 */
import type { CSSProperties } from "react";

export type HudCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export const HUD_CORNERS: readonly HudCorner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

/** px from the viewport edge to the first slot of a corner (both axes). */
export const HUD_EDGE = 10;

/** px of breathing room between two stacked slots in the same corner. */
export const HUD_GAP = 8;

/** Minimum interactive target on coarse pointers (Apple HIG). */
export const HUD_TOUCH_TARGET = 44;

/**
 * HUD stacking order (inside #hud-root, which is z-index 10):
 *   slot     — corner chrome; above the touch-control layer (z 20)
 *   expanded — a panel opened FROM a slot (scoreboard list, cheat console), so
 *              it paints over the slots stacked below it
 *   screen   — full-screen settings sheet (ui/SettingsScreen)
 *   modal    — blocking full-screen overlays (pause menu, codex, asset console)
 *
 * THE AUDIO TOGGLE portals to <body> at z-index 2147483000 (AudioToggle.tsx
 * Z_TOP) so it rides over the in-match HUD. But a BLOCKING MODAL must out-rank
 * it, or the toggle's invisible top-right box sits over the modal's ✕ 關閉 and
 * the modal cannot be closed — the "關閉不掉" bug the user hit on the credits
 * page. So `modal` is deliberately ABOVE Z_TOP. A covered audio toggle while a
 * full-screen modal is open is the correct trade; an un-closable modal is not.
 */
export const HUD_Z = {
  slot: 25,
  expanded: 30,
  screen: 40,
  modal: 2147483600,
} as const;

export interface HudSlotSpec {
  /** stable id used by the component that renders the slot */
  id: string;
  corner: HudCorner;
  /** 0 hugs the corner; each higher order stacks one step further inward */
  order: number;
  /** px of stack space this slot reserves on fine pointers */
  height: number;
  /** px reserved on coarse pointers (defaults to `height`) */
  touchHeight?: number;
  /** px of horizontal space this slot reserves (upper bound, see module doc) */
  width: number;
  /** px of width reserved on coarse pointers (defaults to `width`) */
  touchWidth?: number;
  /** corner this slot moves to on coarse pointers (defaults to `corner`) */
  touchCorner?: HudCorner;
  /** stack order in `touchCorner` (defaults to `order`) */
  touchOrder?: number;
  /** the file that renders it — kept honest by hudLayout.test.ts */
  owner: string;
  /** false = still positions itself; the slot is RESERVED so nothing else takes it */
  managed: boolean;
  /**
   * true = only present behind a dev/settings toggle. Panels sizing themselves
   * against a corner reserve space for the PERSISTENT chrome only, so a
   * dev-only overlay never shrinks the real UI (`skipTransient`).
   */
  transient?: boolean;
  /**
   * true = a CONTENT panel parked in a corner, not chrome. A full-size panel
   * docking against the corner (the shop) may take its space and paint over
   * it — see `hudStackEnd({ skipOverlay })`. Without this, the touch minimap
   * (a 116px block in the top-left stack) would push the shop panel down to a
   * ~60px sliver on a 375px-tall phone.
   *
   * `overlay` ALSO means "accepts being painted over by an open panel": it is
   * exempt from the panel-cover guard (§ HUD_PANELS) the same way it opts into
   * being covered here. The minimap is the only one.
   */
  overlay?: boolean;
  /**
   * true = this slot escapes #hud-root entirely (a <body> portal at Z_TOP), so
   * it deliberately rides ABOVE every panel and never needs to yield. Exempt
   * from the panel-cover guard for that reason, not by accident. The audio
   * toggle is the only one.
   */
  portal?: boolean;
  /**
   * HOW THIS SLOT YIELDS when an open panel (HUD_PANELS) covers its corner.
   * Mirrors the `touchCorner`/`touchOrder` re-home mechanism that is already
   * guard-proven. Default `"inset"`.
   *   hide     — vanish while covered (dev telemetry, or wide status bars for
   *              which there is no room beside a 45vw dock).
   *   relocate — move to `displacedCorner` (below that corner's whole stack).
   *              For chrome that MUST stay reachable, e.g. the ☰ menu.
   *   inset    — stay put (the default). Only valid for a slot a panel never
   *              actually covers; the guard rejects `inset` on a covered slot.
   */
  displaced?: "hide" | "relocate" | "inset";
  /** target corner for `displaced: "relocate"` (defaults to `corner`) */
  displacedCorner?: HudCorner;
  /** stack order in `displacedCorner` — documentation; the resolver docks past the whole stack */
  displacedOrder?: number;
  note?: string;
}

/**
 * THE REGISTRY. Adding HUD chrome = adding a row here (and the guard test will
 * reject a corner+order that is already taken).
 */
const SLOTS = [
  // ── top-left ── gameplay chrome only; dev telemetry lives bottom-left ──────
  {
    id: "menu",
    corner: "top-left",
    order: 0,
    height: 38,
    touchHeight: HUD_TOUCH_TARGET,
    width: 44,
    owner: "ui/PauseMenu.tsx",
    managed: true,
    // The ☰ is ESSENTIAL: hiding it under a left-docked shop would trap the
    // player. It cannot inset either — beside a 45vw dock on a 375px phone
    // there is no horizontal room. So it RE-HOMES to the top-right column
    // (which the left dock never reaches) and stacks below the whole top-right
    // group; on the shortest 375px viewport that lands at ~296px, well inside.
    displaced: "relocate",
    displacedCorner: "top-right",
    displacedOrder: 5,
    note: "☰ pause button (Esc); relocates top-right under a left-docked panel",
  },
  {
    id: "team-lives",
    corner: "top-left",
    order: 1,
    height: 44,
    width: 240,
    owner: "ui/components/TeamLivesBar.tsx",
    managed: true,
    // A 240px left-reading bar cannot inset beside the dock (it kisses the
    // right column on a 667px phone) and reads wrong dropped into the narrow
    // right control column. It simply hides while the shop covers the corner —
    // in intermission the shared-lives count is static and shopping is the
    // point; in combat the shop is up only for a defeated spectator.
    displaced: "hide",
    note: "team colours + shared lives; single row, height is content-independent",
  },
  {
    id: "minimap",
    corner: "bottom-right",
    order: 1,
    height: 208,
    width: 208,
    // phone landscape: bottom-right IS the ability arc (attack button + Q/W/E/R
    // ring reach ~300px up from the corner), and 244+152 overflowed a 375px
    // viewport outright. Re-homed to the top-left stack under ☰ + team lives —
    // the mobile-MOBA convention (Wild Rift / Mobile Legends) — and shrunk.
    touchCorner: "top-left",
    touchOrder: 2,
    touchHeight: 116,
    touchWidth: 116,
    owner: "ui/hud/Minimap.tsx",
    managed: true,
    overlay: true,
    note: "LoL-spec minimap: baked terrain + champion portraits + camera viewport box",
  },
  {
    id: "revive",
    corner: "top-left",
    order: 2,
    height: 52,
    width: 250,
    // touch: the minimap already owns top-left order 2, so the banner stacks
    // under it rather than fighting it.
    touchOrder: 3,
    touchHeight: 44,
    touchWidth: 190,
    owner: "ui/components/ReviveBanner.tsx",
    managed: true,
    // NOT `transient`: that flag means "opt-in dev/settings overlay that may
    // paint over the corner stacks". This is gameplay chrome that is simply
    // absent most of the time — same shape as the team bar before teams exist —
    // so it reserves real space and must never overlap anything.
    // Combat only, and the defeated player it is for is exactly the one whose
    // left-docked shop covers it — same reasoning as team-lives: hide.
    displaced: "hide",
    note: "revive-circle status (task #84): shown while YOUR team has a live circle — the dead player must SEE it exists and that a teammate is channelling",
  },

  // ── top-right ─────────────────────────────────────────────────────────────
  {
    id: "leave",
    corner: "top-right",
    order: 0,
    height: 26,
    width: 80,
    owner: "ui/platform/AppRoot.tsx",
    managed: false,
    note: "RESERVED: the Leave button hard-codes right:10/top:10 in the match-screen composition (owned by another task). Its pin already matches this slot; re-home it when that file is free.",
  },
  {
    id: "scoreboard",
    corner: "top-right",
    order: 1,
    height: 26,
    touchHeight: HUD_TOUCH_TARGET,
    width: 110,
    owner: "ui/components/Scoreboard.tsx",
    managed: true,
    note: "expands a K/D list downward — uses HUD_Z.expanded while open",
  },
  {
    id: "audio-toggle",
    corner: "top-right",
    order: 2,
    height: HUD_TOUCH_TARGET,
    width: 100,
    owner: "ui/AudioToggle.tsx",
    managed: true,
    // Portaled to <body> at Z_TOP: it rides above every panel by design, so it
    // is exempt from the panel-cover guard rather than a false collision.
    portal: true,
    note: "portaled to <body> (position:fixed) — consumes the raw offset and adds its own safe-area calc; rides above every panel",
  },
  {
    id: "settings",
    corner: "top-right",
    order: 3,
    height: 30,
    touchHeight: HUD_TOUCH_TARGET,
    width: 44,
    owner: "ui/SettingsCorner.tsx",
    managed: true,
    // The left dock never reaches the top-right column; only a `full` terminal
    // panel (match-end) covers it, and that panel provides its own navigation,
    // so the gear simply hides under it instead of floating over the settlement.
    displaced: "hide",
  },
  {
    id: "cheats",
    corner: "top-right",
    order: 4,
    height: 32,
    touchHeight: HUD_TOUCH_TARGET,
    width: 90,
    owner: "ui/CheatConsole.tsx",
    managed: true,
    displaced: "hide",
    note: "offline dev tool; last in the corner so its 320px panel covers nothing else; hides under a full terminal panel",
  },

  // ── bottom-left ── dev telemetry, out of the gameplay corners ─────────────
  {
    id: "gamepad",
    corner: "bottom-left",
    order: 0,
    height: 24,
    width: 130,
    owner: "ui/HudRoot.tsx",
    managed: true,
    // dev telemetry, no gameplay stakes: hide it under a docked panel rather
    // than clutter the free half with a relocated chip.
    displaced: "hide",
    note: "gamepad-connected chip",
  },
  {
    id: "fps",
    corner: "bottom-left",
    order: 1,
    height: 24,
    width: 96,
    owner: "ui/PerfOverlay.tsx",
    managed: true,
    // THE reported offender (task #107): it painted over the left-docked shop
    // card. Dev telemetry with zero gameplay stakes → hide while covered.
    displaced: "hide",
    note: "FPS pill — dev telemetry, moved out of the top-left gameplay corner",
  },
  {
    id: "perf-panel",
    corner: "bottom-left",
    order: 2,
    height: 168,
    width: 214,
    owner: "ui/PerfOverlay.tsx",
    managed: true,
    transient: true,
    // settings-gated dev overlay; likewise hides under a docked panel.
    displaced: "hide",
    note: "expanded perf overlay (settings-gated): LAST in the corner, so it opens past the whole stack instead of a fixed offset. Grows upward; the reserved height is informational.",
  },

  // ── bottom-right ── the minimap corner (its slot is declared up top, beside
  // the other panel it shares a stack with) ─────────────────────────────────
  {
    id: "gold-level",
    corner: "bottom-right",
    order: 0,
    height: 56,
    width: 120,
    owner: "ui/components/GoldLevel.tsx",
    managed: false,
    note: "RESERVED: still hard-codes right:14/bottom:14 (owned by another task). Its pin is 4px off this slot's edge; the minimap stacks above the reserved band, so the two never meet.",
  },
] as const;

export type HudSlotId = (typeof SLOTS)[number]["id"];

export const HUD_SLOTS: readonly HudSlotSpec[] = SLOTS;

const BY_ID = new Map<string, HudSlotSpec>(HUD_SLOTS.map((s) => [s.id, s]));

/** Look up a slot spec (throws on an unknown id — typos fail loudly). */
export function hudSlot(id: HudSlotId): HudSlotSpec {
  const spec = BY_ID.get(id);
  if (!spec) throw new Error(`hudLayout: unknown HUD slot "${id}"`);
  return spec;
}

/**
 * The corner a slot occupies for the current pointer type. A slot may declare
 * `touchCorner` to move on coarse pointers (see the module doc — phone
 * landscape is a different layout problem, not a smaller desktop).
 */
export function hudSlotCorner(id: HudSlotId, touch = false): HudCorner {
  const spec = hudSlot(id);
  return touch ? (spec.touchCorner ?? spec.corner) : spec.corner;
}

/** Stack order of a slot within its effective corner. */
export function hudSlotOrder(id: HudSlotId, touch = false): number {
  const spec = hudSlot(id);
  return touch ? (spec.touchOrder ?? spec.order) : spec.order;
}

/** Slots of one corner for this pointer type, ordered from the corner inward. */
export function hudSlotsInCorner(corner: HudCorner, touch = false): HudSlotSpec[] {
  return HUD_SLOTS.filter((s) => hudSlotCorner(s.id as HudSlotId, touch) === corner).sort(
    (a, b) => hudSlotOrder(a.id as HudSlotId, touch) - hudSlotOrder(b.id as HudSlotId, touch),
  );
}

/** Which CSS edges a corner pins to. */
export function cornerAxes(corner: HudCorner): {
  vertical: "top" | "bottom";
  horizontal: "left" | "right";
} {
  return {
    vertical: corner.startsWith("top") ? "top" : "bottom",
    horizontal: corner.endsWith("left") ? "left" : "right",
  };
}

/** Reserved height of a slot for the current pointer type. */
export function hudSlotHeight(id: HudSlotId, touch = false): number {
  const spec = hudSlot(id);
  return touch ? (spec.touchHeight ?? spec.height) : spec.height;
}

/** Reserved width of a slot for the current pointer type. */
export function hudSlotWidth(id: HudSlotId, touch = false): number {
  const spec = hudSlot(id);
  return touch ? (spec.touchWidth ?? spec.width) : spec.width;
}

/**
 * Distance (px) from the corner's edge to the slot's NEAR edge — i.e. the
 * value for `top` (top-* corners) or `bottom` (bottom-* corners).
 */
export function hudSlotOffset(id: HudSlotId, touch = false): number {
  const order = hudSlotOrder(id, touch);
  let offset = HUD_EDGE;
  for (const s of hudSlotsInCorner(hudSlotCorner(id, touch), touch)) {
    if (hudSlotOrder(s.id as HudSlotId, touch) >= order) break;
    offset += hudSlotHeight(s.id as HudSlotId, touch) + HUD_GAP;
  }
  return offset;
}

/** The [near, far] band a slot occupies, measured from its corner's edge. */
export function hudSlotBand(id: HudSlotId, touch = false): { start: number; end: number } {
  const start = hudSlotOffset(id, touch);
  return { start, end: start + hudSlotHeight(id, touch) };
}

/**
 * Where a corner's stack ends — the docking point for panels that must sit
 * clear of the whole corner (e.g. the shop panel under the top-left stack).
 * `skipTransient` ignores dev/settings-gated slots, so an opt-in overlay never
 * shrinks the real UI; `skipOverlay` ignores content panels (the minimap),
 * which a docking panel is allowed to cover rather than be squeezed by.
 */
export function hudStackEnd(
  corner: HudCorner,
  touch = false,
  opts: { skipTransient?: boolean; skipOverlay?: boolean } = {},
): number {
  let end = HUD_EDGE;
  for (const s of hudSlotsInCorner(corner, touch)) {
    if (opts.skipTransient && s.transient) continue;
    if (opts.skipOverlay && s.overlay) continue;
    const band = hudSlotBand(s.id as HudSlotId, touch);
    if (band.end > end) end = band.end;
  }
  return end;
}

/**
 * The absolute-position style for a slot. Spread it into the element that IS
 * the slot (or use the <HudSlot> wrapper in ./HudSlot.tsx).
 */
export function hudSlotStyle(id: HudSlotId, touch = false, z: number = HUD_Z.slot): CSSProperties {
  const { vertical, horizontal } = cornerAxes(hudSlotCorner(id, touch));
  const offset = hudSlotOffset(id, touch);
  const style: CSSProperties = { position: "absolute", zIndex: z };
  if (vertical === "top") style.top = offset;
  else style.bottom = offset;
  if (horizontal === "left") style.left = HUD_EDGE;
  else style.right = HUD_EDGE;
  return style;
}

/** A slot's reserved rectangle in viewport px (origin top-left). */
export interface HudRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HudViewport {
  width: number;
  height: number;
}

/**
 * Resolve a slot's reserved rect against a concrete viewport. This is what
 * turns the registry into something a layout test can assert on: "does the
 * minimap fit on a 812x375 phone, and does it touch anything else?".
 *
 * NOTE the safe-area caveat from the module doc: on coarse pointers #hud-root
 * is itself inset by env(safe-area-inset-*), so these rects are relative to the
 * HUD layer. Passing the RAW viewport is the conservative reading (the real
 * layer is never larger).
 */
export function hudSlotRect(id: HudSlotId, viewport: HudViewport, touch = false): HudRect {
  const { vertical, horizontal } = cornerAxes(hudSlotCorner(id, touch));
  const w = hudSlotWidth(id, touch);
  const h = hudSlotHeight(id, touch);
  const offset = hudSlotOffset(id, touch);
  return {
    x: horizontal === "left" ? HUD_EDGE : viewport.width - HUD_EDGE - w,
    y: vertical === "top" ? offset : viewport.height - offset - h,
    w,
    h,
  };
}

/** Do two reserved rects share any area? (touching edges do NOT overlap.) */
export function hudRectsOverlap(a: HudRect, b: HudRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Is a reserved rect fully inside the viewport? */
export function hudRectInViewport(r: HudRect, viewport: HudViewport): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= viewport.width && r.y + r.h <= viewport.height;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * PANEL EDGES (task #107) — the second half of the corner contract.
 *
 * `SLOTS` lets a piece of CHROME declare the corner it owns, so two pieces of
 * chrome cannot collide (task #42). It has no vocabulary for a PANEL to declare
 * the EDGE it occupies — so a docked panel (the shop) and the chrome it covers
 * were invisible to each other and painted in an undeclared z-order. This is
 * that vocabulary, built from the same machinery: static declarations, rects
 * resolved in node, and a guard whose failure names the collision.
 *
 * THE PRECEDENCE RULE, stated once:
 *   A docked panel owns its declared edge outright. Any managed slot whose
 *   reserved rect intersects an open panel's rect must VACATE those pixels —
 *   it never paints under the panel and never fights it for space. The panel
 *   never moves for chrome; chrome always yields (per the slot's `displaced`).
 *   The only chrome exempt is chrome declared to ride ABOVE the panel (the
 *   <body>-portaled audio toggle) or to ACCEPT being painted over (`overlay`
 *   slots, e.g. the minimap).
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Which screen edge a panel docks to (or a full-screen / centred box). */
export type HudEdge = "left" | "right" | "top" | "bottom" | "full" | "center";

/** A viewport-relative extent: min(fraction·axis, maxPx), matching CSS min(45vw, 560px). */
export interface HudExtent {
  fraction: number;
  maxPx: number;
}

export interface HudPanelSpec {
  id: string;
  /** which screen edge it docks to (or full/center); drives which corners it covers */
  edge: HudEdge;
  /** thickness along the docked axis; omitted for full/center (they self-size) */
  size?: HudExtent;
  /** for "center": its own box, so the guard can prove it clears the corners */
  box?: { width: HudExtent; height: HudExtent };
  /**
   * the corners this panel's rect is DECLARED to cover. Cross-checked against
   * the resolved rect: a corner the rect really hits but you did not list FAILS.
   */
  covers: readonly HudCorner[];
  /** match phases the panel is open in (documentation + guard slot-population) */
  phases: readonly string[];
  /** paints at this layer; must sit at/above HUD_Z.slot or it is a declared bug */
  z: number;
  /**
   * true = the panel carries its own way out (match-end 返回大廳), so essential
   * chrome (the ☰) may HIDE under it without trapping the player. Default false.
   */
  providesExit?: boolean;
  owner: string;
  /** false = the panel still positions itself; RESERVED + allowlisted, like a slot */
  managed: boolean;
  note?: string;
}

/**
 * THE PANEL REGISTRY. Adding a docked/full-screen panel = adding a row here.
 * The shop row MIRRORS geometry owned by another task (panels/MerchantShop.tsx,
 * #106) exactly as the SLOTS table already reserves `leave`/`gold-level` for
 * files it does not own — this module declares the EDGE so covered chrome can
 * see it and yield; the panel's own file owns the pixels.
 */
const PANELS = [
  {
    id: "shop",
    edge: "left",
    // === CARD_WIDTH in panels/MerchantShop.tsx: min(45vw, 560px). Side pinned
    // by render/intermission SHOP_CARD_SIDE (left) + its layout.test.ts.
    size: { fraction: 0.45, maxPx: 560 },
    covers: ["top-left", "bottom-left"],
    // auto-open prep + defeated-player combat (shopGate.mounted); HudRoot mounts
    // MerchantShop in BOTH phases and the gate returns null for everyone else.
    phases: ["intermission", "combat"],
    z: HUD_Z.screen, // ABOVE slots (25) and expanded (30)
    owner: "ui/panels/MerchantShop.tsx",
    managed: false,
    note: "RESERVED: full-height left card, min(45vw,560px). Geometry owned by #106; this row declares the EDGE so covered chrome yields.",
  },
  {
    id: "match-end",
    edge: "full",
    covers: ["top-left", "top-right", "bottom-left", "bottom-right"],
    phases: ["matchEnd"],
    z: HUD_Z.screen,
    providesExit: true,
    owner: "ui/panels/MatchEndPanel.tsx",
    managed: false,
    note: "RESERVED: full-screen settlement (inset:0, own backdrop + 返回大廳). Owned by the victory-presentation task; declared here so persistent chrome hides under it instead of floating over it.",
  },
  {
    id: "champ-select",
    edge: "center",
    // width:440 / maxWidth:92vw, vertically centred, content height (roster grid
    // maxHeight 48vh). Bounded generously; the guard only needs it to CLEAR the
    // corners, which a horizontally-centred box does on every landscape viewport.
    box: { width: { fraction: 0.92, maxPx: 440 }, height: { fraction: 0.9, maxPx: 660 } },
    covers: [],
    phases: ["champSelect"],
    z: HUD_Z.slot,
    owner: "ui/panels/ChampSelectPanel.tsx",
    managed: false,
    note: "RESERVED: centred roster picker; covers no corner (guard proves it).",
  },
  {
    id: "augment-draft",
    edge: "center",
    // width:460, horizontally centred near the top (top:90); short content
    // (one 三選一 offer). Bounded; clears the corners on every landscape viewport.
    box: { width: { fraction: 0.92, maxPx: 460 }, height: { fraction: 0.6, maxPx: 300 } },
    covers: [],
    phases: ["intermission"],
    z: HUD_Z.slot,
    owner: "ui/panels/AugmentDraftPanel.tsx",
    managed: false,
    note: "RESERVED: centred 三選一 draft; covers no corner (guard proves it).",
  },
] as const;

export type HudPanelId = (typeof PANELS)[number]["id"];

export const HUD_PANELS: readonly HudPanelSpec[] = PANELS;

const PANEL_BY_ID = new Map<string, HudPanelSpec>(HUD_PANELS.map((p) => [p.id, p]));

/** Look up a panel spec (throws on an unknown id — typos fail loudly). */
export function hudPanel(id: HudPanelId): HudPanelSpec {
  const spec = PANEL_BY_ID.get(id);
  if (!spec) throw new Error(`hudLayout: unknown HUD panel "${id}"`);
  return spec;
}

/** Resolve a viewport-relative extent to px: min(fraction·axis, maxPx). */
export function hudExtentPx(e: HudExtent, axis: number): number {
  return Math.min(e.fraction * axis, e.maxPx);
}

/**
 * A panel's rect against a concrete viewport. Like `hudSlotRect`, this is what
 * turns the declaration into something the guard can assert on. Raw viewport is
 * the conservative reading (the real HUD layer is never larger — same safe-area
 * caveat as the slots).
 */
export function hudPanelRect(id: HudPanelId, viewport: HudViewport): HudRect {
  const p = hudPanel(id);
  const { width: W, height: H } = viewport;
  switch (p.edge) {
    case "left": {
      const w = p.size ? hudExtentPx(p.size, W) : W;
      return { x: 0, y: 0, w, h: H };
    }
    case "right": {
      const w = p.size ? hudExtentPx(p.size, W) : W;
      return { x: W - w, y: 0, w, h: H };
    }
    case "top": {
      const h = p.size ? hudExtentPx(p.size, H) : H;
      return { x: 0, y: 0, w: W, h };
    }
    case "bottom": {
      const h = p.size ? hudExtentPx(p.size, H) : H;
      return { x: 0, y: H - h, w: W, h };
    }
    case "full":
      return { x: 0, y: 0, w: W, h: H };
    case "center": {
      const w = p.box ? hudExtentPx(p.box.width, W) : W;
      const h = p.box ? hudExtentPx(p.box.height, H) : H;
      return { x: (W - w) / 2, y: (H - h) / 2, w, h };
    }
  }
}

/** The anchor point (edge-inset origin) of a corner in a viewport. */
export function hudCornerAnchor(corner: HudCorner, viewport: HudViewport): { x: number; y: number } {
  const { vertical, horizontal } = cornerAxes(corner);
  return {
    x: horizontal === "left" ? HUD_EDGE : viewport.width - HUD_EDGE,
    y: vertical === "top" ? HUD_EDGE : viewport.height - HUD_EDGE,
  };
}

/** The corners a panel's RESOLVED rect actually reaches (contains the anchor of). */
export function hudPanelCovers(id: HudPanelId, viewport: HudViewport): HudCorner[] {
  const r = hudPanelRect(id, viewport);
  return HUD_CORNERS.filter((c) => {
    const a = hudCornerAnchor(c, viewport);
    return a.x >= r.x && a.x <= r.x + r.w && a.y >= r.y && a.y <= r.y + r.h;
  });
}

/** A slot that opts out of yielding: it rides above panels, or accepts cover. */
export function isPanelExempt(spec: HudSlotSpec): boolean {
  return !!spec.portal || !!spec.overlay;
}

/**
 * Near-offset of a slot when it RELOCATES to its `displacedCorner`: docked one
 * gap past that corner's whole existing stack (its `displacedOrder`, but robust
 * to the exact numbers). Reuses `hudStackEnd`, which this finally makes a real
 * production consumer of.
 */
export function hudDisplacedOffset(id: HudSlotId, touch = false): number {
  const spec = hudSlot(id);
  const corner = spec.displacedCorner ?? spec.corner;
  return hudStackEnd(corner, touch) + HUD_GAP;
}

/** The absolute-position style for a RELOCATED slot (see `displaced: "relocate"`). */
export function hudDisplacedStyle(id: HudSlotId, touch = false, z: number = HUD_Z.slot): CSSProperties {
  const spec = hudSlot(id);
  const corner = spec.displacedCorner ?? spec.corner;
  const { vertical, horizontal } = cornerAxes(corner);
  const offset = hudDisplacedOffset(id, touch);
  const style: CSSProperties = { position: "absolute", zIndex: z };
  if (vertical === "top") style.top = offset;
  else style.bottom = offset;
  if (horizontal === "left") style.left = HUD_EDGE;
  else style.right = HUD_EDGE;
  return style;
}

/** The reserved rect of a RELOCATED slot, for the guard. */
export function hudDisplacedRect(id: HudSlotId, viewport: HudViewport, touch = false): HudRect {
  const spec = hudSlot(id);
  const corner = spec.displacedCorner ?? spec.corner;
  const { vertical, horizontal } = cornerAxes(corner);
  const w = hudSlotWidth(id, touch);
  const h = hudSlotHeight(id, touch);
  const offset = hudDisplacedOffset(id, touch);
  return {
    x: horizontal === "left" ? HUD_EDGE : viewport.width - HUD_EDGE - w,
    y: vertical === "top" ? offset : viewport.height - offset - h,
    w,
    h,
  };
}

/** What a slot does under a set of currently-open panels. Pure — the guard and
 * the runtime hook both resolve through this, so they can never disagree. */
export interface HudSlotPlacement {
  hidden: boolean;
  relocated: boolean;
}

export function resolveSlotUnderPanels(
  slotId: HudSlotId,
  touch: boolean,
  panels: readonly HudPanelSpec[],
): HudSlotPlacement {
  const spec = hudSlot(slotId);
  if (isPanelExempt(spec)) return { hidden: false, relocated: false };
  const corner = hudSlotCorner(slotId, touch);
  const covering = panels.filter((p) => p.covers.includes(corner));
  if (covering.length === 0) return { hidden: false, relocated: false };

  const policy = spec.displaced ?? "inset";
  if (policy === "hide") return { hidden: true, relocated: false };
  if (policy === "relocate") {
    const target = spec.displacedCorner ?? spec.corner;
    // if the relocate target is ALSO covered (a full terminal panel), there is
    // nowhere to go — hide instead. The guard only lets this happen when a
    // covering panel `providesExit`, so an essential control is never trapped.
    const targetCovered = panels.some((p) => p.covers.includes(target));
    return targetCovered ? { hidden: true, relocated: false } : { hidden: false, relocated: true };
  }
  // "inset" (default): our covered slots never use it — the guard forbids the
  // combination — so treat it as "stay put" and let the guard flag it.
  return { hidden: false, relocated: false };
}
