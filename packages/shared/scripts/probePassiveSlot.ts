#!/usr/bin/env tsx
/**
 * RUNTIME PROBE — does the SIXTH slot (天生技 / PASSIVE) actually LOAD?
 *
 * The owner's rule is six slots per champion, not five:
 * 「每個人應該是六種，被動也是包含 slot，我說過他是等級1就獲得」. The w3x importer
 * dropped the level-1 innate (`NN-00` in the source map) entirely, so content
 * shipped Q/W/E/R/EX and nothing else. This drives the REAL boot pair
 * (`ContentLoader` + `registerAll`, exactly what the game-server runs) over the
 * REAL content tree and asserts, per champion that declares a passive:
 *   • `champion.passiveAbility` resolves through the abilities registry,
 *   • the object it resolves to is the STANDALONE doc, not a copy,
 *   • `innateKind` is present and says which of the two kinds it is,
 *   • an "active" innate carries the cast time the formula derives, and a
 *     "passive" one carries none at all (it can never be cast).
 *
 *     npx tsx packages/shared/scripts/probePassiveSlot.ts
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

import { ContentLoader, registerAll } from "../src/content/index";
import { FsContentSource } from "../src/content/node/index";
import { Abilities, Champions, championPassive } from "../src/sim/content/registry";
import { isPassiveOnly } from "../src/sim/abilities/abilityPassives";
import { deriveCastTime } from "../src/content/castTimeFormula";
import type { ChampionId } from "../src/ids";

const CONTENT_DIR = process.env.GGD_CONTENT_DIR ?? join(__dirname, "../../../content");
const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
registerAll(result.store);

const env = result.store.tryGet<{ multipliers: Record<string, number> }>("config", "combat-env");
const cdMult = env?.multipliers.cooldown ?? 1;

console.log(`contentVersion ${result.manifest.contentVersion}`);
console.log(`${Abilities.ids().length} abilities, ${Champions.ids().length} champions\n`);

const withPassive = (Champions.ids() as ChampionId[]).filter(
  (id) => Champions.get(id).passiveAbility !== undefined,
);
const passiveDocs = Abilities.all().filter((a) => a.slot === "PASSIVE");

let pass = 0;
let fail = 0;
const problem = (msg: string): void => {
  console.log(`  ✗ ${msg}`);
  fail++;
};

for (const cid of withPassive) {
  const champ = Champions.get(cid);
  const def = championPassive(cid);
  console.log(`${cid}  ${champ.name}`);
  if (!def) {
    problem(`passiveAbility ${String(champ.passiveAbility)} does not resolve`);
    continue;
  }
  console.log(
    `  ${def.id.padEnd(24)} "${def.name}"  slot=${def.slot} innateKind=${String(def.innateKind)}`,
  );
  console.log(
    `  SIX SLOTS: ${[
      ...(["Q", "W", "E", "R"] as const).map((s) => String(champ.abilities[s].id)),
      String(champ.exAbility),
      String(champ.passiveAbility),
    ].join("  ")}`,
  );

  if (def.slot !== "PASSIVE") problem(`slot is ${def.slot}, expected PASSIVE`);
  if (def.id !== `${cid}.passive`) problem(`id ${def.id} breaks the <championId>.passive convention`);
  if (Abilities.get(def.id) !== def) problem("registry returned a COPY, not the standalone doc");
  if (def.innateKind === undefined) problem("no innateKind — sim/UI cannot tell the two kinds apart");

  const want = deriveCastTime(def, cdMult).castTimeSec;
  if (def.castTimeSec !== want) {
    problem(`castTimeSec ${String(def.castTimeSec)} != formula ${String(want)}`);
  }
  if (def.innateKind === "passive") {
    if (!isPassiveOnly(def)) problem('innateKind "passive" but the doc is castable (effects non-empty)');
    if (def.castTimeSec !== undefined) problem("a passive-type innate must carry NO castTimeSec");
  }
  if (def.innateKind === "active" && def.effects.length === 0) {
    problem('innateKind "active" but the doc has no effects');
  }
  pass++;
}

console.log(
  `\n${withPassive.length} champion(s) carry passiveAbility; ${passiveDocs.length} ability doc(s) declare slot PASSIVE.`,
);
console.log(`${pass} probed, ${fail} problem(s).`);
if (withPassive.length !== passiveDocs.length) {
  console.log("NOTE: those two counts must match — an orphan passive doc is a dropped slot.");
}
process.exit(fail === 0 ? 0 : 1);
