#!/usr/bin/env tsx
/**
 * RUNTIME PROBE — THE TEMPO AUDIT.
 *
 * Every ability now has a STARTUP (Lane A) and a RECOVERY (Lane D) where it
 * previously had neither. This probe asks the only question that matters for a
 * first playtest: did anything become USELESS?
 *
 * The four failure shapes the owner named, each answered from the live registry:
 *   1. a dash that roots before it moves is not an escape,
 *   2. a counter that needs its startup to come up cannot counter,
 *   3. a heal that never "hits" would eat full recovery every cast,
 *   4. an ability whose commitment outlives its own cooldown is a self-lock.
 *
 * Plus the two histograms (castTimeSec, recoverySec) over all 554.
 *
 *     npx tsx packages/shared/scripts/probeTempoAudit.ts
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

import { ContentLoader, registerAll } from "../src/content/index";
import { FsContentSource } from "../src/content/node/index";
import { Abilities, Champions } from "../src/sim/content/registry";
import { isPassiveOnly } from "../src/sim/abilities/abilityPassives";
import { connectRuleOf, DEFAULT_RECOVERY_SEC } from "../src/sim/abilities/abilityRecovery";
import type { AbilityDef } from "../src/sim/content/defs";

const CONTENT_DIR = process.env.GGD_CONTENT_DIR ?? join(__dirname, "../../../content");
const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
registerAll(result.store);

const DT = 1 / 30;
const all = Abilities.all();
const castable = all.filter((a) => !isPassiveOnly(a));

// the combat-env cooldown multiplier both ceilings were derived against
const envCd = 0.25;
const cdOf = (a: AbilityDef): number => (a.cooldown?.[0] ?? 0) * envCd;
const ctOf = (a: AbilityDef): number => a.castTimeSec ?? 0;
const recOf = (a: AbilityDef): number => a.recoverySec ?? DEFAULT_RECOVERY_SEC;

const nameOf = (a: AbilityDef): string => {
  const owner = Champions.all().find((c) =>
    (["Q", "W", "E", "R"] as const).some((s) => c.abilities[s]?.id === a.id) || c.exAbility === a.id,
  );
  return `${a.id} "${a.name}"${owner ? ` [${owner.name}]` : ""}`;
};

console.log(`contentVersion ${result.manifest.contentVersion}  champions ${Champions.ids().length}  abilities ${all.length}`);

// ───────────────────────────────────────────────────────── 6. HISTOGRAMS
const hist = (vals: number[]): Map<number, number> => {
  const m = new Map<number, number>();
  for (const v of vals) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
};
const median = (vals: number[]): number => {
  const s = [...vals].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

console.log("\n" + "=".repeat(84));
console.log("HISTOGRAM 1 — castTimeSec (STARTUP) over all " + all.length);
console.log("=".repeat(84));
const cts = castable.filter((a) => ctOf(a) > 0).map(ctOf);
const noCt = all.length - cts.length;
for (const [v, n] of [...hist(castable.map(ctOf))].sort((a, b) => a[0] - b[0])) {
  const bar = "#".repeat(Math.round(n / 4));
  console.log(`  ${v === 0 ? "instant" : v.toFixed(2) + "s"}`.padEnd(12) + `${String(n).padStart(4)}  ${bar}`);
}
console.log(`  (+ ${all.length - castable.length} passive-only, no field at all)`);
console.log(
  `  of the ${cts.length} that actually wind up: MEDIAN ${median(cts).toFixed(2)}s  mean ${(cts.reduce((a, b) => a + b, 0) / cts.length).toFixed(3)}s  min ${Math.min(...cts)}s  max ${Math.max(...cts)}s`,
);
console.log(`  abilities with NO startup at all: ${noCt} (${all.length - castable.length} passive + ${castable.filter(a=>ctOf(a)===0).length} rapid-fire)`);

console.log("\n" + "=".repeat(84));
console.log("HISTOGRAM 2 — recoverySec (RECOVERY)");
console.log("=".repeat(84));
const authored = all.filter((a) => a.recoverySec !== undefined);
console.log(`  authored in content:      ${authored.length} / ${all.length}`);
console.log(`  using DEFAULT_RECOVERY_SEC = ${DEFAULT_RECOVERY_SEC}s: ${all.length - authored.length}`);
for (const [v, n] of [...hist(castable.map(recOf))].sort((a, b) => a[0] - b[0])) {
  console.log(`  ${v.toFixed(2)}s`.padEnd(12) + `${String(n).padStart(4)}  ${"#".repeat(Math.round(n / 4))}`);
}
console.log(`  recoveryRoots:true on ${all.filter((a) => a.recoveryRoots === true).length} (default = output lock only, footwork free)`);
// how much recovery is OBSERVED, given unwhiffable cancels on the resolve tick
const byRule = { damage: 0, applied: 0, unwhiffable: 0 } as Record<string, number>;
for (const a of castable) byRule[connectRuleOf(a)]!++;
console.log(
  `\n  OBSERVED recovery: ${byRule.unwhiffable} "unwhiffable" abilities cancel on the resolve tick and pay ZERO.\n` +
    `  Only ${byRule.damage} damage + ${byRule.applied} applied abilities can ever pay it, and only on a MISS.`,
);

// ─────────────────────────────────────────── 5. DID ANYTHING BECOME USELESS?
console.log("\n" + "=".repeat(84));
console.log("USELESSNESS AUDIT");
console.log("=".repeat(84));

// (1) DASHES — an escape that roots first
const dashes = castable.filter((a) => a.castType === "dash");
console.log(`\n[1] DASHES / ESCAPES — ${dashes.length} total`);
for (const d of dashes.sort((a, b) => ctOf(b) - ctOf(a))) {
  console.log(
    `    ${ctOf(d) === 0 ? "INSTANT" : ctOf(d).toFixed(2) + "s root first"}  cd ${cdOf(d).toFixed(2)}s  ` +
      `rule=${connectRuleOf(d)}  ${nameOf(d)}`,
  );
}
const rootedDashes = dashes.filter((d) => ctOf(d) > 0);
console.log(
  `    => ${rootedDashes.length} of ${dashes.length} dashes now stand still for ${Math.round(Math.min(...rootedDashes.map(ctOf)) / DT)}+ ticks BEFORE moving.`,
);

// (2) COUNTERS — is there any castType that implies reactive use?
const types = new Map<string, number>();
for (const a of castable) types.set(a.castType, (types.get(a.castType) ?? 0) + 1);
console.log(`\n[2] COUNTERS / REACTIVE ABILITIES`);
console.log(`    castType census: ${[...types].sort().map(([k, v]) => `${k}=${v}`).join("  ")}`);
console.log(`    There is no "counter"/"interrupt"/"toggle" castType in the content, so no ability is`);
console.log(`    mechanically a reactive parry. The closest are SELF defensive buffs, audited next.`);

// (3) HEALS / SHIELDS — would they eat recovery?
const defensive = castable.filter((a) => {
  const s = JSON.stringify(a.effects ?? []);
  return /"heal"|"shield"|"restore"/.test(s) && !/"damage"/.test(s);
});
const defByRule = new Map<string, AbilityDef[]>();
for (const d of defensive) {
  const r = connectRuleOf(d);
  (defByRule.get(r) ?? defByRule.set(r, []).get(r)!).push(d);
}
console.log(`\n[3] HEALS / SHIELDS / SAVES — ${defensive.length} non-damaging defensive abilities`);
for (const [rule, list] of [...defByRule].sort()) {
  console.log(
    `    ${rule.padEnd(12)} ${String(list.length).padStart(3)}  ` +
      (rule === "unwhiffable"
        ? "-> cannot miss, pays ZERO recovery. CORRECT."
        : rule === "applied"
          ? "-> connects when it lands on someone; a targeted heal always does. CORRECT."
          : "-> judged by DAMAGE, so it can never connect => eats FULL recovery every cast. BUG."),
  );
  if (rule === "damage") for (const d of list) console.log(`         !! ${nameOf(d)}`);
}
const slowSaves = defensive.filter((d) => ctOf(d) >= 0.6);
console.log(`    saves with a startup >= 0.6s (a save that lands late is not a save): ${slowSaves.length}`);
for (const d of slowSaves.slice(0, 8)) console.log(`      ${ctOf(d).toFixed(2)}s  ${nameOf(d)}`);

// (4) SELF-LOCK — commitment vs its own cooldown
console.log(`\n[4] SELF-LOCK — does startup + recovery outlive the ability's own cooldown?`);
const locks = castable
  .filter((a) => cdOf(a) > 0 && ctOf(a) + recOf(a) >= cdOf(a))
  .sort((a, b) => ctOf(b) + recOf(b) - cdOf(b) - (ctOf(a) + recOf(a) - cdOf(a)));
console.log(`    abilities where startup+recovery >= cooldown: ${locks.length}`);
for (const a of locks.slice(0, 12))
  console.log(
    `      ct ${ctOf(a).toFixed(2)} + rec ${recOf(a).toFixed(2)} = ${(ctOf(a) + recOf(a)).toFixed(2)}s vs cd ${cdOf(a).toFixed(2)}s   ${nameOf(a)}`,
  );
console.log(`    NOTE: recovery is cancelled on a HIT, and ${byRule.unwhiffable} abilities cannot miss,`);
console.log(`    so this only bites on a genuine WHIFF. Listed as the worst-case commitment.`);

// (5) BUSIEST CHAMPIONS — total commitment if they press everything
console.log(`\n[5] WORST-CASE COMMITMENT PER CHAMPION (all 4 slots whiffed back to back)`);
const rows = Champions.all().map((c) => {
  const slots = (["Q", "W", "E", "R"] as const)
    .map((s) => Abilities.tryGet(c.abilities[s]?.id ?? ""))
    .filter((a): a is AbilityDef => !!a && !isPassiveOnly(a));
  const total = slots.reduce((acc, a) => acc + ctOf(a) + recOf(a), 0);
  return { name: c.name, id: c.id, total, n: slots.length };
});
rows.sort((a, b) => b.total - a.total);
for (const r of rows.slice(0, 8))
  console.log(`      ${r.total.toFixed(2)}s over ${r.n} slots   ${r.name} (${r.id})`);
console.log(
  `    roster mean ${(rows.reduce((a, r) => a + r.total, 0) / rows.length).toFixed(2)}s, median ${median(rows.map((r) => r.total)).toFixed(2)}s`,
);
