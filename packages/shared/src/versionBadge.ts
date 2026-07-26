/**
 * versionBadge — the ONE definition of the build-stamp badge, shared by every
 * surface that ships one (task #66, extended by #245).
 *
 * WHY IT LIVES IN @ggd/shared AND NOT IN THE CLIENT
 * ------------------------------------------------
 * #66 shipped the badge for `apps/client` only. The owner then asked twice for
 * it EVERYWHERE — 「不管是在大廳、後檯、戰鬥、商店，遊戲版本號都要在明顯的地方
 * 顯示，以利擷圖回報」 — and "everywhere" spans three separately-built Vite apps
 * (client, admin, editor) that share no React tree. Three copies of a badge is
 * three chances for one to drift, so the FACTS live here, framework-free:
 *   • how a raw injected stamp resolves (and what an ABSENT one degrades to);
 *   • the exact box it paints — geometry, colours, z-index, the reserved band;
 *   • the DOM marker every guard test greps for.
 * Each app keeps a ~20-line component that renders `versionBadgeStyle()`; the
 * appearance and the stacking are not that component's to decide.
 *
 * This module deliberately imports NOTHING (no React, no DOM types). It is
 * consumed by three React apps and by node test code, and `@ggd/shared` is also
 * a dependency of the Colyseus game server, which must never pull React in.
 *
 * WHY THE BADGE PAINTS AT THE VERY TOP OF THE STACK
 * ------------------------------------------------
 * #66 chose `z-index: 1` — "below #hud-root (z 10) and every overlay" — so it
 * could never cover interactive chrome. MEASURED consequence: the badge was
 * invisible on exactly the screens the owner screenshots. Anything that paints
 * a full-screen background above z 1 hid it outright:
 *   • the settlement panel (`ui/panels/MatchEndPanel.tsx`, z HUD_Z.screen = 40,
 *     `inset: 0` with an opaque victory wash) — the END-OF-MATCH screenshot;
 *   • the eliminated-player settlement overlay (z HUD_Z.modal);
 *   • the shop's left-docked card (z 40, `min(45vw, 560px)` full height), which
 *     eats the badge's left half on any viewport under ~1240px wide;
 *   • the pause menu, the codex/credits/asset-console overlays, the rotate
 *     overlay (z 100) and the match-loading overlay (z 60).
 * "In the DOM" is not the bar — a screenshot is. So the badge now paints ABOVE
 * everything (`VERSION_BADGE_Z`), and safety comes from the two properties that
 * actually make covering impossible rather than from being at the bottom of the
 * stack:
 *   1. `pointer-events: none` — it can never swallow a click, at any z;
 *   2. it is confined to `VERSION_BADGE_BAND_PX` of the bottom edge, a strip the
 *      #107 safe-area contract already keeps empty (HUD corner slots start
 *      `HUD_EDGE` = 10px in, the desktop ability bar sits at `bottom: 14`, the
 *      touch attack button at `bottom: 40`). `ui/hud/hudLayout.ts` declares that
 *      band and `ui/hud/versionBadgeBand.test.ts` proves no HUD SLOT intrudes
 *      into it, on every guard viewport and both pointer types — AND, because a
 *      guard that enumerates slots can only see slots (it missed champion
 *      select's bottom-centre hint sitting 4px inside the band), it also
 *      enumerates every `bottom:` declaration in the client's UI tree and makes
 *      each one either clear the band or state why it cannot collide. That is
 *      what makes the reservation enforced rather than asserted.
 *
 * WHAT THE BADGE MAY AND MAY NOT PAINT OVER. It may paint over a PANEL's
 * background — it has to, or the settlement screen has no version on it, which
 * is the entire bug. It may never paint over CHROME OR A CONTROL, which is the
 * #107 rule ("no persistent chrome may be covered") applied to the one
 * component allowed on top of everything. Slots are chrome; panels are content
 * surfaces. That is the line the band guard draws.
 */

/** Shown when NO stamp was injected: a dev server, or vitest. Never blank. */
export const BUILD_STAMP_FALLBACK = "dev";

/**
 * The DOM marker. Every app's badge carries it, every guard test greps for it,
 * and a screenshot pipeline can find the stamp with one query selector.
 */
export const VERSION_BADGE_ATTR = "data-ggd-version-badge";

/**
 * Which app painted it (`client` | `admin` | `editor`). The owner screenshots
 * three different front-ends; a bare sha does not say which one, and the three
 * are built from the same commit but not necessarily deployed together.
 */
export const VERSION_BADGE_APP_ATTR = "data-ggd-version-badge-app";

/**
 * Height (px) of the bottom strip the badge is allowed to occupy — and which
 * nothing else may claim. Equal to `HUD_EDGE` in ui/hud/hudLayout.ts, on
 * purpose: that is the gutter the #107 contract already keeps clear of every
 * corner slot, so reserving it costs zero layout churn. Raising this number
 * means moving real HUD chrome, which is a #107 decision, not a styling one.
 */
export const VERSION_BADGE_BAND_PX = 10;

/**
 * Width (px) of the reserved band — the badge is horizontally CENTRED, so the
 * reservation is a centred strip, not the whole bottom edge. That matters: the
 * bottom-right corner of a 780x360 landscape phone really does get within 8px
 * of the bottom edge when the shop displaces the ☰ menu to the end of the
 * top-right stack, and claiming the full width would report a collision the
 * badge cannot physically have (it is 400px away, in the middle).
 *
 * 280 is generous: the longest stamp this project can produce is a 10-char sha
 * + `-dirty` + a space + `YYYY-MM-DD` ≈ 27 characters, which is ~162px at the
 * 10px monospace this badge uses, plus 16px of padding. The style caps the box
 * at this width so the reservation cannot be exceeded by a hand-set
 * `GGD_BUILD_STAMP` full of prose.
 */
export const VERSION_BADGE_BAND_W_PX = 280;

/**
 * Above EVERYTHING. The client's tallest declared layer is `HUD_Z.modal`
 * (2147483600, deliberately above the audio cluster's `Z_TOP` 2147483000 so a
 * modal's ✕ is never trapped); 2147483647 is the int32 ceiling browsers clamp
 * to. Sitting one below the ceiling leaves the very top free for a future
 * genuinely-blocking layer while keeping the badge over every panel that
 * exists today.
 *
 * This is only safe because of `pointer-events: none` + the reserved band; do
 * not copy the number onto anything that paints a box or takes a click.
 */
export const VERSION_BADGE_Z = 2147483646;

/** Dev-server route serving a FRESHLY computed stamp (vite `liveBuildStamp`). */
export const LIVE_STAMP_ROUTE = "/__ggd-build-stamp";

/**
 * How often a dev page re-asks. A commit lands every few minutes at most, and
 * one local `git rev-parse` per 15 s is free. A production build never polls:
 * the route does not exist there (`apply: "serve"`).
 */
export const LIVE_STAMP_POLL_MS = 15_000;

/** Longest live-route body still plausibly a stamp (anything longer is markup). */
export const LIVE_STAMP_MAX_LEN = 64;

/**
 * Resolve a raw injected stamp to what the badge should display. Pure, so the
 * "degrade honestly" rule is testable without depending on whatever
 * `import.meta.env` holds in a given runtime.
 *
 * An absent / blank stamp shows `dev` — an honest label for an un-stamped dev
 * bundle — never an empty box and never the string `undefined`. Note that a
 * BUILT artifact that could not identify itself does not reach here as blank:
 * the build-side resolver (apps/client/dev/buildStamp.ts) bakes the loud
 * `UNSTAMPED-BUILD` instead, precisely so a broken build cannot masquerade as a
 * normal local one.
 */
export function resolveStamp(raw: string | undefined | null): string {
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : BUILD_STAMP_FALLBACK;
}

/**
 * Decide what the badge shows given the baked literal and whatever the dev
 * route last returned. Pure, so the precedence rule is testable without a
 * network: a non-empty live stamp wins (it is the fresher fact); anything else
 * — no route, an error page, a blank body — leaves the baked stamp untouched.
 */
export function preferLiveStamp(baked: string, live: string | null | undefined): string {
  return typeof live === "string" && live.trim().length > 0 ? live.trim() : baked;
}

/**
 * Is a live-route body a plausible stamp? Guards against an SPA fallback
 * handing back index.html rather than a stamp: a real stamp is one short line,
 * never markup.
 */
export function isPlausibleLiveStamp(text: string | null | undefined): boolean {
  return (
    typeof text === "string" &&
    text.trim().length > 0 &&
    text.length <= LIVE_STAMP_MAX_LEN &&
    !text.includes("<")
  );
}

/**
 * The badge's box. Declared once here so the three apps cannot drift, and typed
 * with literal string unions so it drops straight into a React `style` prop
 * without a cast (this module still knows nothing about React).
 *
 * LEGIBILITY IS THE POINT. #66 painted 10px `TEXT_DIM` at `opacity: 0.55` over
 * whatever happened to be behind it, which on the login artwork and on the
 * settlement wash is very close to unreadable in a downscaled screenshot. The
 * height is capped by the reserved band, so contrast does the work instead: a
 * near-opaque dark chip, near-white bold monospace, and a hard text shadow, so
 * the stamp reads over black, over a bright victory flash, and over a login
 * dragon alike.
 */
export interface VersionBadgeStyle {
  readonly position: "fixed";
  readonly bottom: number;
  readonly left: string;
  readonly transform: string;
  readonly zIndex: number;
  readonly pointerEvents: "none";
  readonly userSelect: "none";
  readonly whiteSpace: "nowrap";
  readonly overflow: "hidden";
  readonly boxSizing: "content-box";
  readonly height: number;
  readonly maxWidth: number;
  readonly lineHeight: string;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly letterSpacing: string;
  readonly fontFamily: string;
  readonly color: string;
  readonly background: string;
  readonly padding: string;
  readonly borderRadius: string;
  readonly textShadow: string;
  readonly marginBottom: string;
}

export function versionBadgeStyle(): VersionBadgeStyle {
  return {
    position: "fixed",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: VERSION_BADGE_Z,
    // can never swallow a click, at any z-index — this is what makes painting
    // on top of everything safe
    pointerEvents: "none",
    userSelect: "none",
    whiteSpace: "nowrap",
    // a hand-set GGD_BUILD_STAMP full of prose gets clipped rather than growing
    // outside the reserved strip and sitting on HUD chrome
    overflow: "hidden",
    // content-box so `height` IS the band: the horizontal padding widens the
    // chip without making it taller than the strip it is allowed to occupy
    boxSizing: "content-box",
    height: VERSION_BADGE_BAND_PX,
    // content width; +16px of padding = the reserved VERSION_BADGE_BAND_W_PX
    maxWidth: VERSION_BADGE_BAND_W_PX - 16,
    lineHeight: `${VERSION_BADGE_BAND_PX}px`,
    fontSize: VERSION_BADGE_BAND_PX,
    fontWeight: 700,
    letterSpacing: "0.4px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    color: "#eaf0ff",
    background: "rgba(4, 6, 12, 0.82)",
    padding: "0 8px",
    borderRadius: "6px 6px 0 0",
    textShadow: "0 0 3px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,0.95)",
    // clear the phone's home indicator; 0 everywhere else
    marginBottom: "env(safe-area-inset-bottom, 0px)",
  };
}
