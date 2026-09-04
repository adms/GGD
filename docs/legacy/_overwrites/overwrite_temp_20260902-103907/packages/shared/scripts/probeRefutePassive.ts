#!/usr/bin/env tsx
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
import { ContentLoader, registerAll } from "../src/content/index";
import { FsContentSource } from "../src/content/node/index";
import { Abilities } from "../src/sim/content/registry";
import { isPassiveOnly } from "../src/sim/abilities/abilityPassives";
import { innateCastBlock } from "../src/sim/abilities/innateActive";

const CONTENT_DIR = process.env.GGD_CONTENT_DIR ?? join(__dirname, "../../../content");
const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
registerAll(result.store);
const all = Abilities.all();
console.log(`SHIPPED abilities loaded: ${all.length}`);

const lead = (d: string): string[] => {
  const head = (d ?? "").split("\n", 1)[0] ?? "";
  return [...head.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]!);
};
let castablePassiveTagged = 0;
const rows: string[] = [];
for (const def of all) {
  const tags = lead((def as { description?: string }).description ?? "");
  const passiveTagged = tags.some((t) => t.includes("被動") || t.includes("靈氣"));
  if (!passiveTagged) continue;
  const blocked = innateCastBlock(def) !== null || isPassiveOnly(def);
  if (blocked) continue;
  castablePassiveTagged++;
  rows.push(
    `  ${def.id.padEnd(20)} slot=${String(def.slot).padEnd(8)} innateKind=${String((def as {innateKind?:string}).innateKind)} ` +
    `passiveBlock=${(def as Record<string,unknown>).passive !== undefined} effects=${def.effects.length} ct=${(def as {castTimeSec?:number}).castTimeSec}`,
  );
}
console.log(`\nSHIPPED defs tagged [被動]/[靈氣] on the card AND NOT blocked by either sim gate: ${castablePassiveTagged}`);
console.log(rows.join("\n"));
