#!/usr/bin/env tsx
/**
 * RUNTIME PROBE (diagnostic, not a test) — runs the exact two calls the
 * game-server makes at boot (apps/game-server/src/index.ts loadContent):
 *
 *     new ContentLoader(new FsContentSource(CONTENT_DIR)).load()
 *     registerAll(result.store)
 *
 * …then enumerates the REAL Abilities registry and reports the distribution.
 * Exists because "the field is in the JSON" and "the unit test passes" have
 * both repeatedly failed to catch champion-doc ability shadowing: only reading
 * the post-registration registry is evidence.
 *
 *     pnpm --filter @ggd/shared exec tsx scripts/probeAbilityRegistry.ts
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

import { ContentLoader, registerAll } from "../src/content/index";
import { FsContentSource } from "../src/content/node/index";
import { Abilities, Champions } from "../src/sim/content/registry";

const CONTENT_DIR = process.env.GGD_CONTENT_DIR ?? join(__dirname, "../../../content");

const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
registerAll(result.store);

const all = Abilities.all();
console.log(`contentVersion:       ${result.manifest.contentVersion}`);
console.log(`champions registered: ${Champions.ids().length}`);
console.log(`abilities registered: ${all.length}`);

const byVfx = new Map<string, number>();
for (const a of all) byVfx.set(a.vfxKey ?? "(none)", (byVfx.get(a.vfxKey ?? "(none)") ?? 0) + 1);
const ember = byVfx.get("fx.ember-bolt-cast") ?? 0;
console.log(
  `fx.ember-bolt-cast:   ${ember}  (${((ember / all.length) * 100).toFixed(1)}% of ${all.length})`,
);
console.log(`distinct vfxKeys:     ${byVfx.size}`);
console.log("top 8 vfxKeys:");
for (const [k, n] of [...byVfx.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`  ${String(n).padStart(4)}  ${k}`);
}

const ct = all.filter((a) => a.castTimeSec !== undefined);
console.log(`castTimeSec set on:   ${ct.length}`);
for (const a of [...ct].sort((x, y) => x.id.localeCompare(y.id))) {
  console.log(`  ${a.id} = ${a.castTimeSec}`);
}

// The OTHER half of the shadow: a lot of client code (HUD ability bar,
// tooltips, icons) and the bot brain read `Champions.get(id).abilities[slot]`
// instead of the Abilities registry. After registration the two must agree,
// or the fix has only moved house.
let slots = 0;
let disagree = 0;
let champSideEmber = 0;
for (const c of Champions.all()) {
  for (const s of ["Q", "W", "E", "R"] as const) {
    slots++;
    const emb = c.abilities[s];
    if (emb.vfxKey !== Abilities.get(emb.id).vfxKey) disagree++;
    if (emb.vfxKey === "fx.ember-bolt-cast") champSideEmber++;
  }
}
console.log(`\nChampions.get(id).abilities[slot]: ${slots} entries`);
console.log(`  disagreeing with Abilities:     ${disagree}`);
console.log(`  still fx.ember-bolt-cast:       ${champSideEmber}`);

const spot = Abilities.tryGet("godie-e001.q" as never);
console.log(`spot-check godie-e001.q vfxKey = ${spot?.vfxKey}`);
