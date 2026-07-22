#!/usr/bin/env tsx
/**
 * (Re)build every content/<collection>/_index.json + content/manifest.json.
 * Pure function of the docs on disk — no timestamps, deterministic output.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
import { rebuildAllIndexes } from "../src/content/node/index";
import { COLLECTION_NAMES } from "../src/content/schema/index";

const CONTENT_DIR = process.env.GGD_CONTENT_DIR ?? join(__dirname, "../../../content");

if (!existsSync(CONTENT_DIR)) {
  console.error(`content dir not found: ${CONTENT_DIR} — run \`pnpm content:export\` first`);
  process.exit(1);
}

const manifest = rebuildAllIndexes(CONTENT_DIR);
for (const name of COLLECTION_NAMES) {
  const c = manifest.collections[name];
  if (c) console.log(`  ${name.padEnd(15)} ${String(c.count).padStart(3)} doc(s)  ${c.hash}`);
}
console.log(`contentVersion: ${manifest.contentVersion}`);
