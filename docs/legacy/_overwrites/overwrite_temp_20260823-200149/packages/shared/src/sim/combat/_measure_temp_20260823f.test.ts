import { describe, it, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { Stat } from "../stats/statTypes";
import { movementHold } from "../movementHold";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../../ids";
import type { IntentFrame } from "../intents";

beforeAll(() => registerSkeletonContent());

const Z0 = SKELETON_ARENA.zones[0]!;
const ZC = Z0.center;
const VICTIM = asSeatId(0);

describe("measure", () => {
  it("victim under sustained autos", () => {
    const w = new SimWorld(SKELETON_ARENA, 7);
    w.combatActive = true;
    // victim = seat 0 team 0
    const victim = spawnChampion(w, {
      championId: "thorne" as ChampionId,
      seatId: VICTIM, teamId: asTeamId(0), pos: { x: ZC.x, z: 14 }, zone: 0,
    });
    const attacker = spawnChampion(w, {
      championId: "sela" as ChampionId,
      seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: ZC.x + 1.2, z: 14 }, zone: 0,
    });
    const vst = w.stats.get(victim)!;
    const ast = w.stats.get(attacker)!;
    console.log("victim ms", vst.final[Stat.MoveSpeed], "atk as", ast.final[Stat.AttackSpeed], "atk ad", ast.final[Stat.AttackDamage]);
    const vhp = w.health.get(victim)!;
    let stuckTicks = 0, totalNet = 0, totalIntent = 0;
    const rows: string[] = [];
    for (let i = 0; i < 120; i++) {
      vhp.hp = vhp.maxHp; // never dies
      // attacker pinned next to victim, keeps attacking
      const vt = w.transform.get(victim)!;
      w.transform.get(attacker)!.pos = { x: vt.pos.x + 1.2, z: vt.pos.z };
      w.stats.get(attacker)!.final[Stat.MoveSpeed] = 1e-9;
      const before = { ...vt.pos };
      // victim orders: walk away in -x
      const intents = new Map<SeatId, IntentFrame>([
        [VICTIM, { order: { kind: "move", point: { x: before.x - 8, z: before.z } }, commands: [] }],
      ]);
      w.step(intents);
      const after = w.transform.get(victim)!.pos;
      const net = Math.hypot(after.x - before.x, after.z - before.z);
      const speed = w.stats.get(victim)!.final[Stat.MoveSpeed];
      const intent = speed * w.dt;
      totalNet += net; totalIntent += intent;
      const mh = movementHold(w, victim);
      const hs = w.hitstop.get(victim) ?? 0;
      const hst = w.hitstun.get(victim) ?? 0;
      const kd = w.knockdown.get(victim) ?? 0;
      const ov = w.nav.get(victim)?.override?.kind ?? "-";
      if (net < intent * 0.2) stuckTicks++;
      const dmg = w.events.filter((e) => e.type === "damage").length;
      rows.push(`t${i} net=${net.toFixed(3)} intent=${intent.toFixed(3)} hitstop=${hs} hitstun=${hst} kd=${kd} rooted=${mh.rooted} spd=${mh.speedMult.toFixed(2)} ov=${ov} dmg=${dmg}`);
    }
    console.log(rows.slice(0, 60).join("\n"));
    console.log(`NET=${totalNet.toFixed(2)} INTENT=${totalIntent.toFixed(2)} ratio=${(totalNet/totalIntent).toFixed(3)} stuckTicks=${stuckTicks}/120`);
  });
});
