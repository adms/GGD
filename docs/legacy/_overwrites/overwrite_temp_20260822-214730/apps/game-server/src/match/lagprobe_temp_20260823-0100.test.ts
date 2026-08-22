import { describe, it, beforeAll } from "vitest";
import { join } from "node:path";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { CONTENT } from "../testkit/contentFixtures";
import { MatchController, type SeatSpec } from "./MatchController";
import { resolveArenaRules } from "./arenaRules";

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

function sizes(w: any): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(w)) {
    const v = (w as any)[k];
    if (v instanceof Map || v instanceof Set) { if (v.size > 0) out[k] = v.size; }
    else if (Array.isArray(v)) { if (v.length > 0) out[k] = v.length; }
  }
  return out;
}

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
}, 120_000);

describe("lag probe (real content + shipped rules)", () => {
  it("multi-round", () => {
    const rules = resolveArenaRules();
    console.log("mobWaves armed:", rules.mobWaves !== null, "rogueliteMobs:", rules.rogueliteMobs);
    const ctl = new MatchController("lag-probe", 4242, allBots(), undefined, undefined, rules);
    const w: any = ctl.world;
    let round = -1, phase = "";
    const perTick: number[] = [];
    let peakDelayed = 0, peakEvents = 0, peakMobs = 0;
    const rows: string[] = [];
    for (let n = 0; n < 400_000 && ctl.phase.phase !== "matchEnd"; n++) {
      const t0 = process.hrtime.bigint();
      ctl.tick();
      perTick.push(Number(process.hrtime.bigint() - t0) / 1e6);
      peakDelayed = Math.max(peakDelayed, w.delayed.length);
      peakEvents = Math.max(peakEvents, w.events.length);
      peakMobs = Math.max(peakMobs, w.mob.size);
      const p = ctl.phase.phase, r = ctl.phase.round;
      if (p !== phase || r !== round) {
        const s = [...perTick].sort((a, b) => a - b);
        const q = (f: number) => (s[Math.floor(s.length * f)] ?? 0).toFixed(3);
        const sum = s.reduce((a, b) => a + b, 0);
        rows.push(
          `R${r} ${phase}->${p} n=${perTick.length} p50=${q(0.5)} p99=${q(0.99)} max=${(s[s.length-1]??0).toFixed(2)} sum=${sum.toFixed(0)}ms ` +
          `peak{delayed=${peakDelayed} ev=${peakEvents} mob=${peakMobs}} ents=${w.transform.size} | ${JSON.stringify(sizes(w))}`,
        );
        perTick.length = 0; peakDelayed = 0; peakEvents = 0; peakMobs = 0;
        phase = p; round = r;
      }
    }
    console.log(rows.join("\n"));
    console.log("END", ctl.phase.phase, ctl.phase.round);
  }, 900_000);
});
