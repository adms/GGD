#!/usr/bin/env node
/**
 * apply_skill_readings.mjs — fold verified Japanese skill-name readings into
 * the voice-line system, then (optionally) enqueue regeneration.
 *
 *   node tools/voice-gen/src/apply_skill_readings.mjs <dir-with-readings_batch_*.json> [--enqueue]
 *
 * Skill callouts DISPLAY the Chinese ability name (the game UI is Chinese) but
 * are SPOKEN with the canonical Japanese reading — 月牙天衝 is ゲツガ テンショウ,
 * not a Mandarin read-through (owner directive 2026-07-25). This script:
 *
 *   1. merges readings batches into the durable registry
 *      content/assets/audio/voices/lines/SKILL_READINGS.json
 *      (import_lines.mjs consults it, so future imports stay Japanese);
 *   2. pushes每句 lang=ja + kana onto the daemon via POST /lines/:c/:l/text
 *      (keeps the daemon cache coherent — never edits status.json behind it);
 *   3. with --enqueue, submits the shard-mode regeneration job for the
 *      skill-name category (roster-wide) and prints the jobId.
 *
 * godie-zombiex is skipped by design: the 台語 persona keeps Chinese callouts.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const REG_PATH = join(ROOT, "content", "assets", "audio", "voices", "lines", "SKILL_READINGS.json");
const API = process.env.VOICE_API ?? "http://127.0.0.1:8788/voice-api";
// 2026-07-25 owner: 全部技能一律日文唸法, 無例外 (原本的台語角色例外取消)
const SKIP_HEROES = new Set();
const KATAKANA_OK = /^[゠-ヿー・ ]+$/;

const [, , srcDir, ...flags] = process.argv;
const doEnqueue = flags.includes("--enqueue");
if (!srcDir || !existsSync(srcDir)) {
  console.error("usage: node tools/voice-gen/src/apply_skill_readings.mjs <dir> [--enqueue]");
  process.exit(1);
}

const readJson = (p, fb = null) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fb; } };

// ---- 1. merge into the registry --------------------------------------------
const registry = readJson(REG_PATH, {
  id: "skill-readings",
  schema: "voice.skill-readings@1",
  note: "技能喊招的日文讀音登錄表。key = <championId>.<slot>；kana 為空格分詞片假名（模型實唸），name 為遊戲顯示名。basis: canonical=原作官方讀音(附來源) / onyomi / styled。",
  readings: {},
});

let merged = 0, problems = 0;
const files = readdirSync(srcDir).filter((f) => f.startsWith("readings_batch_") && f.endsWith(".json")).sort();
if (files.length === 0) { console.error(`no readings_batch_*.json in ${srcDir}`); process.exit(1); }
for (const f of files) {
  const doc = readJson(join(srcDir, f));
  for (const r of doc?.readings ?? []) {
    const hero = String(r.hero ?? ""), slot = String(r.slot ?? "");
    if (SKIP_HEROES.has(hero)) continue;
    if (!/^[a-z0-9-]+$/.test(hero) || !["q", "w", "e", "r", "ex"].includes(slot)) { problems++; continue; }
    const kana = String(r.kana ?? "").trim();
    if (kana === "" || !KATAKANA_OK.test(kana)) {
      console.error(`bad kana for ${hero}.${slot}: ${JSON.stringify(kana)}`);
      problems++;
      continue;
    }
    registry.readings[`${hero}.${slot}`] = {
      name: String(r.name ?? ""),
      kana,
      basis: String(r.basis ?? "styled"),
      sourceUrl: String(r.source_url ?? ""),
      note: String(r.note ?? ""),
    };
    merged++;
  }
}
mkdirSync(dirname(REG_PATH), { recursive: true });
const tmp = `${REG_PATH}.tmp-${process.pid}`;
writeFileSync(tmp, JSON.stringify(registry, null, 1), "utf8");
renameSync(tmp, REG_PATH);
const canonical = Object.values(registry.readings).filter((r) => r.basis === "canonical").length;
console.log(`registry: ${merged} merged (${Object.keys(registry.readings).length} total, ${canonical} canonical) -> ${REG_PATH}`);

// ---- 2. push onto the daemon ----------------------------------------------
let pushed = 0, failed = 0;
for (const [key, r] of Object.entries(registry.readings)) {
  const dot = key.lastIndexOf(".");
  const hero = key.slice(0, dot), slot = key.slice(dot + 1);
  const res = await fetch(`${API}/lines/${hero}/skill-name.${slot}/text`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: `${r.name}！`, lang: "ja", kana: r.kana, textSource: "imported" }),
  }).catch(() => null);
  if (res?.ok) pushed++;
  else { failed++; console.error(`push failed: ${key} (${res ? res.status : "no daemon"})`); }
}
console.log(`daemon push: ${pushed} ok, ${failed} failed`);
if (failed > 0) process.exit(2);

// ---- 3. regenerate ---------------------------------------------------------
if (doEnqueue) {
  const res = await fetch(`${API}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "voice", scope: "roster", categoryIds: ["skill-name"], concurrency: 4 }),
  });
  const body = await res.json();
  if (!res.ok) { console.error("enqueue failed:", body); process.exit(3); }
  console.log(`regeneration job: ${body.jobId} (${body.job.total} targets)`);
}
if (problems > 0) console.error(`${problems} problems — see above`);
