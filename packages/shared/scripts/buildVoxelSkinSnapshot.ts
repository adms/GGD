/**
 * Regenerate `src/content/voxelSkin/__snapshots__/roster.json` — the committed
 * look signature of every champion (task #231).
 *
 * The snapshot is a REVIEW ARTIFACT, not a cache: nothing at runtime reads it.
 * Its only job is to turn "the generator moved and 114 heroes quietly changed
 * face" into a reviewable file diff. Run it deliberately after a change to the
 * ladders, the rule table or the palette maths, and READ the diff before
 * committing it.
 *
 *   pnpm --filter @ggd/shared voxel-skins:snapshot
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compactRecipe,
  generateAllVoxelSkins,
  lookSignature,
} from "../src/content/voxelSkin/generate";
import { voxelSkinInputOf, type ChampionLike } from "../src/content/voxelSkin/roster";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");
const CHAMPION_DIR = join(ROOT, "content/champions");
const OUT_DIR = join(HERE, "../src/content/voxelSkin/__snapshots__");

const docs = readdirSync(CHAMPION_DIR)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => JSON.parse(readFileSync(join(CHAMPION_DIR, f), "utf8")) as ChampionLike);

const { recipes, escalated, unresolved } = generateAllVoxelSkins(docs.map(voxelSkinInputOf));
const all = [...recipes.values()];

const signatures: Record<string, string> = {};
const names: Record<string, string> = {};
for (const r of all) {
  signatures[r.championId] = lookSignature(r);
  names[r.championId] = docs.find((d) => d.id === r.championId)?.name ?? "";
}

const compactBytes = JSON.stringify(
  Object.fromEntries(all.map((r) => [r.championId, compactRecipe(r)])),
).length;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  join(OUT_DIR, "roster.json"),
  JSON.stringify(
    {
      note: "GENERATED — pnpm --filter @ggd/shared voxel-skins:snapshot. Review the diff; a change here means champions changed face.",
      count: all.length,
      distinctSignatures: new Set(Object.values(signatures)).size,
      saltEscalations: escalated,
      unresolvedCollisions: unresolved,
      compactRecipeBytes: compactBytes,
      names,
      signatures,
    },
    null,
    2,
  ) + "\n",
);

console.log(
  `voxel-skin snapshot: ${all.length} champions, ${new Set(Object.values(signatures)).size} distinct looks, ${compactBytes} B compact`,
);
