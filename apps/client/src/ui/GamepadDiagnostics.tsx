/**
 * GamepadDiagnostics — the "why won't my handheld do anything?" overlay
 * (task #197), shown on the pre-match screens (auth / lobby / store).
 *
 * TWO STATES, matching the two real blockers (see input/gamepadDetect):
 *
 *   • BEFORE a pad wakes — a keyboard-less player is looking at a login screen
 *     that will not respond, with no clue that the fix is "press any button
 *     once" (Chrome hides an idle pad until its first input). We show that hint.
 *     It auto-dismisses the moment a keyboard/mouse user interacts (they clearly
 *     do not need it) and the moment a pad wakes (the detail chip takes over).
 *
 *   • AFTER a pad wakes — a compact chip naming the device, its `mapping` and
 *     its button count. When the mapping is not "standard" it turns amber and
 *     says so, because that is precisely when the hard-coded button faces can be
 *     wrong and "the buttons do random things" stops being a mystery.
 *
 * Render-less otherwise, `pointer-events: none`, and off the match screen (the
 * in-match HUD has its own GamepadIndicator). All detection is the pure
 * gamepadDetect layer; this is the thin polling view.
 */
import { useEffect, useRef, useState } from "react";
import { listPadSources } from "../input/GamepadInput";
import { PAD_POLL_MS } from "./inputMode";
import {
  gamepadWakeHintVisible,
  readPadDiagnostics,
  shortPadId,
  type PadDiagnostic,
} from "../input/gamepadDetect";
import { isTouchDevice, readTouchEnv } from "../input/mobileDetect";
import { useApp } from "./platform/store";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";

const WARN = "#f0b23a";

export function GamepadDiagnostics(): React.JSX.Element | null {
  const screen = useApp((s) => s.screen);
  const touch = isTouchDevice(readTouchEnv());
  const [diags, setDiags] = useState<PadDiagnostic[]>([]);
  const [interacted, setInteracted] = useState(false);
  const sigRef = useRef("");

  // one-time: a real keyboard/mouse/touch interaction proves this player does
  // NOT need the wake hint (a pad-only player never fires these).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mark = (): void => setInteracted(true);
    const opts = { capture: true, passive: true } as const;
    window.addEventListener("keydown", mark, opts);
    window.addEventListener("pointerdown", mark, opts);
    window.addEventListener("touchstart", mark, opts);
    return () => {
      window.removeEventListener("keydown", mark, opts);
      window.removeEventListener("pointerdown", mark, opts);
      window.removeEventListener("touchstart", mark, opts);
    };
  }, []);

  // poll the pads; only re-render when the summary actually changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const tick = (): void => {
      const pads = listPadSources();
      const next = readPadDiagnostics(pads);
      const sig = next.map((d) => `${d.index}:${d.id}:${d.mapping}:${d.buttonCount}`).join("|") + `#${pads.length}`;
      if (sig !== sigRef.current) {
        sigRef.current = sig;
        setDiags(next);
      }
    };
    tick();
    const timer = window.setInterval(tick, PAD_POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  if (touch || screen === "match") return null;

  const wrap: React.CSSProperties = {
    position: "fixed",
    left: 12,
    bottom: 40,
    zIndex: 40,
    pointerEvents: "none",
    fontSize: 11,
    maxWidth: 320,
  };

  if (diags.length > 0) {
    const anyUntrusted = diags.some((d) => !d.trusted);
    return (
      <div style={wrap}>
        <div
          style={{
            display: "inline-flex",
            flexDirection: "column",
            gap: 2,
            padding: "5px 10px",
            background: PANEL_BG,
            border: anyUntrusted ? `1px solid ${WARN}` : PANEL_BORDER,
            borderRadius: 8,
            color: TEXT_MAIN,
          }}
        >
          {diags.map((d) => (
            <div key={d.index} style={{ whiteSpace: "nowrap" }}>
              🎮 <span style={{ color: TEXT_MAIN }}>{shortPadId(d.id)}</span>
              <span style={{ color: d.trusted ? TEXT_DIM : WARN }}>
                {" · "}
                {d.trusted ? "standard" : `${d.mapping || "非標準對應"}`}
                {" · "}
                {d.buttonCount} 鍵
              </span>
            </div>
          ))}
          {anyUntrusted && (
            <div style={{ color: WARN, whiteSpace: "normal" }}>
              非標準對應 — 部分按鍵可能錯位（方向可用左類比）
            </div>
          )}
        </div>
      </div>
    );
  }

  if (gamepadWakeHintVisible({ pads: listPadSources(), interacted, touch })) {
    return (
      <div style={wrap}>
        <div
          style={{
            padding: "5px 10px",
            background: PANEL_BG,
            border: PANEL_BORDER,
            borderRadius: 8,
            color: TEXT_DIM,
          }}
        >
          🎮 使用手把？先按一下任意鍵喚醒
        </div>
      </div>
    );
  }

  return null;
}
