/**
 * 變更密碼 · Change password — the operator's own credential rotation.
 *
 * Reached from the account area in the nav rail footer, next to Sign out, and
 * therefore only ever while signed in: the platform route is session-gated AND
 * demands the CURRENT password in the body, so a stolen token can never lock
 * the owner out of their own account.
 *
 * All validate/submit logic lives in ../changePassword (unit-tested without
 * React); this file is the form around it. On success the console reports that
 * every OTHER session was signed out — the server revoked them and issued this
 * console a fresh token pair, which api.changePassword swapped in.
 */
import { useState } from "react";
import { changePassword } from "../api";
import { submitChangePassword, validateChangePassword } from "../changePassword";
import { Btn, ErrorBanner, TextInput } from "./widgets";
import { OK, PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";

export function ChangePasswordDialog(props: { onClose: () => void }): React.JSX.Element {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const input = { currentPassword, newPassword, confirmPassword };
  // The same validator the submit path runs, used here only to keep the button
  // honest — submitChangePassword re-checks and never calls the API blind.
  const ready = validateChangePassword(input).ok;

  async function apply(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await submitChangePassword(input, changePassword);
    if (outcome.ok) {
      setDone(outcome.message);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      setError(outcome.error);
    }
    setBusy(false);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div style={{ background: PANEL_BG, border: PANEL_BORDER, borderRadius: 12, padding: 20, width: 420, maxWidth: "92vw" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: TEXT_MAIN }}>
          變更密碼 · Change password
        </div>
        <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.7, marginBottom: 14 }}>
          需輸入目前密碼；成功後其他裝置的登入將全部失效。
          <br />
          Your current password is required. On success, every other session is signed out.
        </div>

        {done ? (
          <>
            <div
              style={{
                border: `1px solid ${OK}`,
                borderRadius: 8,
                padding: "10px 12px",
                color: OK,
                fontSize: 12,
                lineHeight: 1.7,
                marginBottom: 16,
              }}
            >
              ✅ {done}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Btn kind="primary" onClick={props.onClose}>
                關閉 Close
              </Btn>
            </div>
          </>
        ) : (
          <>
            <ErrorBanner text={error} onDismiss={() => setError(null)} />

            <div style={{ fontSize: 11, color: TEXT_DIM, margin: "12px 0 6px" }}>目前密碼 · Current password</div>
            <TextInput
              value={currentPassword}
              onChange={setCurrentPassword}
              type="password"
              autoFocus
              onEnter={() => void apply()}
            />

            <div style={{ fontSize: 11, color: TEXT_DIM, margin: "12px 0 6px" }}>新密碼 · New password</div>
            <TextInput value={newPassword} onChange={setNewPassword} type="password" onEnter={() => void apply()} />

            <div style={{ fontSize: 11, color: TEXT_DIM, margin: "12px 0 6px" }}>確認新密碼 · Confirm new password</div>
            <TextInput
              value={confirmPassword}
              onChange={setConfirmPassword}
              type="password"
              onEnter={() => void apply()}
            />

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <Btn onClick={props.onClose} disabled={busy}>
                取消 Cancel
              </Btn>
              <Btn kind="primary" disabled={busy || !ready} onClick={() => void apply()}>
                {busy ? "變更中…" : "變更 Change"}
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
