#!/usr/bin/env node

/**
 * Turn each accepted skill's 2..18 framebuffer keyframes into one chronological
 * contact sheet. The output is review convenience only and never creates a
 * verdict. Source digests make stale sheets fail the compact acceptance gate.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PROOF_DIR = join(ROOT, "docs/_reports/editor-skill-basic-visual-proof");
const MANIFEST = join(PROOF_DIR, "manifest.json");
const OUT_DIR = join(ROOT, "docs/_reports/editor-skill-human-review/sheets");
const RECEIPT = join(ROOT, "docs/_reports/editor-skill-human-review/sheets.json");
const CHECK = process.argv.includes("--check");
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
if (manifest.schema !== "ggd-editor-basic-visual-proof-manifest@1" || manifest.cases?.length !== 46) {
  fail("visual proof manifest must contain the exact 46-document scope");
}

const rows = manifest.cases.map((row) => {
  if (row.status !== "captured" || !Array.isArray(row.frames) || row.frames.length < 2 || row.frames.length > 18) {
    fail(`${row.id}: contact sheet requires 2..18 captured keyframes`);
  }
  const inputs = row.frames.map((frame) => join(PROOF_DIR, frame.file));
  const hash = createHash("sha256");
  hash.update(row.id).update("\0");
  for (const input of inputs) {
    if (!existsSync(input)) fail(`${row.id}: missing ${relative(ROOT, input)}`);
    hash.update(readFileSync(input)).update("\0");
  }
  const file = `${safe(row.id)}.png`;
  return {
    id: row.id,
    frameCount: inputs.length,
    timesMs: row.frames.map((frame) => frame.atMs),
    sourceDigest: hash.digest("hex"),
    file: `sheets/${file}`,
    inputs,
    output: join(OUT_DIR, file),
  };
});

const receipt = {
  schema: "ggd-editor-skill-contact-sheets@1",
  authority: "review-convenience-only",
  documents: rows.length,
  rows: rows.map(({ inputs: _inputs, output: _output, ...row }) => row),
};
const encoded = `${JSON.stringify(receipt, null, 2)}\n`;

if (CHECK) {
  if (!existsSync(RECEIPT) || readFileSync(RECEIPT, "utf8") !== encoded) fail("contact sheet receipt is stale");
  for (const row of rows) if (!existsSync(row.output)) fail(`${row.id}: contact sheet is missing`);
  console.log("PASS 46 chronological visual contact sheets are current");
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const row of rows) render(row);
writeFileSync(RECEIPT, encoded);
console.log(`WROTE ${rows.length} chronological visual contact sheets`);

function render(row) {
  const width = 320;
  const height = 180;
  const columns = Math.min(6, row.inputs.length);
  const args = ["-y", "-hide_banner", "-loglevel", "error"];
  for (const input of row.inputs) args.push("-i", input);
  const filters = row.inputs.map((_, index) =>
    `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black[v${index}]`,
  );
  if (row.inputs.length === 1) {
    filters.push("[v0]null[out]");
  } else {
    const layout = row.inputs.map((_, index) => `${(index % columns) * width}_${Math.floor(index / columns) * height}`).join("|");
    filters.push(`${row.inputs.map((_, index) => `[v${index}]`).join("")}xstack=inputs=${row.inputs.length}:layout=${layout}:fill=black[out]`);
  }
  args.push("-filter_complex", filters.join(";"), "-map", "[out]", "-frames:v", "1", row.output);
  const result = spawnSync("ffmpeg", args, { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) fail(`${row.id}: ffmpeg failed: ${(result.stderr ?? "").trim()}`);
}

function safe(id) { return id.replace(/[^a-zA-Z0-9._-]+/g, "-"); }
function fail(message) { console.error(`FAIL contact sheets: ${message}`); process.exit(1); }
