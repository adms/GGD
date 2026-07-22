#!/usr/bin/env tsx
/**
 * CI gate: full content load (FsContentSource → schema.parse → hard-ref check)
 * + stale-index detection (recomputed hashes must match _index/manifest).
 * Exits non-zero on any error; soft-ref dangles are printed as warnings.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
import { ContentLoader, registerAll, Arenas, auditArenaCollision } from "../src/content/index";
import { ContentLoadError } from "../src/content/errors";
import { FsContentSource, rebuildAllIndexes } from "../src/content/node/index";

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

  const total = result.store.totalCount();
  console.log(`content OK: ${total} docs, contentVersion ${result.manifest.contentVersion}`);
  if (result.warnings.length > 0) {
    console.log(`${result.warnings.length} soft-ref warning(s):`);
    for (const w of result.warnings) console.log("  ⚠ " + w.message);
  }
}

void main();
