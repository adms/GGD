/**
 * client-27b (hud-surface-paint): the surfaces are really PAINTED where the
 * registry says, read off the rendered markup.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS — the #219 guard it replaces was vacuous
 * ─────────────────────────────────────────────────────────────────────────────
 * `hudSurfaces.test.ts` used to prove 「every managed surface's owner SPREADS
 * the registry's style」 by scanning the owner's SOURCE for the substring
 * `hudSurfaceStyle("<id>"`. That is failure shape ⑥ (「掃原始碼字串代替行為」)
 * and it was measured to be worthless on 2026-07-30:
 *
 *   KEEP the line `...hudSurfaceStyle("spectate-notice", rect),` and insert
 *     top: SPECTATE_NOTICE_TOP, left: "50%", transform: "translateX(-50%)",
 *   immediately after it. The banner is pinned back to y 106 — the owner's
 *   reported bug, byte for byte — and 34/34 tests stayed GREEN.
 *
 * A later key wins in a JS object literal, so the spread survives the scan
 * while contributing nothing. The only honest question is 「what coordinate did
 * the element END UP with?」, which is what this file asks: it renders each
 * shipped view through `react-dom/server` (this package's vitest runs
 * `environment: "node"`, so no DOM is needed), parses the root element's inline
 * style, and compares the FINAL `left` / `top` / `width` / `z-index` against
 * the rect the shipped resolver produced. Rule 5 of CLAUDE.md, applied to CSS:
 * assert on the final object, not on the ingredient.
 *
 * ⚠️ The mutation above MUST turn this file red. It was run: see the mutation
 * ledger in the #219 report (M1).
 *
 * THREE MORE THINGS THIS FILE PINS, each of which was dead or lying:
 *   · the COMPACT tier of the spectate banner — `const compact = false;` used
 *     to be a no-op across the whole 1894-test client suite, because no guard
 *     viewport ever produced a banner narrower than SPECTATE_COMPACT_W;
 *   · which of the 戰績變化 card's THREE modes a viewport really gets
 *     (side-by-side / overlay / in-card fallback), including the fact that the
 *     overlay really does cover the settlement card;
 *   · that the pill and the drawer are placed at all — both used to be
 *     unreachable from a test because they were local functions / inline JSX.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CORRECTED 2026-07-30 — THE FIRST VERSION OF THIS FILE WAS STILL SHAPE ⑤
 * ─────────────────────────────────────────────────────────────────────────────
 * It rendered the pure VIEWS (`SpectateNoticeView_`, `RoundOverPillView`,
 * `ScoreboardDrawer`) and the two components that take the resolved style as a
 * PROP (`RoundVictoryView`, `ProgressChartPanel`) — and nothing in the whole
 * tree rendered the components HudRoot actually mounts. Three one-line bypasses
 * were run against it and all three left the suite 100 % green:
 *
 *   B1  SpectateNotice.tsx, the hook wrapper:
 *         const rect = resolved ? { ...resolved, y: SPECTATE_NOTICE_TOP } : null;
 *       → the banner drops from y 158 back onto the 「Round over」 pill at y 106,
 *         which IS the owner's report ①, and 1906/1906 tests still passed.
 *   B2  MatchEndPanel.tsx: `surface={chartStyle}` → `surface={null}`
 *       → the 戰績變化 card falls back into the settlement card's `marginTop: 12`
 *         flow, i.e. below the fold — the owner's report ③, restored, green.
 *   B3  RoundVictoryPanel.tsx: `style={hudSurfaceStyle(…)}` → `style={undefined}`
 *
 * So the PAINT table below is now driven TWICE: once against the pure views
 * (§ the paint table) and once against the SHIPPED components (§ the shipped
 * mounts), the latter driven only through the stores HudRoot itself reads. Two
 * of the shipped surfaces are behind a click, and this package's vitest env is
 * `node`, so `Scoreboard` and `MatchEndPanel` grew an uncontrolled-component
 * `defaultOpen` / `defaultChartOpen` prop — documented at each declaration as
 * the seam that makes the shipped layer reachable at all.
 *
 * ⚠️ ALSO CORRECTED: the anti-displacement check used to be a BLACKLIST of five
 * property names (`transform` / `right` / `bottom` / `margin-top` /
 * `margin-left`). Two same-family properties walked straight through it, each
 * reproducing a real pre-#219 bug with the numeric assertions still passing:
 *   · `translate: -50% 0`   — the modern longhand of `transform: translateX(-50%)`,
 *     which is exactly what the centred banners used to do (box moves 210 px left);
 *   · `inset: 106px auto auto 50%` — a shorthand, and a later declaration in the
 *     same block beats the `left`/`top` the registry set.
 * `scale` / `rotate` / `inset-block-start` / … are the same family and a
 * blacklist can never be finished, so the check is now a CLOSED ALLOWLIST:
 * the root's declarations must be the registry's placement keys plus
 * {@link COSMETIC_PROPS}, and anything else is red until someone classifies it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CORRECTED AGAIN 2026-07-30 — THREE MORE HOLES, ALL THE SAME TWO SHAPES
 * ─────────────────────────────────────────────────────────────────────────────
 * Rendering the shipped components closed ⑤ for what those components DO. It
 * left two questions unasked, and each was measured green before being closed:
 *
 * ③ 「is it even mounted?」 — the shipped table renders each component DIRECTLY,
 *   so HudRoot's own JSX was only checked for the three `resolution` surfaces.
 *     M11  HudRoot `{phase === "matchEnd" && <MatchEndPanel />}` → `{false && …}`
 *          deletes the entire settlement screen. 378 files / 4517 tests GREEN.
 *     M12  HudRoot `{!couch && <Scoreboard />}` → `{false && …}`
 *          deletes owner report ②'s drawer outright. 1920 `src/ui` tests GREEN.
 *   Closed by {@link HUD_ROOT_MOUNTS}: a table CLOSED over the managed surfaces,
 *   one row per surface, each stating the phase HudRoot mounts it in and how the
 *   mount is proven (the painted rect, or — for the two behind a click a node
 *   env cannot perform — a marker only the owning component emits).
 *
 * ⑤ 「is the inline style the only way to the box?」 — no. Two of the owners ship
 *   a `<style>` element of their own, and a sheet outranks an inline
 *   declaration on demand:
 *     M13  appending `[data-hud-surface="spectate-notice"] { top: 106px
 *          !important }` to the banner's own keyframes block restores the
 *          owner's report ① with every numeric assertion above still passing.
 *          1920 `src/ui` tests GREEN.
 *   Closed the same way as the inline style — a closed allowlist, this time
 *   {@link STYLESHEET_PROPS} — plus a ban on the `class` attribute, which is the
 *   handle a sheet would need to reach a box it cannot name.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import { createMatchStats } from "@ggd/shared/sim/stats/matchStats";
import type { MatchSettlement } from "@ggd/shared/protocol/messages";
import {
  HUD_EDGE,
  HUD_GAP,
  hudRectsOverlap,
  hudSlotRect,
  type HudRect,
  type HudViewport,
} from "./hudLayout";
import {
  HUD_SURFACES,
  MATCH_END_CARD_MIN_W,
  MATCH_END_PAD,
  hudScenes,
  hudSurface,
  hudSurfaceRect,
  matchEndCardCap,
  matchEndCardWidth,
  matchEndReserveRight,
  hudSurfaceStyle,
  matchEndScene,
  panelsForPhase,
  progressChartSurfaceStyle,
  type HudPhase,
  type HudScene,
  type HudSurfaceId,
} from "./hudSurfaces";
import {
  SPECTATE_COMPACT_W,
  SPECTATE_NOTICE_TOP,
  SPECTATE_OFFER_TEXT,
  SPECTATE_OFFER_TEXT_SHORT,
  SpectateNotice,
  SpectateNoticeView_,
  spectateNotice,
} from "./SpectateNotice";
import { RoundOverPill, RoundOverPillView } from "./RoundOverPill";
import { Scoreboard, ScoreboardDrawer, type ScoreboardSeatRow } from "../components/Scoreboard";
import { RoundVictoryPanel, RoundVictoryView } from "../panels/RoundVictoryPanel";
import { MatchEndPanel } from "../panels/MatchEndPanel";
import { ProgressChartPanel } from "../panels/ProgressChartPanel";
import type { RoundVictoryModel } from "../panels/roundVictory";
import type { ProgressSeries } from "../panels/progressChart";
import { HudRoot } from "../HudRoot";
import { frameBus } from "../../frameBus";
import { hudStore, resetHudStore } from "../../net/RoomStore";

const scene = (phase: HudPhase, withPanels = false): HudScene => ({
  phase,
  panels: withPanels ? panelsForPhase(phase) : [],
});

/* ═══════════════════════════════════════════════════════════════════════════
 * READING A RENDERED STYLE BACK
 * ═══════════════════════════════════════════════════════════════════════════ */

/** One inline `style` attribute's contents, as a property → value map. */
function declarations(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of css.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    // LAST wins, exactly as CSS resolves it
    out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return out;
}

/**
 * The inline `style` declarations of the FIRST element in `html`.
 *
 * Deliberately the FIRST element and not a search for the surface's own
 * `data-` marker: for a PURE VIEW the root IS the box the registry placed, and
 * a component that moved the marker onto an inner wrapper while pinning the
 * outer one would be the same bug wearing a different hat. (The shipped-mount
 * table below cannot use this — HudRoot's components emit fragments and full
 * screen washes — so it uses {@link findSurface}, which asserts the ancestor
 * chain instead.)
 */
function rootStyle(html: string): Record<string, string> {
  const m = /^<[a-zA-Z][^>]*?\sstyle="([^"]*)"/.exec(html);
  if (!m) throw new Error(`no inline style on the root element of: ${html.slice(0, 160)}`);
  return declarations(m[1]!);
}

/** The raw attribute text of that same root element (for {@link markupProblems}). */
function rootAttrs(html: string): string {
  const m = /^<[a-zA-Z][\w-]*([^>]*)>/.exec(html);
  if (!m) throw new Error(`no root element in: ${html.slice(0, 160)}`);
  return m[1]!;
}

/** HTML elements that have no closing tag, so they must not enter the stack. */
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "source", "track", "wbr",
]);

/**
 * The element carrying `data-hud-surface="<id>"` in a SHIPPED component's
 * markup — its inline style, plus the tags that WRAP it.
 *
 * The ancestor list is asserted, not informational. Reading the marked element
 * instead of the render root is only safe while the marked element IS the
 * surface's own outermost box; a component that grew a positioned wrapper
 * around it would be the pre-#219 bug wearing a different hat, and the wrapper
 * shows up here as an extra tag in the chain.
 *
 * React escapes `<`, `>` and `"` inside attribute values, so a plain tag scan
 * cannot be fooled by an attribute that contains markup.
 */
function findSurface(
  html: string,
  id: string,
): { style: Record<string, string>; ancestors: string[]; attrs: string } {
  const stack: string[] = [];
  const tag = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
  for (let m = tag.exec(html); m !== null; m = tag.exec(html)) {
    const closing = m[1] === "/";
    const name = m[2]!;
    const attrs = m[3]!;
    if (closing) {
      stack.pop();
      continue;
    }
    if (attrs.includes(`data-hud-surface="${id}"`)) {
      const s = /\sstyle="([^"]*)"/.exec(attrs);
      if (!s) throw new Error(`the \`${id}\` surface root carries no inline style`);
      return { style: declarations(s[1]!), ancestors: [...stack], attrs };
    }
    if (!attrs.trimEnd().endsWith("/") && !VOID_TAGS.has(name)) stack.push(name);
  }
  throw new Error(`nothing in the rendered markup carries data-hud-surface="${id}"`);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE POSITIVE STYLE CONTRACT
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Exactly the declarations `hudSurfaceStyle` emits, as CSS property names.
 *
 * ⚠️ PRESENCE IS NOT THE CONTRACT — corrected 2026-07-30. `styleContractProblems`
 * only asserts that each of these EXISTS; the VALUES are compared by the two
 * paint tables, and until now they compared four of the five. `max-height` was
 * checked for presence alone, and that was measured to be a hole rather than a
 * nicety (mutation M14):
 *
 *   SpectateNotice.tsx, one line after the `hudSurfaceStyle` spread:
 *       maxHeight: 400,
 *   The registry proved the banner a 420×44 box at (430, 158) and the 評價 card
 *   a 340×340 box at (732, 210) — disjoint. The inflated plate spans y 158…558,
 *   so it covers the card from (732, 210) to (850, 550): owner report ①
 *   (「你的競技場已分出勝負 擋住結算評價」) restored, at the very viewport the
 *   shipped table renders. left/top/width/z-index all still matched, `max-height`
 *   was still present, and 21/21 tests stayed GREEN.
 *
 * A surface's rect has four sides and the collision sweep proved all four, so
 * all four are compared. `height` needs no separate rule — it is not on
 * {@link COSMETIC_PROPS}, so it is red on sight.
 */
const PLACEMENT_KEYS = ["position", "left", "top", "width", "max-height", "z-index"] as const;

/**
 * THE CLOSED ALLOWLIST — every other declaration a surface root may carry.
 *
 * ⚠️ This replaced a five-name BLACKLIST (`transform` / `right` / `bottom` /
 * `margin-top` / `margin-left`) that two same-family properties walked straight
 * through on 2026-07-30, each restoring a real pre-#219 bug with every numeric
 * assertion still passing: `translate: -50% 0` (the modern longhand of
 * `transform: translateX(-50%)`, which slides the box 210 px left) and
 * `inset: 106px auto auto 50%` (a shorthand; a later declaration in the same
 * block beats the registry's `left`/`top`). `scale`, `rotate`, `inset-inline-*`,
 * `margin-inline-*`, `translate` and whatever CSS ships next are all the same
 * family, so the enumeration has to run the OTHER way.
 *
 * The rule for adding a name here: it must be unable to move or resize the
 * OUTER box of an absolutely-positioned element whose `left`/`top`/`width` are
 * all declared. `padding` and `border` only qualify together with
 * `box-sizing: border-box`, which is why that pairing is checked separately.
 */
const COSMETIC_PROPS = new Set([
  // box model — safe only inside a border-box (asserted below)
  "box-sizing", "padding", "border", "border-radius",
  // paint
  "background", "box-shadow", "color", "opacity",
  // INNER layout: none of these touch the outer box of a fully-placed
  // absolutely-positioned element
  "display", "flex-direction", "align-items", "justify-content", "gap",
  "overflow-y", "text-align",
  // typography
  "font-size", "font-weight", "letter-spacing", "white-space",
  // hit testing
  "pointer-events",
]);

/**
 * THE SECOND CHANNEL INTO THE SAME BOX. Two of the surface owners ship a
 * `<style>` element of their own (`SpectateNotice`'s pulse keyframes,
 * `MatchEndPanel`'s row-highlight sheet), and a stylesheet beats an inline
 * declaration whenever it wants to — `!important` always, and outright for any
 * property the inline style never set. Measured 2026-07-30 (mutation M13):
 * appending
 *
 *   [data-hud-surface="spectate-notice"] { top: 106px !important }
 *
 * to the banner's own keyframes block put the banner back on the 「Round over」
 * pill — the owner's report ① byte for byte — with every inline assertion above
 * still passing and 140 files / 1920 `src/ui` tests green.
 *
 * So the sheets get the same treatment as the inline style: a CLOSED allowlist,
 * and this one is SMALLER than {@link COSMETIC_PROPS} on purpose. `padding` and
 * `border` are on that list only because the inline check pairs them with an
 * asserted `box-sizing: border-box`; arriving from a sheet they would carry no
 * such pairing, so they are not allowed here at all.
 *
 * `animation` is allowed, and it does not smuggle anything back in: a keyframe
 * step is itself a declaration block, so `@keyframes x { 0% { translate: … } }`
 * surfaces `translate` to this same check.
 */
const STYLESHEET_PROPS = new Set([
  "animation",
  "opacity",
  "box-shadow",
  "background",
  "background-color",
  "color",
  "border-radius",
]);

/** The innermost `{ … }` blocks of a stylesheet — i.e. its declaration blocks. */
function declarationBlocks(css: string): string[] {
  return [...css.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]!);
}

/**
 * THE SIBLING'S SHEET — the same door as {@link STYLESHEET_PROPS}, one component
 * over. {@link markupProblems} only ever sees the markup a surface's OWN owner
 * rendered, so a `<style>` element shipped by ANY OTHER child of HudRoot reaches
 * the box completely unobserved. Measured 2026-07-30 (mutation M18): moving the
 * M13 rule verbatim out of `SpectateNotice` and into `RoundOverPill`'s markup —
 *
 *   [data-hud-surface="spectate-notice"] { top: 106px !important }
 *
 * — put the banner back on the 「Round over」 pill (owner report ①) with 21/21
 * tests green, because the banner's own render carries no such sheet and the
 * pill's render carries no `spectate-notice` root.
 *
 * The check is deliberately SELECTOR-SCOPED rather than a blanket ban on
 * properties in HudRoot's sheets: a sibling's `@keyframes` legitimately animates
 * `transform`, and failing that would be a false red on work that never touches
 * a surface. What is NOT legitimate is any rule anywhere in the HUD tree that
 * NAMES a surface and then declares something off {@link STYLESHEET_PROPS} —
 * `data-hud-surface` is the only handle such a rule has, because the roots are
 * separately proven to carry no `class`.
 *
 * Returns the pairs `[selector, body]`; nested at-rules resolve to the inner
 * block, which is the one that carries the selector.
 */
function surfaceTargetedSheetProblems(html: string): string[] {
  const out: string[] = [];
  for (const sheet of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const rule of sheet[1]!.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      const selector = rule[1]!.trim();
      if (!selector.includes("data-hud-surface")) continue;
      for (const decl of rule[2]!.split(";")) {
        const i = decl.indexOf(":");
        if (i < 0) continue;
        const prop = decl.slice(0, i).trim().toLowerCase();
        if (prop === "" || STYLESHEET_PROPS.has(prop)) continue;
        out.push(
          `a <style> element somewhere in HudRoot's tree targets \`${selector}\` and ` +
            `declares \`${prop}\` — off STYLESHEET_PROPS. A sheet outranks the registry's ` +
            "inline placement and it does not have to live in the surface's own component, " +
            "so this is #219 coming back through the sibling's door.",
        );
      }
    }
  }
  return out;
}

/**
 * Everything the surface's own MARKUP can do to the box that its root's inline
 * `style` attribute does not show:
 *   · a `class`, which hands any stylesheet a handle on the box. Every surface
 *     is styled inline today, so the honest rule is that there is no class at
 *     all rather than a list of classes that are allowed to exist;
 *   · a `<style>` element, checked against {@link STYLESHEET_PROPS}.
 */
function markupProblems(id: string, html: string, attrs: string): string[] {
  const out: string[] = [];
  if (/\sclass="/.test(attrs)) {
    out.push(
      `${id}: the surface root carries a \`class\` attribute. Its placement is inline, ` +
        "so a class is a handle for a stylesheet to move the box with — style it inline " +
        "or classify the rule here.",
    );
  }
  for (const sheet of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const block of declarationBlocks(sheet[1]!)) {
      for (const decl of block.split(";")) {
        const i = decl.indexOf(":");
        if (i < 0) continue;
        const prop = decl.slice(0, i).trim().toLowerCase();
        if (prop === "" || STYLESHEET_PROPS.has(prop)) continue;
        out.push(
          `${id}: a <style> element rendered with this surface declares \`${prop}\`, ` +
            "which is not on STYLESHEET_PROPS. A sheet outranks the registry's inline " +
            "placement, so this is #219 coming back through the other door.",
        );
      }
    }
  }
  return out;
}

/**
 * The surface root's declarations must BE the registry's placement keys plus
 * {@link COSMETIC_PROPS} — no more, no less. Anything unclassified is red.
 */
function styleContractProblems(id: string, style: Record<string, string>): string[] {
  const out: string[] = [];
  for (const key of PLACEMENT_KEYS) {
    if (style[key] === undefined) {
      out.push(`${id}: the root is missing the registry's \`${key}\` entirely`);
    }
  }
  for (const key of Object.keys(style)) {
    if ((PLACEMENT_KEYS as readonly string[]).includes(key)) continue;
    if (COSMETIC_PROPS.has(key)) continue;
    out.push(
      `${id}: the root declares \`${key}: ${style[key]}\`, which is neither a ` +
        "registry placement key nor on the COSMETIC_PROPS allowlist. If it truly " +
        "cannot move or resize the box, add it there with that reasoning; if it " +
        "can, this is #219 coming back.",
    );
  }
  if (
    (style["padding"] !== undefined || style["border"] !== undefined) &&
    style["box-sizing"] !== "border-box"
  ) {
    out.push(
      `${id}: padding/border without \`box-sizing: border-box\` — the painted box ` +
        "is then wider and taller than the rectangle the collision guard proved clear",
    );
  }
  return out;
}

/** `"430px"` → 430; anything that is not a bare px length throws. */
function px(style: Record<string, string>, prop: string): number {
  const raw = style[prop];
  if (raw === undefined) throw new Error(`the root element has no \`${prop}\``);
  const m = /^(-?[\d.]+)px$/.exec(raw);
  if (!m) throw new Error(`\`${prop}: ${raw}\` is not a plain px offset`);
  return Number(m[1]);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE PAINT TABLE — one shipped view per managed surface
 * ═══════════════════════════════════════════════════════════════════════════ */

const VICTORY_MODEL: RoundVictoryModel = {
  state: "victory",
  round: 3,
  members: [],
  self: null,
  grade: null,
  advice: [],
  strengths: [],
  headline: "回合勝利",
  ledgerEntries: [],
};

const SEATS: ScoreboardSeatRow[] = [
  { seatId: 0, teamId: 0, displayName: "you", driver: "human", championId: "godie-ogrh", level: 4 },
  { seatId: 1, teamId: 1, displayName: "Bot 1", driver: "ai", championId: "godie-ucrl", level: 3 },
];

/** an empty settlement: the panel's own 「沒有逐回合紀錄」 branch, which needs no fixtures */
const EMPTY_SERIES: ProgressSeries = {
  rounds: [],
  rank: [],
  damage: [],
  mobKills: [],
  maxRank: 12,
};

/**
 * For every MANAGED surface: a scene it is up in, and the shipped view that
 * paints it. The scenes are chosen so the expected `top`/`left` are NOT numbers
 * any component could plausibly have hard-coded:
 *   · `spectate-notice` in RESOLUTION, where the stack pushes it to y 158 —
 *     in COMBAT the registry itself answers y 106, which is the old hard-coded
 *     value, so a combat-only assertion would pass for the broken build too
 *     (failure shape ④, and the previous guard's one render assertion was
 *     exactly that shape).
 */
const PAINT: Record<
  string,
  { vp: HudViewport; touch: boolean; scene: HudScene; render: (rect: HudRect) => string }
> = {
  "spectate-notice": {
    vp: { width: 1280, height: 720 },
    touch: false,
    scene: scene("resolution"),
    render: (rect) =>
      renderToStaticMarkup(
        createElement(SpectateNoticeView_, { view: spectateNotice(null, 1), rect }),
      ),
  },
  "round-over": {
    vp: { width: 1280, height: 720 },
    touch: false,
    scene: scene("resolution"),
    render: (rect) => renderToStaticMarkup(createElement(RoundOverPillView, { rect })),
  },
  "round-victory": {
    vp: { width: 1280, height: 720 },
    touch: false,
    scene: scene("resolution"),
    render: (rect) =>
      renderToStaticMarkup(
        createElement(RoundVictoryView, {
          model: VICTORY_MODEL,
          standings: [],
          localTeamId: 0,
          roundsSeen: 3,
          style: hudSurfaceStyle("round-victory", rect),
        }),
      ),
  },
  "scoreboard-list": {
    vp: { width: 1280, height: 720 },
    touch: false,
    scene: scene("combat"),
    render: (rect) =>
      renderToStaticMarkup(
        createElement(ScoreboardDrawer, {
          seats: SEATS,
          kills: { 0: 2 },
          deaths: { 1: 1 },
          localSeatId: 0,
          rect,
        }),
      ),
  },
  "progress-chart": {
    vp: { width: 1280, height: 720 },
    touch: false,
    scene: matchEndScene(),
    render: (rect) =>
      renderToStaticMarkup(
        createElement(ProgressChartPanel, {
          series: EMPTY_SERIES,
          advice: [],
          nameForSeat: (s: number) => `Seat ${s}`,
          onClose: () => {},
          surface: hudSurfaceStyle("progress-chart", rect),
        }),
      ),
  },
};

describe("HUD surfaces are painted where the registry says (client-27b)", () => {
  it("the PAINT table covers exactly the managed surfaces (no silent drift)", () => {
    cover("hud-panel-cover");
    const managed = HUD_SURFACES.filter((s) => s.managed)
      .map((s) => s.id)
      .sort();
    expect(Object.keys(PAINT).sort()).toEqual(managed);
  });

  it("GUARD: the rendered left/top/width/z-index ARE the resolver's rect", () => {
    cover("hud-panel-cover");
    const problems: string[] = [];
    for (const [id, spec] of Object.entries(PAINT)) {
      const rect = hudSurfaceRect(id as HudSurfaceId, spec.vp, spec.touch, spec.scene);
      if (!rect) {
        problems.push(`${id}: the resolver returned null in the scene the table picked`);
        continue;
      }
      const html = spec.render(rect);
      const style = rootStyle(html);
      const seen = {
        position: style["position"],
        left: px(style, "left"),
        top: px(style, "top"),
        width: px(style, "width"),
        // ⚠️ THE FOURTH SIDE. `max-height` was PRESENCE-checked only until
        // 2026-07-30, and presence is not the contract — see the note on
        // {@link PLACEMENT_KEYS}.
        maxHeight: px(style, "max-height"),
        zIndex: Number(style["z-index"]),
      };
      const want = {
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.w,
        maxHeight: rect.h,
        zIndex: hudSurface(id as HudSurfaceId).z,
      };
      if (JSON.stringify(seen) !== JSON.stringify(want)) {
        problems.push(`${id}: painted ${JSON.stringify(seen)} but the registry says ${JSON.stringify(want)}`);
      }
      // …and the numbers matching is not enough: `transform: translateX(-50%)`,
      // `translate: -50% 0` or an `inset` shorthand all move the box AFTER
      // layout while every assertion above still passes. See COSMETIC_PROPS.
      problems.push(...styleContractProblems(id, style));
      // …nor is the INLINE style the only way in: a `class` or a `<style>`
      // element in the same markup reaches the box without touching it. See
      // STYLESHEET_PROPS.
      problems.push(...markupProblems(id, html, rootAttrs(html)));
    }
    expect(problems).toEqual([]);
  });

  /**
   * NON-VACUITY of the assertion above. If every surface's resolved rect were
   * some round number a component could have typed by hand, the guard would
   * pass for a hard-coded build too. It is not: these are the measured values.
   */
  it("the expected coordinates are resolver output, not typeable constants", () => {
    cover("hud-panel-cover");
    const banner = hudSurfaceRect("spectate-notice", PAINT["spectate-notice"]!.vp, false, scene("resolution"))!;
    // 158 = TOP_CENTRE_BAND_END + gap + the 「Round over」 row + gap. The old
    // hard-coded number was 106, i.e. the COMBAT row.
    expect(banner.y).toBe(158);
    expect(hudSurfaceRect("spectate-notice", PAINT["spectate-notice"]!.vp, false, scene("combat"))!.y).toBe(106);
    // and the banner is not centred by CSS any more — it is centred by MATH,
    // inside the interval the 評價 card left it.
    expect(banner.x).toBe(430);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * THE SHIPPED MOUNTS — the components HudRoot really renders
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Everything above renders a PURE VIEW: the rect (or the resolved style) is
 * handed in by the test. That is one hop short of the truth, and the hop is
 * where all three measured bypasses lived — `SpectateNotice`'s hook wrapper,
 * `RoundVictoryPanel`'s `style=` prop and `MatchEndPanel`'s `surface=` prop are
 * each free to substitute something else on the way to the view, and no
 * assertion in the tree looked at them (failure shape ⑤).
 *
 * So this section drives the SHIPPED components — the exact JSX in HudRoot —
 * with nothing but the stores HudRoot itself reads:
 *   · `hudStore`  the match phase (and, for the settlement, the payload)
 *   · `frameBus`  the two camera numbers the spectate banner polls
 * and then reads the painted coordinates off the markup those components
 * produced, comparing against the registry exactly as the view table does.
 *
 * NO VIEWPORT IS INJECTED, on purpose. `useHudViewport` has no `window` in this
 * node env and falls back to 1280×800, so these renders go through the real
 * hook chain (`useHudSurface` → `useHudScene` → `useActiveHudPanels`) instead of
 * a viewport the test chose. That is also why the expected rect is recomputed
 * from the registry against the scene each case declares: if the LIVE scene ever
 * stops matching the declared one, the rects diverge and this goes red.
 */

/** What `useHudViewport` answers with no `window` (see useHudSurface.ts). */
const SSR_VP: HudViewport = { width: 1280, height: 800 };

function settlementFixture(): MatchSettlement {
  return {
    matchId: "m-shipped",
    winnerTeam: 0,
    perPlayer: [
      {
        seatId: 0,
        accountId: "acc-0",
        champ: "godie-ogrh",
        teamId: 0,
        role: "fighter",
        grade: "A",
        rank: 1,
        stats: createMatchStats(),
      },
      {
        seatId: 1,
        accountId: "acc-1",
        champ: "godie-ucrl",
        teamId: 1,
        role: "mage",
        grade: "B",
        rank: 2,
        stats: createMatchStats(),
      },
    ],
  };
}

interface ShippedCase {
  /** the line in HudRoot.tsx this case is standing in for */
  mount: string;
  /** the scene the store patch below puts the live HUD into */
  scene: HudScene;
  /** the tags that WRAP the surface root inside this component's own markup */
  ancestors: readonly string[];
  render: () => string;
}

const SHIPPED: Record<string, ShippedCase> = {
  "spectate-notice": {
    mount: "<SpectateNotice />",
    scene: scene("resolution"),
    ancestors: [],
    render: () => {
      hudStore.setState({ connected: true, phase: "resolution" });
      // the banner polls the camera's two published numbers; `offer` with no
      // `zone` is the OFFER state, i.e. 「你的競技場已分出勝負」.
      frameBus.spectateZone = null;
      frameBus.spectateOffer = 1;
      return renderToStaticMarkup(createElement(SpectateNotice));
    },
  },
  "round-over": {
    mount: "<RoundOverPill />",
    scene: scene("resolution"),
    ancestors: [],
    render: () => {
      hudStore.setState({ connected: true, phase: "resolution" });
      return renderToStaticMarkup(createElement(RoundOverPill));
    },
  },
  "round-victory": {
    mount: "<RoundVictoryPanel />",
    scene: scene("resolution"),
    ancestors: [],
    render: () => {
      hudStore.setState({ connected: true, phase: "resolution", round: 3 });
      return renderToStaticMarkup(createElement(RoundVictoryPanel));
    },
  },
  "scoreboard-list": {
    mount: "<Scoreboard />  (drawer open — see its `defaultOpen` seam)",
    scene: scene("combat"),
    ancestors: [],
    render: () => {
      hudStore.setState({ connected: true, phase: "combat" });
      return renderToStaticMarkup(createElement(Scoreboard, { defaultOpen: true }));
    },
  },
  "progress-chart": {
    mount: "<MatchEndPanel />  (chart open — see its `defaultChartOpen` seam)",
    // ⚠️ matchEndScene(), not the live scene: MatchEndPanel resolves the chart
    // through `progressChartSurfaceStyle`, which pins that scene so the card
    // width and the strip cannot be computed against two different worlds.
    scene: matchEndScene(),
    // the settlement's full-screen wash. `inset: 0` + `padding` make it the
    // containing block, and neither shifts an absolutely-placed child's
    // padding-box origin — so the chart's left/top stay viewport-absolute.
    ancestors: ["div"],
    render: () => {
      hudStore.setState({
        connected: true,
        phase: "matchEnd",
        localSeatId: 0,
        settlement: settlementFixture(),
      });
      return renderToStaticMarkup(createElement(MatchEndPanel, { defaultChartOpen: true }));
    },
  },
};

describe("the SHIPPED components paint where the registry says (client-27b)", () => {
  afterEach(() => {
    resetHudStore();
    frameBus.spectateZone = null;
    frameBus.spectateOffer = null;
  });

  it("the SSR viewport really is the hook's no-window fallback", () => {
    cover("hud-panel-cover");
    // If this ever gains a window the whole table below silently starts
    // resolving against a different viewport, so say it out loud.
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined");
  });

  it("every MANAGED surface has a shipped mount here (no silent drift)", () => {
    cover("hud-panel-cover");
    const managed = HUD_SURFACES.filter((s) => s.managed)
      .map((s) => s.id)
      .sort();
    expect(Object.keys(SHIPPED).sort()).toEqual(managed);
  });

  it("GUARD: HudRoot's own components paint the registry's rect, unmodified", () => {
    cover("hud-panel-cover");
    const problems: string[] = [];
    for (const [id, spec] of Object.entries(SHIPPED)) {
      const rect = hudSurfaceRect(id as HudSurfaceId, SSR_VP, false, spec.scene);
      if (!rect) {
        problems.push(`${id}: the resolver returned null for ${spec.mount}`);
        continue;
      }
      const html = spec.render();
      let found: { style: Record<string, string>; ancestors: string[]; attrs: string };
      try {
        found = findSurface(html, id);
      } catch (err) {
        // A missing surface root IS the failure: `surface={null}` sends the
        // 戰績變化 card back into the card's flow, `style={undefined}` strips
        // the 評價 card's placement — both land here rather than throwing.
        problems.push(`${id} (${spec.mount}): ${(err as Error).message}`);
        continue;
      }
      const seen = {
        position: found.style["position"],
        left: found.style["left"],
        top: found.style["top"],
        width: found.style["width"],
        maxHeight: found.style["max-height"],
        zIndex: found.style["z-index"],
      };
      const want = {
        position: "absolute",
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.w}px`,
        maxHeight: `${rect.h}px`,
        zIndex: String(hudSurface(id as HudSurfaceId).z),
      };
      if (JSON.stringify(seen) !== JSON.stringify(want)) {
        problems.push(
          `${id} (${spec.mount}): painted ${JSON.stringify(seen)} but the registry says ${JSON.stringify(want)}`,
        );
      }
      problems.push(...styleContractProblems(id, found.style));
      problems.push(...markupProblems(id, html, found.attrs));
      if (JSON.stringify(found.ancestors) !== JSON.stringify([...spec.ancestors])) {
        problems.push(
          `${id} (${spec.mount}): the surface root is now wrapped in ` +
            `${JSON.stringify(found.ancestors)}, declared ${JSON.stringify([...spec.ancestors])} — ` +
            "a new wrapper can pin the box while the marked element still reads clean",
        );
      }
    }
    expect(problems).toEqual([]);
  });

  /**
   * …and HudRoot really MOUNTS them. Everything above renders each component
   * DIRECTLY, so deleting `<SpectateNotice />` from HudRoot would leave the
   * whole table green while the banner vanished from the game — failure shape ③
   * (「可以從渲染樹刪掉但測試還是全綠」), one level above ⑤.
   *
   * ⚠️ CORRECTED 2026-07-30. This test used to cover the THREE `resolution`
   * surfaces only, and its own comment excused the other two with 「they need a
   * click and are covered by the table above through their `defaultOpen` /
   * `defaultChartOpen` seams」. That excuse was false in the way that matters:
   * the table above renders those components DIRECTLY, so it says nothing about
   * whether HudRoot mounts them. Both gaps were measured:
   *
   *   M11  HudRoot: `{phase === "matchEnd" && <MatchEndPanel />}` → `{false && …}`
   *        deletes the entire settlement screen (grade, ranking, 戰績變化 card,
   *        返回大廳). 378 files / 4517 client tests GREEN.
   *   M12  HudRoot: `{!couch && <Scoreboard />}` → `{false && …}`
   *        deletes the scoreboard button and with it the whole drawer — owner
   *        report ② made unreachable. 140 files / 1920 `src/ui` tests GREEN.
   *
   * So the table below is CLOSED over the managed surfaces and every row states
   * how the mount is proven:
   *   · `rect`  — HudRoot paints the surface itself in this phase, so the marked
   *               element must be in its markup at the registry's coordinates;
   *   · `mount` — the surface is behind a click and this package's vitest env is
   *               `node`, so HudRoot cannot open it. What HudRoot CAN be held to
   *               is that the OWNER is in the tree, proven by a marker only that
   *               component emits. Its placement is proven separately, by the
   *               SHIPPED table driving the same component through its
   *               `defaultOpen` / `defaultChartOpen` seam.
   */
  interface HudRootCase {
    /** the phase whose HudRoot branch carries the mount */
    phase: HudPhase;
    /** what that branch needs in the store beyond `connected` + `phase` */
    store?: Record<string, unknown>;
    proof: { kind: "rect" } | { kind: "mount"; marker: string; owner: string };
  }

  const HUD_ROOT_MOUNTS: Record<string, HudRootCase> = {
    "spectate-notice": { phase: "resolution", store: { round: 3 }, proof: { kind: "rect" } },
    "round-over": { phase: "resolution", store: { round: 3 }, proof: { kind: "rect" } },
    "round-victory": { phase: "resolution", store: { round: 3 }, proof: { kind: "rect" } },
    "scoreboard-list": {
      phase: "combat",
      proof: {
        kind: "mount",
        // the button that opens the drawer, in Scoreboard's own JSX
        marker: 'data-hud-slot="scoreboard"',
        owner: "{!couch && <Scoreboard />}",
      },
    },
    "progress-chart": {
      phase: "matchEnd",
      store: { localSeatId: 0, settlement: settlementFixture() },
      proof: {
        kind: "mount",
        // added to MatchEndPanel's wash for exactly this check — it had no
        // structural marker of its own at all
        marker: 'data-hud-mount="match-end"',
        owner: '{phase === "matchEnd" && <MatchEndPanel />}',
      },
    },
  };

  it("the HudRoot mount table covers exactly the managed surfaces (no silent drift)", () => {
    cover("hud-panel-cover");
    const managed = HUD_SURFACES.filter((s) => s.managed)
      .map((s) => s.id)
      .sort();
    expect(Object.keys(HUD_ROOT_MOUNTS).sort()).toEqual(managed);
  });

  it("HudRoot's own render tree mounts every managed surface's owner", () => {
    cover("hud-panel-cover");
    const problems: string[] = [];
    for (const [id, c] of Object.entries(HUD_ROOT_MOUNTS)) {
      resetHudStore();
      hudStore.setState({ connected: true, phase: c.phase, ...c.store });
      frameBus.spectateZone = null;
      frameBus.spectateOffer = 1;
      const html = renderToStaticMarkup(createElement(HudRoot));
      // …and no sheet ANYWHERE in the tree names a surface (the sibling's door).
      // Runs for every row, including the `mount`-proof ones, so all three phases
      // HudRoot is driven through here are swept.
      problems.push(...surfaceTargetedSheetProblems(html));

      if (c.proof.kind === "mount") {
        if (!html.includes(c.proof.marker)) {
          problems.push(
            `${id}: HudRoot's \`${c.phase}\` tree does not contain \`${c.proof.marker}\` — ` +
              `the \`${c.proof.owner}\` mount is gone, so the surface is unreachable in the ` +
              "game no matter how well the component itself places it",
          );
        }
        continue;
      }

      const rect = hudSurfaceRect(id as HudSurfaceId, SSR_VP, false, scene(c.phase));
      if (!rect) {
        problems.push(`${id}: the resolver returned null in HudRoot's own scene`);
        continue;
      }
      let found: { style: Record<string, string>; ancestors: string[]; attrs: string };
      try {
        found = findSurface(html, id);
      } catch {
        problems.push(
          `${id}: HudRoot's render tree does not contain it at all — the mount was deleted`,
        );
        continue;
      }
      const seen = [
        found.style["left"],
        found.style["top"],
        found.style["width"],
        found.style["max-height"],
      ].join(" ");
      const want = `${rect.x}px ${rect.y}px ${rect.w}px ${rect.h}px`;
      if (seen !== want) problems.push(`${id}: HudRoot painted ${seen}, registry says ${want}`);
      if (found.ancestors.length > 0) {
        problems.push(`${id}: wrapped in ${JSON.stringify(found.ancestors)} inside HudRoot`);
      }
      problems.push(...styleContractProblems(id, found.style));
    }
    expect(problems).toEqual([]);
  });

  /**
   * NON-VACUITY. The shipped table would be satisfied by a build that hard-codes
   * every coordinate if the coordinates happened to be the hard-coded ones. Two
   * of them are provably not:
   *   · the banner's y is 158 (the resolution row), and the number the component
   *     still exports for the COMBAT row — the one the pre-#219 build pinned,
   *     and the one bypass B1 pinned it back to — is 106;
   *   · the 戰績變化 card is ABSOLUTELY placed, which is the whole difference
   *     between the docked strip and the `marginTop: 12` in-card fallback that
   *     bypass B2 restored.
   */
  it("the shipped coordinates are the resolver's, not the numbers the bugs used", () => {
    cover("hud-panel-cover");
    const banner = hudSurfaceRect("spectate-notice", SSR_VP, false, scene("resolution"))!;
    expect(banner.y).toBe(158);
    expect(SPECTATE_NOTICE_TOP).toBe(106);
    expect(banner.y).not.toBe(SPECTATE_NOTICE_TOP);

    const chart = findSurface(SHIPPED["progress-chart"]!.render(), "progress-chart");
    expect(chart.style["position"]).toBe("absolute");
    expect(chart.style["margin-top"]).toBeUndefined();
  });

  /**
   * THE OTHER HALF OF owner ③, which the surface guard above cannot see: the
   * settlement layer has to GIVE BACK the strip the chart took, or the chart is
   * placed perfectly and still lands on top of the ranking table.
   *
   * That reservation is `paddingRight: reserveRight` on the settlement wash, and
   * it was NOT covered until now — the three-modes tests below recompute
   * `settlementCardRect` from `matchEndReserveRight()`, i.e. from the same pure
   * function the panel calls, so reverting the panel to a flat `MATCH_END_PAD`
   * left them all green (measured, mutation M9). This reads the number off the
   * RENDERED wash instead.
   */
  it("the settlement wash really reserves the strip (owner ③, card side)", () => {
    cover("hud-panel-cover");
    const wash = rootStyle(SHIPPED["progress-chart"]!.render());
    const reserve = matchEndReserveRight(SSR_VP, false, true);
    expect(wash["padding-right"]).toBe(`${reserve}px`);
    // …and the reservation is big enough: the settlement's content box must end
    // before the chart's left edge, or the "side-by-side" mode is a cover.
    const chart = hudSurfaceRect("progress-chart", SSR_VP, false, matchEndScene())!;
    expect(SSR_VP.width - reserve).toBeLessThanOrEqual(chart.x);
  });

  /**
   * ⚠️ KNOWN GAP, stated rather than papered over. The card's own
   * `width: cardWidth` cannot be guarded from a render, because the shipped
   * render can only be driven at the no-window viewport and THERE THE TWO
   * EXPRESSIONS ARE EQUAL: at 1280×800 the cap is min(760, 1228) = 760 and
   * `matchEndCardWidth` is min(760, 832 − 8 − 32) = 760, so replacing one with
   * the other is a literal no-op (mutation M10, measured green — an equivalent
   * mutant, not a miss). This test states the equality so that if the geometry
   * ever moves and they separate, someone has to come back and guard it.
   */
  it("KNOWN GAP: at the SSR viewport the card width and the cap coincide", () => {
    cover("hud-panel-cover");
    expect(matchEndCardWidth(SSR_VP, false, true)).toBe(matchEndCardCap(SSR_VP));
  });

  /**
   * …and the mounted components really rendered their CONTENT, not just a
   * correctly-placed empty box (failure shape ②: 「算出來了但沒送到畫面上」).
   */
  it("each shipped mount also paints what it exists to say", () => {
    cover("hud-panel-cover");
    expect(SHIPPED["spectate-notice"]!.render()).toContain(SPECTATE_OFFER_TEXT);
    expect(SHIPPED["round-over"]!.render()).toContain("Round over");
    expect(SHIPPED["round-victory"]!.render()).toContain("團隊累積積分");
    expect(SHIPPED["scoreboard-list"]!.render()).toContain('data-hud-surface="scoreboard-list"');
    expect(SHIPPED["progress-chart"]!.render()).toContain("每回合戰績變化");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * THE COMPACT TIER — reachable, and now guarded
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * MEASURED 2026-07-30 (`hudSurfaceRect("spectate-notice", …)`):
 *
 *   568×320 touch  combat  w = 316  → COMPACT   (iPhone SE / 5s landscape)
 *   480×320 touch  combat  w = 228  → COMPACT   (old 480-wide Android landscape)
 *   812×375 mouse  combat  w = 318  → COMPACT   (a hand-narrowed desktop window)
 *   1280×720       combat  w = 420  → full
 *
 * Before this file the tier was DEAD: replacing `const compact = rect.w <
 * SPECTATE_COMPACT_W` with `const compact = false` left the client's whole
 * `src/ui` suite (139 files / 1894 passing) byte-identical, because the
 * narrowest banner any guard viewport produced was 415 px.
 */
const COMPACT_CASES: ReadonlyArray<readonly [HudViewport, boolean, string]> = [
  [{ width: 568, height: 320 }, true, "iPhone SE landscape"],
  [{ width: 480, height: 320 }, true, "480-wide Android landscape"],
  [{ width: 812, height: 375 }, false, "narrowed desktop window"],
];

describe("the spectate banner's COMPACT tier (client-27b)", () => {
  it("a real narrow viewport renders the compact plate, not a clipped sentence", () => {
    cover("hud-panel-cover");
    for (const [vp, touch, name] of COMPACT_CASES) {
      const rect = hudSurfaceRect("spectate-notice", vp, touch, scene("combat"));
      expect(rect, `${name}: the banner must resolve here`).not.toBeNull();
      expect(rect!.w, `${name}: this case only means something while it is narrow`).toBeLessThan(
        SPECTATE_COMPACT_W,
      );
      const html = renderToStaticMarkup(
        createElement(SpectateNoticeView_, { view: spectateNotice(null, 1), rect: rect! }),
      );
      expect(html, name).toContain('data-spectate-tier="compact"');
      // the SHORT sentence, and no 「第 N 競技場」 chip — the two things the tier
      // drops so the button survives
      expect(html, name).toContain(SPECTATE_OFFER_TEXT_SHORT);
      expect(html, name).not.toContain(SPECTATE_OFFER_TEXT);
      expect(html, name).not.toContain("第 2 競技場");
      // …and the button, which is the whole reason the tier exists
      expect(html, name).toMatch(/<button[^>]*data-spectate-action="go"/);
    }
  });

  it("a desktop renders the FULL plate — the tier is a ladder, not a downgrade", () => {
    cover("hud-panel-cover");
    const rect = hudSurfaceRect("spectate-notice", { width: 1280, height: 720 }, false, scene("combat"))!;
    expect(rect.w).toBeGreaterThanOrEqual(SPECTATE_COMPACT_W);
    const html = renderToStaticMarkup(
      createElement(SpectateNoticeView_, { view: spectateNotice(null, 1), rect }),
    );
    expect(html).toContain('data-spectate-tier="full"');
    expect(html).toContain(SPECTATE_OFFER_TEXT);
    expect(html).toContain("第 2 競技場");
  });

  /**
   * The systemic half: over the SAME sweep the collision guard runs, the tier
   * the component renders must agree with the width the resolver handed it —
   * and both tiers must really occur, or this is a tautology over one branch.
   */
  it("across the whole guard sweep, the rendered tier tracks the resolved width", () => {
    cover("hud-panel-cover");
    const sweepVps: HudViewport[] = [
      { width: 480, height: 320 },
      { width: 568, height: 320 },
      { width: 667, height: 375 },
      { width: 780, height: 360 },
      { width: 812, height: 375 },
      { width: 852, height: 393 },
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
    ];
    let compactSeen = 0;
    let fullSeen = 0;
    const problems: string[] = [];
    for (const vp of sweepVps) {
      for (const touch of [false, true]) {
        for (const sc of hudScenes()) {
          const rect = hudSurfaceRect("spectate-notice", vp, touch, sc);
          if (!rect) continue;
          const html = renderToStaticMarkup(
            createElement(SpectateNoticeView_, { view: spectateNotice(null, 1), rect }),
          );
          const wantCompact = rect.w < SPECTATE_COMPACT_W;
          if (wantCompact) compactSeen++;
          else fullSeen++;
          const isCompact = html.includes('data-spectate-tier="compact"');
          if (isCompact !== wantCompact) {
            problems.push(
              `${vp.width}x${vp.height}${touch ? " touch" : ""} ${sc.phase}: w=${rect.w} rendered ${isCompact ? "compact" : "full"}`,
            );
          }
        }
      }
    }
    expect(problems).toEqual([]);
    // NON-VACUITY: the sweep really exercises both sides of the branch.
    expect(compactSeen, "no compact case in the sweep — the tier is untested again").toBeGreaterThan(0);
    expect(fullSeen).toBeGreaterThan(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * THE 戰績變化 CARD'S THREE MODES
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Where the settlement card really lands, given the layer's own padding. */
function settlementCardRect(vp: HudViewport, touch: boolean, chartOpen: boolean): HudRect {
  const w = matchEndCardWidth(vp, touch, chartOpen) ?? matchEndCardCap(vp);
  const reserve = matchEndReserveRight(vp, touch, chartOpen);
  const inner = vp.width - MATCH_END_PAD - reserve;
  return { x: MATCH_END_PAD + Math.max(0, (inner - w) / 2), y: 0, w, h: vp.height };
}

describe("the 戰績變化 card: three modes, all of them asserted (client-27b)", () => {
  it("SIDE-BY-SIDE on a desktop — the card shrinks and nothing overlaps", () => {
    cover("hud-panel-cover");
    const vp = { width: 1280, height: 720 };
    const style = progressChartSurfaceStyle(vp, false);
    expect(style).not.toBeNull();
    const card = matchEndCardWidth(vp, false, true);
    expect(card).not.toBeNull();
    expect(card!).toBeGreaterThanOrEqual(MATCH_END_CARD_MIN_W);
    const chart: HudRect = { x: style!.left, y: style!.top, w: style!.width, h: style!.maxHeight };
    expect(hudRectsOverlap(settlementCardRect(vp, false, true), chart)).toBe(false);
  });

  /**
   * OVERLAY on every landscape phone. ⚠️ This is asserted as a COVER, because
   * that is what it is — the previous doc on `MATCH_END_CARD_MIN_W` claimed the
   * chart 「falls back to its old in-card position」 below that width, which is
   * false in every shipping configuration. Measured at 812×375: the chart is
   * x 364…694 and the settlement card x 26…786, so 330 px of a 760 px card is
   * covered by an opaque, dismissable panel the player just asked for.
   */
  it("OVERLAY on a landscape phone — docked at the top, and it really covers the card", () => {
    cover("hud-panel-cover");
    const covered: string[] = [];
    for (const vp of [
      { width: 667, height: 375 },
      { width: 812, height: 375 },
      { width: 852, height: 393 },
      { width: 926, height: 428 },
    ]) {
      for (const touch of [true, false]) {
        const style = progressChartSurfaceStyle(vp, touch);
        expect(style, `${vp.width}x${vp.height}: a landscape phone HAS a docked strip`).not.toBeNull();
        // no side-by-side room here, so the card keeps its cap …
        expect(matchEndCardWidth(vp, touch, true)).toBeNull();
        expect(matchEndReserveRight(vp, touch, true)).toBe(MATCH_END_PAD);
        // … the chart is at the TOP of the screen (the reported bug was 「太低」)
        expect(style!.top).toBe(HUD_EDGE);
        const chart: HudRect = { x: style!.left, y: style!.top, w: style!.width, h: style!.maxHeight };
        if (hudRectsOverlap(settlementCardRect(vp, touch, true), chart)) {
          covered.push(`${vp.width}x${vp.height}${touch ? " touch" : ""}`);
        }
      }
    }
    // the overlap is DECLARED, not discovered: if a future change makes the two
    // fit side by side here, this list empties and the test says so.
    expect(covered.length, "the overlay mode is documented as a cover — see MATCH_END_CARD_MIN_W").toBe(8);
  });

  /**
   * The IN-CARD fallback, and proof it is not dead code. It is reached exactly
   * when there is no docked strip at all — measured boundary: 428 px wide.
   */
  it("IN-CARD fallback below 428px — and the panel really renders in flow there", () => {
    cover("hud-panel-cover");
    // portrait phones and hand-narrowed windows: no strip
    for (const vp of [
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 414, height: 896 },
      { width: 427, height: 800 },
    ]) {
      for (const touch of [true, false]) {
        expect(progressChartSurfaceStyle(vp, touch), `${vp.width}x${vp.height}`).toBeNull();
      }
    }
    // …and one pixel wider, there is one — so 428 is a real boundary, not a
    // number this test invented.
    expect(progressChartSurfaceStyle({ width: 428, height: 800 }, false)).not.toBeNull();

    // the shipped panel, driven with exactly what MatchEndPanel would pass it
    const html = renderToStaticMarkup(
      createElement(ProgressChartPanel, {
        series: EMPTY_SERIES,
        advice: [],
        nameForSeat: (s: number) => `Seat ${s}`,
        onClose: () => {},
        surface: progressChartSurfaceStyle({ width: 390, height: 844 }, true),
      }),
    );
    const style = rootStyle(html);
    expect(style["position"]).toBeUndefined(); // in FLOW, not absolutely placed
    expect(style["margin-top"]).toBe("12px");
    expect(style["max-height"]).toBe("min(56vh, 460px)");
  });

  /**
   * The boundary table documented on `MATCH_END_CARD_MIN_W` must not rot. Both
   * numbers were measured with a 1-px sweep across heights 320/375/720/800/1080
   * × touch/mouse and came out identical in all ten sweeps, because both depend
   * on horizontal geometry only (the 100 px audio column + the edges).
   */
  it("the documented mode boundaries are 428 and 948, on every height and pointer", () => {
    cover("hud-panel-cover");
    const wrong: string[] = [];
    for (const height of [320, 375, 720, 800, 1080]) {
      for (const touch of [false, true]) {
        const strip = (w: number): boolean => progressChartSurfaceStyle({ width: w, height }, touch) !== null;
        const side = (w: number): boolean =>
          strip(w) && matchEndCardWidth({ width: w, height }, touch, true) !== null;
        const tag = `${height}${touch ? " touch" : ""}`;
        if (strip(427) || !strip(428)) wrong.push(`${tag}: strip boundary is not 428`);
        if (side(947) || !side(948)) wrong.push(`${tag}: side-by-side boundary is not 948`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("the docked mode really replaces that fallback (no marginTop left behind)", () => {
    cover("hud-panel-cover");
    const html = renderToStaticMarkup(
      createElement(ProgressChartPanel, {
        series: EMPTY_SERIES,
        advice: [],
        nameForSeat: (s: number) => `Seat ${s}`,
        onClose: () => {},
        surface: progressChartSurfaceStyle({ width: 1280, height: 720 }, false),
      }),
    );
    const style = rootStyle(html);
    expect(style["position"]).toBe("absolute");
    expect(style["margin-top"]).toBeUndefined();
    expect(px(style, "left")).toBe(
      hudSurfaceRect("progress-chart", { width: 1280, height: 720 }, false, matchEndScene())!.x,
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * the scoreboard drawer, painted (owner report ②)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("the scoreboard drawer opens INWARD, in pixels (client-27b)", () => {
  it("its painted right edge stops short of the portal-ed audio column", () => {
    cover("hud-panel-cover");
    const vp = { width: 1280, height: 720 };
    const rect = hudSurfaceRect("scoreboard-list", vp, false, scene("combat"))!;
    const style = rootStyle(
      renderToStaticMarkup(
        createElement(ScoreboardDrawer, {
          seats: SEATS,
          kills: {},
          deaths: {},
          localSeatId: 0,
          rect,
        }),
      ),
    );
    const right = px(style, "left") + px(style, "width");
    // owner report ②, in PIXELS: the drawer's painted right edge clears the
    // `portal: true` audio cluster with a gap to spare. (The `far` term that
    // makes this structural rather than incidental is separately proven by the
    // lane guard in hudSurfaces.test.ts — at this rung the free-interval sweep
    // is what binds, so deleting `far` alone is invisible from here.)
    const audio = hudSlotRect("audio-toggle", vp, false);
    expect(right).toBeLessThanOrEqual(audio.x - HUD_GAP);
    expect(right).toBeLessThanOrEqual(vp.width - HUD_EDGE - HUD_GAP);
    // and the rows really rendered (a drawer placed perfectly but empty is ②)
    const html = renderToStaticMarkup(
      createElement(ScoreboardDrawer, {
        seats: SEATS,
        kills: { 0: 2 },
        deaths: { 1: 1 },
        localSeatId: 0,
        rect,
      }),
    );
    expect(html).toContain("2/0");
    expect(html).toContain("Bot 1 (AI)");
  });
});

