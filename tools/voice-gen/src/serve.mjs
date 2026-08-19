#!/usr/bin/env node
/**
 * serve.mjs — the loopback voice-generation daemon behind `/voice-api`
 * (admin vite proxy → 127.0.0.1:8788). Node stdlib only.
 *
 * The CONTRACT lives in apps/admin/src/voice/voiceApi.ts + voiceModel.ts —
 * this file implements it and invents nothing: line states, the stub rules
 * (a stub can never be promoted or approved), the counts partition, and the
 * SSE event shapes are all theirs.
 *
 * Engine: shells out to tools/voice-gen/synth.py under the CosyVoice 3 venv
 * (VOICE_GEN_PYTHON overrides the default install path). One subprocess per
 * line, up to `concurrency` at once. No engine ⇒ /health says stub:true and
 * every voice job fails loudly with no-engine — a placeholder clip is never
 * written (same rule as tools/icon-gen/local/daemon.py).
 *
 * Storage (all under the content mount so the client can read the results):
 *   content/assets/audio/voices/lines/CATEGORIES.json   the owner's 41
 *   content/assets/audio/voices/lines/ROSTER.json       published rollup
 *   content/assets/audio/voices/lines/<champ>/status.json
 *   content/assets/audio/voices/lines/<champ>/<lineId>.mp3        current clip
 *   content/assets/audio/voices/lines/<champ>/takes/<lineId>.t<N>.mp3
 * References come from voice-reference-pipeline/approved/processed (repo
 * refs, licence-free by the referenceGate rule) or an operator upload.
 *
 * Auth is reachability: loopback bind (fatal otherwise), socket-peer re-check
 * plus an Origin allowlist on every mutating verb. No tokens.
 */
import { createServer } from "node:http";
import { spawn, execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync,
  writeFileSync, unlinkSync, copyFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ------------------------------------------------------------------- paths --

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const LINES_DIR = join(ROOT, "content", "assets", "audio", "voices", "lines");
const CATEGORIES_PATH = join(LINES_DIR, "CATEGORIES.json");
const ROSTER_PATH = join(LINES_DIR, "ROSTER.json");
const REFS_DIR = join(ROOT, "voice-reference-pipeline", "approved", "processed");
const REFS_DROPBOX = join(ROOT, "content", "assets", "audio", "voices", "references");
const HEROES_CSV = join(ROOT, "voice-reference-pipeline", "config", "heroes.csv");
const SYNTH = join(ROOT, "tools", "voice-gen", "synth.py");

const ENGINE_PYTHON =
  process.env.VOICE_GEN_PYTHON ?? "/Users/Takuro/ggd-voice-cosyvoice3/.venv/bin/python";
const ENGINE_NAME = "cosyvoice3";
const ENGINE_VERSION = "cv3-0.5b";

const PORT = Number(process.env.VOICE_GEN_PORT ?? 8788);
const HOST = "127.0.0.1";
const MOUNT = "voice-api";
const ALLOWED_ORIGINS = new Set(["http://127.0.0.1:60721", "http://localhost:60721"]);
const RECENT_CAP = 40;
const DEFAULT_CONCURRENCY = Number(process.env.VOICE_GEN_CONCURRENCY ?? 3);

// -------------------------------------------------------------------- utils --

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const now = () => Date.now();
const log = (...a) => console.log(new Date().toISOString(), ...a);

function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(data, null, 1), "utf8");
  renameSync(tmp, path);
}

/** Minimal CSV reader (quoted fields, BOM). Enough for heroes.csv. */
function readCsv(path) {
  const raw = readFileSync(path, "utf8").replace(/^﻿/, "");
  const rows = [];
  let field = "", record = [], inQ = false;
  const push = () => { record.push(field); field = ""; };
  const endRec = () => {
    if (record.length > 1 || record[0] !== "") rows.push(record);
    record = [];
  };
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inQ) {
      if (ch === '"' && raw[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQ = false;
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") push();
    else if (ch === "\n") { push(); endRec(); }
    else if (ch !== "\r") field += ch;
  }
  push(); endRec();
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const SAFE_ID = /^[a-z0-9-]+$/;
const SAFE_LINE = /^[a-z0-9-]+(\.[a-z0-9-]+)?$/;

// --------------------------------------------------------------- categories --

function loadSchema() {
  const doc = readJson(CATEGORIES_PATH);
  if (doc === null) throw new Error(`missing ${CATEGORIES_PATH} — run import first`);
  return doc;
}

function expandLines(schema) {
  const out = [];
  for (const c of [...schema.categories].sort((a, b) => a.order - b.order)) {
    const variants = c.expand ? (schema.expansions?.[c.expand] ?? []) : [];
    if (variants.length === 0) out.push({ lineId: c.id, categoryId: c.id, variant: null });
    else for (const v of variants) out.push({ lineId: `${c.id}.${v}`, categoryId: c.id, variant: v });
  }
  return out;
}

// ------------------------------------------------------------------- roster --

function championName(id, fallback) {
  const doc = readJson(join(ROOT, "content", "champions", `${id}.json`));
  return typeof doc?.name === "string" && doc.name !== "" ? doc.name : fallback;
}

function abilityNameFor(champ, slot) {
  const doc = readJson(join(ROOT, "content", "abilities", `${champ}.${slot}.json`));
  const raw = typeof doc?.name === "string" ? doc.name : "";
  return raw.replace(/^\d+-\d+[-\s]*/, "").trim();
}

function loadHeroes() {
  const rows = readCsv(HEROES_CSV);
  return rows.filter((r) => SAFE_ID.test(r.id ?? "")).map((r) => ({
    id: r.id,
    name: championName(r.id, r.character ?? r.id),
    gender: (r.voice_profile ?? "").startsWith("female")
      ? "female"
      : (r.voice_profile ?? "").startsWith("male") ? "male" : "other",
    lang: r.id === "godie-zombiex" ? "zh" : "ja",
  }));
}

// ------------------------------------------------------------------- status --

const champDir = (id) => join(LINES_DIR, id);
const statusPath = (id) => join(champDir(id), "status.json");
const clipPath = (id, lineId) => join(champDir(id), `${lineId}.mp3`);
const takePath = (id, lineId, n) => join(champDir(id), "takes", `${lineId}.t${n}.mp3`);

const statusCache = new Map();

function loadStatus(id) {
  if (statusCache.has(id)) return statusCache.get(id);
  const doc = readJson(statusPath(id), { championId: id, reference: null, lines: {} });
  statusCache.set(id, doc);
  return doc;
}

function saveStatus(id) {
  const doc = statusCache.get(id);
  if (doc) writeJsonAtomic(statusPath(id), doc);
}

/** Default reference: the repo ref for this champ, adopted lazily. */
function ensureReference(id) {
  const doc = loadStatus(id);
  if (doc.reference && doc.reference.sha256) return doc.reference;
  const p = join(REFS_DIR, `${id}.wav`);
  if (!existsSync(p)) return null;
  const buf = readFileSync(p);
  doc.reference = {
    sha256: sha256(buf),
    seconds: 0,
    sampleRate: 24000,
    source: `voice-reference-pipeline/approved/processed/${id}.wav`,
    sourceKind: "repo",
    licence: "",
    licenceUrl: "",
    note: "auto-adopted repo reference",
    addedAt: now(),
    path: p,
  };
  saveStatus(id);
  return doc.reference;
}

function referenceFile(id) {
  const ref = ensureReference(id);
  if (ref?.path && existsSync(ref.path)) return ref.path;
  const p = join(REFS_DIR, `${id}.wav`);
  return existsSync(p) ? p : null;
}

function lineRecord(id, spec, schemaLine) {
  const doc = loadStatus(id);
  const rec = doc.lines[spec.lineId] ?? {};
  const out = {
    lineId: spec.lineId,
    categoryId: spec.categoryId,
    variant: spec.variant,
    text: typeof rec.text === "string" && rec.text !== "" ? rec.text : null,
    textSource: rec.textSource ?? null,
    lang: rec.lang ?? "",
    kana: rec.kana ?? null,
    state: rec.state ?? "noText",
    current: rec.current ?? null,
    takes: Array.isArray(rec.takes) ? rec.takes : [],
    review: rec.review ?? null,
    lastError: rec.lastError ?? null,
    abilityId: null,
    abilityName: null,
  };
  if (spec.categoryId === "skill-name" && spec.variant) {
    out.abilityId = `${id}.${spec.variant}`;
    out.abilityName = abilityNameFor(id, spec.variant) || null;
  }
  if (out.text === null) out.state = "noText";
  return out;
}

function championStatus(id, heroes, schema) {
  const hero = heroes.find((h) => h.id === id);
  if (!hero) return null;
  const lines = {};
  for (const spec of expandLines(schema)) lines[spec.lineId] = lineRecord(id, spec);
  return {
    championId: id,
    lang: hero.lang,
    gender: hero.gender,
    reference: publicReference(ensureReference(id)),
    lines,
  };
}

function publicReference(ref) {
  if (!ref) return null;
  const { path, ...pub } = ref;
  return pub;
}

const COUNT_KEYS = ["approved", "generated", "stub", "pending", "generating", "rejected", "failed", "noText"];

function countsFor(id, schema) {
  const specs = expandLines(schema);
  const counts = Object.fromEntries(COUNT_KEYS.map((k) => [k, 0]));
  counts.total = specs.length;
  for (const spec of specs) {
    const rec = lineRecord(id, spec);
    counts[COUNT_KEYS.includes(rec.state) ? rec.state : "noText"] += 1;
  }
  return counts;
}

/**
 * ⭐ GH#395 —— 這份產物**刻意留著時鐘**，而理由要寫在這裡而不是被人再問一次。
 *
 * 判準是「這份檔案的 `--check` 需不需要逐位元組？」——`ROSTER.json` **沒有**
 * `--check`，也**不可能**有：它不是從版控裡的輸入推導出來的，它是一個跑著的
 * 服務（本檔的 daemon）在**產生語音**之後publish 的一份快照。沒有任何 build、
 * CI 或 deploy 步驟會重跑它 ⇒ 它不會製造 `git status` 噪音，也沒有一條閘會被
 * 一格時間放寬掉。
 *
 * 而時間**就是資料**：管理後台那一頁的整個用途是「上次發布的 ROSTER.json」
 * （`voiceApi.NO_DAEMON_MESSAGE` 逐字這樣寫），`updatedAt` 回答的是「這一位
 * 英雄的語音狀態上次被寫是什麼時候」。
 *
 * ⚠️ 誠實的那一半：`updatedAt` 是 `mtimeMs`，正是 GH#389 點名的那種東西。
 * 差別在於它**只餵顯示，不餵任何判斷** —— ⛔ 這裡不可以出現「mtime 比較大
 * 所以比較新」的邏輯（那正是 GH#389 在 `model-budget/roles.ts` 拆掉的那一條）。
 */
function rosterRollup(heroes, schema) {
  const lineCount = expandLines(schema).length;
  return {
    schema: "voice.roster@1",
    categoryCount: schema.categories.length,
    lineCount,
    generatedAt: now(),
    engine: { name: ENGINE_NAME, version: ENGINE_VERSION, stub: !engineOk() },
    champions: heroes.map((h) => {
      const ref = ensureReference(h.id);
      let updatedAt = 0;
      try { updatedAt = statSync(statusPath(h.id)).mtimeMs; } catch { /* fresh */ }
      return {
        championId: h.id,
        name: h.name,
        hasReference: ref !== null,
        referenceSha256: ref?.sha256 ?? null,
        lang: h.lang,
        gender: h.gender,
        counts: countsFor(h.id, schema),
        updatedAt,
      };
    }),
  };
}

let publishTimer = null;
function publishRosterSoon(heroes, schema) {
  if (publishTimer) return;
  publishTimer = setTimeout(() => {
    publishTimer = null;
    try {
      writeJsonAtomic(ROSTER_PATH, rosterRollup(heroes, schema));
    } catch (e) {
      log("roster publish failed:", e.message);
    }
  }, 1500);
}

// ------------------------------------------------------------------- engine --

let engineWarm = false;
function engineOk() {
  return existsSync(ENGINE_PYTHON) && existsSync(SYNTH);
}

function ffprobeSeconds(path) {
  return new Promise((resolveP) => {
    execFile("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
      (err, stdout) => resolveP(err ? null : Number(stdout.trim()) || null));
  });
}

/** Render one line to a fresh take. Resolves {ok, error, takeFile}. */
function renderLine(champ, lineId, rec, refFile, takeNo) {
  const out = takePath(champ, lineId, takeNo);
  mkdirSync(dirname(out), { recursive: true });
  const lang = rec.lang === "zh" || rec.lang === "en" ? rec.lang : "ja";
  // --text=… form: a line legitimately starting with "-" must never parse as a flag
  const args = [SYNTH, `--ref=${refFile}`, `--lang=${lang}`, `--text=${rec.text}`, `--out=${out}`];
  if (lang === "ja") {
    if (!rec.kana) return Promise.resolve({ ok: false, error: "日文句缺 kana 讀音（重新匯稿或改稿後補讀音）" });
    args.push(`--kana=${rec.kana}`);
  }
  return new Promise((resolveP) => {
    const child = spawn(ENGINE_PYTHON, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => { err += String(d); });
    child.stdout.on("data", (d) => { err += String(d); });
    child.on("close", (code) => {
      if (code === 0 && existsSync(out)) resolveP({ ok: true, takeFile: out });
      else resolveP({ ok: false, error: err.trim().split("\n").slice(-3).join(" | ") || `synth exited ${code}` });
    });
    child.on("error", (e) => resolveP({ ok: false, error: e.message }));
  });
}

// --------------------------------------------------------------------- jobs --

const jobs = new Map();
const jobOrder = [];
let running = null;

function jobJson(j) {
  return {
    jobId: j.jobId, kind: j.kind, scope: j.scope, state: j.state,
    total: j.total, done: j.done, ok: j.ok, failed: j.failed,
    skipped: j.skipped, stub: j.stub, current: j.current,
    startedAt: j.startedAt, finishedAt: j.finishedAt, etaMs: j.etaMs,
    errors: j.errors.slice(0, 20),
  };
}

function jobLists() {
  const all = jobOrder.map((id) => jobs.get(id)).filter(Boolean);
  return {
    active: all.filter((j) => j.state === "queued" || j.state === "running").map(jobJson),
    recent: all.filter((j) => j.state !== "queued" && j.state !== "running").reverse().slice(0, RECENT_CAP).map(jobJson),
  };
}

function lineTargets(body, heroes, schema) {
  const specs = expandLines(schema);
  const champs = body.scope === "roster"
    ? heroes.map((h) => h.id)
    : [body.championId].filter((id) => typeof id === "string" && SAFE_ID.test(id));
  const wantLines = Array.isArray(body.lineIds) ? new Set(body.lineIds) : null;
  const wantCats = Array.isArray(body.categoryIds) ? new Set(body.categoryIds) : null;
  const out = [];
  for (const champ of champs) {
    for (const spec of specs) {
      if (wantLines && !wantLines.has(spec.lineId)) continue;
      if (wantCats && !wantCats.has(spec.categoryId)) continue;
      out.push({ champ, lineId: spec.lineId, spec });
    }
  }
  return out;
}

/**
 * Sharded execution: one manifest, N persistent synth.py workers — the model
 * loads ONCE per worker instead of once per clip (the per-line mode below pays
 * a model reload on every single clip; measured, that is seconds of pure
 * overhead each). Success is detected by the clip's `.method` sidecar, which
 * synth.py writes only after the mp3 is complete. Used for big missing-only
 * jobs; explicit per-line regeneration keeps the per-line path.
 */
async function runJobSharded(job, heroes, schema, targets) {
  const shards = Math.max(1, Math.min(4, job.concurrency || DEFAULT_CONCURRENCY));
  const mfPath = join(LINES_DIR, `.job-${job.jobId}.manifest.jsonl`);
  const entries = targets.map((t) => {
    const doc = loadStatus(t.champ);
    const rec = doc.lines[t.lineId] ?? {};
    const lang = rec.lang === "zh" || rec.lang === "en" ? rec.lang : "ja";
    const entry = {
      id: `${t.champ}.${t.lineId}`,
      ref: referenceFile(t.champ),
      lang,
      text: rec.text,
      out: clipPath(t.champ, t.lineId),
    };
    if (lang === "ja") entry.kana = rec.kana ?? "";
    rec.state = "generating";
    doc.lines[t.lineId] = rec;
    return entry;
  });
  writeFileSync(mfPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
  broadcast("job", jobJson(job));

  const procs = [];
  const stderrTails = new Map();
  for (let i = 0; i < shards; i++) {
    const child = spawn(ENGINE_PYTHON, [SYNTH, "--manifest", mfPath, "--shard", String(i), "--shards", String(shards)],
      { stdio: ["ignore", "pipe", "pipe"] });
    let tail = "";
    child.stderr.on("data", (d) => { tail = (tail + String(d)).slice(-2000); });
    child.stdout.on("data", (d) => { tail = (tail + String(d)).slice(-2000); });
    procs.push(new Promise((res) => { child.on("close", () => { stderrTails.set(i, tail); res(); }); child.on("error", () => res()); }));
    job.children = job.children ?? [];
    job.children.push(child);
  }

  const jobStart = now();
  const pending = new Map(targets.map((t) => [`${t.champ}.${t.lineId}`, t]));
  const finalize = (key, t) => {
    const out = clipPath(t.champ, t.lineId);
    if (!existsSync(`${out}.method`) || !existsSync(out)) return false;
    // regeneration: a sidecar left by a PREVIOUS run must not count as done
    try { if (statSync(`${out}.method`).mtimeMs < jobStart - 2000) return false; } catch { return false; }
    const doc = loadStatus(t.champ);
    const rec = doc.lines[t.lineId] ?? {};
    const buf = readFileSync(out);
    const takeNo = (Array.isArray(rec.takes) ? rec.takes.length : 0) + 1;
    rec.takes = Array.isArray(rec.takes) ? rec.takes : [];
    rec.takes.push({ take: takeNo, engine: ENGINE_NAME, stub: false, seconds: null, at: now(), error: null });
    rec.current = { take: takeNo, engine: ENGINE_NAME, engineVersion: ENGINE_VERSION, stub: false,
      bytes: buf.length, seconds: null, lufs: null, hash: sha256(buf), at: now() };
    rec.state = "generated";
    rec.lastError = null;
    doc.lines[t.lineId] = rec;
    saveStatus(t.champ);
    engineWarm = true;
    job.ok += 1; job.done += 1;
    job.current = { championId: t.champ, lineId: t.lineId };
    broadcast("line", { championId: t.champ, lineId: t.lineId, state: "generated", take: takeNo, stub: false });
    broadcast("roster", { championId: t.champ, counts: countsFor(t.champ, schema) });
    return true;
  };

  let allExited = false;
  Promise.all(procs).then(() => { allExited = true; });
  const t0 = now();
  while (!allExited && !job.cancelled) {
    await new Promise((r) => setTimeout(r, 2000));
    for (const [key, t] of [...pending]) {
      if (finalize(key, t)) pending.delete(key);
    }
    if (job.done > 0) job.etaMs = Math.round(((job.total - job.done) * (now() - t0)) / job.done);
    broadcast("job", jobJson(job));
  }
  if (job.cancelled) for (const c of job.children ?? []) { try { c.kill(); } catch { /* gone */ } }
  await Promise.all(procs);
  for (const [key, t] of [...pending]) { if (finalize(key, t)) pending.delete(key); }
  for (const [, t] of pending) {
    const doc = loadStatus(t.champ);
    const rec = doc.lines[t.lineId] ?? {};
    const out = clipPath(t.champ, t.lineId);
    if (existsSync(out) && existsSync(`${out}.method`)) {
      // synth's idempotency judged the existing clip current (same modelText/
      // engine) and skipped it — that is a skip, not a failure
      rec.state = rec.current ? "generated" : "pending";
      job.skipped += 1; job.done += 1;
    } else {
      rec.state = "failed";
      rec.lastError = `shard run ended without output; last engine output: ${[...stderrTails.values()].pop()?.split("\n").slice(-2).join(" | ") ?? "?"}`;
      job.failed += 1; job.done += 1;
      if (job.errors.length < 20) job.errors.push({ championId: t.champ, lineId: t.lineId, message: rec.lastError });
    }
    doc.lines[t.lineId] = rec;
    saveStatus(t.champ);
    broadcast("line", { championId: t.champ, lineId: t.lineId, state: rec.state });
  }
  try { unlinkSync(mfPath); } catch { /* fine */ }
}

async function runJob(job, heroes, schema) {
  job.state = "running";
  job.startedAt = now();
  broadcast("job", jobJson(job));
  const conc = Math.max(1, Math.min(4, job.concurrency || DEFAULT_CONCURRENCY));
  // upfront skip pass — both execution modes see the same eligibility rules
  const renderable = [];
  for (const t of job.targets) {
    const pub = lineRecord(t.champ, t.spec);
    const skip = (why) => {
      job.skipped += 1; job.done += 1;
      if (job.errors.length < 20) job.errors.push({ championId: t.champ, lineId: t.lineId, message: `skip: ${why}` });
    };
    if (!engineOk()) {
      job.failed += 1; job.done += 1;
      job.errors.push({ championId: t.champ, lineId: t.lineId, message: "no-engine: CosyVoice venv 不存在" });
      continue;
    }
    if (pub.text === null) { skip("沒有文稿"); continue; }
    if (referenceFile(t.champ) === null) { skip("沒有參考音"); continue; }
    if (job.onlyMissing && pub.state === "approved") { skip("已驗收"); continue; }
    if (job.onlyMissing && pub.current !== null && pub.state === "generated") { skip("已生成待驗收"); continue; }
    if (!job.force && pub.state === "approved") { skip("已驗收（用 force 重生成）"); continue; }
    if (pub.lang !== "zh" && pub.lang !== "en" && !pub.kana && !(loadStatus(t.champ).lines[t.lineId]?.kana)) {
      // ja without kana would burn a whole shard slot on a guaranteed refusal
      job.failed += 1; job.done += 1;
      if (job.errors.length < 20) job.errors.push({ championId: t.champ, lineId: t.lineId, message: "日文句缺 kana 讀音" });
      continue;
    }
    renderable.push(t);
  }

  if (renderable.length >= 8 && !job.force) {
    await runJobSharded(job, heroes, schema, renderable);
    job.state = job.cancelled ? "cancelled" : "done";
    job.finishedAt = now();
    job.current = null;
    job.etaMs = null;
    broadcast("job", jobJson(job));
    publishRosterSoon(heroes, schema);
    running = null;
    pump(heroes, schema);
    return;
  }

  const queue = [...renderable];
  const durations = [];

  const worker = async () => {
    for (;;) {
      if (job.cancelled) return;
      const t = queue.shift();
      if (!t) return;
      const doc = loadStatus(t.champ);
      const rec = doc.lines[t.lineId] ?? {};
      const refFile = referenceFile(t.champ);

      rec.state = "generating";
      doc.lines[t.lineId] = rec;
      job.current = { championId: t.champ, lineId: t.lineId };
      broadcast("line", { championId: t.champ, lineId: t.lineId, state: "generating" });
      broadcast("job", jobJson(job));

      const takeNo = (Array.isArray(rec.takes) ? rec.takes.length : 0) + 1;
      const t0 = now();
      const res = await renderLine(t.champ, t.lineId, { ...rec, lang: rec.lang || (heroes.find((h) => h.id === t.champ)?.lang ?? "ja") }, refFile, takeNo);
      durations.push(now() - t0);
      engineWarm = true;

      rec.takes = Array.isArray(rec.takes) ? rec.takes : [];
      if (res.ok) {
        const buf = readFileSync(res.takeFile);
        const seconds = await ffprobeSeconds(res.takeFile);
        copyFileSync(res.takeFile, clipPath(t.champ, t.lineId));
        rec.takes.push({ take: takeNo, engine: ENGINE_NAME, stub: false, seconds, at: now(), error: null });
        rec.current = {
          take: takeNo, engine: ENGINE_NAME, engineVersion: ENGINE_VERSION, stub: false,
          bytes: buf.length, seconds, lufs: null, hash: sha256(buf), at: now(),
        };
        rec.state = "generated";
        rec.lastError = null;
        job.ok += 1;
      } else {
        rec.takes.push({ take: takeNo, engine: ENGINE_NAME, stub: false, seconds: null, at: now(), error: res.error });
        rec.state = "failed";
        rec.lastError = res.error;
        job.failed += 1;
        job.errors.length < 20 && job.errors.push({ championId: t.champ, lineId: t.lineId, message: res.error });
      }
      job.done += 1;
      const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
      job.etaMs = Math.round(((job.total - job.done) * avg) / conc);
      doc.lines[t.lineId] = rec;
      saveStatus(t.champ);
      broadcast("line", { championId: t.champ, lineId: t.lineId, state: rec.state, take: takeNo, stub: false });
      broadcast("roster", { championId: t.champ, counts: countsFor(t.champ, schema) });
      broadcast("job", jobJson(job));
    }
  };

  await Promise.all(Array.from({ length: conc }, worker));
  job.state = job.cancelled ? "cancelled" : "done";
  job.finishedAt = now();
  job.current = null;
  job.etaMs = null;
  broadcast("job", jobJson(job));
  publishRosterSoon(heroes, schema);
  running = null;
  pump(heroes, schema);
}

function pump(heroes, schema) {
  if (running) return;
  const next = jobOrder.map((id) => jobs.get(id)).find((j) => j?.state === "queued");
  if (!next) return;
  running = next.jobId;
  runJob(next, heroes, schema).catch((e) => {
    next.state = "failed";
    next.errors.push({ championId: "", lineId: "", message: e.message });
    running = null;
    log("job crashed:", e);
  });
}

// ---------------------------------------------------------------------- SSE --

const sseClients = new Set();
function broadcast(event, data) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) res.write(frame);
}
setInterval(() => { for (const res of sseClients) res.write(": ping\n\n"); }, 20000).unref();

// ------------------------------------------------------------------ server --

function send(res, status, body, headers = {}) {
  const buf = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": Buffer.isBuffer(buf) ? "audio/mpeg" : "application/json; charset=utf-8",
    "x-voice-engine": engineOk() ? ENGINE_NAME : "stub",
    ...headers,
  });
  res.end(buf);
}

function readBody(req) {
  return new Promise((resolveP) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try { resolveP(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { resolveP(null); }
    });
  });
}

function main() {
  if (!existsSync(CATEGORIES_PATH)) {
    console.error(`fatal: ${CATEGORIES_PATH} 不存在 — 先跑 node tools/voice-gen/src/import_lines.mjs`);
    process.exit(1);
  }
  const schema = loadSchema();
  const categoriesSha = sha256(readFileSync(CATEGORIES_PATH));
  const heroes = loadHeroes();
  log(`voice daemon: ${heroes.length} champions × ${expandLines(schema).length} lines, engine=${engineOk() ? ENGINE_PYTHON : "MISSING"}`);

  const server = createServer(async (req, res) => {
    const peer = req.socket.remoteAddress ?? "";
    if (peer !== "127.0.0.1" && peer !== "::1" && peer !== "::ffff:127.0.0.1") {
      return send(res, 403, { error: "loopback only" });
    }
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    let parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts[0] === MOUNT) parts = parts.slice(1);
    const mutating = req.method !== "GET" && req.method !== "HEAD";
    if (mutating) {
      const origin = req.headers.origin;
      if (origin !== undefined && !ALLOWED_ORIGINS.has(origin)) {
        return send(res, 403, { error: `origin ${origin} not allowed` });
      }
    }

    try {
      // ---- reads ----
      if (req.method === "GET" && parts[0] === "health") {
        return send(res, 200, {
          ok: true,
          stub: !engineOk(),
          engine: { name: ENGINE_NAME, version: ENGINE_VERSION, device: "mps", warm: engineWarm },
          refsDir: REFS_DIR,
          linesDir: LINES_DIR,
          categoriesSha256: categoriesSha,
          roster: { champions: heroes.length, lines: heroes.length * expandLines(schema).length },
        });
      }
      if (req.method === "GET" && parts[0] === "categories") {
        return send(res, 200, readFileSync(CATEGORIES_PATH, "utf8"));
      }
      if (req.method === "GET" && parts[0] === "roster") {
        return send(res, 200, rosterRollup(heroes, schema));
      }
      if (req.method === "GET" && parts[0] === "champions" && parts.length === 2) {
        const st = championStatus(parts[1], heroes, schema);
        return st ? send(res, 200, st) : send(res, 404, { error: `unknown champion ${parts[1]}` });
      }
      if (req.method === "GET" && parts[0] === "champions" && parts[2] === "reference" && parts[3] === "candidates") {
        const id = parts[1];
        const out = [];
        for (const [dir, source] of [[REFS_DIR, "voice-reference-pipeline"], [REFS_DROPBOX, "voices/references"]]) {
          if (!existsSync(dir)) continue;
          for (const f of readdirSync(dir)) {
            if (!f.startsWith(`${id}.`)) continue;
            const p = join(dir, f);
            out.push({ path: p, label: f, seconds: 0, sha256: sha256(readFileSync(p)), source });
          }
        }
        return send(res, 200, out);
      }
      if (req.method === "GET" && parts[0] === "reference" && parts.length === 2) {
        const p = referenceFile(parts[1]);
        if (p === null) return send(res, 404, { error: "no reference" });
        return send(res, 200, readFileSync(p), { "content-type": "audio/wav" });
      }
      if (req.method === "GET" && parts[0] === "clip" && parts.length === 3) {
        const [, champ, lineId] = parts;
        if (!SAFE_ID.test(champ) || !SAFE_LINE.test(lineId)) return send(res, 400, { error: "bad id" });
        const take = url.searchParams.get("take");
        const p = take === null ? clipPath(champ, lineId) : takePath(champ, lineId, Number(take));
        if (!existsSync(p)) return send(res, 404, { error: "no clip" });
        return send(res, 200, readFileSync(p));
      }
      if (req.method === "GET" && parts[0] === "jobs" && parts.length === 1) {
        return send(res, 200, jobLists());
      }
      if (req.method === "GET" && parts[0] === "jobs" && parts.length === 2) {
        const j = jobs.get(parts[1]);
        return j ? send(res, 200, jobJson(j)) : send(res, 404, { error: "no such job" });
      }
      if (req.method === "GET" && parts[0] === "events") {
        res.writeHead(200, {
          "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive",
        });
        res.write(`event: engine\ndata: ${JSON.stringify({ stub: !engineOk(), version: ENGINE_VERSION, warm: engineWarm })}\n\n`);
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        return;
      }

      // ---- writes ----
      if (req.method === "POST" && parts[0] === "jobs" && parts.length === 1) {
        const body = await readBody(req);
        if (body === null) return send(res, 400, { error: "bad json" });
        if (body.kind === "script") {
          return send(res, 409, {
            error: "文稿生成由外部撰稿流程處理：node tools/voice-gen/src/import_lines.mjs <批次目錄>",
            reason: "script-not-supported",
          });
        }
        const targets = lineTargets(body, heroes, schema);
        if (targets.length === 0) return send(res, 409, { error: "沒有符合條件的目標句", reason: "empty" });
        const job = {
          jobId: randomBytes(6).toString("hex"),
          kind: "voice", scope: body.scope ?? "roster", state: "queued",
          total: targets.length, done: 0, ok: 0, failed: 0, skipped: 0, stub: 0,
          current: null, startedAt: 0, finishedAt: null, etaMs: null, errors: [],
          targets, force: body.force === true, onlyMissing: body.onlyMissing === true,
          concurrency: body.concurrency, cancelled: false,
        };
        jobs.set(job.jobId, job);
        jobOrder.push(job.jobId);
        broadcast("job", jobJson(job));
        pump(heroes, schema);
        return send(res, 202, { jobId: job.jobId, job: jobJson(job) });
      }
      if (req.method === "DELETE" && parts[0] === "jobs" && parts.length === 2) {
        const j = jobs.get(parts[1]);
        if (!j) return send(res, 404, { error: "no such job" });
        if (j.state === "queued") { j.state = "cancelled"; broadcast("job", jobJson(j)); return send(res, 200, { cancelled: true }); }
        if (j.state === "running") { j.cancelled = true; return send(res, 200, { cancelled: true, note: "完成當前句後停止" }); }
        return send(res, 409, { error: `job is ${j.state}` });
      }
      if (req.method === "POST" && parts[0] === "lines" && parts.length === 4) {
        const [, champ, lineId, action] = parts;
        if (!SAFE_ID.test(champ) || !SAFE_LINE.test(lineId)) return send(res, 400, { error: "bad id" });
        const body = await readBody(req);
        if (body === null) return send(res, 400, { error: "bad json" });
        const doc = loadStatus(champ);
        const rec = doc.lines[lineId] ?? {};

        if (action === "text") {
          if (body.text === null || body.text === "") {
            delete rec.text; delete rec.kana; rec.state = "noText";
          } else {
            if (typeof body.text !== "string") return send(res, 422, { error: "text 必須是字串或 null" });
            const langNew = typeof body.lang === "string" && body.lang !== "" ? body.lang : (rec.lang || "ja");
            if (rec.text !== body.text) delete rec.kana; // 舊讀音對不上新文稿
            if (typeof body.kana === "string" && body.kana !== "") rec.kana = body.kana;
            rec.text = body.text;
            rec.lang = langNew;
            rec.textSource = body.textSource ?? "authored";
            if (!rec.state || rec.state === "noText" || rec.state === "failed") rec.state = "pending";
          }
          doc.lines[lineId] = rec; saveStatus(champ);
          broadcast("line", { championId: champ, lineId, state: rec.state ?? "noText" });
          broadcast("roster", { championId: champ, counts: countsFor(champ, schema) });
          publishRosterSoon(heroes, schema);
          return send(res, 200, { ok: true, state: rec.state ?? "noText" });
        }
        if (action === "promote") {
          const t = (rec.takes ?? []).find((x) => x.take === body.take);
          if (!t) return send(res, 404, { error: "沒有這個 take" });
          if (t.stub || t.engine === "stub") return send(res, 409, { error: "STUB 假音不能採用", reason: "stub" });
          if (t.error) return send(res, 409, { error: t.error, reason: "take-failed" });
          const p = takePath(champ, lineId, t.take);
          if (!existsSync(p)) return send(res, 404, { error: "take 檔案不存在" });
          const buf = readFileSync(p);
          copyFileSync(p, clipPath(champ, lineId));
          rec.current = {
            take: t.take, engine: t.engine, engineVersion: ENGINE_VERSION, stub: false,
            bytes: buf.length, seconds: t.seconds ?? null, lufs: null, hash: sha256(buf), at: now(),
          };
          rec.state = "generated";
          doc.lines[lineId] = rec; saveStatus(champ);
          broadcast("line", { championId: champ, lineId, state: "generated", take: t.take });
          return send(res, 200, { ok: true });
        }
        if (action === "review") {
          if (body.decision !== "approved" && body.decision !== "rejected") {
            return send(res, 422, { error: "decision 必須是 approved 或 rejected" });
          }
          if (body.decision === "approved") {
            if (rec.state === "stub" || rec.current?.stub === true) {
              return send(res, 409, { error: "STUB 假音不能驗收", reason: "stub" });
            }
            if (!rec.current) return send(res, 409, { error: "還沒有可驗收的音檔", reason: "no-clip" });
          }
          rec.review = { decision: body.decision, note: body.note ?? "", at: now() };
          rec.state = body.decision === "approved" ? "approved" : "rejected";
          doc.lines[lineId] = rec; saveStatus(champ);
          broadcast("line", { championId: champ, lineId, state: rec.state });
          broadcast("roster", { championId: champ, counts: countsFor(champ, schema) });
          publishRosterSoon(heroes, schema);
          return send(res, 200, { ok: true, state: rec.state });
        }
        return send(res, 404, { error: `unknown action ${action}` });
      }
      if ((req.method === "PUT" || req.method === "DELETE") && parts[0] === "champions" && parts[2] === "reference" && parts.length === 3) {
        const champ = parts[1];
        const doc = loadStatus(champ);
        if (req.method === "DELETE") {
          doc.reference = null; saveStatus(champ);
          return send(res, 200, { ok: true });
        }
        const body = await readBody(req);
        if (body === null) return send(res, 400, { error: "bad json" });
        if (typeof body.licence !== "string" || body.licence.trim() === "") {
          return send(res, 422, { error: "外部來源的參考音必須填授權（licence）" });
        }
        const buf = Buffer.from(String(body.base64 ?? ""), "base64");
        if (buf.length === 0) return send(res, 422, { error: "空音檔" });
        const dest = join(champDir(champ), "reference", String(body.filename ?? "upload.wav").replace(/[^\w.-]/g, "_"));
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, buf);
        doc.reference = {
          sha256: sha256(buf), seconds: 0, sampleRate: 0,
          source: body.source ?? body.filename ?? "upload",
          sourceKind: body.sourceKind === "external" ? "external" : "upload",
          licence: body.licence, licenceUrl: body.licenceUrl ?? "", note: body.note ?? "",
          addedAt: now(), path: dest,
        };
        saveStatus(champ);
        return send(res, 200, { ok: true, reference: publicReference(doc.reference) });
      }
      if (req.method === "POST" && parts[0] === "champions" && parts[2] === "reference" && parts[3] === "select") {
        const champ = parts[1];
        const body = await readBody(req);
        const p = typeof body?.path === "string" ? body.path : "";
        const allowed = [REFS_DIR, REFS_DROPBOX, champDir(champ)].some((d) => resolve(p).startsWith(resolve(d)));
        if (!allowed || !existsSync(p)) return send(res, 422, { error: "path 不在允許的參考音目錄內" });
        const buf = readFileSync(p);
        const doc = loadStatus(champ);
        doc.reference = {
          sha256: sha256(buf), seconds: 0, sampleRate: 0,
          source: p.replace(`${ROOT}/`, ""), sourceKind: "repo",
          licence: "", licenceUrl: "", note: "", addedAt: now(), path: p,
        };
        saveStatus(champ);
        return send(res, 200, { ok: true, reference: publicReference(doc.reference) });
      }

      return send(res, 404, { error: `no route ${req.method} /${parts.join("/")}` });
    } catch (e) {
      log("500:", e);
      return send(res, 500, { error: e.message });
    }
  });

  server.listen(PORT, HOST, () => log(`listening on http://${HOST}:${PORT} (mount /${MOUNT})`));
}

main();
