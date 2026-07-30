/**
 * SpectateNotice — 「你的競技場打完了。要去看別人的嗎?」
 *
 * HISTORY, because the shape of this file only makes sense with it.
 *   #208 redirected the combat camera to a still-live zone the moment your own
 *   duel was decided. #85's banner (v0.9.1) then had to APOLOGISE for that jump,
 *   because from the player's side the screen simply cut to strangers fighting
 *   in a place they had never been.
 *   owner, 2026-07-28 (#269): 「不要跳去看別人的競技場，但可以跳出按鈕前往/返回」.
 *
 * So the banner stops narrating a jump and becomes the CONTROL for it. Two
 * states, and they are genuinely different sentences:
 *
 *   ① OFFER   — your duel is over, another arena is still fighting, and your
 *               camera has NOT moved. 「前往觀戰 第N競技場」.
 *   ② WATCHING— you pressed it. 「返回自己的競技場」.
 *
 * SOURCE OF TRUTH is still the frameBus, and still the very fields the camera
 * uses: `spectateOffer` (what the pure #208 decision says is available) and
 * `spectateZone` (where the camera actually is). Deriving either from the local
 * seat's alive flag / team elimination / phase would be a second opinion about
 * the camera, and the two would drift.
 *
 * rAF-polled rather than store-subscribed for the same reason Minimap is: the
 * frameBus is written every render frame and never goes through React. Reading
 * it on a timer keeps this component out of the sim→UI projection entirely.
 *
 * PLACEMENT (#107 → #219). It is CENTRED chrome, so it owns no corner slot —
 * the same category as PhaseTimer / the ability cluster, which
 * `controlLegendModel` already declares as the two unslotted clusters. v0.9.1
 * pinned it at `top: 12`, INSIDE PhaseTimer's own 10..62 band; v0.9.12 moved it
 * to `TOP_CENTRE_BAND_END + HUD_GAP` — and that was still a hard-coded number
 * that could not see the two other boxes sharing the same phase:
 *
 *   owner, 2026-07-30: 「你的競技場已分出勝負 擋住結算評價」
 *
 * It sat on HudRoot's 「Round over」 pill (`top: 120`, centred — the SAME rows)
 * and, on a ≤1250px window, on the 評價 card's left edge. So the banner no
 * longer pins anything: it claims the `spectate-notice` row of the top-centre
 * STACK in `ui/hud/hudSurfaces`, and the resolver hands back a rect that has
 * already been cleared of every other painted box for this phase and viewport.
 *
 * `null` is a real answer (a 812×375 phone during `resolution` genuinely has no
 * room beside the 評價 card), and a narrow rect switches the plate to its
 * COMPACT tier rather than clipping a sentence — the same ladder the ping chip
 * uses inside the build-stamp gutter.
 */
import React, { useEffect, useState } from "react";
import { frameBus } from "../../frameBus";
import { HUD_GAP } from "./hudLayout";
import type { HudRect } from "./hudLayout";
import { hudSurfaceStyle } from "./hudSurfaces";
import { useHudSurface } from "./useHudSurface";
import { TOP_CENTRE_BAND_END } from "../controlLegendModel";
import { hudActions } from "../actions";
import { SfxButton } from "../SfxButton";

/**
 * How often the banner re-checks the camera. 200 ms is far below the threshold
 * at which a player perceives lag on an informational banner, and far above the
 * render cadence — so the check costs nothing while still appearing within a
 * fifth of a second of the duel being decided.
 */
export const SPECTATE_POLL_MS = 200;

/** The line the owner asked for in v0.9.1, kept verbatim for the WATCHING state. */
export const SPECTATE_NOTICE_TEXT = "";
/** The OFFER state's line: your fight is over and nothing has moved on its own. */
export const SPECTATE_OFFER_TEXT = "你的競技場已分出勝負";
export const SPECTATE_GO_LABEL = "前往觀戰";
export const SPECTATE_BACK_LABEL = "返回自己的競技場";

/**
 * The FIRST row of the top-centre stack — where the banner lands during combat,
 * when 「Round over」 is not up. Kept exported because it is what the #269 guard
 * asserts the banner clears (`> TOP_CENTRE_BAND_END`); the resolver in
 * `hudSurfaces` produces exactly this y for the combat scene.
 */
export const SPECTATE_NOTICE_TOP = TOP_CENTRE_BAND_END + HUD_GAP;

/**
 * Below this the plate drops the 「第 N 競技場」 chip and shortens its sentence
 * so the BUTTON always survives — a banner whose action is clipped off is worse
 * than no banner. 320 is the full form measured at its own font stack: dot 9 +
 * gap 10 + 「你的競技場已分出勝負」 145 + gap 10 + zone chip 74 + gap 10 + button
 * 80 + 2×14 padding ≈ 366, so anything under ~320 is already losing the chip.
 */
export const SPECTATE_COMPACT_W = 320;

/** The short sentence used when the plate cannot hold the full one. */
export const SPECTATE_OFFER_TEXT_SHORT = "已分出勝負";

export type SpectateMode = "hidden" | "offer" | "watching";

export interface SpectateNoticeView {
  mode: SpectateMode;
  /** the zone the button acts on; -1 when there is nothing to act on */
  zone: number;
  text: string;
  zoneLabel: string;
  buttonLabel: string;
}

const HIDDEN: SpectateNoticeView = {
  mode: "hidden",
  zone: -1,
  text: "",
  zoneLabel: "",
  buttonLabel: "",
};

/**
 * The pure decision: given the camera's two published numbers, WHAT does the
 * banner say and WHICH button does it carry? Split out so the wording, the gate
 * and the 1-based zone naming are testable without a DOM, a render loop or a
 * WebGL context.
 *
 * WATCHING WINS over OFFER when both are set. That is not a preference, it is
 * the only correct reading: `spectateOffer` keeps being published while you are
 * away (the rule that made the trip available has not changed), so ordering the
 * other way would offer you a trip you are already on and hide the way back.
 */
export function spectateNotice(
  spectateZone: number | null,
  spectateOffer: number | null,
): SpectateNoticeView {
  if (spectateZone !== null) {
    return {
      mode: "watching",
      zone: spectateZone,
      text: SPECTATE_NOTICE_TEXT,
      // 1-based for humans: the player has never seen a zero-indexed zone
      // anywhere else in this game, and 「第 0 競技場」 reads as a bug.
      zoneLabel: `第 ${spectateZone + 1} 競技場`,
      buttonLabel: SPECTATE_BACK_LABEL,
    };
  }
  if (spectateOffer !== null) {
    return {
      mode: "offer",
      zone: spectateOffer,
      text: SPECTATE_OFFER_TEXT,
      zoneLabel: `第 ${spectateOffer + 1} 競技場`,
      buttonLabel: SPECTATE_GO_LABEL,
    };
  }
  return HIDDEN;
}

/** The two calls the banner's one button can make (a slice of `hudActions`). */
export interface SpectateActions {
  spectateGoTo(zone: number): void;
  spectateReturn(): void;
}

/**
 * What pressing the button DOES, as a pure dispatch over the same view the
 * button was painted from.
 *
 * Extracted rather than inlined into `onClick` so a node-environment test can
 * drive the real decision with a fake `actions` — this client's vitest runs
 * with `environment: "node"` (apps/client/vite.config.ts), so there is no DOM
 * to click in, and a test that re-implemented the branch would be asserting
 * against itself. The component calls exactly this function.
 */
export function spectateNoticeClick(view: SpectateNoticeView, actions: SpectateActions): void {
  if (view.mode === "watching") actions.spectateReturn();
  else if (view.mode === "offer") actions.spectateGoTo(view.zone);
}

export function SpectateNoticeView_({
  view,
  rect,
}: {
  view: SpectateNoticeView;
  /** the resolved `spectate-notice` surface; `null` = no room, paint nothing */
  rect: HudRect | null;
}): React.JSX.Element | null {
  if (view.mode === "hidden" || !rect) return null;
  const watching = view.mode === "watching";
  const compact = rect.w < SPECTATE_COMPACT_W;
  const text = compact && !watching ? SPECTATE_OFFER_TEXT_SHORT : view.text;
  return (
    <div
      data-hud-surface="spectate-notice"
      data-spectate-notice={view.mode}
      data-spectate-tier={compact ? "compact" : "full"}
      style={{
        // Placement comes from the #107 surface registry — never from a number
        // typed here. #hud-root already owns the safe-area inset on coarse
        // pointers (see hudLayout's header), so these are plain px.
        ...hudSurfaceStyle("spectate-notice", rect),
        boxSizing: "border-box",
        justifyContent: "center",
        // the PLATE is click-through; only the button below opts back in, so a
        // misclick on the banner during a fight can never eat an order.
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: compact ? "8px 10px" : "8px 14px",
        borderRadius: 999,
        border: "1px solid rgba(242,161,60,0.55)",
        background: "linear-gradient(180deg, rgba(28,22,12,0.92), rgba(18,14,8,0.92))",
        boxShadow: "0 6px 28px rgba(0,0,0,0.6)",
        textAlign: "center",
      }}
      role="status"
      aria-live="polite"
    >
      {/* a slow pulse, so it reads as LIVE rather than as a stuck label */}
      <span
        aria-hidden="true"
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: "#f2a13c",
          flexShrink: 0,
          animation: "ggd-spectate-pulse 1.6s ease-in-out infinite",
        }}
      />
      <span
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "#f6e3c0",
          letterSpacing: "0.5px",
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </span>
      {!compact && (
        <span
          style={{
            fontSize: 12,
            color: "#d9b26a",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          {view.zoneLabel}
        </span>
      )}
      <SfxButton
        type="button"
        data-spectate-action={watching ? "return" : "go"}
        onClick={() => spectateNoticeClick(view, hudActions)}
        style={{
          pointerEvents: "auto",
          padding: "4px 14px",
          borderRadius: 999,
          border: `1px solid ${watching ? "#8ab6e8" : "#d9b64e"}`,
          background: watching ? "rgba(24,40,62,0.92)" : "rgba(58,46,18,0.92)",
          color: watching ? "#cfe4ff" : "#f0d78a",
          fontSize: 13,
          fontWeight: 700,
          whiteSpace: "nowrap",
          cursor: "pointer",
        }}
      >
        {view.buttonLabel}
      </SfxButton>
      {/* Scoped keyframes, declared here rather than in a global sheet so the
          banner carries its own animation and cannot be broken by a stylesheet
          it does not own. `prefers-reduced-motion` drops the pulse entirely. */}
      <style>{`
        @keyframes ggd-spectate-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.25 } }
        @media (prefers-reduced-motion: reduce) {
          [style*="ggd-spectate-pulse"] { animation: none !important }
        }
      `}</style>
    </div>
  );
}

export function SpectateNotice(): React.JSX.Element | null {
  const [zone, setZone] = useState<number | null>(frameBus.spectateZone);
  const [offer, setOffer] = useState<number | null>(frameBus.spectateOffer);
  // `null` outside the banner's declared phases (`combat` / `resolution`) — a
  // 前往觀戰 button on the settlement screen is an offer to leave a match that
  // is already over.
  const rect = useHudSurface("spectate-notice");
  useEffect(() => {
    const iv = setInterval(() => {
      setZone(frameBus.spectateZone);
      setOffer(frameBus.spectateOffer);
    }, SPECTATE_POLL_MS);
    return () => clearInterval(iv);
  }, []);
  return <SpectateNoticeView_ view={spectateNotice(zone, offer)} rect={rect} />;
}
