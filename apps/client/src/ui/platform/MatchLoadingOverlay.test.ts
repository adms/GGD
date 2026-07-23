/**
 * Login→battle handoff (task #74): the loading transition + roar fade.
 *
 * The store stages the offline launch behind a >=1s loading bar instead of
 * jumping straight to "match", and requests the login-roar fade the moment the
 * transition begins so the long roar recedes behind the bar rather than
 * overlapping the combat scene's voices. `commitMatchLaunch` is what finally
 * flips to the match.
 *
 * Node env (vite.config `environment: "node"`, include `*.test.ts`): the store
 * flow is plain state so it tests directly, and the overlay is rendered to
 * static markup (react-dom/server) — no DOM, effects don't run, which is fine
 * because the timing is a pure state machine on the store, not in the effect.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import { appStore, MATCH_LOADING_MIN_MS } from "./store";
import { MatchLoadingBar } from "./MatchLoadingOverlay";

describe("login→battle loading transition (#74)", () => {
  beforeEach(() => {
    // start each case from a clean, un-staged, pre-match store (a prior case may
    // have committed to "match"); writes go through the store's own actions
    appStore.getState().cancelMatchLoading();
    appStore.setState({ screen: "auth", match: null });
  });

  it("holds the launch behind a loading bar of at least 1 second", () => {
    cover("login-match-loading");
    // the roar must have time to fade before the combat voices start
    expect(MATCH_LOADING_MIN_MS).toBeGreaterThanOrEqual(1000);
  });

  it("beginOfflineLoading stages a launch WITHOUT entering the match yet, and requests the roar fade", () => {
    cover("login-match-loading");
    const before = appStore.getState().screen;
    appStore.getState().beginOfflineLoading("arena_default");

    const ml = appStore.getState().matchLoading;
    expect(ml).not.toBeNull();
    expect(ml!.launch.mode).toBe("offline");
    // THE roar fade is requested the instant the transition begins
    expect(ml!.roarFadeRequested).toBe(true);
    // …but we have NOT jumped into the match — the login screen (and its roar's
    // scene) is still up, holding behind the bar
    expect(appStore.getState().screen).toBe(before);
    expect(appStore.getState().match).toBeNull();
  });

  it("commitMatchLaunch flips to the match with the staged launch, then clears the loading state", () => {
    cover("login-match-loading");
    appStore.getState().beginOfflineLoading("arena_default");
    appStore.getState().commitMatchLaunch();

    expect(appStore.getState().screen).toBe("match");
    expect(appStore.getState().match?.mode).toBe("offline");
    expect(appStore.getState().match?.mapId).toBe("arena_default");
    expect(appStore.getState().matchLoading).toBeNull();
  });

  it("commitMatchLaunch is a no-op when nothing is staged", () => {
    cover("login-match-loading");
    const screen = appStore.getState().screen;
    appStore.getState().commitMatchLaunch();
    expect(appStore.getState().screen).toBe(screen);
  });

  it("cancelMatchLoading aborts the transition without launching", () => {
    cover("login-match-loading");
    appStore.getState().beginOfflineLoading();
    appStore.getState().cancelMatchLoading();
    expect(appStore.getState().matchLoading).toBeNull();
    expect(appStore.getState().screen).not.toBe("match");
  });

  it("the loading bar is a real progress affordance whose fill animates for the full >=1s hold", () => {
    cover("login-match-loading");
    const html = renderToStaticMarkup(createElement(MatchLoadingBar));
    // a real progress affordance is shown…
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('data-testid="match-loading"');
    // …and the fill animates for the full >=1s hold (the window the roar fades in)
    expect(html).toContain(`${MATCH_LOADING_MIN_MS}ms`);
  });
});
