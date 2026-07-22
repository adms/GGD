/**
 * Pure logic for the offline cheat console: availability gating, the backtick
 * toggle key, level clamping, registry filtering (reusing the champ-select
 * substring filter — Chinese names included), and the exact Cheat payload
 * builders sent on MSG.CHEAT. No React / registry imports so it unit-tests in
 * node. The server hard-gates the channel to dev mode regardless of this.
 */
import type { Cheat } from "@ggd/shared/protocol/messages";
import type { AbilitySlot } from "@ggd/shared/sim/intents";
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
