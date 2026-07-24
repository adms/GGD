/**
 * The login enter guard must never latch permanently (playtest fix).
 *
 * Repro that motivated this: one press of "Play offline vs bots" that did not
 * reach a match left `enteringRef` true forever — three further presses did
 * nothing at all (no error, no console line, no request to the game server) and
 * only a page reload brought the button back. The guard now releases whenever
 * the enter left the player sitting on the idle login screen.
 *
 * Node env: the rule is a pure predicate, and the store flow it must line up
 * with (stage → hold → commit / cancel) is plain state.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { shouldReleaseEnterGuard, ENTER_FAILED_NOTE } from "./enterGuard";
import { appStore } from "./store";

describe("login enter guard (#74 follow-up)", () => {
  beforeEach(() => {
    appStore.getState().cancelMatchLoading();
    appStore.setState({ screen: "auth", match: null, lastError: null });
  });

  it("releases the guard when the enter left the player on the idle login screen", () => {
    cover("login-enter-guard-release");
    // THE bug: proceed ran, nothing moved — the next press must work
    expect(shouldReleaseEnterGuard({ screen: "auth", matchStaged: false })).toBe(true);
  });

  it("keeps the guard latched while a launch is staged behind the loading bar", () => {
    cover("login-enter-guard-release");
    // the offline handoff deliberately stays on "auth" for the >=1s hold —
    // releasing here would let a second press stage a second launch
    expect(shouldReleaseEnterGuard({ screen: "auth", matchStaged: true })).toBe(false);
  });

  it("keeps the guard latched once the screen actually changed", () => {
    cover("login-enter-guard-release");
    expect(shouldReleaseEnterGuard({ screen: "lobby", matchStaged: false })).toBe(false);
    expect(shouldReleaseEnterGuard({ screen: "match", matchStaged: false })).toBe(false);
  });

  it("matches the real store: staging latches, cancelling releases", () => {
    cover("login-enter-guard-release");
    const outcome = (): { screen: string; matchStaged: boolean } => {
      const s = appStore.getState();
      return { screen: s.screen, matchStaged: !!s.matchLoading };
    };
    // a successful offline enter → staged behind the bar → stay latched
    appStore.getState().beginOfflineLoading("arena_default");
    expect(shouldReleaseEnterGuard(outcome())).toBe(false);
    // …and once the bar commits, the screen change keeps it latched (AuthScreen
    // unmounts, taking the guard with it)
    appStore.getState().commitMatchLaunch();
    expect(shouldReleaseEnterGuard(outcome())).toBe(false);

    // an enter that staged nothing (or was aborted) → back to a live button
    appStore.setState({ screen: "auth", match: null });
    appStore.getState().cancelMatchLoading();
    expect(shouldReleaseEnterGuard(outcome())).toBe(true);
  });

  it("has a visible message for a launch that goes nowhere", () => {
    cover("login-enter-guard-release");
    appStore.getState().showError(ENTER_FAILED_NOTE);
    expect(appStore.getState().lastError).toBe(ENTER_FAILED_NOTE);
    // the toast is dismissible, so a stale failure never blocks the retry
    appStore.getState().clearError();
    expect(appStore.getState().lastError).toBeNull();
  });
});
