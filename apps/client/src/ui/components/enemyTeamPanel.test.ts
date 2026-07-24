/**
 * enemy-team-panel: the top-left panel that shows the local player's CURRENT
 * DUEL opponents. The rules that matter are about WHICH three seats are the
 * enemies (never your own team, only the duel you're in, dead ones kept), so
 * they are pinned as pure functions rather than DOM assertions — plus a check
 * that the panel claims its corner through the task #42 registry.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import type { SeatView } from "../../net/RoomStore";
import { selectDuelEnemies } from "./EnemyTeamPanel";
import { hudSlot, hudSlotCorner, hudSlotOrder } from "../hud/hudLayout";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Minimal SeatView; overrides win. Vitals default to a healthy, spawned champ. */
function mk(over: Partial<SeatView> & { seatId: number; teamId: number }): SeatView {
  return {
    displayName: `p${over.seatId}`,
    connected: true,
    driver: "human",
    championId: "champ.sela",
    entityId: 100 + over.seatId,
    level: 3,
    gold: 0,
    xp: 0,
    hp: 600,
    maxHp: 600,
    mana: 200,
    maxMana: 200,
    shield: 0,
    alive: true,
    zone: 0,
    ready: false,
    unspentPoints: 0,
    items: [],
    augments: [],
    abilityRanks: [1, 0, 0, 0],
    cooldowns: [0, 0, 0, 0],
    exAbilityId: "",
    exRank: 0,
    exCooldown: 0,
    statStacks: 0,
    statCapstonePct: 0,
    undoDepth: 0,
    roundKills: 0,
    roundDeaths: 0,
    offers: [],
    ...over,
  };
}

describe("selectDuelEnemies (enemy-team-panel)", () => {
  it("excludes the local team and returns the three opposing seats", () => {
    cover("enemy-team-panel");
    const seats = [
      mk({ seatId: 0, teamId: 0 }), // local
      mk({ seatId: 1, teamId: 0 }),
      mk({ seatId: 2, teamId: 0 }),
      mk({ seatId: 3, teamId: 1 }),
      mk({ seatId: 4, teamId: 1 }),
      mk({ seatId: 5, teamId: 1 }),
    ];
    const enemies = selectDuelEnemies(seats, 0);
    expect(enemies.map((s) => s.seatId)).toEqual([3, 4, 5]);
    // none of them is on the local team
    expect(enemies.every((s) => s.teamId !== 0)).toBe(true);
  });

  it("shows only the enemies IN THE LOCAL DUEL ZONE (PairedDuels, 4 teams)", () => {
    cover("enemy-team-panel");
    // round with two simultaneous duels: local (team 0) fights team 1 in zone 0;
    // teams 2 & 3 fight in zone 1 and must never surface (cross-duel leak).
    const seats = [
      mk({ seatId: 0, teamId: 0, zone: 0 }), // local
      mk({ seatId: 1, teamId: 0, zone: 0 }),
      mk({ seatId: 2, teamId: 0, zone: 0 }),
      mk({ seatId: 3, teamId: 1, zone: 0 }), // our duel
      mk({ seatId: 4, teamId: 1, zone: 0 }),
      mk({ seatId: 5, teamId: 1, zone: 0 }),
      mk({ seatId: 6, teamId: 2, zone: 1 }), // the OTHER duel
      mk({ seatId: 7, teamId: 3, zone: 1 }),
    ];
    expect(selectDuelEnemies(seats, 0).map((s) => s.seatId)).toEqual([3, 4, 5]);
  });

  it("keeps a DEAD enemy in the list (greyed row, not a dropped seat)", () => {
    cover("enemy-team-panel");
    const seats = [
      mk({ seatId: 0, teamId: 0 }),
      mk({ seatId: 3, teamId: 1, alive: false, hp: 0 }),
      mk({ seatId: 4, teamId: 1 }),
      mk({ seatId: 5, teamId: 1 }),
    ];
    const enemies = selectDuelEnemies(seats, 0);
    expect(enemies.map((s) => s.seatId)).toEqual([3, 4, 5]);
    expect(enemies.find((s) => s.seatId === 3)!.alive).toBe(false);
  });

  it("2-team match: a single opposing team is the whole duel", () => {
    cover("enemy-team-panel");
    const seats = [
      mk({ seatId: 0, teamId: 0 }),
      mk({ seatId: 1, teamId: 0 }),
      mk({ seatId: 2, teamId: 1 }),
      mk({ seatId: 3, teamId: 1 }),
    ];
    expect(selectDuelEnemies(seats, 0).map((s) => s.seatId)).toEqual([2, 3]);
  });

  it("ignores seats without a spawned entity (entityId 0)", () => {
    cover("enemy-team-panel");
    const seats = [
      mk({ seatId: 0, teamId: 0 }),
      mk({ seatId: 3, teamId: 1, entityId: 0 }), // not spawned → excluded
      mk({ seatId: 4, teamId: 1 }),
      mk({ seatId: 5, teamId: 1 }),
    ];
    expect(selectDuelEnemies(seats, 0).map((s) => s.seatId)).toEqual([4, 5]);
  });

  it("returns nothing when the local seat is unknown, or the duel is unresolved", () => {
    cover("enemy-team-panel");
    const seats = [mk({ seatId: 0, teamId: 0 }), mk({ seatId: 3, teamId: 1 })];
    expect(selectDuelEnemies(seats, null)).toEqual([]);
    expect(selectDuelEnemies(seats, 9)).toEqual([]); // no such local seat
    // local not spawned (zone -1) AND more than one opposing team → ambiguous
    const preSpawn = [
      mk({ seatId: 0, teamId: 0, zone: -1, entityId: 0 }),
      mk({ seatId: 3, teamId: 1, zone: -1 }),
      mk({ seatId: 6, teamId: 2, zone: -1 }),
    ];
    expect(selectDuelEnemies(preSpawn, 0)).toEqual([]);
  });
});

describe("enemy-team-panel HUD wiring", () => {
  it("claims its corner through the registry, never a literal", () => {
    cover("enemy-team-panel");
    const slot = hudSlot("enemy-team");
    expect(slot.owner).toBe("ui/components/EnemyTeamPanel.tsx");
    expect(slot.managed).toBe(true);
    // top-left is the gameplay-chrome corner (the requested 左上角); it stacks
    // below the team-lives / revive group and re-homed minimap on touch.
    expect(hudSlotCorner("enemy-team", false)).toBe("top-left");
    expect(hudSlotCorner("enemy-team", true)).toBe("top-left");
    expect(hudSlotOrder("enemy-team", false)).toBeGreaterThan(hudSlotOrder("revive", false));
    // covered by the left-docked shop → yields by hiding (task #107)
    expect(slot.displaced).toBe("hide");

    const src = readFileSync(join(HERE, "EnemyTeamPanel.tsx"), "utf8");
    expect(src).toMatch(/hudSlotStyle\("enemy-team"/);
    // combat-only, and it defers to the shop-cover guard rather than pinning
    expect(src).toMatch(/phase !== "combat"/);
    expect(src).toMatch(/useHudSlotHidden/);
  });
});
