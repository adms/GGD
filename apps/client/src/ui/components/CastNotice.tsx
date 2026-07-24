/**
 * CastNoticeLine — the sentence that answers a refused ability press.
 *
 * Playtest P7: 「我按了 Q，沒有特效，也沒有『冷卻中／不能施放』的提示，
 * 所以我根本不知道遊戲是不是無視我」. The button flash and shake (painted by the
 * bar itself, per-frame) say THAT something was refused; this says WHY.
 *
 * PLACEMENT — it rides directly above the ability bar rather than in a corner,
 * because the player's eyes are already there (they just pressed it) and
 * because #107's safe-area contract forbids adding persistent chrome that could
 * cover a panel. This element is TRANSIENT (a ~2s TTL), `pointerEvents: none`,
 * and centred on the same axis as the bar it belongs to — it claims no HUD slot
 * and can never sit under or over a docked panel.
 *
 * It subscribes to `ui/castFeedback`'s plain notice box, NOT to the Zustand
 * store: a cast refusal has no server-state projection behind it, and a
 * discrete UI event does not belong in the replicated match state.
 */
import { useEffect, useState } from "react";
import {
  CAST_NOTICE_TTL_MS,
  clearCastNotice,
  getCastNotice,
  subscribeCastNotice,
  type CastNotice,
} from "../castFeedback";
import { hudTouch } from "../hud/HudSlot";

/** Sits above the desktop bar; higher on touch, where the arc is taller. */
const DESKTOP_BOTTOM = 104;
const TOUCH_BOTTOM = 190;

const DENY_BG = "rgba(46, 18, 22, 0.92)";
const DENY_BORDER = "1px solid rgba(232, 96, 96, 0.65)";
const DENY_TEXT = "#ffd9d9";

export function CastNoticeLine(): React.JSX.Element | null {
  const [notice, setNotice] = useState<CastNotice | null>(() => getCastNotice());
  const touch = hudTouch();

  useEffect(() => subscribeCastNotice(setNotice), []);

  // TTL keyed on `seq`, so pressing the SAME dead button twice restarts the
  // timer (and re-triggers the entry animation) instead of letting the first
  // line quietly expire mid-spam.
  const seq = notice?.seq ?? 0;
  useEffect(() => {
    if (seq === 0) return;
    const t = setTimeout(clearCastNotice, CAST_NOTICE_TTL_MS);
    return () => clearTimeout(t);
  }, [seq]);

  if (!notice) return null;
  return (
    <div
      key={notice.seq}
      data-cast-notice
      style={{
        position: "absolute",
        left: "50%",
        bottom: touch ? TOUCH_BOTTOM : DESKTOP_BOTTOM,
        transform: "translateX(-50%)",
        maxWidth: "min(90vw, 460px)",
        padding: "5px 14px",
        background: DENY_BG,
        border: DENY_BORDER,
        borderRadius: 999,
        color: DENY_TEXT,
        fontSize: 13,
        lineHeight: "18px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        textAlign: "center",
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      {notice.text}
    </div>
  );
}
