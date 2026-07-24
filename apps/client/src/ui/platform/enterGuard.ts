/**
 * Pure decisions for the login ENTER GUARD (playtest fix, follow-up to #74).
 *
 * AuthScreen runs ONE enter cinematic at a time: `runEnter` latches a guard so a
 * double-click cannot fire two swoops (or two logins). The guard was only ever
 * released on the auth-failure path, so an enter that played the cinematic and
 * then moved the player NOWHERE — an offline launch that staged nothing — left
 * it latched forever: every later press of "Play offline vs bots" was swallowed
 * in silence, no error, no console line, no request, and the only recovery was
 * reloading the page (observed live on the playtest lane).
 *
 * The rule is one predicate: an enter "took" only if the app actually left the
 * idle login screen. Note the offline handoff deliberately KEEPS `screen` at
 * "auth" while MatchLoadingOverlay holds the >=1s bar, so a STAGED launch counts
 * as taken — the guard must stay latched across that hold, not release into it.
 *
 * No store / DOM imports, so the rule unit-tests in node.
 */

/** What the app looked like the moment an enter's `proceed` finished. */
export interface EnterOutcome {
  /** the platform store's `screen` after `proceed` */
  screen: string;
  /** is a match launch parked behind the loading bar (`matchLoading`)? */
  matchStaged: boolean;
}

/**
 * Release the one-enter-at-a-time guard? True exactly when the enter did
 * nothing — still on the login screen with no launch staged — so the player can
 * press again instead of facing a dead button.
 */
export function shouldReleaseEnterGuard(outcome: EnterOutcome): boolean {
  return outcome.screen === "auth" && !outcome.matchStaged;
}

/**
 * Toast for an enter that ran but landed nowhere (the offline launch staged
 * nothing, or `proceed` threw). The button re-enables either way; this is so the
 * failure is also VISIBLE rather than a silently ignored click.
 */
export const ENTER_FAILED_NOTE = "無法進入戰場，請再試一次；若持續失敗請重新整理頁面。";
