/**
 * audio: pure app-state → BGM scene mapping. Platform screens, match phases,
 * the late-combat fireRing tension swap, victory/defeat from placement, and
 * the combat-start sting edge.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  FIRE_RING_SEC,
  isCombatEnd,
  isCombatStart,
  loopResumeOffsetSec,
  sceneForMatch,
  sceneForPlatform,
} from "./scene";

describe("platform screen → scene (audio-scene-map)", () => {
  it("auth = menu, lobby = lobby, room = room", () => {
    cover("audio-scene-map");
    expect(sceneForPlatform({ screen: "auth", inRoom: false })).toBe("menu");
    expect(sceneForPlatform({ screen: "lobby", inRoom: false })).toBe("lobby");
    expect(sceneForPlatform({ screen: "lobby", inRoom: true })).toBe("room");
    // boot holds the current bed; match is handled by sceneForMatch
    expect(sceneForPlatform({ screen: "boot", inRoom: false })).toBeNull();
    expect(sceneForPlatform({ screen: "match", inRoom: false })).toBeNull();
  });
});

describe("match phase → scene (audio-scene-map)", () => {
  it("maps every phase, swapping combat→fireRing for the last seconds", () => {
    cover("audio-scene-map");
    expect(sceneForMatch({ phase: "champSelect", phaseSecondsLeft: 30 })).toBe("champSelect");
    expect(sceneForMatch({ phase: "intermission", phaseSecondsLeft: 20 })).toBe("intermission");
    // early combat = combat bed
    expect(sceneForMatch({ phase: "combat", phaseSecondsLeft: FIRE_RING_SEC + 1 })).toBe("combat");
    // final stretch = fireRing tension bed
    expect(sceneForMatch({ phase: "combat", phaseSecondsLeft: FIRE_RING_SEC })).toBe("fireRing");
    expect(sceneForMatch({ phase: "combat", phaseSecondsLeft: 5 })).toBe("fireRing");
    // ...but not once the timer is unknown/zero (hold the combat bed)
    expect(sceneForMatch({ phase: "combat", phaseSecondsLeft: 0 })).toBe("combat");
    expect(sceneForMatch({ phase: "resolution", phaseSecondsLeft: 5 })).toBe("settlement");
  });

  it("matchEnd resolves victory/defeat from the local placement", () => {
    cover("audio-scene-map");
    expect(sceneForMatch({ phase: "matchEnd", phaseSecondsLeft: 0, placement: 1 })).toBe("victory");
    expect(sceneForMatch({ phase: "matchEnd", phaseSecondsLeft: 0, placement: 2 })).toBe("defeat");
    expect(sceneForMatch({ phase: "matchEnd", phaseSecondsLeft: 0, placement: 0 })).toBe("defeat");
    expect(sceneForMatch({ phase: "matchEnd", phaseSecondsLeft: 0 })).toBe("defeat");
  });

  it("an unknown/connecting phase holds the current bed (null)", () => {
    cover("audio-scene-map");
    expect(sceneForMatch({ phase: "connecting", phaseSecondsLeft: 0 })).toBeNull();
    expect(sceneForMatch({ phase: "", phaseSecondsLeft: 0 })).toBeNull();
  });
});

describe("combat-start sting edge (audio-scene-map)", () => {
  it("fires only on the transition INTO combat", () => {
    cover("audio-scene-map");
    expect(isCombatStart("intermission", "combat")).toBe(true);
    expect(isCombatStart(null, "combat")).toBe(true);
    expect(isCombatStart("combat", "combat")).toBe(false); // already in combat
    expect(isCombatStart("combat", "resolution")).toBe(false);
  });
});

describe("combat TEARDOWN edge (audio-combat-teardown-edge, task #216)", () => {
  it("fires on EVERY exit from combat — that is when the fight's beds must die", () => {
    cover("audio-combat-teardown-edge");
    // The bug: `fireRingLoop` is a ~60 s one-shot lit at ring ignition and
    // nothing could stop a started SFX, so a round that settled inside that
    // window carried burning fire through 結算 into the shop
    // (「回到商店時…還會有火圈聲音」). The teardown hangs off this edge.
    expect(isCombatEnd("combat", "resolution")).toBe(true);
    expect(isCombatEnd("combat", "intermission")).toBe(true);
    // …including the jump straight to the match end: there is no phase in which
    // a fight bed belongs, so no exit is exempt.
    expect(isCombatEnd("combat", "matchEnd")).toBe(true);
  });

  it("does NOT fire while in combat, or on any edge that never left it", () => {
    cover("audio-combat-teardown-edge");
    expect(isCombatEnd("combat", "combat")).toBe(false); // still fighting
    expect(isCombatEnd("intermission", "combat")).toBe(false); // the START edge
    expect(isCombatEnd("resolution", "intermission")).toBe(false);
    expect(isCombatEnd(null, "champSelect")).toBe(false); // fresh mount
  });

  it("is the exact mirror of isCombatStart — the two never fire on one edge", () => {
    cover("audio-combat-teardown-edge");
    const phases = [null, "champSelect", "intermission", "combat", "resolution", "matchEnd"];
    for (const prev of phases) {
      for (const next of phases) {
        if (next === null) continue;
        expect(isCombatStart(prev, next) && isCombatEnd(prev, next)).toBe(false);
      }
    }
  });
});

describe("loop resume offset (audio-bgm-loop-resume)", () => {
  it("returns (elapsed mod duration) in seconds, wrapping past a whole loop", () => {
    cover("audio-bgm-loop-resume");
    // 3 s played into an 8 s loop → 3 s in
    expect(loopResumeOffsetSec(3000, 8)).toBeCloseTo(3);
    // 5 s played into a 2 s loop → wraps to 1 s in
    expect(loopResumeOffsetSec(5000, 2)).toBeCloseTo(1);
    // exactly one full loop lands back at the top
    expect(loopResumeOffsetSec(2000, 2)).toBe(0);
  });

  it("collapses every degenerate input to 0 (play from the top)", () => {
    cover("audio-bgm-loop-resume");
    expect(loopResumeOffsetSec(0, 8)).toBe(0); // first visit
    expect(loopResumeOffsetSec(-100, 8)).toBe(0); // negative clock
    expect(loopResumeOffsetSec(3000, 0)).toBe(0); // unknown duration
    expect(loopResumeOffsetSec(Number.NaN, 8)).toBe(0);
    expect(loopResumeOffsetSec(3000, Number.NaN)).toBe(0);
  });
});
