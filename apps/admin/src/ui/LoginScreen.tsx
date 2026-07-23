/** Operator login — reuses the platform /auth/login, then verifies the admin
 * role before entering the console. */
import { useState } from "react";
import { useApp } from "../store";
import { Btn, ErrorBanner, Panel, TextInput } from "./widgets";
import { TEXT_DIM, TEXT_MAIN, WARN } from "./theme";

export function LoginScreen(): React.JSX.Element {
  const doLogin = useApp((s) => s.doLogin);
  const busy = useApp((s) => s.authBusy);
  const error = useApp((s) => s.authError);
  const notAuthorized = useApp((s) => s.notAuthorized);
  const devDropIn = useApp((s) => s.devDropIn);
  const cancelLogin = useApp((s) => s.cancelLogin);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const submit = (): void => {
    if (username && password && !busy) void doLogin(username, password);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 360, maxWidth: "90vw" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: TEXT_MAIN }}>GGD Operations</div>
          <div style={{ fontSize: 12, color: TEXT_DIM }}>operator console · admin only</div>
        </div>
        <Panel>
          <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 4 }}>Username or email</div>
          <TextInput value={username} onChange={setUsername} autoFocus onEnter={submit} />
          <div style={{ fontSize: 11, color: TEXT_DIM, margin: "12px 0 4px" }}>Password</div>
          <TextInput value={password} onChange={setPassword} type="password" onEnter={submit} />
          <div style={{ marginTop: 16 }}>
            <Btn kind="primary" disabled={busy || !username || !password} onClick={submit} style={{ width: "100%" }}>
              {busy ? "Signing in…" : "Sign in"}
            </Btn>
          </div>
          {notAuthorized && (
            <div style={{ marginTop: 12 }}>
              <div style={{ color: WARN, fontSize: 12, textAlign: "center" }}>
                This account is not an operator. Ask an admin to grant your account the <b>admin</b> role
                (set <code>ADMIN_BOOTSTRAP_USERNAME</code> and restart the platform).
              </div>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <ErrorBanner text={error} />
          </div>
        </Panel>
        {devDropIn && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button
              onClick={() => cancelLogin()}
              style={{
                background: "none",
                border: "none",
                color: TEXT_DIM,
                fontSize: 12,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              ← 返回內容編輯（免登入）
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
