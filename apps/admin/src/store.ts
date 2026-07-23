/**
 * Admin console store — session + navigation. Data-heavy pages fetch their own
 * rows locally (useState); the store owns auth/boot/logout and the active page.
 * Vanilla Zustand + a React hook, mirroring the client's store shape.
 */
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

import { api, login as apiLogin, logout as apiLogout, me as apiMe } from "./api";
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
  /** M幣 發放 (task #118) — admin-granted M COIN via /wallet/admin/grant-mcoin. */
  | "mcoinGrant"
  /**
   * 邀請碼 (task #174) — mint / list / revoke the single-use registration invite
   * codes that are the private deploy's only front door. Platform-admin-backed,
   * so it is session-gated below and NOT reachable through the loopback drop-in.
   */
  | "invites"
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

  boot(opts?: BootOptions): Promise<void>;
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

  async boot(opts) {
    const devDropIn = opts?.devDropIn ?? contentEditorDropInEnabled();
    // Where a session-less console lands: the content editor in dev, otherwise
    // the hub (only reached post-login in a production build).
    const landing: Page = devDropIn ? "content" : "hub";
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
    // in prod it drops back to the login screen as before.
    if (get().devDropIn) {
      set({ screen: "console", account: null, page: "content", notAuthorized: false });
    } else {
      set({ screen: "login", account: null, page: "hub", notAuthorized: false });
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
