import { describe, it, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { Stat } from "../stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../../ids";
import type { IntentFrame } from "../intents";

beforeAll(() => registerSkeletonContent());
const Z0 = SKELETON_ARENA.zones[0]!;
const ZC = Z0.center;
const VICTIM = asSeatId(0);

/** victim walks straight -x; attackers chase (real orders, real collision). */
function scenario(name: string, n: number, as: number, ad: number, chaserSpeedMult: number): void {
  const w = new SimWorld(SKELETON_ARENA, 7);
  w.combatActive = true;
  const victim = spawnChampion(w, {
    championId: "thorne" as ChampionId, seatId: VICTIM, teamId: asTeamId(0),
    pos: { x: ZC.x + 10, z: ZC.z }, zone: 0,
  });
  const vSpeed = w.stats.get(victim)!.final[Stat.MoveSpeed];
  const atks: EntityId[] = [];
  for (let k = 0; k < n; k++) {
    atks.push(spawnChampion(w, {
      championId: "sela" as ChampionId, seatId: asSeatId(1 + k), teamId: asTeamId(1),
      pos: { x: ZC.x + 11.4 + k * 0.9, z: ZC.z + (k % 2 === 0 ? 0.4 : -0.4) * k }, zone: 0,
    }));
  }
  const vhp = w.health.get(victim)!;
  let net = 0, intent = 0, stuck = 0, hs = 0, kd = 0, ov = 0, hits = 0;
  const T = 100;
  for (let i = 0; i < T; i++) {
    vhp.hp = vhp.maxHp;
    const vt = w.transform.get(victim)!;
    const before = { ...vt.pos };
    const im = new Map<SeatId, IntentFrame>();
    im.set(VICTIM, { order: { kind: "move", point: { x: ZC.x - 14, z: ZC.z } }, commands: [] });
    atks.forEach((a, k) => {
      const st = w.stats.get(a)!;
      st.final[Stat.AttackSpeed] = as; st.final[Stat.AttackDamage] = ad;
      st.final[Stat.MoveSpeed] = vSpeed * chaserSpeedMult;
      im.set(asSeatId(1 + k), { order: { kind: "move", point: { x: before.x, z: before.z } }, commands: [] });
    });
    w.step(im);
    const after = w.transform.get(victim)!.pos;
    const d = Math.hypot(after.x - before.x, after.z - before.z);
    const want = w.stats.get(victim)!.final[Stat.MoveSpeed] * w.dt;
    net += d; intent += want;
    if (d < want * 0.2) stuck++;
    if ((w.hitstop.get(victim) ?? 0) > 0) hs++;
    if ((w.knockdown.get(victim) ?? 0) > 0) kd++;
    if (w.nav.get(victim)?.override) ov++;
    hits += w.events.filter((e) => e.type === "damage" && (e.data as {target?:EntityId}).target === victim).length;
  }
  console.log(`[${name}] n=${n} as=${as} ad=${ad} chase×${chaserSpeedMult} :: net/intent=${(net/intent).toFixed(3)} stuck=${stuck}/${T} hitstopT=${hs} kdT=${kd} ovT=${ov} hits=${hits}`);
}

describe("measure", () => {
  it("scenarios", () => {
    scenario("solo control (no attacker)", 0, 0.571, 73, 1);
    scenario("1 chaser same speed", 1, 0.571, 73, 1);
    scenario("1 chaser faster", 1, 0.571, 73, 1.3);
    scenario("3 chasers faster", 3, 0.571, 73, 1.3);
    scenario("5 chasers faster", 5, 0.571, 73, 1.3);
    scenario("1 chaser faster AS=4", 1, 4.0, 73, 1.3);
    scenario("3 chasers faster AS=4", 3, 4.0, 73, 1.3);
    scenario("3 chasers faster ad=250", 3, 0.571, 250, 1.3);
  });
});
