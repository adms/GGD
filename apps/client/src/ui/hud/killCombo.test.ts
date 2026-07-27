/**
 * 連殺 COMBO — the DISPLAY half.
 *
 * The sim already proves the number is right (packages/shared/src/sim/combat/
 * killCombo.test.ts). What can still go wrong here is this repo's #1 failure —
 * 「做了但玩家拿不到」 — and it has five shapes, so there are five families of
 * guard below, each one written so that REMOVING the thing it guards turns it
 * red:
 *
 *   ① drawn off-screen / on top of something    → `where it lands`
 *   ② computed but never delivered to the HUD   → `the wire → the store`
 *   ③ deletable from the render tree, still green → `the mounted HUD`
 *   ④ asserted in the wrong direction            → every expiry test asserts
 *                                                  the NULL, not the value
 *   ⑤ testing something that is not the thing    → the view is RENDERED with
 *                                                  renderToStaticMarkup and the
 *                                                  digits are read back out
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ WHAT THE FIRST VERSION OF THIS FILE GOT WRONG (fixed here)
 *
 * `KillCombo.tsx` exports TWO things — `KillComboView` (pure props→markup) and
 * `KillCombo` (the container HudRoot actually mounts: the combat/couch gate, the
 * expiry poll, the placement). Every test imported the VIEW. Not one imported
 * the CONTAINER. MEASURED: putting `return null` at the top of `KillCombo` — the
 * player never sees a combo number again — left all 30 tests green.
 *
 * What claimed to guard the mount was `expect(src).toMatch(/<KillCombo\s*\/>/)`,
 * a TEXT SCAN of HudRoot.tsx. That proves a tag was typed into a file. It does
 * not prove the tag produces a single pixel, and it is exactly failure shape ③
 * wearing the costume of a guard.
 *
 * The replacement renders the real thing: `<HudRoot />` and `<KillCombo />` go
 * through react-dom/server against the REAL store, and the digits are read back
 * out of the markup. `return null` anywhere in that path is now four failures.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ WHAT THE SECOND VERSION GOT WRONG (fixed here): AN INVISIBLE STRING
 *
 * Rendering the container was the right move; reading `html.toContain("12 連殺")`
 * off the RAW markup was not. `KillCombo.tsx` carries
 * `aria-label={`${killComboText(view.count)} ${view.label}`}` — so the digits
 * are in the markup TWICE, once where a player can read them and once inside an
 * attribute that paints nothing. MEASURED: empty BOTH visible spans
 * (`{killComboText(view.count)}` → `{""}` and `{view.label}` → `{""}`), leaving
 * a blank box on screen, and 37/37 stayed green off the aria-label alone.
 *
 * That is failure shape ⑤ again, one layer down: the previous version scanned
 * SOURCE, this one scanned MARKUP ATTRIBUTES. Neither is a pixel.
 *
 * So every "the player sees it" assertion now runs through `visibleText()`,
 * which deletes `<style>` bodies and every tag WITH its attributes and keeps
 * only the text nodes a browser would paint. The aria-label is NOT removed from
 * the component — #252 is adding accessible names, not taking them away — it is
 * simply no longer able to answer for the visible text, and one test asserts
 * both halves separately so neither can stand in for the other.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  KILL_COMBO_EVENT,
  KILL_COMBO_WINDOW_MS,
  KILL_COMBO_MIN_SHOWN,
} from "@ggd/shared/sim/combat/killCombo";
import {
  KILL_COMBO_EXIT_MS,
  KILL_COMBO_MIN_H,
  KILL_COMBO_MIN_W,
  killComboCollisions,
  killComboDisplay,
  killComboRect,
  killComboText,
  killComboTier,
  type KillComboState,
} from "./killComboModel";
import {
  comboNowMs,
  hudStore,
  localKillComboCount,
  recordKillComboEvent,
  resetHudStore,
  type HudState,
  type LocalPlayerView,
} from "../../net/RoomStore";
import { stripComments } from "@ggd/shared/testkit/stripComments";
import { KillCombo, KillComboView } from "./KillCombo";
import { HudRoot } from "../HudRoot";
// The real frame-loop drain. GameApp cannot be CONSTRUCTED headlessly, but the
// module imports fine and `drainNetworkEvents` / `handleDrainedEvent` live on
// the prototype precisely so this file can run them — see "THE DRAIN, ACTUALLY
// RUN" below for the mutation that made a source scan insufficient.
import { GameApp } from "../../GameApp";
import { hudTouch } from "./HudSlot";
import {
  HUD_SLOTS,
  hudRectInViewport,
  hudRectsOverlap,
  hudSlotRect,
  hudStampBandRect,
  type HudRect,
  type HudSlotId,
  type HudViewport,
} from "./hudLayout";
import { ABILITY_CLUSTER_H, ABILITY_CLUSTER_W } from "../controlLegendModel";

const clientSrc = (p: string): string => readFileSync(join(__dirname, "..", "..", p), "utf8");

/**
 * The guard viewports, mirrored from `hudLayout.test.ts`'s own list — a 375px
 * tall window is a phone in landscape, so it is exercised with `touch: true`,
 * and the desktop sizes with `touch: false`. Getting that pairing wrong is how
 * a layout test comes to "prove" a configuration nobody ever ships.
 */
const VIEWPORTS = [
  { width: 667, height: 375, touch: true },
  { width: 780, height: 360, touch: true },
  { width: 812, height: 375, touch: true },
  { width: 852, height: 393, touch: true },
  { width: 375, height: 667, touch: true },
  { width: 1280, height: 720, touch: false },
  { width: 1546, height: 900, touch: false },
  { width: 1920, height: 1080, touch: false },
];

/**
 * SQUEEZED windows, where the centre corridor really is contested.
 *
 * These exist because the guard above would otherwise be VACUOUS about half the
 * placement logic: at every shipping viewport a 260px box centred in the middle
 * of the screen clears the corner stacks whether or not the side-scan runs, so
 * deleting the scan changes nothing and a green tick would certify code that
 * does nothing. Resize a desktop browser to a 500-square and the top-left
 * enemy-team panel (10..194 wide, 168..324 down) reaches straight into the
 * counter's band — the scan is what turns that into "no room" instead of a
 * number painted over the enemy HP bars.
 *
 * A null answer is expected and fine here; a COLLISION is not.
 */
const SQUEEZED = [
  { width: 500, height: 500, touch: false },
  { width: 560, height: 520, touch: false },
  { width: 420, height: 560, touch: false },
];

const state = (count: number, atMs = 0, seq = 1): KillComboState => ({ count, atMs, seq });

/**
 * THE ONLY THING A PLAYER CAN READ: the markup's text nodes, with every tag —
 * and therefore every ATTRIBUTE — deleted, plus the `<style>` bodies (scoped
 * keyframes are CSS, not a sentence anyone reads).
 *
 * ⚠️ THE MUTATION THIS EXISTS FOR: blank the two visible spans in
 * `KillComboView` and leave the `aria-label` alone. The raw markup still says
 * 「12 連殺」 — inside an attribute — while the screen shows an empty box. Every
 * assertion that goes through here dies on that; every assertion that reads
 * `html` directly does not, which is why the visible-text ones all use this.
 *
 * Deliberately NOT a DOM parse: this suite runs in the node env with no DOM (see
 * the first test in "the mounted HUD really paints it"), and `renderToStaticMarkup`
 * emits well-formed tags, so a regex strip is exact here.
 */
function visibleText(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ① / ④  LIFETIME — the 5-second window, seen from the screen
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("how long it stays up", () => {
  it("uses the SIM's window, not a second opinion", () => {
    // Imported, not restated. If the sim's 5 s ever moves, this moves with it —
    // which is the whole reason the constant is exported from shared.
    expect(KILL_COMBO_WINDOW_MS).toBe(5000);
  });

  it("is up through the whole window", () => {
    expect(killComboDisplay(state(4), 0)?.count).toBe(4);
    expect(killComboDisplay(state(4), 4999)?.phase).toBe("live");
    expect(killComboDisplay(state(4), KILL_COMBO_WINDOW_MS)?.phase).toBe("live");
  });

  it("plays an exit, then GOES AWAY", () => {
    // ⚠️ THE MUTATION: delete the `age > WINDOW + EXIT` line in
    // `killComboDisplay` (or make the window infinite) and the last assertion
    // fails — the final combo of the round would otherwise sit on screen for
    // the rest of the match.
    const mid = killComboDisplay(state(9), KILL_COMBO_WINDOW_MS + KILL_COMBO_EXIT_MS / 2);
    expect(mid?.phase).toBe("out");
    expect(mid!.opacity).toBeGreaterThan(0);
    expect(mid!.opacity).toBeLessThan(1);
    expect(killComboDisplay(state(9), KILL_COMBO_WINDOW_MS + KILL_COMBO_EXIT_MS + 1)).toBeNull();
    expect(killComboDisplay(state(9), 99_999)).toBeNull();
  });

  it("shows nothing without a chain, and nothing at all for no state", () => {
    expect(KILL_COMBO_MIN_SHOWN).toBe(2);
    expect(killComboDisplay(state(1), 0)).toBeNull(); // one kill is not a combo
    expect(killComboDisplay(state(2), 0)).not.toBeNull();
    expect(killComboDisplay(null, 0)).toBeNull();
  });

  it("a clock that ran backwards shows nothing, never a stuck number", () => {
    expect(killComboDisplay(state(7, 5000), 4000)).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * DECISION 2 — a big number must not look like a small one
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("tiers (owner: 50 連殺的字級跟 3 連殺不該一樣)", () => {
  it("steps at 2 / 5 / 10 / 20 / 50", () => {
    expect(killComboTier(2)).toBe(1);
    expect(killComboTier(4)).toBe(1);
    expect(killComboTier(5)).toBe(2);
    expect(killComboTier(9)).toBe(2);
    expect(killComboTier(10)).toBe(3);
    expect(killComboTier(19)).toBe(3);
    expect(killComboTier(20)).toBe(4);
    expect(killComboTier(49)).toBe(4);
    expect(killComboTier(50)).toBe(5);
  });

  it("every step is strictly bigger and differently named", () => {
    const seen = [2, 5, 10, 20, 50].map((n) => killComboDisplay(state(n), 0)!);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!.fontSize).toBeGreaterThan(seen[i - 1]!.fontSize);
      expect(seen[i]!.label).not.toBe(seen[i - 1]!.label);
      expect(seen[i]!.color).not.toBe(seen[i - 1]!.color);
    }
    // 「越高越醒目」: the loudest treatments belong to the top tiers only.
    expect(seen[0]!.glow).toBe(false);
    expect(seen[4]!.glow).toBe(true);
    expect(seen[4]!.shake).toBe(true);
  });

  it("has NO ceiling — the owner's 不設上限", () => {
    // Round 9 is 20 mobs a wave with 60 alive per zone; a sweep goes somewhere
    // absurd and the absurd number is the point.
    const huge = killComboDisplay(state(137), 0)!;
    expect(huge.count).toBe(137);
    expect(huge.tier).toBe(5);
    expect(killComboText(137)).toBe("137 連殺");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ① WHERE IT LANDS — #107 safe-area contract
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("where it lands", () => {
  it("never covers ANY persistent chrome, at any guard viewport", () => {
    // ⚠️ THE MUTATION: bottom-anchor it one band higher (drop the
    // `ability-cluster` obstacle, or make the corridor start at the top edge)
    // and this names the slot it landed on.
    for (const vp of VIEWPORTS) {
      const hits = killComboCollisions(vp, { touch: vp.touch, legendUp: false });
      expect(`${vp.width}x${vp.height}: ${hits.join(",")}`).toBe(`${vp.width}x${vp.height}: `);
    }
  });

  it("the side-scan is NOT decoration — a squeezed window proves it bites", () => {
    // ⚠️ THE MUTATION: drop the corner slots from `killComboObstacles` (so the
    // placement stops measuring what reaches into its band) and the counter
    // lands on the top-left enemy-team panel here. Nothing in the shipping
    // viewport list would notice — which is exactly why these are in the file.
    for (const vp of SQUEEZED) {
      const hits = killComboCollisions(vp, { touch: vp.touch, legendUp: false });
      expect(`${vp.width}x${vp.height}: ${hits.join(",")}`).toBe(`${vp.width}x${vp.height}: `);
    }
    // and the scan really is the thing deciding it — a 500-square has no room
    expect(killComboRect(SQUEEZED[0]!, { touch: false, legendUp: false })).toBeNull();
  });

  it("stays inside the viewport — nothing is drawn off-screen", () => {
    for (const vp of VIEWPORTS) {
      const rect = killComboRect(vp, { touch: vp.touch, legendUp: false });
      expect(rect, `${vp.width}x${vp.height}`).not.toBeNull();
      expect(hudRectInViewport(rect!, vp), `${vp.width}x${vp.height}`).toBe(true);
    }
  });

  it("is legible everywhere it appears at all", () => {
    for (const vp of VIEWPORTS) {
      const rect = killComboRect(vp, { touch: vp.touch, legendUp: false })!;
      expect(rect.w, `${vp.width}x${vp.height} width`).toBeGreaterThanOrEqual(KILL_COMBO_MIN_W);
      expect(rect.h, `${vp.width}x${vp.height} height`).toBeGreaterThanOrEqual(KILL_COMBO_MIN_H);
    }
  });

  it("is horizontally CENTRED (an off-centre combo number reads as a bug)", () => {
    for (const vp of VIEWPORTS) {
      const rect = killComboRect(vp, { touch: vp.touch, legendUp: false })!;
      expect(Math.abs(rect.x + rect.w / 2 - vp.width / 2)).toBeLessThanOrEqual(1);
    }
  });

  it("YIELDS to the round-1 control legend instead of painting over it", () => {
    // #107 precedence: the legend teaches a first-timer the controls and is
    // dismissible; the counter is juice. On desktop both fit — the counter
    // simply docks below the strip. On a landscape phone the corridor is ~70px
    // and cannot hold both, so the counter stands down entirely.
    for (const vp of VIEWPORTS) {
      const opts = { touch: vp.touch, legendUp: true };
      const hits = killComboCollisions(vp, opts);
      expect(`${vp.width}x${vp.height}: ${hits.join(",")}`).toBe(`${vp.width}x${vp.height}: `);
    }
    // and the yield is real, not vacuous: it IS null on the short phones…
    expect(killComboRect({ width: 812, height: 375 }, { touch: true, legendUp: true })).toBeNull();
    // …while the same phone shows it happily once the legend is gone (round 2+,
    // which is also the first round that can have zombies at all).
    expect(
      killComboRect({ width: 812, height: 375 }, { touch: true, legendUp: false }),
    ).not.toBeNull();
    // …and desktop keeps it in BOTH states.
    expect(killComboRect({ width: 1546, height: 900 }, { touch: false, legendUp: true })).not.toBeNull();
  });

  it("says no rather than squeeze — a viewport with no corridor gets nothing", () => {
    // A 240px-tall window has no room between the top cluster and the ability
    // bar. Null is the answer; a counter over the player's own HP bar is not.
    expect(killComboRect({ width: 900, height: 240 }, { touch: false, legendUp: false })).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ② THE WIRE → THE STORE
 * ═══════════════════════════════════════════════════════════════════════════ */

const ev = (over: Record<string, unknown> = {}, type = KILL_COMBO_EVENT) => ({
  type,
  tick: 10,
  data: { killer: 7, killerSeatId: 2, victim: 9, victimKind: "mob", count: 3, ...over },
});

describe("the wire → the store", () => {
  // The store lives in net/RoomStore because `architecture.test.ts` (client-08)
  // allows zustand setState in exactly one file — see the comment there.
  beforeEach(() => {
    resetHudStore();
    hudStore.setState({ localSeatId: 2 });
  });

  it("takes MY combo", () => {
    expect(localKillComboCount(ev(), 2)).toBe(3);
    recordKillComboEvent(ev(), 1000);
    expect(hudStore.getState().killCombo).toEqual({ count: 3, atMs: 1000, seq: 1 });
  });

  it("drops SOMEONE ELSE's combo — the number must be yours", () => {
    // Asserted in the failing direction: a teammate's zombie sweep showing up as
    // your own chain is the defect, so the assertion is that the store is UNSET.
    expect(localKillComboCount(ev({ killerSeatId: 5 }), 2)).toBeNull();
    recordKillComboEvent(ev({ killerSeatId: 5 }), 1000);
    expect(hudStore.getState().killCombo).toBeNull();
  });

  it("drops a spectator's (no local seat) and every non-combo event", () => {
    expect(localKillComboCount(ev(), null)).toBeNull();
    expect(localKillComboCount(ev({}, "mobSlain"), 2)).toBeNull();
    expect(localKillComboCount(ev({}, "death"), 2)).toBeNull();
  });

  it("rejects a malformed payload rather than rendering NaN", () => {
    expect(localKillComboCount(ev({ count: "3" }), 2)).toBeNull();
    expect(localKillComboCount(ev({ count: Number.NaN }), 2)).toBeNull();
    expect(localKillComboCount(ev({ count: 0 }), 2)).toBeNull();
    expect(localKillComboCount(ev({ killerSeatId: -1 }), 2)).toBeNull();
  });

  it("bumps `seq` on every credit so 5→6 gets its own beat", () => {
    recordKillComboEvent(ev({ count: 5 }), 1000);
    recordKillComboEvent(ev({ count: 6 }), 1200);
    expect(hudStore.getState().killCombo).toEqual({ count: 6, atMs: 1200, seq: 2 });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ③ IT IS ACTUALLY MOUNTED — RENDERED, NOT GREPPED
 *
 * Everything below renders the CONTAINER (`KillCombo`) or the whole HUD tree
 * (`HudRoot`) against the REAL store and reads the digits back out of the
 * markup. No source scans: a tag typed into a file is not a pixel.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ THE ONE LINE THAT MAKES CONTAINER TESTS POSSIBLE AT ALL — and the reason
 * this repo never had one.
 *
 * The client vitest env is `node`, so the only renderer available is
 * react-dom/server, and the server renderer answers EVERY
 * `useSyncExternalStore` with its third argument, the server snapshot. zustand
 * v5 passes `api.getInitialState()` there (zustand/esm/react.mjs) — the
 * pristine boot state captured when RoomStore was first imported: phase
 * "connecting", killCombo null, for ever. So a server render of ANY
 * store-backed container paints an empty match no matter what the store holds,
 * and the only testable surface left is the pure view — which is precisely how
 * a container that returns null unconditionally kept 30 tests green.
 *
 * This app never server-renders and never hydrates (main.tsx: `createRoot`), so
 * `getInitialState` has no other consumer in the running game. Pointing it at
 * the live state changes the SNAPSHOT SOURCE and nothing else: the gates, the
 * expiry, the placement, the model and the view exercised below are all the
 * real ones, reading the real store.
 */
hudStore.getInitialState = hudStore.getState;

const seat = (seatId: number): LocalPlayerView => ({
  player: 0,
  accountId: `acct-${seatId}`,
  seatId,
  entityId: null,
  teamId: 1,
  displayName: "me",
  hp: 92,
  maxHp: 100,
  mana: 0,
  maxMana: 0,
  shield: 0,
});

/**
 * A live single-player combat HUD, seat 2 is ours. Every test perturbs ONE
 * field of it, so a null answer can only be blamed on that field.
 */
function inCombat(over: Partial<HudState> = {}): void {
  resetHudStore();
  hudStore.setState({
    connected: true,
    phase: "combat",
    round: 3,
    localSeatId: 2,
    localMaxHp: 100,
    localHp: 92,
    localAlive: true,
    localPlayers: [seat(2)],
    ...over,
  });
}

/** Credit the local seat with a chain, stamped `ageMs` in the past. */
function chain(count: number, ageMs = 0): void {
  recordKillComboEvent(
    { type: KILL_COMBO_EVENT, tick: 10, data: { killerSeatId: 2, count } },
    comboNowMs() - ageMs,
  );
}

const renderCombo = (): string => renderToStaticMarkup(createElement(KillCombo));
const renderHud = (): string => renderToStaticMarkup(createElement(HudRoot));

/**
 * The box that ACTUALLY SHIPPED, read back off the rendered root's own style
 * string — never re-derived by calling `killComboRect` a second time. That is
 * the whole point: a guard that recomputes the placement with the same inputs
 * moves whenever the placement moves and can only ever agree with itself.
 */
function paintedRect(html: string): HudRect {
  const style = /data-kill-combo="root"[^>]*?style="([^"]*)"/.exec(html)?.[1];
  if (!style) throw new Error(`no kill-combo root in markup (len ${html.length})`);
  const num = (prop: string): number => {
    const m = new RegExp(`(?:^|;)${prop}:(-?\\d+(?:\\.\\d+)?)px`).exec(style);
    if (!m) throw new Error(`no ${prop} in style "${style}"`);
    return Number(m[1]);
  };
  return { x: num("left"), y: num("top"), w: num("width"), h: num("height") };
}

/**
 * Which persistent chrome a GIVEN rect lands on — the same independent
 * re-derivation `killComboCollisions` documents (slot rects from `HUD_SLOTS`,
 * the two centred clusters, the stamp gutter), except the rect is an argument
 * instead of another call to `killComboRect`. Named ids so a failure says WHICH
 * piece of the HUD the counter covered.
 */
function chromeHitBy(rect: HudRect, viewport: HudViewport, touch: boolean): string[] {
  const hits: string[] = [];
  for (const s of HUD_SLOTS) {
    if (s.transient) continue;
    if (hudRectsOverlap(rect, hudSlotRect(s.id as HudSlotId, viewport, touch))) hits.push(s.id);
  }
  const cluster: HudRect = {
    x: Math.max(0, (viewport.width - ABILITY_CLUSTER_W) / 2),
    y: Math.max(0, viewport.height - ABILITY_CLUSTER_H),
    w: Math.min(ABILITY_CLUSTER_W, viewport.width),
    h: Math.min(ABILITY_CLUSTER_H, viewport.height),
  };
  if (hudRectsOverlap(rect, cluster)) hits.push("ability-cluster");
  if (hudRectsOverlap(rect, hudStampBandRect(viewport))) hits.push("stamp-band");
  return hits.sort();
}

/**
 * Run `fn` as if on a landscape phone (812x375, touch). `useViewport` falls back
 * to 1280x800 when `window` is absent, and `__ggdForceTouch` is the dev
 * harness's own touch seam (input/mobileDetect) — not a hook invented for this
 * test. Needed because the legend/counter contest for the corridor only bites
 * where the corridor is ~70px tall; every desktop size fits both.
 */
function onPhone<T>(fn: () => T): T {
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = { innerWidth: 812, innerHeight: 375 };
  g.__ggdForceTouch = true;
  try {
    return fn();
  } finally {
    delete g.window;
    delete g.__ggdForceTouch;
  }
}

describe("visibleText — the reader the guards below trust", () => {
  // A stripper that quietly stopped stripping would make every "the player sees
  // it" assertion vacuous again, so it is pinned here before anything uses it.
  it("keeps text nodes and drops tags, attributes and <style> bodies", () => {
    expect(visibleText('<div aria-label="12 連殺 血洗"><span>12 連殺</span></div>')).toBe("12 連殺");
    expect(visibleText('<div aria-label="12 連殺"><span></span></div>')).toBe("");
    expect(visibleText("<div><style>.a{content:'9 連殺'}</style><b>7 連殺</b></div>")).toBe("7 連殺");
    expect(visibleText("<p>a</p><p>b</p>")).toBe("a b");
  });
});

describe("the mounted HUD really paints it", () => {
  it("renders in the env these numbers assume (no DOM, 1280x800 fallback)", () => {
    // Stated out loud: if the client suite ever gains a DOM env, the desktop
    // rect assertions below change meaning, and this is the line that says so.
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    expect(hudTouch()).toBe(false);
  });

  it("the whole HUD tree, as the game mounts it, shows the DIGITS", () => {
    // ⚠️ THE MUTATION THAT USED TO SURVIVE: `return null` at the top (or the
    // bottom) of the `KillCombo` CONTAINER. 30/30 stayed green — the player just
    // never saw a combo number again. Deleting `<KillCombo />` from HudRoot,
    // or wrapping it in `{false && …}`, dies here too: this is HudRoot's own
    // output, not a regex over its source.
    //
    // ⚠️ AND THE SECOND MUTATION: blank the two spans and keep the aria-label.
    // The raw markup still carries 「12 連殺」; the SCREEN does not. Read through
    // `visibleText`, which is the only reader that can tell those apart.
    inCombat();
    chain(12);
    const html = renderHud();
    expect(html).toContain('data-kill-combo="root"');
    expect(visibleText(html)).toContain("12 連殺");
    expect(visibleText(html)).toContain("血洗");
  });

  it("the digits are PAINTED, not merely announced — and the label is BOTH", () => {
    // Two independent obligations, asserted separately so neither can answer for
    // the other:
    //   • the player READS the number       → it is in the visible text;
    //   • a screen reader HEARS it (#252)   → it is in the accessible name.
    // Blanking the spans kills the first; deleting `aria-label` kills the second.
    inCombat();
    chain(23);
    const html = renderCombo();
    expect(visibleText(html)).toContain("23 連殺");
    expect(visibleText(html)).toContain("修羅");
    expect(html).toContain('aria-label="23 連殺 修羅"');
    // …and the accessible name is NOT what the visible assertion just read: strip
    // the tags and the attribute is gone, yet the digits survive.
    expect(visibleText(html)).not.toContain("aria-label");
  });

  it("…and paints NO counter when there is no chain", () => {
    // The failing direction for "just always draw it": same mounted HUD, no
    // kill credited, and the counter must be absent from the markup — while the
    // rest of the HUD is demonstrably still there (so this cannot pass by the
    // whole tree rendering nothing). RAW markup on purpose here: the counter
    // must be gone from the tree entirely, attributes and all.
    inCombat();
    const html = renderHud();
    expect(html).not.toContain("data-kill-combo");
    expect(html).not.toContain("連殺");
    expect(html.length).toBeGreaterThan(500);
  });

  it("the CONTAINER itself: markup with a chain, nothing without one", () => {
    inCombat();
    chain(7);
    const shown = renderCombo();
    expect(visibleText(shown)).toContain("7 連殺");
    expect(shown.length).toBeGreaterThan(200);
    inCombat();
    expect(renderCombo()).toBe("");
  });
});

describe("the container's own gate (previously uncovered)", () => {
  it("combat ONLY — a live chain paints in no other phase", () => {
    // ⚠️ THE MUTATION: drop `phase !== "combat"` from the gate. Each phase below
    // is a screen the leftover number would float over — the shop card, the
    // champ-select grid, the settlement.
    for (const phase of ["connecting", "champSelect", "intermission", "resolution", "matchEnd"]) {
      inCombat({ phase });
      chain(9);
      expect(renderCombo(), `phase=${phase}`).toBe("");
    }
    // and the gate is not simply refusing everything:
    inCombat({ phase: "combat" });
    chain(9);
    expect(visibleText(renderCombo())).toContain("9 連殺");
  });

  it("split-screen gets nothing — ONE centred number cannot serve four seats", () => {
    // ⚠️ THE MUTATION: drop `|| couch`. Up to four local players share this
    // screen and the chain belongs to one of them; CouchHudGrid is where that
    // would have to be solved.
    inCombat({ localPlayers: [seat(2), seat(3)] });
    chain(9);
    expect(renderCombo()).toBe("");
    // same state, one seat: it paints — so `couch` is what decided, not a
    // second missing piece.
    inCombat({ localPlayers: [seat(2)] });
    chain(9);
    expect(visibleText(renderCombo())).toContain("9 連殺");
  });

  it("the container RETIRES a stale chain (it asks the clock, every poll)", () => {
    // ⚠️ THE MUTATION: have the container ignore `killComboDisplay`'s null (or
    // pass a frozen `now`). The store still holds the last combo of the round —
    // it is the container that must stop drawing it.
    inCombat();
    chain(9, KILL_COMBO_WINDOW_MS + KILL_COMBO_EXIT_MS + 500);
    expect(renderCombo()).toBe("");
    expect(hudStore.getState().killCombo?.count).toBe(9); // still stored, not drawn
    // mid-exit it is still on screen, fading — the window did not just vanish
    inCombat();
    chain(9, KILL_COMBO_WINDOW_MS + KILL_COMBO_EXIT_MS / 2);
    expect(renderCombo()).toContain('data-kill-combo-phase="out"');
  });

  it("ASKS the layout for its box (same inputs ⇒ same numbers)", () => {
    // ⚠️ THE MUTATION: hand `KillComboView` a constant rect (or the viewport's
    // centre) instead of `killComboRect(...)`.
    //
    // ⚠️ HONEST SCOPE — this one test is a TAUTOLOGY and says so. Both sides call
    // `killComboRect` with the same arguments, so all it can prove is that the
    // container consults the layout with the viewport/touch/legend inputs it is
    // supposed to, rather than inventing a box. It CANNOT see a change inside
    // `killComboRect` itself: MEASURED, adding +160 to the returned `y` left this
    // green (both sides moved together) and only the collision tests noticed.
    // The next test is the one that pins the geometry.
    inCombat();
    chain(12);
    const rect = killComboRect(
      { width: 1280, height: 800 },
      { touch: hudTouch(), legendUp: false, couchPlayers: 1 },
    )!;
    const html = renderCombo();
    expect(html).toContain(`left:${rect.x}px`);
    expect(html).toContain(`top:${rect.y}px`);
    expect(html).toContain(`width:${rect.w}px`);
  });

  it("the box it PAINTS covers no chrome and is centred — read off the markup", () => {
    // ⚠️ THE MUTATION: move the rect `killComboRect` returns (e.g. `y + 160`, or
    // stop centring it). Nothing here re-runs `killComboRect`: the four numbers
    // come out of the rendered style string and are judged against the slot rects
    // and the two centred clusters, derived independently — the same duplication
    // rule `killComboCollisions` documents, applied to the box that really shipped.
    inCombat();
    chain(12);
    const painted = paintedRect(renderCombo());
    const vp = { width: 1280, height: 800 };

    // ① inside the viewport at all
    expect(hudRectInViewport(painted, vp)).toBe(true);
    // ② horizontally centred — an off-centre combo number reads as a bug
    expect(Math.abs(painted.x + painted.w / 2 - vp.width / 2)).toBeLessThanOrEqual(1);
    // ③ legible
    expect(painted.w).toBeGreaterThanOrEqual(KILL_COMBO_MIN_W);
    expect(painted.h).toBeGreaterThanOrEqual(KILL_COMBO_MIN_H);
    // ④ ON NO PERSISTENT CHROME — named, so a failure says what it landed on
    expect(chromeHitBy(painted, vp, false).join(",")).toBe("");
  });

  it("the box MOVES with the viewport — it is not one baked constant", () => {
    // The other half of "asks the layout": a container that hard-coded a rect
    // would paint the same four numbers on a 1280x800 desktop and a 812x375
    // phone. These must differ, and both must still be clean.
    inCombat();
    chain(12);
    const desktop = paintedRect(renderCombo());
    const phone = onPhone(() => {
      inCombat({ round: 2 });
      chain(12);
      return paintedRect(renderCombo());
    });
    expect(phone).not.toEqual(desktop);
    const phoneVp = { width: 812, height: 375 };
    expect(hudRectInViewport(phone, phoneVp)).toBe(true);
    expect(chromeHitBy(phone, phoneVp, true).join(",")).toBe("");
  });

  it("stands down for the round-1 legend — the #107 precedence, through the container", () => {
    // ⚠️ THE MUTATION: hard-code `legendUp: false` (or the round) in the
    // container. On a landscape phone the corridor is ~70px and cannot hold the
    // legend strip AND the counter, so round 1 must paint NOTHING.
    onPhone(() => {
      inCombat({ round: 1 });
      chain(9);
      expect(renderCombo()).toBe("");
      // round 2 — the first round that can even have zombies — brings it back,
      // so the yield is a real decision and not a dead phone viewport.
      inCombat({ round: 2 });
      chain(9);
      expect(visibleText(renderCombo())).toContain("9 連殺");
      // and the panel signal is threaded too: a DEFEATED player is shopping mid
      // combat, the covering shop card takes the legend away (#107), and the
      // corridor is the counter's again — in round 1.
      inCombat({ round: 1, localAlive: false });
      chain(9);
      expect(visibleText(renderCombo())).toContain("9 連殺");
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ② THE DRAIN, ACTUALLY RUN
 *
 * ⚠️ WHAT THIS REPLACES, AND WHY. This used to be a SOURCE SCAN over GameApp.ts
 * (`expect(src).toContain("recordKillComboEvent,")` +
 * `expect(src).toMatch(/recordKillComboEvent\(ev, nowMs\)/)`). MEASURED: leave
 * both greppable strings byte-for-byte intact and make the call unreachable —
 *
 *     if (String(ev.type) === "__never_fires__") recordKillComboEvent(ev, nowMs);
 *
 * — and the regex still matches, the sim's combo never reaches the store, the
 * game never shows a combo number, and 37/37 stayed green. A grep proves a line
 * was TYPED. It does not prove it RUNS.
 *
 * So the drain is run for real instead. GameApp cannot be constructed headlessly
 * (Babylon engine, canvas, sockets) and `frame` is an instance arrow field, so
 * the loop was lifted onto the prototype as `drainNetworkEvents` /
 * `handleDrainedEvent` — no runtime change, same calls in the same order — and
 * is invoked here with a stub `this` whose `conn.drainEvents()` returns a real
 * batch. Everything between the queue and `hudStore` is the production code.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A GameApp whose PROTOTYPE is the real one — so `drainNetworkEvents` and the
 * `handleDrainedEvent` it calls are production code — with the canvas/audio/
 * network collaborators shadowed by inert own-properties. Nothing here stubs the
 * store or the recorders: that is the path under test.
 */
interface DrainSeam {
  drainNetworkEvents(state: null, localId: number | null, nowMs: number): void;
}

function drainStub(events: unknown[]): DrainSeam {
  const noop = (): void => {};
  return Object.assign(Object.create(GameApp.prototype) as object, {
    // `conn` is a getter over `sessions.primary` — feed the seam it reads, so
    // the drain really goes through GameApp's own connection accessor.
    sessions: { primary: { drainEvents: () => events } },
    vfx: { handleEvent: noop, statusFx: { set: noop } },
    views: { handleEvent: noop },
    casts: { handleEvent: noop },
    sfxQueue: { push: noop },
    deathFocus: { noteDeath: noop },
    applyCombatFeedback: noop,
    dispatchContextualVoice: noop,
    audioEntityPos: () => null,
    audioTeamOf: () => null,
    batchProfiled: false,
    frameKicks: 0,
    // `drainNetworkEvents` is PRIVATE, so it is invisible to the type system
    // here even though it is right there on the prototype — hence the cast.
  }) as unknown as DrainSeam;
}

/** Run GameApp's REAL step-1 drain over `events`, as the frame loop does. */
function runDrain(events: unknown[], nowMs: number): void {
  drainStub(events).drainNetworkEvents(null, null, nowMs);
}

describe("the wiring no render can prove", () => {
  beforeEach(() => {
    resetHudStore();
    hudStore.setState({ localSeatId: 2 });
  });

  it("GameApp's event drain really DELIVERS the combo to the store", () => {
    // ⚠️ THE MUTATION: make `recordKillComboEvent(ev, nowMs)` unreachable while
    // leaving the text in place (`if (String(ev.type) === "__never_fires__") …`),
    // or delete it outright. Either way the store never moves and this goes red —
    // which the grep it replaced could not do.
    expect(hudStore.getState().killCombo).toBeNull();
    runDrain([ev({ count: 4 })], 1000);
    expect(hudStore.getState().killCombo).toEqual({ count: 4, atMs: 1000, seq: 1 });
  });

  it("…and it is the LOOP, not one lucky event — a whole batch drains in order", () => {
    // ⚠️ THE MUTATION: `for (const ev of events)` → dispatch only `events[0]`, or
    // drop the loop. The last combo in the batch is the one the screen must show.
    runDrain([ev({ count: 2 }), ev({}, "damage"), ev({ count: 3 }), ev({ count: 5 })], 2000);
    expect(hudStore.getState().killCombo).toEqual({ count: 5, atMs: 2000, seq: 3 });
  });

  it("the drain honours the seat gate — a teammate's sweep is not your number", () => {
    // The same real path, asserted in the FAILING direction: nothing is recorded.
    runDrain([ev({ killerSeatId: 5, count: 9 })], 3000);
    expect(hudStore.getState().killCombo).toBeNull();
  });

  it("an empty batch changes nothing (no phantom combo from an idle frame)", () => {
    runDrain([], 4000);
    expect(hudStore.getState().killCombo).toBeNull();
  });

  it("the ONE line no headless test can reach: frame() calls the drain", () => {
    // Honest scope. Everything above runs `drainNetworkEvents` for real; what
    // no test in a node env can run is `frame` itself (an instance arrow field
    // on a class that needs a Babylon engine, a canvas and a socket). So this
    // single call site is a source anchor, and it is deliberately the LAST
    // remaining one: deleting it does not just silence the combo counter, it
    // kills every VFX, SFX, cast bar, death, shop line and settlement in the
    // game at once — a failure no playtest could miss.
    const src = stripComments(clientSrc("GameApp.ts"));
    expect(src).toMatch(/this\.drainNetworkEvents\(state, localId, nowMs\);/);
    // and the drain still ends at the recorder — the chain this file guards
    expect(src).toMatch(/for \(const ev of events\) this\.handleDrainedEvent\(/);
  });

  it("the server really fans the event out — no silent whitelist drop", () => {
    // `eventFanout.ts` is a hard allowlist and a missing name fails SILENTLY.
    const fanout = readFileSync(
      join(__dirname, "../../../../game-server/src/net/eventFanout.ts"),
      "utf8",
    );
    // Anchored on the DECLARATIONS, not on the first mention: both names also
    // appear in the module's prose, and a scrape that silently grabbed the
    // comment instead of the set would certify nothing.
    const from = fanout.indexOf("export const FANNED_OUT_EVENT_TYPES");
    const to = fanout.indexOf("export const SERVER_ONLY_EVENT_TYPES");
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const fannedOut = fanout.slice(from, to);
    // sanity-bound the scrape: it must have found a real list, not two lines
    expect(fannedOut.split("\n").length).toBeGreaterThan(20);
    expect(fannedOut).toContain(`"${KILL_COMBO_EVENT}"`);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ⑤ THE VIEW, ACTUALLY RENDERED
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("the rendered counter", () => {
  const rect = killComboRect({ width: 1546, height: 900 }, { touch: false, legendUp: false })!;
  const html = (count: number, nowMs = 0): string =>
    renderToStaticMarkup(
      createElement(KillComboView, { rect, view: killComboDisplay(state(count), nowMs)! }),
    );

  it("puts the DIGITS in the DOM at the derived offsets", () => {
    // Not "the model returned 12", and not "an attribute somewhere says 12" —
    // the VISIBLE text of the markup a browser would paint carries the string a
    // player reads, at the rectangle the layout proved is free.
    const out = html(12);
    expect(visibleText(out)).toContain("12 連殺");
    expect(visibleText(out)).toContain("血洗");
    expect(out).toContain(`left:${rect.x}px`);
    expect(out).toContain(`top:${rect.y}px`);
    expect(out).toContain(`width:${rect.w}px`);
  });

  it("the number and the tier name are separate visible nodes, both non-empty", () => {
    // ⚠️ THE MUTATION: `{killComboText(view.count)}` → `{""}` (or the same to
    // `{view.label}`). Either one alone leaves the aria-label whole and the box
    // half-empty, so each span is asserted on its own rather than as one blob.
    const out = html(12);
    const spans = [...out.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/g)].map((m) =>
      visibleText(m[1]!),
    );
    expect(spans).toContain("12 連殺");
    expect(spans).toContain("血洗");
    expect(spans.filter((s) => s.length > 0).length).toBeGreaterThanOrEqual(2);
  });

  it("a bigger combo really renders bigger type", () => {
    const small = html(3).match(/font-size:(\d+)px;line-height/)?.[1];
    const big = html(60).match(/font-size:(\d+)px;line-height/)?.[1];
    expect(Number(big)).toBeGreaterThan(Number(small));
  });

  it("never lets the glyph outgrow the box the layout proved is free", () => {
    // A 96px 天災 glyph inside a 66px corridor on a 780x360 phone would spill
    // straight onto the ability bar — the one thing the rect exists to stop.
    const phone = killComboRect({ width: 780, height: 360 }, { touch: true, legendUp: false })!;
    const out = renderToStaticMarkup(
      createElement(KillComboView, { rect: phone, view: killComboDisplay(state(99), 0)! }),
    );
    const size = Number(out.match(/font-size:(\d+)px;line-height/)?.[1]);
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThanOrEqual(phone.h);
  });

  it("swallows no clicks", () => {
    expect(html(5)).toContain("pointer-events:none");
  });

  it("the exit visibly fades", () => {
    const out = html(5, KILL_COMBO_WINDOW_MS + KILL_COMBO_EXIT_MS / 2);
    expect(out).toContain('data-kill-combo-phase="out"');
    expect(out).toMatch(/opacity:0\.\d/);
  });

  it("keeps the number for a player who asked for less motion", () => {
    expect(html(30)).toContain("prefers-reduced-motion");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ⑥ RENDERED BUT INVISIBLE — the hole this suite could not close by rendering
 *
 * The three previous rounds all landed on the same wall: `renderToStaticMarkup`
 * runs in the node env, which has NO LAYOUT ENGINE. It produces the markup a
 * browser WOULD paint; it does not paint. So `display:none` on the outer box,
 * or `opacity:0`, or a zero font-size, leaves every text-based assertion in
 * this file green while the player sees nothing. MEASURED: 7 of 9 such CSS
 * mutations survived the full suite.
 *
 * ⚠️ THE LIMIT, STATED HONESTLY. This is NOT a general fix, and it must not be
 * read as one. The class "CSS that hides an element" is unbounded — a
 * `clip-path`, a `z-index` under an opaque sibling, a `color` equal to the
 * background, a transform off the viewport, all still pass. A general fix needs
 * a real layout engine (jsdom does not compute layout either; it would take a
 * headless browser), which this suite deliberately does not carry.
 *
 * A repo-wide grep confirmed ZERO of the 25 HUD components carry a guard like
 * this one, so the gap is a property of the whole node-env HUD suite, not of
 * this feature. What follows is therefore a BOUNDED DENYLIST: the specific
 * declarations that actually shipped as survivors, pinned so that re-applying
 * any of them turns this file red. It buys back the measured hole and nothing
 * more.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("rendered AND visible", () => {
  /** Every inline `style="…"` on the rendered markup, in document order. */
  const styleAttrs = (html: string): string[] =>
    [...html.matchAll(/style="([^"]*)"/g)].map((m) =>
      m[1]!.replace(/&quot;/g, '"').replace(/&#x27;/g, "'"),
    );

  /**
   * Declarations that make a box paint nothing. Each entry was an ACTUAL
   * survivor of the mutation round, not a hypothetical.
   */
  const HIDES_IT: { name: string; re: RegExp }[] = [
    { name: "display:none", re: /display:\s*none/i },
    { name: "visibility:hidden", re: /visibility:\s*(hidden|collapse)/i },
    { name: "opacity:0", re: /opacity:\s*0(?:\.0+)?(?:[;\s]|$)/i },
    { name: "font-size:0", re: /font-size:\s*0(?:\.0+)?(?:px|em|rem)?(?:[;\s]|$)/i },
    { name: "zero width", re: /(?:^|[;\s])width:\s*0(?:\.0+)?(?:px|%)?(?:[;\s]|$)/i },
    { name: "zero height", re: /(?:^|[;\s])height:\s*0(?:\.0+)?(?:px|%)?(?:[;\s]|$)/i },
    { name: "scale(0)", re: /scale\(\s*0(?:\.0+)?\s*\)/i },
    { name: "fully transparent colour", re: /color:\s*(transparent|rgba\([^)]*,\s*0(?:\.0+)?\s*\))/i },
  ];

  /**
   * The counter at its LOUDEST — mid-window, well before the fade begins. The
   * exit phase legitimately drives opacity and scale toward zero, so asserting
   * there would forbid the animation this feature is made of; asserting here
   * forbids only "it never appeared".
   */
  const atFullStrength = (): string => {
    const rect = killComboRect({ width: 1546, height: 900 }, { touch: false, legendUp: false })!;
    return renderToStaticMarkup(
      createElement(KillComboView, { rect, view: killComboDisplay(state(12), 0)! }),
    );
  };

  for (const { name, re } of HIDES_IT) {
    it(`does not ship ${name}`, () => {
      const offenders = styleAttrs(atFullStrength()).filter((s) => re.test(s));
      expect(
        offenders,
        `a style attribute matching ${name} means the markup renders but paints nothing: ${offenders.join(" | ")}`,
      ).toEqual([]);
    });
  }

  it("the mounted container is subject to the same rule", () => {
    // Not just the pure view: the thing HudRoot mounts. A `display:none` added
    // to the container's wrapper hides the counter just as completely.
    inCombat();
    chain(12);
    const attrs = styleAttrs(renderCombo());
    expect(attrs.length, "the container rendered nothing at all").toBeGreaterThan(0);
    for (const { name, re } of HIDES_IT) {
      expect(attrs.filter((s) => re.test(s)), `mounted container ships ${name}`).toEqual([]);
    }
  });

  it("the number is painted at a size a person can read", () => {
    // font-size:0 is in the denylist above; this pins the other direction — a
    // 1px number is not "shipped", and the tier styling exists to make the
    // count legible across a room.
    const sizes = [...atFullStrength().matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((m) =>
      Number(m[1]),
    );
    expect(sizes.length, "no font-size shipped at all").toBeGreaterThan(0);
    expect(Math.max(...sizes)).toBeGreaterThanOrEqual(16);
  });
});
