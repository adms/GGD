/**
 * valhalla — the PURE half of the lobby 英靈殿 showcase (task #258): which
 * champions may be shown, in what order, for how long, and how much room the
 * card is allowed to take. No React, no DOM, no Babylon — so every rule below
 * is a node-testable fact instead of a literal buried in a style object.
 *
 * ---------------------------------------------------------------------------
 * 1. THE ROSTER IS "WHAT A PLAYER CAN ACTUALLY PLAY", NOT "WHAT CONTENT HAS"
 * ---------------------------------------------------------------------------
 * content/ ships 115 champion docs; the operator whitelist
 * (GET /api/v1/curation/whitelist) enables 49. A showcase that paraded a
 * champion nobody can pick would be advertising a lie, so the roster is
 * `registry ∩ whitelist` — the SAME intersection champ-select computes
 * (`whitelistedChampionIds`, ui/panels/champSelectFilter), reused rather than
 * re-derived.
 *
 * ⚠ TEN of the operator's 49 enabled champions are ALTERNATE-FORM ids
 * (godie-e007 天地志狼, godie-o00x 超級賽亞人悟空, godie-u01u 索隆, godie-n00p 藏馬,
 * godie-u010 飛影, godie-u00l 北斗之鼠拳四郎, godie-h02r 妙蛙花, godie-h02u 草泥馬,
 * godie-h020 莉娜, godie-n01c 小呆). `whitelistedChampionIds` RESOLVES each one
 * to its BASE form rather than dropping it, so the showcase keeps all ten heroes
 * while never parading a second-form body.
 *
 * ⚠ CORRECTION (2026-07-30). This comment used to argue the opposite — that the
 * ten had to be kept AS ALTERNATES because filtering them "would silently delete
 * ten heroes the owner opened by hand". That premise was measured and is FALSE:
 * all 26 declared form pairs have a base doc in content/champions, and every one
 * of these ten bases is in the shipping starter roster. Keeping the alternates
 * is what produced owner's 「選人畫面有太多重複名稱英雄令人困惑」 — 19 of the 26
 * pairs carry an IDENTICAL name on both halves (the w3x only distinguishes them
 * in `unsf`, which the importer does not read). The ruling is 2026-07-30
 * 「不要出現讓人解鎖變身後的英雄吧」 / 2026-07-26「換成本體，變身態改由技能觸發」:
 * substitute, never delete — see champSelectFilter's `resolveToPickable`.
 *
 * An UNENFORCED whitelist (platform unreachable / bare `pnpm dev`) means the
 * roster is unknown, not empty: it degrades to the full registry, exactly like
 * champ-select's NO_FILTER. Anything else would blank the lobby whenever the
 * platform hiccups.
 *
 * ---------------------------------------------------------------------------
 * 2. A SHUFFLE BAG, NOT A DICE ROLL
 * ---------------------------------------------------------------------------
 * Pure `Math.random()` picks repeat: over 49 champions there is a 1-in-49
 * chance every minute of showing the SAME hero twice in a row, which reads as
 * "the rotation is broken" rather than "the dice were fair". So the rotation
 * draws from a shuffled bag: every champion appears exactly once per pass, and
 * the bag is only re-shuffled when it runs dry — and re-shuffled so the first
 * draw of the new bag is never the champion that just finished (the one
 * back-to-back repeat a plain re-shuffle can still produce).
 *
 * The rng is INJECTED. `Math.random` is the production source and that is fine
 * here — this is client-side presentation, not the 30 Hz deterministic sim (it
 * lives in apps/client, outside packages/shared's purity gate; nothing in this
 * file ever reaches a replay or a lockstep tick). Injecting it anyway is what
 * makes the "no duplicate inside one pass" rule provable.
 */
import { Champions } from "@ggd/shared/sim/content/registry";
import { whitelistedChampionIds, type Whitelist } from "../panels/champSelectFilter";

/** How long one champion holds the stage (owner: 「每過1分鐘就會輪播隨機下一個」). */
export const VALHALLA_ROTATION_MS = 60_000;

/** Rotation-timer resolution — drives the progress bar, not a re-render. */
export const VALHALLA_TICK_MS = 500;

/**
 * The showable roster: registry ∩ operator whitelist, in registry order.
 * Reads the registry AT CALL TIME — callers must re-run it when
 * `useContentReady()` flips (see ValhallaPanel; a `useMemo(…, [])` here is the
 * login-marquee bug coming back).
 */
export function valhallaRoster(wl: Whitelist): string[] {
  return whitelistedChampionIds(Champions.ids(), wl);
}

// ---------------------------------------------------------------------------
// shuffle bag
// ---------------------------------------------------------------------------

/** A pass through the roster: `order` holds every id once; `drawn` is how many have been shown. */
export interface RotationState {
  readonly order: readonly string[];
  readonly drawn: number;
}

export const EMPTY_ROTATION: RotationState = { order: [], drawn: 0 };

/** Fisher–Yates. Pure: the caller owns the rng. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

/**
 * A fresh bag over `roster`, arranged so `avoid` is never the first draw (when
 * the roster has more than one entry). That is the ONE repeat a plain reshuffle
 * still allows: the last champion of pass N landing first in pass N+1.
 */
export function newBag(roster: readonly string[], rng: () => number, avoid?: string | null): RotationState {
  const order = shuffle(roster, rng);
  if (order.length > 1 && avoid && order[0] === avoid) {
    // swap it with a random OTHER slot — deterministic under a stub rng
    const j = 1 + Math.floor(rng() * (order.length - 1));
    const tmp = order[0]!;
    order[0] = order[j]!;
    order[j] = tmp;
  }
  return { order, drawn: 0 };
}

/** True when `state` no longer describes `roster` (content or whitelist arrived late). */
export function bagIsStale(state: RotationState, roster: readonly string[]): boolean {
  if (state.order.length !== roster.length) return true;
  const set = new Set(roster);
  return state.order.some((id) => !set.has(id));
}

/**
 * Draw the next champion. Re-shuffles when the bag is empty or stale. Returns
 * `id: null` only for an EMPTY roster (nothing is playable / content not loaded
 * yet) — every other path yields a champion.
 */
export function draw(
  state: RotationState,
  roster: readonly string[],
  rng: () => number,
  current?: string | null,
): { state: RotationState; id: string | null } {
  if (roster.length === 0) return { state: EMPTY_ROTATION, id: null };
  let s = state;
  if (bagIsStale(s, roster) || s.drawn >= s.order.length) s = newBag(roster, rng, current ?? null);
  const id = s.order[s.drawn] ?? null;
  return { state: { order: s.order, drawn: s.drawn + 1 }, id };
}

// ---------------------------------------------------------------------------
// layout — the #151 / #247 guard: the showcase must never push 一鍵開打 away
// ---------------------------------------------------------------------------

/**
 * How the card renders on this viewport.
 *
 * WHY `strip` EXISTS. The lobby's only responsive rule is
 * `platform/ranking.css @media (max-width: 720px)`; an iPhone in LANDSCAPE is
 * 844×390, so 844 > 720 and the three columns stay side by side inside 390px
 * of height. MEASURED on this build at 844×390: the centre column is 248px
 * wide, `單人 vs BOT` starts at y=109 and 「⚔️ 一鍵開打」 occupies y=283..337 —
 * i.e. 53px of slack to the bottom edge. A 3D stage (StorePreviewCanvas has
 * `minHeight: 260`) inserted ABOVE that button would push the single most
 * important control in the lobby off-screen. That is precisely how #247 shipped
 * a jump animation 77% off-frame, so on short viewports the showcase collapses
 * to ONE 30px line — portrait + 稱號/全名 + an expander — which the owner
 * explicitly allowed (「高度不夠時…改成只有 icon + 文字」). Expanding is a
 * deliberate act by the player, and the lobby body scrolls under that same
 * media query so an expanded card is always reachable.
 */
export interface ValhallaLayout {
  /** "full" = 3D stage + text; "strip" = one collapsed line (short viewport) */
  mode: "full" | "strip";
  /** 3D stage height in px (0 in strip mode) */
  stageHeight: number;
  /** max height of the scrolling detail body (description + skills) */
  bodyMaxHeight: number;
  /** stack the stage above the text instead of beside it (narrow column) */
  stacked: boolean;
}

/** Below this viewport height the card collapses to a single line. */
export const VALHALLA_STRIP_MAX_HEIGHT = 520;

/** Stage height used when a strip-mode card is expanded by hand. */
export const VALHALLA_EXPANDED_STAGE = 116;

export function valhallaLayout(opts: {
  viewportHeight: number;
  viewportWidth: number;
}): ValhallaLayout {
  const { viewportHeight: h, viewportWidth: w } = opts;
  // < 720px wide the columns stack full-width (ranking.css), so the stage may
  // sit beside the text again; between 720 and 1100 the centre column is narrow.
  const stacked = w >= 720 && w < 1100;
  if (h <= VALHALLA_STRIP_MAX_HEIGHT) {
    return { mode: "strip", stageHeight: 0, bodyMaxHeight: 0, stacked };
  }
  if (h < 660) return { mode: "full", stageHeight: 104, bodyMaxHeight: 92, stacked };
  if (h < 860) return { mode: "full", stageHeight: 136, bodyMaxHeight: 120, stacked };
  return { mode: "full", stageHeight: 168, bodyMaxHeight: 156, stacked };
}

// ---------------------------------------------------------------------------
// rotation clock
// ---------------------------------------------------------------------------

/**
 * Remaining ms, given how much has been counted so far. The clock only ADVANCES
 * while the card is being counted (visible tab, not hovered) — see
 * `shouldCount` — so a backgrounded lobby neither burns CPU nor silently
 * "catches up" with six rotations the moment it is looked at again.
 */
export function remainingMs(elapsedMs: number): number {
  return Math.max(0, VALHALLA_ROTATION_MS - elapsedMs);
}

/**
 * Whether the rotation clock may tick right now.
 *  · `hidden`  — the browser tab is in the background (#H4: stop computing).
 *  · `offscreen` — the card is scrolled out of view (phone lobby).
 *  · `engaged` — the player has the pointer on the card, or is scrolling its
 *    description. Owner: 「玩家正在讀的時候不要抽換」 — the swap is DEFERRED,
 *    not cancelled, so it happens the instant they look away.
 */
export function shouldCount(s: { hidden: boolean; offscreen: boolean; engaged: boolean }): boolean {
  return !s.hidden && !s.offscreen && !s.engaged;
}
