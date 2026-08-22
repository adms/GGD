import { describe, it, beforeAll } from "vitest";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { CONTENT } from "../testkit/contentFixtures";
import { MatchController, type SeatSpec } from "./MatchController";
import { resolveArenaRules } from "./arenaRules";

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
}, 120_000);

interface Row { round: number; ticks: number; ms: number; msPerTick: number; p99: number;
  qtick: number; maxDelayed: number; leftoverAtStart: number; mobTick: number; maxMob: number;
  entsEnd: number; storeBytes: number; }

function storeTotal(w: any): number {
  let n = 0;
  for (const k of Object.keys(w)) {
    const v = w[k];
    if (v instanceof Map || v instanceof Set) n += v.size;
    else if (Array.isArray(v)) n += v.length;
  }
  return n;
}

function run(seed: number): Row[] {
  const ctl = new MatchController(`lag-${seed}`, seed, allBots(), undefined, undefined, resolveArenaRules());
  const w: any = ctl.world;
  const rows: Row[] = [];
  let round = 0, combat = false;
  let ticks = 0, ms = 0, qtick = 0, maxDelayed = 0, mobTick = 0, maxMob = 0, leftover = 0;
  const samples: number[] = [];
  const flush = (): void => {
    if (ticks === 0) return;
    const s = [...samples].sort((a, b) => a - b);
    rows.push({ round, ticks, ms, msPerTick: ms / ticks, p99: s[Math.floor(s.length * 0.99)] ?? 0,
      qtick, maxDelayed, leftoverAtStart: leftover, mobTick, maxMob, entsEnd: w.transform.size,
      storeBytes: storeTotal(w) });
    ticks = 0; ms = 0; qtick = 0; maxDelayed = 0; mobTick = 0; maxMob = 0; samples.length = 0;
  };
  for (let n = 0; n < 400_000 && ctl.phase.phase !== "matchEnd"; n++) {
    const inCombat = ctl.phase.phase === "combat";
    if (inCombat && !combat) { flush(); round = ctl.phase.round; leftover = w.delayed.length; }
    combat = inCombat;
    const t0 = process.hrtime.bigint();
    ctl.tick();
    const dt = Number(process.hrtime.bigint() - t0) / 1e6;
    if (inCombat) {
      ticks++; ms += dt; samples.push(dt);
      qtick += w.delayed.length; maxDelayed = Math.max(maxDelayed, w.delayed.length);
      mobTick += w.mob.size; maxMob = Math.max(maxMob, w.mob.size);
    }
  }
  flush();
  return rows;
}

describe("lag probe v2", () => {
  it("multi-seed multi-round", () => {
    for (const seed of [4242, 7, 99991]) {
      const rows = run(seed);
      console.log(`\n=== seed ${seed} ===`);
      for (const r of rows) {
        console.log(
          `R${r.round} ticks=${r.ticks} ms/tick=${r.msPerTick.toFixed(3)} p99=${r.p99.toFixed(3)} ` +
          `qtick=${r.qtick} maxDelayed=${r.maxDelayed} leftover@start=${r.leftoverAtStart} ` +
          `mobAvg=${(r.mobTick / r.ticks).toFixed(1)} maxMob=${r.maxMob} ents=${r.entsEnd} storeSum=${r.storeBytes}`,
        );
      }
    }
  }, 900_000);
});
