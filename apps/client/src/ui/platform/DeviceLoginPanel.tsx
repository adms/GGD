/**
 * DeviceLoginPanel — the handheld side of QR reverse-login (#197/#199).
 *
 * On a keyboard-less handheld the login screen focuses a single gamepad button,
 * 用手機登入; pressing A opens this panel, which shows a QR (the verification URL
 * + the short public user-code — NEVER a token) and waits for an already-logged-
 * in phone to scan and approve. No text field ever focuses: the whole panel is
 * D-pad + A/B navigable (see ./gamepadFocus). On approval the granted token pair
 * is fed into the SAME session sink a typed login uses (store.applyDeviceSession
 * → api.setTokens), and the app transitions into the lobby.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./store";
import * as apiFns from "./api";
import { encodeQR } from "./qr";
import { runDeviceLogin, type DevicePhase } from "./deviceLogin";
import { startGamepadFocus, nextFocusIndex, type NavDir } from "./gamepadFocus";
import { Btn, ACCENT } from "./widgets";
import { TEXT_DIM, TEXT_MAIN } from "../theme";

/** Render a QR matrix as a crisp, self-scaling SVG (no raster, no CDN). */
function QrSvg({ text, px = 220 }: { text: string; px?: number }): React.JSX.Element {
  const mods = useMemo(() => encodeQR(text), [text]);
  const n = mods.length;
  const quiet = 4; // required light border, in modules
  const dim = n + quiet * 2;
  const rects: React.JSX.Element[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (mods[r]![c]) rects.push(<rect key={`${r}-${c}`} x={c + quiet} y={r + quiet} width={1.02} height={1.02} />);
    }
  }
  return (
    <svg
      width={px}
      height={px}
      viewBox={`0 0 ${dim} ${dim}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="用手機掃描登入 QR"
      style={{ background: "#ffffff", borderRadius: 10, display: "block" }}
    >
      <g fill="#0b0e14">{rects}</g>
    </svg>
  );
}

function statusLine(phase: DevicePhase | null): { text: string; tone: "wait" | "ok" | "bad" } {
  switch (phase?.kind) {
    case "waiting":
      return { text: "等待手機核准…  waiting for phone approval", tone: "wait" };
    case "starting":
    case undefined:
    case null:
      return { text: "產生登入碼…  generating code", tone: "wait" };
    case "approved":
      return { text: "已核准，登入中…  approved", tone: "ok" };
    case "denied":
      return { text: "手機已拒絕  denied on phone", tone: "bad" };
    case "expired":
      return { text: "登入碼已過期  code expired", tone: "bad" };
    case "error":
      return { text: phase.message, tone: "bad" };
  }
}

export function DeviceLoginPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const applyDeviceSession = useApp((s) => s.applyDeviceSession);
  const [phase, setPhase] = useState<DevicePhase | null>(null);
  const [attempt, setAttempt] = useState(0); // bump to restart
  // Gamepad focus ring over the panel's buttons. Retry only exists on a
  // terminal state, so the focusable set changes with the phase.
  const [focus, setFocus] = useState(0);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const terminal = phase?.kind === "denied" || phase?.kind === "expired" || phase?.kind === "error";
  const focusCount = terminal ? 2 : 1; // [取消] or [取消, 重試]

  // Drive one grant attempt; re-run when the user retries.
  useEffect(() => {
    const handle = runDeviceLogin({
      start: apiFns.deviceStart,
      poll: apiFns.devicePoll,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      onPhase: (p) => {
        setPhase(p);
        if (p.kind === "approved") void applyDeviceSession(p.tokens, p.account);
      },
    });
    return () => handle.cancel();
  }, [attempt, applyDeviceSession]);

  // Reflect the focus index onto real DOM focus so A/click activate the right
  // button and a mouse/touch user is unaffected.
  useEffect(() => {
    btnRefs.current[focus]?.focus();
  }, [focus, focusCount]);

  // Gamepad: D-pad moves focus, A activates, B cancels (the trust-preserving
  // "back" — a mistaken open never strands a handheld with no keyboard).
  useEffect(() => {
    const stop = startGamepadFocus(
      {
        navigate: (dir: NavDir) => setFocus((f) => nextFocusIndex(f, focusCount, dir)),
        activate: () => btnRefs.current[focus]?.click(),
        back: onClose,
      },
      () => true,
    );
    return stop;
  }, [focus, focusCount, onClose]);

  const grant = phase?.kind === "waiting" ? phase.grant : null;
  const st = statusLine(phase);
  const toneColor = st.tone === "bad" ? "#f0a0a0" : st.tone === "ok" ? "#9fe0a8" : TEXT_DIM;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        padding: 18,
        width: 300,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 800, color: TEXT_MAIN, letterSpacing: 1 }}>用手機登入</div>
      <div style={{ fontSize: 11, color: TEXT_DIM, textAlign: "center", lineHeight: 1.6 }}>
        用已登入的手機掃描下方 QR，或到 {grant?.verificationUri ?? "/link"} 輸入代碼核准。
      </div>

      {grant ? (
        <QrSvg text={grant.verificationUriComplete} />
      ) : (
        <div style={{ width: 220, height: 220, display: "grid", placeItems: "center", color: TEXT_DIM }}>…</div>
      )}

      {grant && (
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: 4,
            color: TEXT_MAIN,
          }}
          aria-label="user code"
        >
          {grant.userCode}
        </div>
      )}

      <div style={{ fontSize: 12, color: toneColor, textAlign: "center", minHeight: 18 }}>{st.text}</div>

      <div style={{ display: "flex", gap: 10 }}>
        <Btn
          btnRef={(el) => (btnRefs.current[0] = el)}
          onClick={onClose}
          style={terminal ? undefined : { borderColor: ACCENT }}
        >
          取消 Cancel
        </Btn>
        {terminal && (
          <Btn
            kind="primary"
            btnRef={(el) => (btnRefs.current[1] = el)}
            onClick={() => {
              setPhase(null);
              setFocus(0);
              setAttempt((a) => a + 1);
            }}
          >
            重試 Retry
          </Btn>
        )}
      </div>
    </div>
  );
}
