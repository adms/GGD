/**
 * clearWorldAnchors — the world-overlay half of task #216.
 *
 * PLAYTEST REPORT: 「回到商店時…並且看得到戰場上的血條」.
 *
 * The world-anchored layer (HP bars, names, cast bars, revive rings, floating
 * damage numbers) is DOM painted at PROJECTED WORLD POSITIONS, so it only means
 * anything while the arena canvas underneath it is being drawn. The
 * intermission/shop scene suppresses that draw
 * (`hudActions.setArenaRenderSuppressed`) — but `GameApp` kept publishing this
 * bus every frame regardless, leaving battle bars floating over the shop with
 * nothing behind them. The render loop now runs both off the SAME switch:
 * no arena render ⇒ `clearWorldAnchors()`.
 *
 * `WorldAnchorLayer`'s rAF drops a champion's node the moment its anchor leaves
 * `frameBus.champions` and skips any combat-text slot that is not `active`, so
 * emptying the bus IS the teardown — which is what this file pins.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  frameBus,
  clearWorldAnchors,
  pushCombatText,
  setCombatTextScope,
  setDamageNumberCap,
  type ChampionAnchor,
  type CombatTextInput,
  type ReviveCircleMarker,
} from "./frameBus";

const anchor = (id: number): ChampionAnchor =>
  ({
    entityId: id,
    pose: { sx: 100, sy: 100, visible: true },
    alive: true,
    hpPct: 0.42,
  }) as unknown as ChampionAnchor;

const reviveCircle = (): ReviveCircleMarker =>
  ({
    pose: { sx: 10, sy: 10, visible: true },
    progress: 0.5,
  }) as unknown as ReviveCircleMarker;

const hit: CombatTextInput = {
  kind: "damage",
  amount: 40,
  sourceRel: "enemy",
  targetRel: "self",
  crit: false,
  blocked: false,
  killingBlow: false,
  targetId: 1,
  worldX: 0,
  worldZ: 0,
  nowMs: 1000,
};

/** Populate the bus the way a live combat frame does. */
function paintCombatFrame(): void {
  frameBus.champions.set(1, anchor(1));
  frameBus.champions.set(2, anchor(2));
  frameBus.reviveCircles.push(reviveCircle());
  frameBus.localCast = { slot: "q", startedMs: 0, endsMs: 500 } as never;
  pushCombatText(hit);
}

beforeEach(() => {
  setCombatTextScope("team");
  setDamageNumberCap(48);
  clearWorldAnchors();
  frameBus.project = (x, y, z) => ({ sx: x + z, sy: y, visible: true });
  frameBus.arenaZones = [{ center: { x: 0, z: 0 }, radius: 24 } as never];
  frameBus.arenaId = "arena.test";
});

describe("world-anchor teardown (world-anchor-teardown, task #216)", () => {
  it("drops every bar, ring, cast bar and floating number", () => {
    cover("world-anchor-teardown");
    paintCombatFrame();
    expect(frameBus.champions.size).toBe(2);
    expect(frameBus.reviveCircles.length).toBe(1);
    expect(frameBus.localCast).not.toBeNull();
    expect(frameBus.combatText.filter((e) => e.active).length).toBe(1);

    clearWorldAnchors(); // the arena stopped rendering (shop mounted)

    // 沒有戰場上的血條 — and nothing else world-anchored either
    expect(frameBus.champions.size).toBe(0);
    expect(frameBus.reviveCircles.length).toBe(0);
    expect(frameBus.localCast).toBeNull();
    expect(frameBus.combatText.filter((e) => e.active).length).toBe(0);
  });

  it("KEEPS the arena's description — the projection, zones and camera", () => {
    cover("world-anchor-teardown");
    // These are not per-frame combat state; wiping them would cost the minimap
    // its terrain and give combat one blank frame on re-entry.
    paintCombatFrame();
    const project = frameBus.project;
    clearWorldAnchors();
    expect(frameBus.project).toBe(project);
    expect(frameBus.arenaZones).not.toBeNull();
    expect(frameBus.arenaId).toBe("arena.test");
  });

  it("is idempotent — every suppressed frame calls it again", () => {
    cover("world-anchor-teardown");
    paintCombatFrame();
    clearWorldAnchors();
    expect(() => {
      for (let i = 0; i < 5; i++) clearWorldAnchors();
    }).not.toThrow();
    expect(frameBus.champions.size).toBe(0);
    // …and the combat-text POOL is never resized by it (fixed-length store)
    expect(frameBus.combatText.length).toBeGreaterThan(0);
  });

  it("does not wedge the bus: a later combat frame repopulates normally", () => {
    cover("world-anchor-teardown");
    paintCombatFrame();
    clearWorldAnchors();
    paintCombatFrame(); // back in combat, arena rendering again
    expect(frameBus.champions.size).toBe(2);
    expect(frameBus.combatText.filter((e) => e.active).length).toBe(1);
  });
});
