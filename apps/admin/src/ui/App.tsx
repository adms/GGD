/** App shell — boot → login → console with a left nav rail. */
import { Fragment, useEffect, useState } from "react";
import { pageRequiresSession, useApp, type Page } from "../store";
import { LoginScreen } from "./LoginScreen";
import { ConsoleHub } from "./ConsoleHub";
import { ApprovalsPage } from "./ApprovalsPage";
import { PlayersPage } from "./PlayersPage";
import { MatchesPage } from "./MatchesPage";
import { ReplaysPage } from "./ReplaysPage";
import { AnnouncementsPage } from "./AnnouncementsPage";
import { CurationPage } from "./CurationPage";
import { ContentOverlayPage } from "./ContentOverlayPage";
import { CombatEnvPage } from "./CombatEnvPage";
import { ServerOpsPage } from "./ServerOpsPage";
import { AiSettingsPage } from "./AiSettingsPage";
import { ModelBudgetPage } from "./ModelBudgetPage";
import { IconTrackingPage } from "./IconTrackingPage";
import { VoxelSkinSheetPage } from "./VoxelSkinSheetPage";
import { MCoinGrantPage } from "./MCoinGrantPage";
import { InvitesPage } from "./InvitesPage";
import { AuditPage } from "./AuditPage";
// #243 資料搬遷. A STATIC top-level import, deliberately: the two dev-gated
// pages below reach their modules through `if (!import.meta.env.DEV) return;`
// + a dynamic import, which rollup dead-folds out of a production build. A
// migration tool that only exists on localhost cannot migrate a host, so this
// one must be in the production bundle — see migrationGate.test.ts, which
// fails if it ever leaves.
import { DataMigrationPage } from "./DataMigrationPage";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { Btn, Panel } from "./widgets";
import { ACCENT, BG, PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";

interface NavItem {
  page: Page;
  label: string;
  emoji: string;
  /** left-rail section header this row lives under */
  section: string;
}

// The owner's four-section back-office (directive 2026-07-25). Every EXISTING
// route stays reachable — this only regroups + adds. The dev-only 內容·素材管理
// content routes (audio / champions / newHero / abilities / items / vfx /
// arenas) and 角色語音生成 are SPLICED IN by name from their dev chunk (see the
// hooks below), so a production build simply shows this section with only its
// always-present member (內容白名單) under it.
const SEC_OPS = "營運";
const SEC_CONTENT = "內容·素材管理";
const SEC_ASSETS = "資產產線";
const SEC_SYS = "系統";

const NAV: NavItem[] = [
  // 營運 — session-gated player/operations surfaces. 帳號審核 leads (task #126):
  // it is the one page with real people waiting, and it carries the pending badge.
  { page: "approvals", label: "帳號審核", emoji: "🛂", section: SEC_OPS },
  { page: "players", label: "Players", emoji: "👤", section: SEC_OPS },
  { page: "matches", label: "Matches", emoji: "⚔️", section: SEC_OPS },
  { page: "replays", label: "對戰回放", emoji: "🎞️", section: SEC_OPS },
  { page: "announcements", label: "Announcements", emoji: "📢", section: SEC_OPS },
  { page: "mcoinGrant", label: "M幣 發放", emoji: "🪙", section: SEC_OPS },
  // #174: the private deploy's front door — mint a code, see who used it.
  { page: "invites", label: "邀請碼", emoji: "🎟️", section: SEC_OPS },
  { page: "audit", label: "Audit log", emoji: "📜", section: SEC_OPS },
  // 內容·素材管理 — the dev content routes + 角色語音生成 splice in AFTER audit and
  // BEFORE this always-present member, so the whole section reads contiguously.
  { page: "curation", label: "內容白名單", emoji: "✅", section: SEC_CONTENT },
  // #189 — the one content-editing route that EXISTS IN A PRODUCTION BUILD.
  // It writes to the platform's durable data/ overlay (admin JWT + audited),
  // never to the loopback content-api, so it needs no dev gate and is the only
  // way to change content on the deployed host.
  { page: "contentOverlay", label: "內容覆蓋層", emoji: "🗂", section: SEC_CONTENT },
  // 資產產線 — the asset consoles (task #102). They RENDER measurements published
  // by #99 (models) and #97/#101 (icons); neither counts anything itself.
  { page: "ai", label: "AI 生成設定", emoji: "🤖", section: SEC_ASSETS },
  { page: "modelBudget", label: "模型預算", emoji: "📐", section: SEC_ASSETS },
  { page: "iconTracking", label: "ICON 生成追蹤", emoji: "🖼️", section: SEC_ASSETS },
  // task #231 — the 驗收 contact sheet for the generated per-champion voxel
  // skins. Sits beside its asset-review siblings because that is where the
  // owner already goes to approve art.
  { page: "voxelSkins", label: "體素外觀對照表", emoji: "🧱", section: SEC_ASSETS },
  // 系統
  { page: "hub", label: "Console Hub", emoji: "🗂️", section: SEC_SYS },
  { page: "combatEnv", label: "戰鬥系統", emoji: "⚖️", section: SEC_SYS },
  { page: "serverOps", label: "系統運維", emoji: "🛠️", section: SEC_SYS },
  // #243 — 一鍵打包 ZIP 匯出／匯入平台資料，無痛移機. Session-gated (see
  // store.ts) and PRESENT IN THE PRODUCTION BUNDLE, because a migration tool
  // that only runs on localhost cannot migrate a host.
  { page: "dataMigration", label: "資料搬遷", emoji: "📦", section: SEC_SYS },
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

/**
 * The 內容·素材管理 SUITE (owner directive 2026-07-25). Same dev gate as before —
 * a bare `import.meta.env.DEV` early return immediately above a statically
 * analysable `import("./ContentPage")` — but the chunk now contributes a LIST of
 * nav routes (m.CONTENT_ROUTES: audio · champions · newHero · abilities · items
 * · vfx · arenas) and a `render` function that mounts the right dev page for
 * each. Everything (routes, labels, editor engine, write module) still travels
 * with this one chunk, so a production build contains none of it. All routes
 * stay OUT of SESSION_REQUIRED_PAGES → loopback no-login editing is preserved.
 */
interface ContentSuite {
  readonly routes: readonly NavItem[];
  readonly render: (page: Page, onNavigate: (page: string, selectId?: string) => void) => React.JSX.Element | null;
}

function useContentSuite(): ContentSuite | null {
  const [loaded, setLoaded] = useState<ContentSuite | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let alive = true;
    void import("./ContentPage").then(
      (m) => {
        if (!alive) return;
        // labels + routes travel WITH the chunk, so a production bundle does not
        // even contain the strings for pages it cannot mount.
        const routes: NavItem[] = m.CONTENT_ROUTES.map((r) => ({
          page: r.page as Page,
          label: r.label,
          emoji: r.emoji,
          section: m.CONTENT_SECTION,
        }));
        setLoaded({ routes, render: (page, onNav) => m.renderContentDevPage(page, onNav) });
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  return loaded;
}

/**
 * THE SAME DEV GATE, for 角色語音生成 (owner spec step 4).
 *
 * Deliberately a SECOND hook rather than a parameterised one: the guard has to
 * sit as a bare `if (!import.meta.env.DEV) return;` immediately above a
 * STATICALLY ANALYSABLE `import("./VoiceGenPage")`, or rollup cannot prove the
 * chunk is unreachable and will emit it. A generic helper taking `() =>
 * import(...)` would hide the specifier behind a closure and quietly reinstate
 * the very thing the gate exists to prevent — the voice page carries a write
 * path to the loopback generation daemon.
 */
function useVoiceGenPage(): ContentAdmin | null {
  const [loaded, setLoaded] = useState<ContentAdmin | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let alive = true;
    void import("./VoiceGenPage").then(
      (m) => {
        if (alive) setLoaded({ Page: m.VoiceGenPageRoot, nav: { ...m.VOICE_NAV } });
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  return loaded;
}

/**
 * THE PHONE BREAKPOINT (task #126).
 *
 * The shell was a hard `220px 1fr` grid, which on a 375px phone leaves ~155px
 * for the entire console — every page unusable, buttons wrapping one glyph per
 * line. That was survivable while the console was a desk tool. It is not
 * survivable for 帳號審核: the moment this page exists to serve is the owner
 * ON HIS PHONE with a relative waiting, and a queue whose 通過 button renders
 * as a vertical stack of two characters is not a one-tap action.
 *
 * Below the breakpoint the rail becomes a horizontally-scrollable strip above
 * the content and the grid collapses to one column. matchMedia rather than a
 * resize listener: it fires only on the crossing, so there is no per-pixel
 * re-render, and it is the same signal a CSS media query would use — which
 * inline styles cannot express.
 */
const NARROW_QUERY = "(max-width: 720px)";

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => globalThis.matchMedia?.(NARROW_QUERY).matches ?? false,
  );
  useEffect(() => {
    const mq = globalThis.matchMedia?.(NARROW_QUERY);
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent): void => setNarrow(e.matches);
    setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

const CONTENT_SUITE_PAGES: ReadonlySet<Page> = new Set<Page>([
  "audio",
  "champions",
  "newHero",
  "abilities",
  "items",
  "vfx",
  "arenas",
  // 鑄形工坊 (task #229). ONE line, deliberately: reusing the existing
  // ContentPage dev gate rather than adding a third `useVoxelStudio()` hook
  // means the studio adds ZERO new dynamic-import surface, and its label stays
  // inside the dev chunk where contentGate.test.ts requires it to be.
  "voxelStudio",
]);

/** True for a 內容·素材管理 route that the dev chunk owns (so we can show a spinner). */
function isContentSuitePage(page: Page): boolean {
  return CONTENT_SUITE_PAGES.has(page);
}

/** Slot a block of dev-only nav entries immediately after `after`, or append. */
function insertBlockAfter(nav: readonly NavItem[], after: Page, block: readonly NavItem[]): NavItem[] {
  const at = nav.findIndex((n) => n.page === after);
  if (at < 0) return [...nav, ...block];
  return [...nav.slice(0, at + 1), ...block, ...nav.slice(at + 1)];
}

/** Slot a dev-only nav entry immediately BEFORE `before`, or append. */
function insertBefore(nav: readonly NavItem[], before: Page, entry: NavItem): NavItem[] {
  const at = nav.findIndex((n) => n.page === before);
  if (at < 0) return [...nav, entry];
  return [...nav.slice(0, at), entry, ...nav.slice(at)];
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
  const contentSuite = useContentSuite();
  const voiceAdmin = useVoiceGenPage();
  const narrow = useIsNarrow();
  const pendingCount = useApp((s) => s.pendingCount);
  const refreshPendingCount = useApp((s) => s.refreshPendingCount);

  /**
   * Poll the 帳號審核 queue for the nav badge (task #126).
   *
   * It lives in the SHELL, not on the approval page, and that is the whole
   * point: the owner is normally somewhere else in the console — or has the tab
   * parked — when a relative registers. A count that only appears once you open
   * the page you were never going to open is not a notification.
   *
   * 30s is a deliberate compromise: fast enough that "he says he registered"
   * resolves while the phone call is still happening, slow enough to be
   * invisible next to the hub's own 15s health pings. Failures are swallowed by
   * the store (an older platform build simply has no such route).
   */
  useEffect(() => {
    if (account === null) return;
    void refreshPendingCount();
    const timer = setInterval(() => void refreshPendingCount(), 30_000);
    return () => clearInterval(timer);
  }, [account, refreshPendingCount]);
  // 變更密碼 lives on the LOGGED-IN side only: the platform route needs both a
  // session and the current password, so there is nothing to show without one.
  const [changingPassword, setChangingPassword] = useState(false);
  // The dev content routes exist only when the dev chunk loaded; their labels
  // come FROM that chunk. Spliced BY NAME into 內容·素材管理: the content block
  // right after 營運's last row (audit), then 角色語音生成 right before the
  // always-present 內容白名單 — so the section reads audio · … · arenas · voiceGen
  // · curation. A production build shows the section with only curation.
  const withContent =
    contentSuite === null ? NAV : insertBlockAfter(NAV, "audit", contentSuite.routes);
  const nav =
    voiceAdmin === null
      ? withContent
      : insertBefore(withContent, "curation", { ...voiceAdmin.nav, section: SEC_CONTENT });
  const onNavigate = (p: string, _selectId?: string): void => navigate(p as Page);

  // THE SPLIT GATE (task #102): a page whose data lives on the Go platform admin
  // API needs a real operator session; the content editor + local consoles do
  // not. With no session those player-ops pages show a 需登入 state instead.
  const gated = account === null && pageRequiresSession(page);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: narrow ? "1fr" : "220px 1fr",
        background: BG,
      }}
    >
      <aside
        style={{
          background: PANEL_BG,
          // on a phone the rail is a strip ABOVE the content, so its divider
          // has to move from the right edge to the bottom one
          borderRight: narrow ? "none" : PANEL_BORDER,
          borderBottom: narrow ? PANEL_BORDER : "none",
          padding: narrow ? "10px 12px" : 16,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        {!narrow && (
          <>
            <div style={{ fontSize: 16, fontWeight: 800, color: TEXT_MAIN, marginBottom: 2 }}>GGD Ops</div>
            <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 20 }}>operator console</div>
          </>
        )}
        <nav
          style={
            narrow
              ? // one scrollable row; nothing wraps, so the strip never eats the
                // screen no matter how many consoles get added later
                { display: "flex", flexDirection: "row", gap: 6, overflowX: "auto", paddingBottom: 4 }
              : { display: "flex", flexDirection: "column", gap: 4, flex: 1 }
          }
        >
          {nav.map((n, i) => {
            const active = n.page === page;
            const locked = account === null && pageRequiresSession(n.page);
            // a dim section header whenever the section changes — only in the
            // column layout (in the narrow horizontal strip a header would break
            // the single scrollable row)
            const showHeader = !narrow && (i === 0 || nav[i - 1]!.section !== n.section);
            return (
              <Fragment key={n.page}>
                {showHeader && (
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 1,
                      color: TEXT_DIM,
                      opacity: 0.7,
                      margin: i === 0 ? "0 0 4px 8px" : "12px 0 4px 8px",
                    }}
                  >
                    {n.section}
                  </div>
                )}
              <button
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
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                <span style={{ marginRight: 8 }}>{n.emoji}</span>
                <span style={{ flex: 1 }}>{n.label}</span>
                {/* the waiting-queue badge — a filled amber pill, not a dot:
                    the NUMBER is what tells the owner whether one cousin or the
                    whole family is stuck on the approval screen */}
                {n.page === "approvals" && pendingCount > 0 && (
                  <span
                    title={`${pendingCount} 個帳號在等審核`}
                    style={{
                      marginLeft: 6,
                      minWidth: 18,
                      padding: "1px 6px",
                      borderRadius: 999,
                      background: WARN,
                      color: "#1a1206",
                      fontSize: 11,
                      fontWeight: 800,
                      textAlign: "center",
                    }}
                  >
                    {pendingCount}
                  </span>
                )}
                {locked && <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>🔒</span>}
              </button>
              </Fragment>
            );
          })}
        </nav>
        <div
          style={
            narrow
              ? // on a phone the account block sits inline under the strip
                { marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }
              : { marginTop: 16, borderTop: PANEL_BORDER, paddingTop: 12 }
          }
        >
          {account ? (
            <>
              <div
                style={{
                  fontSize: 12,
                  color: TEXT_MAIN,
                  marginBottom: narrow ? 0 : 8,
                  flex: narrow ? 1 : undefined,
                }}
              >
                {account.username}
              </div>
              <Btn
                small
                onClick={() => setChangingPassword(true)}
                style={narrow ? undefined : { width: "100%", marginBottom: 6 }}
              >
                變更密碼 Change password
              </Btn>
              <Btn small onClick={() => void doLogout()} style={narrow ? undefined : { width: "100%" }}>
                Sign out
              </Btn>
            </>
          ) : (
            <>
              <div
                style={{
                  fontSize: 11,
                  color: TEXT_DIM,
                  marginBottom: narrow ? 0 : 8,
                  lineHeight: 1.5,
                  flex: narrow ? 1 : undefined,
                }}
              >
                內容編輯免登入 · 玩家管理需登入
              </div>
              <Btn small kind="primary" onClick={() => showLogin()} style={narrow ? undefined : { width: "100%" }}>
                登入 Sign in
              </Btn>
            </>
          )}
        </div>
      </aside>
      {/* maxHeight/overflow only in the two-column layout — on a phone the rail
          is stacked above, so the PAGE scrolls and pinning main to 100vh would
          strand content below the fold */}
      <main
        style={{
          padding: narrow ? 12 : 20,
          minWidth: 0,
          overflow: narrow ? "visible" : "auto",
          maxHeight: narrow ? undefined : "100vh",
        }}
      >
        {gated ? (
          <SessionRequired onLogin={() => showLogin()} />
        ) : (
          <>
            {page === "hub" && <ConsoleHub />}
            {page === "approvals" && <ApprovalsPage />}
            {page === "players" && <PlayersPage />}
            {page === "matches" && <MatchesPage />}
            {page === "replays" && <ReplaysPage />}
            {page === "announcements" && <AnnouncementsPage />}
            {page === "curation" && <CurationPage />}
            {page === "contentOverlay" && <ContentOverlayPage />}
            {/* 內容·素材管理 dev routes — all mounted from the one dev chunk. */}
            {contentSuite !== null && contentSuite.render(page, onNavigate)}
            {contentSuite === null && isContentSuitePage(page) && (
              <div style={{ color: TEXT_DIM, padding: 8 }}>載入內容·素材管理…</div>
            )}
            {page === "combatEnv" && <CombatEnvPage />}
            {page === "serverOps" && <ServerOpsPage />}
            {page === "dataMigration" && <DataMigrationPage />}
            {page === "ai" && <AiSettingsPage />}
            {page === "modelBudget" && <ModelBudgetPage />}
            {page === "iconTracking" && <IconTrackingPage />}
            {page === "voxelSkins" && <VoxelSkinSheetPage />}
            {page === "voiceGen" && voiceAdmin !== null && <voiceAdmin.Page />}
            {page === "voiceGen" && voiceAdmin === null && (
              <div style={{ color: TEXT_DIM, padding: 8 }}>載入語音生成頁…</div>
            )}
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
