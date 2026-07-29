/**
 * GENERATOR — `content/vfx/fx.fam.*.json` + `content/config/vfx-families.json`.
 *
 *   pnpm --filter @ggd/client exec tsx src/render/vfx/generateFamilyContent.ts
 *   (or from the repo root: pnpm exec tsx apps/client/src/render/vfx/generateFamilyContent.ts)
 *
 * Everything it writes is a pure function of `w3xArtFamilies.ts` (the 21
 * prototypes), `w3xFamilyArt.ts` (the evidence table) and `bindings.ts` (the
 * name classification that supplies the colour). It NEVER reads what is already
 * on disk, so a stale file cannot influence the next generation, and
 * `familyContent.test.ts` re-runs the same functions and diffs them against the
 * tree — drift is a red test, not a surprise in a match.
 *
 * ⚠️ Run `pnpm content:build` afterwards. Every `content/` edit must, or
 * `bundle.test.ts` goes red on the stale `_index.json` hash.
 *
 * WHY THE CONFIG DOC IS GENERATED TOO. The console's shipped starting point has
 * to agree with the code's defaults field-for-field, or the first save silently
 * changes 258 abilities. Generating it from the same constants is the only way
 * that stays true as the prototypes are retuned.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConfigVfxFamiliesDoc } from "@ggd/shared/content";
import {
  DEFAULT_SCALE_MAPPING,
  W3X_ART_FAMILIES,
  W3X_ART_FAMILY_IDS,
  type W3xArtFamily,
} from "./w3xArtFamilies";
import { W3X_FAMILY_ART } from "./w3xFamilyArt";
import { requiredFamilyDocs } from "./familyTuning";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CONTENT_DIR = join(HERE, "../../../../../content");

/** The shipped `config.vfx-families@1` doc, built from the code's own defaults. */
export function shippedFamilyConfig(): ConfigVfxFamiliesDoc {
  const families: ConfigVfxFamiliesDoc["families"] = {};
  for (const id of W3X_ART_FAMILY_IDS) {
    const p = W3X_ART_FAMILIES[id];
    families[id] = {
      enabled: true,
      primitive: p.primitive,
      element: p.element,
      scale: p.scale,
      alpha: p.alpha,
      timeScale: p.timeScale,
      heightY: p.heightY,
    };
  }
  // Per-ability rows carry the MAP'S OWN numbers, and only those. An ability
  // the map stated nothing about gets an entry with just its family, so the
  // console can still see and retarget it — an empty object would read as
  // "unbound" in the UI when it is in fact bound with no overrides.
  const abilities: ConfigVfxFamiliesDoc["abilities"] = {};
  for (const [abilityId, row] of Object.entries(W3X_FAMILY_ART).sort(([a], [b]) => a.localeCompare(b))) {
    abilities[abilityId] = {
      family: row.family as W3xArtFamily,
      ...(row.scale !== undefined ? { w3xScale: row.scale } : {}),
      ...(row.tint ? { tint: [row.tint[0], row.tint[1], row.tint[2]] as [number, number, number] } : {}),
      ...(row.flyHeight !== undefined ? { flyHeight: row.flyHeight } : {}),
      ...(row.anchor ? { anchor: row.anchor } : {}),
    };
  }
  return {
    id: "vfx-families",
    schema: "config.vfx-families@1",
    enabled: true,
    scaleGain: DEFAULT_SCALE_MAPPING.gain,
    scaleMin: DEFAULT_SCALE_MAPPING.min,
    scaleMax: DEFAULT_SCALE_MAPPING.max,
    families,
    abilities,
  };
}

function stable(v: unknown): string {
  return `${JSON.stringify(v, null, 2)}\n`;
}

function main(): void {
  const docs = requiredFamilyDocs(null);
  const vfxDir = join(CONTENT_DIR, "vfx");
  mkdirSync(vfxDir, { recursive: true });
  // ORPHAN SWEEP FIRST. A retune changes which (family × colour × tier) keys
  // exist, and a left-behind `fx.fam.*` doc is not harmless: it is a schema-
  // valid file nothing points at, so it rides into the bundle, into every
  // client's download, and into any "which docs are unused" audit as noise.
  // Only `fx.fam.` files are touched — this generator owns that prefix and
  // nothing else in `content/vfx/`.
  let removed = 0;
  for (const f of readdirSync(vfxDir)) {
    if (!f.startsWith("fx.fam.") || !f.endsWith(".json")) continue;
    if (docs.has(f.slice(0, -".json".length))) continue;
    rmSync(join(vfxDir, f));
    removed += 1;
  }
  for (const [id, doc] of [...docs].sort(([a], [b]) => a.localeCompare(b))) {
    writeFileSync(join(vfxDir, `${id}.json`), stable(doc));
  }
  writeFileSync(join(CONTENT_DIR, "config", "vfx-families.json"), stable(shippedFamilyConfig()));
  const perFamily: Record<string, number> = {};
  for (const row of Object.values(W3X_FAMILY_ART)) perFamily[row.family] = (perFamily[row.family] ?? 0) + 1;
  process.stdout.write(
    `wrote ${docs.size} fx.fam docs (removed ${removed} orphan) + config/vfx-families.json ` +
      `for ${Object.keys(W3X_FAMILY_ART).length} abilities\n` +
      `${Object.entries(perFamily)
        .sort((a, b) => b[1] - a[1])
        .map(([f, n]) => `  ${f}: ${n}`)
        .join("\n")}\n` +
      `NEXT: pnpm content:build\n`,
  );
}

// `tsx path/to/this.ts` runs it; importing it from a test does not.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
