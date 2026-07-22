/** App shell — boot → login → console with a left nav rail. */
import { useEffect, useState } from "react";
import { useApp, type Page } from "../store";
import { LoginScreen } from "./LoginScreen";
import { ConsoleHub } from "./ConsoleHub";
import { PlayersPage } from "./PlayersPage";
import { MatchesPage } from "./MatchesPage";
import { AnnouncementsPage } from "./AnnouncementsPage";
import { CurationPage } from "./CurationPage";
import { CombatEnvPage } from "./CombatEnvPage";
import { AiSettingsPage } from "./AiSettingsPage";
import { ModelBudgetPage } from "./ModelBudgetPage";
import { IconTrackingPage } from "./IconTrackingPage";
import { AuditPage } from "./AuditPage";
import { Btn } from "./widgets";
import { ACCENT, BG, PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";

const NAV: { page: Page; label: string; emoji: string }[] = [
  { page: "hub", label: "Console Hub", emoji: "🗂️" },
  { page: "players", label: "Players", emoji: "👤" },
  { page: "matches", label: "Matches", emoji: "⚔️" },
  { page: "announcements", label: "Announcements", emoji: "📢" },
  { page: "curation", label: "內容白名單", emoji: "✅" },
  { page: "combatEnv", label: "戰鬥系統", emoji: "⚖️" },
  { page: "ai", label: "AI 生成設定", emoji: "🤖" },
  // The two asset consoles (task #102). They RENDER measurements published by
  // #99 (models) and #97/#101 (icons); neither counts anything itself.
  { page: "modelBudget", label: "模型預算", emoji: "📐" },
  { page: "iconTracking", label: "ICON 生成追蹤", emoji: "🖼️" },
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
  const contentAdmin = useContentAdminPage();
  // the entry exists only when the dev-only chunk actually loaded, and its
  // label comes FROM that chunk (see useContentAdminPage)
  const nav =
    contentAdmin === null ? NAV : [...NAV.slice(0, 5), contentAdmin.nav, ...NAV.slice(5)];

  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "220px 1fr", background: BG }}>
      <aside style={{ background: PANEL_BG, borderRight: PANEL_BORDER, padding: 16, display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: TEXT_MAIN, marginBottom: 2 }}>GGD Ops</div>
        <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 20 }}>operator console</div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          {nav.map((n) => {
            const active = n.page === page;
            return (
              <button
                key={n.page}
                onClick={() => navigate(n.page)}
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
                }}
              >
                <span style={{ marginRight: 8 }}>{n.emoji}</span>
                {n.label}
              </button>
            );
          })}
        </nav>
        <div style={{ marginTop: 16, borderTop: PANEL_BORDER, paddingTop: 12 }}>
          <div style={{ fontSize: 12, color: TEXT_MAIN, marginBottom: 8 }}>{account?.username}</div>
          <Btn small onClick={() => void doLogout()} style={{ width: "100%" }}>
            Sign out
          </Btn>
        </div>
      </aside>
      <main style={{ padding: 20, overflow: "auto", maxHeight: "100vh" }}>
        {page === "hub" && <ConsoleHub />}
        {page === "players" && <PlayersPage />}
        {page === "matches" && <MatchesPage />}
        {page === "announcements" && <AnnouncementsPage />}
        {page === "curation" && <CurationPage />}
        {page === "content" && contentAdmin !== null && <contentAdmin.Page />}
        {page === "combatEnv" && <CombatEnvPage />}
        {page === "ai" && <AiSettingsPage />}
        {page === "modelBudget" && <ModelBudgetPage />}
        {page === "iconTracking" && <IconTrackingPage />}
        {page === "audit" && <AuditPage />}
      </main>
    </div>
  );
}
