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
 * The roster comes from the shared Champions registry (populated at boot BEFORE
 * this ever mounts). If it is somehow empty (skeleton-only / not yet loaded) the
 * component renders nothing rather than an empty band — the login screen is
 * never blocked or broken by the marquee.
 */
import { useMemo, useState } from "react";
import { Champions } from "@ggd/shared/sim/content/registry";
import { buildMarqueeTiles, type MarqueeChampion, type MarqueeTile } from "./marqueeRoster";

const TILE_W = 66; // px — fixed tile width (portrait column)
const TILE_GAP = 12; // px — trailing space per tile (kept on EVERY tile incl.
//                      the last of copy 1, so both copies are identical width →
//                      the -50% shift lands exactly on a tile boundary = seamless)
const PORTRAIT = 54; // px — square portrait / chip edge
const CAP = 320; // safety cap on distinct tiles (roster is ~90; guards runaway)

/** One strip cell — portrait <img> or, on absence/404, a colored fallback chip. */
function Tile({ tile }: { tile: MarqueeTile }): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  const showChip = tile.iconUrl === null || failed;
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
        {showChip ? (
          <span
            aria-hidden
            style={{ fontSize: 24, fontWeight: 800, color: "rgba(255,255,255,0.92)", lineHeight: 1 }}
          >
            {tile.initial}
          </span>
        ) : (
          <>
            <img
              src={tile.iconUrl ?? undefined}
              alt=""
              loading="lazy"
              draggable={false}
              onError={() => setFailed(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            {/* w3x vertex tint, applied as an exact multiply so the portrait
                matches the champion the 3D model renders as. 黑化Saber shares
                Saber's extracted PNG; its 0.29 grey is what makes the two tiles
                visibly different characters instead of one duplicate. */}
            {tile.tintCss !== null && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  background: tile.tintCss,
                  mixBlendMode: "multiply",
                  pointerEvents: "none",
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
  // Registry is static after boot; snapshot once. Same source ChampSelectPanel
  // reads, so the showcase stays in sync with the pickable roster.
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
    [],
  );
  const tiles = useMemo(() => buildMarqueeTiles(source, { copies: 2 }), [source]);

  // Nothing loaded (or filtered to zero) → render nothing; never an empty band.
  if (tiles.length === 0) return null;

  const distinct = tiles.length / 2; // copies:2
  // Constant pixel speed (~26px/s) regardless of roster size; clamp the range so
  // a tiny skeleton roster isn't dizzyingly fast nor a huge one glacial.
  const copyWidth = distinct * (TILE_W + TILE_GAP);
  const durationSec = Math.min(180, Math.max(40, Math.round(copyWidth / 26)));

  return (
    <div
      aria-hidden
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
        "@media (prefers-reduced-motion: reduce){.ggd-champ-marquee-track{animation-play-state:paused!important}}"
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
          {tiles.map((t) => (
            <Tile key={t.key} tile={t} />
          ))}
        </div>
      </div>
    </div>
  );
}
