import { create } from "zustand";
import { ApiClient, scopedSessionKey, type StoredSession } from "../../../admin/src/session";
import type { SessionResp } from "../../../admin/src/types";

const SESSION_KEY = scopedSessionKey("ggd.editor.session.v1");
export const heroPlatform = new ApiClient({ storage: {
  load() {
    try { const raw = localStorage.getItem(SESSION_KEY); const value = raw ? JSON.parse(raw) as StoredSession : null; return typeof value?.accessToken === "string" && typeof value.refreshToken === "string" ? value : null; } catch { return null; }
  },
  save(value) { try { if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value)); else localStorage.removeItem(SESSION_KEY); } catch { /* Session still works in memory when browser storage is unavailable. */ } },
} });
export type HeroAccount = { id: string; username: string; roles?: string[] };
export const useHeroAccount = create<{ account: HeroAccount | null; ready: boolean }>(() => ({ account: null, ready: false }));
heroPlatform.onSessionExpired = () => useHeroAccount.setState({ account: null, ready: true });
let restoring: Promise<void> | null = null;
export function restoreHeroAccount(): Promise<void> {
  return restoring ??= (async () => {
    try { if (heroPlatform.hasSession) { const result = await heroPlatform.request<{ account: HeroAccount }>("/me"); useHeroAccount.setState({ account: result.account }); } }
    finally { useHeroAccount.setState({ ready: true }); }
  })();
}
export async function loginHeroAccount(username: string, password: string): Promise<void> {
  const result = await heroPlatform.request<SessionResp>("/auth/login", { body: { username, password }, auth: false });
  heroPlatform.setTokens(result.tokens); useHeroAccount.setState({ account: result.account, ready: true });
}
export async function logoutHeroAccount(): Promise<void> {
  try { await heroPlatform.request("/auth/logout", { body: { refreshToken: heroPlatform.refreshToken ?? "" }, auth: false }); }
  finally { heroPlatform.setTokens(null); useHeroAccount.setState({ account: null, ready: true }); }
}
