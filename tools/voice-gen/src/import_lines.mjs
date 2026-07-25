#!/usr/bin/env node
/**
 * import_lines.mjs — fold authored line-script batches into the per-champion
 * status.json files the voice daemon (serve.mjs) serves.
 *
 *   node tools/voice-gen/src/import_lines.mjs <dir-with-lines_batch_*.json> [--force]
 *
 * Batch shape: {"heroes":[{"id":"godie-e001","lines":[{"lineId":"quote",
 * "lang":"ja","text":"…","kana":"…"}, …]}]}
 *
 * Also derives the five skill-name.<slot> lines per hero from the ability
 * docs (name minus the WC3 numbering prefix, plus 「！」): pure-CJK names are
 * spoken as zh, kana-bearing names as ja with the name itself as reading.
 *
 * Never overwrites a line whose textSource is "authored" (an operator edit
 * beats a regenerated script) unless --force. State: a line that gains text
 * becomes "pending"; approved/generated lines keep their state (text edits
 * that matter go through the daemon, which resets kana when text changes).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const LINES_DIR = join(ROOT, "content", "assets", "audio", "voices", "lines");
const ABILITY_SLOTS = ["q", "w", "e", "r", "ex"];
const KANA = /[぀-ヿ]/;

const [, , srcDir, ...flags] = process.argv;
const force = flags.includes("--force");
if (!srcDir || !existsSync(srcDir)) {
  console.error("usage: node tools/voice-gen/src/import_lines.mjs <dir> [--force]");
  process.exit(1);
}

const readJson = (p, fb = null) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fb; } };
const writeJson = (p, d) => {
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(d, null, 1), "utf8");
  renameSync(tmp, p);
};

const READINGS = readJson(
  join(ROOT, "content", "assets", "audio", "voices", "lines", "SKILL_READINGS.json"),
  { readings: {} },
).readings;

function skillLine(hero, slot) {
  const doc = readJson(join(ROOT, "content", "abilities", `${hero}.${slot}.json`));
  const raw = typeof doc?.name === "string" ? doc.name : "";
  const name = raw.replace(/^\d+-\d+[-\s]*/, "").trim();
  if (name === "") return null;
  // 技能顯示中文、喊招唸日文正典讀音（SKILL_READINGS.json, owner 2026-07-25）。
  // 登錄表沒有的（例: 台語角色喪標麥可刻意不登錄）退回原名直唸。
  const reading = READINGS[`${hero}.${slot}`];
  if (reading?.kana) {
    return { lineId: `skill-name.${slot}`, lang: "ja", text: `${name}！`, kana: reading.kana };
  }
  const ja = KANA.test(name);
  return {
    lineId: `skill-name.${slot}`,
    lang: ja ? "ja" : "zh",
    text: `${name}！`,
    ...(ja ? { kana: name } : {}),
  };
}

let heroesTouched = 0, linesWritten = 0, linesKept = 0, problems = 0;
const files = readdirSync(srcDir).filter((f) => f.startsWith("lines_batch_") && f.endsWith(".json")).sort();
if (files.length === 0) { console.error(`no lines_batch_*.json in ${srcDir}`); process.exit(1); }

for (const f of files) {
  const batch = readJson(join(srcDir, f));
  if (!Array.isArray(batch?.heroes)) { console.error(`${f}: bad shape, skipped`); problems++; continue; }
  for (const hero of batch.heroes) {
    const id = String(hero.id ?? "");
    if (!/^[a-z0-9-]+$/.test(id)) { console.error(`${f}: bad hero id ${id}`); problems++; continue; }
    const statusPath = join(LINES_DIR, id, "status.json");
    const doc = readJson(statusPath, { championId: id, reference: null, lines: {} });

    const incoming = [...(Array.isArray(hero.lines) ? hero.lines : [])];
    for (const slot of ABILITY_SLOTS) {
      const s = skillLine(id, slot);
      if (s) incoming.push(s);
    }

    for (const line of incoming) {
      const lineId = String(line.lineId ?? "");
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)?$/.test(lineId)) { problems++; continue; }
      const text = typeof line.text === "string" ? line.text.trim() : "";
      if (text === "") { problems++; continue; }
      const rec = doc.lines[lineId] ?? {};
      if (rec.textSource === "authored" && !force) { linesKept++; continue; }
      rec.text = text;
      rec.lang = line.lang === "zh" || line.lang === "en" ? line.lang : "ja";
      if (rec.lang === "ja") {
        if (typeof line.kana !== "string" || line.kana.trim() === "") {
          console.error(`${id}/${lineId}: ja line missing kana — imported anyway, generation will refuse it`);
          problems++;
          delete rec.kana;
        } else rec.kana = line.kana.trim();
      } else delete rec.kana;
      rec.textSource = "ai";
      if (!rec.state || rec.state === "noText" || rec.state === "failed") rec.state = "pending";
      doc.lines[lineId] = rec;
      linesWritten++;
    }
    writeJson(statusPath, doc);
    heroesTouched++;
  }
}
console.log(`imported ${linesWritten} lines across ${heroesTouched} hero docs (${linesKept} kept authored, ${problems} problems)`);
process.exit(problems > 0 ? 2 : 0);
