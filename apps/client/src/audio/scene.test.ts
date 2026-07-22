/**
 * audio: pure app-state → BGM scene mapping. Platform screens, match phases,
 * the late-combat fireRing tension swap, victory/defeat from placement, and
 * the combat-start sting edge.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  FIRE_RING_SEC,
  isCombatStart,
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
