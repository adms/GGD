/**
 * PROBE — how much of the sixth slot (天生技 / innate) actually APPLIES in the sim.
 *
 * Boots the real content tree, spawns every champion through the real
 * `spawnChampion`, and reports, per champion, whether its `NN-00` produced a
 * live ModifierSource on the entity. This is the honest census: "the doc exists"
 * and "the effect is on the hero" are different claims and only the second one
 * is a ported ability.
 *
 * Run: npx tsx packages/shared/scripts/probeInnateApply.ts
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../src/content/loader";
import { FsContentSource } from "../src/content/node/FsContentSource";
import { registerAll } from "../src/content/registries";
import { Champions, championPassive } from "../src/sim/content/registry";
import {
  abilityPassiveSourceId,
  isActiveInnate,
  isPassiveInnate,
} from "../src/sim/abilities/abilityPassives";
import { SimWorld } from "../src/sim/SimWorld";
import { SKELETON_ARENA } from "../src/sim/world/ArenaDef";
import { spawnChampion } from "../src/sim/spawnChampion";
import { asSeatId, asTeamId, type ChampionId } from "../src/ids";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../content");
const Z0 = SKELETON_ARENA.zones[0]!;

const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
registerAll(result.store);

const live: string[] = [];
const inertPassive: string[] = [];
const inertActive: string[] = [];
const noInnate: string[] = [];

for (const cid of Champions.ids().filter((id) => id.startsWith("godie-"))) {
  const innate = championPassive(cid as ChampionId);
  if (!innate) {
    noInnate.push(cid);
    continue;
  }
  const world = new SimWorld(SKELETON_ARENA, 1);
  const id = spawnChampion(world, {
    championId: cid as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: Z0.center.z },
    zone: 0,
  });
  const sc = world.stats.get(id)!;
  const ab = world.abilities.get(id)!;
  const attached = sc.sources.some((s) => s.id === abilityPassiveSourceId(innate.id));
  const slotOk = ab.passiveSlot?.rank === 1 && ab.passiveSlot.abilityId === innate.id;
  const label = `${cid.padEnd(12)} ${innate.name}`;
  if (!slotOk) {
    console.log(`!! ${label}  — passiveSlot NOT armed at spawn`);
    continue;
  }
  if (attached) live.push(label);
  else if (isPassiveInnate(innate)) inertPassive.push(label);
  else if (isActiveInnate(innate)) inertActive.push(label);
}

console.log(`${Champions.ids().length} champions loaded`);
console.log(`\n=== ${live.length} innates APPLY at spawn (live ModifierSource) ===`);
for (const l of live) console.log("  " + l);
console.log(`\n=== ${inertPassive.length} passive-kind innates are AUTHORED EMPTY ===`);
console.log("  (their mechanic — evasion / true-sight / enemy-aura / damage-block —");
console.log("   does not exist in the sim yet; an honest empty beats an invented stand-in)");
for (const l of inertPassive) console.log("  " + l);
console.log(`\n=== ${inertActive.length} ACTIVE innates: owned, addressable, NOT YET CASTABLE ===`);
console.log("  (real D-slot casts with cooldowns; a follow-up wires them as a sixth cast slot)");
console.log(`\n=== ${noInnate.length} champions have no NN-00 at all: ${noInnate.join(", ")} ===`);
