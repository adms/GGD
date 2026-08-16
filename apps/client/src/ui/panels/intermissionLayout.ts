/**
 * intermissionLayout — the intermission's ATTENTION contract (task #107, P2).
 *
 * THE BUG THIS EXISTS FOR (2026-07-24 實機試玩, P2)
 * ------------------------------------------------
 * 「SILVER AUGMENT 三選一卡片直接蓋住商人提示框；同時還有商店清單、備戰倒數
 * `0:13`、`Ready up`。四件事同時要注意力。」
 *
 * Two separate faults, and they need two separate fixes:
 *
 *   (a) GEOMETRY. `AugmentDraftPanel` pinned itself at `top: 90` while its row
 *       in the #107 registry (`hudLayout.HUD_PANELS`) declares `edge: "center"`
 *       — and `hudPanelRect()` resolves a centred panel to `(H − h) / 2`. The
 *       declaration and the pixels disagreed, so the guard was proving
 *       clearance for a rectangle the panel never actually occupied. At
 *       `top: 90` the card stack lands exactly on the merchant tip box's band
 *       (`top: 10%` ⇒ 72 px at 720p, 90 px at 900p) and covers it. Making the
 *       panel really centre — which is what its own registry row always said —
 *       moves it off that band BY CONSTRUCTION, on every viewport, and keeps
 *       the corner-clearance guard honest at the same time.
 *
 *   (b) PRIORITY. Geometry alone does not fix "four things at once": on a
 *       375 px-tall landscape phone there is no arrangement where a 三選一 card
 *       stack, a full-height shop card, a countdown and a Ready button all get
 *       to be equally loud. #107's rule is "every panel declares its edges";
 *       the missing half is that SOMEONE HAS TO BE FIRST. So this module
 *       declares a total order, below.
 *
 * THE PRIORITY ORDER (and why it is this order)
 * ---------------------------------------------
 *   1. FOCUS — a modal CHOICE on a deadline: the 三選一 draft. It is the only
 *      surface here that is (i) not reversible, (ii) not re-openable, and
 *      (iii) gone in a few seconds. Miss it and the round is played without an
 *      augment; there is no second chance and no undo. Everything else on this
 *      screen either persists for the whole prep window or can be re-opened at
 *      will. That asymmetry — irreversible + expiring — is what earns exclusive
 *      focus, not the fact that it is "newer" or "flashier".
 *
 *   2. DEADLINE — the prep countdown. It rides ABOVE the focus scrim, alone. A
 *      scrim that hides the clock would tell the player "answer this" while
 *      hiding the one number that says how long they have; and unlike every
 *      other surface it is `pointerEvents: none` informational chrome, so
 *      lifting it above the scrim costs the focus surface nothing.
 *
 *   3. PANEL — the shop. Browsing is voluntary, resumable and lossless: the
 *      card is still there, unchanged, the instant a card is picked. So while
 *      a focus surface is up the shop goes BEHIND the scrim and stops taking
 *      clicks. This is the owner's own framing — 「browsing the shop probably
 *      should not compete with it」 — and it is also why the shop is not merely
 *      dimmed: a dimmed-but-clickable card still invites the click.
 *
 *      Ready-up rides here too, deliberately. Readying with an unanswered offer
 *      throws the augment away, so a Ready button that stays live behind a
 *      draft is a trap of exactly the #130 family (an action that silently
 *      costs you something). It comes back the moment the draft resolves, and
 *      the prep clock ends the phase regardless — the player is never stuck.
 *
 *   4. AMBIENT — the merchant's rotating tip box and the hero's reaction
 *      bubble. Flavour and teaching, valuable but never urgent, and the only
 *      surfaces that lose nothing by waiting. Under a focus surface they FADE
 *      but DO NOT UNMOUNT: the tip rotation keeps its 5 s cadence and its
 *      "never an immediate repeat" history, so nothing resets and the box is
 *      mid-sentence-correct when it comes back.
 *
 *   ∞. PERSISTENT CHROME — the <body>-portaled audio cluster at
 *      {@link PERSISTENT_CHROME_Z}. #107's invariant: no persistent chrome may
 *      be covered. Every band here is far below it, so muting the game stays
 *      possible while a draft is open. Only a BLOCKING modal (`HUD_Z.modal`)
 *      may out-rank it, and the draft is not one — it is a choice inside a
 *      phase, not a screen.
 *
 * WHY A MODULE AND NOT FOUR z-INDEXES IN FOUR FILES: that is precisely how P2
 * happened. The four surfaces are rendered from three different React parents
 * (HudRoot, IntermissionStage's <body> portal, and the shop's own subtree), so
 * no container can own the stacking — the order has to be a shared DECLARATION,
 * exactly as `hudLayout` argues for the corner slots. Everything here is pure
 * and node-tested; the components only paint what they are told.
 *
 * CLOSED (was: "KNOWN GAP"): `MerchantShop` used to set no `zIndex` at all and
 * paint at the default positioned layer, while its registry row declared
 * `z: HUD_Z.screen`. That was not merely cosmetic — `hudSlotStyle()` gives every
 * managed corner slot a REAL `zIndex: HUD_Z.slot` (25), so the shop card was
 * genuinely painting UNDER the chrome it claims to cover. Nothing broke only
 * because every colliding slot answers `displaced: "hide"` and vanishes; the
 * #107 guard proves clearance of RECTANGLES and can never catch a paint-order
 * inversion. Both the shop and ready-up now declare {@link INTERMISSION_Z.panel}
 * (= `HUD_Z.screen`), so the declaration and the pixels are the same number.
 */
import { grailManifestPrompt } from "./fateLexicon";
import { HUD_Z } from "../hud/hudLayout";

/**
 * The <body>-portaled audio cluster's z (ui/AudioToggle.tsx `Z_TOP`). Mirrored,
 * not imported, because AudioToggle does not export it and is another task's
 * file; `intermissionLayout.test.ts` scans that source so the mirror cannot rot.
 */
export const PERSISTENT_CHROME_Z = 2147483000;

/**
 * The intermission's stacking bands. Everything is expressed against
 * `HUD_Z.focus` so the one number that matters lives in the #107 registry next
 * to the panel row that declares it.
 */
export const INTERMISSION_Z = {
  /** IntermissionStage's canvas portal: above #anchor-layer (5), below #hud-root (10). */
  stage: 7,
  /** dims everything a focus surface out-ranks, and swallows the clicks */
  focusScrim: HUD_Z.focus - 1,
  /** the modal CHOICE itself */
  focus: HUD_Z.focus,
  /** the countdown — the one thing allowed over the scrim (see priority 2) */
  deadline: HUD_Z.focus + 1,
  /**
   * PRIORITY 3 — the shop card (and its collapsed rail) plus ready-up. The one
   * number the #107 registry already declares for the shop row (`z:
   * HUD_Z.screen`), re-exported here so the two surfaces that share the band
   * read it from the same place. ABOVE `HUD_Z.slot` (25) / `expanded` (30), so
   * the card really does paint over the corner chrome its `covers` claims —
   * and BELOW `focusScrim`, so a draft still demotes it.
   */
  panel: HUD_Z.screen,
} as const;

/** The scrim's fill. Dark enough to demote, sheer enough to keep context legible. */
export const FOCUS_SCRIM_BG = "rgba(6, 9, 16, 0.62)";

/** Fade used both by the scrim and by the ambient surfaces yielding under it. */
export const FOCUS_FADE_MS = 200;

/**
 * The one line that turns "why did the shop go dark?" into "oh, pick one".
 * The whole P2 complaint is a player being asked four things at once with no
 * indication of what to do first; this says what to do first, and promises the
 * rest is coming back.
 *
 * ⭐ owner 2026-08-16（`docs/聖杯願望三選一-設計規則.md` §2）換成 Fate 語感。
 * ⚠️ **兩件事都要留著** —— 舊文案「先選一張 — 選完就能繼續逛商店」只講了
 * 「選完會怎樣」，而世界觀那一句只講「這是什麼」。P2 那個抱怨要的是**後者**，
 * ⛔ 所以不能只換成漂亮的一句就把「選完就能繼續逛商店」丟掉。
 */
/**
 * ⚠️ **函式不是常數。** 文案現在住在 `content/config/ui-lexicon.json`，而內容是
 * 開機後才載入的 —— 一個 `export const` 會在 import 那一刻定死成出貨值，
 * 於是後台改了完全沒反應，⛔ 而型別與測試都不會紅（失敗形態②）。
 */
export function focusHint(): string {
  return `${grailManifestPrompt()}（選完就能繼續逛商店）`;
}

/** Which surface owns the player's attention right now. */
export type IntermissionFocus = "draft" | "shop";

export interface IntermissionFocusInput {
  /** HUD store `phase` */
  phase: string;
  /** how many un-answered offers the local seat is holding */
  offerCount: number;
}

/** The phase the intermission surfaces belong to. */
export const INTERMISSION_PHASE = "intermission";

/**
 * PURE: who is first. An un-answered offer takes focus; otherwise the shop
 * (the intermission's default subject) has it.
 *
 * Gated on the phase as well as the offer so a stale offer cannot dim a screen
 * the intermission does not own — the draft panel and the scrim are mounted by
 * the same `phase === "intermission"` branch in HudRoot, and this keeps the
 * ambient surfaces (which live in a <body> portal, outside that branch) reading
 * from the same rule instead of from a second, drifting one.
 */
export function intermissionFocus(input: IntermissionFocusInput): IntermissionFocus {
  return input.phase === INTERMISSION_PHASE && input.offerCount > 0 ? "draft" : "shop";
}

/** What each band does under a given focus. */
export interface IntermissionSurfaces {
  /** the 三選一 panel + its scrim are painted */
  scrim: boolean;
  /** the shop card (and Ready) still take clicks */
  shopInteractive: boolean;
  /** ambient flavour (tips, reaction bubble) is faded out — NOT unmounted */
  ambientMuted: boolean;
}

/** PURE: the priority order, applied. One place, so no surface can disagree. */
export function intermissionSurfaces(focus: IntermissionFocus): IntermissionSurfaces {
  const drafting = focus === "draft";
  return { scrim: drafting, shopInteractive: !drafting, ambientMuted: drafting };
}

/**
 * THE AMBIENT BAND — where the merchant's tip box is allowed to paint.
 *
 * Declared here rather than inline in MerchantTipBox so the band that the
 * centred focus panel must clear is written down once, next to the panel that
 * has to clear it. Upper-centre: over the now-centred merchant, right of the
 * left-docked shop card (which is at most 45vw), and with room below for the
 * speech tail that points at him.
 */
export const AMBIENT_TIP_BAND = {
  /** fraction of viewport height to the box's top edge */
  top: 0.1,
  /** fraction of viewport width to the box's left edge */
  left: 0.46,
  /** px upper bound on the box's rendered height (icon 46 + padding + 2 lines) */
  maxHeight: 96,
  /** the box's own max width, as CSS */
  maxWidth: "min(38vw, 420px)",
} as const;

/** CSS for {@link AMBIENT_TIP_BAND}'s top/left, so the component types no percents. */
export const AMBIENT_TIP_TOP = `${AMBIENT_TIP_BAND.top * 100}%`;
export const AMBIENT_TIP_LEFT = `${AMBIENT_TIP_BAND.left * 100}%`;

/**
 * PURE: does a vertically-CENTRED panel of height `h` clear the tip band on a
 * viewport `h` px tall? This is the geometric half of fix (a) — the assertion
 * that centring is not just tidier but actually gets the draft off the tip box.
 *
 * Returns the px of gap (negative = overlap), so a failing test can say by how
 * much. On a 375 px-tall landscape phone a 250 px card stack cannot clear a
 * band starting at 37 px, which is exactly why the priority order (fix b) is
 * required as well and the tip box yields there.
 */
export function centredPanelClearsTipBand(viewportHeight: number, panelHeight: number): number {
  const bandBottom = viewportHeight * AMBIENT_TIP_BAND.top + AMBIENT_TIP_BAND.maxHeight;
  const panelTop = (viewportHeight - panelHeight) / 2;
  return panelTop - bandBottom;
}
