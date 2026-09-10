/**
 * combatLinesLib.mjs — the ONE place the combat-voice generator and its headless
 * runner agree on paths, the status.json line contract, and "does this clip
 * still need rendering". Both `build-combat-lines.mjs` and `run-combat-gen.mjs`
 * import from here so the rule cannot drift between them (第〇·四守則).
 *
 * The status.json shape is the daemon's (`serve.mjs`): `lines[<cat>] =
 * { text, lang, kana?, textSource, state, takes[], current, lastError }` and
 * `reference = { sha256, path, source, sourceKind, … }`. `index-lines.mjs`
 * reads exactly that, so a pack produced here ships through the SAME reader
 * as the 51 daemon-made packs (failure shape ⑤: test the shipped path).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const LINES_DIR = join(ROOT, "content", "assets", "audio", "voices", "lines");
export const CATEGORIES_PATH = join(LINES_DIR, "CATEGORIES.json");
export const ROSTER_PATH = join(LINES_DIR, "ROSTER.json");
export const CASTING_PATH = join(LINES_DIR, "COMBAT_CASTING.json");
export const GRUNTS_PATH = join(LINES_DIR, "COMBAT_GRUNTS.json");
export const OWNER_LINES_PATH = join(LINES_DIR, "OWNER_LINES.csv");
export const READINGS_PATH = join(LINES_DIR, "SKILL_READINGS.json");
export const ORIGINALS_PATH = join(LINES_DIR, "COMBAT_ORIGINALS.json");
export const REFS_DIR = join(ROOT, "voice-reference-pipeline", "approved", "processed");
export const SYNTH = join(ROOT, "tools", "voice-gen", "synth.py");
export const OUT_DIR = join(ROOT, "tools", "voice-gen", "out"); // gitignored scratch
export const ENGINE = { name: "cosyvoice3", version: "cv3-0.5b" };
export const ENGINE_PYTHON =
  process.env.VOICE_GEN_PYTHON ?? "/Users/Takuro/ggd-voice-cosyvoice3/.venv/bin/python";

/** The two axes every shipped clip must pass (81 英雄語音補檔計劃書 §6). */
export const MIN_SECONDS = 0.15;
export const MIN_MAX_VOLUME_DB = -60;

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

export function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

/** Same serialisation as the daemon (indent 1) so a status.json round-trips byte-for-byte. */
export const serializeStatus = (doc) => JSON.stringify(doc, null, 1) + "\n";

export function writeJsonAtomic(path, doc) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, serializeStatus(doc), "utf8");
  renameSync(tmp, path);
}

export const statusPath = (id) => join(LINES_DIR, id, "status.json");
export const clipPath = (id, cat) => join(LINES_DIR, id, `${cat}.mp3`);

/** Expand CATEGORIES.json to the authoritative 46-key list (never a glob). */
export function canonicalCategories(cats) {
  const out = [];
  for (const c of cats.categories) {
    if (c.expand === "abilitySlots") for (const s of cats.expansions.abilitySlots) out.push(`${c.id}.${s}`);
    else if (c.expand === "okNo") for (const s of cats.expansions.okNo) out.push(`${c.id}.${s}`);
    else out.push(c.id);
  }
  return out;
}

/** Minimal RFC-4180 reader (quotes, embedded commas/newlines, BOM). Returns rows of objects. */
export function parseCsv(text) {
  const src = text.replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = (rows.shift() ?? []).map((h) => h.trim());
  return { header, rows: rows.filter((r) => r.some((c) => c.trim() !== "")).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()]))) };
}

/**
 * Which reference wav speaks for `id`. The hero's OWN take wins the moment it
 * exists under approved/processed/ (that is the rollback switch the casting
 * table documents); otherwise the casting table's donor.
 */
export function referenceFor(id, casting) {
  const own = join(REFS_DIR, `${id}.wav`);
  if (existsSync(own)) {
    return { path: own, source: `voice-reference-pipeline/approved/processed/${id}.wav`, sourceKind: "repo", donor: null };
  }
  const donor = casting?.champions?.[id]?.donor;
  if (!donor) return null;
  const p = join(REFS_DIR, `${donor}.wav`);
  if (!existsSync(p)) return { error: `donor reference missing: ${p}` };
  return { path: p, source: `voice-reference-pipeline/approved/processed/${donor}.wav`, sourceKind: "donor", donor };
}

/**
 * null when the clip on disk is the one status.json vouches for; otherwise the
 * reason it must be (re)rendered. Byte-size is the same test index-lines.mjs
 * applies, so "needs render" and "would ship" can never disagree.
 */
export function needsRender(rec, mp3) {
  if (!rec || typeof rec.text !== "string" || rec.text === "") return "no-text";
  if (!rec.current) return rec.state === "failed" ? `failed: ${rec.lastError ?? "?"}` : "no-current";
  if (!existsSync(mp3)) return "no-mp3";
  const size = statSync(mp3).size;
  if (typeof rec.current.bytes === "number" && rec.current.bytes !== size) return `bytes-mismatch ${rec.current.bytes}≠${size}`;
  return null;
}
