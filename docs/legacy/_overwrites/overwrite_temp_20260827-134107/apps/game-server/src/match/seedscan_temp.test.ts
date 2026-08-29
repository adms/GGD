/** TEMP — GH#755 seed 重掃（跑完就刪）。⛔ 不要 commit。 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "vitest";
import { Configs } from "@ggd/shared/content";
import { MatchController, type SeatSpec } from "./MatchController";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));
const HERE = dirname(fileURLToPath(import.meta.url));
const SHIPPED = JSON.parse(
  readFileSync(join(HERE, "../../../../content/config/config.match.json"), "utf8"),
) as Record<string, unknown>;
const doc = (on: boolean): Record<string, unknown> => ({
  ...SHIPPED,
  match: { ...(SHIPPED.match as Record<string, unknown>), settlementCardOnHealthSpent: on },
});

it(
  "scan",
  () => {
    const hits: number[] = [];
    let anySpent = 0;
    for (let seed = 4200; seed < 4400; seed++) {
      Configs.register(doc(false) as never);
      const ctl = new MatchController("elim1", seed, allBots(), FAST);
      const spent = new Set<number>();
      let n = 0;
      while (ctl.phase.phase !== "matchEnd" && n < 60000) {
        ctl.tick();
        for (const [teamId, hp] of ctl.lives) if (hp <= 0) spent.add(teamId as number);
        ctl.takeEliminationSettlements();
        n++;
      }
      if (ctl.phase.phase !== "matchEnd") continue;
      if (spent.size > 0) anySpent++;
      const winner = [...ctl.placements.entries()].find(([, v]) => v === 1)![0] as number;
      if (spent.has(winner)) hits.push(seed);
    }
    console.log(`SCAN 4200-4399: 有隊伍歸零 ${anySpent}/200；冠軍本人也歸零 ${hits.length} 個`);
    console.log(`SCAN first8=${hits.slice(0, 8).join(" / ")}`);
  },
  900_000,
);
