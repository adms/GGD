/**
 * Cheat hard-gate — the ONLY predicate that decides whether MSG.CHEAT is
 * honored. Pure so it unit-tests without a Colyseus room.
 *
 * Rule: cheats are dev-only. They require BOTH
 *   1. no platform shared secret (dev mode — the same gate that lets clients
 *      joinOrCreate directly), AND
 *   2. the devCheats flag on (default ON in dev; set GGD_DEV_CHEATS=0 to disable).
 *
 * A configured PLATFORM_GAME_SHARED_SECRET (i.e. production / platform-brokered
 * matches) disables cheats unconditionally. The client's "I'm offline" claim is
 * NEVER consulted — the decision is purely server-side environment.
 */
export function cheatsEnabled(sharedSecret: string, devCheatsEnv: string | undefined): boolean {
  if (sharedSecret) return false; // prod / platform mode — no cheats, ever
  return devCheatsEnv !== "0"; // dev default on; explicit "0" turns it off
}
