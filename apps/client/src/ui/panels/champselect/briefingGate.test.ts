/**
 * The self-calibrating rules-briefing gate (task #76). Covers the phase SPLIT
 * (briefing → picking) and its edges: fresh start, the 10 s window, a dismiss
 * that sticks across a reconnect, late-join suppression, and the timeout edge
 * (no briefing at 0 s).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  stepBriefing,
  dismissBriefing,
  BRIEFING_INITIAL,
  BRIEFING_WINDOW_SEC,
  BRIEFING_NEAR_START_SEC,
  type BriefingState,
} from "./briefingGate";

const M = "match-1";
const step = (state: BriefingState, secondsLeft: number, over: Partial<{ phase: string; matchId: string }> = {}) =>
  stepBriefing(state, { phase: over.phase ?? "champSelect", secondsLeft, matchId: over.matchId ?? M });

describe("briefing gate — the briefing → picking split", () => {
  it("shows the briefing for the first 10 s of a fresh champ select", () => {
    cover("client-briefing-gate");
    let s = BRIEFING_INITIAL;
    // enters at the top (60 s): active immediately
    let d = step(s, 60);
    expect(d.active).toBe(true);
    s = d.next;
    // 9 s elapsed (51 left): still briefing
    d = step(s, 51);
    expect(d.active).toBe(true);
    s = d.next;
    // exactly WINDOW_SEC elapsed (50 left): now PICKING
    d = step(s, 60 - BRIEFING_WINDOW_SEC);
    expect(d.active).toBe(false);
  });

  it("stays in picking for the rest of the phase", () => {
    cover("client-briefing-gate");
    let s = step(BRIEFING_INITIAL, 60).next;
    for (const sec of [40, 30, 20, 10, 3, 1]) {
      const d = step(s, sec);
      expect(d.active).toBe(false);
      s = d.next;
    }
  });

  it("never shows the briefing on a late join / reconnect below the near-start threshold", () => {
    cover("client-briefing-gate");
    // first clock ever seen is 20 s → firstObserved < NEAR_START_SEC → no briefing
    let s = step(BRIEFING_INITIAL, 20).next;
    expect(step(s, 20).active).toBe(false);
    s = step(s, 19).next;
    expect(step(s, 18).active).toBe(false);
    // sanity: the threshold is the discriminator
    expect(BRIEFING_NEAR_START_SEC).toBeGreaterThan(20);
  });

  it("resumes the briefing on a reconnect that is still near the top", () => {
    cover("client-briefing-gate");
    // reconnect sees 55 s first → enteredNearStart, 0 elapsed → briefing resumes
    const d = step(BRIEFING_INITIAL, 55);
    expect(d.active).toBe(true);
  });

  it("a dismiss sticks — including across a reconnect in the same match", () => {
    cover("client-briefing-gate");
    let s = step(BRIEFING_INITIAL, 60).next;
    expect(step(s, 58).active).toBe(true);
    s = dismissBriefing(step(s, 58).next);
    // still inside the window, but dismissed → no briefing
    expect(step(s, 57).active).toBe(false);
    // a reconnect (same matchId) keeps the dismiss
    const reconnect = step(s, 56);
    expect(reconnect.active).toBe(false);
    expect(reconnect.next.dismissed).toBe(true);
  });

  it("a NEW match rearms the gate (dismiss does not carry over)", () => {
    cover("client-briefing-gate");
    let s = dismissBriefing(step(BRIEFING_INITIAL, 60).next);
    expect(step(s, 58).active).toBe(false);
    // different matchId → fresh briefing
    const d = step(s, 60, { matchId: "match-2" });
    expect(d.active).toBe(true);
    expect(d.next.dismissed).toBe(false);
  });

  it("the timeout edge is silent: no briefing at 0 s, and none after the phase ends", () => {
    cover("client-briefing-gate");
    let s = step(BRIEFING_INITIAL, 60).next;
    // clock parked at 0 (server about to auto-pick) → never active
    expect(step(s, 0).active).toBe(false);
    // phase moved on → not active
    expect(step(s, 60, { phase: "intermission" }).active).toBe(false);
  });
});
