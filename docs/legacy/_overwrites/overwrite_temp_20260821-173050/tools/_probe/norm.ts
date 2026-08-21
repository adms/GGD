import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_STAT_NORMALIZATION, resolveChampionStats } from "../../packages/shared/src/content/statNormalization";
import { balancePopulationIds } from "../../packages/shared/testkit/balancePopulation";
import { ATTRIBUTE_ENV_DEFAULTS } from "../../packages/shared/src/sim/combatEnv";

const REPO = process.cwd();
const C = join(REPO, "content/champions");
const ids = balancePopulationIds(REPO);
const deps = { env: ATTRIBUTE_ENV_DEFAULTS } as never;
const N = DEFAULT_STAT_NORMALIZATION;
const growthKeys = N.appliesTo.filter((k) => N.channel[k] === "growth");
console.log("growth-channel normalized:", growthKeys.join(","));
let miss = 0, tot = 0;
const sample: string[] = [];
for (const id of ids) {
  const raw = JSON.parse(readFileSync(join(C, `${id}.json`), "utf8"));
  const out = resolveChampionStats(raw as never, N, deps) as { growth: Record<string, number> };
  for (const k of growthKeys) {
    tot++;
    const a = (raw.growth ?? {})[k] ?? 0;
    const b = out.growth[k] ?? 0;
    if (Math.abs(a - b) > 1e-9) { miss++; if (sample.length < 12) sample.push(`${id}.${k}: card ${a} vs norm ${b}`); }
  }
}
console.log(`卡上值 vs 正規化值：${tot - miss}/${tot} 相同`);
for (const s of sample) console.log("  " + s);
