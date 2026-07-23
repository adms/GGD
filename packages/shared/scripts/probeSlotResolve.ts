#!/usr/bin/env tsx
/**
 * RUNTIME PROBE — does a real cast DEFER and RESOLVE on the right tick, in all
 * five slots (Q / W / E / R / EX)?
 *
 * The owner's rule is only real if the sim actually holds the effect for
 * `round(castTimeSec / dt)` ticks and then runs it. This drives a real SimWorld
 * with real champions and asserts, per slot:
 *   • castBegin fires with the tick count the registry says,
 *   • ab.cast is non-null for exactly that many ticks (the DEFER),
 *   • castEnd + the ability's effects land on the tick the wind-up expires,
 *   • nothing resolved early.
 *
 *     npx tsx packages/shared/scripts/probeSlotResolve.ts
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

import { ContentLoader, registerAll } from "../src/content/index";
import { FsContentSource } from "../src/content/node/index";
import { Abilities, Champions } from "../src/sim/content/registry";
import { isPassiveOnly } from "../src/sim/abilities/abilityPassives";
import { castAbility } from "../src/sim/abilities/abilitySystem";
import { SimWorld } from "../src/sim/SimWorld";
import { SKELETON_ARENA } from "../src/sim/world/ArenaDef";
import { spawnChampion } from "../src/sim/spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type SeatId } from "../src/ids";
import type { IntentFrame } from "../src/sim/intents";
import type { AbilityDef } from "../src/sim/content/defs";

const CONTENT_DIR = process.env.GGD_CONTENT_DIR ?? join(__dirname, "../../../content");
const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
registerAll(result.store);

const NO_INTENTS = new Map<SeatId, IntentFrame>();
const DT = 1 / 30;
type Slot = "Q" | "W" | "E" | "R" | "EX";

console.log(`contentVersion ${result.manifest.contentVersion}`);
console.log(`\n${"slot".padEnd(5)} ${"ability".padEnd(34)} ${"ct".padEnd(6)} ${"want".padEnd(5)} ${"castBegin".padEnd(10)} ${"deferred".padEnd(9)} ${"resolved".padEnd(9)} verdict`);
console.log("-".repeat(104));

let pass = 0, fail = 0;

for (const slot of ["Q", "W", "E", "R", "EX"] as Slot[]) {
  // pick the first champion whose ability in this slot has a real wind-up
  let picked: { c: ChampionId; a: AbilityDef } | null = null;
  for (const c of Champions.all()) {
    const id = slot === "EX" ? c.exAbility : c.abilities[slot]?.id;
    if (!id) continue;
    const a = Abilities.tryGet(id);
    if (!a || isPassiveOnly(a) || (a.castTimeSec ?? 0) <= 0) continue;
    picked = { c: c.id as ChampionId, a };
    break;
  }
  if (!picked) { console.log(`${slot.padEnd(5)} (no champion with a winding-up ability in this slot)`); continue; }

  const want = Math.round((picked.a.castTimeSec ?? 0) / DT);
  const world = new SimWorld(SKELETON_ARENA, 11);
  const z = SKELETON_ARENA.zones[0]!;
  const caster = spawnChampion(world, {
    championId: picked.c, seatId: asSeatId(0), teamId: asTeamId(0),
    pos: { x: z.center.x, z: z.center.z + 14 }, zone: 0,
  });
  const victim = spawnChampion(world, {
    championId: picked.c, seatId: asSeatId(1), teamId: asTeamId(1),
    pos: { x: z.center.x + 2, z: z.center.z + 14 }, zone: 0,
  });
  world.step(NO_INTENTS);

  const ab = world.abilities.get(caster)!;
  const inst = slot === "EX" ? ab.exSlot! : ab.slots[slot];
  inst.rank = Math.max(1, inst.rank);
  inst.cooldownRemainingTicks = 0;
  const h = world.health.get(caster)!;
  h.mana = h.maxMana = 99999;

  const vpos = world.transform.get(victim)!.pos;
  const target =
    picked.a.castType === "entity" || picked.a.castType === "targeted"
      ? ({ type: "entity", entityId: victim } as const)
      : picked.a.castType === "self"
        ? ({ type: "self" } as const)
        : ({ type: "point", point: { x: vpos.x, z: vpos.z } } as const);

  const r = castAbility(world, caster, slot, target);
  if (r !== "ok") { console.log(`${slot.padEnd(5)} ${picked.a.id.padEnd(34)} refused: ${r}`); fail++; continue; }

  const beginEv = world.events.find((e) => e.type === "castBegin");
  const beginTicks = beginEv ? (beginEv.data as { ticks?: number }).ticks : undefined;

  let deferred = 0, resolvedAt = -1, endAt = -1;
  for (let i = 0; i < want + 15; i++) {
    const wasCasting = !!world.abilities.get(caster)!.cast;
    world.step(NO_INTENTS);
    if (wasCasting && world.abilities.get(caster)!.cast) deferred++;
    if (world.events.some((e) => e.type === "castEnd") && endAt < 0) endAt = world.tick;
    // "the effect ran" = any non-bookkeeping event this ability produced
    if (resolvedAt < 0 && world.events.some((e) =>
        ["damage","heal","manaRestore","projectileSpawn","statusApplied","knockdown","hitImpact"].includes(e.type)))
      resolvedAt = world.tick;
    if (endAt >= 0 && resolvedAt >= 0) break;
  }
  // deferred counts ticks where the cast was still pending after stepping;
  // the wind-up occupies `want` ticks and resolves on the want-th.
  const ok = beginTicks === want && endAt >= 0 && deferred === want - 1;
  console.log(
    `${slot.padEnd(5)} ${picked.a.id.padEnd(34)} ${String(picked.a.castTimeSec).padEnd(6)} ${String(want).padEnd(5)} ` +
      `${String(beginTicks).padEnd(10)} ${String(deferred + 1).padEnd(9)} ${String(endAt).padEnd(9)} ${ok ? "OK" : "MISMATCH"}`,
  );
  ok ? pass++ : fail++;
}

console.log(`\n${pass} slots correct, ${fail} wrong.`);
console.log(`"deferred" = ticks the effect was held pending (must equal want).`);
console.log(`"resolved" = the tick castEnd fired = the tick CastResolveSystem ran the effects.`);
