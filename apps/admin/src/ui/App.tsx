/** App shell — boot → login → console with a left nav rail. */
import { useEffect, useState } from "react";
import { pageRequiresSession, useApp, type Page } from "../store";
import { LoginScreen } from "./LoginScreen";
import { ConsoleHub } from "./ConsoleHub";
import { PlayersPage } from "./PlayersPage";
import { MatchesPage } from "./MatchesPage";
import { AnnouncementsPage } from "./AnnouncementsPage";
import { CurationPage } from "./CurationPage";
import { CombatEnvPage } from "./CombatEnvPage";
import { ServerOpsPage } from "./ServerOpsPage";
import { AiSettingsPage } from "./AiSettingsPage";
import { ModelBudgetPage } from "./ModelBudgetPage";
import { IconTrackingPage } from "./IconTrackingPage";
import { MCoinGrantPage } from "./MCoinGrantPage";
import { InvitesPage } from "./InvitesPage";
import { AuditPage } from "./AuditPage";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { Btn, Panel } from "./widgets";
import { ACCENT, BG, PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";

const NAV: { page: Page; label: string; emoji: string }[] = [
  { page: "hub", label: "Console Hub", emoji: "🗂️" },
  { page: "players", label: "Players", emoji: "👤" },
  { page: "matches", label: "Matches", emoji: "⚔️" },
  { page: "announcements", label: "Announcements", emoji: "📢" },
  { page: "curation", label: "內容白名單", emoji: "✅" },
  { page: "combatEnv", label: "戰鬥系統", emoji: "⚖️" },
  { page: "serverOps", label: "系統運維", emoji: "🛠️" },
  { page: "ai", label: "AI 生成設定", emoji: "🤖" },
  // The two asset consoles (task #102). They RENDER measurements published by
  // #99 (models) and #97/#101 (icons); neither counts anything itself.
  { page: "modelBudget", label: "模型預算", emoji: "📐" },
  { page: "iconTracking", label: "ICON 生成追蹤", emoji: "🖼️" },
  { page: "mcoinGrant", label: "M幣 發放", emoji: "🪙" },
  // #174: the private deploy's front door — mint a code, see who used it.
  { page: "invites", label: "邀請碼", emoji: "🎟️" },
  { page: "audit", label: "Audit log", emoji: "📜" },
];

/**
 * THE DEV GATE for 內容管理 (task #102).
 *
 * `import.meta.env.DEV` is written BARE and unguarded: vite replaces it with
 * the literal `false` at build time, rollup dead-folds the body, and the
 * ./ContentPage chunk — with everything it pulls in, the write module
 * (../contentApi) included — is never emitted. A production admin build does
 * not merely hide the content editor, it does not CONTAIN it. That is the same
 * shape #96 proved out in the game client, and contentGate.test.ts pins it,
 * including an opt-in test that runs a real `vite build` and greps dist/.
 *
 * The nav entry is driven off the loaded component rather than off the flag a
 * second time, so there is exactly ONE decision: if the chunk did not load,
 * the route does not exist in the UI either.
 */
interface ContentAdmin {
  readonly Page: React.ComponentType;
  readonly nav: { page: Page; label: string; emoji: string };
}

function useContentAdminPage(): ContentAdmin | null {
  const [loaded, setLoaded] = useState<ContentAdmin | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let alive = true;
    void import("./ContentPage").then(
      (m) => {
        // the LABEL travels with the chunk too, so a production bundle does not
        // even contain the string "內容管理" for a page it cannot mount
        if (alive) setLoaded({ Page: m.ContentPageRoot, nav: { ...m.CONTENT_NAV } });
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  return loaded;
}

export function App(): React.JSX.Element {
  const screen = useApp((s) => s.screen);
  const boot = useApp((s) => s.boot);

  useEffect(() => {
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (screen === "boot") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: TEXT_DIM }}>
        Loading…
      </div>
    );
  }
  if (screen === "login") return <LoginScreen />;
  return <Console />;
}

function Console(): React.JSX.Element {
  const page = useApp((s) => s.page);
  const navigate = useApp((s) => s.navigate);
  const account = useApp((s) => s.account);
  const doLogout = useApp((s) => s.doLogout);
  const showLogin = useApp((s) => s.showLogin);
  const contentAdmin = useContentAdminPage();
  // 變更密碼 lives on the LOGGED-IN side only: the platform route needs both a
  // session and the current password, so there is nothing to show without one.
  const [changingPassword, setChangingPassword] = useState(false);
  // the entry exists only when the dev-only chunk actually loaded, and its
  // label comes FROM that chunk (see useContentAdminPage)
  const nav =
    contentAdmin === null ? NAV : [...NAV.slice(0, 5), contentAdmin.nav, ...NAV.slice(5)];

  // THE SPLIT GATE (task #102): a page whose data lives on the Go platform admin
  // API needs a real operator session; the content editor + local consoles do
  // not. With no session those player-ops pages show a 需登入 state instead.
  const gated = account === null && pageRequiresSession(page);

  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "220px 1fr", background: BG }}>
      <aside style={{ background: PANEL_BG, borderRight: PANEL_BORDER, padding: 16, display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: TEXT_MAIN, marginBottom: 2 }}>GGD Ops</div>
        <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 20 }}>operator console</div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          {nav.map((n) => {
            const active = n.page === page;
            const locked = account === null && pageRequiresSession(n.page);
            return (
              <button
                key={n.page}
                onClick={() => navigate(n.page)}
                title={locked ? "需登入（平台管理 API）" : undefined}
                style={{
                  textAlign: "left",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: active ? `1px solid ${ACCENT}` : "1px solid transparent",
                  background: active ? "#1b2338" : "transparent",
                  color: active ? TEXT_MAIN : TEXT_DIM,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <span style={{ marginRight: 8 }}>{n.emoji}</span>
                <span style={{ flex: 1 }}>{n.label}</span>
                {locked && <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>🔒</span>}
              </button>
            );
          })}
        </nav>
        <div style={{ marginTop: 16, borderTop: PANEL_BORDER, paddingTop: 12 }}>
          {account ? (
            <>
              <div style={{ fontSize: 12, color: TEXT_MAIN, marginBottom: 8 }}>{account.username}</div>
              <Btn small onClick={() => setChangingPassword(true)} style={{ width: "100%", marginBottom: 6 }}>
                變更密碼 Change password
              </Btn>
              <Btn small onClick={() => void doLogout()} style={{ width: "100%" }}>
                Sign out
              </Btn>
            </>
          ) : (
            <>
              <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 8, lineHeight: 1.5 }}>
                內容編輯免登入 · 玩家管理需登入
              </div>
              <Btn small kind="primary" onClick={() => showLogin()} style={{ width: "100%" }}>
                登入 Sign in
              </Btn>
            </>
          )}
        </div>
      </aside>
      <main style={{ padding: 20, overflow: "auto", maxHeight: "100vh" }}>
        {gated ? (
          <SessionRequired onLogin={() => showLogin()} />
        ) : (
          <>
            {page === "hub" && <ConsoleHub />}
            {page === "players" && <PlayersPage />}
            {page === "matches" && <MatchesPage />}
            {page === "announcements" && <AnnouncementsPage />}
            {page === "curation" && <CurationPage />}
            {page === "content" && contentAdmin !== null && <contentAdmin.Page />}
            {page === "content" && contentAdmin === null && (
              <div style={{ color: TEXT_DIM, padding: 8 }}>載入編輯器…</div>
            )}
            {page === "combatEnv" && <CombatEnvPage />}
            {page === "serverOps" && <ServerOpsPage />}
            {page === "ai" && <AiSettingsPage />}
            {page === "modelBudget" && <ModelBudgetPage />}
            {page === "iconTracking" && <IconTrackingPage />}
            {page === "mcoinGrant" && <MCoinGrantPage />}
            {page === "invites" && <InvitesPage />}
            {page === "audit" && <AuditPage />}
          </>
        )}
      </main>
      {changingPassword && account && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
    </div>
  );
}

/**
 * The 需登入 state shown in place of a player-ops page when there is no operator
 * session. The page's data lives on the Go platform admin API, which rejects an
 * unauthenticated caller regardless — this makes that honest instead of showing
 * a page full of errors.
 */
function SessionRequired(props: { onLogin: () => void }): React.JSX.Element {
  return (
    <div style={{ maxWidth: 520 }}>
      <Panel title="需登入 · Operator sign-in required">
        <div style={{ fontSize: 13, color: TEXT_DIM, lineHeight: 1.8, marginBottom: 16 }}>
          此頁面為玩家 / 營運管理功能，資料由平台 admin API 提供，需要管理員登入才能使用。
          英雄 / 技能 / 道具的內容編輯不需登入即可使用。
          <br />
          This page is backed by the platform admin API and requires an operator sign-in. Content
          editing (heroes / skills / items) needs no login.
        </div>
        <Btn kind="primary" onClick={props.onLogin}>
          登入 Sign in
        </Btn>
      </Panel>
    </div>
  );
}
