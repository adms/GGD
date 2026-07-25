import { describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeCombatEnv } from "@ggd/shared/sim/combatEnv";
import type { FireRingConfig } from "@ggd/shared/content";
import { MatchController, type SeatSpec } from "./MatchController";

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

describe("measure", () => {
  it("median round length", () => {
    const doc = JSON.parse(
      readFileSync(join(__dirname, "../../../../content/config/config.match.json"), "utf8"),
    ) as { match: { fireRing: FireRingConfig; combatMaxSec: number } };
    const fr = doc.match.fireRing;
    const env = normalizeCombatEnv(
      JSON.parse(readFileSync(join(__dirname, "../../../../content/config/combat-env.json"), "utf8")).multipliers ??
        {},
    );
    const lens: number[] = [];
    for (let seed = 1; seed <= 9; seed++) {
      const cfg = {
        champSelectTicks: 2,
        intermissionTicks: 3,
        combatMaxTicks: doc.match.combatMaxSec * 30,
        resolutionTicks: 3,
      };
      const ctl = new MatchController("m" + seed, seed * 7919, allBots(), cfg, undefined, undefined, undefined, undefined, env, fr);
      while (ctl.phase.phase !== "combat") ctl.tick();
      const t0 = ctl.world.tick;
      let g = 0;
      while (ctl.phase.phase === "combat" && g++ < 20000) ctl.tick();
      lens.push((ctl.world.tick - t0) / 30);
    }
    lens.sort((a, b) => a - b);
    console.log("ROUND LENGTHS", lens.map((x) => x.toFixed(1)).join(" "), "median", lens[4]);
  }, 300000);
});
