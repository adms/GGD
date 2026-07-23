/**
 * MatchLoadingOverlay — the login→battle handoff loading transition (task #74).
 *
 * When the player presses "Play offline" the store stages the launch behind
 * `matchLoading` (via `beginOfflineLoading`) rather than jumping straight to the
 * match. This overlay then holds the screen for at least MATCH_LOADING_MIN_MS
 * (>=1s) with a team-colour loading bar and, on mount, drives the login dragon
 * roar's fade-out so the long roar recedes BEHIND the bar instead of overlapping
 * the combat scene's voices the instant the match boots. When the bar completes
 * it calls `commitMatchLaunch`, which flips `screen → "match"`.
 *
 * The bar fill uses the blue team colour (TEAM_CSS[0]) — the same "this is you"
 * team-colour cue the own-champion highlight uses in combat (the in-combat glow
 * itself is a render-side concern via the blue team-ring), so the handoff reads
 * as "you are the blue champion" from the very first frame of loading.
 *
 * Renders nothing when no launch is staged, so it is safe to mount permanently.
 */
import { useEffect } from "react";
import { useApp, MATCH_LOADING_MIN_MS } from "./store";
import { TEAM_CSS } from "../theme";

/** The blue team colour — the own-champion "this is you" cue. */
const OWN_TEAM = TEAM_CSS[0];

/**
 * The loading bar itself — pure/presentational (no store, no effects), so the
 * >=1s handoff bar is renderable and testable on its own. `minMs` is the fill
 * duration AND the hold the container enforces before committing to the match.
 */
export function MatchLoadingBar({ minMs = MATCH_LOADING_MIN_MS }: { minMs?: number }): React.JSX.Element {
  return (
    <div
      role="progressbar"
      aria-label="進入戰場"
      aria-busy="true"
      data-testid="match-loading"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 60, // above the enter-flash (40) so the bar owns the last frame
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        pointerEvents: "auto", // swallow clicks while we hand off to the match
        background: "radial-gradient(ellipse at 50% 45%, #0d1220 0%, #04060b 78%)",
      }}
    >
      <style>{
        `@keyframes ggdMatchLoadFill{from{width:0%}to{width:100%}}` +
        `@keyframes ggdMatchLoadGlow{0%,100%{opacity:0.55}50%{opacity:1}}`
      }</style>
      <div
        style={{
          fontSize: 15,
          letterSpacing: 3,
          color: "#d5ddf2",
          textShadow: "0 1px 8px rgba(0,0,0,0.85)",
          animation: "ggdMatchLoadGlow 1200ms ease-in-out infinite",
        }}
      >
        進入戰場…
      </div>
      <div
        style={{
          position: "relative",
          width: 280,
          maxWidth: "70vw",
          height: 6,
          borderRadius: 4,
          overflow: "hidden",
          background: "rgba(120,140,190,0.18)",
          boxShadow: "0 0 0 1px rgba(120,140,190,0.25)",
        }}
      >
        <div
          data-testid="match-loading-fill"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "0%",
            borderRadius: 4,
            background: `linear-gradient(90deg, ${OWN_TEAM}, #a9c2ff)`,
            boxShadow: `0 0 12px 2px ${OWN_TEAM}`,
            // >=1s fill: the roar fades out behind this bar before combat starts
            animation: `ggdMatchLoadFill ${minMs}ms linear forwards`,
          }}
        />
      </div>
    </div>
  );
}

/**
 * The container: reads the staged launch from the store, holds it behind the
 * bar for MATCH_LOADING_MIN_MS, then commits to the match. Renders nothing when
 * no launch is staged, so it is safe to mount permanently on the login screen.
 */
export function MatchLoadingOverlay(): React.JSX.Element | null {
  const loading = useApp((s) => s.matchLoading);
  const commit = useApp((s) => s.commitMatchLaunch);

  // One timer per staged launch; cleared if the launch is aborted
  // (cancelMatchLoading) or the screen changes out from under us.
  useEffect(() => {
    if (!loading) return;
    const t = window.setTimeout(() => commit(), MATCH_LOADING_MIN_MS);
    return () => window.clearTimeout(t);
  }, [loading, commit]);

  if (!loading) return null;
  return <MatchLoadingBar />;
}
