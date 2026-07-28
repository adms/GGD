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
 * PLACEMENT (#107). It is CENTRED chrome, so it owns no corner slot — the same
 * category as PhaseTimer / the ability cluster, which `controlLegendModel`
 * already declares as the two unslotted clusters. It hangs off
 * `TOP_CENTRE_BAND_END`, i.e. below the phase clock and the 觀戰中 hint, rather
 * than at the `top: 12` v0.9.1 gave it — that number sat INSIDE PhaseTimer's
 * own 10..62 band, which was survivable for a click-through label and is not
 * survivable now that the banner carries a button the player has to hit.
 */
import React, { useEffect, useState } from "react";
import { frameBus } from "../../frameBus";
import { HUD_GAP, HUD_Z } from "./hudLayout";
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

/** Distance from the top edge. Derived, so it tracks the top-centre cluster. */
export const SPECTATE_NOTICE_TOP = TOP_CENTRE_BAND_END + HUD_GAP;

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

export function SpectateNoticeView_({ view }: { view: SpectateNoticeView }): React.JSX.Element | null {
  if (view.mode === "hidden") return null;
  const watching = view.mode === "watching";
  return (
    <div
      data-spectate-notice={view.mode}
      style={{
        position: "fixed",
        top: `calc(env(safe-area-inset-top, 0px) + ${SPECTATE_NOTICE_TOP}px)`,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: HUD_Z.expanded,
        // the PLATE is click-through; only the button below opts back in, so a
        // misclick on the banner during a fight can never eat an order.
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
        borderRadius: 999,
        border: "1px solid rgba(242,161,60,0.55)",
        background: "linear-gradient(180deg, rgba(28,22,12,0.92), rgba(18,14,8,0.92))",
        boxShadow: "0 6px 28px rgba(0,0,0,0.6)",
        maxWidth: "min(92vw, 680px)",
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
      <span style={{ fontSize: 14, fontWeight: 700, color: "#f6e3c0", letterSpacing: "0.5px" }}>
        {view.text}
      </span>
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
  useEffect(() => {
    const iv = setInterval(() => {
      setZone(frameBus.spectateZone);
      setOffer(frameBus.spectateOffer);
    }, SPECTATE_POLL_MS);
    return () => clearInterval(iv);
  }, []);
  return <SpectateNoticeView_ view={spectateNotice(zone, offer)} />;
}
