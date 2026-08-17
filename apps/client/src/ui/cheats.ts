/**
 * Pure logic for the offline cheat console: availability gating, the backtick
 * toggle key, level clamping, registry filtering (reusing the champ-select
 * substring filter — Chinese names included), and the exact Cheat payload
 * builders sent on MSG.CHEAT. No React / registry imports so it unit-tests in
 * node. The server hard-gates the channel to dev mode regardless of this.
 */
import type { Cheat } from "@ggd/shared/protocol/messages";
import type { AbilitySlot } from "@ggd/shared/sim/intents";
import { classifyEnvTier } from "@ggd/shared/envTier";
import { filterChampions, type RosterChampion } from "./panels/champSelectFilter";

export const LEVEL_MIN = 1;
export const LEVEL_MAX = 18;
/** ` (backtick) toggles the cheat console. */
export const CHEAT_TOGGLE_KEY = "`";

/** Clamp a level input/slider to the valid champion range [1, 18]. */
export function clampLevel(n: number): number {
  if (!Number.isFinite(n)) return LEVEL_MIN;
  return Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, Math.floor(n)));
}

/**
 * The cheat console is available ONLY in offline / single-player mode (no
 * platform match). This is a UX gate; the server independently rejects cheats
 * outside dev mode and never trusts this flag.
 */
export function cheatsAvailable(
  mode: "platform" | "offline" | null | undefined,
  /** 練習房（GH#343）—— 單人沙盒，測試碼就是它存在的理由之一。 */
  practice?: boolean,
): boolean {
  return mode === "offline" || practice === true;
}

/**
 * Whether the 🐞 BUTTON may sit on the live screen (playtest P9).
 *
 * `cheatsAvailable` decides whether the console EXISTS at all; this decides
 * whether it advertises itself. They are deliberately different questions. A
 * family member playing on the LAN box or on https://ggd.adms.ai/ was being
 * shown a permanent "cheats" button in the top-right corner of a real match —
 * the first thing a curious kid presses, and an invitation to break their own
 * game. The developer, on the machine running the dev server, wants it one
 * click away.
 *
 * So the button is gated on the ENVIRONMENT TIER of the host the page was
 * served from, reusing task #127's ONE classifier rather than inventing a
 * second flag: loopback (the dev's own machine) shows it; "lan" (the phone on
 * the wifi, the family box) and "public" (the deployed host) do not.
 *
 * NOTHING IS REMOVED. The console still mounts in every offline session and the
 * backtick key still opens it everywhere — buried, not deleted, exactly as the
 * task asks. This is UX only: the server independently hard-gates MSG.CHEAT to
 * dev mode, so hiding or showing a button never changes what is enforceable.
 *
 * `location.hostname` is the right input here (not an IP): classifyEnvTier
 * resolves "localhost"/"127.0.0.1"/"::1" to loopback, private ranges and
 * `*.local` to lan, and everything unknown to public — fail-safe toward hiding.
 */
export function cheatButtonVisible(
  mode: "platform" | "offline" | null | undefined,
  hostname: string | undefined,
  /**
   * 練習房（GH#343）**豁免環境分級**。上面那段講的是「好奇的小孩在真的比賽裡按到
   * 一顆作弊鈕」；練習房裡沒有比賽可以被破壞，而 owner 要的正是「進去就能用測試碼」。
   * 藏起來只會讓這個功能在 ggd.adms.ai 上完全找不到（那台是 "public" 級）。
   */
  practice?: boolean,
): boolean {
  if (practice === true) return true;
  return cheatsAvailable(mode) && classifyEnvTier(hostname) === "loopback";
}

/** Backtick toggles the console — but never while typing in a text field. */
export function isCheatToggleKey(key: string): boolean {
  return key === CHEAT_TOGGLE_KEY;
}

/** A searchable registry row (champion or item). */
export interface CheatListEntry extends RosterChampion {
  id: string;
  name: string;
}

/** Substring-filter a champion/item list (reuses the champ-select filter). */
export function filterEntries<T extends RosterChampion>(entries: readonly T[], query: string): T[] {
  return filterChampions(entries, query);
}

/**
 * Cheat payload builders — the exact object shapes sent on MSG.CHEAT. Kept here
 * (not inline in JSX) so the payload contract is unit-testable.
 */
export const cheat = {
  setLevel: (level: number): Cheat => ({ kind: "setLevel", level: clampLevel(level) }),
  grantGold: (amount: number): Cheat => ({ kind: "grantGold", amount }),
  grantMCoin: (amount: number): Cheat => ({ kind: "grantMCoin", amount }),
  maxAbilities: (): Cheat => ({ kind: "maxAbilities" }),
  rankAbility: (slot: AbilitySlot): Cheat => ({ kind: "rankAbility", slot }),
  giveItem: (itemId: string): Cheat => ({ kind: "giveItem", itemId }),
  swapChampion: (championId: string): Cheat => ({ kind: "swapChampion", championId }),
  fullHeal: (): Cheat => ({ kind: "fullHeal" }),
  godMode: (enabled: boolean): Cheat => ({ kind: "godMode", enabled }),
  zeroCooldown: (enabled: boolean): Cheat => ({ kind: "zeroCooldown", enabled }),
  resetCooldowns: (): Cheat => ({ kind: "resetCooldowns" }),
  killEnemies: (): Cheat => ({ kind: "killEnemies" }),
  skipPhase: (): Cheat => ({ kind: "skipPhase" }),
  rerollOffers: (): Cheat => ({ kind: "rerollOffers" }),
  spawnFlower: (): Cheat => ({ kind: "spawnFlower" }),
  /**
   * 即時生成殭屍（GH#343）。`count` 省略 ⇒ 伺服器用 `config.practice@1` 的
   * 「生怪指令的預設數量」，⛔ 客戶端不自己決定（那會變成第四個住處，而且沒有守衛）。
   */
  spawnMob: (what: "normal" | "special" | "boss", count?: number): Cheat => ({
    kind: "spawnMob",
    what,
    ...(count === undefined ? {} : { count }),
  }),
} as const;

/**
 * 生怪數量輸入框 → `spawnMob` 的 `count`（GH#343 · owner 2026-08-18
 * 「也沒辦法一鍵呼喚 **N 個**特定殭屍」）。
 *
 * ⭐ `undefined` 是一個**有意義的回傳值**，不是失敗：它代表「不要送 count，
 * 讓伺服器用 `config.practice@1` 的預設數量」。所以預設值仍然只住在後台那一格，
 * ⛔ 客戶端沒有第二份（第一守則）。
 *
 * ⚠️ 空字串 / 空白 / 非數字 / ≤0 全部退回 `undefined` —— 尤其是**清空輸入框**：
 * 那時 `Number("")` 是 **0**，直接送出去會變成「生 0 隻」，而畫面上什麼都不會發生，
 * 使用者只會覺得按鈕壞了（失敗形態②的手感版本）。
 * 上界 99 只是防手滑打太多位數；⭐ 真正的上限**由伺服器夾**（小怪波的每區存活上限），
 * ⛔ 這裡不重複那個規則。
 */
export function parseSpawnCount(raw: string): number | undefined {
  const t = raw.trim();
  if (t === "") return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  const i = Math.floor(n);
  if (i <= 0) return undefined;
  return Math.min(99, i);
}
