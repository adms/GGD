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
export function cheatsAvailable(mode: "platform" | "offline" | null | undefined): boolean {
  return mode === "offline";
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
): boolean {
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
} as const;
