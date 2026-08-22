import { describe, it, expect } from "vitest";
import { MatchController } from "./MatchController";

const seats = Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

describe("回合結算後殭屍/場上物件殘留", () => {
  it("每回合的 combat 尾端 vs 下一回合 combat 開頭，場上還剩什麼", () => {
    const ctl = new MatchController("mobs", 31337, seats, {
      champSelectTicks: 5, intermissionTicks: 60, combatMaxTicks: 2400, resolutionTicks: 20,
    });
    const w = ctl.world as unknown as Record<string, Map<unknown, unknown>>;
    const count = (k: string) => (w[k] as Map<unknown, unknown> | undefined)?.size ?? -1;
    const snap = () =>
      `mob=${count("mob")} transform=${count("transform")} summon=${count("summon")} ` +
      `status=${count("status")} marks=${count("marks")} dot=${count("dot")} ` +
      `projectile=${count("projectile")} coin=${count("coin")} flower=${count("flower")} ` +
      `structure=${count("structure")} deathWard=${count("deathWard")} reviveCircle=${count("reviveCircle")}`;
    const rows: string[] = [];
    let last = "";
    let peak: Record<number, string> = {};
    let round = 0;
    for (let t = 0; t < 40000 && round < 7; t++) {
      ctl.tick();
      const p = ctl.phase.phase;
      if (p === "combat") peak[round] = snap();
      if (p !== last) {
        if (p === "combat") { round++; rows.push(`R${round} 開頭  ${snap()}`); }
        else if (last === "combat") rows.push(`R${round} 結算後 ${snap()}`);
        last = p;
      }
    }
    console.log("\n" + rows.join("\n") + "\n");
    expect(rows.length).toBeGreaterThan(4);
  }, 600000);
});
