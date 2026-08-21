/**
 * LinkRoute — the PHONE side of QR reverse-login (#197/#199).
 *
 * The QR the handheld shows points at `/link?code=WXYZ-2345`. The already-logged-
 * in phone lands here, sees the user-code to confirm against the handheld screen,
 * and taps Approve or Deny. The trust anchor is the phone's EXISTING session:
 * approval is an authenticated POST (deviceApprove), so a cross-site page — which
 * cannot attach the bearer token — can never approve, and a photographed QR is
 * inert without a logged-in phone behind it.
 *
 * It is a path overlay (like CodexRoute's hash overlay) so it renders over
 * whatever screen the app is on without touching the screen state machine. The
 * QR carries a real path, not a hash, because it must survive being typed into a
 * phone browser by a human reading the code off the screen.
 */
import { useEffect, useState } from "react";
import { useApp } from "./store";
import * as apiFns from "./api";
import { Btn, Panel } from "./widgets";
import { padModalScope } from "../padModalScope";
import { PANEL_BG, TEXT_DIM, TEXT_MAIN } from "../theme";

export const LINK_PATH = "/link";

function readCode(): string | null {
  if (typeof window === "undefined") return null;
  if (window.location.pathname !== LINK_PATH) return null;
  return new URLSearchParams(window.location.search).get("code");
}

/** Leave the link page, returning to the app root (drops ?code from the URL). */
function closeLink(): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", "/");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

type Decision = "idle" | "approving" | "denying" | "approved" | "denied" | "error";

export function LinkRoute(): React.JSX.Element | null {
  const account = useApp((s) => s.account);
  const [code, setCode] = useState<string | null>(readCode);
  const [state, setState] = useState<Decision>("idle");
  const [errText, setErrText] = useState("");

  // Re-evaluate on history changes so a same-tab navigation to /link opens this.
  useEffect(() => {
    const onNav = (): void => setCode(readCode());
    window.addEventListener("popstate", onNav);
    return () => window.removeEventListener("popstate", onNav);
  }, []);

  if (code === null) return null;

  const decide = async (decision: "approve" | "deny"): Promise<void> => {
    setState(decision === "approve" ? "approving" : "denying");
    setErrText("");
    try {
      await apiFns.deviceApprove(code, decision);
      setState(decision === "approve" ? "approved" : "denied");
    } catch (err) {
      setState("error");
      setErrText(err instanceof Error ? err.message : "核准失敗");
    }
  };

  return (
    <div
      // GH#504 — this full-screen approval card is reachable ON THE HANDHELD
      // ITSELF (same tab, /link). Without a scope the D-pad walked out of the
      // card, and B had NOTHING to hit: 「拒絕 Deny」/「完成 Done」 match none of
      // `backControlIndex`'s dismissal words. ⛔ 拒絕 is an ACTION, not a back —
      // only the terminal 完成 / 去登入 carry `padBack`.
      {...padModalScope("device-link")}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "grid",
        placeItems: "center",
        background: "rgba(4,6,12,0.92)",
        padding: 20,
      }}
    >
      <Panel style={{ width: 340, maxWidth: "92vw", padding: 22, background: PANEL_BG }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: TEXT_MAIN, marginBottom: 6 }}>核准裝置登入</div>
        <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.6, marginBottom: 16 }}>
          確認下方代碼與另一台裝置螢幕上的一致，再核准。核准後那台裝置會以你的帳號登入。
        </div>

        <div
          style={{
            fontFamily: "monospace",
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: 5,
            textAlign: "center",
            color: TEXT_MAIN,
            padding: "10px 0 18px",
          }}
        >
          {code}
        </div>

        {!account ? (
          // The trust anchor is a logged-in phone. Without a session there is
          // nothing to approve WITH — send the user to sign in first.
          <>
            <div style={{ fontSize: 12, color: "#f0c98a", marginBottom: 12 }}>
              請先登入這支手機的帳號，再回到此頁核准。
            </div>
            <Btn kind="primary" padBack onClick={closeLink} style={{ width: "100%" }}>
              去登入 Sign in first
            </Btn>
          </>
        ) : state === "approved" ? (
          <div style={{ fontSize: 14, color: "#9fe0a8", textAlign: "center" }}>
            ✓ 已核准，另一台裝置即將登入
            <div style={{ marginTop: 14 }}>
              <Btn padBack onClick={closeLink} style={{ width: "100%" }}>
                完成 Done
              </Btn>
            </div>
          </div>
        ) : state === "denied" ? (
          <div style={{ fontSize: 14, color: TEXT_DIM, textAlign: "center" }}>
            已拒絕
            <div style={{ marginTop: 14 }}>
              <Btn padBack onClick={closeLink} style={{ width: "100%" }}>
                完成 Done
              </Btn>
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 12 }}>
              以 {account.username} 的身分核准
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn
                kind="danger"
                onClick={() => void decide("deny")}
                disabled={state === "approving" || state === "denying"}
                style={{ flex: 1 }}
              >
                拒絕 Deny
              </Btn>
              <Btn
                kind="primary"
                onClick={() => void decide("approve")}
                disabled={state === "approving" || state === "denying"}
                style={{ flex: 1 }}
              >
                {state === "approving" ? "…" : "核准 Approve"}
              </Btn>
            </div>
            {state === "error" && (
              <div style={{ fontSize: 12, color: "#f0a0a0", marginTop: 12 }}>{errText}</div>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
