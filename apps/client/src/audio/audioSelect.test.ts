/**
 * audio: pure decision layer — clip selection (seeded determinism), the
 * cooldown + maxConcurrent gate, crossfade gain curves, and the volume math.
 * No WebAudio here; these are the functions the AudioSystem delegates to.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  SfxGate,
  clampVolume,
  clampPan,
  crossfadeCurves,
  effectiveGain,
  fadeInCurve,
  fadeOutCurve,
  needsSceneChange,
  pickSfxFile,
  selectSfxFile,
  sfxEntryFor,
  sfxVoiceMultiplier,
} from "./audioSelect";
import type { AudioMap, SfxEntry } from "./types";

const MAP: AudioMap = {
  bgm: {},
  sfx: {
    death: {
      files: ["a.mp3", "b.mp3", "c.mp3", "d.mp3"],
      cooldownMs: 300,
      maxConcurrent: 2,
    },
    levelUp: { files: ["up.mp3"] },
  },
};

/** deterministic rng that yields a fixed sequence, then repeats the last. */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

describe("clip selection (audio-select-file)", () => {
  it("picks a pool clip deterministically for a given rng value", () => {
    cover("audio-select-file");
    const entry = MAP.sfx.death!;
    // floor(r * 4): 0→a, .25→b, .5→c, .75→d
    expect(pickSfxFile(entry, () => 0)).toBe("a.mp3");
    expect(pickSfxFile(entry, () => 0.25)).toBe("b.mp3");
    expect(pickSfxFile(entry, () => 0.5)).toBe("c.mp3");
    expect(pickSfxFile(entry, () => 0.75)).toBe("d.mp3");
  });

  it("never indexes past the pool end (rng returning 1 or NaN)", () => {
    cover("audio-select-file");
    const entry = MAP.sfx.death!;
    expect(pickSfxFile(entry, () => 1)).toBe("d.mp3"); // clamped
    expect(pickSfxFile(entry, () => Number.NaN)).toBe("a.mp3");
  });

  it("a seeded sequence reproduces the exact same picks", () => {
    cover("audio-select-file");
    const rng = seq([0.9, 0.1, 0.6]);
    expect(selectSfxFile(MAP, "death", rng)).toBe("d.mp3"); // floor(3.6)=3
    expect(selectSfxFile(MAP, "death", rng)).toBe("a.mp3"); // floor(0.4)=0
    expect(selectSfxFile(MAP, "death", rng)).toBe("c.mp3"); // floor(2.4)=2
  });

  it("returns null for an unmapped event (silent, never throws)", () => {
    cover("audio-select-file");
    expect(sfxEntryFor(MAP, "nope")).toBeNull();
    expect(selectSfxFile(MAP, "nope", () => 0)).toBeNull();
  });
});

describe("cooldown gating (audio-cooldown-gate)", () => {
  it("drops a second trigger inside the cooldown window, allows it after", () => {
    cover("audio-cooldown-gate");
    const gate = new SfxGate();
    const entry: SfxEntry = { files: ["x.mp3"], cooldownMs: 300, maxConcurrent: 8 };
    expect(gate.tryAcquire("levelUp", entry, 1000)).toBe(true);
    gate.release("levelUp"); // voice ended immediately — concurrency is free
    expect(gate.tryAcquire("levelUp", entry, 1100)).toBe(false); // 100ms < 300ms
    expect(gate.tryAcquire("levelUp", entry, 1250)).toBe(false); // 250ms < 300ms
    expect(gate.tryAcquire("levelUp", entry, 1300)).toBe(true); // exactly 300ms
  });

  it("no cooldown (0/undefined) never rate-limits", () => {
    cover("audio-cooldown-gate");
    const gate = new SfxGate();
    const entry: SfxEntry = { files: ["x.mp3"], maxConcurrent: 16 };
    for (let t = 0; t < 5; t++) {
      expect(gate.tryAcquire("basicAttack", entry, t)).toBe(true);
      gate.release("basicAttack");
    }
  });
});

describe("maxConcurrent cap (audio-maxconcurrent-cap)", () => {
  it("caps simultaneous voices; a release frees one slot", () => {
    cover("audio-maxconcurrent-cap");
    const gate = new SfxGate();
    // cooldown 0 so only concurrency gates; cap 2
    const entry: SfxEntry = { files: ["x.mp3"], cooldownMs: 0, maxConcurrent: 2 };
    expect(gate.tryAcquire("damage", entry, 0)).toBe(true); // 1
    expect(gate.tryAcquire("damage", entry, 0)).toBe(true); // 2
    expect(gate.activeCount("damage")).toBe(2);
    expect(gate.tryAcquire("damage", entry, 0)).toBe(false); // at cap → dropped
    gate.release("damage"); // a voice ended
    expect(gate.activeCount("damage")).toBe(1);
    expect(gate.tryAcquire("damage", entry, 0)).toBe(true); // slot freed
    expect(gate.activeCount("damage")).toBe(2);
  });

  it("a burst of one-frame damage events cannot machine-gun past the cap", () => {
    cover("audio-maxconcurrent-cap");
    const gate = new SfxGate();
    const entry: SfxEntry = { files: ["x.mp3"], cooldownMs: 0, maxConcurrent: 3 };
    let started = 0;
    for (let i = 0; i < 50; i++) if (gate.tryAcquire("damage", entry, 0)) started++;
    expect(started).toBe(3); // never more than the cap in a single instant
    expect(gate.totalActive()).toBe(3);
  });
});

describe("crossfade gain math (audio-crossfade-math)", () => {
  it("equal-power curves hit their endpoints and stay monotonic", () => {
    cover("audio-crossfade-math");
    const { out, in: inc } = crossfadeCurves(0.8, 0.5, 16);
    expect(out[0]).toBeCloseTo(0.8, 6); // outgoing starts at its gain
    expect(out[out.length - 1]).toBe(0); // …ends silent
    expect(inc[0]).toBe(0); // incoming starts silent
    expect(inc[inc.length - 1]).toBeCloseTo(0.5, 6); // …ends at its target
    // monotonic: out non-increasing, in non-decreasing
    for (let i = 1; i < out.length; i++) expect(out[i]!).toBeLessThanOrEqual(out[i - 1]! + 1e-9);
    for (let i = 1; i < inc.length; i++) expect(inc[i]!).toBeGreaterThanOrEqual(inc[i - 1]! - 1e-9);
  });

  it("equal-power: out^2 + (in scaled to same peak)^2 is ~constant", () => {
    cover("audio-crossfade-math");
    const { out, in: inc } = crossfadeCurves(1, 1, 33);
    for (let i = 0; i < out.length; i++) {
      expect(out[i]! * out[i]! + inc[i]! * inc[i]!).toBeCloseTo(1, 5);
    }
  });

  it("fadeOut/fadeIn halves match the full crossfade halves", () => {
    cover("audio-crossfade-math");
    expect(fadeOutCurve(0.7, 8)).toEqual(crossfadeCurves(0.7, 0, 8).out);
    expect(fadeInCurve(0.4, 8)).toEqual(crossfadeCurves(0, 0.4, 8).in);
  });

  it("re-asking for the current scene is a no-op edge", () => {
    cover("audio-crossfade-math");
    expect(needsSceneChange("combat", "combat")).toBe(false);
    expect(needsSceneChange("combat", "fireRing")).toBe(true);
    expect(needsSceneChange(null, "menu")).toBe(true);
    expect(needsSceneChange("menu", null)).toBe(true);
  });
});

describe("volume math (audio-volume-math)", () => {
  it("multiplies master × bus × clip, and mute forces 0", () => {
    cover("audio-volume-math");
    const vol = { master: 0.8, bgm: 0.5, sfx: 0.9, muted: false };
    expect(effectiveGain(vol, "bgm", 1)).toBeCloseTo(0.4, 6); // .8*.5
    expect(effectiveGain(vol, "sfx", 1)).toBeCloseTo(0.72, 6); // .8*.9
    expect(effectiveGain(vol, "sfx", 0.5)).toBeCloseTo(0.36, 6); // *clip
    expect(effectiveGain({ ...vol, muted: true }, "sfx", 1)).toBe(0);
  });

  it("clamps out-of-range / non-finite inputs into 0..1", () => {
    cover("audio-volume-math");
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(5)).toBe(1);
    expect(clampVolume(Number.NaN)).toBe(0);
    expect(clampVolume(0.3)).toBeCloseTo(0.3, 6);
    // effectiveGain clamps its bus inputs too
    expect(effectiveGain({ master: 2, bgm: 2, sfx: 2, muted: false }, "bgm", 1)).toBe(1);
  });
});

describe("clampPan / sfxVoiceMultiplier (positioned one-shot SFX)", () => {
  it("clamps stereo pan into [-1, 1], non-finite → centred", () => {
    cover("audio-sfx-pan");
    expect(clampPan(0)).toBe(0);
    expect(clampPan(-1)).toBe(-1);
    expect(clampPan(1)).toBe(1);
    expect(clampPan(-3)).toBe(-1); // clamp far-left
    expect(clampPan(2.5)).toBe(1); // clamp far-right
    expect(clampPan(0.42)).toBeCloseTo(0.42);
    expect(clampPan(NaN)).toBe(0);
    expect(clampPan(undefined)).toBe(0);
    expect(clampPan(Infinity)).toBe(0);
  });

  it("per-voice volume multiplier: default 1, floored at 0, bad input → 1", () => {
    cover("audio-sfx-pan");
    expect(sfxVoiceMultiplier(undefined)).toBe(1); // omitted → no attenuation
    expect(sfxVoiceMultiplier(1)).toBe(1);
    expect(sfxVoiceMultiplier(0.4)).toBeCloseTo(0.4); // quiet far roar
    expect(sfxVoiceMultiplier(1.5)).toBe(1.5); // loud near roar (can exceed 1)
    expect(sfxVoiceMultiplier(-2)).toBe(0); // never negative
    expect(sfxVoiceMultiplier(NaN)).toBe(1); // bad number → neutral
  });
});
