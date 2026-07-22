import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { zArenaDoc, type ArenaDoc } from "@ggd/shared/content";
import { Arenas } from "@ggd/shared/content";
import { SKELETON_ARENA, arenaDefFromDoc } from "@ggd/shared/sim/world/ArenaDef";
import { MatchController, type SeatSpec } from "./MatchController";
import { resolveArena } from "./arenaSelect";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const loadArena = (id: string): ArenaDoc =>
  zArenaDoc.parse(JSON.parse(readFileSync(join(CONTENT, "arenas", `${id}.json`), "utf8")));

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

function runToEnd(ctl: MatchController, maxTicks = 60000): number {
  let n = 0;
  while (ctl.phase.phase !== "matchEnd" && n < maxTicks) {
    ctl.tick();
    n++;
  }
  return n;
}

describe("arena selection (arena-map-select)", () => {
  it("resolves a registered mapId to that arena's geometry", () => {
    cover("arena-select-mapid");
    for (const id of ["arena.castle", "arena.colosseum", "arena.dota"]) {
      Arenas.register(loadArena(id));
      const def = resolveArena(id);
      expect(def.id).toBe(id);
      expect(def.zones).toHaveLength(2);
      // every obstacle sits inside its zone boundary (collision truth)
      for (const zone of def.zones) {
        for (const ob of zone.obstacles) {
          if (ob.kind === "circle") {
            const d = Math.hypot(ob.center.x - zone.center.x, ob.center.z - zone.center.z);
            expect(d + ob.radius).toBeLessThanOrEqual(zone.boundaryRadius + 1e-6);
          }
        }
      }
    }
  });

  it("falls back to the skeleton arena for absent/unknown ids", () => {
    cover("arena-default-fallback");
    expect(resolveArena(undefined).id).toBe(SKELETON_ARENA.id);
    expect(resolveArena("").id).toBe(SKELETON_ARENA.id);
    expect(resolveArena("arena.does-not-exist").id).toBe(SKELETON_ARENA.id);
    expect(resolveArena("arena.skeleton")).toBe(SKELETON_ARENA);
  });
});

describe("bot match on each themed arena (arena-map-play)", () => {
  for (const id of ["arena.castle", "arena.colosseum", "arena.dota"] as const) {
    it(`12 bots run to matchEnd on ${id}`, () => {
      cover(`arena-play-${id.replace("arena.", "")}`);
      const arena = arenaDefFromDoc(loadArena(id));
      const ctl = new MatchController(`m-${id}`, 4242, allBots(), FAST, 3, undefined, arena);
      expect(ctl.arena.id).toBe(id);
      const ticks = runToEnd(ctl);
      expect(ctl.phase.phase).toBe("matchEnd");
      expect(ticks).toBeLessThan(60000);
      expect(ctl.result).not.toBeNull();
      expect(ctl.result!.teams.map((t) => t.placement).sort()).toEqual([1, 2, 3, 4]);
    });
  }
});
