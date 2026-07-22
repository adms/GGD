/**
 * Screen-history tracker (task #26): did the user arrive at the auth screen by
 * NAVIGATING BACK from the app (lobby / match / settlement-in-match) rather
 * than by a cold page load? AuthScreen uses this on mount to choose between the
 * gentle cold-load reveal and the cinematic RETURN intro (reverse enter swoop).
 *
 * Purely ADDITIVE observation: a passive `appStore.subscribe` records screen
 * transitions — no store fields, no action edits (store.ts is shared with
 * parallel tasks). The `ScreenTracker` class itself is pure/standalone so the
 * decision logic unit-tests without zustand or a DOM.
 */
import { appStore, type Screen } from "./store";

/** Screens that count as "inside the app" for the return-intro decision. */
export function isAppScreen(screen: Screen): boolean {
  return screen === "lobby" || screen === "match";
}

/** Records the previous/current screen; answers "did we return from the app?". */
export class ScreenTracker {
  private prev: Screen | null = null;
  private current: Screen | null = null;

  /** Record a screen value; consecutive duplicates are ignored (no transition). */
  record(screen: Screen): void {
    if (screen === this.current) return;
    this.prev = this.current;
    this.current = screen;
  }

  /**
   * True when the CURRENT screen is auth and the user came from lobby/match —
   * i.e. an in-app "log out / exit to login" navigation, never a cold load
   * (cold load arrives via "boot", or with no prior screen at all).
   */
  cameFromApp(): boolean {
    return this.current === "auth" && this.prev !== null && isAppScreen(this.prev);
  }
}

/** Module singleton AuthScreen reads on mount. */
export const screenTracker = new ScreenTracker();

let wired = false;

/**
 * Start recording the store's screen transitions (idempotent). Called at
 * AuthScreen MODULE load — modules all evaluate before the app boots, so the
 * subscription exists before any screen ever changes.
 */
export function wireScreenTracker(): void {
  if (wired) return;
  wired = true;
  screenTracker.record(appStore.getState().screen);
  appStore.subscribe((s) => screenTracker.record(s.screen));
}
