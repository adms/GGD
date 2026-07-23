/**
 * audioClusterLayout — the PURE geometry of the top-of-screen audio cluster,
 * split out of AudioToggle.tsx so the "does the expanded panel still behave"
 * question is answerable in a node test instead of by eyeballing a phone.
 *
 * THE INVARIANT THIS FILE EXISTS TO ENFORCE
 * -----------------------------------------
 * The cluster is <body>-portaled chrome that lands in the `audio-toggle` slot
 * of the top-right corner stack (ui/hud/hudLayout). Task #42 made corner
 * geometry a shared DECLARATION precisely because HUD chrome mounted from
 * different React parents used to pile up on the same coordinates; its guard
 * test proves the declared slot BANDS of a corner never overlap.
 *
 * So the expanded control tray opens SIDEWAYS (leftward, in the cluster's own
 * row) rather than downward:
 *
 *      ┌───────────────────────────────── audio-toggle band ──────────┐
 *      │  [ Master ][ Music ][ SFX ][ Cursor ]   [🎚][🎵][🔊]         │
 *      └──────────────────────────────────────────────────────────────┘
 *
 * Growing only along X keeps the whole expanded cluster INSIDE its declared
 * vertical band, and band-disjointness is already guard-tested — so the panel
 * provably cannot land on the scoreboard above it or the settings gear below
 * it, at any pointer type, without re-deriving anything. Two rectangles that
 * are disjoint on one axis are disjoint, full stop.
 *
 * The other half of the requirement — staying inside the viewport — is what
 * `audioClusterGeom().left` answers: the cluster is right-anchored, so the
 * expanded width is only safe while its left edge clears the left safe-area
 * inset at the narrowest supported viewport (667×375 landscape phone).
 *
 * A downward panel was rejected: docked past the whole top-right stack it
 * would start at 208px (fine) / 252px (touch) from the top, leaving ~123px on
 * a 375px-tall landscape phone — not enough for four rows, so it would have
 * had to either overlap its neighbours or run off-screen.
 */

/** Side of one collapsed cluster button (Apple HIG minimum). */
export const AUDIO_BTN_SIZE = 44;
/** Gap between two cluster buttons. */
export const AUDIO_BTN_GAP = 6;
/** Gap between the tray and the button group. */
export const AUDIO_TRAY_GAP = 6;
/**
 * Tray padding (per side) + its 1px border. Kept tight on purpose: the tray is
 * boxed into a 44px band, and every px of padding comes straight off the
 * slider's hit height (44 − 2·pad − 2·border − 11px label row).
 */
export const AUDIO_TRAY_PAD = 4;
export const AUDIO_TRAY_BORDER = 1;
/** Width of one control cell (label row + full-width slider). */
export const AUDIO_CELL_W = 96;
/** Gap between two cells. */
export const AUDIO_CELL_GAP = 6;

/** Buttons in the collapsed cluster: 🎚 expand, 🎵 music mute, 🔊 SFX mute. */
export const AUDIO_CLUSTER_BUTTONS = 3;

/**
 * Top offset on a MENU screen (auth / lobby / codex …), where there is no HUD
 * corner stack for the cluster to sit in and it hugs the corner instead. Lives
 * here rather than in the component so `ui/chromeReserve` can DERIVE its
 * pre-measurement fallback height from the real geometry.
 */
export const AUDIO_MENU_TOP = 12;

/** Width of the collapsed button group. */
export function audioButtonsWidth(buttons: number = AUDIO_CLUSTER_BUTTONS): number {
  const n = Math.max(0, Math.floor(buttons));
  if (n === 0) return 0;
  return n * AUDIO_BTN_SIZE + (n - 1) * AUDIO_BTN_GAP;
}

/** Width of the expanded tray holding `cells` controls (0 cells = collapsed). */
export function audioTrayWidth(cells: number): number {
  const n = Math.max(0, Math.floor(cells));
  if (n === 0) return 0;
  return (
    n * AUDIO_CELL_W +
    (n - 1) * AUDIO_CELL_GAP +
    2 * AUDIO_TRAY_PAD +
    2 * AUDIO_TRAY_BORDER
  );
}

export interface AudioClusterGeomInput {
  /** viewport width in CSS px */
  vw: number;
  /** px from the viewport top edge to the cluster's top (safe-area included) */
  top: number;
  /** reserved band height — hudSlotHeight("audio-toggle", touch) */
  height: number;
  /** px from the viewport RIGHT edge to the cluster's right edge */
  right: number;
  /** left safe-area inset the cluster may not cross (landscape notch) */
  insetLeft?: number;
  /** control cells shown; 0 = collapsed (no tray) */
  cells: number;
  /** collapsed buttons shown */
  buttons?: number;
}

export interface AudioClusterGeom {
  /** px from the viewport top edge to the cluster's top edge */
  top: number;
  /** px from the viewport top edge to the cluster's bottom edge */
  bottom: number;
  /** px from the viewport LEFT edge to the cluster's left edge */
  left: number;
  /** px from the viewport RIGHT edge to the cluster's right edge */
  right: number;
  /** total laid-out width (tray + gap + buttons) */
  width: number;
  /** the tray's own width (0 when collapsed) */
  trayWidth: number;
  /** the button group's width */
  buttonsWidth: number;
}

/**
 * Lay the cluster out. Everything is measured from the viewport edges, which
 * is how the component is actually positioned (`position: fixed` + right/top),
 * so the numbers here are the ones a browser would produce.
 */
export function audioClusterGeom(input: AudioClusterGeomInput): AudioClusterGeom {
  const buttonsWidth = audioButtonsWidth(input.buttons ?? AUDIO_CLUSTER_BUTTONS);
  const trayWidth = audioTrayWidth(input.cells);
  const width = trayWidth > 0 ? trayWidth + AUDIO_TRAY_GAP + buttonsWidth : buttonsWidth;
  return {
    top: input.top,
    bottom: input.top + input.height,
    left: input.vw - input.right - width,
    right: input.right,
    width,
    trayWidth,
    buttonsWidth,
  };
}

/** Does the laid-out cluster clear the left safe-area inset (i.e. fit)? */
export function audioClusterFits(geom: AudioClusterGeom, insetLeft = 0): boolean {
  return geom.left >= insetLeft;
}

/**
 * The widest tray the viewport can hold, in cells. The component clamps its
 * `maxWidth` with this so a viewport narrower than every supported target
 * (e.g. a phone held in portrait, where RotateOverlay is up anyway) scrolls
 * the tray horizontally instead of growing it into a second row — a second
 * row would leave the declared band and break the disjointness invariant.
 */
export function audioTrayMaxWidth(input: {
  vw: number;
  right: number;
  insetLeft?: number;
  buttons?: number;
}): number {
  const insetLeft = input.insetLeft ?? 0;
  const room =
    input.vw -
    insetLeft -
    input.right -
    audioButtonsWidth(input.buttons ?? AUDIO_CLUSTER_BUTTONS) -
    AUDIO_TRAY_GAP;
  return Math.max(0, room);
}

/** Two 1-D intervals overlap (used by the HUD disjointness sweep). */
export function bandsOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end;
}
