/**
 * abilityCue — the shared Q/W/E/R/EX press feedback fired from every input path
 * (on-screen tile, touch arc button, keyboard key, gamepad button). The unit
 * under test is the pure cue decision: WHICH sound, the haptic pulse, and the
 * de-dupe that guarantees ONE cue per activation even when a button press also
 * resolves into a cast.
 *
 * Env note: the client vitest runs in a `node` env, so the sound/haptic/clock
 * seams are injected and asserted directly (no WebAudio, no navigator.vibrate).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { abilityActivationCue, resetAbilityCue, ABILITY_CUE_DEDUPE_MS } from "./abilityCue";

interface Rec {
  plays: { event: string; volume?: number }[];
  vibes: (number | number[])[];
}

/** Build injectable seams with a caller-driven clock. */
function harness(startAt = 1000): { rec: Rec; deps: (denied?: boolean) => Parameters<typeof abilityActivationCue>[1]; setNow: (t: number) => void } {
  const rec: Rec = { plays: [], vibes: [] };
  let t = startAt;
  const play = (event: string, opts?: { volume?: number }): void => {
    rec.plays.push({ event, volume: opts?.volume });
  };
  const vibrate = (pattern: number | number[]): boolean => {
    rec.vibes.push(pattern);
    return true;
  };
  return {
    rec,
    setNow: (n) => {
      t = n;
    },
    deps: (denied?: boolean) => ({ denied, play, vibrate, now: () => t }),
  };
}

beforeEach(() => resetAbilityCue());

describe("abilityCue: press feedback per activation", () => {
  it("a normal activation plays uiClick once (attenuated) + a tap haptic, returns true", () => {
    const h = harness();
    const played = abilityActivationCue("Q", h.deps());
    expect(played).toBe(true);
    expect(h.rec.plays).toHaveLength(1);
    expect(h.rec.plays[0]!.event).toBe("uiClick");
    expect(h.rec.plays[0]!.volume).toBeGreaterThan(0);
    expect(h.rec.plays[0]!.volume).toBeLessThan(1); // sits under the combat layer
    expect(h.rec.vibes).toHaveLength(1);
    expect(typeof h.rec.vibes[0]).toBe("number"); // crisp single-pulse tap
  });

  it("a denied press swaps to uiDenied + the stutter haptic", () => {
    const h = harness();
    abilityActivationCue("R", h.deps(true));
    expect(h.rec.plays[0]!.event).toBe("uiDenied");
    expect(Array.isArray(h.rec.vibes[0])).toBe(true); // multi-pulse refusal
  });

  it("a PASSIVE tile plays the soft neutral uiHover — NOT the active click", () => {
    const h = harness();
    abilityActivationCue("W", { ...h.deps(), passive: true });
    expect(h.rec.plays[0]!.event).toBe("uiHover");
    expect(typeof h.rec.vibes[0]).toBe("number"); // light single pulse, not stutter
  });

  it("passive takes precedence over denied (a passive is never a refused active)", () => {
    const h = harness();
    abilityActivationCue("W", { ...h.deps(true), passive: true });
    expect(h.rec.plays[0]!.event).toBe("uiHover");
  });

  it("DE-DUPE: a second cue for the SAME slot inside the window is swallowed (one cue)", () => {
    const h = harness(5000);
    // e.g. a touch button press AND the cast it resolves into, same tick
    expect(abilityActivationCue("W", h.deps())).toBe(true);
    h.setNow(5000 + ABILITY_CUE_DEDUPE_MS - 1);
    expect(abilityActivationCue("W", h.deps())).toBe(false);
    expect(h.rec.plays).toHaveLength(1); // exactly one sound
    expect(h.rec.vibes).toHaveLength(1); // exactly one haptic
  });

  it("a DIFFERENT slot inside the window is never de-duped", () => {
    const h = harness(5000);
    expect(abilityActivationCue("Q", h.deps())).toBe(true);
    h.setNow(5000 + 5);
    expect(abilityActivationCue("E", h.deps())).toBe(true); // distinct slot → own cue
    expect(h.rec.plays.map((p) => p.event)).toEqual(["uiClick", "uiClick"]);
  });

  it("the SAME slot fires again once the window has elapsed (real re-press)", () => {
    const h = harness(5000);
    expect(abilityActivationCue("EX", h.deps())).toBe(true);
    h.setNow(5000 + ABILITY_CUE_DEDUPE_MS + 1);
    expect(abilityActivationCue("EX", h.deps())).toBe(true);
    expect(h.rec.plays).toHaveLength(2);
  });

  it("navigator.vibrate absence is tolerated (default haptic sink is guarded)", () => {
    // no vibrate injected → falls back to the guarded navigator sink; in node
    // navigator.vibrate is absent, so this must not throw and still plays sound.
    const rec: { event: string }[] = [];
    let t = 0;
    expect(() =>
      abilityActivationCue("Q", { play: (event) => rec.push({ event }), now: () => t++ }),
    ).not.toThrow();
    expect(rec).toEqual([{ event: "uiClick" }]);
  });
});
