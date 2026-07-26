/**
 * roundReportLayout — WHERE the 「上一回合戰報」 card is allowed to paint
 * (task #265). Pure geometry, so "it does not cover Ready up / the build stamp
 * / a HUD corner" is an assertion in `roundReportLayout.test.ts` rather than an
 * opinion about a screenshot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PROBLEM: 「右側」 IS NOT EMPTY
 * ─────────────────────────────────────────────────────────────────────────────
 * The owner asked for the report 「在右側」. The intermission's right 55 % is
 * already spoken for, and every occupant belongs to a task this one must not
 * touch:
 *
 *   x ≈ 67 % of the width   the player's own 3D champion (render/intermission
 *                           layout.ts CHAMPION_STAND) — covering it is the #94
 *                           complaint 「商店說明頁剛好檔到角色」, mirrored.
 *   top 10 %, left 46 %     the merchant tip box's AMBIENT band.
 *   top 20 %, right 6 %     the hero reaction bubble.
 *   centre-bottom           the prep clock (bottom 262) and Ready up (bottom 190).
 *   the right corners       the #107 slot stacks — and while the shop is docked
 *                           LEFT the ☰ RELOCATES into the top-right column, so
 *                           that column is taller during the intermission than
 *                           at any other time.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SPACE THIS CARD USES, AND WHY IT IS REALLY FREE
 * ─────────────────────────────────────────────────────────────────────────────
 * The bottom-right stack reserves three bands: gold-level (10–74 from the
 * bottom), MINIMAP (82–290) and equipment (298–348). The minimap is the only
 * one of the three that is NOT painted during the intermission —
 * `ui/hud/Minimap.tsx` gates its visibility on
 * `phase !== "champSelect" && phase !== "matchEnd" && phase !== "intermission"`.
 * So for the whole shop phase there is a 208 px-tall hole in the right column,
 * between the equipment bar and the gold readout, that nothing paints into.
 *
 * That is where the card goes: {@link ROUND_REPORT_DOCK_SLOT}'s reserved band,
 * borrowed for exactly the phase its owner is absent.
 *
 * THIS IS A CROSS-FILE ASSUMPTION, so it is guarded like one:
 * `roundReportLayout.test.ts` READS `ui/hud/Minimap.tsx` and fails if that
 * intermission clause disappears. Borrowing a band on a hunch is how #107
 * collisions happen; borrowing it against a source-scanned fact is not.
 *
 * The card therefore covers NO #107 corner (the guard asserts it against
 * `hudCornerAnchor` on every viewport in the standard set), needs no row in the
 * panel registry, and displaces no chrome.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SHORT-VIEWPORT DOCK (#151 phone landscape)
 * ─────────────────────────────────────────────────────────────────────────────
 * On a 844×390 landscape phone the right EDGE has no hole at all: on coarse
 * pointers the minimap re-homes to the top-left and the equipment bar re-homes
 * to the top-right, so the right column runs from 10 px to past 350 px of a
 * 390 px viewport. There is no arrangement in which an edge-docked card fits.
 *
 * So on short viewports the card docks INSET instead — immediately right of the
 * shop card, in the strip below Ready up and above the build-stamp band. That
 * strip is free by construction: the corner stacks are at the extreme edges,
 * Ready and the clock are centred and higher, and the tip box / reaction bubble
 * live in the upper third. It is still 「右側」 — right of the shop card, which
 * is what the phrase means on a screen the card owns 45 % of.
 */
import {
  HUD_EDGE,
  HUD_GAP,
  HUD_STAMP_BAND,
  hudDisplacedRect,
  hudRectsOverlap,
  hudSlotBand,
  hudSlotHeight,
  hudSlotRect,
  type HudRect,
  type HudSlotId,
  type HudViewport,
} from "../hud/hudLayout";

/**
 * The slot whose reserved band the card borrows during the intermission. Named
 * so the guard test and the module doc cannot drift from the code.
 */
export const ROUND_REPORT_DOCK_SLOT = "minimap" as const;

/**
 * The phase during which {@link ROUND_REPORT_DOCK_SLOT} is not painted. Must
 * stay in sync with `ui/hud/Minimap.tsx`; the guard reads that file.
 */
export const ROUND_REPORT_DOCK_FREE_PHASE = "intermission";

/** Card width bounds. The cap keeps the card off the champion at ~67 % width. */
export const ROUND_REPORT_MAX_W = 300;
export const ROUND_REPORT_MIN_W = 200;
/** Fraction of the viewport width the card may take (whichever is smaller). */
export const ROUND_REPORT_W_FRACTION = 0.26;

/** Below this the card drops its stat chips and shows grade + hints only. */
export const ROUND_REPORT_EXPANDED_MIN_H = 190;

export type RoundReportDock = "edge" | "inset";
export type RoundReportDensity = "expanded" | "compact";

/**
 * Below these the box has been shrunk past legibility by {@link avoidPainted}
 * and the card is NOT painted at all. That case is real: a 375 px-wide PORTRAIT
 * viewport has the shop card on the left, the corner stacks on the right and the
 * champion's own HP/MP bars across the middle of what is left, so there is no
 * honest place to put it. (Portrait also shows the rotate-me overlay, so the HUD
 * is not in use there — but a 4 px sliver would be a lie either way.)
 */
export const MIN_RENDER_W = 140;
export const MIN_RENDER_H = 56;

export interface RoundReportPlacement {
  dock: RoundReportDock;
  density: RoundReportDensity;
  /** false = no room anywhere; the component paints nothing */
  visible: boolean;
  /** absolute-position CSS for the card (px) */
  css: {
    top: number;
    width: number;
    maxHeight: number;
    right?: number;
    left?: number;
  };
  /** the same box as a rect, for the guard */
  rect: HudRect;
}

function clampWidth(vw: number): number {
  const w = Math.min(ROUND_REPORT_MAX_W, Math.round(vw * ROUND_REPORT_W_FRACTION));
  return Math.max(ROUND_REPORT_MIN_W, w);
}

/**
 * The shop card's rendered width — mirrors `MerchantShop.CARD_WIDTH`
 * (`min(45vw, 560px)`). Mirrored rather than imported because MerchantShop
 * pulls React + the content registry and this module must stay node-pure;
 * `roundReportLayout.test.ts` scans MerchantShop.tsx so the mirror cannot rot.
 */
export const SHOP_CARD_W_FRACTION = 0.45;
export const SHOP_CARD_W_MAX = 560;

export function shopCardWidthPx(vw: number): number {
  return Math.min(vw * SHOP_CARD_W_FRACTION, SHOP_CARD_W_MAX);
}

/**
 * The top edge below which an edge-docked card is clear of the top-right
 * column INCLUDING the ☰ that relocates there while the shop is docked left.
 */
export function rightColumnBottom(vp: HudViewport, touch: boolean): number {
  const menu = hudDisplacedRect("menu", vp, touch);
  return menu.y + menu.h + HUD_GAP;
}

/**
 * The right-column chrome that is REALLY painted during the intermission — the
 * obstacle set {@link avoidPainted} shrinks the card against.
 *
 * `minimap` is deliberately absent: its band is the one this module borrows,
 * and `roundReportLayout.test.ts` proves the borrow by reading Minimap.tsx.
 * Everything else in either right-hand corner is here, INCLUDING the ☰, which
 * relocates into the top-right column precisely because the shop is docked left.
 */
const PAINTED_RIGHT_SLOTS: readonly HudSlotId[] = [
  "leave",
  "scoreboard",
  "audio-toggle",
  "settings",
  "cheats",
  "gold-level",
  "equipment",
];

/** Below this a shrunken card is not worth painting; shrink the other axis. */
const MIN_USABLE_W = 160;
const MIN_USABLE_H = 60;

/**
 * The local champion's HP/MP bars (`ui/components/ResourceBars.tsx`) — centred,
 * `bottom: 128`, `width: 260`. NOT a `hudLayout` slot (it is centre chrome, like
 * the ability bar and Ready), so the corner machinery cannot see it; mirrored
 * here and source-scanned by `roundReportLayout.test.ts` so the mirror cannot
 * rot. It matters because the INSET dock lives in the same lower-centre strip:
 * caught live at 844×390 with the card sitting over the player's own HP bar.
 */
export const RESOURCE_BARS = { bottom: 128, width: 260, height: 44 } as const;

function resourceBarsRect(vp: HudViewport): HudRect {
  return {
    x: (vp.width - RESOURCE_BARS.width) / 2,
    y: vp.height - RESOURCE_BARS.bottom - RESOURCE_BARS.height,
    w: RESOURCE_BARS.width,
    h: RESOURCE_BARS.height,
  };
}

function paintedRightChrome(vp: HudViewport, touch: boolean): HudRect[] {
  const out = PAINTED_RIGHT_SLOTS.map((id) => hudSlotRect(id, vp, touch));
  out.push(hudDisplacedRect("menu", vp, touch)); // re-homed by the left dock
  out.push(resourceBarsRect(vp)); // centre-bottom, in the inset dock's strip
  return out;
}

/**
 * Shrink `rect` until it clears every painted piece of right-column chrome.
 *
 * WIDTH FIRST, HEIGHT SECOND, and that order is the point: a narrower card is
 * still a card, whereas a shorter one starts dropping coaching lines. Height
 * only gives way when pulling the right edge in would leave a sliver.
 *
 * This is the step that makes the two docks safe on viewports nobody measured
 * by hand — the guard runs it over the whole #107 viewport set and both pointer
 * kinds, so a slot moving in hudLayout re-shapes this card instead of colliding
 * with it.
 */
function avoidPainted(rect: HudRect, obstacles: readonly HudRect[]): HudRect {
  let out = { ...rect };
  for (const o of obstacles) {
    if (!hudRectsOverlap(out, o)) continue;
    const byWidth = o.x - HUD_GAP - out.x;
    const byHeight = o.y - HUD_GAP - out.y;
    if (byWidth >= MIN_USABLE_W) out = { ...out, w: byWidth };
    else if (byHeight >= MIN_USABLE_H) out = { ...out, h: byHeight };
    else out = { ...out, w: Math.max(0, byWidth), h: Math.max(0, byHeight) };
  }
  return out;
}

/**
 * The champion stands at ~67 % of the screen width
 * (render/intermission/layout.ts CHAMPION_STAND, and its header says so in as
 * many words). An EDGE-docked card must begin clear of him or this becomes the
 * mirror image of #94 —「你的商店說明頁剛好檔到角色」.
 */
export const CHAMPION_CLEARANCE_FRACTION = 0.68;

/** WHERE THE CARD PAINTS. Pure; the component only spreads `css`. */
export function roundReportPlacement(vp: HudViewport, touch: boolean): RoundReportPlacement {
  const width = clampWidth(vp.width);
  const obstacles = paintedRightChrome(vp, touch);

  // ── edge dock: the minimap's reserved band, free for the whole shop phase ──
  if (!touch) {
    const band = hudSlotBand(ROUND_REPORT_DOCK_SLOT, touch);
    const top = vp.height - band.end;
    const height = hudSlotHeight(ROUND_REPORT_DOCK_SLOT, touch);
    const x = vp.width - HUD_EDGE - width;
    // Two ways the edge dock is wrong and the inset one is not: on a SHORT
    // desktop window the hole rises into the top-right column, and on a NARROW
    // one an edge card would sit on the champion (or on the shop card itself).
    const clearsColumn = top >= rightColumnBottom(vp, touch);
    const clearsChampion =
      x > vp.width * CHAMPION_CLEARANCE_FRACTION &&
      x > shopCardWidthPx(vp.width) + HUD_GAP;
    if (clearsColumn && clearsChampion) {
      const rect = avoidPainted({ x, y: top, w: width, h: height }, obstacles);
      return {
        dock: "edge",
        density: rect.h >= ROUND_REPORT_EXPANDED_MIN_H ? "expanded" : "compact",
        visible: rect.w >= MIN_RENDER_W && rect.h >= MIN_RENDER_H,
        css: { top: rect.y, width: rect.w, maxHeight: rect.h, right: HUD_EDGE },
        rect,
      };
    }
  }

  // ── inset dock: right of the shop card, in the strip BELOW the centre stack ──
  const left = Math.round(shopCardWidthPx(vp.width)) + HUD_GAP * 2;
  // The centre column stacks upward from the bottom edge: HP/MP bars at
  // `bottom: 128`, Ready up at 190, the prep clock at 262. The bars are the
  // LOWEST of the three, so the only free horizontal strip is under THEM —
  // docking under Ready (the obvious choice, and the first thing tried) lands
  // straight on the player's own health bar, which is how a 844×390 playtest
  // screenshot caught it.
  const top = vp.height - RESOURCE_BARS.bottom + HUD_GAP;
  const maxHeight = Math.max(0, vp.height - top - (HUD_STAMP_BAND + HUD_GAP));
  // Never reach past the right edge. NO minimum is applied here on purpose: on
  // a 375 px-wide portrait viewport the strip beside the shop card is 180 px,
  // and a card that insisted on 200 would hang off the screen — a narrower card
  // is legible, an off-screen one is not.
  const insetWidth = Math.min(width, Math.max(0, vp.width - left - HUD_EDGE));
  const rect = avoidPainted({ x: left, y: top, w: insetWidth, h: maxHeight }, obstacles);
  return {
    dock: "inset",
    density: rect.h >= ROUND_REPORT_EXPANDED_MIN_H ? "expanded" : "compact",
    visible: rect.w >= MIN_RENDER_W && rect.h >= MIN_RENDER_H,
    css: { top: rect.y, width: rect.w, maxHeight: rect.h, left: rect.x },
    rect,
  };
}
