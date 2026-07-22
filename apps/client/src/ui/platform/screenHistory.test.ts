/**
 * Return-from-app decision (task #26): AuthScreen plays the cinematic RETURN
 * intro only when the user NAVIGATED back to auth from inside the app
 * (lobby/match — logout, exit-to-login, settlement exit), never on a cold page
 * load (boot → auth). The tracker is a pure class, tested without zustand.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { ScreenTracker, isAppScreen } from "./screenHistory";

describe("isAppScreen", () => {
  it("counts lobby + match as inside the app; boot/auth are not", () => {
    cover("login-return-decision");
    expect(isAppScreen("lobby")).toBe(true);
    expect(isAppScreen("match")).toBe(true);
    expect(isAppScreen("boot")).toBe(false);
    expect(isAppScreen("auth")).toBe(false);
  });
});

describe("ScreenTracker.cameFromApp", () => {
  it("cold load (boot → auth) is NOT a return from the app", () => {
    cover("login-return-decision");
    const t = new ScreenTracker();
    t.record("boot");
    t.record("auth");
    expect(t.cameFromApp()).toBe(false);
  });

  it("logout (lobby → auth) IS a return from the app", () => {
    cover("login-return-decision");
    const t = new ScreenTracker();
    t.record("boot");
    t.record("auth");
    t.record("lobby");
    t.record("auth");
    expect(t.cameFromApp()).toBe(true);
  });

  it("exiting a match/settlement back to login IS a return from the app", () => {
    cover("login-return-decision");
    const t = new ScreenTracker();
    t.record("boot");
    t.record("auth");
    t.record("match"); // play offline / settlement lives inside the match screen
    t.record("auth");
    expect(t.cameFromApp()).toBe(true);
  });

  it("only answers true while ON auth (never mid-app)", () => {
    cover("login-return-decision");
    const t = new ScreenTracker();
    t.record("auth");
    t.record("lobby");
    expect(t.cameFromApp()).toBe(false); // currently on lobby
    t.record("match");
    expect(t.cameFromApp()).toBe(false);
  });

  it("an empty tracker or duplicate records never mis-fire", () => {
    cover("login-return-decision");
    const t = new ScreenTracker();
    expect(t.cameFromApp()).toBe(false); // nothing recorded
    t.record("auth");
    expect(t.cameFromApp()).toBe(false); // no prior screen at all
    t.record("auth"); // duplicate set (zustand fires on ANY state change)
    t.record("auth");
    expect(t.cameFromApp()).toBe(false); // duplicates are not transitions
    t.record("lobby");
    t.record("lobby");
    t.record("auth");
    expect(t.cameFromApp()).toBe(true); // the real lobby → auth transition
  });
});
