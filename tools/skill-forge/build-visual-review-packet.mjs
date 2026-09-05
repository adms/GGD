#!/usr/bin/env node

/**
 * Build a deterministic, browser-readable review packet for the 42-theme /
 * 46-document VFX acceptance run. It never creates a verdict: the packet only
 * makes every captured frame, proof route and no-code path visible together so
 * a reviewer can make the final call without opening files one by one.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PROOF = join(ROOT, "docs/_reports/editor-skill-basic-visual-proof/manifest.json");
const ACCEPTANCE = join(ROOT, "docs/_reports/editor-skill-acceptance-42x46.json");
const ADVISORY_SOURCE = join(ROOT, "tools/skill-forge/codex-visual-advisory.source.json");
const OUT_DIR = join(ROOT, "docs/_reports/editor-skill-human-review");
const OUT_HTML = join(OUT_DIR, "index.html");
const OUT_JSON = join(OUT_DIR, "index.json");
const CHECK = process.argv.includes("--check");
const PAGE_SIZE = 4;

const proofBytes = readFileSync(PROOF, "utf8");
const acceptanceBytes = readFileSync(ACCEPTANCE, "utf8");
const proof = JSON.parse(proofBytes);
const acceptance = JSON.parse(acceptanceBytes);
if (proof.schema !== "ggd-editor-basic-visual-proof-manifest@1") fail(`unexpected proof schema ${String(proof.schema)}`);
if (acceptance.schema !== "ggd-editor-skill-acceptance@1") fail(`unexpected acceptance schema ${String(acceptance.schema)}`);
if (proof.themes !== 42 || proof.documents !== 46 || proof.cases?.length !== 46) fail("proof scope is not 42/46");
if (proof.cases.some((row) => row.status !== "captured" || !Array.isArray(row.frames) || row.frames.length === 0)) {
  fail("all 46 cases must have captured framebuffer evidence before building the packet");
}

const acceptanceById = new Map(acceptance.rows.map((row) => [row.id, row]));
const pages = [];
for (let offset = 0; offset < proof.cases.length; offset += PAGE_SIZE) {
  pages.push(proof.cases.slice(offset, offset + PAGE_SIZE).map((row) => row.id));
}
for (const row of proof.cases) {
  if (!acceptanceById.has(row.id)) fail(`${row.id}: missing acceptance row`);
  for (const frame of row.frames) {
    const path = join(ROOT, "docs/_reports/editor-skill-basic-visual-proof", frame.file);
    if (!existsSync(path)) fail(`${row.id}: missing frame ${relative(ROOT, path)}`);
  }
}

const documents = proof.cases.map((row) => ({
  id: row.id,
  sourceDigest: documentSourceDigest(row, acceptanceById.get(row.id)),
}));
verifyPerDocumentInvalidation(documents);
const sourceDigestById = new Map(documents.map((row) => [row.id, row.sourceDigest]));
const packetDigest = createHash("sha256")
  .update(JSON.stringify(documents))
  .digest("hex");
let advisoryState = "missing";
let advisoryById = new Map();
let advisoryCounts = { currentRows: 0, staleRows: 0, missingRows: documents.length, extraRows: 0 };
if (existsSync(ADVISORY_SOURCE)) {
  const advisory = JSON.parse(readFileSync(ADVISORY_SOURCE, "utf8"));
  if (advisory.schema !== "ggd-editor-skill-codex-advisory-source@2" || !Array.isArray(advisory.entries)) {
    advisoryState = "stale";
  } else {
    const authoredById = new Map();
    for (const row of advisory.entries) {
      if (authoredById.has(row.id)) fail(`duplicate advisory row ${String(row.id)}`);
      authoredById.set(row.id, row);
    }
    const staleIds = [];
    const missingIds = [];
    for (const document of documents) {
      const authored = authoredById.get(document.id);
      if (!authored) {
        missingIds.push(document.id);
      } else if (authored.sourceDigest !== document.sourceDigest) {
        staleIds.push(document.id);
      } else {
        advisoryById.set(document.id, authored);
      }
    }
    const extraIds = [...authoredById.keys()].filter((id) => !sourceDigestById.has(id));
    advisoryCounts = {
      currentRows: advisoryById.size,
      staleRows: staleIds.length,
      missingRows: missingIds.length,
      extraRows: extraIds.length,
    };
    advisoryState = staleIds.length === 0 && missingIds.length === 0 && extraIds.length === 0
      ? "current"
      : advisoryById.size > 0
        ? "partial"
        : "stale";
  }
}
const reviewIndex = {
  schema: "ggd-editor-skill-human-review-index@2",
  packetDigest,
  policy: {
    verdictAuthority: "human",
    aiIsAdvisoryOnly: true,
    everyDocumentRequiresFrameReview: true,
    advisoryFreshnessScope: "per-document",
    pageSize: PAGE_SIZE,
  },
  themes: 42,
  documents: 46,
  documentSources: documents,
  pages,
  codexAdvisory: { status: advisoryState, ...advisoryCounts },
};

const cards = proof.cases.map((row, index) => card(
  row,
  acceptanceById.get(row.id),
  Math.floor(index / PAGE_SIZE) + 1,
  advisoryById.get(row.id),
  sourceDigestById.get(row.id),
)).join("\n");
const html = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GGD Editor 42／46 技能視覺人工審查</title>
<style>
:root{color-scheme:dark;--bg:#0f1117;--panel:#171b24;--line:#30394a;--text:#edf2ff;--muted:#aab4c8;--accent:#5ec8ff;--warn:#ffc15e}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,sans-serif}header{position:sticky;top:0;z-index:3;padding:12px 18px;background:#0f1117ee;border-bottom:1px solid var(--line);backdrop-filter:blur(8px)}h1{font-size:20px;margin:0 0 5px}.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.toolbar button{background:#273246;color:var(--text);border:1px solid #465574;border-radius:6px;padding:6px 12px}.toolbar code{color:var(--accent)}main{padding:16px;display:grid;gap:16px}.case{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px}.case h2{font-size:17px;margin:0 0 8px}.meta{display:flex;flex-wrap:wrap;gap:6px 14px;color:var(--muted);margin-bottom:10px}.fallback{color:var(--warn)}.criteria{border-left:3px solid var(--accent);padding-left:10px;margin:8px 0 12px}.issues{margin:8px 0 12px;padding:8px 10px;border:1px solid #744f2e;border-radius:6px;background:#2a1d13;color:#ffd39b}.issues code{color:#fff0d6}.advisory{margin:8px 0 12px;padding:8px 10px;border:1px solid #315a73;border-radius:6px;background:#102331}.advisory strong{color:#8ddcff}.frames{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px}.frame{margin:0;border:1px solid #2b3445;border-radius:7px;overflow:hidden;background:#0b0d12}.frame img{display:block;width:100%;aspect-ratio:16/9;object-fit:contain;background:#080a0e}.frame figcaption{padding:6px 8px;color:var(--muted);font-size:12px}.hidden{display:none}.notice{color:var(--warn)}
</style></head><body>
<header><h1>GGD Editor 技能視覺人工審查 · 42 主題／46 文件</h1>
<div class="toolbar"><button id="prev">← 上一頁</button><button id="next">下一頁 →</button><span id="page"></span><code>${packetDigest.slice(0,16)}</code><span class="notice">Codex advisory ${advisoryState}（current ${advisoryCounts.currentRows}／stale ${advisoryCounts.staleRows}／missing ${advisoryCounts.missingRows}）；本頁不會自動寫入 pass</span></div></header>
<main>${cards}</main>
<script>
const total=${pages.length};const q=new URLSearchParams(location.search);let page=Math.min(total,Math.max(1,Number(q.get('page'))||1));
function show(){document.querySelectorAll('.case').forEach(x=>x.classList.toggle('hidden',Number(x.dataset.page)!==page));document.querySelector('#page').textContent='第 '+page+'／'+total+' 頁';document.querySelector('#prev').disabled=page===1;document.querySelector('#next').disabled=page===total;history.replaceState(null,'','?page='+page)}
document.querySelector('#prev').onclick=()=>{page=Math.max(1,page-1);show()};document.querySelector('#next').onclick=()=>{page=Math.min(total,page+1);show()};show();
</script></body></html>\n`;

emit(OUT_JSON, `${JSON.stringify(reviewIndex, null, 2)}\n`);
emit(OUT_HTML, html);
console.log(`${CHECK ? "PASS" : "WROTE"} human review packet · ${pages.length} pages / 46 documents · ${packetDigest.slice(0, 16)} · advisory ${advisoryState}`);

function card(row, acceptanceRow, page, advisory, sourceDigest) {
  const fallback = row.basicVisualFallback
    ? `<span class="fallback">安全替代 ${esc(row.basicVisualFallback.fromVfxId)} → ${esc(row.basicVisualFallback.toVfxId)}（原綁定未修改）</span>`
    : "";
  const audit = row.audit ?? {};
  const mechanicVisualCount = Array.isArray(row.mechanicVisualAdditions)
    ? row.mechanicVisualAdditions.length
    : 0;
  const frames = row.frames.map((frame) => `<figure class="frame"><img loading="lazy" src="../editor-skill-basic-visual-proof/${attr(frame.file)}" alt="${attr(row.id)} ${attr(frame.label)}"><figcaption>${esc(frame.atMs)}ms · ${esc(frame.framing)} · ${esc(frame.label)}</figcaption></figure>`).join("");
  const issues = (row.machineIssues ?? []).map((issue) =>
    `<code>${esc(issue.code)}${issue.brickId ? `#${esc(issue.brickId)}` : ""}</code> ${esc(issue.summary)}`,
  ).join("；");
  const blockers = (row.blockers ?? []).map(esc).join("；");
  const issuePanel = issues || blockers
    ? `<div class="issues"><b>自動分流：</b>${issues || "—"}${blockers ? `<br><b>證據：</b>${blockers}` : ""}</div>`
    : "";
  const advisoryPanel = advisory
    ? `<div class="advisory"><strong>Codex advisory ${esc(advisory.score)}/10 · ${esc(advisory.disposition)}</strong><br>${esc(advisory.note)}</div>`
    : "";
  return `<article class="case" data-page="${page}"><h2>${esc(row.id)} · ${esc(row.name)}</h2>
  <div class="meta"><span>主題 ${esc(acceptanceRow.themeId)}</span><span>路徑 ${esc(acceptanceRow.designerPath)}</span><span>證據 ${esc(row.proofSource)}</span><span>逐份指紋 <code>${esc(String(sourceDigest).slice(0, 12))}</code></span><span>真機制補圖 ${mechanicVisualCount} 塊</span><span>事件 ${esc(acceptanceRow.noCodeEventAuthoring)}</span><span>粒子峰值 ${esc(audit.peakParticleCount ?? "—")}</span><span>演出像素 ${(Number(audit.peakPresentationPixelShare ?? 0) * 100).toFixed(2)}%</span>${fallback}</div>
  <div class="criteria"><b>驗收要點：</b>${esc(acceptanceRow.acceptance)}<br><b>設計師檢查：</b>角色動作、傷害／位移節點、方向與範圍、顏色辨識、素材透明、時間軸可用現有積木重建。</div>
${issuePanel}
${advisoryPanel}
  <div class="frames">${frames}</div></article>`;
}

function esc(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]); }
function attr(value) { return esc(value).replace(/`/g, "&#96;"); }
function documentSourceDigest(row, acceptanceRow) {
  const hash = createHash("sha256");
  hash.update(proof.schema).update("\0");
  hash.update(JSON.stringify(row)).update("\0");
  hash.update(acceptance.schema).update("\0");
  hash.update(JSON.stringify(acceptanceRow)).update("\0");
  for (const frame of row.frames) {
    hash.update(readFileSync(join(ROOT, "docs/_reports/editor-skill-basic-visual-proof", frame.file))).update("\0");
  }
  return hash.digest("hex");
}
function verifyPerDocumentInvalidation(originalDocuments) {
  const firstProof = proof.cases[0];
  const firstAcceptance = acceptanceById.get(firstProof.id);
  const mutatedAcceptance = { ...firstAcceptance, name: `${firstAcceptance.name}\0digest-mutation` };
  const mutatedDigest = documentSourceDigest(firstProof, mutatedAcceptance);
  if (mutatedDigest === originalDocuments[0].sourceDigest) {
    fail("per-document digest did not change when its own acceptance row changed");
  }
  const untouchedProof = proof.cases[1];
  const untouchedAcceptance = acceptanceById.get(untouchedProof.id);
  if (documentSourceDigest(untouchedProof, untouchedAcceptance) !== originalDocuments[1].sourceDigest) {
    fail("per-document digest leaked a mutation into an untouched document");
  }
}
function emit(path, value) {
  if (CHECK) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== value) fail(`${relative(ROOT, path)} is stale`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}
function fail(message) { console.error(`FAIL visual review packet: ${message}`); process.exit(1); }
