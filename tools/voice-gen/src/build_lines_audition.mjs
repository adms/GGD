#!/usr/bin/env node
/**
 * build_lines_audition.mjs — render the champion voice-line audition page.
 *
 *   node tools/voice-gen/src/build_lines_audition.mjs [--mirror <dir>]
 *
 * Reads content/assets/audio/voices/lines/ (CATEGORIES.json + per-champion
 * status.json + clips) and writes apps/client/public/voice-audition.html —
 * served by the game client dev server (http://localhost:39527/voice-audition.html)
 * and by prod nginx at the client origin. Audio is NOT embedded: rows carry
 * data-src pointing at /content/assets/audio/voices/lines/**, and one shared
 * <audio> element plays whichever row is clicked (2,346 clips would be ~100 MB
 * of data URIs — a page that big cannot be "updated after every run").
 *
 * --mirror <dir>: additionally write a copy whose audio URLs are ./lines/**
 * and (re)point a `lines` symlink inside that dir at the content lines tree —
 * for the ad-hoc `python -m http.server 8731` audition server.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const LINES_DIR = join(ROOT, "content", "assets", "audio", "voices", "lines");
const REFS_DIR = join(ROOT, "voice-reference-pipeline", "approved", "processed");
const HEROES_CSV = join(ROOT, "voice-reference-pipeline", "config", "heroes.csv");
const OUT = join(ROOT, "apps", "client", "public", "voice-audition.html");
const CONTENT_BASE = "/content/assets/audio/voices/lines";

const args = process.argv.slice(2);
const mirrorIdx = args.indexOf("--mirror");
const mirrorDir = mirrorIdx >= 0 ? args[mirrorIdx + 1] : null;

const readJson = (p, fb = null) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fb; } };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function readCsv(path) {
  const raw = readFileSync(path, "utf8").replace(/^﻿/, "");
  const rows = []; let f = "", rec = [], q = false;
  const push = () => { rec.push(f); f = ""; };
  const end = () => { if (rec.length > 1 || rec[0] !== "") rows.push(rec); rec = []; };
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (q) { if (c === '"' && raw[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") push();
    else if (c === "\n") { push(); end(); }
    else if (c !== "\r") f += c;
  }
  push(); end();
  const [h, ...b] = rows;
  return b.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""])));
}

const schema = readJson(join(LINES_DIR, "CATEGORIES.json"));
if (!schema) { console.error("missing CATEGORIES.json"); process.exit(1); }
const VARIANT_LABEL = { q: "Q", w: "W", e: "E", r: "R", ex: "EX", ok: "OK", no: "NO" };
const specs = [];
for (const c of [...schema.categories].sort((a, b) => a.order - b.order)) {
  const variants = c.expand ? (schema.expansions?.[c.expand] ?? []) : [];
  if (variants.length === 0) specs.push({ lineId: c.id, label: c.label, variant: null });
  else for (const v of variants) specs.push({ lineId: `${c.id}.${v}`, label: c.label, variant: VARIANT_LABEL[v] ?? v });
}

const STATE_LABEL = { noText: "待撰稿", pending: "待生成", generating: "生成中", generated: "待驗收", stub: "STUB", approved: "已驗收", rejected: "已退回", failed: "失敗" };
const STATE_CLASS = { generated: "ok", approved: "good", failed: "bad", stub: "bad", rejected: "bad" };

const heroes = readCsv(HEROES_CSV).filter((h) => /^[a-z0-9-]+$/.test(h.id ?? ""));
const champName = (id, fb) => readJson(join(ROOT, "content", "champions", `${id}.json`))?.name ?? fb;

let totalClips = 0, totalLines = 0;
const stateTotals = {};
const sections = heroes.map((h) => {
  const doc = readJson(join(LINES_DIR, h.id, "status.json"), { lines: {} });
  // audition needs the reference next to the clips so the page has no daemon dependency
  const refSrcCandidate = join(REFS_DIR, `${h.id}.wav`);
  const refDest = join(LINES_DIR, h.id, "reference.wav");
  if (existsSync(refSrcCandidate) && !existsSync(refDest)) {
    mkdirSync(dirname(refDest), { recursive: true });
    copyFileSync(refSrcCandidate, refDest);
  }
  const rows = specs.map((s) => {
    const rec = doc.lines?.[s.lineId] ?? {};
    const state = rec.text ? (rec.state ?? "pending") : "noText";
    stateTotals[state] = (stateTotals[state] ?? 0) + 1;
    totalLines++;
    const clip = join(LINES_DIR, h.id, `${s.lineId}.mp3`);
    const hasClip = existsSync(clip);
    if (hasClip) totalClips++;
    const src = hasClip ? `${CONTENT_BASE}/${h.id}/${s.lineId}.mp3` : "";
    const variant = s.variant ? ` <span class="var">${esc(s.variant)}</span>` : "";
    const kana = rec.kana ? `<div class="kana">${esc(rec.kana)}</div>` : "";
    const cls = STATE_CLASS[state] ?? "";
    return `<div class="row${hasClip ? " playable" : ""}"${hasClip ? ` data-src="${esc(src)}"` : ""}>
<span class="cat">${esc(s.label)}${variant}</span>
<span class="txt">${esc(rec.text ?? "—")}${kana}</span>
<span class="st ${cls}">${esc(STATE_LABEL[state] ?? state)}</span>
<span class="play">${hasClip ? "▶" : ""}</span></div>`;
  }).join("\n");
  const refHtml = existsSync(refDest)
    ? `<button class="refbtn playable" data-src="${CONTENT_BASE}/${h.id}/reference.wav">▶ 參考音</button>` : `<span class="st bad">無參考音</span>`;
  return `<details class="champ" id="${esc(h.id)}"><summary><b>${esc(champName(h.id, h.character))}</b> <code>${esc(h.id)}</code> ${refHtml}</summary>
<div class="rows">${rows}</div></details>`;
}).join("\n");

const roster = readJson(join(LINES_DIR, "ROSTER.json"));
const statChips = Object.entries(stateTotals).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `<span class="chip">${esc(STATE_LABEL[k] ?? k)} <b>${v}</b></span>`).join(" ");

const page = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GGD 角色語音試聽 — ${totalClips}/${totalLines}</title><style>
:root{--bg:#0c0f1a;--panel:#161b2c;--line:#28304a;--ink:#e7ecf7;--dim:#93a0c0;--accent:#f2a13c;--theme:#7ea2ff;--ok:#7ec97e;--bad:#e07a7a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 "Segoe UI",system-ui,sans-serif;padding:28px 18px 80px}
.wrap{max-width:1060px;margin:0 auto}h1{font-size:24px;margin:0 0 4px}.sub{color:var(--dim);margin:0 0 12px}
.chip{display:inline-block;border:1px solid var(--line);border-radius:99px;padding:2px 10px;font-size:12px;color:var(--dim);margin:0 4px 6px 0}.chip b{color:var(--ink)}
.nav{margin:10px 0 20px}.nav a{color:var(--theme);text-decoration:none;font-size:13px;margin-right:14px}
.champ{background:var(--panel);border:1px solid var(--line);border-radius:10px;margin-bottom:10px;padding:0 14px}
.champ summary{cursor:pointer;padding:11px 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.champ code{color:var(--dim);font-size:12px}
.refbtn{background:none;border:1px solid var(--theme);color:var(--theme);border-radius:6px;padding:2px 10px;font-size:12px;cursor:pointer}
.rows{padding:4px 0 12px}
.row{display:grid;grid-template-columns:170px 1fr 70px 30px;gap:10px;align-items:center;padding:5px 0;border-top:1px solid var(--line);font-size:13px}
.row.playable{cursor:pointer}.row.playable:hover{background:rgba(126,162,255,.06)}
.row.playing{background:rgba(242,161,60,.10)}
.cat{color:var(--dim)}.var{color:var(--theme);font-weight:700}
.kana{color:var(--dim);font-size:11px}
.st{font-size:11px;text-align:center;border:1px solid var(--line);border-radius:4px;padding:1px 4px;color:var(--dim)}
.st.ok{color:var(--accent);border-color:var(--accent)}.st.good{color:var(--ok);border-color:var(--ok)}.st.bad{color:var(--bad);border-color:var(--bad)}
.play{color:var(--theme);text-align:center}
@media(max-width:640px){.row{grid-template-columns:1fr;gap:2px}}
</style></head><body><div class="wrap">
<h1>角色語音試聽</h1>
<p class="sub">CosyVoice 3 零樣本聲線複製 — ${heroes.length} 位角色 × ${specs.length} 句。已生成 <b>${totalClips}</b> / ${totalLines} 段。點列即播。產生時間 ${new Date().toISOString()}${roster ? `；引擎 ${esc(roster.engine?.name ?? "?")}` : ""}。</p>
<div>${statChips}</div>
<div class="nav"><a href="/bgm-audition.html">🎵 音樂・音效試聽</a><a href="http://127.0.0.1:60721/admin/" target="_blank">🗄️ 後台（角色語音生成分頁可重生成/驗收）</a></div>
${sections}
<audio id="player" preload="none"></audio>
<script>
const player = document.getElementById("player");
let cur = null;
document.addEventListener("click", (e) => {
  const el = e.target.closest(".playable");
  if (!el) return;
  e.preventDefault();
  const src = el.dataset.src;
  if (!src) return;
  if (cur === el && !player.paused) { player.pause(); return; }
  document.querySelectorAll(".playing").forEach((n) => n.classList.remove("playing"));
  cur = el; el.classList.add("playing");
  player.src = src; player.play();
});
player.addEventListener("ended", () => { if (cur) cur.classList.remove("playing"); cur = null; });
</script>
</div></body></html>`;

writeFileSync(OUT, page, "utf8");
console.log(`wrote ${OUT} (${totalClips}/${totalLines} clips playable)`);

if (mirrorDir) {
  mkdirSync(mirrorDir, { recursive: true });
  const link = join(mirrorDir, "lines");
  try { rmSync(link, { recursive: false, force: true }); } catch { /* fine */ }
  try { symlinkSync(LINES_DIR, link); } catch (e) { console.error("symlink failed:", e.message); }
  const mirrored = page.replaceAll(`${CONTENT_BASE}/`, "./lines/");
  writeFileSync(join(mirrorDir, "voice-audition.html"), mirrored, "utf8");
  console.log(`mirrored to ${join(mirrorDir, "voice-audition.html")}`);
}
