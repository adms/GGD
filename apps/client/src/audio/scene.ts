/**
 * audio/scene — PURE mapping from app/match state to a BGM scene. Kept out of
 * the AudioSystem (and out of React) so the "what should be playing right now"
 * rule is a testable function of discrete state, never a per-frame decision.
 *
 * Platform screens (auth → menu, lobby, room) come from the platform store;
 * in-match scenes come from the HUD store's match phase.
 */
import type { AudioScene } from "./types";

/** Seconds left in Combat below which the tension bed ("fireRing") takes over. */
export const FIRE_RING_SEC = 30;

/** Platform shell state that selects a pre-match scene. */
export interface PlatformAudioState {
  /** platform store `screen`: boot | auth | lobby | match */
  screen: string;
  /** true when the player is sitting in a room (store.room !== null) */
  inRoom: boolean;
}

/**
 * Pre-match screen → scene (null = "match", handled by sceneForMatch, or boot
 * = leave the bed alone). The auth screen is the "menu" theme; the lobby is
 * the "lobby" theme until the player enters a room, which switches to "room".
 */
export function sceneForPlatform(s: PlatformAudioState): AudioScene | null {
  switch (s.screen) {
    case "auth":
      return "menu";
    case "lobby":
      return s.inRoom ? "room" : "lobby";
    default:
      return null; // "boot" holds; "match" is driven by sceneForMatch
  }
}

export interface MatchAudioState {
  /** MatchState.phase: champSelect | intermission | combat | resolution | matchEnd */
  phase: string;
  /** seconds left in the current phase (drives the late-combat tension swap) */
  phaseSecondsLeft: number;
  /** local team's final placement (1 = winner); 0/undefined until matchEnd */
  placement?: number;
}

/**
 * Match phase → scene. `combat` swaps to the `fireRing` tension bed for the
 * last FIRE_RING_SEC of the round (the round-timer pressure moment); matchEnd
 * resolves to victory/defeat from the local team's placement.
 */
export function sceneForMatch(s: MatchAudioState): AudioScene | null {
  switch (s.phase) {
    case "champSelect":
      return "champSelect";
    case "intermission":
      return "intermission";
    case "combat":
      return s.phaseSecondsLeft > 0 && s.phaseSecondsLeft <= FIRE_RING_SEC ? "fireRing" : "combat";
    case "resolution":
      return "settlement";
    case "matchEnd":
      return s.placement === 1 ? "victory" : "defeat";
    default:
      return null; // "connecting" and anything unknown: hold the current bed
  }
}

/**
 * Whether entering `next` from `prev` is the combat kickoff that fires the
 * battleStart sting (the combat bed then crossfades in underneath it).
 */
export function isCombatStart(prev: string | null, next: string): boolean {
  return next === "combat" && prev !== "combat";
}
