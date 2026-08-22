import { describe, it } from "vitest";
import { MatchController, type SeatSpec } from "./MatchController";

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

function mapSizes(w: any): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(w)) {
    const v = (w as any)[k];
    if (v instanceof Map || v instanceof Set) { if (v.size > 0) out[k] = v.size; }
    else if (Array.isArray(v)) { if (v.length > 0) out[k] = v.length; }
  }
  return out;
}

describe("lag probe", () => {
  it("multi-round", () => {
    const ctl = new MatchController("lag-probe", 4242, allBots());
    const w: any = ctl.world;
    let round = -1;
    let phase = "";
    const perTick: number[] = [];
    const rows: string[] = [];
    let lastEntities = 0;
    for (let n = 0; n < 400_000 && ctl.phase.phase !== "matchEnd"; n++) {
      const t0 = process.hrtime.bigint();
      ctl.tick();
      const dt = Number(process.hrtime.bigint() - t0) / 1e6;
      perTick.push(dt);
      const p = ctl.phase.phase;
      const r = ctl.phase.round;
      if (p !== phase || r !== round) {
        const s = [...perTick].sort((a, b) => a - b);
        const p50 = s[Math.floor(s.length * 0.5)] ?? 0;
        const p99 = s[Math.floor(s.length * 0.99)] ?? 0;
        const sum = s.reduce((a, b) => a + b, 0);
        rows.push(
          `R${r} ${phase}->${p} ticks=${perTick.length} p50=${p50.toFixed(3)} p99=${p99.toFixed(3)} sum=${sum.toFixed(0)}ms ` +
          `ents=${w.transform.size} | ${JSON.stringify(mapSizes(w))}`,
        );
        perTick.length = 0;
        phase = p; round = r;
      }
    }
    console.log(rows.join("\n"));
    console.log("END phase=", ctl.phase.phase, "round=", ctl.phase.round);
  }, 600_000);
});
