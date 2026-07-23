#!/usr/bin/env tsx
/**
 * RUNTIME PROBE (diagnostic, not a test) — LANE A, the owner's cast-time rule.
 *
 * Boots the REAL content the way the game-server does
 * (`apps/game-server/src/index.ts` loadContent):
 *
 *     new ContentLoader(new FsContentSource(CONTENT_DIR)).load()
 *     registerAll(result.store)
 *
 * …then reports, from the POST-REGISTRATION `Abilities` registry (never the raw
 * JSON — champion-doc shadowing has produced five "green tests, dead code" bugs
 * in this repo):
 *
 *   1. the castTimeSec distribution over all 554 registered abilities,
 *   2. the mirror check: `Champions.get(id).abilities[slot].castTimeSec` must
 *      agree with the registry, or the codex / admin / HUD show a number the
 *      match does not use,
 *   3. the SELF-ROOT-LOCK set: abilities whose post-`combatEnv.cooldown`
 *      cooldown is SHORTER than their own cast time. Those are pressable again
 *      before the root they impose has expired, so a spam-happy caster (the
 *      Tier0 bot casts every ready ability every tick) never leaves the cast
 *      state. Measured in a real SimWorld, not argued.
 *
 *     pnpm --filter @ggd/shared exec tsx scripts/probeCastTelegraph.ts
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

import { ContentLoader, registerAll } from "../src/content/index";
import { FsContentSource } from "../src/content/node/index";
import { Abilities, Champions } from "../src/sim/content/registry";
import { isPassiveOnly } from "../src/sim/abilities/abilityPassives";
import { deriveCastTime } from "../src/content/castTimeFormula";
import { SimWorld } from "../src/sim/SimWorld";
import { SKELETON_ARENA } from "../src/sim/world/ArenaDef";
import { spawnChampion } from "../src/sim/spawnChampion";
import { castAbility, rankUpAbility } from "../src/sim/abilities/abilitySystem";
import { grantLevels } from "../src/sim/economy/progression";
import { asSeatId, asTeamId, type ChampionId, type AbilityId } from "../src/ids";
import type { CoreAbilitySlot } from "../src/sim/intents";

const CONTENT_DIR = process.env.GGD_CONTENT_DIR ?? join(__dirname, "../../../content");

const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
registerAll(result.store);

const all = Abilities.all();

/** content/config/combat-env.json `cooldown` — the multiplier the match uses. */
function envCooldownMult(): number {
  const d = result.store.tryGet<{ multipliers: Record<string, number> }>("config", "combat-env");
  return d?.multipliers.cooldown ?? 1;
}

console.log(`contentVersion:       ${result.manifest.contentVersion}`);
console.log(`champions registered: ${Champions.ids().length}`);
console.log(`abilities registered: ${all.length}`);

// ---- 1. castTimeSec distribution -----------------------------------------
const dist = new Map<string, number>();
for (const a of all) {
  const k = a.castTimeSec === undefined ? "(unset)" : a.castTimeSec.toFixed(2);
  dist.set(k, (dist.get(k) ?? 0) + 1);
}
console.log("\ncastTimeSec distribution (post-registration registry):");
for (const [k, n] of [...dist.entries()].sort((x, y) =>
  x[0] === "(unset)" ? -1 : y[0] === "(unset)" ? 1 : Number(x[0]) - Number(y[0]),
)) {
  console.log(`  ${k.padStart(7)}  ${String(n).padStart(3)}`);
}
const withCt = all.map((a) => a.castTimeSec).filter((v): v is number => v !== undefined).sort((x, y) => x - y);
console.log(
  `  of ${withCt.length} that cast: MEDIAN ${withCt[Math.floor(withCt.length / 2)]}s  mean ${(withCt.reduce((s, v) => s + v, 0) / withCt.length).toFixed(3)}s`,
);

// Which EXEMPTION each unset ability fell into. Under the revised (tiered)
// rule an unset castTimeSec is not automatically a violation: passive-only
// abilities can never reach the cast branch, and `rapid-fire` abilities have a
// post-multiplier cooldown too short to afford even the 0.3 s floor (a 0.5 s
// cooldown ability comes up every 0.13 s — that is what produced the seven
// statues). Anything else unset IS a violation.
const cdMultForClass = envCooldownMult();
const unset = all.filter((a) => a.castTimeSec === undefined);
const cls = new Map<string, string[]>();
for (const a of unset) {
  const c = deriveCastTime(a, cdMultForClass).cls;
  (cls.get(c) ?? cls.set(c, []).get(c)!).push(`${a.id} ${a.name}`);
}
console.log(`  unset: ${unset.length} — by exemption class:`);
for (const [c, list] of cls) {
  console.log(`    ${c.padEnd(13)} ${String(list.length).padStart(3)}`);
  for (const x of list) console.log(`       ${x}`);
}
const violations = unset.filter((a) => {
  const c = deriveCastTime(a, cdMultForClass).cls;
  return c !== "passive-only" && c !== "rapid-fire";
});
console.log(`  UNEXPLAINED (real rule violations): ${violations.length}`);
for (const a of violations) console.log(`    ! ${a.id} ${a.name}`);

// ---- 2. embedded-copy mirror check ---------------------------------------
let slots = 0;
let drift = 0;
for (const c of Champions.all()) {
  for (const s of ["Q", "W", "E", "R"] as const) {
    slots++;
    const emb = c.abilities[s];
    if (emb.castTimeSec !== Abilities.get(emb.id).castTimeSec) {
      drift++;
      if (drift <= 5) {
        console.log(
          `  MIRROR DRIFT ${emb.id}: registry ${Abilities.get(emb.id).castTimeSec} vs embedded ${emb.castTimeSec}`,
        );
      }
    }
  }
}
console.log(`\nChampions.get(id).abilities[slot].castTimeSec: ${slots} entries, ${drift} disagreeing`);

// ---- 3. self-root lock ----------------------------------------------------
// The SHIPPED cooldown multiplier, not DEFAULT_COMBAT_ENV (which is all-1.0).
// content/config/combat-env.json is layer 1 of apps/game-server/src/config/
// combatEnv.ts; the admin platform override is layer 2 and can only make this
// worse or better at runtime, so the content default is the honest baseline.
const envDoc = result.store.tryGet<{ multipliers: Record<string, number> }>("config", "combat-env");
const cdMult = envDoc?.multipliers.cooldown ?? 1;
console.log(`\ncontent/config/combat-env.json cooldown multiplier: ${cdMult}`);
const locked = all
  .filter((a) => !isPassiveOnly(a))
  .map((a) => ({ a, realCd: Math.min(...a.cooldown) * cdMult, ct: a.castTimeSec ?? 0 }))
  .filter((r) => r.ct > 0 && r.realCd < r.ct)
  .sort((x, y) => x.realCd - y.realCd);
console.log(`SELF-ROOT-LOCK candidates (real cooldown < castTimeSec): ${locked.length}`);
for (const r of locked) {
  console.log(
    `  ${r.a.id} [${r.a.slot}] ${r.a.name}  cd ${Math.min(...r.a.cooldown)}s x${cdMult} = ${r.realCd.toFixed(3)}s < ct ${r.ct}s`,
  );
}

// ---- 3b. MEASURE one of them in a real SimWorld ---------------------------
/** Owner of `abilityId`, or null. */
function ownerOf(abilityId: string): { champ: string; slot: CoreAbilitySlot } | null {
  for (const c of Champions.all()) {
    for (const s of ["Q", "W", "E", "R"] as const) if (c.abilities[s].id === abilityId) return { champ: c.id, slot: s };
  }
  return null;
}

function measureRootedFraction(abilityId: string, ticks = 300): string {
  const own = ownerOf(abilityId);
  if (!own) return `${abilityId}: not a Q/W/E/R of any champion — skipped`;
  const w = new SimWorld(SKELETON_ARENA, 7);
  // drive the sim with the SHIPPED multipliers, or the 0.25 cooldown factor
  // (the whole reason the lock exists) would not be in play.
  if (envDoc) w.combatEnv = { ...w.combatEnv, ...envDoc.multipliers } as typeof w.combatEnv;
  const id = spawnChampion(w, {
    championId: own.champ as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: SKELETON_ARENA.zones[0]!.center.x, z: 0 },
    zone: 0,
  });
  grantLevels(w, id, 17);
  while (rankUpAbility(w, id, own.slot)) {
    /* max the slot */
  }
  const ab = w.abilities.get(id)!;
  let rooted = 0;
  let casts = 0;
  for (let t = 0; t < ticks; t++) {
    // Tier0Brain behaviour: cast the slot whenever it reports ready.
    if (castAbility(w, id, own.slot, { type: "self" }) === "ok") casts++;
    w.step(new Map());
    if (ab.cast?.rooted) rooted++;
  }
  return `${abilityId} (${own.champ}.${own.slot} rank ${ab.slots[own.slot].rank}): ${casts} casts, rooted ${rooted}/${ticks} ticks = ${((rooted / ticks) * 100).toFixed(1)}%`;
}

console.log("\nreal-SimWorld root duty cycle (bot-style: cast whenever ready, 300 ticks = 10s):");
for (const idStr of ["godie-u011.r", "godie-h02k.q", "godie-e002.q"]) {
  if (Abilities.tryGet(idStr as AbilityId)) console.log(`  ${measureRootedFraction(idStr)}`);
}
