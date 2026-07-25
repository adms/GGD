/**
 * Admin console store — session + navigation. Data-heavy pages fetch their own
 * rows locally (useState); the store owns auth/boot/logout and the active page.
 * Vanilla Zustand + a React hook, mirroring the client's store shape.
 */
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

import {
  api,
  listPendingAccounts,
  login as apiLogin,
  logout as apiLogout,
  me as apiMe,
} from "./api";
import { ApiError, verifyAdmin } from "./session";

export type Screen = "boot" | "login" | "console";
export type Page =
  | "hub"
  | "players"
  | "matches"
  | "announcements"
  | "curation"
  /**
   * 內容管理 (task #102) — DEV BUILDS ONLY. The page module is reached through
   * an `import.meta.env.DEV`-guarded dynamic import in ui/App.tsx, so a
   * production admin build never emits it; naming the route here costs one
   * string literal and keeps navigation type-safe.
   */
  | "content"
  /**
   * The 內容·素材管理 back-office routes (owner directive 2026-07-25). Each is a
   * per-collection view over the SAME ContentPage editor engine (or, for
   * `audio`/`newHero`, a sibling dev page in the same chunk). ALL are DEV BUILDS
   * ONLY — reached exclusively through App's `import.meta.env.DEV`-guarded
   * dynamic import of ./ContentPage — and ALL stay OUT of
   * SESSION_REQUIRED_PAGES so the loopback no-login editing parity with
   * "content"/"voiceGen" holds. `audio` iframes the two audition pages (read-only
   * cross-origin) + the same-origin voice board; `champions`/`abilities`/`items`
   * /`vfx`/`arenas` route the editor; `newHero` is the 新英雄模板 wizard.
   */
  | "audio"
  | "champions"
  | "newHero"
  | "abilities"
  | "items"
  | "vfx"
  | "arenas"
  | "combatEnv"
  /**
   * 系統運維 (server ops) — the operational numbers: 同時對戰上限 + 快照頻率
   * writable, everything else visible and read-only with its safety class.
   */
  | "serverOps"
  | "ai"
  /**
   * The two asset consoles (task #102). Both READ measurements published by
   * tasks #97 / #99 / #101 and neither computes one of its own.
   */
  | "modelBudget"
  | "iconTracking"
  /**
   * 體素外觀對照表 (task #231) — the 驗收 surface for the per-champion generated
   * voxel skins. Unlike its two siblings above it MEASURES NOTHING EXTERNAL: it
   * computes every look at view time from /content + the shared generator, so
   * there is no report for it to read and nothing for it to go stale against.
   */
  | "voxelSkins"
  /**
   * 角色語音生成 (owner spec step 4) — DEV BUILDS ONLY, same shape as "content":
   * the page module is reached through an `import.meta.env.DEV`-guarded dynamic
   * import in ui/App.tsx, so a production admin build never emits it (nor its
   * nav label). It talks to the loopback voice-gen daemon on 127.0.0.1:8788
   * through the admin vite server's `/voice-api` proxy — a local
   * content-authoring tool with no platform session, exactly like the content
   * editor, so it is NOT in SESSION_REQUIRED_PAGES below.
   */
  | "voiceGen"
  /**
   * M幣 / 藍水晶 發放 (tasks #118, #225, #214) — admin-granted currency. M幣 now
   * goes through the audited /admin/accounts/{id}/mcoin; the unaudited
   * /wallet/admin/grant-mcoin it used to call is deleted.
   */
  | "mcoinGrant"
  /**
   * 邀請碼 (task #174) — mint / list / revoke the single-use registration invite
   * codes that are the private deploy's only front door. Platform-admin-backed,
   * so it is session-gated below and NOT reachable through the loopback drop-in.
   */
  | "invites"
  /**
   * 帳號審核 (task #126) — the private-deploy approval queue. THE blocker for
   * remote family play: a relative who registers lands `pending` and cannot
   * reach a room until an operator approves them here. Platform-admin-backed
   * (it reads and writes durable accounts), so it is session-gated below.
   */
  | "approvals"
  /**
   * 對戰回放 (task #175) — the owner's playtest feedback channel. Lists match
   * recordings and opens them in the reused game renderer. Platform-admin-backed
   * (recordings carry player names), so session-gated below.
   */
  | "replays"
  | "audit";

export interface AdminAccount {
  id: string;
  username: string;
}

export interface BootOptions {
  /** override the dev drop-in decision (tests); defaults to the vite DEV flag */
  devDropIn?: boolean;
}

export interface AppState {
  screen: Screen;
  page: Page;
  account: AdminAccount | null;
  authBusy: boolean;
  authError: string | null;
  /** set when a valid login is authenticated but lacks the admin role */
  notAuthorized: boolean;
  /**
   * DEV drop-in (task #102). When true the console opens STRAIGHT INTO the
   * content/codex editor with NO login, and only the platform-backed player-ops
   * pages are gated (see pageRequiresSession). In a production build vite folds
   * `import.meta.env.DEV` to false → the original hard login wall is restored,
   * and the content editor chunk does not even exist to drop into.
   */
  devDropIn: boolean;
  /**
   * 帳號審核 queue depth (task #126) — how many accounts are waiting right now.
   *
   * THIS IS CHROME, not page data, which is why it is the one count that lives
   * in the store while every table fetches its own rows. It drives the badge on
   * the nav rail and the banner on the players list, so a relative who
   * registered is visible from whatever page the owner happens to be on. The
   * whole failure this task fixes was approval state being reachable only if
   * you already knew to go looking for it.
   *
   * -1 means "not established yet" (pre-session, or every probe so far failed)
   * and renders as no badge — distinct from 0, which is a known-empty queue.
   */
  pendingCount: number;

  boot(opts?: BootOptions): Promise<void>;
  /**
   * Re-probe the queue depth. Safe to call from anywhere and at any time: with
   * no operator session it resets to -1 without touching the network, and a
   * failed probe LEAVES THE LAST KNOWN COUNT ALONE rather than showing 0 — a
   * transient 502 must not make a waiting relative disappear from the nav.
   */
  refreshPendingCount(): Promise<void>;
  doLogin(username: string, password: string): Promise<void>;
  doLogout(): Promise<void>;
  /** raise the operator login screen (e.g. from a gated page's 登入 button) */
  showLogin(): void;
  /** dev-only: dismiss the login screen back to the console (content editor) */
  cancelLogin(): void;
  navigate(page: Page): void;
}

/**
 * Pages backed by the Go PLATFORM admin API (argon2id + JWT + AdminOnly). These
 * are the player-ops / operations surfaces: they mutate accounts, wallets, MMR,
 * announcements, the content whitelist, the AI proxy config and the global
 * combat-env table. They CANNOT function without a real admin session — the
 * platform rejects an unauthenticated caller — so they stay gated even in the
 * dev drop-in. Everything NOT in this set is served over loopback with no
 * platform session: the content/codex editor (champions/abilities/items via the
 * content-api) and the read-only local consoles (hub, model-budget, icon-track).
 */
const SESSION_REQUIRED_PAGES: ReadonlySet<Page> = new Set<Page>([
  "players",
  "approvals",
  "matches",
  "announcements",
  "curation",
  "ai",
  "combatEnv",
  "serverOps",
  "mcoinGrant",
  "invites",
  "replays",
  "audit",
]);

/** True when `page` needs a real platform admin session to do anything. */
export function pageRequiresSession(page: Page): boolean {
  return SESSION_REQUIRED_PAGES.has(page);
}

/**
 * The dev drop-in flag, read through the repo's guarded `import.meta.env.DEV`
 * shape so plain-node vitest never throws. This is the SAME statically
 * substitutable signal the content editor's own gate uses (contentApi.ts) — no
 * runtime hostname / localStorage sniffing — so a production build folds the
 * whole no-login path away rather than deciding it at runtime.
 */
export function contentEditorDropInEnabled(): boolean {
  try {
    return Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
}

function errText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "something went wrong";
}

export const appStore = createStore<AppState>()((set, get) => ({
  screen: "boot",
  page: "hub",
  account: null,
  authBusy: false,
  authError: null,
  notAuthorized: false,
  devDropIn: false,
  pendingCount: -1,

  async refreshPendingCount() {
    if (get().account === null) {
      set({ pendingCount: -1 });
      return;
    }
    try {
      // pageSize 1 — only `total` is wanted, and it is the FULL pending count
      // server-side, so the badge is exact without paging through the queue.
      const res = await listPendingAccounts(1, 1);
      set({ pendingCount: typeof res.total === "number" ? res.total : 0 });
    } catch {
      // Deliberately silent and deliberately non-destructive. An older platform
      // build has no /admin/accounts/pending (404) and a flaky network 502s;
      // neither is worth an error banner on an unrelated page, and neither is
      // evidence that the queue is empty.
    }
  },

  async boot(opts) {
    const devDropIn = opts?.devDropIn ?? contentEditorDropInEnabled();
    // Where a session-less console lands: the content editor in dev, otherwise
    // the hub (only reached post-login in a production build).
    const landing: Page = devDropIn ? "champions" : "hub";
    set({ devDropIn });

    if (!api.hasSession) {
      // No session. In dev, drop straight into the content editor with the
      // player-ops pages gated; in prod, keep the hard login wall.
      if (devDropIn) set({ screen: "console", page: landing, account: null, notAuthorized: false });
      else set({ screen: "login" });
      return;
    }
    try {
      const { account } = await apiMe();
      const isAdmin = await verifyAdmin(api);
      if (!isAdmin) {
        // Authenticated but not an operator. Content editing is a loopback
        // capability, not a role — so in dev we still open the console (account
        // stays null ⇒ player-ops stays gated); in prod, back to the wall.
        if (devDropIn) set({ screen: "console", page: landing, account: null, notAuthorized: true });
        else set({ screen: "login", notAuthorized: true, account: null });
        return;
      }
      set({ screen: "console", page: "hub", account, notAuthorized: false });
    } catch {
      api.setTokens(null);
      if (devDropIn) set({ screen: "console", page: landing, account: null, notAuthorized: false });
      else set({ screen: "login" });
    }
  },

  async doLogin(username, password) {
    set({ authBusy: true, authError: null, notAuthorized: false });
    try {
      const resp = await apiLogin(username, password);
      api.setTokens(resp.tokens);
      const isAdmin = await verifyAdmin(api);
      if (!isAdmin) {
        api.setTokens(null);
        set({ authBusy: false, notAuthorized: true });
        return;
      }
      set({
        screen: "console",
        page: "hub",
        account: resp.account,
        authBusy: false,
        authError: null,
        notAuthorized: false,
      });
    } catch (err) {
      set({ authBusy: false, authError: errText(err) });
    }
  },

  async doLogout() {
    try {
      const token = api.refreshToken;
      if (token) await apiLogout(token);
    } catch {
      /* best effort */
    }
    api.setTokens(null);
    // In dev, sign-out returns to the no-login content editor (not a wall);
    // in prod it drops back to the login screen as before. Either way the
    // approval queue depth goes back to "unknown" — it is operator-visible
    // information about real people and must not outlive the session.
    if (get().devDropIn) {
      set({ screen: "console", account: null, page: "champions", notAuthorized: false, pendingCount: -1 });
    } else {
      set({ screen: "login", account: null, page: "hub", notAuthorized: false, pendingCount: -1 });
    }
  },

  showLogin() {
    set({ screen: "login", authError: null });
  },

  cancelLogin() {
    // Only meaningful in the dev drop-in, where a console exists behind the
    // login screen to return to. In prod the login screen is a hard wall.
    if (get().devDropIn) set({ screen: "console", authError: null, notAuthorized: false });
  },

  navigate(page) {
    set({ page });
  },
}));

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(appStore, selector);
}
