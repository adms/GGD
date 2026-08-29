/** TEMP probe for GH#760 — deleted after the numbers are recorded. */
import { describe, it } from "vitest";
import { Encoder } from "@colyseus/schema";
import { MatchState } from "@ggd/shared/protocol/schema";
import { MatchController } from "../match/MatchController";
import { projectSnapshot } from "./snapshot";
import { spawnMob, type MobRules } from "@ggd/shared/sim/mobs";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 900, resolutionTicks: 5 };

describe("GH#760 probe", () => {
  it("measures snapshot size", () => {
    const ctl = new MatchController(
      "census",
      42,
      Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true })),
      FAST,
    );
    let guard = 0;
    while (ctl.phase.phase !== "combat" && guard++ < 20000) ctl.tick();

    const state = new MatchState();
    const encoder = new Encoder(state);
    const rows: string[] = [];
    for (const target of [300, 1500, 3000, 5000, 7000, 9000, 12000]) {
      while (ctl.world.tick < target && guard++ < 60000) ctl.tick();
      projectSnapshot(ctl, state, new Map());
      const full = encoder.encodeAll();
      const byZone = new Map<number, number>();
      let mobs = 0;
      let champs = 0;
      state.entities.forEach((e) => {
        byZone.set(e.zone, (byZone.get(e.zone) ?? 0) + 1);
        if (e.kind === 0) champs++;
        else mobs++;
      });
      const zones = [...byZone.entries()].sort((a, b) => a[0] - b[0]);
      const maxZone = Math.max(...zones.map((z) => z[1]), 0);
      rows.push(
        `[量到] tick=${ctl.world.tick} round=${ctl.phase.round} phase=${ctl.phase.phase} entities=${state.entities.size} ` +
          `(champ=${champs} other=${mobs}) worldTransforms=${ctl.world.transform.size} ` +
          `auraCarrier=${ctl.world.auraCarrier.size} bytes=${full.byteLength} ` +
          `zones=${zones.map(([z, n]) => `${z}:${n}`).join(",")} ` +
          `maxOneZone=${maxZone} 非本zone比例=${(1 - maxZone / Math.max(1, state.entities.size)).toFixed(3)}`,
      );
    }
    // ── 負載掃描：每多一隻小怪,快照多幾個位元組? ──────────────────────────
    const RULES: MobRules = { ...ctl.world.mobRules, maxAlivePerZone: 100000, special: null };
    let spawned = 0;
    for (const n of [0, 50, 100, 200, 400, 800]) {
      while (spawned < n) { spawnMob(ctl.world, spawned % 2, RULES, 1, 0); spawned++; }
      projectSnapshot(ctl, state, new Map());
      const b = encoder.encodeAll().byteLength;
      rows.push(`[量到] mobs=${spawned} entities=${state.entities.size} bytes=${b} bytes/entity=${(b / Math.max(1, state.entities.size)).toFixed(1)}`);
    }
    for (const r of rows) console.log(r);
  }, 300_000);
});
