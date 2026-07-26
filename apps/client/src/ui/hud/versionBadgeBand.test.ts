/**
 * GUARD — the build stamp's reserved bottom band (task #245, inside #107).
 *
 * WHY THIS EXISTS. #66's badge was safe by being at the BOTTOM of the stacking
 * order (`z-index: 1`), which is also why it was invisible on the settlement
 * screen and half-covered by the shop card — the two screens the owner
 * screenshots most. #245 inverts that: the badge paints above everything, and
 * the guarantee that it does not cover gameplay or controls moves from "it is
 * underneath" to "it may only occupy the bottom `HUD_STAMP_BAND` px, and
 * nothing else is allowed in there".
 *
 * WHY THE FIRST VERSION OF THIS GUARD WAS NOT ENOUGH — and this is the whole
 * point of the file. It enumerated `HUD_SLOTS` plus two controls somebody
 * remembered (the ability bar, the touch attack button) and concluded the band
 * was "empty by construction". It was not: `ui/panels/ChampSelectPanel.tsx`
 * pinned its bottom-centre status line at `bottom: 6`, inside a
 * `position:absolute; inset:0` full-screen layer — i.e. 6px above the VIEWPORT
 * bottom, horizontally centred, in exactly the pixels the badge occupies. Four
 * pixels of overlap, on the screen the owner stares at every match, and the
 * guard could not see it because CHAMP-SELECT'S HINT IS NOT A SLOT. A guard
 * whose input is a hand-written list can only ever re-assert what its author
 * already knew.
 *
 * So the third test below takes its input from THE SOURCE TREE instead: it
 * enumerates every `bottom:` declaration under `apps/client/src/ui`, and any
 * that could land in the band must be answered for in `BAND_LEDGER` — with a
 * reason that was checked, not assumed. New chrome that drifts into the last
 * 10px fails until somebody either moves it or writes down why it is safe, and
 * a ledger row whose code has changed fails too, so the ledger cannot rot.
 *
 * WHAT IS DELIBERATELY *NOT* ASSERTED: that panels stay out of the band. The
 * badge is MEANT to paint over the settlement wash and over the shop card's
 * background — that is the entire #245 fix, since those are the screens the
 * owner screenshots. The line this guard draws is chrome vs. content: a panel's
 * background may be painted over, a slot or a control may not.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import {
  VERSION_BADGE_BAND_PX,
  VERSION_BADGE_BAND_W_PX,
  versionBadgeStyle,
} from "@ggd/shared/versionBadge";
import {
  HUD_EDGE,
  HUD_SLOTS,
  HUD_STAMP_BAND,
  HUD_STAMP_BAND_W,
  hudDisplacedRect,
  hudRectInViewport,
  hudRectsOverlap,
  hudSlotRect,
  hudStampBandRect,
  type HudSlotId,
  type HudViewport,
} from "./hudLayout";

const UI_ROOT = fileURLToPath(new URL("..", import.meta.url));

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

/** Same viewport set the #107 panel guard uses (phone landscape → desktop). */
const VIEWPORTS: readonly HudViewport[] = [
  { width: 375, height: 667 },
  { width: 667, height: 375 },
  { width: 812, height: 375 },
  { width: 852, height: 393 },
  { width: 844, height: 390 },
  { width: 780, height: 360 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];

/** First number assigned to `name` in `src` (e.g. `const ATTACK_CENTER = 84;`). */
function constNumber(src: string, name: string): number {
  const m = new RegExp(`\\b${name}\\s*=\\s*(\\d+)`).exec(src);
  expect(m, `expected a numeric \`${name}\` constant to still exist`).not.toBeNull();
  return Number(m![1]);
}

describe("the build-stamp band is reserved and empty (version-badge-band)", () => {
  it("the band is the bottom HUD_EDGE gutter — the strip the corner stacks already clear", () => {
    cover("version-badge-band");
    // Equal to HUD_EDGE on purpose: reserving the gutter every corner stack
    // already starts beyond costs zero layout churn. Growing the band means
    // MOVING real HUD chrome, which must be a deliberate #107 change, not a
    // styling tweak — so both halves are pinned here.
    expect(HUD_STAMP_BAND).toBe(HUD_EDGE);
    expect(HUD_STAMP_BAND).toBe(VERSION_BADGE_BAND_PX);
    expect(HUD_STAMP_BAND_W).toBe(VERSION_BADGE_BAND_W_PX);
    for (const vp of VIEWPORTS) {
      const band = hudStampBandRect(vp);
      expect(band.y + band.h).toBe(vp.height); // flush with the bottom edge
      expect(band.h).toBe(HUD_STAMP_BAND);
      // centred and bounded — not the whole bottom edge (see the module doc)
      expect(band.w).toBe(Math.min(vp.width, HUD_STAMP_BAND_W));
      expect(band.x + band.w / 2).toBeCloseTo(vp.width / 2, 6);
      expect(hudRectInViewport(band, vp)).toBe(true);
    }
  });

  it("the badge itself never paints outside the band", () => {
    cover("version-badge-band");
    const s = versionBadgeStyle();
    expect(s.position).toBe("fixed");
    expect(s.bottom).toBe(0);
    // content-box + an explicit height means the horizontal padding cannot push
    // the chip above the band
    expect(s.boxSizing).toBe("content-box");
    expect(s.height).toBe(HUD_STAMP_BAND);
    // …and it cannot grow WIDER than the band either: a hand-set
    // GGD_BUILD_STAMP full of prose gets clipped rather than sprawling across
    // the bottom of the HUD.
    expect(s.maxWidth + 16).toBeLessThanOrEqual(HUD_STAMP_BAND_W); // +16 = padding
    expect(s.overflow).toBe("hidden");
    expect(s.whiteSpace).toBe("nowrap");
    // and it can never take a click, which is what makes painting on top safe
    expect(s.pointerEvents).toBe("none");
  });

  it("NO HUD slot reaches into the band — every slot, both pointers, both placements", () => {
    cover("version-badge-band");
    for (const vp of VIEWPORTS) {
      const band = hudStampBandRect(vp);
      for (const spec of HUD_SLOTS) {
        const id = spec.id as HudSlotId;
        for (const touch of [false, true]) {
          const normal = hudSlotRect(id, vp, touch);
          expect(
            hudRectsOverlap(normal, band),
            `${vp.width}x${vp.height} touch=${touch}: slot "${id}" ${JSON.stringify(normal)} ` +
              `reaches into the reserved build-stamp band ${JSON.stringify(band)} — the version ` +
              "badge would cover it. Move the slot, do not shrink the band.",
          ).toBe(false);
          if (spec.displaced === "relocate") {
            const moved = hudDisplacedRect(id, vp, touch);
            expect(
              hudRectsOverlap(moved, band),
              `${vp.width}x${vp.height} touch=${touch}: slot "${id}" DISPLACED to ` +
                `${JSON.stringify(moved)} reaches into the build-stamp band`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it("the bottom-centre CONTROLS clear the band — read from their real sources", () => {
    cover("version-badge-band");
    // The ability bar is not a slot (it is centred, not cornered), so the rect
    // machinery above cannot see it — and it is the single control closest to
    // the badge on desktop. Its own `bottom:` offset is the contract.
    const bar = read("../components/AbilityBar.tsx");
    const barMatch = /position:\s*"absolute",\s*left:\s*"50%",\s*bottom:\s*(\d+)/.exec(bar);
    expect(
      barMatch,
      "could not find the bottom-centred ability-bar container in AbilityBar.tsx — " +
        "if it was restructured, re-point this guard rather than deleting it",
    ).not.toBeNull();
    const barBottom = Number(barMatch![1]);
    expect(
      barBottom,
      "the desktop ability bar must sit clear of the build-stamp band",
    ).toBeGreaterThanOrEqual(HUD_STAMP_BAND);

    // Touch: the attack button is the lowest thing on a phone. Its bottom edge
    // is ATTACK_CENTER − ATTACK_SIZE/2 above the viewport bottom.
    const touch = read("../TouchControls.tsx");
    const attackBottom =
      constNumber(touch, "ATTACK_CENTER") - constNumber(touch, "ATTACK_SIZE") / 2;
    expect(
      attackBottom,
      "the touch attack button must sit clear of the build-stamp band",
    ).toBeGreaterThanOrEqual(HUD_STAMP_BAND);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * THE ENUMERATION — what is ACTUALLY in the band, read off the source tree.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** One `bottom:` declaration found in the UI tree. */
interface BottomDecl {
  /** path relative to apps/client/src/ui */
  file: string;
  /** the raw right-hand side, whitespace-collapsed */
  value: string;
  /** parsed px when the value is a bare number / "Npx", else null */
  px: number | null;
}

/**
 * WHY .tsx AND .css BUT NOT .ts. Only those two produce DOM: a `.tsx` file
 * renders elements, a `.css` file styles them. The `.ts` modules under `ui/`
 * (`prepCountdown`, `chromeReserve`, `audioClusterLayout`, …) are pure geometry
 * calculators whose `bottom:` is a FIELD ON A RECT, not a CSS declaration —
 * including them would fill the ledger with maths that never touches a style
 * attribute, which is how ledgers stop being read. The components that consume
 * those rects are `.tsx` and ARE scanned, so nothing hides behind the split.
 */
const SCANNED_EXT = [".tsx", ".css"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (SCANNED_EXT.some((e) => name.endsWith(e)) && !name.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Every `bottom:` declaration under ui/, comments stripped.
 *
 * `(?<![-\w])` keeps `margin-bottom` / `borderBottom` out; comments are removed
 * first so the many prose references to「`bottom: 14`」in module docs are not
 * mistaken for code.
 */
function collectBottomDecls(): BottomDecl[] {
  const decl = /(?<![-\w])bottom:\s*([^,}\n;]+)/g;
  const out: BottomDecl[] = [];
  for (const full of walk(UI_ROOT)) {
    const src = readFileSync(full, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    for (const m of src.matchAll(decl)) {
      const value = (m[1] ?? "").trim().replace(/\s+/g, " ");
      // `bottom: number` in an interface is a TYPE, not a style — it paints
      // nothing. Skipping it is the one exclusion here, and it is by SHAPE
      // (a bare primitive type name) rather than by file, so a real
      // `bottom: <expression>` can never slip through under the same rule.
      if (/^(number|string|boolean)(\s*\|\s*(number|string|boolean))*$/.test(value)) continue;
      const lit = /^"?(-?\d+(?:\.\d+)?)(?:px)?"?$/.exec(value);
      out.push({
        file: full.slice(UI_ROOT.length),
        value,
        px: lit ? Number(lit[1]) : null,
      });
    }
  }
  return out;
}

/**
 * THE LEDGER — every declaration the scan cannot clear on arithmetic alone.
 *
 * A declaration is cleared automatically when it is a literal `>= HUD_STAMP_BAND`:
 * that is sound in the only direction that matters, because the WORST case for
 * such an element is that its containing block is the viewport, and even then
 * its bottom edge lands at or above the top of the band. Everything else — a
 * literal inside the band, or a value the scan cannot evaluate — is listed here
 * with a reason that was READ OUT OF THE CODE, not assumed.
 *
 * `count` is part of the key: adding a second `bottom: 0` to a file listed for
 * one fails, so a file cannot become a dumping ground behind an old entry.
 */
interface LedgerRow {
  file: string;
  value: string;
  count: number;
  why: string;
}

const BAND_LEDGER: readonly LedgerRow[] = [
  // ── literals INSIDE the band, every one of them nested in a small box ──────
  {
    file: "HeroReactionBubble.tsx",
    value: "-6",
    count: 1,
    why: "the speech tail (a 12px rotated square) hanging off the bubble box it is absolutely positioned in; the bubble is world-anchored above a champion, not viewport-pinned",
  },
  {
    file: "MerchantTipBox.tsx",
    value: "-6",
    count: 1,
    why: "same speech-tail diamond, hanging off the tip box; anchored to the merchant, not to the viewport",
  },
  {
    file: "codex/IconCoverageBar.tsx",
    value: "0",
    count: 2,
    why: "the covered/blocked fills inside the coverage bar's own position:relative track (a ~8px pill in a codex row)",
  },
  {
    file: "components/AbilityBar.tsx",
    value: "0",
    count: 5,
    why: "tile-internal chrome — the name strip, the 被動/主動 pill and the cast fills — each absolutely positioned inside its own ~52px ability tile. The BAR's own viewport offset is `bottom: 14`, asserted numerically above",
  },
  {
    file: "components/CouchHudGrid.tsx",
    value: "8",
    count: 1,
    why: "the per-seat caption inside one couch-play grid CELL, whose own height is a percentage of the grid; the cell's bottom is not the viewport's",
  },
  {
    file: "components/EnemyTeamPanel.tsx",
    value: "0",
    count: 1,
    why: "the HP fill inside one enemy row's own bar track (a few px tall, inside the top-left slot)",
  },
  {
    file: "components/ResourceBars.tsx",
    value: "0",
    count: 2,
    why: "the fill and the overheal segment inside the resource bar's own track; the bars' viewport offset is `bottom: 128`, which the scan clears on arithmetic",
  },
  {
    file: "panels/MerchantShop.tsx",
    value: "0",
    count: 2,
    why: "one is the shop CARD itself (top:0/bottom:0, a full-height left dock) — viewport-anchored and genuinely spanning the band, and ALLOWED to: it is a panel BACKGROUND, and the badge riding over it is the whole point of #245. The other is a price tag inside a 38px item tile",
  },
  {
    file: "platform/MatchLoadingOverlay.tsx",
    value: "0",
    count: 1,
    why: "the progress fill inside the loading bar's own 4px track",
  },

  // ── values the scan cannot evaluate ───────────────────────────────────────
  {
    file: "TouchControls.tsx",
    value: "ATTACK_CENTER",
    count: 1,
    why: "the touch attack button, ATTACK_CENTER (84) above the bottom edge; its lowest edge is asserted numerically by the controls test above",
  },
  {
    file: "TouchControls.tsx",
    value: "ATTACK_CENTER - ATTACK_SIZE / 2",
    count: 1,
    why: "that button's own bottom edge — the single lowest thing on a phone, asserted numerically above",
  },
  {
    file: "TouchControls.tsx",
    value: "ATTACK_CENTER + ARC_RADIUS + 46",
    count: 1,
    why: "the ability arc's label row, further UP than the attack button it is measured from",
  },
  {
    file: "TouchControls.tsx",
    value: "ATTACK_CENTER + ARC_RADIUS - ABILITY_SIZE / 2",
    count: 1,
    why: "an arc tile's bottom edge: ARC_RADIUS above the attack centre, minus half a tile — still far above the band",
  },
  {
    file: "TouchControls.tsx",
    value: "ATTACK_CENTER + Math.sin(angle) * ARC_RADIUS",
    count: 1,
    why: "an arc tile's centre; sin >= 0 over the arc, so it is never below ATTACK_CENTER",
  },
  {
    file: "TouchControls.tsx",
    value: "PASSIVE_CENTER.bottom - ABILITY_SIZE / 2",
    count: 1,
    why: "the 天生技 tile, positioned off PASSIVE_CENTER which sits inside the same arc block",
  },
  {
    file: "TouchControls.tsx",
    value: "bottom - ABILITY_SIZE / 2",
    count: 1,
    why: "the shared tile helper: `bottom` is the caller's centre, and every caller is one of the arc positions above",
  },
  {
    file: "components/CastNotice.tsx",
    value: "touch ? TOUCH_BOTTOM : DESKTOP_BOTTOM",
    count: 1,
    why: "DESKTOP_BOTTOM = 104 / TOUCH_BOTTOM = 190, both far above the band (the notice sits over the ability bar)",
  },
  {
    file: "panels/ChampSelectPanel.tsx",
    value: "HUD_STAMP_BAND + HUD_GAP",
    count: 1,
    why: "THE COLLISION THIS GUARD WAS REWRITTEN FOR. It used to be a bare `bottom: 6` inside a full-screen inset:0 layer — centred, 4px into the band, on top of the badge. It now DERIVES its offset from the band, so it moves if the band does",
  },
  {
    file: "panels/MatchEndPanel.tsx",
    value: '"18%"',
    count: 1,
    why: "a percentage of the settlement panel's height — nowhere near a 10px strip on any viewport",
  },
  {
    file: "panels/PrepClock.tsx",
    value: "PREP_CLOCK_BOTTOM",
    count: 1,
    why: "declared in panels/prepCountdown.ts and already guarded by prepClockDraftCollision.test.ts; it is a mid-screen pill, hundreds of px up",
  },
  {
    file: "platform/ChampionMarquee.tsx",
    value: '"max(46px',
    count: 1,
    why: "`max(46px, env(safe-area-inset-bottom))` — at least 46px up. (The scan splits on the comma inside max(); the floor is what matters)",
  },
  {
    file: "platform/HomeFooter.tsx",
    value: '"max(10px',
    count: 1,
    why: "`max(10px, env(safe-area-inset-bottom))` — the TIGHTEST thing in the app: its bottom edge lands exactly on the band's top edge, adjacent to the badge and not overlapping it. Lowering that 10 puts the login credits under the stamp",
  },
  {
    file: "mobile.css",
    value: "env(safe-area-inset-bottom",
    count: 1,
    why: "#hud-root's own coarse-pointer inset — the HUD LAYER, not a widget in it. The badge portals to <body> and applies the same inset itself (versionBadgeStyle marginBottom)",
  },
];

describe("nothing else claims the band — enumerated from the source tree", () => {
  it("every bottom: declaration under ui/ either clears the band or is answered for", () => {
    cover("version-badge-band");
    const decls = collectBottomDecls();
    // Non-vacuous: the tree really does declare a pile of bottom offsets.
    expect(decls.length).toBeGreaterThan(20);

    const key = (d: { file: string; value: string }): string => `${d.file} ${d.value}`;
    const needsReview = decls.filter((d) => d.px === null || d.px < HUD_STAMP_BAND);

    const found = new Map<string, number>();
    for (const d of needsReview) found.set(key(d), (found.get(key(d)) ?? 0) + 1);
    const ledger = new Map<string, LedgerRow>(BAND_LEDGER.map((r) => [key(r), r]));

    const undeclared: string[] = [];
    for (const [k, n] of found) {
      const row = ledger.get(k);
      const [file, value] = k.split(" ");
      if (!row) {
        undeclared.push(`${file}  bottom: ${value}  (x${n})`);
      } else if (row.count !== n) {
        undeclared.push(`${file}  bottom: ${value}  — ledger says x${row.count}, found x${n}`);
      }
    }
    expect(
      undeclared,
      "A `bottom:` offset under apps/client/src/ui is not accounted for against the build-stamp " +
        `band (the bottom ${HUD_STAMP_BAND}px, where the version badge paints on EVERY screen).\n` +
        "This guard reads the SOURCE TREE, not a list of HUD slots, because the list-of-slots " +
        "version of it missed ChampSelectPanel's bottom-centre hint sitting 4px inside the band.\n" +
        "Either move the element clear of the band (offset >= HUD_STAMP_BAND — prefer deriving it " +
        "from HUD_STAMP_BAND so it tracks the band), or add a BAND_LEDGER row saying why it cannot " +
        "collide (nested in a small box, world-anchored, a panel background the badge may ride over).\n" +
        "Offenders:\n  " +
        undeclared.join("\n  "),
    ).toEqual([]);

    // …and the ledger cannot rot: a row whose code moved or was deleted fails
    // just as loudly as an undeclared offset, so nobody inherits stale prose.
    const stale = BAND_LEDGER.filter((r) => !found.has(key(r))).map(
      (r) => `${r.file}  bottom: ${r.value}  — no longer present; delete this BAND_LEDGER row`,
    );
    expect(stale, `Stale BAND_LEDGER rows:\n  ${stale.join("\n  ")}`).toEqual([]);
  });

  it("the champ-select hint is clear of the band — the collision that motivated the rewrite", () => {
    cover("version-badge-band");
    const src = read("../panels/ChampSelectPanel.tsx");
    // The panel root really is a full-screen layer, which is WHY its `bottom`
    // offsets are viewport offsets. If that ever stops being true the reasoning
    // above changes, so it is asserted rather than remembered.
    expect(
      /position:\s*"absolute",\s*inset:\s*0,/.test(src),
      "ChampSelectPanel's root is no longer a full-screen inset:0 layer — re-derive whether its " +
        "bottom offsets are still measured from the viewport",
    ).toBe(true);
    expect(
      src.includes("bottom: HUD_STAMP_BAND + HUD_GAP"),
      "the champ-select bottom-centre hint must keep DERIVING its offset from HUD_STAMP_BAND; a " +
        "hard-coded number is what put it 4px inside the badge's band in the first place",
    ).toBe(true);
    expect(src).not.toMatch(/bottom:\s*[0-9]\s*,/); // no single-digit literal came back
  });
});
