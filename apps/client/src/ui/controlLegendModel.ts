/**
 * controlLegendModel — the CONTENT and the GEOMETRY of the first-round 操作說明,
 * both derived rather than typed out. Pure; node-testable (no React, no DOM).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * WHY IT IS DERIVED AND NOT A LIST
 * ════════════════════════════════════════════════════════════════════════════
 * A hand-written legend is a copy of the key map, and a copy becomes a LIE the
 * first time a binding moves — silently, because nothing links the two. This
 * repo has spent a whole campaign deleting exactly that defect class (a tile
 * that promised an effect it did not have, a preview that used the wrong env,
 * a slot row that disagreed with the pixels). Shipping a fresh one, on the
 * screen a first-time player reads to learn the game, would be the worst place
 * to put it.
 *
 * So every row that CAN be computed is computed:
 *
 *   • GAMEPAD — the legend does not read `SLOT_BY_BUTTON`, it RUNS the real
 *     mapping. `probeGamepadButton` feeds `mapGamepadFrame` (the exact pure
 *     function the pad system calls every frame) a synthetic one-button frame
 *     and reports the Order/Command that comes back. A binding that moves,
 *     appears or disappears changes this legend in the same commit, with no
 *     second table to remember. Sticks are probed the same way.
 *   • KEYBOARD ABILITIES — read straight out of `SLOT_BY_CODE`, the table
 *     `InputCapture` itself dispatches on.
 *
 * Two things resist derivation, and both are guarded instead:
 *   • the ORDER keys (A/S/B/Space/arrows) live in a `switch` inside
 *     `InputCapture.onKeyDown`, not in an exported table, and the mouse
 *     bindings live in `addEventListener` calls. They are DECLARED below with
 *     the source token that proves them, and `controlLegendModel.test.ts` scans
 *     `input/InputCapture.ts` BOTH WAYS: every declared token must exist, and
 *     every `case "Key…"` in that switch must be claimed by this legend. Add a
 *     binding without a legend row and the test fails.
 *   • the TOUCH controls are JSX, so they are declared with the marker their
 *     element carries (`data-touch-slot`, `data-role`) and scanned the same
 *     way against `ui/TouchControls.tsx`.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * WHY THE GEOMETRY LIVES HERE TOO (task #107)
 * ════════════════════════════════════════════════════════════════════════════
 * The safe-area contract says persistent chrome declares a corner slot and
 * panels declare an edge, so nothing lands on anything else. This legend can
 * do neither: it is not corner chrome (it wants the long empty flank BESIDE
 * the arena, not a corner) and `hud/hudLayout.ts` is out of scope for this
 * change. The honest alternative to editing the registry is to obey it: derive
 * the rectangle FROM the registry's own reserved rects (`hudSlotRect` /
 * `hudStackEnd`) and let `controlLegendModel.test.ts` prove the result touches
 * no slot on every guard viewport, for both pointer types. Same protection,
 * from the outside.
 *
 * Two shapes, because there are two different layout problems:
 *   COLUMN — classic single-player desktop. The left flank between the
 *            top-left stack (☰/隊伍/復活/敵隊) and the bottom-left telemetry
 *            chips is 300-500px of empty screen next to the arena. It is the
 *            only place a ~10-row reference fits without covering anything.
 *   STRIP  — coarse pointers AND couch split-screen. On a phone the top-left
 *            column is full to ~356px on a 375px-tall viewport: there is no
 *            flank, and the honest answer is a different placement, not smaller
 *            text (the same call hudLayout makes when it re-homes the minimap).
 *            In couch the flank belongs to a player's viewport. Both get a
 *            single wrapped strip in the top gutter — the free horizontal
 *            interval at its own y-band, under the phase timer, above the top
 *            cells' mini-HUDs. Desktop also FALLS BACK to the strip when the
 *            flank is too short for the whole binding set, because clipping
 *            rows off a reference card is the one thing it may never do.
 */
import type { CastableSlot } from "@ggd/shared/sim/intents";
import {
  BTN,
  mapGamepadFrame,
  type GamepadFrame,
  type GamepadPlayerCtx,
} from "../input/GamepadInput";
import { SLOT_BY_CODE } from "../input/InputCapture";
import {
  HUD_EDGE,
  HUD_GAP,
  HUD_SLOTS,
  hudSlotRect,
  hudStackEnd,
  type HudRect,
  type HudSlotId,
  type HudViewport,
} from "./hud/hudLayout";
import { PASSIVE_SLOT_LABEL } from "./passiveSlot";

/* ═══════════════════════════════════════════════════════════════════════════
 * ROWS
 * ═══════════════════════════════════════════════════════════════════════════ */

/** One line of the legend: the control you touch, and what it does. */
export interface LegendRow {
  /** stable key for React (the binding's source token) */
  id: string;
  /** what the player physically presses, already display-formatted */
  control: string;
  /** what it does, 繁中 */
  label: string;
}

/** What a binding resolves to, in the sim's own vocabulary. */
export type LegendAction =
  | { kind: "cast"; slot: CastableSlot }
  | { kind: "order"; order: "move" | "attackMove" | "attackTarget" | "stop" }
  | { kind: "command"; command: "recall" | "ready" };

/**
 * Slot → caption. The sixth slot's name comes from `passiveSlot` so the legend
 * and the ability bar cannot end up calling it two different things.
 */
const SLOT_LABEL: Record<CastableSlot, string> = {
  Q: "技能 Q",
  W: "技能 W",
  E: "技能 E",
  R: "技能 R",
  EX: "EX 技能",
  PASSIVE: `${PASSIVE_SLOT_LABEL}技（第六格）`,
};

const ORDER_LABEL: Record<Extract<LegendAction, { kind: "order" }>["order"], string> = {
  move: "移動",
  attackMove: "攻擊移動",
  attackTarget: "攻擊最近的敵人",
  stop: "停止動作",
};

const COMMAND_LABEL: Record<Extract<LegendAction, { kind: "command" }>["command"], string> = {
  recall: "回城",
  ready: "準備完成",
};

/** Caption for a resolved action. Throws on an action nothing has named yet —
 * a new binding must be given words, not silently rendered blank. */
export function legendActionLabel(action: LegendAction): string {
  if (action.kind === "cast") {
    const label = SLOT_LABEL[action.slot];
    if (!label) throw new Error(`controlLegend: no caption for slot "${action.slot}"`);
    return label;
  }
  if (action.kind === "order") {
    const label = ORDER_LABEL[action.order];
    if (!label) throw new Error(`controlLegend: no caption for order "${action.order}"`);
    return label;
  }
  const label = COMMAND_LABEL[action.command];
  if (!label) throw new Error(`controlLegend: no caption for command "${action.command}"`);
  return label;
}

/* ── gamepad ───────────────────────────────────────────────────────────────
 * Derived by RUNNING `mapGamepadFrame`. The context below is the minimum a
 * probe needs to make every branch reachable: a position (all casts and orders
 * are self-relative), a facing (the aim fallback), an ability for every slot
 * and an enemy in range (so a `targeted` cast and LT both resolve).
 */

const PROBE_SELF = { x: 0, z: 0 };

function probeCtx(): GamepadPlayerCtx {
  return {
    selfPos: PROBE_SELF,
    facing: { x: 0, z: 1 },
    lastAimDir: null,
    // a skillshot with a real range: resolves for every slot without needing a
    // hovered target, so a missing binding is the only reason a row disappears
    ability: () => ({ castType: "skillshot", range: 6 }),
    nearestEnemy: () => 1,
  };
}

/** Run one button through the real mapping. null = that button does nothing. */
export function probeGamepadButton(button: number): LegendAction | null {
  const frame: GamepadFrame = { move: null, aim: null, justPressed: [button] };
  const intent = mapGamepadFrame(frame, probeCtx());
  for (const cmd of intent.commands) {
    if (cmd.kind === "castAbility") return { kind: "cast", slot: cmd.slot };
    if (cmd.kind === "recall") return { kind: "command", command: "recall" };
    if (cmd.kind === "ready") return { kind: "command", command: "ready" };
  }
  const order = intent.order;
  if (order && (order.kind === "move" || order.kind === "attackMove" || order.kind === "attackTarget" || order.kind === "stop")) {
    return { kind: "order", order: order.kind };
  }
  return null;
}

/** Does the LEFT stick still produce a move order / the RIGHT stick an aim? */
export function probeGamepadSticks(): { move: boolean; aim: boolean } {
  const moved = mapGamepadFrame({ move: { x: 0, z: 1 }, aim: null, justPressed: [] }, probeCtx());
  const aimed = mapGamepadFrame({ move: null, aim: { x: 1, z: 0 }, justPressed: [] }, probeCtx());
  return { move: moved.order?.kind === "move", aim: aimed.aim !== undefined };
}

/**
 * Pad-button index → the face a player reads on the controller. Keyed by
 * `BTN`'s OWN names, so a button that appears in `BTN` without a face here
 * fails loudly rather than rendering as a bare index.
 */
const PAD_FACE: Record<string, string> = {
  // plain letters, exactly as they are printed on the physical pad — the
  // circled forms (Ⓐ Ⓑ Ⓧ Ⓨ) render tiny at 11px and Ⓧ reads as a ✕, which on a
  // box that also HAS a ✕ is the one confusion this must not create.
  A: "A",
  B: "B",
  X: "X",
  Y: "Y",
  LB: "LB",
  RB: "RB",
  LT: "LT",
  RT: "RT",
  BACK: "Back",
  START: "Start",
  DPAD_UP: "十字鍵 ↑",
};

export function padFace(name: string): string {
  const face = PAD_FACE[name];
  if (!face) throw new Error(`controlLegend: pad button "${name}" has no printed face`);
  return face;
}

/**
 * The pad legend. Sticks first (they are how you move), then every bound
 * button in the order `BTN` declares them — which is the controller's own
 * reading order, face buttons before shoulders before menu keys.
 */
export function gamepadLegend(): LegendRow[] {
  const rows: LegendRow[] = [];
  const sticks = probeGamepadSticks();
  // "release does NOT stop" is the one non-obvious thing about this scheme and
  // the first thing a new pad player gets wrong, so it is said on the row.
  if (sticks.move) rows.push({ id: "stick-left", control: "左類比", label: "移動（放開會走完最後一步）" });
  if (sticks.aim) rows.push({ id: "stick-right", control: "右類比", label: "瞄準" });
  for (const [name, index] of Object.entries(BTN)) {
    const action = probeGamepadButton(index);
    if (!action) continue;
    rows.push({ id: `btn-${name}`, control: padFace(name), label: legendActionLabel(action) });
  }
  return rows;
}

/* ── keyboard + mouse ──────────────────────────────────────────────────────
 * The ability keys come out of `SLOT_BY_CODE`. Everything else is declared
 * WITH the token that proves it, and scanned against InputCapture both ways.
 */

/** A binding that could not be derived, plus the source token that proves it. */
export interface DeclaredBinding {
  id: string;
  control: string;
  label: string;
  /** literal text that must appear in the owning source file */
  source: string;
}

/** The file every keyboard/mouse declaration below is checked against. */
export const KEYBOARD_SOURCE = "input/InputCapture.ts";

/** Order/camera keys handled by `InputCapture.onKeyDown`'s switch. */
export const KEYBOARD_ORDER_BINDINGS: readonly DeclaredBinding[] = [
  { id: "KeyA", control: "A + 左鍵", label: "攻擊移動", source: 'case "KeyA"' },
  { id: "KeyS", control: "S", label: "停止動作", source: 'case "KeyS"' },
  { id: "KeyB", control: "B", label: "回城", source: 'case "KeyB"' },
  { id: "Space", control: "空白鍵", label: "鏡頭跟隨開關", source: 'case "Space"' },
  { id: "Arrows", control: "方向鍵", label: "平移鏡頭", source: '"ArrowUp"' },
];

/** Mouse bindings, proved by the listener InputCapture registers. */
export const MOUSE_BINDINGS: readonly DeclaredBinding[] = [
  { id: "rmb", control: "右鍵", label: "移動 / 攻擊點到的敵人", source: '"contextmenu"' },
  { id: "lmb-self", control: "左鍵點自己", label: "英雄語音", source: "onSelectSelf" },
  { id: "wheel", control: "滾輪", label: "鏡頭縮放", source: '"wheel"' },
];

/** `KeyQ` → `Q`; anything else keeps its own printed name. */
export function keyCodeFace(code: string): string {
  return code.startsWith("Key") && code.length === 4 ? code.slice(3) : code;
}

export function keyboardLegend(): LegendRow[] {
  const rows: LegendRow[] = [];
  rows.push({ id: "rmb", control: "右鍵", label: MOUSE_BINDINGS[0]!.label });
  for (const [code, slot] of Object.entries(SLOT_BY_CODE)) {
    rows.push({ id: `key-${code}`, control: keyCodeFace(code), label: SLOT_LABEL[slot] });
  }
  for (const b of KEYBOARD_ORDER_BINDINGS) {
    rows.push({ id: `key-${b.id}`, control: b.control, label: b.label });
  }
  for (const b of MOUSE_BINDINGS.slice(1)) {
    rows.push({ id: `mouse-${b.id}`, control: b.control, label: b.label });
  }
  return rows;
}

/* ── touch ─────────────────────────────────────────────────────────────────
 * The touch buttons already print their own ability names on their faces
 * (task #152), so this legend only names the controls that carry no words:
 * the joystick, the big attack circle, the ⌂ recall and the hold gesture.
 */

export const TOUCH_SOURCE = "TouchControls.tsx";

export const TOUCH_BINDINGS: readonly DeclaredBinding[] = [
  { id: "joystick", control: "左側搖桿", label: "移動", source: 'data-role="joy-base"' },
  { id: "attack", control: "右下大圓鈕", label: "普通攻擊", source: 'pressHandler("ATTACK")' },
  { id: "arc", control: "環形技能鈕", label: "施放技能（拖曳可瞄準）", source: "data-touch-slot" },
  { id: "hold", control: "長按技能鈕", label: "看技能說明", source: "setHeldAbility" },
  { id: "recall", control: "⌂", label: "回城", source: '{ kind: "recall" }' },
];

export function touchLegend(): LegendRow[] {
  return TOUCH_BINDINGS.map((b) => ({ id: `touch-${b.id}`, control: b.control, label: b.label }));
}

/** The rows for one input mode. The ONE place the mode picks a binding set. */
export function legendRows(mode: "keyboard" | "gamepad" | "touch"): LegendRow[] {
  if (mode === "gamepad") return gamepadLegend();
  if (mode === "touch") return touchLegend();
  return keyboardLegend();
}

/* ═══════════════════════════════════════════════════════════════════════════
 * GEOMETRY — derived from the hudLayout registry, never from magic numbers
 * ═══════════════════════════════════════════════════════════════════════════ */

export type LegendShape = "column" | "strip";

export interface LegendRect {
  shape: LegendShape;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Width of the left-flank column. Fits 「十字鍵 ↑」 + a 10-character caption. */
export const LEGEND_COLUMN_W = 218;

/*
 * The column is sized to its CONTENT, and the numbers below are MEASURED off a
 * real render (1546x900, headless Chrome, the app's own font stack), not
 * guessed. This matters more than it looks: the first version capped the
 * column at a flat 320px and silently swallowed the last three keyboard rows —
 * 方向鍵 / 左鍵點自己 / 滾輪 — which is precisely the "confident, incomplete
 * answer" this whole legend exists to avoid. A legend that cannot fit must say
 * so (see `controlLegendRect`), never trim itself.
 */
/** One row: key-cap line box + the 3px row gap. */
export const LEGEND_ROW_H = 26;
/** Title row + its bottom margin. */
export const LEGEND_HEADER_H = 26;
/** 7px top + 7px bottom padding, plus slack for font-metric variance. */
export const LEGEND_PAD_Y = 24;

export function legendColumnHeight(rowCount: number): number {
  return LEGEND_PAD_Y + LEGEND_HEADER_H + rowCount * LEGEND_ROW_H;
}

/**
 * Wrapped chips. The height follows the ROW COUNT rather than being one size
 * for everyone, because the two binding sets are very different lengths: the
 * touch legend is 5 rows (the buttons print their own names, task #152) and
 * the pad legend is 13. A single tall box would waste a third of a phone's
 * screen; a single short box would silently clip the pad's last rows — and the
 * last row is 天生技, the one binding nobody guesses.
 */
export const LEGEND_STRIP_H_SHORT = 58;
export const LEGEND_STRIP_H_TALL = 84;
/** Rows that still fit two wrapped lines at the widest strip. */
export const LEGEND_STRIP_SHORT_ROWS = 6;
export const LEGEND_STRIP_MIN_W = 200;
export const LEGEND_STRIP_MAX_W = 620;

export function legendStripHeight(rowCount: number): number {
  return rowCount <= LEGEND_STRIP_SHORT_ROWS ? LEGEND_STRIP_H_SHORT : LEGEND_STRIP_H_TALL;
}

/* ── the two unslotted clusters ────────────────────────────────────────────
 * Not everything in the HUD has a registry row. Two centred clusters predate
 * the corner contract and still pin their own offsets, and because they are
 * horizontally CENTRED they cannot be expressed as a corner slot at all — the
 * registry is a four-corner model. They are declared here as conservative
 * boxes (upper bounds, exactly like a slot's reserved height) and folded into
 * the same rect check, so the legend clears them for the same reason it clears
 * everything else. `controlLegendModel.test.ts` pins each number to the offset its
 * component really hard-codes.
 */

/** Top-centre: PhaseTimer (`top: 10`, 2-line ~52px) then SpectatorHint (`top: 64`). */
export const TOP_CENTRE_BAND_END = 98;
/**
 * Bottom-centre: the AbilityBar (`bottom: 14`, ~90 tall with its captions) and
 * the ResourceBars (`bottom: 128`, 260x~46) — the two PERSISTENT centred
 * pieces, so the band ends at 174 plus headroom.
 *
 * CastNotice is deliberately NOT in here. It is a transient toast (one per
 * refused press, gone in a second), and `ui/chromeReserve` already states the
 * rule this follows: the contract is that no PERSISTENT chrome may be covered.
 * Reserving room for every ephemeral popover would shrink the real UI for
 * something that is not on screen.
 */
export const ABILITY_CLUSTER_H = 180;
/** Six 52px tiles + gaps + the rank-up controls, rounded generously up. */
export const ABILITY_CLUSTER_W = 460;

/**
 * Height reserved by ONE couch cell's mini-HUD (ui/components/CouchHudGrid),
 * which pins itself to the bottom of its own viewport, 8px up. Upper bound:
 * name row + 2 bars + the QWER chip row + padding.
 */
export const COUCH_CELL_HUD_H = 78;
const COUCH_CELL_HUD_GAP = 8;

/**
 * Every slot's RESERVED rect for this viewport, minus the dev-only transients
 * (hudLayout's own rule: a settings-gated overlay never shrinks the real UI).
 *
 * The legend measures itself against these rects rather than against corner
 * stack ends alone, because a corner's stack is not the whole story on a small
 * window: at 812x375 the bottom-right stack (minimap + equipment) reaches all
 * the way up into the top gutter, and at 375 wide it reaches sideways into the
 * left flank. Only the rectangles know that.
 */
function reservedRects(viewport: HudViewport, touch: boolean): HudRect[] {
  const rects = HUD_SLOTS.filter((s) => !s.transient).map((s) =>
    hudSlotRect(s.id as HudSlotId, viewport, touch),
  );
  // the centred ability cluster — no corner owns it, so it is declared here
  rects.push({
    x: Math.max(0, (viewport.width - ABILITY_CLUSTER_W) / 2),
    y: Math.max(0, viewport.height - ABILITY_CLUSTER_H),
    w: Math.min(ABILITY_CLUSTER_W, viewport.width),
    h: Math.min(ABILITY_CLUSTER_H, viewport.height),
  });
  return rects;
}

export interface LegendPlacementOpts {
  touch: boolean;
  /** local players on this machine; >1 = split-screen */
  couchPlayers: number;
  /** rows the chosen binding set will actually paint (sizes the strip) */
  rowCount: number;
}

/**
 * The rectangle the legend may paint in, or null when this viewport has no
 * room for it. Null is a real answer: a legend that overlaps the HUD is worse
 * than no legend, and the #107 contract is not negotiable for a hint box.
 */
export function controlLegendRect(
  viewport: HudViewport,
  opts: LegendPlacementOpts,
): LegendRect | null {
  const { touch, couchPlayers, rowCount } = opts;
  const couch = couchPlayers > 1;
  if (touch || couch) return stripRect(viewport, touch, couchPlayers, legendStripHeight(rowCount));
  // Desktop prefers the flank. When the flank is too SHORT for the whole
  // binding set (a small window, or a stack that grew), it falls back to the
  // top-gutter strip rather than clipping rows off the bottom — the strip
  // wraps, so it can hold the same content in less height.
  return (
    columnRect(viewport, touch, legendColumnHeight(rowCount)) ??
    stripRect(viewport, touch, couchPlayers, legendStripHeight(rowCount))
  );
}

/**
 * Left flank: anchored under the top-left stack, then CLIPPED by every slot
 * whose reserved rect shares the column's x-range — the bottom-left telemetry
 * chips normally, and on a narrow window the bottom-right minimap too.
 */
function columnRect(viewport: HudViewport, touch: boolean, needed: number): LegendRect | null {
  const x = HUD_EDGE;
  const w = LEGEND_COLUMN_W;
  const top = hudStackEnd("top-left", touch, { skipTransient: true }) + HUD_GAP;
  let bottomLimit = viewport.height - HUD_EDGE;
  for (const r of reservedRects(viewport, touch)) {
    const sharesX = r.x < x + w && x < r.x + r.w;
    if (!sharesX) continue;
    if (r.y + r.h <= top) continue; // entirely above the flank
    if (r.y - HUD_GAP < bottomLimit) bottomLimit = r.y - HUD_GAP;
  }
  if (bottomLimit - top < needed) return null; // would clip — let the strip try
  return { shape: "column", x, y: top, w, h: needed };
}

/**
 * Top gutter: the free horizontal interval at the strip's own y-band. Computed
 * from the rects that really intersect that band, not from a corner's widest
 * slot — on a 375px-tall window the bottom-right stack reaches into this band
 * and a corner-based guess would not see it.
 */
function stripRect(
  viewport: HudViewport,
  touch: boolean,
  couchPlayers: number,
  stripH: number,
): LegendRect | null {
  const y = TOP_CENTRE_BAND_END + HUD_GAP;
  if (y + stripH > viewport.height) return null;
  const mid = viewport.width / 2;
  let gapStart = HUD_EDGE;
  let gapEnd = viewport.width - HUD_EDGE;
  for (const r of reservedRects(viewport, touch)) {
    const sharesY = r.y < y + stripH && y < r.y + r.h;
    if (!sharesY) continue;
    // Corner slots each push in from their own side. Anything STRADDLING the
    // centre line (only the centred ability cluster can, and only on a window
    // too short to hold both) leaves no centred gap at all — say so.
    if (r.x < mid && r.x + r.w > mid) return null;
    if (r.x + r.w <= mid) gapStart = Math.max(gapStart, r.x + r.w + HUD_GAP);
    else gapEnd = Math.min(gapEnd, r.x - HUD_GAP);
  }
  const avail = gapEnd - gapStart;
  if (avail < LEGEND_STRIP_MIN_W) return null;
  // 3-4 couch players = a 2x2 grid, and the TOP cells' mini-HUDs sit just above
  // the horizontal split. The strip must clear them or it lands on a player's
  // own health bar — the one thing a split-screen HUD may never lose.
  if (couchPlayers >= 3) {
    const topCellHudTop = viewport.height / 2 - COUCH_CELL_HUD_GAP - COUCH_CELL_HUD_H;
    if (y + stripH + HUD_GAP > topCellHudTop) return null;
  }
  const w = Math.min(avail, LEGEND_STRIP_MAX_W);
  return { shape: "strip", x: Math.round(gapStart + (avail - w) / 2), y, w, h: stripH };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * GATING
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ROUND 1 ONLY. `round` is a real discrete field on the HUD store (RoomStore
 * `HudState.round`, projected from MatchState), so this needs no invented
 * state. `round <= 1` and not `=== 1` because the field initialises to 0 and a
 * server that has not stamped a number yet is still, unambiguously, the first
 * round the player is looking at.
 *
 * Combat only: during 中場 the shop owns the left edge and the arena is not
 * even being drawn, so a control reference there would be chrome over a
 * shopping screen.
 */
export function controlLegendVisible(opts: {
  phase: string;
  round: number;
  dismissed: boolean;
  /** a corner-covering panel is open — chrome yields, always (#107) */
  panelCovering: boolean;
}): boolean {
  if (opts.dismissed || opts.panelCovering) return false;
  return opts.phase === "combat" && opts.round <= 1;
}

/* ── dismissal ─────────────────────────────────────────────────────────────
 * Sticks for good, not just for the match: "I know this game" does not expire.
 * Mirrors settings/SettingsStore's storage shape (a `ggd.` key, every access
 * wrapped, because localStorage throws in a sandboxed iframe / private mode).
 */

export const LEGEND_DISMISS_KEY = "ggd.controlLegend.dismissed";

function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return typeof localStorage.getItem === "function" ? localStorage : null;
  } catch {
    return null;
  }
}

export function readLegendDismissed(): boolean {
  try {
    return storage()?.getItem(LEGEND_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeLegendDismissed(dismissed: boolean): void {
  try {
    const s = storage();
    if (!s) return;
    if (dismissed) s.setItem(LEGEND_DISMISS_KEY, "1");
    else s.removeItem(LEGEND_DISMISS_KEY);
  } catch {
    /* private mode / sandboxed iframe: the dismissal is simply not remembered */
  }
}
