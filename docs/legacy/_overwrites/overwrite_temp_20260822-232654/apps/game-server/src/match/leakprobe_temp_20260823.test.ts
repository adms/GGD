import { describe, it, expect } from "vitest";
import { MatchController } from "./MatchController";

const seats = Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

describe("跨回合殘留量測", () => {
  it("每個回合邊界之後，sim 世界上還活著多少東西", () => {
    const ctl = new MatchController("leak", 777, seats, {
      champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 400, resolutionTicks: 5,
    });
    const w = ctl.world as unknown as Record<string, { size?: number }>;
    const keys = Object.keys(w).filter((k) => {
      const v = w[k] as { size?: number } | undefined;
      return v && typeof v === "object" && typeof v.size === "number";
    });
    const rows: string[] = [];
    let round = 0;
    let lastPhase = "";
    for (let t = 0; t < 12000 && round < 7; t++) {
      ctl.tick();
      const p = ctl.phase.phase;
      if (p !== lastPhase) {
        if (p === "combat") {
          round++;
          const snap = keys.map((k) => `${k}=${(w[k] as { size: number }).size}`).join(" ");
          rows.push(`R${round}  ${snap}`);
        }
        lastPhase = p;
      }
    }
    console.log("\n" + rows.join("\n") + "\n");
    expect(rows.length).toBeGreaterThan(2);
  }, 300000);
});
