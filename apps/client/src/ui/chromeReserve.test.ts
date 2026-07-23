/**
 * client-26 (hud-panel-cover) — task #107's safe-area contract, extended off
 * the match screen to every screen that draws its own top-right chrome.
 *
 * THE REPORTED BUG: in the LOBBY at ~1546px wide, 「⚙ Settings」and the audio
 * buttons rendered on top of one another. The lobby header ran to the right
 * edge in normal flow; the audio cluster is `position: fixed`, portaled to
 * <body> at Z_TOP, and NOTHING reserved the pixels it occupies.
 *
 * THE FIX UNDER TEST is a contract, not a magic number: the cluster publishes
 * the gutter it really occupies onto `:root` as --ggd-chrome-top-right-w/-h,
 * and every screen with top-right chrome reserves it. So the assertions here
 * are, in order:
 *
 *   1. the maths — measured box → published gutter, rounded UP;
 *   2. THE REGRESSION A CONSTANT WOULD FAIL: the published value tracks the
 *      cluster's ACTUAL measured width, so a cluster that gains or loses a
 *      button re-reserves itself, while a hard-coded 154px (the value that is
 *      correct TODAY) starts overlapping by 50px the moment a 4th button ships;
 *   3. the publish loop — a size change AND a position-only change (an
 *      orientation flip moving env(safe-area-inset-*)) both republish, and
 *      teardown really unsubscribes;
 *   4. the CSS a consumer ships is evaluated and compared against the pure
 *      `topRightReservePx`, so the two can never drift;
 *   5. THE GEOMETRIC ASSERTION, per screen: with the cluster mounted, the
 *      screen's chrome content-box right edge never crosses the cluster's left
 *      edge — at 1546 (the reported viewport), 1280, and phone-landscape 844 /
 *      667, with and without a 44px landscape notch inset;
 *   6. a source guard that each screen really consumes the property and that
 *      the deleted hard-coded reservation (CodexPage's `220px`) cannot return.
 *
 * ENV NOTE, stated plainly: the client's vitest runs in a `node` environment
 * (vite.config.ts `test.environment: "node"`, include `src/**\/*.test.ts`) and
 * jsdom is not installed, so there are NO real layout boxes to measure. Point 5
 * is therefore an exact evaluation of the SHIPPED CSS expression against the
 * SHIPPED cluster geometry (ui/audioClusterLayout), not a screenshot diff — it
 * fails on the pre-fix lobby header (reserve 0) and on any consumer that
 * reserves too little. Point 3 drives the real publish loop through injected
 * DOM seams, so the observer wiring is executed, not merely described.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import {
  CHROME_TOP_RIGHT_H,
  CHROME_TOP_RIGHT_W,
  TOP_RIGHT_FALLBACK_H,
  TOP_RIGHT_FALLBACK_W,
  chromeReserveFromBox,
  observeChromeReserve,
  publishChromeReserve,
  topRightClear,
  topRightClearPx,
  topRightReserve,
  topRightReservePx,
  type ChromeMeasureTarget,
  type ChromeReserveEnv,
} from "./chromeReserve";
import {
  AUDIO_BTN_GAP,
  AUDIO_BTN_SIZE,
  AUDIO_CLUSTER_BUTTONS,
  AUDIO_MENU_TOP,
  audioButtonsWidth,
} from "./audioClusterLayout";
import { HUD_EDGE } from "./hud/hudLayout";
import { AudioToggleView } from "./AudioToggle";

const UI_DIR = __dirname;

/** strip comments so prose about forbidden patterns cannot trip a source scan */
function readUi(rel: string): string {
  return readFileSync(join(UI_DIR, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

/* ────────────────────────────────────────────────────────────────────────────
 * A model of the real cluster: fixed to the top-right, `right: inset + 10`,
 * `top: inset + 12`, holding `buttons` 44px buttons. Every number comes from
 * ui/audioClusterLayout, so this cannot drift from what ships.
 * ──────────────────────────────────────────────────────────────────────────*/
function clusterBox(opts: { vw: number; buttons?: number; insetRight?: number; insetTop?: number; top?: number }) {
  const buttons = opts.buttons ?? AUDIO_CLUSTER_BUTTONS;
  const right = (opts.insetRight ?? 0) + HUD_EDGE;
  const top = (opts.insetTop ?? 0) + (opts.top ?? AUDIO_MENU_TOP);
  const width = audioButtonsWidth(buttons);
  return { left: opts.vw - right - width, bottom: top + AUDIO_BTN_SIZE };
}

/** The gutter the cluster occupies, measured from the viewport's right edge. */
function clusterGutter(opts: { vw: number; buttons?: number; insetRight?: number }): number {
  return opts.vw - clusterBox(opts).left;
}

/** A stub target + a recording stub env: the DOM seams `chromeReserve` needs. */
function harness(initial: { left: number; bottom: number }) {
  let box = initial;
  let vw = 1546;
  const written: Record<string, string> = {};
  const viewportCbs: Array<() => void> = [];
  const elementCbs: Array<() => void> = [];
  let viewportUnsubs = 0;
  let elementUnsubs = 0;

  const target: ChromeMeasureTarget = { getBoundingClientRect: () => box };
  const env: ChromeReserveEnv = {
    root: {
      setProperty: (n, v) => {
        written[n] = v;
      },
    },
    viewportWidth: () => vw,
    onViewportChange: (cb) => {
      viewportCbs.push(cb);
      return () => {
        viewportUnsubs += 1;
      };
    },
    onElementResize: (_el, cb) => {
      elementCbs.push(cb);
      return () => {
        elementUnsubs += 1;
      };
    },
  };

  return {
    target,
    env,
    written,
    setBox: (b: { left: number; bottom: number }) => {
      box = b;
    },
    setViewportWidth: (w: number) => {
      vw = w;
    },
    fireViewport: () => viewportCbs.forEach((c) => c()),
    fireResize: () => elementCbs.forEach((c) => c()),
    unsubs: () => ({ viewport: viewportUnsubs, element: elementUnsubs }),
    publishedW: () => Number(/^(-?[\d.]+)px$/.exec(written[CHROME_TOP_RIGHT_W] ?? "")?.[1] ?? NaN),
    publishedH: () => Number(/^(-?[\d.]+)px$/.exec(written[CHROME_TOP_RIGHT_H] ?? "")?.[1] ?? NaN),
  };
}

/**
 * Evaluate the CSS a consumer actually ships. Deliberately strict: a `var()`
 * without a fallback, or any shape this contract does not produce, throws —
 * so the test can never silently pass over an expression it did not understand.
 */
function evalCssPx(expr: string, published: number | null): number {
  let s = expr.replace(/var\(--[a-z-]+,\s*(-?[\d.]+)px\)/g, (_m, fb: string) =>
    `${published ?? Number(fb)}px`,
  );
  if (s.includes("var(")) throw new Error(`unresolvable var (missing fallback?): ${expr}`);
  s = s.replace(/calc\(\s*(-?[\d.]+)px\s*([+-])\s*(-?[\d.]+)px\s*\)/g, (_m, a: string, op: string, b: string) =>
    `${op === "+" ? Number(a) + Number(b) : Number(a) - Number(b)}px`,
  );
  s = s.replace(/max\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/g, (_m, a: string, b: string) =>
    `${Math.max(Number(a), Number(b))}px`,
  );
  const m = /^\s*(-?[\d.]+)px\s*$/.exec(s);
  if (!m) throw new Error(`unevaluatable CSS: ${expr} → ${s}`);
  return Number(m[1]);
}

describe("top-right chrome reserve — the published rect (client-26)", () => {
  it("publishes a GUTTER from the viewport's right edge, so safe-area is counted once", () => {
    cover("hud-panel-cover");
    // left edge 1392 on a 1546 viewport → 154px of gutter, not the bare 144px
    // of button width: the corner gap and any safe-area inset are already in it.
    const r = chromeReserveFromBox({ left: 1392, bottom: 56 }, 1546);
    expect(r.w).toBe(154);
    expect(r.h).toBe(56);
    // a landscape notch widens the gutter without the consumer knowing about env()
    const notched = chromeReserveFromBox(clusterBox({ vw: 1546, insetRight: 44 }), 1546);
    expect(notched.w).toBe(154 + 44);
  });

  it("rounds UP and never goes negative (fractional zoom must not under-reserve)", () => {
    cover("hud-panel-cover");
    expect(chromeReserveFromBox({ left: 1391.4, bottom: 55.2 }, 1546)).toEqual({ w: 155, h: 56 });
    // a box measured off-screen (never rendered) reserves nothing rather than
    // a negative padding that CSS would drop on the floor
    expect(chromeReserveFromBox({ left: 2000, bottom: -10 }, 1546)).toEqual({ w: 0, h: 0 });
  });

  it("the pre-measurement fallbacks are DERIVED from the cluster, not typed in", () => {
    cover("hud-panel-cover");
    expect(TOP_RIGHT_FALLBACK_W).toBe(HUD_EDGE + audioButtonsWidth(AUDIO_CLUSTER_BUTTONS));
    expect(TOP_RIGHT_FALLBACK_H).toBe(AUDIO_MENU_TOP + AUDIO_BTN_SIZE);
    // and they agree with the modelled real cluster on the reported viewport
    expect(TOP_RIGHT_FALLBACK_W).toBe(clusterGutter({ vw: 1546 }));
  });
});

describe("the reserve tracks the MEASURED cluster, not a constant (client-26)", () => {
  /**
   * THE regression the hard-coded-number approach fails. The cluster's button
   * row is conditional; a constant is only ever right for the count that
   * happened to ship with it.
   */
  it("a cluster that gains or loses a button re-publishes its real width", () => {
    cover("hud-panel-cover");
    const vw = 1546;
    const h = harness(clusterBox({ vw, buttons: 3 }));
    h.setViewportWidth(vw);

    const stop = observeChromeReserve(h.target, h.env);
    expect(h.publishedW()).toBe(HUD_EDGE + audioButtonsWidth(3)); // 154

    // the 🎚 disclosure is dropped (a device with nothing to disclose)
    h.setBox(clusterBox({ vw, buttons: 2 }));
    h.fireResize();
    expect(h.publishedW()).toBe(HUD_EDGE + audioButtonsWidth(2)); // 104
    expect(154 - 104).toBe(AUDIO_BTN_SIZE + AUDIO_BTN_GAP);

    // and a 4th control arrives
    h.setBox(clusterBox({ vw, buttons: 4 }));
    h.fireResize();
    expect(h.publishedW()).toBe(HUD_EDGE + audioButtonsWidth(4)); // 204
    stop();
  });

  it("PROOF the constant fails: a 4-button cluster overlaps a 154px hard-coded pad", () => {
    cover("hud-panel-cover");
    const vw = 1546;
    const four = clusterGutter({ vw, buttons: 4 });
    // the "obviously correct" constant, frozen at today's 3 buttons
    const frozen = TOP_RIGHT_FALLBACK_W;
    const headerRightEdge = vw - frozen;
    expect(headerRightEdge).toBeGreaterThan(vw - four); // header runs UNDER the cluster
    expect(four - frozen).toBe(AUDIO_BTN_SIZE + AUDIO_BTN_GAP); // by 50px

    // the measured contract does not: it reserves exactly what is there
    expect(topRightReservePx(four)).toBe(four);
    expect(vw - topRightReservePx(four)).toBe(vw - four);
  });
});

describe("the publish loop (client-26)", () => {
  it("republishes on a SIZE change and on a POSITION-only change", () => {
    cover("hud-panel-cover");
    const vw = 1546;
    const h = harness(clusterBox({ vw }));
    h.setViewportWidth(vw);
    const stop = observeChromeReserve(h.target, h.env);
    expect(h.publishedW()).toBe(154);
    expect(h.publishedH()).toBe(AUDIO_MENU_TOP + AUDIO_BTN_SIZE);

    // Orientation flip: env(safe-area-inset-right) becomes 44 and the cluster
    // MOVES without changing size — a ResizeObserver alone never sees this,
    // which is why the viewport subscription exists.
    h.setBox(clusterBox({ vw, insetRight: 44, insetTop: 12 }));
    h.fireViewport();
    expect(h.publishedW()).toBe(154 + 44);
    expect(h.publishedH()).toBe(AUDIO_MENU_TOP + 12 + AUDIO_BTN_SIZE);

    // Entering a match drops the cluster into its declared HUD band: same
    // width, lower bottom — the vertical half of the contract has to follow.
    h.setBox(clusterBox({ vw, top: 78 }));
    h.fireViewport();
    expect(h.publishedH()).toBe(78 + AUDIO_BTN_SIZE);
    stop();
  });

  it("teardown unsubscribes BOTH sources; a null target/env is a safe no-op", () => {
    cover("hud-panel-cover");
    const h = harness(clusterBox({ vw: 1546 }));
    const stop = observeChromeReserve(h.target, h.env);
    expect(h.unsubs()).toEqual({ viewport: 0, element: 0 });
    stop();
    expect(h.unsubs()).toEqual({ viewport: 1, element: 1 });

    expect(() => observeChromeReserve(null, h.env)()).not.toThrow();
    expect(() => observeChromeReserve(h.target, null)()).not.toThrow();
  });

  it("publishes onto the documented property names, in px", () => {
    cover("hud-panel-cover");
    const h = harness({ left: 1400, bottom: 60 });
    h.setViewportWidth(1546);
    publishChromeReserve(h.target, h.env);
    expect(h.written[CHROME_TOP_RIGHT_W]).toBe("146px");
    expect(h.written[CHROME_TOP_RIGHT_H]).toBe("60px");
    expect(CHROME_TOP_RIGHT_W).toBe("--ggd-chrome-top-right-w");
    expect(CHROME_TOP_RIGHT_H).toBe("--ggd-chrome-top-right-h");
  });
});

describe("the CSS a consumer ships equals the pure model (client-26)", () => {
  const CASES = [
    { opts: {}, note: "flush consumer" },
    { opts: { min: 16 }, note: "consumer with its own 16px gutter" },
    { opts: { outerInset: 16 }, note: "consumer inside a 16px-padded shell" },
    { opts: { min: 16, outerInset: 16 }, note: "both" },
  ];

  it("resolves identically for a measured value AND for the fallback", () => {
    cover("hud-panel-cover");
    for (const { opts, note } of CASES) {
      for (const published of [null, 104, 154, 204, 198]) {
        expect(evalCssPx(topRightReserve(opts), published), `${note} @ ${published}`).toBe(
          topRightReservePx(published, opts),
        );
      }
    }
  });

  it("the vertical half resolves identically too", () => {
    cover("hud-panel-cover");
    for (const opts of [{}, { min: 64, gap: 8 }, { gap: 12 }]) {
      for (const published of [null, 56, 122, 140]) {
        expect(evalCssPx(topRightClear(opts), published)).toBe(topRightClearPx(published, opts));
      }
    }
  });

  it("never yields a negative padding, and never drops below the consumer's own gutter", () => {
    cover("hud-panel-cover");
    expect(topRightReservePx(0, { outerInset: 16 })).toBe(0);
    expect(topRightReservePx(10, { min: 16 })).toBe(16);
    expect(evalCssPx(topRightReserve({ outerInset: 16 }), 0)).toBe(0);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * THE GEOMETRIC ASSERTION, per screen.
 * ──────────────────────────────────────────────────────────────────────────*/

/** Every screen that draws its own top-right chrome, and how it reserves. */
const SCREENS = [
  {
    id: "lobby header",
    file: "platform/LobbyScreen.tsx",
    // the header row lives inside the lobby shell's `padding: 16`
    reserve: { outerInset: 16 },
    outerInset: 16,
  },
  {
    id: "codex header",
    file: "codex/CodexPage.tsx",
    // flush to the viewport; keeps its own 16px gutter as a floor
    reserve: { min: 16 },
    outerInset: 0,
  },
  {
    id: "asset console header",
    file: "assets/AssetConsolePage.tsx",
    reserve: { min: 16 },
    outerInset: 0,
  },
  {
    id: "champ-select card shell",
    file: "panels/ChampSelectPanel.tsx",
    reserve: { min: 16 },
    outerInset: 0,
  },
] as const;

/** viewport widths under test — 1546 is the width the bug was reported at */
const WIDTHS = [1546, 1280, 1024, 844, 812, 667];
/** 0 = desktop / portrait phone; 44 = iPhone landscape notch side */
const INSETS = [0, 44];
/** the cluster's button count today, and the counts it could plausibly become */
const BUTTON_COUNTS = [2, 3, 4];

describe("GEOMETRY: no screen's top-right chrome intersects the cluster (client-26)", () => {
  it("every screen's content box stops at or before the cluster's left edge", () => {
    cover("hud-panel-cover");
    const failures: string[] = [];
    for (const screen of SCREENS) {
      for (const vw of WIDTHS) {
        for (const insetRight of INSETS) {
          for (const buttons of BUTTON_COUNTS) {
            const published = clusterGutter({ vw, buttons, insetRight });
            const clusterLeft = vw - published;
            // what the shipped CSS resolves to, evaluated exactly
            const pad = evalCssPx(topRightReserve(screen.reserve), published);
            const contentRight = vw - screen.outerInset - pad;
            if (contentRight > clusterLeft) {
              failures.push(
                `${screen.id} @ ${vw}px inset:${insetRight} buttons:${buttons} — ` +
                  `content right ${contentRight} > cluster left ${clusterLeft}`,
              );
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("FAILS on the pre-fix layout — the scan is not vacuous", () => {
    cover("hud-panel-cover");
    // the lobby header before this change: no reservation at all
    const vw = 1546;
    const published = clusterGutter({ vw });
    expect(vw - 16 - 0).toBeGreaterThan(vw - published); // ⚙ Settings under the cluster
    // …and the codex's deleted 220px constant would have over-reserved by 66px
    // while still failing outright once a 4th button shipped on a notched phone
    const notchedFour = clusterGutter({ vw: 844, buttons: 4, insetRight: 44 });
    expect(notchedFour).toBeGreaterThan(220);
  });

  it("reserves no more than it must: the gap left over is never wasteful", () => {
    cover("hud-panel-cover");
    for (const screen of SCREENS) {
      const vw = 1546;
      const published = clusterGutter({ vw });
      const pad = evalCssPx(topRightReserve(screen.reserve), published);
      const slack = vw - published - (vw - screen.outerInset - pad);
      expect(slack, screen.id).toBeGreaterThanOrEqual(0);
      expect(slack, screen.id).toBeLessThanOrEqual(16); // at most the consumer's own gutter
    }
  });

  it("the lobby's right-aligned toasts pass UNDER the cluster with clearance", () => {
    cover("hud-panel-cover");
    for (const clusterTop of [AUDIO_MENU_TOP, 78, 96]) {
      const bottom = clusterTop + AUDIO_BTN_SIZE;
      const top = evalCssPx(topRightClear({ min: 64, gap: 8 }), bottom);
      expect(top).toBeGreaterThanOrEqual(bottom + 8);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * SOURCE GUARDS — the contract is only worth anything if the screens use it.
 * ──────────────────────────────────────────────────────────────────────────*/

describe("GUARD: publisher and consumers are really wired (client-26)", () => {
  it("the cluster wraps its PERSISTENT buttons in the measured group", () => {
    cover("hud-panel-cover");
    const html = renderToStaticMarkup(
      createElement(AudioToggleView, { bgmMuted: false, sfxMuted: false, onToggle: () => {} }),
    );
    expect(html).toContain('data-ggd-chrome="top-right"');
    // the three persistent buttons live INSIDE the measured group
    const group = html.slice(html.indexOf('data-ggd-chrome="top-right"'));
    expect(group).toContain("data-ggd-audio-expand");
    expect(group).toContain('data-bus="bgm"');
    expect(group).toContain('data-bus="sfx"');
  });

  it("the TRANSIENT tray stays OUTSIDE the measured group (it must not inflate the reserve)", () => {
    cover("hud-panel-cover");
    const cells = [
      { id: "master", label: "Master", ariaLabel: "Master volume", value: 1, min: 0, max: 1, step: 0.05, display: "100%", onInput: () => {} },
    ];
    const html = renderToStaticMarkup(
      createElement(AudioToggleView, {
        bgmMuted: false,
        sfxMuted: false,
        onToggle: () => {},
        cells,
        expanded: true,
      }),
    );
    expect(html).toContain("ggd-audio-tray");
    // the tray is emitted BEFORE the measured group opens, i.e. it is a sibling
    expect(html.indexOf("ggd-audio-tray")).toBeLessThan(html.indexOf('data-ggd-chrome="top-right"'));
  });

  it("AudioToggle observes that group and publishes", () => {
    cover("hud-panel-cover");
    const src = readUi("AudioToggle.tsx");
    expect(src).toMatch(/observeChromeReserve\(\s*groupRef\.current\s*,\s*browserChromeEnv\(\)\s*\)/);
    expect(src).toMatch(/groupRef=\{groupRef\}/);
  });

  it("every screen with top-right chrome CONSUMES the published property", () => {
    cover("hud-panel-cover");
    const missing: string[] = [];
    for (const screen of SCREENS) {
      const src = readUi(screen.file);
      if (!/chromeReserve/.test(src) || !/topRightReserve\(/.test(src)) missing.push(screen.file);
    }
    expect(missing).toEqual([]);
  });

  /**
   * A "reservation" is a right-pad wide enough to only be there to clear the
   * cluster — the narrowest cluster that could ever ship is 2 buttons + the
   * corner gap, so anything at or above that is the shape of the bug. Ordinary
   * inner padding (a 34px badge gutter on a champion card) is far below it and
   * is not flagged.
   */
  it("GUARD: no consumer hard-codes a right-pad instead of reading the property", () => {
    cover("hud-panel-cover");
    const RESERVATION_PX = HUD_EDGE + audioButtonsWidth(2); // 104
    const offenders: string[] = [];
    for (const screen of SCREENS) {
      const src = readUi(screen.file);
      for (const m of src.matchAll(/paddingRight:\s*"?(\d+)/g)) {
        if (Number(m[1]) >= RESERVATION_PX) offenders.push(`${screen.file}: paddingRight ${m[1]}`);
      }
      // and the shorthand form may not smuggle one back in either
      for (const m of src.matchAll(/padding:\s*"\d+px\s+(\d+)px/g)) {
        if (Number(m[1]) >= RESERVATION_PX) {
          offenders.push(`${screen.file}: padding shorthand reserves ${m[1]}px`);
        }
      }
      // the one paddingRight that IS a reservation must read the property
      expect(src, screen.file).toMatch(/paddingRight:\s*topRightReserve\(/);
    }
    expect(offenders).toEqual([]);
  });

  it("the deleted 220px codex reservation cannot come back", () => {
    cover("hud-panel-cover");
    expect(readUi("codex/CodexPage.tsx")).not.toContain("220px");
  });
});
