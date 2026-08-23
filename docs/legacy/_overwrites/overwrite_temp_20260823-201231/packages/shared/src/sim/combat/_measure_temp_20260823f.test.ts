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

/** victim is SURROUNDED and tries to walk out; attackers hold position and swing. */
function surrounded(name: string, n: number, as: number, ad: number): void {
  const w = new SimWorld(SKELETON_ARENA, 7);
  w.combatActive = true;
  const victim = spawnChampion(w, {
    championId: "thorne" as ChampionId, seatId: VICTIM, teamId: asTeamId(0),
    pos: { x: ZC.x, z: ZC.z + 8 }, zone: 0,
  });
  // ring positions without trig: 8 fixed unit offsets
  const RING = [
    { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 },
    { x: 0.7, z: 0.7 }, { x: -0.7, z: 0.7 }, { x: 0.7, z: -0.7 }, { x: -0.7, z: -0.7 },
  ];
  const atks: EntityId[] = [];
  for (let k = 0; k < n; k++) {
    const o = RING[k % RING.length]!;
    atks.push(spawnChampion(w, {
      championId: "sela" as ChampionId, seatId: asSeatId(1 + k), teamId: asTeamId(1),
      pos: { x: ZC.x + o.x * 1.25, z: ZC.z + 8 + o.z * 1.25 }, zone: 0,
    }));
  }
  const vhp = w.health.get(victim)!;
  let net = 0, intent = 0, stuck = 0, hs = 0, kd = 0, ov = 0, hits = 0, rootT = 0;
  const T = 100;
  for (let i = 0; i < T; i++) {
    vhp.hp = vhp.maxHp;
    const vt = w.transform.get(victim)!;
    const before = { ...vt.pos };
    const im = new Map<SeatId, IntentFrame>();
    // walk out to -z (straight, plenty of room)
    im.set(VICTIM, { order: { kind: "move", point: { x: ZC.x, z: ZC.z - 12 } }, commands: [] });
    atks.forEach((a, k) => {
      const st = w.stats.get(a)!;
      st.final[Stat.AttackSpeed] = as; st.final[Stat.AttackDamage] = ad;
      // chasers follow so they stay in melee range
      st.final[Stat.MoveSpeed] = w.stats.get(victim)!.final[Stat.MoveSpeed] * 1.2;
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
  // progress ALONG the escape axis (-z), the thing the player actually sees
  const endZ = w.transform.get(victim)!.pos.z;
  const progress = (ZC.z + 8) - endZ;
  console.log(`[${name}] n=${n} as=${as} ad=${ad} :: net/intent=${(net/intent).toFixed(3)} escapeProgress=${progress.toFixed(2)}/${(w.stats.get(victim)!.final[Stat.MoveSpeed]*w.dt*T).toFixed(1)} stuck=${stuck}/${T} hitstopT=${hs} kdT=${kd} ovT=${ov} hits=${hits}`);
}

describe("measure", () => {
  it("surrounded", () => {
    surrounded("control n=0", 0, 0.571, 73);
    surrounded("2 around", 2, 0.571, 73);
    surrounded("4 around", 4, 0.571, 73);
    surrounded("6 around", 6, 0.571, 73);
    surrounded("8 around", 8, 0.571, 73);
    surrounded("4 around AS=2", 4, 2.0, 73);
    surrounded("8 around AS=2", 8, 2.0, 73);
    surrounded("4 around ad=250", 4, 0.571, 250);
  });
});
