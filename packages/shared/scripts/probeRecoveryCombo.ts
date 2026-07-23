#!/usr/bin/env tsx
/**
 * RUNTIME PROBE (diagnostic, not a test) — LANE D: recovery + hit-cancel.
 *
 * Boots the game-server's EXACT content pair (ContentLoader + FsContentSource,
 * then registerAll), then:
 *
 *   1. censuses the connect-rule / recovery distribution over the REAL 554
 *      registered abilities (not the raw JSON — see probeAbilityRegistry.ts for
 *      why reading JSON is not evidence in this repo),
 *   2. prints the HITSTUN-vs-STARTUP arithmetic the owner asked for, computed
 *      from the live constants in sim/combat/damage.ts,
 *   3. drives a REAL SimWorld with REAL champions through a two-ability combo
 *      and shows it CONNECTING on a hit and NOT connecting on a whiff,
 *   4. re-runs the same seeded scenario and compares digests.
 *
 *     npx tsx packages/shared/scripts/probeRecoveryCombo.ts
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

import { ContentLoader, registerAll } from "../src/content/index";
import { FsContentSource } from "../src/content/node/index";
import { Abilities, Champions } from "../src/sim/content/registry";
import { isPassiveOnly } from "../src/sim/abilities/abilityPassives";
import {
  connectRuleOf,
  DEFAULT_RECOVERY_SEC,
  type ConnectRule,
} from "../src/sim/abilities/abilityRecovery";
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
const t = (ticks: number): string => `${ticks}t / ${(ticks * DT).toFixed(3)}s`;

console.log(`contentVersion:       ${result.manifest.contentVersion}`);
console.log(`champions registered: ${Champions.ids().length}`);
console.log(`abilities registered: ${Abilities.all().length}`);

// ───────────────────────────────────────────── 1. connect-rule / recovery census
const all = Abilities.all();
const castable = all.filter((a) => !isPassiveOnly(a));
const byRule = new Map<ConnectRule, AbilityDef[]>();
for (const a of castable) {
  const r = connectRuleOf(a);
  (byRule.get(r) ?? byRule.set(r, []).get(r)!).push(a);
}
console.log(`\n── 1. CONNECT RULE over the ${castable.length} CASTABLE abilities `
  + `(${all.length - castable.length} passive-only excluded — castAbility rejects them first)`);
for (const rule of ["damage", "applied", "unwhiffable"] as const) {
  const list = byRule.get(rule) ?? [];
  const byType = new Map<string, number>();
  for (const a of list) byType.set(a.castType, (byType.get(a.castType) ?? 0) + 1);
  console.log(
    `  ${rule.padEnd(12)} ${String(list.length).padStart(4)}   castType: ` +
      [...byType].sort().map(([k, n]) => `${k}=${n}`).join(" ") +
      `   e.g. ${list.slice(0, 3).map((a) => a.id).join(", ")}`,
  );
}
const authored = all.filter((a) => a.recoverySec !== undefined);
console.log(
  `\n  recoverySec authored on ${authored.length} / ${all.length} — the other ` +
    `${all.length - authored.length} use DEFAULT_RECOVERY_SEC = ${DEFAULT_RECOVERY_SEC}s ` +
    `(${t(Math.round(DEFAULT_RECOVERY_SEC / DT))})`,
);
const roots = all.filter((a) => a.recoveryRoots === true);
console.log(`  recoveryRoots:true on ${roots.length} / ${all.length} (default = output lock only)`);
const unwhiffable = byRule.get("unwhiffable") ?? [];
console.log(
  `  => ${unwhiffable.length} abilities observe ZERO recovery because they cannot miss ` +
    `(${unwhiffable.filter((a) => a.castType === "dash").length} dashes, ` +
    `${unwhiffable.filter((a) => a.castType === "self").length} self-casts)`,
);

// ───────────────────────────────────────── 2. hitstun vs startup: does it link?
// Constants copied from sim/combat/damage.ts (kept in sync by the assertions in
// recoveryCombo.test.ts, which imports the real ones).
const hitstopOf = (impact: number, crit = false): number => {
  let h = Math.min(6, Math.max(2, 2 + Math.floor(impact / 55)));
  if (crit) h += 2;
  return Math.min(h, 8);
};
const hitstunOf = (impact: number, crit = false): number =>
  Math.min(12, hitstopOf(impact, crit) + 2 + Math.floor(impact / 40));

console.log("\n── 2. THE COMBO BUDGET: does the next move's STARTUP fit inside HITSTUN?");
console.log("  impact | hitstop | hitstun            (hitstun = the victim's action lock)");
for (const imp of [12, 60, 100, 120, 170, 220, 400]) {
  console.log(
    `  ${String(imp).padStart(6)} | ${String(hitstopOf(imp)).padStart(7)} | ${hitstunOf(imp)}t = ${(hitstunOf(imp) * DT).toFixed(3)}s`,
  );
}
const MAX_HITSTUN = 12;
console.log(`  MAX hitstun (the HITSTUN_MAX_TICKS cap) = ${t(MAX_HITSTUN)}`);
// Distribution rather than just the min: Lane A rewrites content/ in place, so a
// probe run that lands mid-write can see a doc with no castTimeSec yet. The
// SHAPE of the answer must not depend on that race.
const ctHist = new Map<number, number>();
for (const a of castable) ctHist.set(a.castTimeSec ?? 0, (ctHist.get(a.castTimeSec ?? 0) ?? 0) + 1);
console.log("  ability castTimeSec in the live registry:");
for (const [secs, n] of [...ctHist].sort((a, b) => a[0] - b[0])) {
  const ticks = Math.round(secs / DT);
  console.log(
    `    ${String(secs).padStart(5)}s = ${String(ticks).padStart(2)}t on ${String(n).padStart(3)} abilities -> ` +
      (ticks <= MAX_HITSTUN ? "fits in max hitstun" : `EXCEEDS max hitstun by ${ticks - MAX_HITSTUN}t`),
  );
}
const RULE_FLOOR = 0.6; // the owner's telegraph rule: every ability >= 0.6 s startup
console.log(
  `  => at the owner's 0.6 s startup floor (${Math.round(RULE_FLOOR / DT)}t), the follow-up ability ` +
    `${Math.round(RULE_FLOOR / DT) <= MAX_HITSTUN ? "FITS" : "DOES NOT FIT"} inside max hitstun ` +
    `(${Math.round(RULE_FLOOR / DT)} vs ${MAX_HITSTUN} ticks, ` +
    `short by ${Math.round(RULE_FLOOR / DT) - MAX_HITSTUN}t = ${((Math.round(RULE_FLOOR / DT) - MAX_HITSTUN) * DT).toFixed(3)}s)`,
);
console.log("  basic-attack damage points (attackDamagePoint), which DO sometimes fit:");
const dp = new Map<number, number>();
for (const c of Champions.all()) {
  const v = c.attackDamagePoint ?? ((c.baseStats.range ?? 0) > 3 ? 0.3 : 0.25);
  dp.set(v, (dp.get(v) ?? 0) + 1);
}
for (const [secs, n] of [...dp].sort((a, b) => a[0] - b[0])) {
  const ticks = Math.round(secs / DT);
  console.log(
    `    ${secs}s = ${String(ticks).padStart(2)}t on ${String(n).padStart(3)} champions -> ` +
      (ticks <= MAX_HITSTUN
        ? `links off a hit of impact >= ${[12, 60, 100, 120, 170, 220, 400].find((i) => hitstunOf(i) >= ticks) ?? "?"}`
        : "NEVER links (exceeds the hitstun cap)"),
  );
}

// ───────────────────────────────────────────── 3. a REAL two-ability combo
/** A champion whose Q both deals damage and is castable at a target. */
function pickChampion(castType: string): { id: ChampionId; q: AbilityDef } | null {
  for (const c of Champions.all()) {
    const q = Abilities.tryGet(c.abilities.Q.id);
    if (!q || isPassiveOnly(q)) continue;
    if (connectRuleOf(q) !== "damage") continue;
    if (q.castType !== castType) continue;
    return { id: c.id as ChampionId, q };
  }
  return null;
}

type Scenario = {
  label: string;
  resolveTick: number;
  /** recovery.ticksLeft sampled on the resolve tick and each tick after */
  recoveryTicks: number[];
  /** castAbility() result for the FOLLOW-UP ability, same sampling */
  followUp: string[];
  damaged: boolean;
  digest: number;
};

/**
 * THE A/B. Same champion, same ground ability, same seed — the ONLY difference
 * is whether an enemy is standing in the AoE. Cast Q, step to resolve, then
 * every tick ask "may I cast the follow-up now?" and record the answer.
 * Cooldown + mana are zeroed each tick so RECOVERY is the only thing that can
 * refuse — otherwise the probe would be measuring the cooldown.
 */
function runCombo(championId: ChampionId, enemyInAoE: boolean, seed = 7): Scenario {
  const world = new SimWorld(SKELETON_ARENA, seed);
  const z = SKELETON_ARENA.zones[0]!;
  const caster = spawnChampion(world, {
    championId, seatId: asSeatId(0), teamId: asTeamId(0),
    pos: { x: z.center.x, z: z.center.z + 14 }, zone: 0,
  });
  // the enemy stands 2u ahead (inside the AoE) or 2u ahead but in the OTHER
  // half of the zone (nowhere near the stamped circle)
  const aim = { x: z.center.x + 2, z: z.center.z + 14 };
  spawnChampion(world, {
    championId, seatId: asSeatId(1), teamId: asTeamId(1),
    pos: enemyInAoE ? { x: aim.x, z: aim.z } : { x: z.center.x + 2, z: z.center.z - 14 },
    zone: 0,
  });
  world.step(NO_INTENTS); // settle stats/health

  const free = (): void => {
    world.abilities.get(caster)!.slots.Q.cooldownRemainingTicks = 0;
    const h = world.health.get(caster)!;
    h.mana = h.maxMana = 99999;
  };
  free();
  const target = { type: "point", point: aim } as const;
  const first = castAbility(world, caster, "Q", target);
  if (first !== "ok")
    return { label: `1st cast refused: ${first}`, resolveTick: -1, recoveryTicks: [], followUp: [], damaged: false, digest: 0 };

  let damaged = false;
  let resolveTick = -1;
  const recoveryTicks: number[] = [];
  const followUp: string[] = [];
  for (let i = 0; i < 60; i++) {
    world.step(NO_INTENTS);
    if (world.events.some((e) => e.type === "damage")) damaged = true;
    if (resolveTick < 0 && !world.abilities.get(caster)!.cast) resolveTick = world.tick;
    if (resolveTick < 0) continue;
    free();
    recoveryTicks.push(world.abilities.get(caster)?.recovery?.ticksLeft ?? 0);
    // ask only — never actually let the follow-up fire, or it would arm its own
    // recovery and we would stop measuring the first one.
    const ab = world.abilities.get(caster)!;
    const saved = { cast: ab.cast, recovery: ab.recovery };
    const hpSaved = world.health.get(caster)!.mana;
    const r = castAbility(world, caster, "Q", target);
    ab.cast = saved.cast;
    ab.recovery = saved.recovery;
    world.health.get(caster)!.mana = hpSaved;
    followUp.push(r);
    if (followUp.length >= 24) break;
  }
  return { label: "", resolveTick, recoveryTicks, followUp, damaged, digest: world.digest() };
}

console.log("\n── 3. A REAL TWO-ABILITY COMBO, in a real SimWorld with real champions");
const combo = pickChampion("ground");
if (!combo) console.log("  (no champion whose Q is a damaging ground ability)");
else {
  console.log(
    `  ${Champions.get(combo.id).name}  Q = ${combo.q.id}  (ground, radius ${combo.q.radius}, ` +
      `castTime ${combo.q.castTimeSec ?? 0}s, recovery ${combo.q.recoverySec ?? DEFAULT_RECOVERY_SEC}s = ` +
      `${t(Math.round((combo.q.recoverySec ?? DEFAULT_RECOVERY_SEC) / DT))})`,
  );
  for (const inAoE of [true, false]) {
    const r = runCombo(combo.id, inAoE);
    const tag = inAoE ? "HIT  " : "WHIFF";
    if (r.label) { console.log(`    ${tag}: ${r.label}`); continue; }
    const firstOk = r.followUp.indexOf("ok");
    console.log(
      `    ${tag} (enemy ${inAoE ? "IN" : "OUT of"} the AoE): resolved at tick ${r.resolveTick}, ` +
        `damage event ${r.damaged ? "YES" : "NO"}`,
    );
    console.log(`      recovery.ticksLeft from the resolve tick: [${r.recoveryTicks.join(",")}]`);
    console.log(`      follow-up castAbility():                  [${r.followUp.join(",")}]`);
    console.log(
      `      => 2nd ability ${firstOk >= 0 ? `castable ${firstOk} tick(s) after resolve` : "REFUSED for the whole window"}`,
    );
  }
}

// ───────────────────────────────────────────── 4. determinism
const pick = pickChampion("ground");
if (pick) {
  const d1 = runCombo(pick.id, false, 1234).digest;
  const d2 = runCombo(pick.id, false, 1234).digest;
  const d3 = runCombo(pick.id, false, 4321).digest;
  console.log(
    `\n── 4. same-seed replay: digest ${d1} vs ${d2} -> ${d1 === d2 ? "IDENTICAL" : "DIVERGED"}` +
      `   (different seed -> ${d3}, ${d3 === d1 ? "same (inputs are deterministic)" : "differs"})`,
  );
}
