/* TEMP PROBE — delete after run. Read-only investigation of negative armor. */
import { SimWorld } from "./src/sim/SimWorld";
import { SKELETON_ARENA, type ArenaDef } from "./src/sim/world/ArenaDef";
import { registerSkeletonContent, THORNE } from "./src/sim/content/skeleton";
import { spawnChampion } from "./src/sim/spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "./src/ids";
import { normalizeCombatEnv } from "./src/sim/combatEnv";
import { attachSource, recomputeStats } from "./src/sim/stats/statPipeline";
import { ModOp } from "./src/sim/stats/modifiers";
import { Stat, STAT_CLAMPS } from "./src/sim/stats/statTypes";
import type { DamageType } from "./src/sim/effects/effect";

registerSkeletonContent();

const OPEN_ARENA: ArenaDef = {
  id: "arena.probe",
  name: "probe",
  zones: SKELETON_ARENA.zones.map((z) => ({ ...z, obstacles: [] })),
};
const ZONE0 = OPEN_ARENA.zones[0]!;

let nextSeat = 0;
function newWorld(): SimWorld {
  const w = new SimWorld(OPEN_ARENA, 11);
  w.combatEnv = normalizeCombatEnv({ healthRegen: 0 });
  return w;
}
function champ(w: SimWorld, team = 1): EntityId {
  return spawnChampion(w, {
    championId: THORNE.id as ChampionId,
    seatId: asSeatId(nextSeat++ % 12),
    teamId: asTeamId(team),
    pos: { x: ZONE0.center.x, z: ZONE0.center.z },
    zone: 0,
  });
}
function hpLostTo(w: SimWorld, id: EntityId, type: DamageType, amount: number): number {
  const before = w.health.get(id)!.hp;
  w.damageQueue.push({ source: id, target: id, amount, type, crit: false, origin: "test" });
  w.step(new Map());
  return before - w.health.get(id)!.hp;
}

console.log("STAT_CLAMPS[Armor] =", JSON.stringify(STAT_CLAMPS[Stat.Armor]));
console.log("STAT_CLAMPS[MagicResist] =", JSON.stringify(STAT_CLAMPS[Stat.MagicResist]));

const w = newWorld();
const id = champ(w);
const baseArmor = w.stats.get(id)!.final[Stat.Armor];
const baseMr = w.stats.get(id)!.final[Stat.MagicResist];
console.log("thorne base final[Armor] =", baseArmor, " final[MR] =", baseMr);

// --- ModOp.Flat: -50 through the shipped attachSource seam --------------
attachSource(w, id, {
  id: "buff:probe-neg-armor",
  kind: "buff",
  modifiers: [{ stat: Stat.Armor, op: ModOp.Flat, value: -50 }],
});
const afterArmor = w.stats.get(id)!.final[Stat.Armor];
console.log("after Flat:-50 → final[Armor] =", afterArmor);

// --- big negative, to see whether anything floors it -------------------
attachSource(w, id, {
  id: "buff:probe-neg-armor-2",
  kind: "buff",
  modifiers: [{ stat: Stat.Armor, op: ModOp.Flat, value: -1000 }],
});
console.log("after extra Flat:-1000 → final[Armor] =", w.stats.get(id)!.final[Stat.Armor]);

// --- negative MR too ---------------------------------------------------
attachSource(w, id, {
  id: "buff:probe-neg-mr",
  kind: "buff",
  modifiers: [{ stat: Stat.MagicResist, op: ModOp.Flat, value: -500 }],
});
console.log("after MR Flat:-500 → final[MR] =", w.stats.get(id)!.final[Stat.MagicResist]);

// --- what does mitigate() actually do with it? --------------------------
const w2 = newWorld();
const a = champ(w2);
const b = champ(w2, 2);
attachSource(w2, b, {
  id: "buff:probe-neg",
  kind: "buff",
  modifiers: [{ stat: Stat.Armor, op: ModOp.Flat, value: -200 }],
});
const armorA = w2.stats.get(a)!.final[Stat.Armor];
const armorB = w2.stats.get(b)!.final[Stat.Armor];
console.log("A armor =", armorA, " B armor(after -200) =", armorB);
const AMOUNT = 400;
console.log("hpLost A (physical 400) =", hpLostTo(w2, a, "physical", AMOUNT));
console.log("hpLost B (physical 400) =", hpLostTo(w2, b, "physical", AMOUNT));
console.log("  (LoL negative branch would give", AMOUNT * (2 - 100 / (100 - armorB)), "for B)");

// --- pctAdd -0.5 (80-002 戰無不勝 shape) --------------------------------
const w3 = newWorld();
const c = champ(w3);
attachSource(w3, c, {
  id: "passive:probe-pct",
  kind: "passive",
  modifiers: [
    { stat: Stat.Armor, op: ModOp.PercentAdd, value: -0.5 },
    { stat: Stat.MagicResist, op: ModOp.PercentAdd, value: -0.5 },
  ],
});
console.log(
  "pctAdd -0.5 → armor",
  w3.stats.get(c)!.final[Stat.Armor],
  "mr",
  w3.stats.get(c)!.final[Stat.MagicResist],
);
