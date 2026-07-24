/**
 * spectateFocus — the PURE decision behind "the spectator follows the live
 * zone" (task #208). GGD rounds are paired duels across up-to-2 zones; a duel
 * concludes the instant one side is wiped, but the ROUND runs until every duel
 * is decided. So a player whose own duel is already over would, by default,
 * keep staring at their finished/empty zone while another 3v3 is still being
 * fought. This module decides, from the authoritative per-zone duel state,
 * WHICH zone the combat camera should watch.
 *
 * Babylon-free and side-effect-free on purpose: the "where do I look" rule is
 * exactly the kind of thing that is easy to get subtly wrong (jump too eagerly
 * and you fight the player's free-pan; never jump and the bug is unfixed), so
 * it lives here behind unit tests. `GameApp` is the imperative shell that reads
 * `MatchState.duels`, calls this, and moves the real `CameraRig`.
 */

/**
 * One paired duel, projected from `MatchState.duels`. `live` is the ONLY thing
 * this module cares about: a duel is live while it is still being fought
 * (undecided). The snapshot marks a zone decided the same tick the server does
 * (its `winner` flips from -1), so `live = winner < 0` at the call site.
 */
export interface DuelView {
  zone: number;
  /** true while the duel is undecided and still being fought. */
  live: boolean;
}

/**
 * Is the duel in `ownZone` already decided?
 *
 * `ownZone === null` (no local champion / zone unknown) or a zone with no
 * matching duel both return false — "treat it as still live". That is the SAFE
 * default in every consumer: it keeps the #85 death-spectator desaturation
 * armed and never redirects the camera off the player's own fight, so an
 * unknown state degrades to exactly the pre-#208 behaviour rather than a
 * spurious jump.
 */
export function ownDuelDecided(ownZone: number | null, duels: readonly DuelView[]): boolean {
  if (ownZone === null) return false;
  const own = duels.find((d) => d.zone === ownZone);
  return own !== undefined && !own.live;
}

/**
 * Which zone the spectator combat-camera should watch, or null to stay put:
 *
 *   • own duel still LIVE (or own zone unknown) → null. Keep following your own
 *     fight — this is the normal alive-follow / #85 dead-spectator behaviour,
 *     untouched.
 *   • own duel DECIDED and ≥1 OTHER zone is still live → that live zone. When
 *     more than one other zone is live the LOWEST zone id is chosen, so the pick
 *     is deterministic and stable (every client/frame agrees; no flip-flop).
 *   • own duel DECIDED and NO other zone is live → null. The round is about to
 *     conclude (all duels decided → the server ends it immediately); stay for
 *     the round-winner / settlement beat rather than jump to nothing.
 *
 * Returning null for "stay" (rather than echoing `ownZone`) lets the caller
 * distinguish "no redirect, leave the camera alone" from "actively point at
 * this other zone", which is what keeps manual free-pan usable between jumps.
 */
export function pickSpectateZone(ownZone: number | null, duels: readonly DuelView[]): number | null {
  if (!ownDuelDecided(ownZone, duels)) return null;
  let pick: number | null = null;
  for (const d of duels) {
    if (d.zone === ownZone || !d.live) continue;
    if (pick === null || d.zone < pick) pick = d.zone;
  }
  return pick;
}
