/**
 * Revive circles — HUD + minimap surface (task #84, rev-15/rev-16).
 *
 * The rules that matter here are about WHO SEES WHAT, so they are pinned as
 * pure functions rather than DOM assertions:
 *   • the dead player must be shown their own circle (they are spectating and
 *     have no other channel for it),
 *   • an ENEMY team's circle must never surface — showing it would leak the
 *     other duel's state,
 *   • the panel claims its corner through the task #42 registry, and the
 *     per-tick numbers stay off React (client-08).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import type { ReviveCircleMarker } from "../../frameBus";
import { frameBus } from "../../frameBus";
import { pickReviveCircle, reviveHeadline } from "./ReviveBanner";
import { hudSlot, hudSlotCorner, hudSlotOrder } from "../hud/hudLayout";

const HERE = dirname(fileURLToPath(import.meta.url));

const marker = (over: Partial<ReviveCircleMarker> = {}): ReviveCircleMarker => ({
  entityId: 1,
  ownerSeatId: 0,
  teamId: 0,
  zone: 0,
  worldX: 0,
  worldZ: 0,
  radius: 2,
  progress: 0,
  secondsLeft: 6,
  lifeLeft: 1,
  channelling: false,
  contested: false,
  ...over,
});

describe("which circle the HUD shows (rev-15)", () => {
  it("shows YOUR OWN circle first — the dead player is the one who needs it", () => {
    cover("revive-hud-banner");
    const mine = marker({ entityId: 10, ownerSeatId: 2, teamId: 0 });
    const teammates = marker({ entityId: 11, ownerSeatId: 1, teamId: 0 });
    // the teammate's circle is listed first, but MINE still wins
    expect(pickReviveCircle([teammates, mine], 0, 2)).toBe(mine);
  });

  it("falls back to a teammate's circle when you are alive", () => {
    cover("revive-hud-banner");
    const teammate = marker({ entityId: 11, ownerSeatId: 1, teamId: 0 });
    expect(pickReviveCircle([teammate], 0, 5)).toBe(teammate);
  });

  it("NEVER shows an enemy team's circle (no cross-duel information leak)", () => {
    cover("revive-hud-banner");
    const enemy = marker({ entityId: 12, ownerSeatId: 7, teamId: 2, zone: 1 });
    expect(pickReviveCircle([enemy], 0, 1)).toBeNull();
    // …and with no team resolved yet, nothing is shown at all
    expect(pickReviveCircle([marker()], null, 1)).toBeNull();
    expect(pickReviveCircle([], 0, 1)).toBeNull();
  });

  it("the headline distinguishes contested / channelling / idle, and self / ally", () => {
    cover("revive-hud-banner");
    const idle = marker();
    const channelling = marker({ channelling: true });
    const contested = marker({ channelling: true, contested: true });
    const lines = [
      reviveHeadline(idle, true),
      reviveHeadline(idle, false),
      reviveHeadline(channelling, true),
      reviveHeadline(channelling, false),
      reviveHeadline(contested, true),
      reviveHeadline(contested, false),
    ];
    // all six states read differently — a player must never have to guess
    expect(new Set(lines).size).toBe(6);
    for (const l of lines) expect(l.length).toBeGreaterThan(0);
    // contest wins over "being channelled": being blocked is the louder fact
    expect(reviveHeadline(contested, true)).not.toBe(reviveHeadline(channelling, true));
  });
});

describe("HUD + minimap wiring (rev-16)", () => {
  it("the banner claims its corner through the registry, never a literal", () => {
    cover("revive-hud-banner");
    const slot = hudSlot("revive");
    expect(slot.owner).toBe("ui/components/ReviveBanner.tsx");
    expect(slot.managed).toBe(true);
    // top-left is the gameplay-chrome corner; on touch it stacks UNDER the
    // re-homed minimap instead of fighting it for order 2
    expect(hudSlotCorner("revive", false)).toBe("top-left");
    expect(hudSlotOrder("revive", true)).toBeGreaterThan(hudSlotOrder("minimap", true));

    const src = readFileSync(join(HERE, "ReviveBanner.tsx"), "utf8");
    expect(src).toMatch(/hudSlotStyle\("revive"/);
    // per-tick values must NOT ride React/Zustand (client-08): the progress and
    // the countdown are patched imperatively from the frameBus in a rAF
    expect(src).toMatch(/requestAnimationFrame/);
    expect(src).toMatch(/frameBus\.reviveCircles/);
    expect(src).not.toMatch(/useState/);
  });

  it("circles ride their OWN frameBus list, never the champion anchors", () => {
    cover("revive-hud-banner");
    // a circle has no HP bar and no name; anything walking `champions` (the
    // world-anchor layer, the minimap's champion pass) must never see one
    expect(Array.isArray(frameBus.reviveCircles)).toBe(true);
    expect(frameBus.champions instanceof Map).toBe(true);
  });

  it("the minimap draws circles UNDER the markers and is ready for #67's zone scoping", () => {
    cover("revive-hud-banner");
    const src = readFileSync(join(HERE, "../hud/Minimap.tsx"), "utf8");
    expect(src).toContain("drawReviveCircles");
    // the zone filter is a PARAMETER, so task #67 narrows the map by passing a
    // zone instead of ripping this out
    expect(src).toMatch(/onlyZone/);
    // painted before the champion loop → markers stay on top
    const drawAt = src.indexOf("drawReviveCircles(ctx");
    const markersAt = src.indexOf("for (const a of frameBus.champions.values())");
    expect(drawAt).toBeGreaterThan(0);
    expect(markersAt).toBeGreaterThan(drawAt);
  });
});
