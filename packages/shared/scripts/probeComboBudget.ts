#!/usr/bin/env tsx
/**
 * RUNTIME PROBE — THE COMBO BUDGET, WITH THE HITSTOP TERM THAT WAS MISSING.
 *
 * The prior arithmetic in this project compared the follow-up's STARTUP against
 * the victim's HITSTUN and concluded that a 0.3 s (9 tick) ability "true-links
 * off a heavy hit". That comparison omits a term, and the omitted term is
 * decisive.
 *
 * When a hit lands, `combat/damage.ts:387-390` does:
 *     bumpFreeze(world.hitstop, SOURCE, hitstopTicks);   <-- the ATTACKER too
 *     bumpFreeze(world.hitstop, TARGET, hitstopTicks);
 *     bumpFreeze(world.hitstun, TARGET, hitstunTicks);
 *
 * and then:
 *   • `CastResolveSystem.ts:34` — hitstop PAUSES the attacker's cast wind-up,
 *   • `BasicAttackSystem.ts:90` — hitstop PAUSES the attacker's swing wind-up,
 *   • `HitstopSystem.ts:26-28` — ages hitstop, knockdown AND hitstun by one tick
 *     each, EVERY tick, unconditionally.
 *
 * So the victim's action-lock keeps burning down during the very freeze that
 * stops the attacker from acting. The attacker's usable window is therefore
 *
 *     budget = hitstun - hitstop        (NOT hitstun)
 *
 * and a follow-up connects inside the lock only if `startup <= budget`.
 *
 *     npx tsx packages/shared/scripts/probeComboBudget.ts
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

import { ContentLoader, registerAll } from "../src/content/index";
import { FsContentSource } from "../src/content/node/index";
import { Abilities, Champions } from "../src/sim/content/registry";
import { isPassiveOnly } from "../src/sim/abilities/abilityPassives";

const CONTENT_DIR = process.env.GGD_CONTENT_DIR ?? join(__dirname, "../../../content");
const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
registerAll(result.store);

const DT = 1 / 30;

// Mirrors of the live formulas in sim/combat/damage.ts. The EMPIRICAL half of
// this probe (probeComboLoop.ts) reads the authoritative world.hitstop /
// world.hitstun instead, and the two agree — see the report.
const hitstopOf = (impact: number, crit = false): number => {
  let h = Math.min(6, Math.max(2, 2 + Math.floor(impact / 55)));
  if (crit) h += 2;
  return Math.min(h, 8);
};
const hitstunOf = (impact: number, crit = false): number =>
  Math.min(12, hitstopOf(impact, crit) + 2 + Math.floor(impact / 40));

console.log(`contentVersion: ${result.manifest.contentVersion}`);
console.log(`champions ${Champions.ids().length}  abilities ${Abilities.all().length}\n`);

console.log("=".repeat(92));
console.log("THE COMBO BUDGET — what the attacker can actually spend before the victim is free");
console.log("=".repeat(92));
console.log("  impact | hitstop | hitstun | OLD claim (vs hitstun) | REAL budget = hitstun-hitstop");
console.log("  " + "-".repeat(88));
let bestBudget = 0;
for (const imp of [12, 40, 60, 100, 120, 170, 220, 400, 1000]) {
  const stop = hitstopOf(imp);
  const stun = hitstunOf(imp);
  const budget = stun - stop;
  bestBudget = Math.max(bestBudget, budget);
  console.log(
    `  ${String(imp).padStart(6)} | ${String(stop).padStart(7)} | ${String(stun).padStart(7)} | ` +
      `${`${stun}t = ${(stun * DT).toFixed(3)}s`.padEnd(22)} | ${budget}t = ${(budget * DT).toFixed(3)}s`,
  );
}
// crit is the single most generous case the game can produce
const critStop = hitstopOf(1000, true);
const critStun = hitstunOf(1000, true);
console.log(
  `  CRIT at saturating impact: hitstop ${critStop}, hitstun ${critStun} -> budget ${critStun - critStop}t = ${((critStun - critStop) * DT).toFixed(3)}s`,
);
bestBudget = Math.max(bestBudget, critStun - critStop);
console.log(
  `\n  THE MOST GENEROUS BUDGET THE GAME CAN PRODUCE: ${bestBudget} ticks = ${(bestBudget * DT).toFixed(3)}s`,
);

// ───────────────────────────────────────── what can fit in that budget?
const castable = Abilities.all().filter((a) => !isPassiveOnly(a));
const fits = castable.filter((a) => Math.round((a.castTimeSec ?? 0) / DT) <= bestBudget);
const instant = castable.filter((a) => (a.castTimeSec ?? 0) === 0);
const minCt = Math.min(...castable.filter((a) => (a.castTimeSec ?? 0) > 0).map((a) => a.castTimeSec!));

console.log("\n" + "=".repeat(92));
console.log("CAN ANY FOLLOW-UP FIT INSIDE IT?");
console.log("=".repeat(92));
console.log(`  castable abilities:                       ${castable.length}`);
console.log(
  `  fastest NON-INSTANT startup in the game:  ${minCt}s = ${Math.round(minCt / DT)} ticks  (the Lane A floor)`,
);
console.log(`  abilities whose startup fits in ${bestBudget}t:       ${fits.length}`);
console.log(
  `    of those, INSTANT (0 s, the 26 exempt): ${instant.length}  ` +
    `-> these are the ONLY abilities that can ever connect inside the lock`,
);
console.log(
  `    with a real (>0) startup:               ${fits.length - instant.length}`,
);

// basic attacks
const dp = new Map<number, number>();
for (const c of Champions.all()) {
  const v = c.attackDamagePoint ?? ((c.baseStats.range ?? 0) > 3 ? 0.3 : 0.25);
  dp.set(v, (dp.get(v) ?? 0) + 1);
}
console.log("\n  BASIC ATTACKS (attackDamagePoint), which are frozen by hitstop the same way:");
for (const [secs, n] of [...dp].sort((a, b) => a[0] - b[0])) {
  const ticks = Math.round(secs / DT);
  console.log(
    `    ${secs}s = ${String(ticks).padStart(2)}t on ${String(n).padStart(3)} champions -> ` +
      (ticks <= bestBudget ? "FITS inside the lock" : `does NOT fit (over by ${ticks - bestBudget}t)`),
  );
}

console.log("\n" + "=".repeat(92));
console.log("VERDICT");
console.log("=".repeat(92));
const anyRealFits = fits.length - instant.length > 0;
const anyAutoFits = [...dp.keys()].some((s) => Math.round(s / DT) <= bestBudget);
if (!anyRealFits && !anyAutoFits) {
  console.log(
    `  NO ability and NO basic attack in the game can be started after a hit and still\n` +
      `  LAND before the victim recovers. The largest possible window is ${bestBudget} ticks\n` +
      `  (${(bestBudget * DT).toFixed(3)}s); the fastest thing anyone can start is ${Math.round(minCt / DT)} ticks (${minCt}s).\n` +
      `  => TRUE COMBOS (guaranteed, unescapable follow-ups) DO NOT EXIST in the current numbers.\n` +
      `  The hit-cancel still buys real TEMPO — the whiffer eats 0.6 s while the hitter acts at\n` +
      `  once — but the follow-up is a MIXUP the victim can contest, not a guaranteed link.`,
  );
} else {
  console.log(`  Some follow-ups fit: ${fits.length - instant.length} abilities, autos fit = ${anyAutoFits}`);
}

console.log("\n  THE TWO KNOBS, if the owner wants real links:");
const need = Math.round(minCt / DT);
console.log(
  `   (a) raise HITSTUN_MAX_TICKS in sim/combat/damage.ts from 12 to >= ${need + hitstopOf(220)} ` +
    `(so hitstun-hitstop >= ${need}t covers the 0.3 s floor);`,
);
console.log(
  `   (b) or stop hitstop from freezing the ATTACKER's wind-up (bump only the TARGET at ` +
    `damage.ts:388) — the attacker-side freeze is what eats the window.`,
);
console.log(
  `  Both are balance calls that change every existing replay digest, so neither is applied here.`,
);
