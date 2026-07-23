/** Operator login — reuses the platform /auth/login, then verifies the admin
 * role before entering the console.
 *
 * It also carries the 忘記密碼 / 無法登入 affordance, because the alternative was
 * an owner staring at a form with no way forward: this deploy's administrator is
 * whoever registered first, and until cmd/ownerreset existed a forgotten password
 * had no in-product answer at all.
 *
 * The panel is GUIDANCE, deliberately. It shows the command to run on the host
 * and nothing else — no reset request, no token field, no "email me a link".
 * See ../recovery.ts for why a browser must not be able to do this, and
 * ../recovery.test.ts for the tests that keep it that way. */
import { useState } from "react";
import { useApp } from "../store";
import {
  RECOVERY_ENV_NOTE,
  RECOVERY_LAST_RESORT,
  RECOVERY_STEPS,
  RECOVERY_SUBTITLE,
  RECOVERY_TITLE,
  RECOVERY_WHY,
  type RecoveryStep,
} from "../recovery";
import { Btn, ErrorBanner, Panel, TextInput } from "./widgets";
import { ACCENT, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";

export function LoginScreen(): React.JSX.Element {
  const doLogin = useApp((s) => s.doLogin);
  const busy = useApp((s) => s.authBusy);
  const error = useApp((s) => s.authError);
  const notAuthorized = useApp((s) => s.notAuthorized);
  const devDropIn = useApp((s) => s.devDropIn);
  const cancelLogin = useApp((s) => s.cancelLogin);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);

  const submit = (): void => {
    if (username && password && !busy) void doLogin(username, password);
  };

  return (
    // Vertically centred while it is just a login box; TOP-aligned once the
    // runbook is open. A centred flex child that outgrows the viewport
    // overflows past the top edge, where nothing can scroll it back into view —
    // and step 1 is the one an operator most needs to read.
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: showRecovery ? "flex-start" : "center",
        justifyContent: "center",
        padding: "32px 0",
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: showRecovery ? 620 : 360, maxWidth: "92vw" }}>
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
                This account is not an operator. Ask an existing admin to grant your account the <b>admin</b> role.
                <br />
                If this deploy has <i>no</i> administrator at all, the next account to register becomes one —
                register in the game client and sign in here. Last resort: set{" "}
                <code>ADMIN_BOOTSTRAP_USERNAME</code> to an already-registered username and restart the platform.
              </div>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <ErrorBanner text={error} />
          </div>
          <div style={{ marginTop: 14, borderTop: PANEL_BORDER, paddingTop: 12, textAlign: "center" }}>
            <button
              type="button"
              aria-expanded={showRecovery}
              onClick={() => setShowRecovery((v) => !v)}
              style={{
                background: "none",
                border: "none",
                color: ACCENT,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              {showRecovery ? `收合 ${RECOVERY_TITLE}` : `${RECOVERY_TITLE} ▸`}
            </button>
          </div>
        </Panel>
        {showRecovery && <RecoveryPanel />}
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

/**
 * The recovery runbook. Every string comes from ../recovery.ts — this component
 * only lays them out, so the copy can be asserted without rendering React (the
 * console's test setup has no DOM).
 */
function RecoveryPanel(): React.JSX.Element {
  return (
    <div style={{ marginTop: 14 }}>
      <Panel title={RECOVERY_TITLE}>
        <div style={{ fontSize: 13, color: TEXT_MAIN, lineHeight: 1.7, marginBottom: 10 }}>{RECOVERY_SUBTITLE}</div>
        <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.7, marginBottom: 16 }}>{RECOVERY_WHY}</div>
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          {RECOVERY_STEPS.map((step) => (
            <RecoveryStepRow key={step.heading} step={step} />
          ))}
        </ol>
        <div
          style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: PANEL_BORDER,
            fontSize: 11,
            color: TEXT_DIM,
            lineHeight: 1.7,
          }}
        >
          <div style={{ marginBottom: 8 }}>⚠ {RECOVERY_ENV_NOTE}</div>
          <div>{RECOVERY_LAST_RESORT}</div>
        </div>
      </Panel>
    </div>
  );
}

function RecoveryStepRow(props: { step: RecoveryStep }): React.JSX.Element {
  const { step } = props;
  return (
    <li>
      <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 4 }}>{step.heading}</div>
      <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.7 }}>{step.body}</div>
      {step.command !== undefined && (
        // Selectable, wrapping, monospace — the operator copies this by hand
        // into a terminal, so it must survive a narrow window intact.
        <pre
          style={{
            marginTop: 8,
            marginBottom: 0,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #2c3448",
            background: "#10141f",
            color: TEXT_MAIN,
            fontSize: 12,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            userSelect: "all",
          }}
        >
          {step.command}
        </pre>
      )}
    </li>
  );
}
