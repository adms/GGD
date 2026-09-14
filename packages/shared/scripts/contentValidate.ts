#!/usr/bin/env tsx
/**
 * CI gate: full content load (FsContentSource → schema.parse → hard-ref check)
 * + stale-index detection (recomputed hashes must match _index/manifest).
 * Exits non-zero on any error; soft-ref dangles are printed as warnings.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
import {
  ContentLoader,
  registerAll,
  Arenas,
  auditArenaCollision,
  auditAbilityMirrorDrift,
  parseContentBundle,
} from "../src/content/index";
import { ContentLoadError } from "../src/content/errors";
import { FsContentSource, rebuildAllIndexes, bundlePath } from "../src/content/node/index";
import { Abilities as AbilitiesRegistry } from "../src/sim/content/registry";
import { isPassiveOnly } from "../src/sim/abilities/abilityPassives";
import {
  DEFAULT_CAST_TIME_TIERS,
  resolveCastTimeTier,
  type CastTimeTiers,
} from "../src/content/castTimeTiers";

const CONTENT_DIR = process.env.GGD_CONTENT_DIR ?? join(__dirname, "../../../content");

async function main(): Promise<void> {
  if (!existsSync(CONTENT_DIR)) {
    console.error(`content dir not found: ${CONTENT_DIR} — run \`pnpm content:export\` first`);
    process.exit(1);
  }

  // 1) full load: manifest -> indexes -> objects -> schema.parse -> hard refs
  const loader = new ContentLoader(new FsContentSource(CONTENT_DIR));
  let result;
  try {
    result = await loader.load();
  } catch (e) {
    if (e instanceof ContentLoadError) {
      console.error("content validation FAILED:");
      for (const err of e.errors) console.error("  ✗ " + err.message);
      process.exit(1);
    }
    throw e;
  }

  // 2) stale-index detection: recomputed hashes must equal the committed ones
  const recomputed = rebuildAllIndexes(CONTENT_DIR, { write: false });
  if (recomputed.contentVersion !== result.manifest.contentVersion) {
    console.error(
      `stale indexes: manifest contentVersion ${result.manifest.contentVersion} != ` +
        `recomputed ${recomputed.contentVersion} — run \`pnpm content:build\``,
    );
    process.exit(1);
  }

  // 2b) STALE BUNDLE detection. content/bundle.json is a committed derived
  //     artifact and, since it became the primary transport, the thing the
  //     client actually reads. Step 2 above cannot see it: rebuildAllIndexes
  //     with `{ write: false }` short-circuits writeContentBundle, so a bundle
  //     built from OLD docs passes this gate green while the game-server
  //     (FsContentSource, always fresh) serves the new ones — the client and
  //     the server silently disagree about content, which is exactly the drift
  //     the bundle design says it is defending against. Nothing else checks
  //     this: no consumer in apps/client ever compares its loaded
  //     contentVersion against the server's.
  //     No re-hashing needed — the bundle carries the collection hashes.
  const bundleFile = bundlePath(CONTENT_DIR);
  if (existsSync(bundleFile)) {
    let bundle;
    try {
      bundle = parseContentBundle(JSON.parse(readFileSync(bundleFile, "utf8")));
    } catch (e) {
      console.error(
        `content/bundle.json is unreadable (${e instanceof Error ? e.message : String(e)}) — ` +
          "run `pnpm content:build`",
      );
      process.exit(1);
    }
    const drift: string[] = [];
    if (bundle.contentVersion !== recomputed.contentVersion) {
      drift.push(`contentVersion ${bundle.contentVersion} != ${recomputed.contentVersion}`);
    }
    for (const [name, meta] of Object.entries(recomputed.collections)) {
      const got = bundle.collections[name as keyof typeof bundle.collections]?.hash;
      if (got !== meta?.hash) drift.push(`${name} hash ${String(got)} != ${String(meta?.hash)}`);
    }
    if (drift.length > 0) {
      console.error("stale content/bundle.json — run `pnpm content:build`:");
      for (const d of drift) console.error("  ✗ " + d);
      process.exit(1);
    }
  }

  // 3) registration smoke: the registries must accept the whole store
  registerAll(result.store);

  // 3b) arena collision completeness: every blocking decor prop must have a
  //     matching collision obstacle (no walk-through map objects).
  let collisionGaps = 0;
  for (const arena of Arenas.all()) {
    const audit = auditArenaCollision(arena);
    for (const g of audit.gaps) {
      collisionGaps++;
      console.error(
        `  ✗ ${arena.id}: blocking prop ${g.model} @ (${g.x},${g.z}) has NO collision obstacle`,
      );
    }
  }
  if (collisionGaps > 0) {
    console.error(`arena collision INCOMPLETE: ${collisionGaps} blocking prop(s) can be walked through`);
    process.exit(1);
  }

  // 3c) MIRROR DRIFT: every Q/W/E/R ability is stored twice (standalone doc +
  //     the copy denormalised into its champion). Registration now makes the
  //     standalone doc win, so drift is no longer a sim bug — but every
  //     raw-doc consumer (codex browser, admin content page) still renders the
  //     embedded copy, so a drifted pair means the UI and the match disagree.
  //     Reported, never fatal: 194 pairs are already drifted on disk and this
  //     gate is not the lane that gets to rewrite content/.
  const drift = auditAbilityMirrorDrift(result.store);
  if (drift.length > 0) {
    const fields = new Map<string, number>();
    for (const d of drift) fields.set(d.field, (fields.get(d.field) ?? 0) + 1);
    console.log(
      `${drift.length} ability mirror drift(s) — the standalone doc wins at runtime, ` +
        "but raw-doc UIs still show the champion's embedded copy:",
    );
    for (const [f, n] of [...fields].sort((a, b) => b[1] - a[1])) console.log(`  ⚠ ${f}: ${n}`);
    for (const d of drift.slice(0, 5)) {
      console.log(
        `    e.g. ${d.abilityId} (${d.championId}.${d.slot}) ${d.field}: ` +
          `${JSON.stringify(d.standalone)} (doc) vs ${JSON.stringify(d.embedded)} (embedded)`,
      );
    }
  }

  // 3d) CAST-TIME COVERAGE. The 907/907 migration is complete: `castTimeTier`
  //     is the authoring source and the runtime resolver materialises seconds.
  //     Damage/cooldown/shape must never be used to reconstruct another value.
  const envDoc = result.store.tryGet<{ multipliers: Record<string, number> }>(
    "config",
    "combat-env",
  );
  const cdMult = envDoc?.multipliers.cooldown ?? 1;
  const castTimeTiers =
    result.store.tryGet<CastTimeTiers>("config", "cast-time-tiers") ?? DEFAULT_CAST_TIME_TIERS;
  const ctWrong: string[] = [];
  for (const def of AbilitiesRegistry.all()) {
    const want = resolveCastTimeTier(def.castTimeTier, castTimeTiers);
    if (want === null || def.castTimeSec !== want) {
      ctWrong.push(`${def.id}: tier ${String(def.castTimeTier)} -> ${String(want)}, runtime ${String(def.castTimeSec)}`);
    }
  }
  if (ctWrong.length > 0) {
    console.error("cast-time coverage FAILED — runtime disagrees with castTimeTier:");
    for (const line of ctWrong.slice(0, 20)) console.error(`  ✗ ${line}`);
    if (ctWrong.length > 20) console.error(`  ✗ …and ${ctWrong.length - 20} more`);
    console.error("  fix: set a valid castTimeTier, then run `pnpm castderive:build`");
    process.exit(1);
  }

  // 3e) SELF-ROOT LOCK (reported, never fatal). `rootWhileCasting` defaults
  //     true and nothing overrides it, so a cast time is also a self-root. An
  //     ability whose cooldown — AFTER content/config/combat-env.json's
  //     `cooldown` multiplier — is shorter than its own cast time is pressable
  //     again before that root expires, so a caster who spams it never leaves
  //     the cast state. The Tier0 bot (apps/game-server/src/ai/Tier0Brain.ts)
  //     does exactly that: it casts every ready ability every tick.
  const rootLock = AbilitiesRegistry.all()
    .filter((d) => !isPassiveOnly(d) && (d.castTimeSec ?? 0) > 0)
    .map((d) => ({ d, realCd: Math.min(...d.cooldown) * cdMult }))
    .filter((r) => r.realCd < (r.d.castTimeSec ?? 0));
  if (rootLock.length > 0) {
    console.log(
      `${rootLock.length} SELF-ROOT-LOCK ability(s) — cooldown x${cdMult} is shorter than the ` +
        "cast time, so spamming the button never leaves the cast state:",
    );
    for (const r of rootLock) {
      console.log(
        `  ⚠ ${r.d.id} ${r.d.name}: cd ${Math.min(...r.d.cooldown)}s x${cdMult} = ` +
          `${r.realCd.toFixed(3)}s < castTimeSec ${r.d.castTimeSec}s`,
      );
    }
  }

  const total = result.store.totalCount();
  console.log(`content OK: ${total} docs, contentVersion ${result.manifest.contentVersion}`);
  if (result.warnings.length > 0) {
    console.log(`${result.warnings.length} soft-ref warning(s):`);
    for (const w of result.warnings) console.log("  ⚠ " + w.message);
  }
}

void main();
