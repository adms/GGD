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

function scenario(name: string, nAttackers: number, atkSpeed: number, atkDmg: number): void {
  const w = new SimWorld(SKELETON_ARENA, 7);
  w.combatActive = true;
  const victim = spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: VICTIM, teamId: asTeamId(0), pos: { x: ZC.x, z: 14 }, zone: 0,
  });
  const atks: EntityId[] = [];
  for (let k = 0; k < nAttackers; k++) {
    const a = spawnChampion(w, {
      championId: "sela" as ChampionId,
      seatId: asSeatId(1 + k), teamId: asTeamId(1), pos: { x: ZC.x + 1.2, z: 14 + k * 0.1 }, zone: 0,
    });
    atks.push(a);
  }
  const vhp = w.health.get(victim)!;
  let stuck = 0, net = 0, intent = 0, hits = 0, hsTicks = 0, kdTicks = 0, ovTicks = 0;
  for (let i = 0; i < 300; i++) {
    vhp.hp = vhp.maxHp;
    const vt = w.transform.get(victim)!;
    atks.forEach((a, k) => {
      const st = w.stats.get(a)!;
      st.final[Stat.MoveSpeed] = 1e-9;
      st.final[Stat.AttackSpeed] = atkSpeed;
      st.final[Stat.AttackDamage] = atkDmg;
      w.transform.get(a)!.pos = { x: vt.pos.x + 1.2, z: vt.pos.z + k * 0.05 };
    });
    const before = { ...vt.pos };
    const point = { x: ZC.x + (before.x < ZC.x ? 8 : -8), z: before.z };
    const intents = new Map<SeatId, IntentFrame>([
      [VICTIM, { order: { kind: "move", point }, commands: [] }],
    ]);
    w.step(intents);
    const after = w.transform.get(victim)!.pos;
    const d = Math.hypot(after.x - before.x, after.z - before.z);
    const want = w.stats.get(victim)!.final[Stat.MoveSpeed] * w.dt;
    net += d; intent += want;
    if (d < want * 0.2) stuck++;
    if ((w.hitstop.get(victim) ?? 0) > 0) hsTicks++;
    if ((w.knockdown.get(victim) ?? 0) > 0) kdTicks++;
    if (w.nav.get(victim)?.override) ovTicks++;
    hits += w.events.filter((e) => e.type === "damage" && (e.data as {target?:EntityId}).target === victim).length;
  }
  console.log(`[${name}] n=${nAttackers} as=${atkSpeed} ad=${atkDmg} :: net/intent=${(net/intent).toFixed(3)} stuck=${stuck}/300 hitstopTicks=${hsTicks} knockdownTicks=${kdTicks} overrideTicks=${ovTicks} hitsTaken=${hits}`);
}

describe("measure", () => {
  it("scenarios", () => {
    scenario("1 attacker, shipped AS", 1, 0.571, 73);
    scenario("3 attackers", 3, 0.571, 73);
    scenario("5 attackers", 5, 0.571, 73);
    scenario("1 attacker fast AS=2", 1, 2.0, 73);
    scenario("1 attacker fast AS=4", 1, 4.0, 73);
    scenario("3 attackers AS=2", 3, 2.0, 73);
    scenario("1 attacker heavy ad=250", 1, 0.571, 250);
    scenario("3 attackers heavy ad=250", 3, 0.571, 250);
  });
});
