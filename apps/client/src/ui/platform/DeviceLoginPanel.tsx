/**
 * DeviceLoginPanel — the handheld side of QR reverse-login (#197/#199).
 *
 * On a keyboard-less handheld the login screen focuses a single gamepad button,
 * 用手機登入; pressing A opens this panel, which shows a QR (the verification URL
 * + the short public user-code — NEVER a token) and waits for an already-logged-
 * in phone to scan and approve — or, since GH#535, for a BRAND-NEW player to
 * create their account on the phone at that same `/link?code=…` page and approve
 * with it. Either way the handheld's side is unchanged: one grant, one poll.
 * No text field ever focuses: the whole panel is
 * D-pad + A/B navigable — driven by the ONE global loop in `ui/PadFocusNav`,
 * which this panel opts into by declaring `data-pad-scope` (GH#504; it used to
 * run a second, competing loop of its own). On approval the granted token pair
 * is fed into the SAME session sink a typed login uses (store.applyDeviceSession
 * → api.setTokens), and the app transitions into the lobby.
 */
import { useEffect, useMemo, useState } from "react";
import { useApp } from "./store";
import * as apiFns from "./api";
import { encodeQR } from "./qr";
import { runDeviceLogin, type DevicePhase } from "./deviceLogin";
import { padModalScope } from "../padModalScope";
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
  const terminal = phase?.kind === "denied" || phase?.kind === "expired" || phase?.kind === "error";

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

  // ⛔ GH#504 — THIS PANEL USED TO RUN ITS OWN `startGamepadFocus` LOOP.
  // 一支手把只能有一個讀者：the global `ui/PadFocusNav` never stopped running
  // while this modal was open, so BOTH loops read the same A on the same frame
  // and BOTH wrote `applyPadFocus` — the ring flickered between this panel's
  // 取消 and whatever `document.body` scope PadFocusNav had drifted onto (the
  // login form behind the scrim, 「⚔️ 一鍵開打」, 「Play offline vs bots」).
  // The panel now declares `data-pad-scope` below instead, which is the ONE
  // mechanism that both confines the focus set to this panel AND keeps the
  // focus layer standing up. ⛔ Do not reintroduce a second reader.

  const grant = phase?.kind === "waiting" ? phase.grant : null;
  const st = statusLine(phase);
  const toneColor = st.tone === "bad" ? "#f0a0a0" : st.tone === "ok" ? "#9fe0a8" : TEXT_DIM;

  return (
    <div
      // GH#504 — the pad scope lives HERE, not on AuthScreen's scrim <div>:
      // the scrim's only child is this panel, so scoping to the panel gives
      // `getFocusables` exactly 取消 (+ 重試) and nothing else.
      {...padModalScope("device-login")}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        padding: 18,
        width: 300,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 800, color: TEXT_MAIN, letterSpacing: 1 }}>用手機登入或註冊</div>
      <div style={{ fontSize: 11, color: TEXT_DIM, textAlign: "center", lineHeight: 1.6 }}>
        用手機掃描下方 QR，或到 {grant?.verificationUri ?? "/link"} 輸入代碼。
        {/* GH#535 — 全新玩家在此之前讀到的是「用**已登入**的手機」,而那正好排除了他。
            手機那一頁現在自己帶註冊表單,所以這裡要說得出第二條路。 */}
        <br />
        已登入的手機可直接核准；還沒有帳號的話，可以在手機上建立帳號再核准。
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

      {grant && (
        // GH#535 — the short TTL is one of the three things the registration
        // anchor rests on (the other two are the rate limits and the fact that
        // this code is printed here to be compared). Say it out loud, and ⛔ read
        // it off the SERVER's `expiresIn` — a literal here would be a fourth
        // home for `deviceGrantTTL` and would start lying the day it is tuned.
        <div style={{ fontSize: 10, color: TEXT_DIM, textAlign: "center" }}>
          代碼 {Math.max(1, Math.round(grant.expiresIn / 60))} 分鐘後失效，請與手機上顯示的代碼核對
        </div>
      )}

      <div style={{ fontSize: 12, color: toneColor, textAlign: "center", minHeight: 18 }}>{st.text}</div>

      <div style={{ display: "flex", gap: 10 }}>
        <Btn padBack onClick={onClose} style={terminal ? undefined : { borderColor: ACCENT }}>
          取消 Cancel
        </Btn>
        {terminal && (
          <Btn
            kind="primary"
            onClick={() => {
              setPhase(null);
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
