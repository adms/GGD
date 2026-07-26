/**
 * PingChip — the player's latency, on EVERY screen (task #272).
 *
 * owner: 「請你顯示玩家 ping 值在跟版本號一樣都一直畫面上」
 *
 * ---------------------------------------------------------------------------
 * WHERE IT PAINTS, AND WHY IT COPIES THE BUILD STAMP EXACTLY
 * ---------------------------------------------------------------------------
 * "As permanent as the version number" is a ubiquity claim, and this codebase
 * already solved that once (#66 → #245): a <body> portal (so no stacking
 * context can bury it), `pointer-events: none` (so it can never swallow a
 * click at any z-index), and a hard confinement to the bottom
 * `HUD_STAMP_BAND` px — the gutter the #107 safe-area contract already keeps
 * empty. This chip takes the LEFT end of that same strip; the stamp keeps the
 * centre. Nothing new is invented, so nothing new can go wrong.
 *
 * The band, the width maths and the reasoning for the left end (the right end
 * is 8px from the displaced ☰ on a 780x360 phone) live in ui/hud/hudLayout.ts
 * next to the stamp band, and ui/hud/versionBadgeBand.test.ts proves the two
 * bands never overlap and that neither touches a HUD slot, on every guard
 * viewport and both pointer types.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS NO REACT STATE IN THE UPDATE PATH
 * ---------------------------------------------------------------------------
 * This chip is on the login screen too, where a heavy Babylon scene is running,
 * and `FpsPill` is ALREADY running an unconditional 4 Hz `setState` in-match.
 * Adding a second one would be 8 React renders a second for two numbers. So the
 * sampler writes `textContent` / `style.color` through a ref — one interval,
 * zero re-renders, zero allocation per tick — which is also literally what the
 * task asked for (「用 ref 直接寫 DOM，或把更新隔離在自己的小元件裡」).
 *
 * Visibility is a `display` toggle on the same node rather than unmounting, so
 * entering and leaving a match costs no React work either.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT REFUSES TO SAY
 * ---------------------------------------------------------------------------
 * All of that lives in ./pingChip.ts as pure functions. Short version: it never
 * prints a bare 「0 ms」 (that is "no measurement yet", not a perfect link) and
 * never presents a frozen EMA as live. See the state machine there.
 */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { perfBus } from "../perfBus";
import { useSettings } from "./useSettings";
import {
  HUD_PING_BAND_W,
  HUD_PING_CHIP_PAD_X,
  HUD_STAMP_BAND,
  HUD_STAMP_BAND_W,
  hudPingChipContentPx,
} from "./hud/hudLayout";
// ⚠️ `pingReadout`, not `pingChip`: macOS filesystems are case-INSENSITIVE, and
// vitest's resolver tries `.ts` before `.tsx`. A sibling `pingChip.ts` would
// therefore capture `import … from "./PingChip"` and hand every consumer the
// pure module instead of this component — silently, with no error until
// something asked for a React export. (Same family as the dual-instance trap
// documented in vitest.shared.ts.)
import { PING_CHIP_FONT_PX, pingChipState, pingChipText } from "./pingReadout";

/** DOM marker — one query selector finds the chip in a screenshot pipeline. */
export const PING_CHIP_ATTR = "data-ggd-ping-chip";

/**
 * 4 Hz, the same cadence `PerfOverlay` samples at. Fast enough that throttling
 * the network at 200 ms visibly moves the number (the plan's own acceptance
 * criterion), slow enough that the EMA-smoothed value reads as a number rather
 * than a flicker.
 */
export const PING_SAMPLE_MS = 250;

/**
 * One below the build stamp. Both sit above every panel — that is the whole
 * point of #245 — but if a future layer ever lands between them the stamp is
 * the one that must survive, because a screenshot without a build id is
 * unusable while a screenshot without a ping is merely less useful.
 */
export const PING_CHIP_Z = 2147483645;

/**
 * The chip's box. Written HERE, in the .tsx, rather than in a shared module —
 * on purpose. `versionBadgeBand.test.ts` scans `apps/client/src/ui/**` for
 * `bottom:` declarations and forces every one that lands in the reserved band
 * to be answered for in its ledger. Hiding this geometry in `packages/shared`
 * or in a `.ts` file would slip past that scan, which is a hole, not a
 * technique. So the declaration sits where the guard can see it and the ledger
 * carries its reason.
 */
export function pingChipStyle(): React.CSSProperties {
  return {
    position: "fixed",
    bottom: 0,
    // hard against the left edge, NOT inset by HUD_EDGE: on a 375px-wide
    // viewport the centred stamp band leaves exactly 47.5px here, and giving
    // 10 of them away costs the difference between "999+ms" and a clipped
    // number. Nothing else in the app claims x<10 of the bottom 10px.
    left: 0,
    zIndex: PING_CHIP_Z,
    // the property that makes painting on top safe at ANY z-index
    pointerEvents: "none",
    userSelect: "none",
    whiteSpace: "nowrap",
    // last-resort confinement: whatever the label ladder picks, the box cannot
    // grow into the build stamp's reservation
    overflow: "hidden",
    // content-box, so horizontal padding widens the chip without making it
    // taller than the band it is allowed to occupy
    boxSizing: "content-box",
    height: HUD_STAMP_BAND,
    // = hudPingChipContentPx(viewportWidth), expressed in CSS so it tracks a
    // resize with no listener: 50vw − (band/2) − (both paddings).
    maxWidth: `max(0px, min(${HUD_PING_BAND_W - HUD_PING_CHIP_PAD_X * 2}px, calc(50vw - ${
      HUD_STAMP_BAND_W / 2 + HUD_PING_CHIP_PAD_X * 2
    }px)))`,
    lineHeight: `${HUD_STAMP_BAND}px`,
    fontSize: PING_CHIP_FONT_PX,
    fontWeight: 700,
    letterSpacing: "0.2px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    // tabular figures: a changing ping must not shift the text's width, or the
    // overflow clip point would crawl every quarter second
    fontVariantNumeric: "tabular-nums",
    background: "rgba(4, 6, 12, 0.82)",
    padding: `0 ${HUD_PING_CHIP_PAD_X}px`,
    borderRadius: "0 6px 0 0",
    textShadow: "0 0 3px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,0.95)",
    marginBottom: "env(safe-area-inset-bottom, 0px)",
  };
}

/** Pure, prop-driven view — the render target for tests. */
export function PingChipView({
  text,
  color,
  visible,
}: {
  text: string;
  color: string;
  visible: boolean;
}): React.JSX.Element {
  return (
    <div
      data-ggd-ping-chip
      aria-hidden
      style={{ ...pingChipStyle(), color, display: visible ? "block" : "none" }}
    >
      {text}
    </div>
  );
}

export function PingChip(): React.JSX.Element {
  const showPing = useSettings((s) => s.network.showPing);
  const ref = useRef<HTMLDivElement | null>(null);
  const showRef = useRef(showPing);
  showRef.current = showPing;

  useEffect(() => {
    const paint = (): void => {
      const el = ref.current;
      if (!el) return;
      const state = pingChipState({
        showPing: showRef.current,
        netMode: perfBus.netMode,
        netSnapshots: perfBus.netSnapshots,
        pingMs: perfBus.pingMs,
        jitterMs: perfBus.jitterMs,
        pingSamples: perfBus.pingSamples,
        pingAgeMs: perfBus.pingAgeMs,
        snapshotGapMs: perfBus.snapshotGapMs,
        connection: perfBus.connection,
      });
      if (state.kind === "hidden") {
        el.style.display = "none";
        return;
      }
      const width = typeof window !== "undefined" ? window.innerWidth : 0;
      const text = pingChipText(state, hudPingChipContentPx(width));
      el.style.display = "block";
      // guarded writes: the DOM is only touched when the string actually
      // changed, so a steady connection costs one comparison per 250ms
      if (el.textContent !== text) el.textContent = text;
      if (el.style.color !== state.color) el.style.color = state.color;
    };
    paint();
    const id = setInterval(paint, PING_SAMPLE_MS);
    return () => clearInterval(id);
  }, []);

  const view = (
    <div
      ref={ref}
      data-ggd-ping-chip
      aria-hidden
      style={{ ...pingChipStyle(), display: "none" }}
    />
  );
  // Portal to <body> for the same reason the badge and the audio cluster do:
  // #hud-root is z-index 10 and opens a stacking context, so a child of it is
  // covered by every full-screen panel. In a non-DOM env (vitest `node`) fall
  // back to inline rendering so the markup stays assertable.
  if (typeof document !== "undefined" && document.body) {
    return createPortal(view, document.body);
  }
  return view;
}
