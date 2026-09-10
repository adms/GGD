#!/usr/bin/env node
/**
 * run-combat-gen.mjs — HEADLESS render of every combat line that
 * `build-combat-lines.mjs` scripted and nothing has rendered yet, through the
 * same `synth.py` + CosyVoice 3 venv the admin daemon shells out to.
 *
 *   node tools/voice-gen/src/run-combat-gen.mjs [--shards 3] [--limit N] [--hero <id>] [--dry-run]
 *
 * What it stamps into status.json is the daemon's `current` block (bytes, sha256,
 * seconds, take) — `index-lines.mjs` verifies bytes against disk, so a clip only
 * ships when this file and the mp3 agree.
 *
 * ⭐ TWO AXES, AND THE RULER PROVES ITSELF FIRST (計劃書 §6, 第一守則
 * 「一把只驗過單邊的尺，不算自證過」): before any clip is judged, a synthetic
 * 0.5 s of digital silence must measure ≤ −80 dB AND a known-voiced shipped clip
 * must measure ≥ −30 dB. If either fails the run aborts — every verdict from a
 * blind ruler is void. Then each rendered clip must be ≥ 0.15 s AND peak ≥ −60 dB;
 * a clip that fails is deleted (with its .method sidecar) and marked `failed`
 * so the next run re-renders it instead of shipping silence.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  CASTING_PATH, CATEGORIES_PATH, ENGINE, ENGINE_PYTHON, LINES_DIR, MIN_MAX_VOLUME_DB, MIN_SECONDS,
  OUT_DIR, ROOT, SYNTH, canonicalCategories, clipPath, needsRender, readJson, sha256, statusPath,
  writeJsonAtomic,
} from "./combatLinesLib.mjs";

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SHARDS = Math.max(1, Number(opt("--shards", 3)));
const LIMIT = Number(opt("--limit", 0));
const ONLY = opt("--hero", null);
const DRY = argv.includes("--dry-run");
const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13).replace("T", "-");

// ── the ruler ───────────────────────────────────────────────────────────────
function probe(mp3) {
  const d = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3], { encoding: "utf8" });
  const v = spawnSync("ffmpeg", ["-hide_banner", "-i", mp3, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  const m = /max_volume:\s*(-?[\d.]+) dB/.exec(v.stderr + v.stdout);
  return { seconds: Number(d.stdout.trim()), maxDb: m ? Number(m[1]) : NaN };
}
function calibrate() {
  mkdirSync(OUT_DIR, { recursive: true });
  const silence = join(OUT_DIR, `calib-silence-${stamp}.mp3`);
  spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "0.5", "-c:a", "libmp3lame", silence]);
  const s = probe(silence);
  const voiced = join(LINES_DIR, "godie-e001", "hurt.mp3");
  const v = probe(voiced);
  const ok = Number.isFinite(s.maxDb) && s.maxDb <= -80 && Number.isFinite(v.maxDb) && v.maxDb >= -30 && v.seconds >= MIN_SECONDS;
  console.log(`[combat:gen] ruler: silence → ${s.maxDb} dB (${s.seconds}s) · voiced ${relative(ROOT, voiced)} → ${v.maxDb} dB (${v.seconds}s) ⇒ ${ok ? "✓ both directions" : "⛔ BLIND"}`);
  if (!ok) { console.error("[combat:gen] ⛔ the ruler failed its own calibration — every verdict below would be void. Aborting."); process.exit(2); }
}

// ── the work list ───────────────────────────────────────────────────────────
const casting = readJson(CASTING_PATH);
const CANON = canonicalCategories(readJson(CATEGORIES_PATH));
const entries = [], skipped = [];
for (const id of Object.keys(casting.champions).sort()) {
  if (ONLY && id !== ONLY) continue;
  const doc = readJson(statusPath(id));
  if (!doc?.reference?.path) { skipped.push(`${id}: no status.json/reference — run build-combat-lines first`); continue; }
  if (!existsSync(doc.reference.path)) { skipped.push(`${id}: reference missing ${doc.reference.path}`); continue; }
  for (const cat of Object.keys(doc.lines ?? {})) {
    const rec = doc.lines?.[cat];
    if (!rec) continue;
    if (rec.textSource === "original") continue;   // an original clip is never rendered
    const why = needsRender(rec, clipPath(id, cat));
    if (!why) continue;
    const e = { id: `${id}.${cat}`, ref: doc.reference.path, lang: rec.lang, text: rec.text, out: `${id}/${cat}.mp3`, category: cat.split(".")[0] };
    if (rec.lang === "ja") e.kana = rec.kana ?? "";
    entries.push(e);
  }
}
const work = LIMIT > 0 ? entries.slice(0, LIMIT) : entries;
console.log(`[combat:gen] ${entries.length} clip(s) need rendering${LIMIT ? ` (limited to ${work.length})` : ""}; ${skipped.length} hero(es) skipped${skipped.length ? ":\n  " + skipped.join("\n  ") : ""}`);
if (DRY) { for (const e of work.slice(0, 20)) console.log(`  ${e.id}  [${e.lang}] ${e.text}${e.kana ? ` (${e.kana})` : ""}`); process.exit(0); }
if (work.length === 0) process.exit(0);

calibrate();
mkdirSync(OUT_DIR, { recursive: true });
const manifest = join(OUT_DIR, `combat-manifest-${stamp}.jsonl`);
writeFileSync(manifest, work.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
const started = Date.now();

// ── render: N persistent synth.py workers, model loaded once each ────────────
const shards = Math.min(SHARDS, work.length);
console.log(`[combat:gen] spawning ${shards} shard(s): ${ENGINE_PYTHON} ${relative(ROOT, SYNTH)} --manifest ${relative(ROOT, manifest)} --out-root ${relative(ROOT, LINES_DIR)}`);
const procs = [];
for (let i = 0; i < shards; i++) {
  const log = join(OUT_DIR, `combat-shard${i}-${stamp}.log`);
  const child = spawn(ENGINE_PYTHON, [SYNTH, "--manifest", manifest, "--out-root", LINES_DIR, "--ref-root", ROOT, "--shard", String(i), "--shards", String(shards)], { stdio: ["ignore", "pipe", "pipe"] });
  const chunks = [];
  const tee = (d) => { chunks.push(d); writeFileSync(log, Buffer.concat(chunks)); };
  child.stdout.on("data", tee); child.stderr.on("data", tee);
  procs.push(new Promise((res) => { child.on("close", (code) => res(code)); child.on("error", () => res(-1)); }));
}
const progress = setInterval(() => {
      const done = work.filter((e) => existsSync(join(LINES_DIR, `${e.out}.method`))).length;
  console.log(`[combat:gen] … ${done}/${work.length} rendered, ${Math.round((Date.now() - started) / 1000)}s`);
}, 60_000);
const codes = await Promise.all(procs);
clearInterval(progress);

// ── finalize: stamp status.json only for clips that pass both axes ──────────
const byHero = new Map();
for (const e of work) { const [id] = e.id.split("."); byHero.set(id, [...(byHero.get(id) ?? []), e]); }
let ok = 0, bad = 0, unrendered = 0;
const failures = [];
for (const [id, list] of byHero) {
  const doc = readJson(statusPath(id));
  for (const e of list) {
    const cat = e.id.slice(id.length + 1);
    const mp3 = join(LINES_DIR, e.out);
    const rec = doc.lines[cat];
    // synth.py writes the .method sidecar only after the mp3 is complete, and
    // re-renders whenever the sidecar's key (text/ref/engine) no longer matches —
    // so "mp3 + sidecar exist" IS "rendered from the current inputs", whether by
    // this run or by an earlier one whose finalize never ran (see is_done()).
    const fresh = existsSync(mp3) && existsSync(`${mp3}.method`);
    if (!fresh) { unrendered++; rec.state = "pending"; rec.lastError = "not rendered this run (see shard log)"; continue; }
    const p = probe(mp3);
    const reason = !(p.seconds >= MIN_SECONDS) ? `too short ${p.seconds}s` : !(p.maxDb >= MIN_MAX_VOLUME_DB) ? `silent ${p.maxDb} dB` : null;
    rec.takes = Array.isArray(rec.takes) ? rec.takes : [];
    const takeNo = rec.takes.length + 1;
    if (reason) {
      bad++; failures.push(`${e.id}: ${reason}`);
      rec.takes.push({ take: takeNo, engine: ENGINE.name, stub: false, seconds: p.seconds, at: Date.now(), error: reason });
      rec.state = "failed"; rec.current = null; rec.lastError = reason;
      for (const f of [mp3, `${mp3}.method`]) { try { unlinkSync(f); } catch { /* gone */ } }
      continue;
    }
    const buf = readFileSync(mp3);
    rec.takes.push({ take: takeNo, engine: ENGINE.name, stub: false, seconds: p.seconds, at: Date.now(), error: null });
    rec.current = { take: takeNo, engine: ENGINE.name, engineVersion: ENGINE.version, stub: false, bytes: buf.length, seconds: p.seconds, lufs: null, hash: sha256(buf), maxDb: p.maxDb, at: Date.now() };
    rec.state = "generated"; rec.lastError = null;
    ok++;
  }
  writeJsonAtomic(statusPath(id), doc);
}
const wall = Math.round((Date.now() - started) / 1000);
console.log(`[combat:gen] ${ok} passed both axes · ${bad} failed (deleted, marked failed) · ${unrendered} not rendered · ${wall}s wall (${(wall / Math.max(ok + bad, 1)).toFixed(1)}s/clip) · shard exit codes ${codes.join(",")}`);
if (failures.length) console.log(`  ${failures.join("\n  ")}`);
process.exit(bad || unrendered ? 1 : 0);
