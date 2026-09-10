#!/usr/bin/env node
/**
 * build-combat-lines.mjs — derive the COMBAT voice script for every roster
 * champion the voice daemon does not own (2026-09-10: the 74 b2-* /
 * community-review-* heroes), and write it as the daemon's own status.json
 * contract so `index-lines.mjs` ships it through the same reader as the 51.
 *
 *   node --import tsx tools/voice-gen/src/build-combat-lines.mjs           # write
 *   node --import tsx tools/voice-gen/src/build-combat-lines.mjs --check   # stale ⇒ exit 1
 *
 * ⭐ NOTHING HERE IS INVENTED (81 英雄語音補檔計劃書 §3, owner 2026-09-10
 * 「要講什麼名言 請你給我名單就好 不要自己產 我會手動填寫」):
 *
 *   A · skill-name.{q,w,e,r,ex}  ← the hero's OWN ability names
 *                                   (content/abilities/<id>.<slot>.json, our content)
 *   B · hurt / hurt-heavy / kill-1 / defeat  ← onomatopoeia (COMBAT_GRUNTS.json),
 *                                   not sentences
 *   C · everything that IS a character line (select pool, victory, quote, …)
 *                                   ← OWNER_LINES.csv, written by the owner;
 *                                   an empty cell is NOT a line, it is a gap this
 *                                   script reports by hero and category.
 *
 * ⭐ JOIN THE ROSTER, never a hand-typed id table (the `build-champ-quotes`
 * failure: "full 113 coverage" while 85 heroes were silent, exit 0). Every id in
 * starter.go is either daemon-owned (ROSTER.json), cast here (COMBAT_CASTING.json),
 * excluded with the owner's verbatim reason, or a godie-* form/gap handled by the
 * pipeline — anything else fails the build BY NAME.
 *
 * ⭐ A CLIP IS NEVER CONSIDERED CURRENT BY THIS SCRIPT. It only writes the
 * script; `run-combat-gen.mjs` renders and stamps `current`. Re-running with a
 * changed text resets that line to `pending` (the mp3 stays until re-rendered).
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";
import { readStarterRoster } from "../../../packages/shared/testkit/starterRoster.ts";
import {
  CASTING_PATH, CATEGORIES_PATH, GRUNTS_PATH, LINES_DIR, OWNER_LINES_PATH, ORIGINALS_PATH, READINGS_PATH,
  ROOT, ROSTER_PATH, canonicalCategories, clipPath, needsRender, parseCsv, readJson,
  referenceFor, serializeStatus, sha256, statusPath, writeJsonAtomic,
} from "./combatLinesLib.mjs";

const CHECK = process.argv.includes("--check");
const SLOTS = ["q", "w", "e", "r", "ex"];
/** Real kana letters (ぁ-ゖ, ァ-ヺ, ー). ⛔ NOT the block range: ・(U+30FB) is a
 *  separator that Chinese skill names use constantly (百八式・闇拂). */
const KANA = /[ぁ-ゖァ-ヺー]/;
const HAN = /[一-鿿]/;
const META_COLUMNS = new Set(["championId", "name", "work", "lang", "note"]);
/** Categories the click pool is synthesised from (index-lines.mjs SELECT_SOURCE_CATEGORIES). */
const SELECT_SOURCES = ["taunt", "respond.ok", "respond.no", "love", "thanks", "puzzled"];

const problems = [];
const fail = (msg) => problems.push(msg);

// ── inputs ──────────────────────────────────────────────────────────────────
const cats = readJson(CATEGORIES_PATH);
if (!cats) { console.error(`[combat:build] cannot read ${CATEGORIES_PATH}`); process.exit(2); }
const CANON = canonicalCategories(cats);
const casting = readJson(CASTING_PATH);
if (!casting?.champions) { console.error(`[combat:build] cannot read ${CASTING_PATH}`); process.exit(2); }
const grunts = readJson(GRUNTS_PATH, { default: {}, byVoiceClass: {} });
const readings = readJson(READINGS_PATH, { readings: {} }).readings ?? {};
/**
 * ⭐ ORIGINAL GAME VOICE FIRST (owner 2026-09-10「有原檔 已經足夠表達該意思 我們就直接採用
 * 例如 卡比 不會唸出招式名稱 所以根本就不用合成直接用就好」). COMBAT_ORIGINALS.json maps
 * hero → category → the original clip already transcoded into lines/<id>/<cat>.mp3;
 * those categories are never synthesised.
 */
const originals = readJson(ORIGINALS_PATH, { champions: {} }).champions ?? {};
const daemonIds = new Set((readJson(ROSTER_PATH, { champions: [] }).champions ?? []).map((c) => c.championId));
const ROSTER = readStarterRoster(ROOT);

const ownerCsv = existsSync(OWNER_LINES_PATH) ? parseCsv(readFileSync(OWNER_LINES_PATH, "utf8")) : { header: [], rows: [] };
const ownerCols = ownerCsv.header.filter((h) => !META_COLUMNS.has(h));
const VARIANT = /^(.+)\.([2-9])$/;
for (const c of ownerCols) {
  const base = VARIANT.test(c) ? c.replace(VARIANT, "$1") : c;
  if (!CANON.includes(base)) fail(`OWNER_LINES.csv 有一個不是類別 id 的欄「${c}」（合法的見 CATEGORIES.json；額外台詞用「<類別>.2」「<類別>.3」）`);
}
const ownerRows = new Map(ownerCsv.rows.map((r) => [r.championId, r]));

// ── line builders ───────────────────────────────────────────────────────────
function championName(id) {
  const d = readJson(join(ROOT, "content", "champions", `${id}.json`));
  return typeof d?.name === "string" ? d.name : id;
}

/** A · the hero's own ability name, spoken as authored (zh) or via its registered kana (ja). */
function skillLine(id, slot) {
  const p = join(ROOT, "content", "abilities", `${id}.${slot}.json`);
  const doc = readJson(p);
  if (!doc) return { error: `技能文件不存在 ${relative(ROOT, p)}` };
  const raw = typeof doc.name === "string" ? doc.name : "";
  const name = raw.replace(/^\d+-\d+[-\s]*/, "").replace(/[〔〕]/g, " ").replace(/\s+/g, " ").trim();
  if (!name) return { error: `技能 ${id}.${slot} 沒有 name` };
  const reading = readings[`${id}.${slot}`];
  const origin = `ability-name:${id}.${slot}`;
  // ⭐ 合成只講日文（owner 2026-09-10「我們合成不講中文 只講日文」）：every call-out is spoken
  // from a katakana reading in SKILL_READINGS.json; a slot without one is a build error,
  // never a Mandarin fallback.
  if (reading?.kana) return { lang: "ja", text: `${name}！`, kana: reading.kana, origin };
  if (KANA.test(name) && !HAN.test(name)) return { lang: "ja", text: `${name}！`, kana: name.replace(/・/g, " "), origin };
  return { error: `技能 ${id}.${slot}「${name}」在 SKILL_READINGS.json 沒有片假名讀音 —— 合成只講日文，⛔ 不退回中文；登錄一筆再跑` };
}

/** B · onomatopoeia by voice class; never a sentence. */
function gruntLine(cat, voiceClass) {
  const g = grunts.byVoiceClass?.[voiceClass]?.[cat] ?? grunts.default?.[cat];
  if (!g) return null;
  return { lang: g.lang ?? "ja", text: g.text, ...(g.kana ? { kana: g.kana } : {}), origin: `grunt:${grunts.byVoiceClass?.[voiceClass]?.[cat] ? voiceClass : "default"}` };
}

/** C · the owner's cell. `台詞|カナ` for ja. Returns null for an empty cell. */
function ownerLine(id, cat) {
  const row = ownerRows.get(id);
  const cell = (row?.[cat] ?? "").trim();
  if (!cell) return null;
  const lang = (row.lang || "zh").trim();
  const [text, kana] = cell.split("|").map((s) => s.trim());
  if (lang === "ja") {
    if (!kana) return { error: `OWNER_LINES.csv ${id}.${cat} 是 ja 但沒有「|カナ」讀音 —— 跳過，⛔ 不猜` };
    if (HAN.test(kana)) return { error: `OWNER_LINES.csv ${id}.${cat} 的讀音含漢字「${kana}」—— 要全片假名` };
    return { lang: "ja", text, kana, origin: "owner-lines" };
  }
  if (lang === "en") return { lang, text, origin: "owner-lines" };
  // ⭐ 合成只講日文（owner 2026-09-10）：a Chinese owner line is not voiced in Mandarin; it is
  // reported as waiting for its Japanese text (or an original clip) instead.
  if (lang === "zh") return { skip: `OWNER_LINES.csv ${id}.${cat} 是中文台詞「${text.slice(0, 20)}」—— 合成只講日文，跳過；請給日文或指定原檔` };
  return { error: `OWNER_LINES.csv ${id} 的 lang「${lang}」不是 zh/ja/en` };
}

/** Original game clip already sitting at lines/<id>/<cat>.mp3 — its record is complete on the spot. */
function originalLine(id, cat) {
  const o = originals[id]?.[cat];
  if (!o) return null;
  const mp3 = clipPath(id, cat);
  if (!existsSync(mp3)) return { error: `COMBAT_ORIGINALS.json 說 ${id}/${cat} 用原檔，但 ${relative(ROOT, mp3)} 不存在（跑 import_originals）` };
  return { lang: "ja", text: `（原檔）${o.name ?? o.src}`, origin: `original:${o.group ?? "?"}/${o.src}`, original: o, mp3 };
}

/** Merge a derived line onto the previous record, keeping render state iff the text is unchanged. */
function mergeRec(prev, line, textSource) {
  const same = prev && prev.text === line.text && (prev.lang ?? "") === line.lang && (prev.kana ?? null) === (line.kana ?? null);
  const rec = same ? { ...prev } : { takes: Array.isArray(prev?.takes) ? prev.takes : [] };
  rec.text = line.text; rec.lang = line.lang;
  if (line.kana) rec.kana = line.kana; else delete rec.kana;
  rec.textSource = textSource; rec.origin = line.origin;
  if (!same) { rec.state = "pending"; rec.current = null; rec.lastError = null; }
  if (!rec.state) rec.state = "pending";
  if (!Array.isArray(rec.takes)) rec.takes = [];
  return rec;
}

// ── per hero ────────────────────────────────────────────────────────────────
const heroes = [];
for (const id of ROSTER) {
  if (daemonIds.has(id)) continue;                       // the daemon's 51 (and their status.json)
  // owner-excluded from SYNTHESIS (the LOL 7) — but original clips of theirs still ship
  // (owner 2026-09-10「如果剛好有語音檔就直接用」): they enter with originals only.
  if (casting.excluded?.[id]) { if (originals[id] && Object.keys(originals[id]).length) heroes.push(id); continue; }
  if (!casting.champions[id]) {
    if (id.startsWith("godie-")) continue;               // form-share / registered VOICE_GAP — pipeline's domain
    fail(`roster 英雄 ${id}（${championName(id)}）不在 COMBAT_CASTING.json，也沒有排除理由`);
    continue;
  }
  heroes.push(id);
}
for (const id of Object.keys(casting.champions)) {
  if (!ROSTER.includes(id)) fail(`COMBAT_CASTING.json 有 ${id}，但它不在 starter.go 的 roster 上（下架了就刪那一列）`);
}
// ⭐ ORIGINALS-ONLY HEROES (owner 2026-09-11「我全部選完了」): a hero the owner adopted original clips
// for, who is NOT on the roster and NOT in the casting table — an off-roster form, or one of the
// daemon's gaps. Nothing here is synthesised for them (they have no reference and no authored text),
// so this loop exists to give their clips a status.json — ⛔ without it index-lines skips the hero and
// the adopted files are dead weight in git.
const originalsOnlyIds = Object.keys(originals ?? {}).filter(
  (id) => !heroes.includes(id) && Object.keys(originals[id] ?? {}).length > 0 && !existsSync(statusPath(id)),
);

const summary = { heroes: 0, lines: 0, toRender: 0, ownerPending: [], stale: [], skippedZh: [] };
for (const id of [...heroes, ...originalsOnlyIds].sort()) {
  const name = championName(id);
  const originalsOnly = !!casting.excluded?.[id] || originalsOnlyIds.includes(id);
  const cast = casting.champions[id] ?? { voiceClass: "unknown" };
  const ref = originalsOnly ? null : referenceFor(id, casting);
  if (!originalsOnly && (!ref || ref.error)) { fail(`${id}（${name}）：${ref?.error ?? "沒有參考音也沒有 donor"}`); continue; }

  const prev = readJson(statusPath(id), { championId: id, reference: null, lines: {} });
  // ⭐ A NEW REFERENCE INVALIDATES EVERY CLIP. The prompt wav is an input of every
  // render (synth.py keys on its sha256 too), so when the reference changes —
  // the hero's own take landing in approved/processed/, or the donor swapped —
  // every line goes back to `pending` even though its text did not move.
  const refShaNow = ref ? sha256(readFileSync(ref.path)) : "";
  const refChanged = !!ref && !!prev.reference?.sha256 && prev.reference.sha256 !== refShaNow;
  if (refChanged && !CHECK) {
    for (const rec of Object.values(prev.lines ?? {})) {
      if (rec && typeof rec === "object") { rec.state = "pending"; rec.current = null; rec.lastError = null; }
    }
  }
  const lines = {};
  const TAKE_KEYS = (cat) => [cat, `${cat}.2`, `${cat}.3`];
  for (const cat of CANON) {
    // ⭐ POOL PER CATEGORY, in owner-ranked order (2026-09-10「如果剛好有語音檔就直接用 沒有才合成」):
    //   1. original game clips (COMBAT_ORIGINALS: cat, cat.2, cat.3)
    //   2. the owner's own lines (OWNER_LINES.csv: cat, cat.2, cat.3)
    //   3. derived synthesis (skill name / grunt) — only when 1 and 2 are both empty
    // The pool is capped at three takes, written as cat / cat.2 / cat.3 (random playback).
    const pool = [];
    for (const key of TAKE_KEYS(cat)) {
      const orig = originalLine(id, key);
      if (orig?.error) { fail(orig.error); continue; }
      if (orig) pool.push({ line: orig, source: "original" });
    }
    for (const key of TAKE_KEYS(cat)) {
      const owned = ownerLine(id, key);
      if (owned?.skip) { summary.skippedZh.push(owned.skip); continue; }
      if (owned?.error) { fail(owned.error); continue; }
      if (owned) pool.push({ line: owned, source: "authored" });
    }
    if (pool.length === 0 && !originalsOnly) {
      let line = null;
      if (cat.startsWith("skill-name.")) {
        const s = skillLine(id, cat.slice("skill-name.".length));
        if (s.error) { fail(`${id}（${name}）：${s.error}`); continue; }
        line = s;
      } else {
        line = gruntLine(cat, cast.voiceClass);
      }
      if (line) pool.push({ line, source: "derived" });
    }
    if (pool.length === 0) continue;                       // owner-pending: absent, not a stub
    pool.slice(0, 3).forEach(({ line, source }, i) => {
      const key = TAKE_KEYS(cat)[i];
      lines[key] = mergeRec(prev.lines?.[key], line, source);
      summary.lines++;
      if (source === "original") {
        // Not rendered by anyone: the clip IS the source. Stamp `current` from disk so
        // index-lines' byte gate and needsRender() both see it as final.
        const buf = readFileSync(line.mp3);
        const cur = lines[key].current;
        if (!cur || cur.bytes !== buf.length || cur.hash !== sha256(buf)) {
          const pr = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", line.mp3], { encoding: "utf8" });
          lines[key].current = { take: 0, engine: "original", engineVersion: line.original.group ?? "original", stub: false, bytes: buf.length, seconds: Number(pr.stdout.trim()) || 0, lufs: null, hash: sha256(buf), at: lines[key].current?.at ?? Date.now() };
        }
        lines[key].state = "generated"; lines[key].lastError = null;
      } else if (needsRender(lines[key], clipPath(id, key))) summary.toRender++;
    });
  }
  const missingSelect = !SELECT_SOURCES.some((c) => lines[c]);
  const missingVictory = !lines.victory;
  if (missingSelect || missingVictory) {
    summary.ownerPending.push(`${id}（${name}）: ${[missingSelect ? "select 池（六格任一）" : null, missingVictory ? "victory" : null].filter(Boolean).join(" · ")}`);
  }

  const refSha = refShaNow;
  const sameRef = !!ref && prev.reference?.sha256 === refSha && prev.reference?.sourceKind === ref.sourceKind;
  const reference = !ref ? { sha256: null, sourceKind: "none", donor: null, note: casting.excluded?.[id] ? "originals only — owner excluded this hero from synthesis (COMBAT_CASTING.json.excluded)" : "originals only — no casting entry and no reference: every clip is an ORIGINAL the owner adopted (COMBAT_ORIGINALS.json)", path: null } : {
    sha256: refSha, seconds: 0, sampleRate: 24000, source: ref.source, sourceKind: ref.sourceKind,
    donor: ref.donor,
    licence: "", licenceUrl: "",
    note: ref.donor
      ? `donor casting (COMBAT_CASTING.json, voiceClass=${cast.voiceClass}) — drop ${id}.wav into approved/processed/ to switch to the hero's own take`
      : "hero's own reference (approved/processed)",
    addedAt: sameRef ? prev.reference.addedAt : Date.now(),
    path: ref.path,
  };
  const next = { championId: id, reference, generator: "tools/voice-gen/src/build-combat-lines.mjs", lines };
  summary.heroes++;
  const before = existsSync(statusPath(id)) ? readFileSync(statusPath(id), "utf8") : null;
  const after = serializeStatus(next);
  if (before !== after) {
    summary.stale.push(id);
    if (!CHECK) writeJsonAtomic(statusPath(id), next);
  }
}

// ── report ──────────────────────────────────────────────────────────────────
const tag = CHECK ? "[combat:check]" : "[combat:build]";
// ── ADOPTED ORIGINALS ON A PACK THIS GENERATOR DOES NOT OWN ────────────────
// ⭐ owner 2026-09-11「我全部選完了」: the owner adopted original clips for slots that belong to the
// DAEMON's 51 packs. The daemon owns those status.json files, so this pass touches ONLY the categories
// COMBAT_ORIGINALS.json names — the rest of the hero's record is left exactly as the daemon wrote it.
// ⛔ Without it index-lines fails on a byte mismatch: the clip on disk is the adopted original while
// `current` still describes the synthesized take it replaced.
let adopted = 0;
for (const id of Object.keys(originals ?? {}).sort()) {
  if (heroes.includes(id) || originalsOnlyIds.includes(id) || !existsSync(statusPath(id))) continue;
  const doc = readJson(statusPath(id), null);
  if (!doc?.lines) continue;
  let touched = 0;
  for (const cat of Object.keys(originals[id]).sort()) {
    const line = originalLine(id, cat);
    if (!line || line.error) { if (line?.error) fail(line.error); continue; }
    const buf = readFileSync(line.mp3);
    const prev = doc.lines[cat] ?? {};
    if (prev.textSource === "original" && prev.current?.bytes === buf.length && prev.current?.hash === sha256(buf)) continue;
    const pr = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", line.mp3], { encoding: "utf8" });
    doc.lines[cat] = {
      ...prev, text: line.text, lang: "ja", textSource: "original", origin: line.origin, state: "generated", lastError: null,
      takes: Array.isArray(prev.takes) ? prev.takes : [],
      current: { take: 0, engine: "original", engineVersion: line.original.group ?? "original", stub: false, bytes: buf.length, seconds: Number(pr.stdout.trim()) || 0, lufs: null, hash: sha256(buf), at: Date.now() },
    };
    touched++;
  }
  if (touched) { adopted += touched; if (!CHECK) writeJsonAtomic(statusPath(id), doc); }
}
if (adopted) console.log(`${tag} ${adopted} adopted original clip(s) stamped onto packs this generator does not own`);
console.log(`${tag} ${summary.heroes} heroes · ${summary.lines} lines scripted · ${summary.toRender} still to render (run-combat-gen.mjs)`);
if (summary.ownerPending.length) {
  console.log(`${tag} ⚠️ ${summary.ownerPending.length} heroes wait on OWNER_LINES.csv (⛔ not invented here):\n  ${summary.ownerPending.join("\n  ")}`);
}
if (summary.skippedZh.length) {
  console.log(`${tag} ⚠️ ${summary.skippedZh.length} 句中文台詞跳過（合成只講日文）:\n  ${summary.skippedZh.join("\n  ")}`);
}
if (problems.length) {
  console.error(`${tag} ⛔ ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
if (CHECK && summary.stale.length) {
  console.error(`${tag} ⛔ ${summary.stale.length} status.json stale — run \`pnpm combat:build\`: ${summary.stale.slice(0, 8).join(", ")}${summary.stale.length > 8 ? " …" : ""}`);
  process.exit(1);
}
if (!CHECK) console.log(`${tag} wrote ${summary.stale.length} status.json under ${relative(ROOT, LINES_DIR)}/`);
