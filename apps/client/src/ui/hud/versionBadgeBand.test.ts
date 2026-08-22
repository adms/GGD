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
import { SHIPPED_HUD_CLUSTER, hudClusterRects } from "./hudBottomCluster";
import {
  VERSION_BADGE_BAND_PX,
  VERSION_BADGE_BAND_W_PX,
  versionBadgeStyle,
} from "@ggd/shared/versionBadge";
import {
  HUD_EDGE,
  HUD_PING_BAND_W,
  HUD_PING_CHIP_PAD_X,
  HUD_SLOTS,
  HUD_STAMP_BAND,
  HUD_STAMP_BAND_W,
  hudDisplacedRect,
  hudPingBandRect,
  hudPingChipContentPx,
  hudRectInViewport,
  hudRectsOverlap,
  hudSlotRect,
  hudStampBandRect,
  type HudSlotId,
  type HudViewport,
} from "./hudLayout";
import { estimateLabelPx, pingChipState, pingChipText } from "../pingReadout";

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
    // the badge on desktop. RE-POINTED (not deleted) 2026-07-30: the bar no
    // longer pins itself at all. It and the HP/MP plate are flex rows of ONE
    // container whose offset is a field, so the contract moved from a regex over
    // AbilityBar.tsx to the field itself — which is strictly better, because the
    // number is now read rather than parsed out of a string.
    const barBottom = SHIPPED_HUD_CLUSTER.clusterBottomPx;
    expect(
      barBottom,
      "the desktop ability bar must sit clear of the build-stamp band",
    ).toBeGreaterThanOrEqual(HUD_STAMP_BAND);
    // …and the cluster's own resolver agrees, on the viewport this was measured on
    const clusterBottomEdge =
      800 - hudClusterRects({ width: 1280, height: 800 }, false, {
        resources: true,
        abilities: true,
      }).cluster.y -
      hudClusterRects({ width: 1280, height: 800 }, false, {
        resources: true,
        abilities: true,
      }).cluster.h;
    expect(clusterBottomEdge).toBeGreaterThanOrEqual(HUD_STAMP_BAND);

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
 * THE PING BAND (task #272) — the OTHER end of the same 10px strip.
 *
 * The ping chip makes exactly the claim the badge makes ("on every screen") and
 * therefore inherits exactly the badge's obligations. It gets its own band so
 * the two reservations can be proven disjoint rather than assumed to be, and so
 * "it is only 47.5px wide on a 375px phone" is a number a test can check rather
 * than a thing somebody eyeballed once.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("the ping chip's band is reserved, disjoint, and empty (ping-chip-band)", () => {
  it("sits in the same bottom strip, hard left, and NEVER touches the stamp band", () => {
    cover("ping-chip-band");
    for (const vp of VIEWPORTS) {
      const ping = hudPingBandRect(vp);
      const stamp = hudStampBandRect(vp);
      expect(ping.y).toBe(stamp.y); // same row
      expect(ping.h).toBe(HUD_STAMP_BAND); // same height — one 10px strip total
      expect(ping.y + ping.h).toBe(vp.height); // flush with the bottom edge
      expect(ping.x).toBe(0); // hard left: see the style's comment on 375px
      expect(hudRectInViewport(ping, vp)).toBe(true);
      expect(
        hudRectsOverlap(ping, stamp),
        `${vp.width}x${vp.height}: the ping chip ${JSON.stringify(ping)} reaches into the build ` +
          `stamp's reservation ${JSON.stringify(stamp)} — the two would print over each other`,
      ).toBe(false);
      // …and it is never zero-width on a viewport the game is played on, or the
      // whole feature would be silently invisible where it matters most.
      expect(ping.w, `${vp.width}x${vp.height}: the chip has no room at all`).toBeGreaterThan(0);
      expect(ping.w).toBeLessThanOrEqual(HUD_PING_BAND_W);
    }
  });

  it("the narrowest guard viewport really is the binding constraint — MEASURED", () => {
    cover("ping-chip-band");
    // 375 wide: the centred 280px stamp band leaves (375−280)/2 = 47.5px per
    // side. That is the entire budget, and it is why the chip is at left:0 with
    // 4px padding rather than the badge's HUD_EDGE inset and 8px.
    expect(hudPingBandRect({ width: 375, height: 667 }).w).toBeCloseTo(47.5, 6);
    expect(hudPingChipContentPx(375)).toBeCloseTo(47.5 - HUD_PING_CHIP_PAD_X * 2, 6);
    // every other guard viewport is comfortable (capped by the chip's own max)
    expect(hudPingChipContentPx(667)).toBe(HUD_PING_BAND_W - HUD_PING_CHIP_PAD_X * 2);
    expect(hudPingChipContentPx(1920)).toBe(HUD_PING_BAND_W - HUD_PING_CHIP_PAD_X * 2);
    // a viewport narrower than the stamp band itself has NO room, and says so
    expect(hudPingBandRect({ width: 240, height: 320 }).w).toBe(0);
  });

  /**
   * THE ONE SLOT THAT ALREADY BREAKS THE BOTTOM GUTTER — found by this guard,
   * not by review, and it PREDATES the ping chip.
   *
   * `enemy-team` on coarse pointers stacks 4th in the top-left column, which at
   * 780x360 (the #151 landscape-phone breakpoint) puts it at y 290-356 — 6px
   * below `HUD_STAMP_BAND`'s top edge at 350, spanning x 10-160.
   *
   * The build-stamp guard could never see it: the stamp's reservation is
   * CENTRED (x 250-530 on that viewport), so an intruder at the left edge is
   * invisible to it. The ping chip claims the left end of the same strip, so it
   * is the first thing to look there.
   *
   * WHY IT IS LISTED RATHER THAN "FIXED" HERE. The slot's own note says its
   * touch height (66) was chosen to "clear even the 375px-tall landscape
   * viewport" — and at 375 it does (356 <= 365). 780x360 was added to the guard
   * set later and nobody re-derived it. Shrinking the reservation to 60 from
   * this file would make the guard green while the COMPONENT still paints 66px,
   * i.e. it would convert a visible 6px overlap into a lie in the registry.
   * That is a #107 decision about a panel in another lane
   * (ui/components/EnemyTeamPanel.tsx), so it is reported (docs/todo/
   * latency-visibility.md, `pc-09`) rather than quietly absorbed.
   *
   * The row is keyed tightly and proven NON-VACUOUS below, so it cannot become
   * a dumping ground: if the slot is fixed, this row fails as stale.
   */
  const GUTTER_INTRUDERS: readonly { id: HudSlotId; vp: HudViewport; touch: boolean }[] = [
    { id: "enemy-team" as HudSlotId, vp: { width: 780, height: 360 }, touch: true },
  ];

  const isIntruder = (id: HudSlotId, vp: HudViewport, touch: boolean): boolean =>
    GUTTER_INTRUDERS.some(
      (r) => r.id === id && r.vp.width === vp.width && r.vp.height === vp.height && r.touch === touch,
    );

  it("NO HUD slot reaches into the ping band either — every slot, both pointers", () => {
    cover("ping-chip-band");
    for (const vp of VIEWPORTS) {
      const band = hudPingBandRect(vp);
      for (const spec of HUD_SLOTS) {
        const id = spec.id as HudSlotId;
        for (const touch of [false, true]) {
          if (isIntruder(id, vp, touch)) continue;
          expect(
            hudRectsOverlap(hudSlotRect(id, vp, touch), band),
            `${vp.width}x${vp.height} touch=${touch}: slot "${id}" reaches into the ping chip's ` +
              "band. The bottom-left stack's lowest slot (gamepad) is supposed to END exactly on " +
              "the band's top edge — if that changed, move the slot, not the band.",
          ).toBe(false);
          if (spec.displaced === "relocate") {
            expect(
              hudRectsOverlap(hudDisplacedRect(id, vp, touch), band),
              `${vp.width}x${vp.height} touch=${touch}: slot "${id}" DISPLACED reaches into the ` +
                "ping chip's band",
            ).toBe(false);
          }
        }
      }
    }
  });

  it("the listed gutter intruder is REAL, is the only one, and its fault is VERTICAL", () => {
    cover("ping-band-gutter");
    // 1. every listed row still collides — a fixed slot fails as a stale row,
    //    exactly like BAND_LEDGER's stale check.
    for (const r of GUTTER_INTRUDERS) {
      const rect = hudSlotRect(r.id, r.vp, r.touch);
      expect(
        hudRectsOverlap(rect, hudPingBandRect(r.vp)),
        `GUTTER_INTRUDERS lists "${r.id}" at ${r.vp.width}x${r.vp.height} touch=${r.touch}, but it ` +
          "no longer collides — delete the row (and the docs/todo entry) instead of keeping stale prose",
      ).toBe(true);
      // 2. the fault is the slot crossing the reserved bottom gutter, NOT the
      //    chip being somewhere it should not be: the intrusion is measured
      //    against the band's TOP EDGE, which every slot in the app is supposed
      //    to clear regardless of where the chip sits.
      const intrusion = rect.y + rect.h - (r.vp.height - HUD_STAMP_BAND);
      expect(intrusion).toBeGreaterThan(0);
      expect(
        intrusion,
        "the intrusion grew past the whole reserved band — that is no longer a rounding-scale " +
          "#107 slip, it is a slot sitting on the bottom edge",
      ).toBeLessThanOrEqual(HUD_STAMP_BAND);
    }

    // 3. and NOTHING ELSE intrudes into the bottom gutter anywhere, at any
    //    width — the stronger statement the centred stamp band could not make.
    const others: string[] = [];
    for (const vp of VIEWPORTS) {
      for (const spec of HUD_SLOTS) {
        const id = spec.id as HudSlotId;
        for (const touch of [false, true]) {
          if (isIntruder(id, vp, touch)) continue;
          const rect = hudSlotRect(id, vp, touch);
          if (rect.y + rect.h > vp.height - HUD_STAMP_BAND) {
            others.push(`${vp.width}x${vp.height} touch=${touch} "${id}" bottom=${rect.y + rect.h}`);
          }
        }
      }
    }
    expect(
      others,
      "a HUD slot now reaches into the reserved bottom gutter. That gutter is the #107 corner " +
        "margin AND the build stamp's / ping chip's band; a slot in it will be painted over.\n  " +
        others.join("\n  "),
    ).toEqual([]);
  });

  it("every chip state still shows its NUMBER at 375px — the label ladder is not decorative", () => {
    cover("ping-chip-band");
    const budget = hudPingChipContentPx(375);
    const base = {
      showPing: true,
      netMode: "live" as const,
      netSnapshots: 10,
      pingSamples: 4,
      pingAgeMs: 0,
      snapshotGapMs: 33,
      jitterMs: 6,
    };
    // the worst case for width: a 4-digit ping in the "poor" state (longest
    // marker) and a 3-digit jitter.
    const worst = pingChipState({ ...base, pingMs: 4321, jitterMs: 250, connection: "poor" });
    const text = pingChipText(worst, budget);
    expect(estimateLabelPx(text)).toBeLessThanOrEqual(budget);
    expect(text, "the ping number must survive every width — colour is not the message").toContain(
      "999+",
    );

    // and a normal good ping keeps its unit at the same width
    const good = pingChipState({ ...base, pingMs: 42, connection: "good" });
    expect(pingChipText(good, budget)).toBe("42ms");
    expect(estimateLabelPx(pingChipText(good, budget))).toBeLessThanOrEqual(budget);

    // on a desktop viewport the long form with BOTH numbers fits
    const wide = hudPingChipContentPx(1280);
    expect(pingChipText(good, wide)).toBe("順暢 42 ms · 抖動 6 ms");
    expect(estimateLabelPx(pingChipText(good, wide))).toBeLessThanOrEqual(wide);
  });

  it("the chip's own box is confined to the band — read from its real source", () => {
    cover("ping-chip-band");
    // Read as SOURCE (not imported) for the same reason the ability-bar check
    // above is: this file is pure geometry and must not drag React, the
    // settings store and the perf bus into a layout test.
    const src = read("../PingChip.tsx");
    expect(src).toMatch(/position:\s*"fixed"/);
    expect(src).toMatch(/bottom:\s*0,/);
    expect(src).toMatch(/left:\s*0,/);
    // content-box + an explicit band height: padding widens, never heightens
    expect(src).toMatch(/boxSizing:\s*"content-box"/);
    expect(src).toMatch(/height:\s*HUD_STAMP_BAND/);
    expect(src).toMatch(/overflow:\s*"hidden"/);
    // the property that makes painting above everything safe at any z-index
    expect(src).toMatch(/pointerEvents:\s*"none"/);
    // and the width cap is DERIVED from the same constants this test uses, so
    // the CSS and the arithmetic above cannot drift apart
    expect(src).toMatch(/HUD_PING_BAND_W - HUD_PING_CHIP_PAD_X \* 2/);
    expect(src).toMatch(/HUD_STAMP_BAND_W \/ 2 \+ HUD_PING_CHIP_PAD_X \* 2/);
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
 * Read ONE declaration value starting at `i`, respecting nesting and strings.
 *
 * ⚠️ THIS USED TO BE `([^,}\n;]+)` AND THAT WAS A HOLE (GH#291). A character
 * class stops at the FIRST comma — and the comma that matters is INSIDE
 * `env(safe-area-inset-bottom, 0px)`, so every derived template-literal offset
 * in the app truncated to the byte-identical prefix ``​`calc(env(safe-area-inset-bottom``.
 * The ledger key is `file + " " + value`, so three different bars (MarkBar +190,
 * SelfStatusBar +122, ZombieWaveBar dynamic) all keyed on a string that CONTAINED
 * NONE OF THEIR ARITHMETIC. Measured: moving MarkBar to `HUD_STAMP_BAND - 190`
 * dropped the whole bar ~180px below the viewport and this file stayed 12/12
 * green, because the truncated key still matched.
 *
 * A depth-aware read is the fix rather than a cleverer regex: the terminator is
 * a `,` / `;` / `}` at NESTING DEPTH ZERO, which no regex can express. Newlines
 * are NOT terminators — CastNotice.tsx puts its value on the line after the
 * colon, and stopping at the newline would silently truncate it exactly the way
 * the comma did. An interface's `bottom: number` still terminates on its own `;`
 * or the closing `}` and is dropped by the primitive-type filter below.
 */
function readDeclValue(src: string, i: number): string {
  let depth = 0;
  let out = "";
  while (i < src.length) {
    const c = src[i]!;
    if (depth === 0 && (c === "," || c === ";" || c === "}")) break;
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < src.length) {
        const d = src[i]!;
        if (d === "\\") {
          out += src.slice(i, i + 2);
          i += 2;
          continue;
        }
        // `${…}` may itself contain quotes and braces — count braces through it
        if (quote === "`" && d === "$" && src[i + 1] === "{") {
          const start = i;
          let braces = 0;
          i += 1;
          while (i < src.length) {
            if (src[i] === "{") braces++;
            else if (src[i] === "}") {
              braces--;
              if (braces === 0) {
                i++;
                break;
              }
            }
            i++;
          }
          out += src.slice(start, i);
          continue;
        }
        out += d;
        i++;
        if (d === quote) break;
      }
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    out += c;
    i++;
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
  const decl = /(?<![-\w])bottom:\s*/g;
  const out: BottomDecl[] = [];
  for (const full of walk(UI_ROOT)) {
    const src = readFileSync(full, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    for (const m of src.matchAll(decl)) {
      const value = readDeclValue(src, m.index + m[0].length)
        .trim()
        .replace(/\s+/g, " ");
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
    count: 6,
    why: "tile-internal chrome — the name strip, the 被動/主動 pill, the passive-ICD chip (GH#573, 2026-08-23: the countdown that paints inside a passive's own tile while its internal cooldown runs) and the three cast fills — each absolutely positioned inside its own ~52px ability tile. The BAR's own viewport offset is `bottom: 14`, asserted numerically above",
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
  {
    // Task #272. The FIRST declaration that is deliberately viewport-pinned
    // INSIDE the band and is not a panel background — so it is the first that
    // has to earn the ledger row rather than explain it away.
    file: "PingChip.tsx",
    value: "0",
    count: 1,
    why:
      "the always-on ping chip, which shares this strip with the build stamp by design " +
      "(「跟版本號一樣都一直畫面上」). It is confined to the band exactly as the badge is " +
      "— content-box at height HUD_STAMP_BAND, overflow:hidden, pointer-events:none — and " +
      "occupies the LEFT end, outside the badge's centred HUD_STAMP_BAND_W reservation. " +
      "`hudPingBandRect` declares that sub-band and the ping-chip-band suite above proves, " +
      "on all eight guard viewports and both pointer types, that it overlaps neither the " +
      "stamp band nor any HUD slot (normal or displaced). It was NOT hidden in " +
      "packages/shared to dodge this scan: putting the geometry where the scanner cannot " +
      "see it is a hole, not a technique.",
  },

  // ── values the scan cannot evaluate ───────────────────────────────────────
  //
  // ⭐ 2026-08-10 —— 這七列在 HUD 縮放（owner 的七檔位）之後**全部重新驗過**，
  // 不是把舊 `why` 抄到新字串上。改變的是前提：以前這些是**常數**（84 / 122 /
  // 58），現在是 `touchMetrics()` 的欄位，最小檔位會把它們乘 0.1。
  //
  // ⛔ 而那正好戳破一個真的缺陷：`hudScale(84,"min") = 8` **比帶子還低**，
  // 也就是最小檔位會把攻擊鈕壓進版本徽章底下。所以 `TouchControls.touchMetrics`
  // 現在把錨點夾在 `HUD_STAMP_BAND + attackSize/2` 之上 —— 下面每一列的
  // 「還在帶子之上」都是**由那道下限保證的**，不再是「84 很大所以沒事」。
  {
    file: "TouchControls.tsx",
    value: "m.attackCenter - m.attackSize / 2",
    count: 1,
    why: "攻擊鈕自己的底邊 —— 手機上最低的那個東西。`touchMetrics` 的 anchorFloor 就是照這條式子定的（`HUD_STAMP_BAND + attackSize/2`），所以它恰好等於帶子的上緣、永遠不低於它",
  },
  {
    file: "TouchControls.tsx",
    value: "m.attackCenter + m.arcRadius + m.s(46)",
    count: 1,
    why: "技能弧的標籤列，比它量測基準的攻擊鈕**更上面**（arcRadius 與 46 都 >= 0）",
  },
  {
    file: "TouchControls.tsx",
    value: "m.attackCenter + m.arcRadius - m.abilitySize / 2",
    count: 1,
    why: "弧上一格的底邊。⚠️ 縮放之後這不再是「顯然」的：`abilitySize` 走 `hudScaleTappable`（有 44px 下限）而 `arcRadius` 走 `hudScale`（沒有），所以最小檔位是 12.2 - 22 = **-9.8**，比 attackCenter 低。安全的理由是 attackCenter 自己被夾在 `HUD_STAMP_BAND + attackSize/2 = 10 + 22 = 32` 之上，32 - 9.8 = 22.2 > 10 —— 由 anchorFloor 保證，不是由這一項自己保證",
  },
  {
    file: "TouchControls.tsx",
    value: "m.attackCenter + Math.sin(angle) * m.arcRadius",
    count: 1,
    why: "弧上一格的**中心**；`angle` 掃過的區間 sin >= 0，所以永遠不低於 attackCenter，而後者已被 anchorFloor 夾住",
  },
  {
    file: "TouchControls.tsx",
    value: "m.attackCenter - m.abilitySize / 2",
    count: 1,
    why: "天生技格的底邊（它與攻擊鈕同高、只是往右排）。同上：最壞情況 32 - 22 = 22 > 10",
  },
  {
    file: "TouchControls.tsx",
    value: "bottom - m.abilitySize / 2",
    count: 1,
    why: "共用的格子輔助式：`bottom` 是呼叫端的中心，而每一個呼叫端都是上面那幾個弧位置之一",
  },
  {
    file: "components/CastNotice.tsx",
    value:
      "hudCastNoticeBottom(touch, { resources: true, abilities: !touch }) + " +
      "(touch ? TOUCH_EXTRA : 0)",
    count: 1,
    why:
      "the refusal line rides above the bottom cluster, so its offset is DERIVED " +
      "from it: `hudCastNoticeBottom(touch, rows)` = clusterBottom + the rows + " +
      "castNoticeGapPx (162 desktop / 190 touch with the shipped fields). It cannot " +
      "reach the band by arithmetic — every term is >= 0 and clusterBottomPx alone " +
      "already clears HUD_STAMP_BAND, which the first test in this file asserts " +
      "numerically. It used to be a bare `DESKTOP_BOTTOM = 104`, and that constant " +
      "is now INSIDE the HP/MP plate; hudBottomCluster.test.ts pins the clearance.",
  },
  {
    file: "hud/BottomCluster.tsx",
    value: "touch ? tuning.clusterTouchBottomPx : tuning.clusterBottomPx",
    count: 1,
    why:
      "THE bottom-centre column (HP/MP plate + ability row, owner 2026-07-30 " +
      "「緊鄰但不重疊」). Its offset is a bounded FIELD, not a literal, which is why " +
      "the scanner cannot fold it — and the bound is what makes it safe: " +
      "`clusterBottomPx` ships at 14 with a floor of 0, so the guard cannot rely on " +
      "the default alone. The numeric clearance against HUD_STAMP_BAND is asserted " +
      "in this file's 「bottom-centre CONTROLS clear the band」 test, from the field " +
      "rather than from a regex.",
  },
  {
    file: "panels/ChampSelectPanel.tsx",
    value: "HUD_STAMP_BAND + HUD_GAP",
    count: 1,
    why: "THE COLLISION THIS GUARD WAS REWRITTEN FOR. It used to be a bare `bottom: 6` inside a full-screen inset:0 layer — centred, 4px into the band, on top of the badge. It now DERIVES its offset from the band, so it moves if the band does",
  },
  {
    file: "hud/MapCornerLabel.tsx",
    value: "px(s.bottom) + box.height - MAP_CORNER_LABEL_HEIGHT",
    count: 1,
    why:
      "GH#329 的常駐地名。它**不是自己定位的** —— 整條式子是「小地圖那一格解析出來的 " +
      "bottom，再往上推一整個小地圖的高度，扣掉自己的 20px」，也就是貼在小地圖框的**上緣**。" +
      "所以它的下緣至少在 `minimap.height - 20` 之上：桌機 208-20 = 188px、" +
      "手機 116-20 = 96px，兩個都遠在 10px 的版號帶之上，而且是**推導**的 —— " +
      "小地圖搬家或改尺寸它自己會跟著走。⚠️ 掃描器評估不了這條式子（它包含一個函式呼叫 " +
      "與一個 import 進來的常數），所以這一列是答案不是壓制：真正會讓它掉進帶子裡的只有" +
      "「小地圖高度縮到 30px 以下」，而那時候小地圖自己早就不能用了。",
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
    value: '"max(46px, calc(env(safe-area-inset-bottom, 0px) + 42px))"',
    count: 1,
    why: "`max(46px, …)` — at least 46px up, and the env() term only pushes it further up",
  },
  {
    file: "platform/HomeFooter.tsx",
    value: '"max(10px, env(safe-area-inset-bottom, 0px))"',
    count: 1,
    why: "`max(10px, env(safe-area-inset-bottom))` — the TIGHTEST thing in the app: its bottom edge lands exactly on the band's top edge, adjacent to the badge and not overlapping it. Lowering that 10 puts the login credits under the stamp",
  },
  {
    // Sixth "green on both branches, red only after the merge" of this session.
    // #245's guard landed first; the lobby announcement popup landed second and
    // brought a `bottom:` the scanner cannot evaluate. The guard did exactly what
    // it exists to do — it refused to let an unevaluatable offset through silently
    // and named the file. This row is the answer, not a suppression.
    file: "platform/LobbyAnnouncement.tsx",
    value: "bottomChromeClear()",
    count: 1,
    why:
      "the popup's full-screen scrim, deliberately NOT inset:0 — it stops at " +
      "`calc(var(--ggd-chrome-bottom-h, 18px) + env(safe-area-inset-bottom, 0px))` so the " +
      "build stamp stays readable UNDER it. That is the same publish/consume shape " +
      "../chromeReserve uses, with a local fallback because VersionBadge belongs to another " +
      "lane and this module must not import it; if that lane ever publishes a measured height " +
      "this picks it up with no edit. Measured in a browser at 1280x800: scrim ends y=782, " +
      "badge paints 788-798. `bottomChromeClearPx` is the pure form of the same arithmetic and " +
      "is asserted numerically in announcements.test.ts, so this row is not the only proof.",
  },
  {
    file: "hud/SelfStatusBar.tsx",
    value: "`calc(env(safe-area-inset-bottom, 0px) + ${HUD_STAMP_BAND + 122}px)`",
    count: 1,
    why:
      "自身狀態列 (owner 2026-07-27 「看不出來自己暈眩」). The offset is " +
      "`HUD_STAMP_BAND + 122` — DERIVED from the band, not a magic number, so it " +
      "tracks the band if that ever grows. It cannot collide by arithmetic: the " +
      "bar's lowest pixel sits 122px above the band's top edge, and it stacks " +
      "UPWARD (flex-column, bottom-anchored), so more rows move it further away, " +
      "never closer. It lands here rather than being cleared automatically because " +
      "the scan reads source, not a rendered layout, and cannot fold a template " +
      "literal into px — but the KEY now carries the whole declaration (GH#291), " +
      "and the 「derived bottom-anchored bars」 test below re-derives the +122 " +
      "arithmetically, so this row is prose ON TOP OF a check, not instead of one.",
  },
  {
    file: "hud/ZombieWaveBar.tsx",
    value: "`calc(env(safe-area-inset-bottom, 0px) + ${zombieBarBottom(touch)}px)`",
    count: 1,
    why:
      "殭屍來襲 + 已擊殺數 (task #258). The offset is `zombieBarBottom(touch)` = " +
      "`hudStackEnd(\"bottom-left\", touch, {skipTransient:true}) + HUD_GAP` — DERIVED from " +
      "the corner registry, not a number, so it starts exactly where the bottom-left " +
      "stack ends and moves if that stack does. It cannot reach the band by " +
      "arithmetic: `hudStackEnd` starts at HUD_EDGE and only grows, and " +
      "HUD_STAMP_BAND === HUD_EDGE is pinned by the first test in this file, so the " +
      "offset is always >= the band height, and the bar stacks UPWARD from there. " +
      "The scan cannot fold a call into px, which is why it lands here rather than " +
      "being cleared automatically — but the KEY now carries the whole declaration " +
      "(GH#291), so re-pointing it at another helper fails as an undeclared offset. " +
      "zombieWave.test.ts asserts the clearance numerically on every guard viewport.",
  },
  {
    file: "hud/MarkBar.tsx",
    value: "`calc(env(safe-area-inset-bottom, 0px) + ${HUD_STAMP_BAND + 190}px)`",
    count: 1,
    why:
      "具名標記層數列 (task #278, 十二道試煉). THE THIRD MEMBER of the same family as " +
      "SelfStatusBar and ZombieWaveBar above, and THE ONE THAT EXPOSED GH#291: the scan " +
      "used to split on the comma inside `env(safe-area-inset-bottom, 0px)`, so all three " +
      "bars keyed on the byte-identical prefix ``calc(env(safe-area-inset-bottom`` and " +
      "moving this bar off the bottom of the screen kept the suite green. The key is now " +
      "the WHOLE declaration. The offset is " +
      "`calc(env(safe-area-inset-bottom, 0px) + ${HUD_STAMP_BAND + 190}px)` — DERIVED from " +
      "the band, not a magic number, so it tracks the band if that ever grows. It cannot " +
      "collide by arithmetic: `env()` is non-negative, so the bar's lowest pixel sits at " +
      "least 190px above the band's top edge, and it stacks UPWARD (flex-column, " +
      "bottom-anchored) so more mark rows move it further away, never closer. 190 > the " +
      "122 SelfStatusBar uses, which is what puts it directly above that bar as its module " +
      "doc claims. Like SelfStatusBar it is NOT a hudLayout corner slot, so the slot-rect " +
      "suites above cannot see it and this row is its only account.",
  },
  {
    file: "mobile.css",
    value: "env(safe-area-inset-bottom, 0px)",
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

  /**
   * THE BAND-DERIVED BARS, CHECKED AS ARITHMETIC (GH#291).
   *
   * The ledger key above now carries the whole declaration, so nobody can move
   * one of these bars WITHOUT this file failing. That closes the silent hole,
   * but it leaves the offset itself defended by a ledger `why` — prose, which
   * has an expiry date. This re-derives the ones that are stated in terms of
   * HUD_STAMP_BAND straight out of the declaration the scan read, so
   * `HUD_STAMP_BAND - 190` fails on the ARITHMETIC as well as on the key.
   *
   * ZombieWaveBar is deliberately not evaluable here (its offset comes from the
   * corner registry via `zombieBarBottom`); zombieWave.test.ts pins that one
   * numerically on every guard viewport.
   */
  const DERIVED_BAR = /^`calc\(env\(safe-area-inset-bottom, 0px\) \+ \$\{(.+)\}px\)`$/;

  it("the band-derived bottom bars really do clear the band — arithmetic, not prose", () => {
    cover("version-badge-band");
    const family = collectBottomDecls().filter((d) => DERIVED_BAR.test(d.value));
    expect(
      family.length,
      "the `calc(env(safe-area-inset-bottom, 0px) + ${…}px)` bar family vanished — this check " +
        "has nothing left to read, which is exactly how it would go quietly vacuous",
    ).toBeGreaterThanOrEqual(3);

    let evaluated = 0;
    for (const d of family) {
      const expr = DERIVED_BAR.exec(d.value)![1]!;
      const m = /^HUD_STAMP_BAND\s*([+-])\s*(\d+(?:\.\d+)?)$/.exec(expr);
      if (!m) continue; // not band-derived — the key still guards it
      evaluated++;
      const px = HUD_STAMP_BAND + (m[1] === "+" ? 1 : -1) * Number(m[2]);
      expect(
        px,
        `${d.file}: bottom is \`${expr}\` = ${px}px, which is INSIDE (or below) the reserved ` +
          `bottom ${HUD_STAMP_BAND}px band — the version badge paints over it on every screen. ` +
          "A bar anchored to the viewport bottom must sit at or above the band's top edge.",
      ).toBeGreaterThanOrEqual(HUD_STAMP_BAND);
    }
    expect(
      evaluated,
      "no member of the bar family states its offset as `HUD_STAMP_BAND ± N` any more, so this " +
        "check evaluated nothing. Re-derive it rather than deleting it",
    ).toBeGreaterThanOrEqual(2);
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
