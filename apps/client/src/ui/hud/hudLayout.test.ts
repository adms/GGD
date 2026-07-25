/**
 * client-19 (hud-corner-layout): the HUD corner registry.
 *
 * The bug this locks out: the ☰ pause button, the FPS pill and the team-lives
 * bar each hard-coded `left:10; top:10` in three unrelated files and rendered
 * on top of one another, while the expanded perf panel pinned itself at a magic
 * `top:40` that landed under the team bar.
 *
 * Three layers of protection:
 *   1. registry integrity — no two slots may claim the same corner+order;
 *   2. layout math — stack offsets, corner→CSS-edge mapping, touch sizing,
 *      and NO two slots of a corner may overlap (fine AND coarse pointers);
 *   3. a source scan — the HUD files may not hard-code corner coordinates
 *      again, and every managed slot's owner must really use the registry.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import {
  cornerAxes,
  HUD_CORNERS,
  HUD_EDGE,
  HUD_GAP,
  HUD_PANELS,
  HUD_SLOTS,
  HUD_TOUCH_TARGET,
  HUD_Z,
  hudDisplacedRect,
  hudExtentPx,
  hudPanel,
  hudPanelCovers,
  hudPanelRect,
  hudSlot,
  hudSlotBand,
  hudSlotCorner,
  hudSlotHeight,
  hudSlotOffset,
  hudSlotRect,
  hudSlotStyle,
  hudSlotWidth,
  hudSlotsInCorner,
  hudStackEnd,
  hudRectsOverlap,
  hudRectInViewport,
  isPanelExempt,
  resolveSlotUnderPanels,
  type HudPanelId,
  type HudRect,
  type HudSlotId,
  type HudViewport,
} from "./hudLayout";

const UI_DIR = join(__dirname, "..");

/** strip comments so prose about forbidden patterns can't trip a scan */
function readUi(rel: string): string {
  return readFileSync(join(UI_DIR, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

/**
 * Landscape phone (rotate-locked) + desktop, and one portrait for good measure.
 * Both pointer types are exercised against each in the panel guard below.
 */
const PANEL_VIEWPORTS: readonly HudViewport[] = [
  { width: 375, height: 667 },
  { width: 667, height: 375 },
  { width: 812, height: 375 },
  { width: 852, height: 393 },
  // Batch 5B (#151): the two rotate-locked phone-landscape breakpoints the mobile
  // HUD must fit in-match. 390 is a hair taller than the 375 cases above, but 360
  // is the SHORTEST height the in-match HUD is asserted against — every managed
  // corner stack and every shop-displaced slot must still clear it.
  { width: 844, height: 390 },
  { width: 780, height: 360 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];

/**
 * The heart of the panel-cover guard, shared by the GUARD and its pre-fix
 * REGRESSION proof: which managed, non-exempt slots are left painting under the
 * left-docked SHOP on a given viewport/pointer.
 *
 * `applyDisplaced=false` reproduces the pre-#107 world (every overlap is a
 * collision); `applyDisplaced=true` is the shipped world (a slot that hides, or
 * relocates to a rect that both escapes the panel and clears the other chrome,
 * is resolved and does NOT count). A non-empty result is a real collision.
 */
function shopCollisions(vp: HudViewport, touch: boolean, applyDisplaced: boolean): string[] {
  const panelRect = hudPanelRect("shop", vp);
  const out: string[] = [];
  for (const s of HUD_SLOTS) {
    // reserved/self-pinned slots are owned by other files (leave, gold-level)
    // and the left dock never reaches their corners; their owners position them.
    if (!s.managed) continue;
    // minimap (overlay) rides under panels on purpose; audio (portal) rides over
    if (isPanelExempt(s)) continue;
    const rect = hudSlotRect(s.id as HudSlotId, vp, touch);
    if (!hudRectsOverlap(rect, panelRect)) continue; // clear of the dock — fine

    if (!applyDisplaced) {
      out.push(s.id);
      continue;
    }
    const policy = s.displaced ?? "inset";
    if (policy === "hide") continue; // vacates entirely
    if (policy === "relocate") {
      const moved = hudDisplacedRect(s.id as HudSlotId, vp, touch);
      const escapes = !hudRectsOverlap(moved, panelRect) && hudRectInViewport(moved, vp);
      const clearsChrome = HUD_SLOTS.every(
        (o) =>
          o.id === s.id ||
          !o.managed ||
          isPanelExempt(o) ||
          !hudRectsOverlap(moved, hudSlotRect(o.id as HudSlotId, vp, touch)),
      );
      if (escapes && clearsChrome) continue;
      out.push(`${s.id}:relocate-did-not-escape`);
      continue;
    }
    // "inset" (the default) on a slot the dock actually covers is unproven — beside
    // a 45vw card there is no room — so it counts as a collision.
    out.push(`${s.id}:${policy}`);
  }
  return out;
}

describe("HUD corner registry (client-19)", () => {
  it("declares unique slot ids", () => {
    cover("hud-corner-layout");
    const ids = HUD_SLOTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // THE GUARD: this is the assertion that makes the original bug impossible.
  it("GUARD: no two slots claim the same corner + order", () => {
    cover("hud-corner-layout");
    const taken = new Map<string, string>();
    const clashes: string[] = [];
    for (const s of HUD_SLOTS) {
      const key = `${s.corner}#${s.order}`;
      const prev = taken.get(key);
      if (prev) clashes.push(`${key}: "${prev}" vs "${s.id}"`);
      else taken.set(key, s.id);
    }
    expect(clashes).toEqual([]);
  });

  it("every slot reserves a positive height and names its owner file", () => {
    cover("hud-corner-layout");
    for (const s of HUD_SLOTS) {
      expect(s.height, s.id).toBeGreaterThan(0);
      expect(s.touchHeight ?? s.height, s.id).toBeGreaterThan(0);
      expect(HUD_CORNERS, s.id).toContain(s.corner);
      expect(existsSync(join(UI_DIR, s.owner.replace(/^ui\//, ""))), s.owner).toBe(true);
    }
  });

  it("unmanaged slots are RESERVED with a note explaining who pins them", () => {
    cover("hud-corner-layout");
    for (const s of HUD_SLOTS.filter((x) => !x.managed)) {
      expect(s.note ?? "", s.id).toMatch(/RESERVED/);
    }
  });

  it("hudSlot throws on an unknown id", () => {
    cover("hud-corner-layout");
    expect(() => hudSlot("nope" as HudSlotId)).toThrow(/unknown HUD slot/);
  });
});

describe("HUD corner stack math (client-19)", () => {
  it("the first slot of every corner hugs the edge", () => {
    cover("hud-corner-layout");
    for (const corner of HUD_CORNERS) {
      const first = hudSlotsInCorner(corner)[0];
      expect(first, corner).toBeDefined();
      expect(hudSlotOffset(first!.id as HudSlotId), corner).toBe(HUD_EDGE);
    }
  });

  it("each next slot starts one gap past the previous slot's reserved height", () => {
    cover("hud-corner-layout");
    for (const corner of HUD_CORNERS) {
      for (const touch of [false, true]) {
        const slots = hudSlotsInCorner(corner, touch);
        let expected = HUD_EDGE;
        for (const s of slots) {
          expect(hudSlotOffset(s.id as HudSlotId, touch), `${s.id}/${touch}`).toBe(expected);
          expected += hudSlotHeight(s.id as HudSlotId, touch) + HUD_GAP;
        }
      }
    }
  });

  it("no two slots of a corner overlap — on fine OR coarse pointers", () => {
    cover("hud-corner-layout");
    const overlaps: string[] = [];
    for (const corner of HUD_CORNERS) {
      for (const touch of [false, true]) {
        const bands = hudSlotsInCorner(corner, touch).map((s) => ({
          id: s.id,
          ...hudSlotBand(s.id as HudSlotId, touch),
        }));
        for (let i = 1; i < bands.length; i++) {
          const prev = bands[i - 1]!;
          const cur = bands[i]!;
          if (cur.start < prev.end) {
            overlaps.push(`${corner}${touch ? " (touch)" : ""}: ${prev.id} ∩ ${cur.id}`);
          }
        }
      }
    }
    expect(overlaps).toEqual([]);
  });

  it("coarse pointers reserve >=44px for every tappable slot", () => {
    cover("hud-corner-layout");
    // the slots that render a button/tap target and are ours to size
    for (const id of ["menu", "scoreboard", "audio-toggle", "settings", "cheats"] as const) {
      expect(hudSlotHeight(id, true), id).toBeGreaterThanOrEqual(HUD_TOUCH_TARGET);
      expect(hudSlotHeight(id, true), id).toBeGreaterThanOrEqual(hudSlotHeight(id, false));
    }
  });

  it("hudStackEnd is where a docked panel (e.g. the shop) may start", () => {
    cover("hud-corner-layout");
    const last = hudSlotsInCorner("top-left").at(-1)!;
    expect(hudStackEnd("top-left")).toBe(hudSlotBand(last.id as HudSlotId).end);
    // the shop panel docks a gap below the whole top-left stack
    expect(hudStackEnd("top-left") + HUD_GAP).toBeGreaterThan(
      hudSlotBand("team-lives").end,
    );
  });

  it("skipTransient keeps a dev-only overlay from shrinking real panels", () => {
    cover("hud-corner-layout");
    // the perf panel is settings-gated: panels reserve space for the fps pill
    expect(hudSlot("perf-panel").transient).toBe(true);
    expect(hudStackEnd("bottom-left")).toBe(hudSlotBand("perf-panel").end);
    expect(hudStackEnd("bottom-left", false, { skipTransient: true })).toBe(
      hudSlotBand("fps").end,
    );
    // …and a corner with no transient slot is unaffected
    expect(hudStackEnd("top-left", false, { skipTransient: true })).toBe(
      hudStackEnd("top-left"),
    );
  });

  it("maps each corner onto the right pair of CSS edges", () => {
    cover("hud-corner-layout");
    expect(cornerAxes("top-left")).toEqual({ vertical: "top", horizontal: "left" });
    expect(cornerAxes("bottom-right")).toEqual({ vertical: "bottom", horizontal: "right" });

    const menu = hudSlotStyle("menu");
    expect(menu).toMatchObject({ position: "absolute", top: HUD_EDGE, left: HUD_EDGE });
    expect(menu.bottom).toBeUndefined();
    expect(menu.right).toBeUndefined();
    expect(menu.zIndex).toBe(HUD_Z.slot);

    const fps = hudSlotStyle("fps");
    expect(fps).toMatchObject({ position: "absolute", left: HUD_EDGE });
    expect(fps.bottom).toBe(hudSlotOffset("fps"));
    expect(fps.top).toBeUndefined();

    // a slot may paint above its neighbours while its panel is open
    expect(hudSlotStyle("scoreboard", false, HUD_Z.expanded).zIndex).toBe(HUD_Z.expanded);
    expect(HUD_Z.slot).toBeLessThan(HUD_Z.expanded);
    expect(HUD_Z.expanded).toBeLessThan(HUD_Z.screen);
    expect(HUD_Z.screen).toBeLessThan(HUD_Z.modal);
  });

  it("REGRESSION: menu / team-lives / fps no longer share a position", () => {
    cover("hud-corner-layout");
    const menu = hudSlot("menu");
    const team = hudSlot("team-lives");
    const fps = hudSlot("fps");
    // all three used to be absolute left:10 top:10
    expect(new Set([menu.order, team.order]).size).toBe(2);
    expect(fps.corner).not.toBe(menu.corner);
    expect(hudSlotOffset("team-lives")).toBeGreaterThan(hudSlotBand("menu").end - 1);
    expect(hudSlotOffset("team-lives")).not.toBe(hudSlotOffset("menu"));
  });

  it("REGRESSION: the perf panel opens past the whole stack, not at a fixed 40px", () => {
    cover("hud-corner-layout");
    const panel = hudSlot("perf-panel");
    const siblings = hudSlotsInCorner(panel.corner);
    expect(siblings.at(-1)!.id).toBe("perf-panel"); // last in its corner
    expect(hudSlotOffset("perf-panel")).toBe(hudSlotBand("fps").end + HUD_GAP);
    expect(hudSlotOffset("perf-panel")).not.toBe(40);
  });

  it("bottom-right is the minimap corner on desktop (gold-level is managed too)", () => {
    cover("hud-corner-layout");
    const slots = hudSlotsInCorner("bottom-right");
    // gold-level (order 0) hugs the corner, the minimap (order 1) stacks above,
    // and the persistent equipment bar (order 2, task #44) stacks above THAT so
    // it never perturbs the map's offset.
    expect(slots.map((s) => s.id)).toEqual(["gold-level", "minimap", "equipment"]);
    // BOTH are really managed by the registry now. gold-level used to be the
    // last hand-pinned slot in this corner — `right:14 / bottom:14` against
    // HUD_EDGE 10, reserving 56px for a box measured at 61px — which put its
    // far edge at 75px against the minimap's band start of 74. A 1px overlap
    // the guard was structurally blind to, because it only sees managed slots.
    expect(hudSlot("minimap").managed).toBe(true);
    expect(hudSlot("gold-level").managed).toBe(true);
    // the reservation must cover the MEASURED worst case (61px live, with the
    // "+N skill pt" line showing) or the overlap simply comes back.
    expect(hudSlot("gold-level").height).toBeGreaterThanOrEqual(61);
    // the equipment bar sits ABOVE the minimap, so adding it left the map's
    // offset untouched (the regression this ordering guards against)
    expect(hudSlotOffset("minimap")).toBe(hudSlotBand("gold-level").end + HUD_GAP);
  });

  it("a slot may live in a different corner on coarse pointers", () => {
    cover("hud-corner-layout");
    // desktop: LoL's bottom-right. touch: Wild Rift's top-left (bottom-right is
    // the ability arc on a phone) — declared, so the math follows automatically.
    expect(hudSlotCorner("minimap", false)).toBe("bottom-right");
    expect(hudSlotCorner("minimap", true)).toBe("top-left");
    expect(hudSlotsInCorner("bottom-right", true).map((s) => s.id)).toEqual(["gold-level"]);
    expect(hudSlotsInCorner("top-left", true).map((s) => s.id)).toEqual([
      "menu",
      "team-lives",
      "minimap",
      // task #84: the revive banner stacks UNDER the touch minimap (it declares
      // touchOrder 3 for exactly this reason), so re-homing the map still wins
      // the corner it needs on a phone.
      "revive",
      // the enemy panel stacks LAST (touchOrder 4), a compact HP strip below
      // the whole re-homed top-left group.
      "enemy-team",
    ]);
    // …and the CSS edges follow the effective corner, not the declared one
    const desktop = hudSlotStyle("minimap", false);
    expect(desktop.right).toBe(HUD_EDGE);
    expect(desktop.bottom).toBe(hudSlotOffset("minimap", false));
    const phone = hudSlotStyle("minimap", true);
    expect(phone.left).toBe(HUD_EDGE);
    expect(phone.top).toBe(hudSlotOffset("minimap", true));
    expect(phone.bottom).toBeUndefined();
    // a slot with no touch override is unaffected
    expect(hudSlotCorner("fps", true)).toBe(hudSlot("fps").corner);
  });
});

/**
 * client-20: the minimap's PLACEMENT regression. The bug this locks out was
 * measured on a real 812x375 phone-landscape viewport: the old panel pinned
 * itself at `bottom: calc(244px + safe-area)` with a 152px body, so it
 * measured x=650 y=-21 w=152 h=152 — clipped 21px off the TOP of the screen —
 * while also sitting on the scoreboard slot [710,44 → 802,88] and the
 * body-portaled audio toggle [708,96 → 802,140]. At 667x375 it collided with
 * six controls. 244 + 152 simply does not fit in 375.
 */
describe("minimap placement guard (client-20)", () => {
  /** phone landscape (iPhone X/SE-class), phone landscape (iPhone 15), desktop */
  const VIEWPORTS = [
    { width: 667, height: 375, touch: true },
    { width: 812, height: 375, touch: true },
    { width: 852, height: 393, touch: true },
    { width: 1280, height: 720, touch: false },
  ] as const;

  it("GUARD: the minimap rect is inside the viewport and clear of every other slot", () => {
    cover("hud-minimap-placement");
    const problems: string[] = [];
    for (const vp of VIEWPORTS) {
      const map = hudSlotRect("minimap", vp, vp.touch);
      if (!hudRectInViewport(map, vp)) {
        problems.push(
          `${vp.width}x${vp.height}: minimap ${JSON.stringify(map)} escapes the viewport`,
        );
      }
      for (const other of HUD_SLOTS) {
        if (other.id === "minimap") continue;
        // `transient` slots are opt-in dev overlays that DELIBERATELY open over
        // the corner stacks (HUD_Z.expanded) — the next test proves that is the
        // only exception and that it really does paint on top.
        if (other.transient) continue;
        const r = hudSlotRect(other.id as HudSlotId, vp, vp.touch);
        if (hudRectsOverlap(map, r)) {
          problems.push(`${vp.width}x${vp.height}: minimap ∩ ${other.id}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("the only slots exempt from the guard are dev overlays that paint ABOVE the map", () => {
    cover("hud-minimap-placement");
    const exempt = HUD_SLOTS.filter((s) => s.transient);
    expect(exempt.map((s) => s.id)).toEqual(["perf-panel"]);
    // it is settings-gated, and it opens at the expanded layer so a dev who
    // turns it on covers the minimap on purpose instead of colliding with it
    const src = readUi("PerfOverlay.tsx");
    expect(src).toMatch(/hudSlotStyle\("perf-panel",\s*touch,\s*HUD_Z\.expanded\)/);
    expect(HUD_Z.expanded).toBeGreaterThan(HUD_Z.slot);
    // sanity: it WOULD have tripped the guard, so the exemption is not vacuous
    const vp = { width: 812, height: 375 };
    expect(
      hudRectsOverlap(hudSlotRect("minimap", vp, true), hudSlotRect("perf-panel", vp, true)),
    ).toBe(true);
  });

  it("REGRESSION: the old 244px touch offset would have failed this guard", () => {
    cover("hud-minimap-placement");
    // reproduce the shipped-broken geometry: bottom-right, 244px up, 152 square
    const vp = { width: 812, height: 375 };
    const broken = { x: vp.width - 10 - 152, y: vp.height - 244 - 152, w: 152, h: 152 };
    expect(broken.y).toBeLessThan(0); // 375 - 244 - 152 = -21 → clipped off-screen
    expect(hudRectInViewport(broken, vp)).toBe(false);
    // …and it landed on the top-right stack it now avoids entirely
    expect(hudRectsOverlap(broken, hudSlotRect("scoreboard", vp, true))).toBe(true);
    expect(hudRectsOverlap(broken, hudSlotRect("audio-toggle", vp, true))).toBe(true);
    // the shipped slot fixes both
    const fixed = hudSlotRect("minimap", vp, true);
    expect(hudRectInViewport(fixed, vp)).toBe(true);
    expect(hudRectsOverlap(fixed, hudSlotRect("scoreboard", vp, true))).toBe(false);
    expect(hudRectsOverlap(fixed, hudSlotRect("audio-toggle", vp, true))).toBe(false);
  });

  it("the desktop map is LoL-sized and the touch map stays thumb-sized", () => {
    cover("hud-minimap-placement");
    // LoL's minimap is ~200-260px on a 1080p client
    expect(hudSlotWidth("minimap", false)).toBeGreaterThanOrEqual(200);
    expect(hudSlotWidth("minimap", false)).toBeLessThanOrEqual(260);
    expect(hudSlotWidth("minimap", false)).toBe(hudSlotHeight("minimap", false)); // square
    // …and the phone map is smaller, because 375px of height is the whole HUD
    expect(hudSlotWidth("minimap", true)).toBeLessThan(hudSlotWidth("minimap", false));
    expect(hudSlotWidth("minimap", true)).toBe(hudSlotHeight("minimap", true));
    // it must still fit under the top-left stack on the SHORTEST viewport
    const shortest = VIEWPORTS.reduce((a, b) => (a.height <= b.height ? a : b));
    const r = hudSlotRect("minimap", shortest, true);
    expect(r.y + r.h).toBeLessThanOrEqual(shortest.height);
  });

  it("the shop is an edge-docked full-height panel that clears every managed slot (task #38 → #107)", () => {
    cover("hud-minimap-placement");
    // HISTORY: the shop used to dock under the top-left stack, and re-homing the
    // minimap there squeezed it to ~60px on a 375px phone. Task #38 made the shop
    // a full-height edge-docked card (panels/MerchantShop.tsx); task #94 moved it
    // to the LEFT so it stopped covering the hero. This test USED to assert that
    // by grepping `left:0/top:0/bottom:0` out of MerchantShop's source — a string
    // match that task #94 had to relax to `(?:left|right):0` to accept either
    // side, at which point the name's claim ("no longer competes for the top-left
    // stack") became false in a NEW way: the card now competes for the LEFT
    // stacks. Task #107 replaces the string match with the REAL invariant, read
    // from the panel registry this module now owns.
    expect(hudSlot("minimap").overlay).toBe(true);

    // 1) it is EDGE-docked (a screen edge, not a corner) and FULL-HEIGHT.
    const shop = hudPanel("shop");
    expect(shop.edge).toBe("left");
    for (const vp of PANEL_VIEWPORTS) {
      const r = hudPanelRect("shop", vp);
      expect(r.x, `${vp.width}x${vp.height} x`).toBe(0); // hugs the edge
      expect(r.y, `${vp.width}x${vp.height} y`).toBe(0);
      expect(r.h, `${vp.width}x${vp.height} h`).toBe(vp.height); // full height
      expect(r.w, `${vp.width}x${vp.height} w`).toBeLessThan(vp.width); // a dock, not full-screen
    }

    // 2) and it PROVABLY does not intersect any managed slot: every slot the
    //    dock covers has a declared way out (hide / relocate), so nothing is
    //    left painting under it — on every viewport, both pointer types.
    const leftovers: string[] = [];
    for (const vp of PANEL_VIEWPORTS) {
      for (const touch of [false, true]) {
        for (const id of shopCollisions(vp, touch, true)) {
          leftovers.push(`${vp.width}x${vp.height}${touch ? " touch" : ""}: ${id}`);
        }
      }
    }
    expect(leftovers).toEqual([]);

    // …and the arena minimap is gone for the whole intermission phase, not merely
    // on touch — the shop scene replaces the arena, so there is no map to cover.
    expect(readUi("hud/Minimap.tsx")).toMatch(/phase !== "intermission"/);
  });

  it("every slot reserves a positive width, on both pointer types", () => {
    cover("hud-minimap-placement");
    for (const s of HUD_SLOTS) {
      expect(hudSlotWidth(s.id as HudSlotId, false), s.id).toBeGreaterThan(0);
      expect(hudSlotWidth(s.id as HudSlotId, true), s.id).toBeGreaterThan(0);
    }
  });

  it("rect math: corner→edge mapping, overlap and containment", () => {
    cover("hud-minimap-placement");
    const vp = { width: 1000, height: 800 };
    // top-left slot hugs both leading edges
    expect(hudSlotRect("menu", vp)).toMatchObject({ x: HUD_EDGE, y: HUD_EDGE });
    // bottom-right slot is measured back from the far edges
    const map = hudSlotRect("minimap", vp);
    expect(map.x + map.w).toBe(vp.width - HUD_EDGE);
    expect(map.y + map.h).toBe(vp.height - hudSlotOffset("minimap"));
    // touching edges do NOT count as an overlap
    expect(hudRectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(hudRectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 10, h: 10 })).toBe(true);
    expect(hudRectInViewport({ x: 0, y: 0, w: 1000, h: 800 }, vp)).toBe(true);
    expect(hudRectInViewport({ x: 0, y: -1, w: 10, h: 10 }, vp)).toBe(false);
  });
});

describe("HUD corner sources (client-19)", () => {
  it("every managed slot's owner reads its position from the registry", () => {
    cover("hud-corner-layout");
    const missing: string[] = [];
    for (const s of HUD_SLOTS.filter((x) => x.managed)) {
      const src = readUi(s.owner.replace(/^ui\//, ""));
      const usesLayout = /hud\/hudLayout|\.\/hudLayout/.test(src);
      const declaresSlot = src.includes(`"${s.id}"`);
      if (!usesLayout || !declaresSlot) missing.push(`${s.owner} (${s.id})`);
    }
    expect(missing).toEqual([]);
  });

  /**
   * The systemic guard: in-match HUD chrome must not pin itself to a corner
   * with literal coordinates. A violation is a style object that sets BOTH a
   * non-zero vertical (top/bottom) and a non-zero horizontal (left/right)
   * numeric literal — exactly the shape of the bug. Centered/edge-stretched
   * panels (`left: "50%"`, `inset: 0`, `left: 0`) are unaffected.
   */
  it("GUARD: no HUD file hard-codes a corner position", () => {
    cover("hud-corner-layout");
    /**
     * files that legitimately still pin themselves — each RESERVED in the
     * registry. EMPTY, and it should stay that way:
     *   • platform/AppRoot.tsx's Leave button was re-homed onto
     *     hudSlotStyle("leave") by the #107 safe-area work.
     *   • components/GoldLevel.tsx was the last one out. It pinned
     *     `right:14 / bottom:14` against HUD_EDGE 10 while reserving 56px for a
     *     box measured live at 61px — a real 1px overlap with the minimap band,
     *     invisible to the guard because an unmanaged slot is not checked. It
     *     now reads hudSlotStyle("gold-level") like every other slot.
     * An allowance here is a slot the guard cannot protect; add one only with a
     * reason that survives the question "so what catches it instead?".
     */
    const ALLOW = new Map<string, string>([]);

    const FILES = [
      "PauseMenu.tsx",
      "PerfOverlay.tsx",
      "HudRoot.tsx",
      "CheatConsole.tsx",
      "SettingsCorner.tsx",
      "AudioToggle.tsx",
      "TouchControls.tsx",
      "components/TeamLivesBar.tsx",
      "components/Scoreboard.tsx",
      "components/GoldLevel.tsx",
      "components/PhaseTimer.tsx",
      "components/AbilityBar.tsx",
      "components/ResourceBars.tsx",
      "components/ExUnlockToast.tsx",
      "panels/MerchantShop.tsx",
      "panels/ReadyButton.tsx",
      "panels/AugmentDraftPanel.tsx",
      "hud/Minimap.tsx",
      "platform/AppRoot.tsx",
    ];

    const V = /\b(top|bottom):\s*(-?\d+)\b/g;
    const H = /\b(left|right):\s*(-?\d+)\b/g;
    const offenders: string[] = [];

    for (const rel of FILES) {
      const src = readUi(rel);
      // look at each positioned style object (a window after position:absolute/fixed)
      for (const m of src.matchAll(/position:\s*"(absolute|fixed)"/g)) {
        const win = src.slice(m.index ?? 0, (m.index ?? 0) + 320);
        const v = [...win.matchAll(V)].find((x) => Number(x[2]) !== 0);
        const h = [...win.matchAll(H)].find((x) => Number(x[2]) !== 0);
        if (v && h) offenders.push(`${rel}: ${v[0]} + ${h[0]}`);
      }
    }

    const unexpected = offenders.filter((o) => !ALLOW.has(o.split(":")[0]!));
    expect(unexpected).toEqual([]);
    // the scan must not be vacuous, and the allowlist must not rot: every
    // exception is still a real offender AND still a reserved registry slot
    const flagged = new Set(offenders.map((o) => o.split(":")[0]!));
    for (const [file, slotId] of ALLOW) {
      expect(flagged, `${file} no longer pins itself — drop it from ALLOW`).toContain(file);
      expect(HUD_SLOTS.some((s) => s.id === slotId && s.owner.endsWith(file))).toBe(true);
    }
  });

  it("the safe-area inset stays owned by #hud-root (no double-counting in slots)", () => {
    cover("hud-corner-layout");
    // mobile.css insets the whole HUD layer on coarse pointers …
    const css = readFileSync(join(UI_DIR, "mobile.css"), "utf8");
    expect(css).toMatch(/#hud-root[\s\S]*env\(safe-area-inset-top/);
    expect(css).toMatch(/\[data-hud-slot\][\s\S]*min-height:\s*44px/);
    // … so the slot geometry itself must stay plain px
    expect(readUi("hud/hudLayout.ts")).not.toMatch(/env\(safe-area-inset/);
  });
});

/**
 * client-26 (hud-panel-cover): the PANEL-EDGE half of the corner contract
 * (task #107). #42 closed the chrome-vs-chrome loop; a docked panel (the shop)
 * and the chrome it covers were still invisible to each other and painted in an
 * undeclared z-order — the FPS pill at z=25 over the shop card at z≈0. This
 * closes the panel-vs-chrome loop with the same machinery: static edge
 * declarations, node-resolved rects, and a guard whose failure names the
 * collision. The precedence rule: a docked panel owns its edge; covered chrome
 * yields (per its `displaced` policy); the only exemptions are chrome that rides
 * ABOVE the panel (portal) or ACCEPTS being painted over (overlay).
 */
describe("HUD panel-edge contract (client-26)", () => {
  it("declares unique panel ids, each at/above the slot layer, RESERVED with an owner", () => {
    cover("hud-panel-cover");
    const ids = HUD_PANELS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of HUD_PANELS) {
      expect(p.z, `${p.id} z`).toBeGreaterThanOrEqual(HUD_Z.slot); // never paints UNDER chrome
      expect(existsSync(join(UI_DIR, p.owner.replace(/^ui\//, ""))), p.owner).toBe(true);
      // every panel here mirrors a file owned by another task → RESERVED, like a slot
      if (!p.managed) expect(p.note ?? "", p.id).toMatch(/RESERVED/);
    }
  });

  /**
   * panelDeclaredZIsPainted — the gap this module's own header described and
   * then left open: "the FPS pill at z=25 over the shop card at z≈0". The rects
   * got a guard; the Z NEVER DID. A covering panel that declares `z:
   * HUD_Z.screen` and sets no `zIndex` at all paints at the default positioned
   * layer, i.e. genuinely UNDER every managed slot (`hudSlotStyle` hands out a
   * real `zIndex: HUD_Z.slot`) — and every test above still passes, because
   * they all prove that RECTANGLES clear, which says nothing about paint order.
   * Only `displaced: "hide"` on every colliding slot kept it invisible.
   *
   * So: any panel that COVERS a corner (the case where its z is what makes the
   * chrome's yielding correct) must really paint at the number it declares.
   * Panels that cover nothing (champ-select, augment-draft) are out of scope —
   * they displace no chrome, so their layer is a local concern.
   */
  it("GUARD: a panel that covers a corner really PAINTS at its declared z", () => {
    cover("hud-panel-cover");
    /** source spellings of a z, and the number each one resolves to. */
    const ALIASES: ReadonlyArray<readonly [string, number]> = [
      ["HUD_Z.slot", HUD_Z.slot],
      ["HUD_Z.expanded", HUD_Z.expanded],
      ["HUD_Z.screen", HUD_Z.screen],
      ["HUD_Z.focus", HUD_Z.focus],
      // panels/intermissionLayout.ts: `panel: HUD_Z.screen` (band 3)
      ["INTERMISSION_Z.panel", HUD_Z.screen],
      ["INTERMISSION_Z.focus", HUD_Z.focus],
    ];
    const problems: string[] = [];
    for (const p of HUD_PANELS) {
      if (p.covers.length === 0) continue;
      const src = readUi(p.owner.replace(/^ui\//, ""));
      const found = [...src.matchAll(/zIndex:\s*([A-Za-z_$][\w$.]*|\d+)/g)].map((m) => m[1]!);
      if (found.length === 0) {
        problems.push(`${p.owner} (${p.id}) declares z=${p.z} but sets NO zIndex — it paints under every slot`);
        continue;
      }
      for (const token of found) {
        const alias = ALIASES.find(([name]) => name === token);
        const value = alias ? alias[1] : Number(token);
        if (!Number.isFinite(value)) {
          problems.push(`${p.owner} (${p.id}) uses an unknown z expression "${token}" — add it to ALIASES`);
        } else if (value !== p.z) {
          problems.push(`${p.owner} (${p.id}) paints at ${token} (${value}) but the registry declares ${p.z}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("hudPanel throws on an unknown id", () => {
    cover("hud-panel-cover");
    expect(() => hudPanel("nope" as HudPanelId)).toThrow(/unknown HUD panel/);
  });

  it("hudExtentPx is min(fraction·axis, maxPx) — matching CSS min(45vw, 560px)", () => {
    cover("hud-panel-cover");
    expect(hudExtentPx({ fraction: 0.45, maxPx: 560 }, 1000)).toBe(450); // fraction wins
    expect(hudExtentPx({ fraction: 0.45, maxPx: 560 }, 2000)).toBe(560); // cap wins
    // the shop rect follows it exactly
    expect(hudPanelRect("shop", { width: 1000, height: 800 }).w).toBe(450);
    expect(hudPanelRect("shop", { width: 2000, height: 800 }).w).toBe(560);
  });

  it("CROSS-CHECK: every panel's declared `covers` includes every corner its rect really hits", () => {
    cover("hud-panel-cover");
    const problems: string[] = [];
    for (const p of HUD_PANELS) {
      for (const vp of PANEL_VIEWPORTS) {
        const actual = hudPanelCovers(p.id as HudPanelId, vp);
        for (const c of actual) {
          if (!p.covers.includes(c)) {
            problems.push(`${p.id} @ ${vp.width}x${vp.height} really hits ${c} but does not declare it`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
    // non-vacuous: the shop genuinely covers BOTH left corners on every viewport
    for (const vp of PANEL_VIEWPORTS) {
      expect(hudPanelCovers("shop", vp).sort()).toEqual(["bottom-left", "top-left"]);
    }
  });

  it("centred panels cover NO corner on any viewport (the guard proves clearance)", () => {
    cover("hud-panel-cover");
    for (const id of ["champ-select", "augment-draft"] as const) {
      expect(hudPanel(id).edge).toBe("center");
      expect(hudPanel(id).covers).toEqual([]);
      for (const vp of PANEL_VIEWPORTS) {
        expect(hudPanelCovers(id, vp), `${id} @ ${vp.width}x${vp.height}`).toEqual([]);
      }
    }
  });

  it("the full-screen terminal panel covers every corner AND provides its own exit", () => {
    cover("hud-panel-cover");
    const end = hudPanel("match-end");
    expect(end.edge).toBe("full");
    expect([...end.covers].sort()).toEqual([...HUD_CORNERS].sort());
    // essential chrome (the ☰) may HIDE under it precisely because it is not a trap
    expect(end.providesExit).toBe(true);
    for (const vp of PANEL_VIEWPORTS) {
      expect(hudPanelCovers("match-end", vp).sort()).toEqual([...HUD_CORNERS].sort());
    }
  });

  // ── THE GUARD ──────────────────────────────────────────────────────────────
  it("GUARD: no managed chrome is left painting under the left-docked shop", () => {
    cover("hud-panel-cover");
    const problems: string[] = [];
    for (const vp of PANEL_VIEWPORTS) {
      for (const touch of [false, true]) {
        for (const id of shopCollisions(vp, touch, true)) {
          problems.push(`${vp.width}x${vp.height}${touch ? " touch" : ""}: ${id}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("REGRESSION: the PRE-FIX layout collided — the guard is not vacuous", () => {
    cover("hud-panel-cover");
    // Reproduce the pre-#107 world (no `displaced` policy applied): every piece
    // of chrome docked in the top-/bottom-left overlaps the left card, the
    // reported FPS pill among them. A guard that passed against THIS would be
    // worthless. (`enemy-team` is a later top-left addition that likewise sits
    // under the dock and yields via `hide`.)
    const raw = shopCollisions({ width: 1280, height: 720 }, false, false).sort();
    expect(raw).toEqual([
      "enemy-team",
      "fps",
      "gamepad",
      "menu",
      "perf-panel",
      "revive",
      "team-lives",
    ]);
    // and applying the policies clears all six
    expect(shopCollisions({ width: 1280, height: 720 }, false, true)).toEqual([]);
  });

  it("the only chrome exempt from the panel guard rides ABOVE or ACCEPTS cover — and each WOULD collide", () => {
    cover("hud-panel-cover");
    const exempt = HUD_SLOTS.filter((s) => isPanelExempt(s)).map((s) => s.id);
    expect(exempt.sort()).toEqual(["audio-toggle", "gold-level", "minimap"]);
    // audio-toggle rides above every panel (portal); minimap and gold-level
    // accept being painted over (overlay). None is a false exemption:
    expect(hudSlot("audio-toggle").portal).toBe(true);
    expect(hudSlot("minimap").overlay).toBe(true);
    expect(hudSlot("gold-level").overlay).toBe(true);
    // on touch the minimap re-homes to the top-left, WHERE THE SHOP DOCKS, so the
    // exemption is load-bearing, not vacuous
    const vp = { width: 812, height: 375 };
    expect(hudRectsOverlap(hudSlotRect("minimap", vp, true), hudPanelRect("shop", vp))).toBe(true);
  });

  /**
   * goldLevelExemptionIsVacuous — gold-level's `overlay` exists for ONE thing:
   * the relocated ☰ landing on it on a ≤375px-tall landscape phone (see the
   * registry note). It must never quietly excuse a shop collision, so pin that
   * the dock's rect cannot reach it on ANY guard viewport or pointer type. If
   * this ever fails, the exemption has grown a second, undeclared job.
   */
  it("gold-level's `overlay` is not a licence for the shop to cover it", () => {
    cover("hud-panel-cover");
    for (const vp of PANEL_VIEWPORTS) {
      for (const touch of [false, true]) {
        const rect = hudSlotRect("gold-level", vp, touch);
        expect(
          hudRectsOverlap(rect, hudPanelRect("shop", vp)),
          `${vp.width}x${vp.height}${touch ? " touch" : ""}`,
        ).toBe(false);
      }
    }
    // and the thing the exemption DOES cover really happens: on the shortest
    // landscape phone the relocated ☰ lands on the gold readout's band.
    const phone = { width: 667, height: 375 };
    expect(
      hudRectsOverlap(hudDisplacedRect("menu", phone, true), hudSlotRect("gold-level", phone, true)),
    ).toBe(true);
  });

  it("the essential ☰ RELOCATES clear of the dock and stays on-screen (shortest viewport)", () => {
    cover("hud-panel-cover");
    expect(hudSlot("menu").displaced).toBe("relocate");
    expect(hudSlot("menu").displacedCorner).toBe("top-right");
    // shortest viewport, touch sizes: the relocated ☰ escapes the shop and fits
    const vp = { width: 667, height: 375 };
    const moved: HudRect = hudDisplacedRect("menu", vp, true);
    expect(hudRectsOverlap(moved, hudPanelRect("shop", vp))).toBe(false);
    expect(hudRectInViewport(moved, vp)).toBe(true);
    // it docks BELOW the whole existing top-right stack (its declared order 5)
    expect(moved.y).toBeGreaterThan(hudStackEnd("top-right", true));
  });

  it("resolves the SAME placement the running HUD does (pure resolver drives both)", () => {
    cover("hud-panel-cover");
    // the shop, open, on touch: bottom-left telemetry hides, the ☰ relocates,
    // top-right chrome the dock never reaches stays put.
    const shop = [hudPanel("shop")];
    expect(resolveSlotUnderPanels("fps", true, shop)).toEqual({ hidden: true, relocated: false });
    expect(resolveSlotUnderPanels("menu", true, shop)).toEqual({ hidden: false, relocated: true });
    expect(resolveSlotUnderPanels("settings", true, shop)).toEqual({ hidden: false, relocated: false });
    // a full terminal panel covers the relocate TARGET too, so the ☰ hides
    // instead of relocating into it — safe only because match-end provides an exit
    const end = [hudPanel("match-end")];
    expect(resolveSlotUnderPanels("menu", true, end)).toEqual({ hidden: true, relocated: false });
    // exempt chrome never yields, to any panel
    expect(resolveSlotUnderPanels("audio-toggle", true, end)).toEqual({ hidden: false, relocated: false });
    expect(resolveSlotUnderPanels("minimap", true, shop)).toEqual({ hidden: false, relocated: false });
  });

  it("the shop's declared width mirrors the card's min(45vw, 560px)", () => {
    cover("hud-panel-cover");
    // Deliberately asserts the REGISTRY value, not a CSS string grepped out of
    // MerchantShop.tsx — dropping that brittle source-match is the whole point
    // of #107 (and that file is #106's live rebuild). The note on the shop row
    // records the mirror; if #106 changes the fraction, THAT is a coordinated
    // change to both the card and this row, the same as leave/gold-level.
    expect(hudPanel("shop").size).toEqual({ fraction: 0.45, maxPx: 560 });
    // the resolved width is a real dock (partial), never full-screen
    const vp = { width: 1280, height: 720 };
    expect(hudPanelRect("shop", vp).w).toBe(560);
    expect(hudPanelRect("shop", vp).w).toBeLessThan(vp.width);
  });

  // ── task #44 / #107: the persistent equipment bar declares a slot too ───────
  it("the equipment bar declares a right-edge slot the left shop never covers", () => {
    cover("hud-panel-cover");
    const eq = hudSlot("equipment");
    // desktop bottom-right (the LoL item-bar corner), coarse-pointer top-right —
    // both right-edge corners, mirroring the minimap's own re-home reasoning.
    expect(hudSlotCorner("equipment", false)).toBe("bottom-right");
    expect(hudSlotCorner("equipment", true)).toBe("top-right");
    expect(eq.managed).toBe(true);
    // it reserves real space on BOTH pointer types …
    expect(hudSlotWidth("equipment", false)).toBeGreaterThan(0);
    expect(hudSlotWidth("equipment", true)).toBeGreaterThan(0);
    expect(hudSlotHeight("equipment", false)).toBeGreaterThan(0);
    // … and, being right-edged and narrow enough, its rect clears the left shop
    // on every guard viewport × pointer type — so it needs NO `displaced` policy
    // (the safe-area contract holds by geometry, not by yielding).
    expect(eq.displaced).toBeUndefined();
    const covered: string[] = [];
    for (const v of PANEL_VIEWPORTS) {
      for (const touch of [false, true]) {
        const rect = hudSlotRect("equipment", v, touch);
        if (hudRectsOverlap(rect, hudPanelRect("shop", v))) {
          covered.push(`${v.width}x${v.height}${touch ? " touch" : ""}`);
        }
      }
    }
    expect(covered).toEqual([]);
    // it is NOT among the guard's exempt chrome — it is genuinely clear, not
    // waved through like the overlay minimap / portal audio toggle.
    expect(isPanelExempt(eq)).toBe(false);
  });
});
