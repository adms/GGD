/**
 * TEMP MEASUREMENT (GH#973) — 跑真的比賽,量每一個結算欄位的分佈。
 * ⛔ 不是守衛,量完就刪。
 */
import { describe, it, expect } from "vitest";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { asSeatId } from "@ggd/shared/ids";
import { createMatchStats, type PlayerMatchStats } from "@ggd/shared/sim/stats/matchStats";
import { readFileSync } from "node:fs";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1800, resolutionTicks: 5 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

const shipped = JSON.parse(
  readFileSync(new URL("../../../../content/config/arena-rules.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

function rules(): ArenaRules {
  return {
    ...DEFAULT_ARENA_RULES,
    /* eslint-disable @typescript-eslint/no-explicit-any */
    guardianTower: shipped.guardianTower as any,
    mobWaves: shipped.mobWaves as any,
    flowers: shipped.flowers as any,
    reviveCircles: shipped.reviveCircles as any,
    goldDrop: shipped.goldDrop as any,
    /* eslint-enable @typescript-eslint/no-explicit-any */
    rogueliteMobs: true,
  };
}

describe("GH#973 settlement field census", () => {
  it("dumps the distribution of every settlement stat over real matches", () => {
    const keys = Object.keys(createMatchStats()) as (keyof PlayerMatchStats)[];
    const nonZero = new Map<string, number>();
    const total = new Map<string, number>();
    let rows = 0;
    let mobKillsNonZero = 0;
    let mobKillsTotal = 0;
    let sumMatched = 0;
    let sumChecked = 0;
    const mismatches: string[] = [];

    for (const seed of [4242, 7, 99]) {
      const ctl = new MatchController(`m973-${seed}`, seed, allBots(), FAST, 3, rules(), SKELETON_ARENA);
      const pool = ctl.randomChampionPool();
      for (let i = 0; i < 12; i++) ctl.selectChampion(asSeatId(i), pool[i % pool.length]!);
      for (let n = 0; n < 600_000 && ctl.phase.phase !== "matchEnd"; n++) ctl.tick();
      expect(ctl.phase.phase, `match ${seed} must finish`).toBe("matchEnd");

      const st = ctl.settlement!;
      for (const seat of ctl.seats.values()) {
        if (seat.entityId === null || seat.entityId === undefined) continue;
        const s = ctl.world.matchStats.get(seat.entityId);
        if (!s) continue;
        rows++;
        for (const k of keys) {
          const v = s[k] as number;
          total.set(k, (total.get(k) ?? 0) + v);
          if (v !== 0) nonZero.set(k, (nonZero.get(k) ?? 0) + 1);
        }
        const mk = ctl.world.mobKills.get(seat.entityId) ?? 0;
        mobKillsTotal += mk;
        if (mk !== 0) mobKillsNonZero++;
        // ⭐ THE IDENTITY: Σ per-round deltas on the wire === server cumulative
        const wire = (st.rounds ?? []).reduce(
          (acc, r) => acc + (r.players.find((p) => p.seatId === seat.seatId)?.mobKills ?? 0),
          0,
        );
        sumChecked++;
        if (wire === mk) sumMatched++;
        else mismatches.push(`seed=${seed} seat=${seat.seatId} wire=${wire} world=${mk}`);
      }
      // eslint-disable-next-line no-console
      console.log(
        `[census] seed=${seed} rounds=${ctl.phase.round} roundsOnWire=${(st.rounds ?? []).length} structures=${ctl.world.structure.size}`,
      );
    }

    const lines: string[] = [`rows=${rows}`];
    for (const k of keys) {
      lines.push(
        `${k.padEnd(20)} nonZero=${String(nonZero.get(k) ?? 0).padStart(3)}/${rows}  Σ=${(total.get(k) ?? 0).toFixed(1)}`,
      );
    }
    lines.push(`${"mobKills(world)".padEnd(20)} nonZero=${String(mobKillsNonZero).padStart(3)}/${rows}  Σ=${mobKillsTotal}`);
    lines.push(`Σ(wire round deltas) === world.mobKills : ${sumMatched}/${sumChecked}`);
    for (const m of mismatches.slice(0, 12)) lines.push(`  MISMATCH ${m}`);
    // eslint-disable-next-line no-console
    console.log("\n===CENSUS===\n" + lines.join("\n") + "\n===END===");
    expect(rows).toBeGreaterThan(0);
  }, 600_000);
});
