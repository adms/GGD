/**
 * ChampionMarquee — a horizontal, auto-scrolling band of champion portraits on
 * the login screen, showcasing the roster ("有哪些英雄"). Display-only:
 *
 *   • PURE CSS motion — the track holds two back-to-back copies of the tile list
 *     and a single `translateX(0 → -50%)` keyframe loops seamlessly; no
 *     requestAnimationFrame, no per-frame React. Scroll duration scales with the
 *     roster size so the pixel speed stays constant regardless of headcount.
 *   • pointer-events:none on the whole band, so it can NEVER swallow a click on
 *     the login form / map-select / Play-offline button beneath the same layer.
 *   • Portrait-less heroes (~26 stock-art) get a colored fallback chip (first
 *     name glyph) — never a broken <img>. A live 404 also degrades to the chip.
 *   • prefers-reduced-motion pauses the scroll (respects the OS preference).
 *   • Mobile-safe: fixed tile size, the strip clips (overflow hidden) so it can
 *     never induce page-level horizontal scroll.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS BAND WAS BLANK FOR ITS ENTIRE LIFE (and the two rules that fix it)
 * ---------------------------------------------------------------------------
 * The header used to claim the registry is "populated at boot BEFORE this ever
 * mounts". IT IS NOT. Since task #170 the app paints login FIRST and streams
 * content in the background: store.boot() lands on screen="auth" ~50 ms in,
 * while `Champions.all()` is still []. This component read the registry once
 * inside a `useMemo(…, [])` — subscribing to nothing — so `tiles.length === 0`
 * and it returned null for the rest of the page session. Task #18 therefore
 * never rendered a single <img> in a real browser.
 *
 *   RULE 1 — SUBSCRIBE, DON'T SNAPSHOT. The roster is re-read whenever
 *   `useContentReady()` flips (the same React-free observable the match gate
 *   uses). A registry that fills later must repaint the band.
 *
 *   RULE 2 — AND THEN DON'T PAY FOR IT ALL AT ONCE. Rendering the roster newly
 *   pulls 81 distinct portraits (measured: 750,405 B of WebP-128/PNG). They are
 *   revealed in scroll order — only the tiles that are on screen or about to
 *   be, plus a lookahead — so a login that lasts 15 s costs ~19 portraits
 *   (~180 KB) instead of the full 733 KB. `loading="lazy"` alone is NOT enough
 *   here: every tile lives inside an `overflow:hidden` track moved by a CSS
 *   transform, and the lazy heuristic is not specified to track that.
 *
 *   RULE 3 — "REVEALED" IS NOT "LOADED" (playtest P10). Rules 1+2 got the
 *   portraits requested; they did not get them DRAWN. `revealed` only means "we
 *   have decided to fetch this one", and the moment it flipped, the tile swapped
 *   its designed fallback chip for an <img> that had no bytes yet — over a
 *   `#10151f` box. The first impression of the whole game was therefore a row of
 *   EMPTY BLACK SQUARES for as long as the network took. The chip is now a
 *   LAYER underneath rather than an either/or branch: it stays painted (with a
 *   loading sheen) until that specific portrait's `onLoad` fires, and the
 *   portrait cross-fades in over it. Cached portraits are caught via the img's
 *   `complete` flag, since their load event can beat React's handler.
 */
import { useEffect, useMemo, useState } from "react";
import { Champions } from "@ggd/shared/sim/content/registry";
import { useContentReady } from "./ContentGate";
import { buildMarqueeTiles, type MarqueeChampion, type MarqueeTile } from "./marqueeRoster";

const TILE_W = 66; // px — fixed tile width (portrait column)
const TILE_GAP = 12; // px — trailing space per tile (kept on EVERY tile incl.
//                      the last of copy 1, so both copies are identical width →
//                      the -50% shift lands exactly on a tile boundary = seamless)
const PORTRAIT = 54; // px — square portrait / chip edge
const CAP = 320; // safety cap on distinct tiles (roster is ~90; guards runaway)
/** px of track revealed BEYOND the right edge, so a tile is fetched before it
 *  is visible. One tile is ~9 KB, so a generous margin is cheap. */
const REVEAL_LOOKAHEAD = 240;
/** how often the reveal window is recomputed (s). The strip moves ~26 px/s, so
 *  a 2 s tick is ~52 px — well inside the lookahead above. No rAF. */
const REVEAL_TICK_SEC = 2;

/**
 * How many DISTINCT portraits may have loaded by `elapsedSec`, given the strip
 * scrolls at `pxPerSec` through a `viewportPx`-wide window of `stepPx` tiles.
 *
 * Pure (exported for the unit test) and deliberately in TILE INDEX space: the
 * two seamless copies render the same 81 URLs, so revealing by index reveals
 * both copies of a portrait at once and the browser fetches each URL once.
 */
export function revealedPortraitCount(opts: {
  elapsedSec: number;
  viewportPx: number;
  stepPx: number;
  pxPerSec: number;
  lookaheadPx?: number;
}): number {
  const scrolled = Math.max(0, opts.elapsedSec) * Math.max(0, opts.pxPerSec);
  const reach = opts.viewportPx + (opts.lookaheadPx ?? REVEAL_LOOKAHEAD) + scrolled;
  return Math.max(1, Math.ceil(reach / Math.max(1, opts.stepPx)));
}

/**
 * One strip cell — portrait <img> or, on absence/404/not-yet-revealed, a colored
 * fallback chip. `revealed=false` is what keeps a portrait's bytes off the wire
 * until its tile is near the visible window; those tiles are off screen, so the
 * chip they stand in as is never actually seen (and if the reveal ever lagged,
 * the designed fallback is what shows — never a hole).
 */
function Tile({ tile, revealed }: { tile: MarqueeTile; revealed: boolean }): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  // P10: DECODED, not merely "we decided to request it". See the header note —
  // the gap between those two facts is the row of black squares.
  const [decoded, setDecoded] = useState(false);
  const hasImg = tile.iconUrl !== null && !failed && revealed;
  // The chip is the floor under EVERY tile: it stays painted until this tile's
  // own portrait has actually decoded, and the portrait then fades in over it.
  const showChip = !hasImg || !decoded;
  return (
    <div
      style={{
        width: TILE_W,
        marginRight: TILE_GAP,
        flex: "0 0 auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <div
        title={tile.name}
        style={{
          width: PORTRAIT,
          height: PORTRAIT,
          borderRadius: 10,
          overflow: "hidden",
          position: "relative",
          border: "1px solid rgba(150,170,225,0.35)",
          boxShadow: "0 3px 10px rgba(0,0,0,0.45)",
          // fallback chip: a stable per-champion gradient + centered glyph
          background: showChip
            ? `linear-gradient(150deg, hsl(${tile.hue} 55% 42%), hsl(${(tile.hue + 40) % 360} 60% 26%))`
            : "#10151f",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* The chip is a LAYER, not an either/or branch: it is painted under the
            portrait and only stops being visible once that portrait has decoded,
            so there is never a frame showing an empty box. While a portrait is
            in flight the chip carries a slow sheen (`ggd-marquee-shimmer`) that
            reads as "loading" rather than as a finished, broken tile. */}
        {showChip && (
          <span
            aria-hidden
            className={hasImg ? "ggd-marquee-shimmer" : undefined}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              fontWeight: 800,
              color: "rgba(255,255,255,0.92)",
              lineHeight: 1,
            }}
          >
            {tile.initial}
          </span>
        )}
        {hasImg && (
          <>
            <img
              src={tile.iconUrl ?? undefined}
              alt=""
              loading="lazy"
              draggable={false}
              onError={() => setFailed(true)}
              // onLoad is the DECODE signal that ends the chip. `complete` is
              // checked in the ref too: a portrait already in the HTTP cache can
              // finish before React attaches the handler, and without that check
              // such a tile would sit on its chip forever.
              ref={(el) => {
                if (el?.complete === true && el.naturalWidth > 0) setDecoded(true);
              }}
              onLoad={() => setDecoded(true)}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                // cross-fade in over the chip; no layout shift, no pop
                opacity: decoded ? 1 : 0,
                transition: "opacity 320ms ease-out",
              }}
            />
            {/* w3x vertex tint, applied as an exact multiply so the portrait
                matches the champion the 3D model renders as. 黑化Saber shares
                Saber's extracted PNG; its 0.29 grey is what makes the two tiles
                visibly different characters instead of one duplicate. Fades with
                the portrait — a multiply over a bare chip would darken it. */}
            {tile.tintCss !== null && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  background: tile.tintCss,
                  mixBlendMode: "multiply",
                  pointerEvents: "none",
                  opacity: decoded ? 1 : 0,
                  transition: "opacity 320ms ease-out",
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function ChampionMarquee(): React.JSX.Element | null {
  // RULE 1 (see header): the registry is EMPTY when this first mounts. Re-read
  // it when the content boot settles — this dependency is the whole fix.
  const contentReady = useContentReady();
  const source = useMemo<MarqueeChampion[]>(
    () =>
      Champions.all()
        .slice(0, CAP)
        .map((c) => {
          // modelKey + abilities are IDENTITY EVIDENCE for the shared
          // championIdentity rule (the ability names carry the hero 編號);
          // tint is what keeps a re-coloured champion — 黑化Saber — from
          // reading as a duplicate portrait of the hero it shares a mesh with.
          const entry: MarqueeChampion = {
            id: c.id,
            name: c.name,
            tags: c.tags,
            modelKey: c.modelKey,
            abilities: c.abilities,
          };
          if (c.icon !== undefined) entry.icon = c.icon;
          if (c.tint !== undefined) entry.tint = c.tint;
          return entry;
        }),
    [contentReady],
  );
  const tiles = useMemo(() => buildMarqueeTiles(source, { copies: 2 }), [source]);

  const distinct = tiles.length / 2; // copies:2
  // Constant pixel speed (~26px/s) regardless of roster size; clamp the range so
  // a tiny skeleton roster isn't dizzyingly fast nor a huge one glacial.
  const copyWidth = distinct * (TILE_W + TILE_GAP);
  const durationSec = Math.min(180, Math.max(40, Math.round(copyWidth / 26)));

  // RULE 2 (see header): progressive reveal, driven by the SAME clock the CSS
  // keyframe runs on (copyWidth / durationSec px per second), so a portrait is
  // fetched just before its tile slides into the window and never earlier.
  const [elapsedSec, setElapsedSec] = useState(0);
  const viewportPx = typeof window !== "undefined" ? window.innerWidth : 1280;
  const revealed =
    distinct === 0
      ? 0
      : revealedPortraitCount({
          elapsedSec,
          viewportPx,
          stepPx: TILE_W + TILE_GAP,
          pxPerSec: copyWidth / durationSec,
        });
  const revealDone = distinct === 0 || revealed >= distinct;
  useEffect(() => {
    if (revealDone) return; // every portrait is in — stop the timer for good
    const id = setInterval(() => setElapsedSec((s) => s + REVEAL_TICK_SEC), REVEAL_TICK_SEC * 1000);
    return () => clearInterval(id);
  }, [revealDone]);

  // Nothing loaded (or filtered to zero) → render nothing; never an empty band.
  // AFTER every hook: the registry fills asynchronously, so this component's
  // first render is always the empty one and the hook order must not change.
  if (tiles.length === 0) return null;

  return (
    <div
      aria-hidden
      // ggd-login-marquee: this decorative band is DROPPED on a short viewport
      // (landscape phone, ~375px tall — task #151) by mobile.css, where the
      // bottom-pinned strip would otherwise paint over the login form's
      // Sign-in button. The form always wins.
      className="ggd-login-marquee"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        // sit in the gap between the (centered) form block and the pinned footer
        bottom: "max(46px, calc(env(safe-area-inset-bottom, 0px) + 42px))",
        zIndex: 1,
        pointerEvents: "none", // display-only: never blocks the form beneath
        overflow: "hidden", // clip the wide track → no page horizontal scroll
        paddingTop: 8,
        paddingBottom: 8,
        // dark scrim so the strip reads over the bright glowing arena scene
        background:
          "linear-gradient(to bottom, rgba(4,7,13,0) 0%, rgba(4,7,13,0.62) 22%, rgba(4,7,13,0.62) 78%, rgba(4,7,13,0) 100%)",
        borderTop: "1px solid rgba(120,140,190,0.14)",
        borderBottom: "1px solid rgba(120,140,190,0.14)",
      }}
    >
      <style>{
        // seamless: the track is two identical copies wide; shifting by 50%
        // (one copy) puts copy-2 exactly where copy-1 began. reduced-motion → paused.
        "@keyframes ggdChampMarquee{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}" +
        "@media (prefers-reduced-motion: reduce){.ggd-champ-marquee-track{animation-play-state:paused!important}}" +
        // P10: the "this tile is still loading" sheen. A diagonal highlight
        // sweeping across the chip — the standard skeleton idiom, so the row
        // reads as content on its way in rather than as a finished broken grid.
        // Only ever applied to a chip that HAS a portrait coming (see Tile), so
        // a genuinely portrait-less champion keeps its calm static chip and does
        // not pretend to be loading something that will never arrive.
        "@keyframes ggdMarqueeShimmer{0%{background-position:-140% 0}100%{background-position:240% 0}}" +
        ".ggd-marquee-shimmer{background-image:linear-gradient(115deg," +
        "rgba(255,255,255,0) 35%,rgba(255,255,255,0.22) 50%,rgba(255,255,255,0) 65%);" +
        "background-size:220% 100%;animation:ggdMarqueeShimmer 1.5s ease-in-out infinite}" +
        "@media (prefers-reduced-motion: reduce){.ggd-marquee-shimmer{animation:none}}"
      }</style>

      <div
        style={{
          fontSize: 10,
          letterSpacing: 3,
          fontWeight: 700,
          color: "rgba(180,193,224,0.72)",
          textAlign: "center",
          marginBottom: 6,
          textShadow: "0 1px 6px rgba(0,0,0,0.9)",
        }}
      >
        英雄陣容
      </div>

      {/* viewport: full width, clips the wide track; edge fade so tiles slide in/out */}
      <div
        style={{
          width: "100%",
          overflow: "hidden",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0, #000 7%, #000 93%, transparent 100%)",
          maskImage: "linear-gradient(to right, transparent 0, #000 7%, #000 93%, transparent 100%)",
        }}
      >
        <div
          className="ggd-champ-marquee-track"
          style={{
            display: "flex",
            width: "max-content",
            willChange: "transform",
            animation: `ggdChampMarquee ${durationSec}s linear infinite`,
          }}
        >
          {tiles.map((t, i) => (
            // `i % distinct` = the PORTRAIT index (both seamless copies share
            // the same URL list), so the two copies of a tile reveal together
            // and the browser still fetches each portrait exactly once.
            <Tile key={t.key} tile={t} revealed={i % distinct < revealed} />
          ))}
        </div>
      </div>
    </div>
  );
}
