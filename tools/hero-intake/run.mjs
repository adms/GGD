/**
 * 🧰 tools/hero-intake —— 新英雄上架的**一條龍**：模型對應 · 圖示 · 語音配對 → **一頁檢核**
 *
 * owner 2026-09-11（逐字）：
 * > 「我又有一批34個英雄上架中 請你做一樣的流程並且用**自動化流程（script）**的方式來執行**語音配對與圖示生成**」
 * > 「並且同時檢查**模型對應是否有缺漏**」
 * > 「全部放到**一頁檢核頁面**讓我複查，這個過程**全部自動化**，只留**最後我的審查通過與否**，
 * >  並且**這一頁也要放到後台管理頁**」
 *
 * ⭐ 這支不是新的產生器 —— 它**編排既有的那幾支**，把三件事收斂成一份**批核材料**：
 *
 * | 段 | 問什麼 | 讀誰 |
 * |---|---|---|
 * | 🧍 模型 | `modelKey` 指得到 model 文件嗎？`glbPath` 的檔**真的在工作樹**嗎？有 `clipMap` 嗎？ | `content/champions/*.json` → `content/models/*.json` → `content/assets/models/**` |
 * | 🖼 圖示 | `icon` 那一格有檔嗎？沒有就**產**（`tools/icon-gen/local/batch.py --only <id>`） | `content/assets/icons/champions/**` |
 * | 🎙 語音 | 有語音包嗎？出貨門檻缺哪幾格？全庫**有沒有這位角色的原作語音**可以補？ | `MANIFEST.json` · `lines/<id>/status.json` · owner 的角色語音索引 |
 *
 * ⛔ **它不自己裁決**：每一位英雄只算出 `blockers`（會擋上架的）與 `warnings`（要看一眼的），
 * 最後一步是 owner 在後台那一頁按**通過／退回** —— 結果寫進既有的 `docs/_review/verdicts/`
 * （`tools/review/stores.mjs` 的兩個分署住處，⛔ 不是第三個帳本）。
 *
 * ```sh
 * node tools/hero-intake/run.mjs --batch lol-batch2 --from docs/community-hero-forge/lol-batch2/official-names.json
 * node tools/hero-intake/run.mjs --batch ship81 --heroes b2-rem,b2-rin --no-gen-icons
 * node tools/hero-intake/run.mjs --batch ship81 --all                 # 全部 champions
 * node tools/hero-intake/run.mjs --batch ship81 --all --check         # 材料過期就回非零（閘）
 * ```
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const CONTENT = join(ROOT, "content");
const MATERIAL_REL = "docs/_review/material/hero-intake";
const CATEGORIES_REL = "content/assets/audio/voices/lines/CATEGORIES.json";
const MANIFEST_REL = "content/assets/audio/voices/champions/MANIFEST.json";

const argv = process.argv.slice(2);
const opt = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);
const BATCH = opt("--batch", "batch");
const CHECK = has("--check");
const GEN_ICONS = !has("--no-gen-icons");
const VOICE_INDEX = opt("--voice-index", process.env.GGD_VOICE_INDEX ?? null);

const readJson = (p, d = null) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

// ────────────────────────────── 英雄清單 ──────────────────────────────
/** `--heroes a,b` ｜ `--from <json>`（吃 id 陣列／{champions:{Name:{ownerName}}}／[{id,name}]）｜ `--all` */
function heroList() {
  const ids = opt("--heroes");
  if (ids) return ids.split(",").map((s) => ({ id: s.trim() })).filter((h) => h.id);
  const from = opt("--from");
  if (from) {
    const doc = readJson(join(ROOT, from)) ?? readJson(from);
    if (doc === null) die(`--from 讀不到：${from}`);
    if (Array.isArray(doc)) return doc.map((x) => (typeof x === "string" ? { id: x } : { id: x.id ?? x.heroId, name: x.name }));
    if (Array.isArray(doc.heroes)) return doc.heroes.map((x) => (typeof x === "string" ? { id: x } : { id: x.id ?? x.heroId, name: x.name }));
    if (Array.isArray(doc.rows)) return doc.rows.map((x) => ({ id: x.id ?? x.heroId, name: x.name }));
    if (doc.champions && !Array.isArray(doc.champions)) {
      // official-names.json 的形狀：{champions: {Sett: {ownerName: "賽特"}}} —— 還沒有 GGD id
      return Object.entries(doc.champions).map(([native, v]) => ({ id: v.id ?? `lol-${native.toLowerCase()}`, name: v.ownerName ?? native, native }));
    }
    die(`--from 認不得這個形狀：${from}`);
  }
  if (has("--all")) {
    return readdirSync(join(CONTENT, "champions"))
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => ({ id: f.slice(0, -5) }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  die("要給 --heroes a,b ｜ --from <json> ｜ --all");
  return [];
}

function die(msg) { console.error(`[hero-intake] ⛔ ${msg}`); process.exit(2); }

// ────────────────────────────── ① 模型對應 ──────────────────────────────
const modelDocs = (() => {
  const dir = join(CONTENT, "models");
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const d = readJson(join(dir, f));
    if (d?.id) out.set(d.id, { ...d, rel: `content/models/${f}` });
  }
  return out;
})();

/**
 * ⭐⭐ 一顆 glb 缺席有**三種**意思，⛔ 它們不是同一件事（這一段是踩出來的：第一版把 45 位
 * 英雄全判成「真的缺一顆模型」，而其中 45 顆**都在 `content/assets-offdisk.json` 裡宣告過** ——
 * 位元組住 S3、雜湊住 git，那是 owner 2026-09-08 的歸屬表，⛔ 不是缺漏）：
 *   ① 宣告在 `assets-offdisk.json` ⇒ **正常**（本機沒抓而已，⭐ 有 sha256 驗得起來）
 *   ② 沒宣告，但**別的分支有** ⇒ checkout／合併的事
 *   ③ 沒宣告、任何分支都沒有 ⇒ ⛔ **真的缺一顆模型檔**
 */
const offDisk = (() => {
  const d = readJson(join(CONTENT, "assets-offdisk.json"), null);
  return new Set(Object.keys(d?.entries ?? {}));
})();

/**
 * ⭐ 「檔不在工作樹」與「檔**任何分支都沒有**」是兩件事 —— 前者是我 checkout 錯地方，
 * 後者才是真的缺漏。⇒ 一次把每一條 ref 的 blob 路徑收成一個集合，⛔ 不是逐檔問 git。
 */
const trackedAnywhere = (() => {
  const set = new Set();
  const refs = spawnSync("git", ["for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes"], { cwd: ROOT, encoding: "utf8" });
  const list = String(refs.stdout ?? "").trim().split("\n").filter(Boolean).slice(0, 40);
  for (const ref of list) {
    const r = spawnSync("git", ["ls-tree", "-r", "--name-only", ref, "content/assets/models"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    for (const line of String(r.stdout ?? "").split("\n")) if (line) set.add(line);
  }
  return set;
})();

/** 模型對應的缺漏 —— ⭐ 每一階都分開回答，⛔ 不是一個「有沒有模型」的布林 */
function checkModel(champ) {
  const modelKey = champ?.modelKey ?? null;
  if (!champ) return { ok: false, gap: "還沒有 content/champions 文件", severity: "blocker" };
  if (!modelKey) return { ok: false, gap: "champion 文件沒有 modelKey", severity: "blocker" };
  const doc = modelDocs.get(modelKey);
  if (!doc) return { ok: false, modelKey, gap: `modelKey 指不到任何 model@1 文件`, severity: "blocker" };
  const glbPath = doc.glbPath ?? null;
  if (!glbPath) return { ok: false, modelKey, gap: "model 文件沒有 glbPath", severity: "blocker" };
  const abs = join(CONTENT, glbPath);
  if (!existsSync(abs)) {
    const declared = offDisk.has(glbPath);
    const inSomeBranch = trackedAnywhere.has(`content/${glbPath}`);
    return {
      ok: declared, modelKey, glbPath, offDisk: declared, inSomeBranch,
      gap: declared
        ? "位元組在 S3（`assets-offdisk.json` 宣告過，sha256 驗得起來）—— ⭐ 本機沒抓而已"
        : inSomeBranch
          ? "glb 不在這棵工作樹，⭐ 但**別的分支有** —— checkout／合併的事，⛔ 不是資產缺漏"
          : "glb **沒有宣告、任何分支也沒有** —— ⛔ 真的缺一顆模型檔",
      severity: declared ? "" : inSomeBranch ? "warning" : "blocker",
    };
  }
  const bytes = statSync(abs).size;
  const clip = doc.clipMap ?? null;
  const CLIPS = ["idle", "run", "attack", "cast", "hurt", "death"];
  const missingClips = clip ? CLIPS.filter((c) => !clip[c]) : CLIPS;
  return {
    ok: missingClips.length === 0,
    modelKey, glbPath, bytes, clipMap: clip,
    missingClips,
    gap: missingClips.length === 0 ? "" : `clipMap 少了：${missingClips.join("／")}`,
    severity: missingClips.length === 0 ? "" : clip ? "warning" : "blocker",
  };
}

// ────────────────────────────── ② 圖示 ──────────────────────────────
function checkIcon(champ, id) {
  const rel = champ?.icon ?? null;
  if (!rel) return { ok: false, gap: "champion 文件沒有 icon 欄位", severity: "blocker" };
  const abs = join(CONTENT, rel);
  if (!existsSync(abs)) return { ok: false, path: rel, gap: "icon 指的檔不在工作樹", severity: "blocker" };
  const bytes = statSync(abs).size;
  const method = existsSync(`${abs}.method`) ? readJson(`${abs}.method`) : null;
  return { ok: true, path: rel, bytes, generator: method?.generator ?? method?.engine ?? null, gap: "", severity: "" };
}

/** ⭐ 沒有圖示就**產一張** —— 用出貨的那支本機批次器，⛔ 不是這裡自己畫 */
function generateIcon(id) {
  const r = spawnSync("python3", [join(ROOT, "tools/icon-gen/local/batch.py"), "--category", "champions", "--only", id], {
    cwd: ROOT, encoding: "utf8", timeout: 20 * 60 * 1000,
  });
  return { ran: true, code: r.status, tail: String(r.stdout ?? "").trim().split("\n").slice(-3).join("\n") || String(r.stderr ?? "").trim().slice(-400) };
}

// ────────────────────────────── ③ 語音 ──────────────────────────────
const voicePack = readJson(join(ROOT, MANIFEST_REL), { champions: {} });
const REQUIRED = readJson(join(ROOT, CATEGORIES_REL), {})?.shipGate?.required ?? [];

/** owner 的角色語音索引（本機素材庫）—— 有就用來找「這位角色有沒有原作語音」 */
function loadVoiceIndex() {
  const candidates = [
    VOICE_INDEX,
    "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-hero-model-options/materials/hero-model-library/voice-index.json",
  ].filter(Boolean);
  for (const p of candidates) {
    const d = readJson(p);
    if (d?.groups) return { path: p, groups: d.groups };
  }
  return null;
}

function checkVoice(id, name, index) {
  const entry = voicePack.champions?.[id] ?? null;
  const lines = entry?.lines ?? {};
  const have = REQUIRED.filter((c) => Array.isArray(lines[c]) && lines[c].length > 0);
  const missing = REQUIRED.filter((c) => !(Array.isArray(lines[c]) && lines[c].length > 0));
  const shared = entry?.sharedFrom ?? null;
  const out = {
    ok: entry !== null && missing.length === 0,
    pack: entry !== null, sharedFrom: shared,
    categories: Object.keys(lines).length,
    required: REQUIRED.length, haveRequired: have.length, missing,
    select: Array.isArray(lines.select) ? lines.select.length : 0,
    candidates: [],
    gap: entry === null ? "沒有語音包" : missing.length ? `出貨門檻缺 ${missing.length} 格` : "",
    severity: entry === null ? "blocker" : missing.length ? "warning" : "",
  };
  if (!index) return out;
  // ⭐ 全庫有沒有這位角色的原作語音？先看索引自己綁的 heroIds（owner 的索引器寫的），
  // ⛔ 名字相同只是候選 —— 所以名字命中只標 candidate、不標 ok。
  for (const g of index.groups) {
    const gid = g.id ?? g.groupId;
    const bound = Array.isArray(g.heroIds) && g.heroIds.includes(id);
    const byName = name && typeof g.name === "string" && g.name.includes(name);
    if (!bound && !byName) continue;
    out.candidates.push({
      groupId: gid, groupName: g.name ?? "", library: g.library ?? "", work: g.work ?? "",
      language: g.language ?? "", fileCount: g.fileCount ?? 0,
      why: bound ? "索引已綁 heroId" : "名字命中（⚠️ 只是候選）",
      confidence: bound ? "high" : "candidate",
    });
    if (out.candidates.length >= 4) break;
  }
  if (!out.pack && out.candidates.length > 0) out.gap += `；全庫有 ${out.candidates.length} 個候選來源`;
  return out;
}

// ────────────────────────────── 跑 ──────────────────────────────
const heroes = heroList();
const index = loadVoiceIndex();
const outDir = join(ROOT, MATERIAL_REL);
if (!CHECK) mkdirSync(outDir, { recursive: true });

const rows = [];
for (const h of heroes) {
  const champPath = join(CONTENT, "champions", `${h.id}.json`);
  const champ = readJson(champPath);
  const name = h.name ?? champ?.name ?? h.id;
  const model = checkModel(champ);
  let icon = checkIcon(champ, h.id);
  let iconRun = null;
  if (!icon.ok && GEN_ICONS && !CHECK && champ) {
    iconRun = generateIcon(h.id);
    icon = { ...checkIcon(readJson(champPath), h.id), generated: iconRun.code === 0, run: iconRun };
  }
  const voice = checkVoice(h.id, name, index);
  // ⭐ 圖示**不複製**一份進材料 —— 那會讓同一張圖在 git 裡有第二個住處（第〇·四守則）。
  // 頁面透過 `/__review/hero-asset?p=` 直接讀出貨樹那一張（那條路只供應 content/assets/icons/）。
  const iconAsset = icon.ok ? `content/${icon.path}` : null;
  const blockers = [model, icon, voice].filter((x) => x.severity === "blocker").map((x) => x.gap);
  const warnings = [model, icon, voice].filter((x) => x.severity === "warning").map((x) => x.gap);
  rows.push({ id: h.id, name, inContent: champ !== null, model, icon: { ...icon, asset: iconAsset }, voice, blockers, warnings, ready: blockers.length === 0 });
}

const digest = sha256(JSON.stringify(rows.map((r) => [r.id, r.model.glbPath ?? "", r.model.bytes ?? 0, r.icon.path ?? "", r.icon.bytes ?? 0, r.voice.haveRequired, r.voice.categories])));
const doc = {
  schema: "ggd-hero-intake@1",
  batch: BATCH,
  generatedBy: "tools/hero-intake/run.mjs",
  ownerAsk: "owner 2026-09-11「一批34個英雄上架中…用自動化流程（script）執行語音配對與圖示生成」「同時檢查模型對應是否有缺漏」「全部放到一頁檢核頁面…只留最後我的審查通過與否」",
  voiceIndex: index?.path ?? null,
  counts: {
    heroes: rows.length,
    ready: rows.filter((r) => r.ready).length,
    blocked: rows.filter((r) => !r.ready).length,
    modelGaps: rows.filter((r) => !r.model.ok).length,
    iconGaps: rows.filter((r) => !r.icon.ok).length,
    voiceGaps: rows.filter((r) => !r.voice.ok).length,
  },
  digest,
  heroes: rows,
};

const target = join(outDir, `${BATCH}.json`);
if (CHECK) {
  const prev = readJson(target);
  if (!prev) die(`${relative(ROOT, target)} 還沒產生 —— 跑一次 node tools/hero-intake/run.mjs --batch ${BATCH} …`);
  if (prev.digest !== digest) die(`材料過期：磁碟上的英雄狀態已經變了（digest ${prev.digest?.slice(0, 12)} ≠ ${digest.slice(0, 12)}）—— 重跑 hero-intake`);
  console.log(`[hero-intake] --check ✓ ${relative(ROOT, target)} 是最新的（${prev.counts.heroes} 位）`);
  process.exit(0);
}
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(doc, null, 1)}\n`);
console.log(
  `[hero-intake] ${rows.length} 位 · 可上架 ${doc.counts.ready} · 被擋 ${doc.counts.blocked}` +
    `（模型 ${doc.counts.modelGaps}／圖示 ${doc.counts.iconGaps}／語音 ${doc.counts.voiceGaps}）→ ${relative(ROOT, target)}`,
);
for (const r of rows.filter((x) => !x.ready).slice(0, 12)) console.log(`  ⛔ ${r.id}（${r.name}）：${r.blockers.join("；")}`);
