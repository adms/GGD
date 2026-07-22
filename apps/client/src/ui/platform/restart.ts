/**
 * Pure restart-flow decisions (no store / network deps so it unit-tests in
 * node). "Restart match" means CLEAR THE BATTLEFIELD and start round 1 fresh:
 *
 *  - offline: recreate the GameApp → a new dev joinOrCreate → a brand-new
 *    SimWorld (fresh world, round 1). The client teardown (dispose) + fresh
 *    construct is the whole mechanism.
 *  - online (platform): a true room restart needs host authority the client
 *    doesn't have, so we return to the lobby with a note instead.
 */
export type RestartAction = "recreate" | "returnToLobby";

export function restartAction(mode: "platform" | "offline"): RestartAction {
  return mode === "offline" ? "recreate" : "returnToLobby";
}

/** Toast shown when an online player asks to restart (can't clear a live room). */
export const ONLINE_RESTART_NOTE =
  "線上房間無法就地重開（需主機權限）— 已返回大廳，可重新開一局。";
