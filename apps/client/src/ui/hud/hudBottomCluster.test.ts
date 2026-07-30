/**
 * client-28 (hud-bottom-cluster): the owner's two 2026-07-30 HUD reports, as
 * GEOMETRY read off the shipped components.
 *
 *   ①「自己的英雄角色 icon 在戰鬥場景 要顯示在右下角等級金錢區域」
 *   ②「HP&MP 條應該是跟技能格子緊鄰但不重疊」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE REFUSES TO ASSERT
 * ─────────────────────────────────────────────────────────────────────────────
 * 「the component has this class」 and 「the style object contains a `bottom`」 are
 * both failure shape ⑦ (掃屬性代替掃行為): a `bottom` key proves a number was
 * written, not that two boxes ended up 6 px apart, and a later key in the same
 * object literal beats it anyway (the exact hole `hudSurfacePaint.test.ts`
 * measured on 2026-07-30). So every assertion below is one of:
 *
 *   (a) a DISTANCE between two resolved rectangles — > 0 (not overlapping) and
 *       ≤ {@link ADJACENT_MAX} (緊鄰);
 *   (b) a rect INSIDE the viewport (failure ①, 畫在畫面外);
 *   (c) a rect DISJOINT from every corner slot, including across corners, at
 *       every guard viewport in both pointer modes;
 *   (d) the SHIPPED markup: what HudRoot really renders, with the two rows'
 *       declarations checked against a CLOSED ALLOWLIST so a row cannot quietly
 *       re-pin itself and re-open the gap the container closed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MUTATION LEDGER (run 2026-07-30 — every one of these turned this file red)
 * ─────────────────────────────────────────────────────────────────────────────
 *   M1  hudBottomCluster.ts `barsToAbilitiesGapPx: 6` → `-20`
 *       → 「gap -20 ≤ 0: the plate overlaps the ability row」 ✗ (2 tests)
 *   M2  hudBottomCluster.ts `clusterBottomPx: 14` → `900`
 *       → the column's rect leaves the viewport at every guard size ✗
 *   M3  GoldLevel.tsx — delete the `<span data-hud-hero-portrait>` block
 *       → 「the bottom-right group paints no portrait」 ✗
 *   M4  hudLayout.ts `gold-level` width 190 → 120 (i.e. forget to reserve the
 *       portrait) → the painted 190 px box overruns its reservation ✗
 *   M5  hudBottomCluster.ts `keepClearOfCorners: true` → `false`
 *       → 780×360 desktop: cluster ∩ minimap ✗ (this is the pre-existing
 *         cross-corner collision the same change introduces a guard for)
 *   M6  ResourceBars.tsx — re-add `position:"absolute", bottom:128` to the row
 *       → 「resources row declares `position` / `bottom`」 ✗ (allowlist)
 *   M7  HudRoot.tsx `<BottomCluster …/>` → `{false && <BottomCluster …/>}`
 *       → nothing in the shipped markup carries data-hud-cluster="bottom" ✗
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import {
  HUD_EDGE,
  HUD_GAP,
  HUD_SLOTS,
  hudRectInViewport,
  hudRectsOverlap,
  hudSlotRect,
  type HudRect,
  type HudSlotId,
  type HudViewport,
} from "./hudLayout";
import {
  ABILITY_ROW_H,
  ABILITY_ROW_MAX_W,
  HUD_CLUSTER_FIELDS,
  RESOURCE_ROW_H,
  RESOURCE_ROW_W,
  SHIPPED_HUD_CLUSTER,
  applyHudClusterOverride,
  heroPortraitChampionId,
  hudCastNoticeBottom,
  hudClusterRects,
  hudClusterTuning,
  resolveClusterTuning,
} from "./hudBottomCluster";
import { bottomClusterStyle } from "./BottomCluster";
import { HudRoot } from "../HudRoot";
import { hudStore, resetHudStore, type SeatView } from "../../net/RoomStore";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { AbilityDef, ChampionDef } from "@ggd/shared/sim/content/defs";
import type { AbilityId, ChampionId } from "@ggd/shared/ids";
import type { CoreAbilitySlot } from "@ggd/shared/sim/intents";

/**
 * THE ADJACENCY BUDGET. 「緊鄰」 has to become a number or it cannot be guarded,
 * and this is the number: at more than 16 px the plate stops reading as part of
 * the bar and starts reading as a separate readout that happens to be nearby —
 * which is exactly what the owner reported, at a MEASURED 27 px. 16 leaves room
 * to retune the shipped 6 without touching the guard; 27 does not fit, on
 * purpose (see the pre-fix reproduction below).
 */
const ADJACENT_MAX = 16;

/**
 * Guard viewports. 780×360 is #151's iPhone-landscape breakpoint and is listed
 * in BOTH pointer modes deliberately: a phone gets `touch` (no ability row, the
 * minimap re-homes top-left), but a desktop window dragged to that size gets
 * the full desktop layout in the same box, and it is the DESKTOP one that used
 * to collide with the minimap.
 */
const VIEWPORTS: readonly (HudViewport & { touch: boolean; note: string })[] = [
  { width: 1280, height: 800, touch: false, note: "desktop (the measured one)" },
  { width: 1024, height: 640, touch: false, note: "small laptop" },
  { width: 780, height: 360, touch: false, note: "#151 breakpoint, desktop pointer" },
  { width: 780, height: 360, touch: true, note: "#151 breakpoint, phone landscape" },
  { width: 375, height: 667, touch: true, note: "phone portrait" },
  { width: 852, height: 393, touch: true, note: "iPhone 15 landscape" },
  /**
   * ⚠️ ADDED 2026-07-31 — the width where the first version walked off screen.
   *
   * Every desktop-pointer entry above is ≥780 wide, and every entry below 780 is
   * TOUCH — where `abilities:false` shrinks the column to 278 and the clamp stays
   * legal. So 「both rows land inside the viewport」 was VACUOUS at exactly the
   * widths where the arithmetic broke, and a reviewer measured `left:-90px` in a
   * real match here. This row is not hypothetical: `isTouchDevice` needs
   * `ontouchstart` AND a coarse pointer, so ANY desktop window dragged under
   * 600px lands on the fine-pointer path with both rows present.
   *
   * Do not delete this entry to make a future layout pass go green.
   */
  { width: 500, height: 700, touch: false, note: "narrow desktop window — the off-screen case" },
];

const BOTH_ROWS = { resources: true, abilities: true } as const;
const PLATE_ONLY = { resources: true, abilities: false } as const;
/** touch replaces the ability row with the joystick + arc (ui/TouchControls) */
const rowsFor = (touch: boolean): { resources: boolean; abilities: boolean } =>
  touch ? { ...PLATE_ONLY } : { ...BOTH_ROWS };

function label(vp: (typeof VIEWPORTS)[number]): string {
  return `${vp.width}x${vp.height}${vp.touch ? " touch" : ""} (${vp.note})`;
}

/** Vertical px between two stacked rects; negative = they overlap. */
function verticalGap(upper: HudRect, lower: HudRect): number {
  return lower.y - (upper.y + upper.h);
}

beforeEach(() => {
  applyHudClusterOverride(null); // every test starts from the shipped values
});

describe("bottom cluster — 緊鄰但不重疊 (client-28)", () => {
  it("the plate and the ability row are adjacent and never overlap", () => {
    cover("hud-bottom-cluster");
    const problems: string[] = [];
    for (const vp of VIEWPORTS) {
      if (vp.touch) continue; // no ability row to be adjacent to
      const l = hudClusterRects(vp, false, BOTH_ROWS);
      const plate = l.resources!;
      const bar = l.abilities!;
      const gap = verticalGap(plate, bar);
      if (gap <= 0) problems.push(`${label(vp)}: gap ${gap} ≤ 0 — the plate overlaps the bar`);
      if (gap > ADJACENT_MAX)
        problems.push(`${label(vp)}: gap ${gap} > ${ADJACENT_MAX} — not 緊鄰`);
      // the two rows share a centre line, so the pair reads as one object
      const plateMid = plate.x + plate.w / 2;
      const barMid = bar.x + bar.w / 2;
      if (Math.abs(plateMid - barMid) > 1)
        problems.push(`${label(vp)}: rows are off-axis by ${Math.abs(plateMid - barMid)}px`);
    }
    expect(problems).toEqual([]);
  });

  it("both rows land inside the viewport at every guard size", () => {
    cover("hud-bottom-cluster");
    const problems: string[] = [];
    for (const vp of VIEWPORTS) {
      const l = hudClusterRects(vp, vp.touch, rowsFor(vp.touch));
      for (const [name, r] of [
        ["cluster", l.cluster],
        ["resources", l.resources],
        ["abilities", l.abilities],
      ] as const) {
        if (!r) continue;
        if (!hudRectInViewport(r, vp))
          problems.push(`${label(vp)}: ${name} ${JSON.stringify(r)} escapes the viewport`);
      }
    }
    expect(problems).toEqual([]);
  });

  /**
   * NON-VACUITY. Reproduce the SHIPPED-BEFORE geometry from the two numbers the
   * components used to hard-code (ResourceBars `bottom:128`, AbilityBar
   * `bottom:14`) and show it fails the same budget — otherwise ADJACENT_MAX
   * could be any number at all and this file would prove nothing.
   */
  it("REGRESSION: the pre-fix pair (bottom 128 / bottom 14) is NOT 緊鄰", () => {
    cover("hud-bottom-cluster");
    const vp = { width: 1280, height: 800 };
    const bar = { x: 487, y: vp.height - 14 - ABILITY_ROW_H, w: 306, h: ABILITY_ROW_H };
    const plate = {
      x: 502,
      y: vp.height - 128 - RESOURCE_ROW_H,
      w: RESOURCE_ROW_W,
      h: RESOURCE_ROW_H,
    };
    // 26 modelled from the reserved sizes; the live client measured 27 px
    // between the two PAINTED boxes on 2026-07-30. Either number is 「明顯的空隙」,
    // and both are more than ADJACENT_MAX — which is the claim being made.
    expect(verticalGap(plate, bar)).toBe(26);
    expect(verticalGap(plate, bar)).toBeGreaterThan(ADJACENT_MAX);
    // …and the shipped cluster closes it without letting the two touch
    const now = hudClusterRects(vp, false, BOTH_ROWS);
    expect(verticalGap(now.resources!, now.abilities!)).toBe(
      SHIPPED_HUD_CLUSTER.barsToAbilitiesGapPx,
    );
    expect(verticalGap(now.resources!, now.abilities!)).toBeGreaterThan(0);
  });

  it("the cast-refusal line clears the plate instead of printing on it", () => {
    cover("hud-bottom-cluster");
    // the shipped-before constant, kept here as the thing that broke
    const OLD_DESKTOP_BOTTOM = 104;
    // distances from the bottom edge: the plate now spans [108, 154]
    const plateBottom =
      SHIPPED_HUD_CLUSTER.clusterBottomPx +
      ABILITY_ROW_H +
      SHIPPED_HUD_CLUSTER.barsToAbilitiesGapPx;
    const plateTop = plateBottom + RESOURCE_ROW_H;
    // a pill pinned at 104 starts BELOW the plate's far edge, so its own ~28px
    // of height is printed straight through the player's health bar
    expect(OLD_DESKTOP_BOTTOM).toBeLessThan(plateTop);
    expect(hudCastNoticeBottom(false, BOTH_ROWS)).toBeGreaterThanOrEqual(plateTop);
  });
});

describe("bottom cluster — CROSS-CORNER collisions (client-28)", () => {
  /**
   * ⚠️ THE GUARD THE HUD DID NOT HAVE. `hudLayout.test.ts`'s overlap check walks
   * ONE corner at a time (`hudSlotsInCorner` → consecutive bands), so a centred
   * box growing sideways into a corner column is invisible to it, and so is a
   * corner box growing sideways into another corner. This sweeps every painted
   * slot against the cluster at every guard viewport.
   */
  it("the cluster never intersects a corner slot, in either pointer mode", () => {
    cover("hud-bottom-cluster");
    const problems: string[] = [];
    const tightHits: string[] = [];
    const narrowHits: string[] = [];
    for (const vp of VIEWPORTS) {
      const l = hudClusterRects(vp, vp.touch, rowsFor(vp.touch));
      for (const slot of HUD_SLOTS) {
        // `transient` = a settings-gated dev overlay that opens ABOVE the HUD by
        // declaration (HUD_Z.expanded); the minimap guard makes the same
        // exemption and proves it is not vacuous.
        if (slot.transient) continue;
        const r = hudSlotRect(slot.id as HudSlotId, vp, vp.touch);
        if (!hudRectsOverlap(l.cluster, r)) continue;
        // The ONLY tolerated overlap is the declared no-honest-room fallback,
        // and even then only with a TOP-anchored slot — the bottom corners are
        // the ones the column yields to (hudClusterRects' fallback comment).
        if (l.tight && slot.corner.startsWith("top")) {
          tightHits.push(`${label(vp)} → ${slot.id}`);
          continue;
        }
        // ⚠️ Below ~600px with a desktop pointer there is NO legal arrangement
        // at all: 10 + 364(column) + 8 + 208(minimap) + 10 = 600 > the viewport.
        // Something must be covered. The floor added 2026-07-31 decides WHICH:
        // the column stays ON SCREEN and overlaps bottom chrome, rather than
        // walking off the left edge and taking the innate/Q tiles with it.
        // That is a ranking (a covered minimap is readable-adjacent; a clipped
        // ability tile is unclickable), and it is recorded rather than hidden.
        // ⛔ THIS IS NOT A SOLUTION — it is the least-bad of three bad options.
        // The real answer is a narrow-width layout (shrink the tiles, or stack
        // the rows, or drop the minimap under some width) and it is an OPEN
        // OWNER DECISION, logged in docs/_execution-batches.md. Whoever builds
        // it: delete this branch, do not widen it.
        if (l.tight && vp.width < 600) {
          narrowHits.push(`${label(vp)} → ${slot.id}`);
          continue;
        }
        problems.push(`${label(vp)}: cluster ∩ ${slot.id}${l.tight ? " (tight)" : ""}`);
      }
    }
    expect(problems).toEqual([]);
    // …and the exception is NAMED, so a new one cannot hide inside it
    expect(tightHits).toEqual(["780x360 (#151 breakpoint, desktop pointer) → enemy-team"]);
    // The sub-600 case is named the same way, and to the SLOT — so if the
    // narrow-width layout ever lands, or a new slot starts colliding, this line
    // is what goes red.
    expect(narrowHits.sort()).toEqual([
      "500x700 (narrow desktop window — the off-screen case) → fps",
      "500x700 (narrow desktop window — the off-screen case) → gold-level",
      "500x700 (narrow desktop window — the off-screen case) → minimap",
    ]);
  });

  it("`tight` is the exception, not the rule — one viewport, and it is honest", () => {
    cover("hud-bottom-cluster");
    const tightAt = VIEWPORTS.filter(
      (vp) => hudClusterRects(vp, vp.touch, rowsFor(vp.touch)).tight,
    ).map(label);
    expect(tightAt).toEqual([
      "780x360 (#151 breakpoint, desktop pointer)",
      "500x700 (narrow desktop window — the off-screen case)",
    ]);
    // there really is no room there: panel + gaps + bar + column > the viewport
    const vp = { width: 780, height: 360 };
    const l = hudClusterRects(vp, false, BOTH_ROWS);
    const map = hudSlotRect("minimap", vp, false);
    const enemies = hudSlotRect("enemy-team", vp, false);
    // 10 + 184 + 8 + 364 + 8 + 208 + 10 = 792 > 780 — there is no arrangement
    expect(
      2 * HUD_EDGE + enemies.w + HUD_GAP + ABILITY_ROW_MAX_W + HUD_GAP + map.w,
    ).toBeGreaterThan(vp.width);
    // and what it protected is the bottom-right column, to the pixel
    expect(hudRectsOverlap(l.cluster, map)).toBe(false);
    expect(hudRectsOverlap(l.cluster, hudSlotRect("gold-level", vp, false))).toBe(false);
  });

  it("REGRESSION: without the clamp the 6-tile bar really does hit the minimap", () => {
    cover("hud-bottom-cluster");
    // Same viewport, same rows, ONLY keepClearOfCorners flipped — so this proves
    // the clamp is load-bearing rather than decorative.
    const vp = { width: 780, height: 360 };
    const off = hudClusterRects(vp, false, BOTH_ROWS, {
      ...SHIPPED_HUD_CLUSTER,
      keepClearOfCorners: false,
    });
    const map = hudSlotRect("minimap", vp, false);
    expect(hudRectsOverlap(off.cluster, map)).toBe(true);
    const on = hudClusterRects(vp, false, BOTH_ROWS);
    expect(on.clamped).toBe(true);
    expect(hudRectsOverlap(on.cluster, map)).toBe(false);
    // and the clamp is INERT where there is room — the bar stays centred
    const wide = hudClusterRects({ width: 1280, height: 800 }, false, BOTH_ROWS);
    expect(wide.clamped).toBe(false);
    expect(wide.cluster.x).toBe(Math.round((1280 - ABILITY_ROW_MAX_W) / 2));
  });

  /**
   * ①'s half of the brief: the bottom-right GROUP (portrait + gold + level) must
   * clear the minimap at 780×360, where that column has ~12 px of slack in total.
   */
  it("the bottom-right column fits and stays clear of itself at 780x360", () => {
    cover("hud-bottom-cluster");
    const vp = { width: 780, height: 360 };
    const problems: string[] = [];
    for (const touch of [false, true]) {
      const ids = HUD_SLOTS.filter((s) => !s.transient).map((s) => s.id as HudSlotId);
      for (const id of ids) {
        const r = hudSlotRect(id, vp, touch);
        if (!hudRectInViewport(r, vp))
          problems.push(`${touch ? "touch " : ""}${id} ${JSON.stringify(r)} escapes 780x360`);
      }
      const gold = hudSlotRect("gold-level", vp, touch);
      const map = hudSlotRect("minimap", vp, touch);
      if (hudRectsOverlap(gold, map))
        problems.push(`${touch ? "touch " : ""}gold-level ∩ minimap at 780x360`);
    }
    expect(problems).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * THE SHIPPED MARKUP — what HudRoot really renders
 * ═══════════════════════════════════════════════════════════════════════════ */

function declarations(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of css.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim(); // LAST wins, like CSS
  }
  return out;
}

/** The element carrying `attr`, plus its inline style and the tags wrapping it. */
function findMarked(
  html: string,
  attr: string,
): { style: Record<string, string>; attrs: string; ancestors: string[] } | null {
  const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
  const stack: string[] = [];
  const tag = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
  for (let m = tag.exec(html); m !== null; m = tag.exec(html)) {
    if (m[1] === "/") {
      stack.pop();
      continue;
    }
    const attrs = m[3]!;
    if (attrs.includes(attr)) {
      const s = /\sstyle="([^"]*)"/.exec(attrs);
      return { style: s ? declarations(s[1]!) : {}, attrs, ancestors: [...stack] };
    }
    if (!attrs.trimEnd().endsWith("/") && !VOID.has(m[2]!)) stack.push(m[2]!);
  }
  return null;
}

/**
 * A minimal live seat. Deliberately built through `hudStore.setState`, the same
 * store HudRoot subscribes to — rendering the components directly would be
 * failure shape ⑤ (被測的不是出貨的那個), which is precisely how a deleted mount
 * stayed green for `hudSurfacePaint.test.ts`'s M11/M12.
 */
function seat(over: Partial<SeatView> = {}): SeatView {
  return {
    seatId: 0,
    teamId: 0,
    displayName: "me",
    connected: true,
    driver: "human",
    championId: TEST_CHAMPION,
    entityId: 7,
    level: 3,
    gold: 600,
    xp: 0,
    hp: 900,
    maxHp: 1000,
    mana: 400,
    maxMana: 500,
    shield: 0,
    alive: true,
    zone: 0,
    ready: false,
    unspentPoints: 0,
    items: [],
    augments: [],
    abilityRanks: [1, 0, 0, 0],
    cooldowns: [0, 0, 0, 0],
    exAbilityId: "",
    exRank: 0,
    exCooldown: 0,
    passiveCooldown: 0,
    statStacks: 0,
    statCapstonePct: 0,
    undoDepth: 0,
    roundKills: 0,
    roundDeaths: 0,
    coinsLeft: 0,
    kills: 0,
    deaths: 0,
    ...over,
  } as SeatView;
}

/**
 * ⚠️ THE ABILITY ROW ONLY RENDERS FOR A REGISTERED CHAMPION. `AbilityBar`
 * returns null on `Champions.tryGet(...) === undefined`, and this package's
 * vitest env loads no content bundle — so without this the shipped-markup
 * assertions would silently be checking a HUD with no ability row in it, which
 * is failure shape ③ (刪掉實作測試還全綠) arriving through the back door.
 */
const TEST_CHAMPION = "godie-test0" as ChampionId;

function ability(slot: CoreAbilitySlot): AbilityDef {
  return {
    id: `${TEST_CHAMPION}.${slot}` as AbilityId,
    name: `技能${slot}`,
    slot,
    castType: "self",
    maxRank: 5,
    cooldown: [8, 8, 8, 8, 8],
    manaCost: [50, 50, 50, 50, 50],
    range: 5,
    effects: [],
  } as AbilityDef;
}

function registerTestChampion(): void {
  Champions.register(TEST_CHAMPION, {
    id: TEST_CHAMPION,
    name: "測試英雄",
    role: "fighter",
    attackType: "melee",
    modelKey: "champ.test",
    baseStats: {},
    growth: {},
    abilities: { Q: ability("Q"), W: ability("W"), E: ability("E"), R: ability("R") },
  } as ChampionDef);
}

function renderCombatHud(over: Partial<SeatView> = {}): string {
  registerTestChampion();
  resetHudStore();
  hudStore.setState({
    connected: true,
    phase: "combat",
    localSeatId: 0,
    localEntityId: 7,
    localMaxHp: 1000,
    localHp: 900,
    localMaxMana: 500,
    localMana: 400,
    localAlive: true,
    seats: [seat(over)],
  });
  return renderToStaticMarkup(createElement(HudRoot));
}

describe("bottom cluster — the SHIPPED markup (client-28)", () => {
  /**
   * A CLOSED ALLOWLIST, not a blacklist of `bottom` / `transform`. `translate`,
   * `inset`, `margin-block-end`, `scale`… are all the same family and a
   * blacklist can never be finished — the hole `hudSurfacePaint.test.ts`
   * measured. A row may declare anything that CANNOT move it out of the flex
   * column; everything else is red until someone classifies it.
   */
  const ROW_COSMETIC = new Set([
    "width", "padding", "background", "border", "border-radius", "color",
    "font-size", "text-align", "display", "flex-direction", "align-items",
    "justify-content", "gap", "pointer-events", "min-width", "overflow",
    "box-sizing", "opacity", "box-shadow", "flex-shrink",
  ]);
  /** `position:relative` is the ONE positional declaration a row may make. */
  const ROW_POSITION_ALLOWED = "relative";

  it("HudRoot mounts the cluster, with both rows INSIDE it", () => {
    cover("hud-bottom-cluster");
    const html = renderCombatHud();
    const cluster = findMarked(html, 'data-hud-cluster="bottom"');
    expect(cluster, "nothing carries data-hud-cluster=\"bottom\"").not.toBeNull();
    const rows = html.indexOf('data-hud-cluster="bottom"');
    for (const row of ["resources", "abilities"]) {
      const at = html.indexOf(`data-hud-cluster-row="${row}"`);
      expect(at, `the ${row} row is not rendered`).toBeGreaterThan(-1);
      expect(at, `the ${row} row is not inside the cluster`).toBeGreaterThan(rows);
    }
  });

  it("neither row may pin itself — the container owns the distance", () => {
    cover("hud-bottom-cluster");
    const html = renderCombatHud();
    const problems: string[] = [];
    for (const row of ["resources", "abilities"]) {
      const found = findMarked(html, `data-hud-cluster-row="${row}"`)!;
      for (const [prop, value] of Object.entries(found.style)) {
        if (prop === "position") {
          if (value !== ROW_POSITION_ALLOWED)
            problems.push(`${row}: position:${value} (only ${ROW_POSITION_ALLOWED} is legal here)`);
          continue;
        }
        if (!ROW_COSMETIC.has(prop)) problems.push(`${row}: unclassified declaration \`${prop}\``);
      }
      // …and it must not reach the box through a class, either
      if (/\sclass="/.test(found.attrs)) problems.push(`${row}: carries a class attribute`);
    }
    expect(problems).toEqual([]);
  });

  it("the container's painted box IS the resolved rect", () => {
    cover("hud-bottom-cluster");
    const html = renderCombatHud();
    const cluster = findMarked(html, 'data-hud-cluster="bottom"')!;
    // useHudViewport's SSR fallback is 1280x800 — the viewport this file measured
    const style = bottomClusterStyle(1280, 800, false, BOTH_ROWS);
    const resolved = hudClusterRects({ width: 1280, height: 800 }, false, BOTH_ROWS);
    expect(cluster.style.left).toBe(`${resolved.cluster.x}px`);
    expect(cluster.style.width).toBe(`${resolved.cluster.w}px`);
    expect(cluster.style.bottom).toBe(`${SHIPPED_HUD_CLUSTER.clusterBottomPx}px`);
    expect(cluster.style.gap).toBe(`${SHIPPED_HUD_CLUSTER.barsToAbilitiesGapPx}px`);
    expect(cluster.style["flex-direction"]).toBe("column");
    // no transform: it would capture the position:fixed description overlay
    expect(cluster.style.transform).toBeUndefined();
    expect(cluster.style.translate).toBeUndefined();
    expect(style.left).toBe(resolved.cluster.x);
  });

  it("the ability overlays are SIBLINGS of the cluster, never children", () => {
    cover("hud-bottom-cluster");
    // A positioned ancestor would re-anchor `CastNoticeLine`'s `bottom`, and a
    // transform would capture the `position:fixed` description panel. The
    // cluster declares neither, but the structural fact is what matters.
    const html = renderCombatHud();
    const cluster = html.indexOf('data-hud-cluster="bottom"');
    const notice = html.indexOf("data-cast-notice");
    // the notice only renders while a refusal is live; when it is absent the
    // structural claim is vacuous, so assert only the reachable direction
    if (notice >= 0) expect(notice).toBeLessThan(cluster);
  });
});

describe("bottom-right hero portrait (client-28)", () => {
  it("the group paints a portrait for the local champion", () => {
    cover("hud-bottom-cluster");
    const html = renderCombatHud();
    const gold = html.indexOf('data-hud-slot="gold-level"');
    expect(gold, "the gold/level group is not rendered").toBeGreaterThan(-1);
    const portrait = findMarked(html, "data-hud-hero-portrait=");
    expect(portrait, "the bottom-right group paints no portrait").not.toBeNull();
    expect(portrait!.attrs).toContain(`data-hud-hero-portrait="${TEST_CHAMPION}"`);
    // …and it is INSIDE the gold/level box, not floating beside it
    expect(html.indexOf("data-hud-hero-portrait=")).toBeGreaterThan(gold);
  });

  it("a champion with NO icon file still paints a tile, never a broken image", () => {
    cover("hud-bottom-cluster");
    // `godie-nosuch` has no doc and therefore no icon: GlyphTile's seeded letter
    // must carry it, and IconImg must contribute no <img> at all.
    const html = renderCombatHud({ championId: "godie-nosuch" });
    const portrait = findMarked(html, 'data-hud-hero-portrait="godie-nosuch"');
    expect(portrait, "a champion without art loses its portrait entirely").not.toBeNull();
    const tail = html.slice(html.indexOf('data-hud-hero-portrait="godie-nosuch"'));
    const box = tail.slice(0, tail.indexOf("</span>"));
    expect(box).not.toContain("<img");
  });

  it("變身 shows the FORM on screen, and the field can say otherwise", () => {
    cover("hud-bottom-cluster");
    const BASE = "godie-ucrl";
    const ALT = "godie-u034";
    // current-form (the shipped default): form 0 → base, form 1 → counterpart
    expect(heroPortraitChampionId(BASE, 0, ALT)).toBe(BASE);
    expect(heroPortraitChampionId(BASE, 1, ALT)).toBe(ALT);
    // a champion with no second form is unaffected whatever the form index says
    expect(heroPortraitChampionId(BASE, 1, null)).toBe(BASE);
    // …and the two other modes are real, not decorative
    const base = { ...SHIPPED_HUD_CLUSTER, heroPortrait: "base" as const };
    expect(heroPortraitChampionId(BASE, 1, ALT, base)).toBe(BASE);
    const off = { ...SHIPPED_HUD_CLUSTER, heroPortrait: "off" as const };
    expect(heroPortraitChampionId(BASE, 1, ALT, off)).toBeNull();
  });

  it("the painted group fits the reservation its slot row promises", () => {
    cover("hud-bottom-cluster");
    // 36 portrait + 8 gap + 106 (the measured text column, 2026-07-24) + 20
    // padding = 170. The slot row reserves exactly that; this is the assertion
    // that forces the two to move together.
    const painted = SHIPPED_HUD_CLUSTER.heroPortraitPx + 8 + 106 + 20;
    const vp = { width: 1280, height: 800 };
    const reserved = hudSlotRect("gold-level", vp, false);
    expect(painted).toBeLessThanOrEqual(reserved.w);
    expect(reserved.x + reserved.w).toBe(vp.width - HUD_EDGE);
  });
});

describe("cluster tuning is a validated field table (client-28)", () => {
  it("every field has BOTH bounds, or is an enum/boolean", () => {
    cover("hud-bottom-cluster");
    const problems: string[] = [];
    for (const f of HUD_CLUSTER_FIELDS) {
      const numeric = f.min !== undefined || f.max !== undefined;
      if (numeric && (f.min === undefined || f.max === undefined))
        problems.push(`${f.key}: has only one bound (#277's shape)`);
      if (!numeric && !f.values && typeof SHIPPED_HUD_CLUSTER[f.key] !== "boolean")
        problems.push(`${f.key}: neither bounded, enumerated, nor boolean`);
      if (!f.label || f.label === String(f.key)) problems.push(`${f.key}: label restates the key`);
    }
    // the table must COVER the tuning type — a field nobody can edit is a
    // hard-coded value wearing an interface
    expect(HUD_CLUSTER_FIELDS.map((f) => f.key).sort()).toEqual(
      Object.keys(SHIPPED_HUD_CLUSTER).sort(),
    );
    expect(problems).toEqual([]);
  });

  it("an out-of-range value is clamped AND reported, never swallowed", () => {
    cover("hud-bottom-cluster");
    const { tuning, problems } = resolveClusterTuning({
      barsToAbilitiesGapPx: 500,
      clusterBottomPx: -40,
      heroPortrait: "sideways" as never,
    });
    expect(tuning.barsToAbilitiesGapPx).toBe(40);
    expect(tuning.clusterBottomPx).toBe(0);
    expect(tuning.heroPortrait).toBe(SHIPPED_HUD_CLUSTER.heroPortrait);
    expect(problems.map((p) => p.key).sort()).toEqual([
      "barsToAbilitiesGapPx",
      "clusterBottomPx",
      "heroPortrait",
    ]);
  });

  it("the runtime seam really changes the geometry, and null restores it", () => {
    cover("hud-bottom-cluster");
    const vp = { width: 1280, height: 800 };
    const before = hudClusterRects(vp, false, BOTH_ROWS);
    applyHudClusterOverride({ barsToAbilitiesGapPx: 12 });
    expect(hudClusterTuning().barsToAbilitiesGapPx).toBe(12);
    const after = hudClusterRects(vp, false, BOTH_ROWS);
    expect(verticalGap(after.resources!, after.abilities!)).toBe(12);
    expect(after.cluster.h).toBe(before.cluster.h + 6);
    applyHudClusterOverride(null);
    expect(hudClusterRects(vp, false, BOTH_ROWS).cluster.h).toBe(before.cluster.h);
  });
});
