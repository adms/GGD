#!/usr/bin/env tsx
/**
 * (Re)build every content/<collection>/_index.json + content/manifest.json +
 * content/bundle.json (the one-file transport bundle).
 * Pure function of the docs on disk — no timestamps, deterministic output.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { gzipSync, brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
import { bundlePath, rebuildAllIndexes } from "../src/content/node/index";
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

// The one-file transport bundle (content/bundle.json). Print what the wire
// actually costs: nginx already gzips application/json above gzip_min_length,
// so the gzip figure is what prod serves today; brotli is what it would serve
// once brotli_static is configured. Compression here is MEASUREMENT ONLY — no
// .gz/.br siblings are emitted (they would be a second artifact that can drift).
const bfile = bundlePath(CONTENT_DIR);
if (existsSync(bfile)) {
  const raw = readFileSync(bfile);
  const gz = gzipSync(raw, { level: 9 }).length;
  const br = brotliCompressSync(raw, {
    params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;
  const docCount = COLLECTION_NAMES.reduce(
    (n, name) => n + (manifest.collections[name]?.count ?? 0),
    0,
  );
  console.log(
    `bundle.json:    ${docCount} doc(s)  ${statSync(bfile).size} B raw  ${gz} B gzip-9  ${br} B brotli-11`,
  );
}
