/**
 * audio/combatSfxSpatial — COVERAGE, not calls.
 *
 * The project's recurring failure mode is a feature that ships green and never
 * happens in a real match. For spatial audio the specific shape of that failure
 * is "the event I happened to edit got a position, the other twenty did not" —
 * which no per-event test would catch, because each one passes on its own.
 *
 * So the load-bearing test here SCRAPES `combatSfx.ts` for every event type its
 * mapper can voice and requires each one to be classified, either as positioned
 * (EVENT_SPATIAL) or as deliberately centred (CENTRED_EVENTS, with a stated
 * reason). A new `case` added to that mapper turns this red until somebody
 * decides where the sound is. The inverse assertion is here too: no UI, HUD,
 * announcer or BGM key may ever appear on the spatial side.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { EVENT_SPATIAL, CENTRED_EVENTS, resolveSpatial, relationOf, subjectOf } from "./combatSfxSpatial";
import { spatialMix, type SpatialListener } from "./spatial";

const REPO = resolve(__dirname, "../../../..");
const COMBAT_SFX_SRC = readFileSync(join(REPO, "apps/client/src/audio/combatSfx.ts"), "utf8");

/**
 * Every sim event type `combatSfxKey` can turn into a sound, read off the file
 * itself: the single `switch (ev.type)` block's cases, plus the PASSTHROUGH set
 * (events whose key is their own name).
 */
function voicedEventTypes(): string[] {
  const cases = [...COMBAT_SFX_SRC.matchAll(/^\s*case "([a-zA-Z]+)":/gm)].map((m) => m[1]!);
  const passthroughBlock = /const PASSTHROUGH = new Set<string>\(\[([\s\S]*?)\]\);/.exec(COMBAT_SFX_SRC);
  expect(passthroughBlock, "PASSTHROUGH literal moved — the scrape is stale").not.toBeNull();
  const passthrough = [...passthroughBlock![1]!.matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]!);
  return [...new Set([...cases, ...passthrough])];
}

/** A minimal event carrying whatever payload the spec is expected to read. */
function ev(type: string, data: Record<string, unknown>): EventMessage {
  return { type, tick: 1, data };
}

const LISTENER: SpatialListener = { levelX: 0, levelZ: 0, dirX: 0, dirZ: 0 };
const noPos = (): null => null;
const noTeam = (): null => null;

describe("combatSfxSpatial coverage — every voiced event is classified", () => {
  it("scrapes combatSfx.ts and finds a spatial spec or a stated centred reason for each", () => {
    cover("audio-spatial-callsite-coverage");
    const voiced = voicedEventTypes();
    // sanity: the scrape actually found the mapper, not an empty file
    expect(voiced.length).toBeGreaterThanOrEqual(20);
    expect(voiced).toContain("damage");
    expect(voiced).toContain("abilityCast");
    expect(voiced).toContain("heal");

    const unclassified = voiced.filter((t) => !EVENT_SPATIAL[t] && !CENTRED_EVENTS[t]);
    expect(
      unclassified,
      `combatSfx.ts can voice these events but audio/combatSfxSpatial says nothing about where they are: ` +
        `${unclassified.join(", ")}. Add an EVENT_SPATIAL row, or a CENTRED_EVENTS entry with the reason.`,
    ).toEqual([]);
  });

  it("classifies each event exactly once — positioned OR centred, never both", () => {
    cover("audio-spatial-callsite-coverage");
    for (const type of Object.keys(EVENT_SPATIAL)) {
      expect(CENTRED_EVENTS[type], `${type} is in both tables`).toBeUndefined();
    }
    // every centred entry carries a REASON, not an empty string
    for (const [type, reason] of Object.entries(CENTRED_EVENTS)) {
      expect(reason.length, `${type} is centred with no stated reason`).toBeGreaterThan(10);
    }
  });

  it("declares no spec for anything the mapper cannot voice (no dead rows)", () => {
    cover("audio-spatial-callsite-coverage");
    const voiced = new Set(voicedEventTypes());
    const dead = [...Object.keys(EVENT_SPATIAL), ...Object.keys(CENTRED_EVENTS)].filter((t) => !voiced.has(t));
    expect(dead, `classified but never voiced by combatSfx.ts: ${dead.join(", ")}`).toEqual([]);
  });

  it("NEVER spatialises a UI / HUD / announcer / BGM key", () => {
    cover("audio-spatial-callsite-coverage");
    // These are the AudioDirector tally cues, the button/ability-cue keys, the
    // shop/draft/settlement/auth keys and the BGM scenes. They are the local
    // player's own body and clock, or screen-space chrome. A directional
    // 「you died」 or a panned menu beep is worse than a centred one.
    const MUST_STAY_2D = [
      "matchStart", "matchStartGong", "battleStart", "roundStart", "arenaAmbience", "respawn",
      "vsReveal", "matchEndGong", "kill", "multiKill", "death", "allySlain", "levelUp", "exUnlock",
      "levelUpJingle", "exUnlockSting", "lowHealth", "countTick", "countFinal", "champSelectConfirm",
      "uiClick", "uiHover", "uiHoverCyber", "uiTabSwitch", "uiToggle", "uiDenied", "uiCancel", "uiType",
      "panelOpen", "shopPurchase", "goldGain", "draftCardReveal", "legendaryRoll", "legendaryWin",
      "draftConfirm", "settlementReveal", "recessBell", "merchantAmbience",
      "dragonRoar", "dragonRoarBig", "footstep",
      "menu", "menuNocturne", "lobby", "room", "champSelect", "intermission", "combat", "fireRing",
      "settlement", "victory", "defeat",
    ];
    for (const key of MUST_STAY_2D) {
      expect(EVENT_SPATIAL[key], `${key} must never be spatialised`).toBeUndefined();
    }
  });
});

describe("combatSfxSpatial resolution — every positioned event actually resolves", () => {
  /**
   * Drive EVERY row of EVENT_SPATIAL with a source offset from the listener and
   * require a real, signed pan out the other end. This is the assertion that a
   * half-wired table fails: a spec whose entityFallback names a field the sim
   * does not emit resolves to null and shows up here, not in a playtest.
   */
  it("yields a signed pan for all 23 positioned event types, via payload x/z", () => {
    cover("audio-spatial-callsite-coverage");
    const types = Object.keys(EVENT_SPATIAL);
    expect(types.length).toBe(23);
    for (const type of types) {
      // 5 u to the listener's LEFT — the sign is the assertion
      const src = resolveSpatial(ev(type, { x: -5, z: 0, source: 7, target: 8 }), noPos, null, noTeam);
      expect(src, `${type} resolved no position from payload x/z`).not.toBeNull();
      const mix = spatialMix(LISTENER, src!)!;
      expect(mix, `${type} produced no mix`).not.toBeNull();
      expect(mix.pan, `${type} did not pan LEFT for a source on the left`).toBeLessThan(0);
      expect(mix.pan).toBeCloseTo(-0.41595, 4); // 0.75·tanh(-5/8)
      expect(mix.volume).toBeGreaterThan(0);
      expect(mix.volume).toBeLessThanOrEqual(1);
    }
  });

  it("falls back to the entity registry for every event that carries no x/z", () => {
    cover("audio-spatial-callsite-coverage");
    // The sim payloads with NO position at all — these MUST resolve through an
    // entity id or they are silently unplaceable in a real match.
    const noPositionPayloads: Record<string, Record<string, unknown>> = {
      basicAttack: { source: 11, target: 12 },
      attackWindup: { source: 11, target: 12 },
      projectileSpawn: { id: 90, owner: 11 },
      projectileHit: { id: 90, owner: 11, target: 12 },
      basicAttackHit: { id: 90, owner: 11, target: 12 },
      castBegin: { caster: 11 },
      castEnd: { caster: 11 },
      castInterrupt: { caster: 11 },
      abilityCast: { caster: 11, point: null },
      buffApply: { source: 11, target: 12 },
      reviveChannel: { id: 90, channeller: 11, ownerId: 12 },
    };
    const positions: Record<number, { x: number; z: number }> = {
      11: { x: 6, z: 0 },
      12: { x: -6, z: 0 },
      90: { x: 6, z: 0 },
    };
    const entityPos = (id: number): { x: number; z: number } | null => positions[id] ?? null;

    for (const [type, data] of Object.entries(noPositionPayloads)) {
      const src = resolveSpatial(ev(type, data), entityPos, null, noTeam);
      expect(src, `${type} could not be placed from its entity ids`).not.toBeNull();
      const mix = spatialMix(LISTENER, src!)!;
      expect(Math.abs(mix.pan), `${type} resolved to a centred position`).toBeGreaterThan(0.3);
    }
  });

  it("takes the payload x/z as authoritative over the entity position (VfxSystem rule)", () => {
    cover("audio-spatial-callsite-coverage");
    const entityPos = (): { x: number; z: number } => ({ x: 20, z: 0 });
    const src = resolveSpatial(ev("damage", { x: -4, z: 0, target: 12 }), entityPos, null, noTeam)!;
    expect(src.x).toBe(-4); // the stamped impact point wins, so audio matches the sparks
  });

  it("REJECTS a non-finite payload coordinate instead of falling through (#131)", () => {
    cover("audio-spatial-callsite-coverage");
    const entityPos = (): { x: number; z: number } => ({ x: 20, z: 0 });
    // Falling through to the entity would put the sound somewhere the VfxSystem
    // deliberately refuses to draw — the two layers must agree.
    expect(resolveSpatial(ev("damage", { x: NaN, z: 0, target: 12 }), entityPos, null, noTeam)).toBeNull();
    expect(resolveSpatial(ev("damage", { x: 0, z: Infinity, target: 12 }), entityPos, null, noTeam)).toBeNull();
    // and a non-finite REGISTRY position is rejected too
    expect(resolveSpatial(ev("basicAttack", { source: 11 }), () => ({ x: NaN, z: 0 }), null, noTeam)).toBeNull();
  });

  it("returns null for a centred event, so the caller plays it unpositioned", () => {
    cover("audio-spatial-callsite-coverage");
    for (const type of Object.keys(CENTRED_EVENTS)) {
      expect(resolveSpatial(ev(type, { x: 5, z: 5, id: 1 }), noPos, null, noTeam)).toBeNull();
    }
  });
});

describe("combatSfxSpatial relation — victim beats self beats team", () => {
  const teams: Record<number, number> = { 1: 0, 2: 0, 3: 1 };
  const teamOf = (id: number): number | null => teams[id] ?? null;

  it("marks a hit landing on YOU as victim, and YOUR OWN hit landing as self", () => {
    cover("audio-spatial-relation");
    const spec = EVENT_SPATIAL.damage!;
    // someone hits you — the top band, always cuts through
    expect(relationOf(ev("damage", { source: 3, target: 1 }), spec, 1, teamOf)).toBe("victim");
    // YOU hit someone — "self", NOT "enemy". The sound is placed on the enemy's
    // body (that is where the damage event is stamped) but it is YOUR hit
    // connecting, and confirmation of your own input is the thing the owner
    // most cannot currently pick out of a twelve-body fight. Full level.
    expect(relationOf(ev("damage", { source: 1, target: 3 }), spec, 1, teamOf)).toBe("self");
    // two strangers trading — the quiet band
    expect(relationOf(ev("damage", { source: 3, target: 2 }), spec, 1, teamOf)).toBe("ally");
    const atk = EVENT_SPATIAL.basicAttack!;
    expect(relationOf(ev("basicAttack", { source: 1, target: 3 }), atk, 1, teamOf)).toBe("self");
  });

  it("separates ally from enemy, and demotes anything unresolvable to third", () => {
    cover("audio-spatial-relation");
    const atk = EVENT_SPATIAL.basicAttack!;
    expect(relationOf(ev("basicAttack", { source: 2, target: 3 }), atk, 1, teamOf)).toBe("ally");
    expect(relationOf(ev("basicAttack", { source: 3, target: 2 }), atk, 1, teamOf)).toBe("enemy");
    // no local entity yet (pre-spawn) → third, never a guess
    expect(relationOf(ev("basicAttack", { source: 3 }), atk, null, teamOf)).toBe("third");
    // a neutral with no team (a flower) → third
    const flower = EVENT_SPATIAL.flowerBurst!;
    expect(relationOf(ev("flowerBurst", { id: 500 }), flower, 1, teamOf)).toBe("third");
  });

  it("resolves the subject in the spec's declared order", () => {
    cover("audio-spatial-relation");
    // damage belongs to the VICTIM; basicAttack belongs to the SWINGER
    expect(subjectOf(ev("damage", { source: 3, target: 1 }), EVENT_SPATIAL.damage!)).toBe(1);
    expect(subjectOf(ev("basicAttack", { source: 3, target: 1 }), EVENT_SPATIAL.basicAttack!)).toBe(3);
  });

  it("makes a hit on you louder than an identical hit between two strangers", () => {
    cover("audio-spatial-relation");
    const onMe = resolveSpatial(ev("damage", { x: 3, z: 0, source: 3, target: 1 }), noPos, 1, teamOf)!;
    // neither party is you, and neither has a resolvable team → third band
    const onThem = resolveSpatial(ev("damage", { x: 3, z: 0, source: 8, target: 9 }), noPos, 1, teamOf)!;
    const a = spatialMix(LISTENER, onMe)!;
    const b = spatialMix(LISTENER, onThem)!;
    expect(a.volume).toBeGreaterThan(b.volume);
    expect(a.priority).toBeGreaterThan(b.priority);
    // ...and neither is amplified above the authored level
    expect(a.volume).toBeLessThanOrEqual(1);
  });
});
