/**
 * shopGate — the HUD's mirror of the server's shop rule, plus the Chinese the
 * player actually reads.
 *
 * THE SERVER IS THE AUTHORITY. `packages/shared/src/sim/economy/shopAccess.ts`
 * is consulted by CommandSystem on the authoritative world, so a hand-rolled
 * buy command sent during combat by a living champion is rejected regardless of
 * what any client believed. This module exists so the UI does not have to
 * PRETEND to be open and then eat a rejection: it disables the button with a
 * reason up front. It imports the shared rule rather than restating it — the
 * two can only ever agree.
 *
 * The three states, per the arena design:
 *   intermission (prep) → open to everyone
 *   combat              → open ONLY to a champion already down this round, so
 *                         dying is a head start on the next round rather than
 *                         dead time. Living players get 「戰鬥中無法使用商店」.
 *   anything else       → closed (champ select / resolution / match end)
 *
 * Pure + node-testable: no React, no DOM.
 */
import { shopOpen, shopPhaseOf, type ShopAccess, type ShopDenyReason } from "@ggd/shared/sim/economy/shopAccess";

/** What the HUD needs to render the shop button and card. */
export interface ShopGateView {
  /** may the player buy/sell right now? */
  readonly open: boolean;
  /**
   * Should the shop SURFACE exist at all this phase? The card and its re-open
   * button are mounted while this is true; when it flips false the panel
   * force-closes. During combat this is true only for the defeated player, so
   * the shop cannot linger over a live duel.
   */
  readonly mounted: boolean;
  /** short label for the re-open button */
  readonly label: string;
  /** why the button is disabled, ready to show — empty when open */
  readonly reason: string;
}

/** Chinese for each server-side denial reason (the string the player sees). */
export const SHOP_DENY_TEXT: Record<ShopDenyReason, string> = {
  "combat-alive": "戰鬥中無法使用商店",
  "phase-closed": "現在不是備戰時間",
  "no-champion": "尚未選擇英雄",
};

export const SHOP_OPEN_LABEL = "商店";
/** the defeated-player case reads differently: it is a consolation, not a phase */
export const SHOP_DOWNED_LABEL = "商店（陣亡中）";

/**
 * Resolve the shop's UI state from the two things the HUD store already
 * publishes: the match phase and whether the local champion is alive.
 */
export function shopGate(phase: string, alive: boolean, hasChampion = true): ShopGateView {
  if (!hasChampion) {
    return { open: false, mounted: false, label: SHOP_OPEN_LABEL, reason: SHOP_DENY_TEXT["no-champion"] };
  }
  const shopPhase = shopPhaseOf(phase);
  const access: ShopAccess = shopOpen(shopPhase, alive);
  if (access.open) {
    return {
      open: true,
      mounted: true,
      label: shopPhase === "combat" ? SHOP_DOWNED_LABEL : SHOP_OPEN_LABEL,
      reason: "",
    };
  }
  return {
    open: false,
    // Only PREP mounts a disabled shop — during combat a living player must not
    // even see the surface (「戰鬥的時候商店不會出現」); the panel force-closes
    // on the phase flip and there is no button to tempt them with.
    mounted: false,
    label: SHOP_OPEN_LABEL,
    reason: SHOP_DENY_TEXT[access.reason],
  };
}

/**
 * Should the shop AUTO-OPEN right now? True exactly on the transition INTO a
 * prep window (LoL-Arena behaviour: the shop is the phase, so it presents
 * itself). Once auto-opened the player may close it and re-open at will — this
 * only fires on the edge, never on a re-render.
 */
export function shouldAutoOpen(prevPhase: string | null, phase: string): boolean {
  return phase === "intermission" && prevPhase !== "intermission";
}
