/**
 * firering-config / audio-scene-map — the fire ring's CUE window.
 *
 * Task #132 shipped green with a hardcoded `FIRE_RING_SEC = 30` while the
 * authored config ignites the ring with 60 s left, so the tension BGM and the
 * minimap danger rim arrived 30 s after champions started burning. These tests
 * lock the derivation to the real content doc and lock the literal back OUT of
 * the source, because the only thing that made the drift survivable was that
 * nothing tied the two numbers together.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { Configs } from "@ggd/shared/content";
import type { ConfigDoc } from "@ggd/shared/content";
import {
  FIRE_RING_SEC,
  NO_RING_FALLBACK_SEC,
  __resetFireRingDriftAlarm,
  fireRingWindowSec,
  fireRingWindowSecFrom,
  noteFireRingIgnition,
} from "./fireRingWindow";
import { sceneForMatch } from "./scene";

const CONFIG_PATH = join(__dirname, "../../../../content/config/config.match.json");

interface MatchBlock {
  combatMaxSec: number;
  fireRing?: { startSec: number };
}

function readMatchConfig(): MatchBlock {
  const doc = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as { match: MatchBlock };
  return doc.match;
}

/** Register a synthetic `config.match` so the derivation has something to read. */
function registerMatchConfig(match: MatchBlock): void {
  Configs.register({
    id: "config.match",
    schema: "config@1",
    match,
  } as unknown as ConfigDoc);
}

beforeEach(() => {
  Configs.clear();
  __resetFireRingDriftAlarm();
  fireRingWindowSec(); // re-resolve the live binding for this test's registry state
});

afterEach(() => {
  Configs.clear();
  fireRingWindowSec();
});

describe("fire-ring cue window is derived, not authored twice (firering-config)", () => {
  it("is combatMaxSec - fireRing.startSec for the SHIPPED config, and is not the old 30", () => {
    cover("firering-config");
    const match = readMatchConfig();
    expect(match.fireRing).toBeTruthy();
    const expected = match.combatMaxSec - match.fireRing!.startSec;
    expect(fireRingWindowSecFrom(match)).toBe(expected);
    // The shipped doc is 240 / 180. If this ever equals the legacy literal the
    // test below stops being able to tell a derivation from a coincidence, so
    // assert the actual live numbers too.
    expect(expected).toBe(60);
    expect(expected).not.toBe(NO_RING_FALLBACK_SEC);
  });

  it("tracks the registered content doc, including the live FIRE_RING_SEC binding", () => {
    cover("firering-config");
    registerMatchConfig({ combatMaxSec: 240, fireRing: { startSec: 180 } });
    expect(fireRingWindowSec()).toBe(60);
    // ui/hud/Minimap.tsx reads this binding directly; ESM live-binding semantics
    // are what keep the rim and the bed on one number without editing that file.
    expect(FIRE_RING_SEC).toBe(60);

    // move the mechanic → the cue moves with it, with no code change
    registerMatchConfig({ combatMaxSec: 300, fireRing: { startSec: 120 } });
    expect(fireRingWindowSec()).toBe(180);
    expect(FIRE_RING_SEC).toBe(180);
  });

  it("degenerates safely: no doc / no ring → the legacy window, unreachable ring → never cue", () => {
    cover("firering-config");
    expect(fireRingWindowSec()).toBe(NO_RING_FALLBACK_SEC); // registry cleared in beforeEach
    expect(fireRingWindowSecFrom({ combatMaxSec: 240 })).toBe(NO_RING_FALLBACK_SEC);
    expect(fireRingWindowSecFrom(null)).toBe(NO_RING_FALLBACK_SEC);
    // startSec at/after the phase cap: the phase force-ends before the ring can
    // burn, so cueing anything would be a lie.
    expect(fireRingWindowSecFrom({ combatMaxSec: 240, fireRing: { startSec: 240 } })).toBe(0);
    expect(fireRingWindowSecFrom({ combatMaxSec: 240, fireRing: { startSec: 999 } })).toBe(0);
    // a ring armed at t=0 burns the whole phase, but never longer than it
    expect(fireRingWindowSecFrom({ combatMaxSec: 240, fireRing: { startSec: 0 } })).toBe(240);
  });

  it("swaps the BGM bed at the derived instant, not at 30 s", () => {
    cover("audio-scene-map");
    registerMatchConfig(readMatchConfig());
    // 61 s left: the ring has NOT ignited yet → combat bed
    expect(sceneForMatch({ phase: "combat", phaseSecondsLeft: 61 })).toBe("combat");
    // 60 s left: ignition → tension bed. This is the assertion that was false
    // for the whole life of #132 (it answered "combat" until 30 s left).
    expect(sceneForMatch({ phase: "combat", phaseSecondsLeft: 60 })).toBe("fireRing");
    expect(sceneForMatch({ phase: "combat", phaseSecondsLeft: 31 })).toBe("fireRing");
    expect(sceneForMatch({ phase: "combat", phaseSecondsLeft: 5 })).toBe("fireRing");
  });

  it("never re-hardcodes the window in the scene mapper (S3 source lock)", () => {
    cover("firering-config");
    const src = readFileSync(join(__dirname, "scene.ts"), "utf8");
    // a numeric assignment to the window is exactly how this broke the first time
    expect(src).not.toMatch(/FIRE_RING_SEC\s*(:\s*number\s*)?=\s*\d/);
  });
});

describe("fire-ring ignition drift alarm (firering-config)", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(console, "error").mockImplementation(() => {});
    registerMatchConfig({ combatMaxSec: 240, fireRing: { startSec: 180 } });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("stays silent when the sim ignites at the derived instant (±1 s quantisation)", () => {
    cover("firering-config");
    noteFireRingIgnition(60);
    noteFireRingIgnition(61);
    noteFireRingIgnition(59);
    expect(spy).not.toHaveBeenCalled();
  });

  it("shouts, once, with BOTH numbers when the cue and the burn part company", () => {
    cover("firering-config");
    noteFireRingIgnition(30); // what the old hardcoded cue would have implied
    expect(spy).toHaveBeenCalledTimes(1);
    const msg = String(spy.mock.calls[0]?.[0] ?? "");
    expect(msg).toContain("30s");
    expect(msg).toContain("60s");
    expect(msg).toContain("config.match@1");
    // one-shot: the config is frozen for the match, so this must not spam
    noteFireRingIgnition(30);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("ignores a garbage or absent clock rather than crying wolf", () => {
    cover("firering-config");
    noteFireRingIgnition(Number.NaN);
    // 0 = no combat clock at all (disconnected / phase not running / a synthetic
    // event in another unit test). Nothing to compare against.
    noteFireRingIgnition(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("still trips when the derived window is 0 but the sim burns anyway", () => {
    cover("firering-config");
    // startSec beyond the phase cap → this client would never cue the ring …
    registerMatchConfig({ combatMaxSec: 240, fireRing: { startSec: 300 } });
    // … but the sim ignited it with 5 s left. That is exactly the invisible
    // failure this alarm exists for.
    noteFireRingIgnition(5);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
