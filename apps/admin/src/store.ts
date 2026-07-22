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
  | "ai"
  /**
   * The two asset consoles (task #102). Both READ measurements published by
   * tasks #97 / #99 / #101 and neither computes one of its own.
   */
  | "modelBudget"
  | "iconTracking"
  | "audit";

export interface AdminAccount {
  id: string;
  username: string;
}

export interface AppState {
  screen: Screen;
  page: Page;
  account: AdminAccount | null;
  authBusy: boolean;
  authError: string | null;
  /** set when a valid login is authenticated but lacks the admin role */
  notAuthorized: boolean;

  boot(): Promise<void>;
  doLogin(username: string, password: string): Promise<void>;
  doLogout(): Promise<void>;
  navigate(page: Page): void;
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

  async boot() {
    if (!api.hasSession) {
      set({ screen: "login" });
      return;
    }
    try {
      const { account } = await apiMe();
      const isAdmin = await verifyAdmin(api);
      if (!isAdmin) {
        set({ screen: "login", notAuthorized: true, account: null });
        return;
      }
      set({ screen: "console", page: "hub", account, notAuthorized: false });
    } catch {
      api.setTokens(null);
      set({ screen: "login" });
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
    set({ screen: "login", account: null, page: "hub", notAuthorized: false });
  },

  navigate(page) {
    set({ page });
  },
}));

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(appStore, selector);
}
