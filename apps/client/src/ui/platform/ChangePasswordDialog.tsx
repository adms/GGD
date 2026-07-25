/**
 * 修改密碼 · Change password — the signed-in player's own credential rotation (#211).
 *
 * Reached from the lobby header (next to Logout), and therefore only ever while
 * signed in: the platform route (#172) is session-gated AND demands the CURRENT
 * password in the body, so a stolen token can never lock a player out of their
 * own account.
 *
 * All validate/submit logic lives in ./changePassword (unit-tested without
 * React); this file is only the form around it. On success it reports that every
 * OTHER session was signed out — the server revoked them and issued THIS client
 * a fresh token pair, which api.changePassword swapped in, so this device stays
 * logged in.
 */
import { useState } from "react";
import { changePassword } from "./api";
import { submitChangePassword, validateChangePassword } from "./changePassword";
import { Btn, TextInput, OK, DANGER } from "./widgets";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";

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
      className="ggd-platform"
      onClick={props.onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(4, 6, 12, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "auto",
        zIndex: 100,
        padding: 12,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: PANEL_BG,
          border: PANEL_BORDER,
          borderRadius: 12,
          padding: 20,
          width: 420,
          maxWidth: "92vw",
          color: TEXT_MAIN,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: TEXT_MAIN }}>
          修改密碼 · Change password
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
            {error && (
              <div
                style={{
                  border: `1px solid ${DANGER}`,
                  borderRadius: 8,
                  padding: "9px 12px",
                  color: "#f0a0a0",
                  fontSize: 12,
                  lineHeight: 1.6,
                  marginBottom: 4,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ fontSize: 11, color: TEXT_DIM, margin: "12px 0 6px" }}>目前密碼 · Current password</div>
            <TextInput
              value={currentPassword}
              onChange={setCurrentPassword}
              type="password"
              autoFocus
              name="current-password"
              id="ggd-change-current-password"
              autoComplete="current-password"
              onEnter={() => void apply()}
            />

            <div style={{ fontSize: 11, color: TEXT_DIM, margin: "12px 0 6px" }}>新密碼 · New password</div>
            <TextInput
              value={newPassword}
              onChange={setNewPassword}
              type="password"
              name="new-password"
              id="ggd-change-new-password"
              autoComplete="new-password"
              onEnter={() => void apply()}
            />

            <div style={{ fontSize: 11, color: TEXT_DIM, margin: "12px 0 6px" }}>確認新密碼 · Confirm new password</div>
            <TextInput
              value={confirmPassword}
              onChange={setConfirmPassword}
              type="password"
              name="confirm-new-password"
              id="ggd-change-confirm-password"
              autoComplete="new-password"
              onEnter={() => void apply()}
            />

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <Btn onClick={props.onClose} disabled={busy}>
                取消 Cancel
              </Btn>
              <Btn kind="primary" disabled={busy || !ready} onClick={() => void apply()}>
                {busy ? "修改中…" : "修改 Change"}
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
