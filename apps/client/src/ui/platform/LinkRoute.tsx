/**
 * LinkRoute — the PHONE side of QR reverse-login AND phone registration
 * (#197/#199 · GH#535).
 *
 * The QR the handheld shows points at `/link?code=WXYZ-2345`. The phone lands
 * here, sees the user-code to confirm against the handheld screen, and taps
 * Approve or Deny. Approval is an authenticated POST (deviceApprove), so a
 * cross-site page — which cannot attach the bearer token — can never approve,
 * and a photographed QR is inert without a real session behind it.
 *
 * ---- GH#535: the BRAND-NEW player -----------------------------------------
 * That model solved the RETURNING player (a phone that is already signed in)
 * and left the new one with nothing: the only control on the signed-out branch
 * was 「去登入」, which `closeLink()`s and DROPS the code — a person who has no
 * account at all was sent to a dead end, on the one page the handheld's QR can
 * reach. So the signed-out branch now carries the register form itself:
 *
 *   handheld shows QR → phone registers HERE → phone approves the SAME code
 *   → handheld's poll mints the session for the just-created account → lobby
 *
 * ⭐ 這是**同一個** device grant，⛔ 不是第二套「註冊意圖」短碼。The trust anchor
 * shifts from "an existing session" to "the short code the handheld minted", and
 * the three properties that anchor needs were ALREADY in place, which is exactly
 * why no second server flow was built (第〇·五 / 模板化):
 *   ① short TTL — `deviceGrantTTL` (device.go), surfaced as `expiresIn`
 *   ② rate limits — IP throttle on /auth/device/start, per-device-code on /poll,
 *      per-account on /approve
 *   ③ the handheld PRINTS the code, and this page prints it back for comparison
 * ⛔ The handheld still never shows a text field: every keystroke happens here.
 *
 * ⚠️ Registering does NOT auto-approve. The person confirms the code first —
 * ③ is only a defense if a human actually compares the two screens, and a
 * register form that silently authorized whatever code was in the URL would
 * turn a mis-scanned/photographed QR into a one-tap account handover.
 *
 * ⚠️ A gated deploy (#126) can return a registration with NO token (status
 * pending). There is no session to approve WITH, so that lands in its own
 * terminal state instead of a failing approve call.
 *
 * It is a path overlay (like CodexRoute's hash overlay) so it renders over
 * whatever screen the app is on without touching the screen state machine. The
 * QR carries a real path, not a hash, because it must survive being typed into a
 * phone browser by a human reading the code off the screen.
 */
import { useEffect, useState } from "react";
import { useApp } from "./store";
import * as apiFns from "./api";
import { api } from "./api";
import { Btn, FieldError, Panel, TextInput } from "./widgets";
import { validateRegistration, type RegisterErrors } from "./validation";
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

/**
 * GH#535 — the signup sub-state of the signed-out branch. "pending" is the
 * gated-deploy (#126) outcome: the account exists but carries no session, so
 * there is nothing to approve with and the flow stops with a real explanation
 * instead of an approve call that would 401.
 */
type Signup = "idle" | "busy" | "pending" | "error";

export function LinkRoute(): React.JSX.Element | null {
  const account = useApp((s) => s.account);
  const [code, setCode] = useState<string | null>(readCode);
  const [state, setState] = useState<Decision>("idle");
  const [errText, setErrText] = useState("");
  // GH#535 — register-here state. `selfName` is the just-created account: the
  // tokens went into `api` (so deviceApprove authenticates) but the store's
  // `account` stays null on purpose — entering the lobby is the HANDHELD's job,
  // and booting it on the phone would drag content + sockets + music in behind
  // this overlay for nothing.
  const [signup, setSignup] = useState<Signup>("idle");
  const [signupErr, setSignupErr] = useState("");
  const [fieldErrs, setFieldErrs] = useState<RegisterErrors>({});
  const [selfName, setSelfName] = useState<string | null>(null);
  const [form, setForm] = useState({ username: "", email: "", password: "", invite: "" });

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

  /**
   * GH#535 — create the account on THIS phone, then fall through to the same
   * approve card a returning player sees. ⛔ It deliberately stops there: the
   * person still has to compare the code and tap 核准.
   */
  const signUp = async (): Promise<void> => {
    const errs = validateRegistration(form.username, form.email, form.password);
    setFieldErrs(errs);
    if (errs.username !== undefined || errs.email !== undefined || errs.password !== undefined) return;
    setSignup("busy");
    setSignupErr("");
    try {
      const resp = await apiFns.register(form.username.trim(), form.email.trim(), form.password, form.invite);
      if (!resp.tokens.accessToken) {
        // Gated deploy (#126): the account is real but not yet approved, so it
        // has no session — there is nothing to authorize the handheld with.
        setSignup("pending");
        return;
      }
      api.setTokens(resp.tokens);
      setForm({ username: "", email: "", password: "", invite: "" }); // ⛔ never keep the password around
      setSelfName(resp.account.username);
      setSignup("idle");
    } catch (err) {
      setSignup("error");
      setSignupErr(err instanceof Error ? err.message : "註冊失敗");
    }
  };

  /**
   * Who this page can approve as — an existing session OR the one just created
   * here. ⭐ The approve card keys off THIS, not off `account`, so the two
   * routes into it are literally the same markup and cannot drift apart.
   */
  const approverName = account?.username ?? selfName;

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
        <div style={{ fontSize: 17, fontWeight: 800, color: TEXT_MAIN, marginBottom: 6 }}>
          {approverName ? "核准裝置登入" : "用這支手機建立帳號"}
        </div>
        <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.6, marginBottom: 16 }}>
          {approverName
            ? "確認下方代碼與另一台裝置螢幕上的一致，再核准。核准後那台裝置會以你的帳號登入。"
            : "確認下方代碼與另一台裝置螢幕上的一致。在這裡建立帳號後，就能直接讓那台裝置登入 —— 那台裝置全程不用打字。"}
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

        {approverName === null && signup === "pending" ? (
          // Gated deploy (#126): the account exists but has no session yet, so
          // it cannot authorize anything. ⛔ Do NOT offer 核准 here — the call
          // would 401 and the person would read it as "registration failed".
          <div style={{ fontSize: 13, color: "#f0c98a", textAlign: "center", lineHeight: 1.7 }}>
            帳號已建立，正在等待管理員核准。
            <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 6 }}>
              核准之後，在這支手機登入，再重新掃一次那台裝置上的 QR。
            </div>
            <div style={{ marginTop: 14 }}>
              <Btn padBack onClick={closeLink} style={{ width: "100%" }}>
                完成 Done
              </Btn>
            </div>
          </div>
        ) : approverName === null ? (
          // GH#535 — the signed-out branch. It used to be a dead end (a 去登入
          // button that dropped the code); it now carries the register form, so
          // a brand-new player reaching this page from the handheld's QR has a
          // path all the way to the lobby without touching the handheld.
          <>
            <TextInput
              value={form.username}
              onChange={(v) => setForm((f) => ({ ...f, username: v }))}
              placeholder="帳號 username"
              name="username"
              id="link-username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              style={{ width: "100%" }}
            />
            <FieldError text={fieldErrs.username} />
            <TextInput
              value={form.email}
              onChange={(v) => setForm((f) => ({ ...f, email: v }))}
              placeholder="電子信箱 email"
              type="email"
              name="email"
              id="link-email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              style={{ width: "100%", marginTop: 8 }}
            />
            <FieldError text={fieldErrs.email} />
            <TextInput
              value={form.password}
              onChange={(v) => setForm((f) => ({ ...f, password: v }))}
              placeholder="密碼 password"
              type="password"
              name="new-password"
              id="link-password"
              autoComplete="new-password"
              style={{ width: "100%", marginTop: 8 }}
            />
            <FieldError text={fieldErrs.password} />
            <TextInput
              value={form.invite}
              onChange={(v) => setForm((f) => ({ ...f, invite: v.toUpperCase() }))}
              placeholder="邀請碼 invite code（選填）"
              name="invite-code"
              id="link-invite"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              style={{ width: "100%", marginTop: 8 }}
              onEnter={() => void signUp()}
            />
            {signup === "error" && (
              <div style={{ fontSize: 12, color: "#f0a0a0", marginTop: 10 }}>{signupErr}</div>
            )}
            <div style={{ marginTop: 14 }}>
              <Btn
                kind="primary"
                onClick={() => void signUp()}
                disabled={signup === "busy"}
                style={{ width: "100%" }}
              >
                {signup === "busy" ? "…" : "建立帳號 Create account"}
              </Btn>
            </div>
            <div style={{ marginTop: 10 }}>
              <Btn padBack onClick={closeLink} style={{ width: "100%" }}>
                已經有帳號？去登入 Sign in
              </Btn>
            </div>
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
              {selfName !== null && account === null
                ? `帳號 ${approverName} 已建立 —— 以它的身分核准`
                : `以 ${approverName} 的身分核准`}
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
