/**
 * tools/review/features.mjs —— GH#669 **功能級**一頁式連續圖片批核（先上線 + 事後否決）。
 *
 * owner 2026-08-24（逐字）：
 * > 「[一頁批次後台驗收] 代表**先上線成果**，但是在**後台可以一鍵否決還原**，
 * >  **追加原因的HITL**，但**預設是直接上線**」
 * owner 2026-08-25（逐字，把內容形狀定死）：
 * > 「所有**球體、蝗蟲群**都要進後台**一頁式連續圖片批核**但**預設先上線**」
 *
 * 與 #664（`triage.mjs`）是同一族但**層級不同**：那一支審**資產**（一顆 vfx/sfx/glb），
 * 這一支審**功能成果**（一批技能／一族特效的**演出**）。⛔ 不造第二套帳本機制 ——
 * 同一個 middleware、同一個 hash 過期制，差別只有兩件事：
 *   ① 每一列帶的是**連續圖片**（施放→演出→到期，逐張帶亮像素），⛔ 不是單張。
 *   ② 預設是 **live（已上線）**，打勾是**事後否決** ⇒ 翻那一批登記的 rollback 開關。
 *
 * ⭐ 登記閘（本檔的重點）：一批要進帳本，**必須寫得出自己的 rollback 開關** ——
 *   而且那一格要**真的解析得到**（文件存在 · 欄位路徑存在 · 有 rollbackValue）。
 *   寫不出來 ⇒ 拒絕登記。這是「沒做完以前自己判斷，**但留後台開關可以簡易 rollback**」
 *   這條常設指令的閘化：⛔ 沒有開關的自作主張只是自作主張。
 *
 * ⚠️ 帳本裡**只存 verdict**，`status`（live/vetoed）是**推導**出來的（第〇·四守則：
 *    同一個事實不可以有第二個住處）。要看狀態就讀 buildFeatureQueue() 的輸出。
 */
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { canonical } from "./triage.mjs";
import { fixTouchesBatch } from "./fix-anchor.mjs";
import { loadMaterial, loadVerdicts, saveMaterial, saveVerdictEntry } from "./stores.mjs";

const sha1 = (buf) => createHash("sha1").update(buf).digest("hex");

/**
 * ⚠️ **分署之前**的混合檔（GH#794）。留著只有一個用途：遷移期的回讀。
 * ⭐ 現在的兩個住處是 `docs/_review/material/`（我寫）與 `docs/_review/verdicts/`（owner 寫）——
 *   見 `tools/review/stores.mjs` 的檔頭，以及 owner 2026-08-27「分署不同資料夾」那一則。
 */
export const FEATURE_LEDGER_REL = "docs/_review/feature-verdicts.json";
/** 連續圖片的來源：`scripts/visual-proof.sh` 那一族的終端證據目錄。 */
export const SEQUENCE_ROOT_REL = "docs/_reports";
const SEQUENCE_DIR_RE = /_visual-proof_/;

/** rollback 開關可以住的地方（都是**人在編的**出貨資料，⛔ 不是產生器產物）。 */
const SWITCH_DIRS = ["content/config", "content/ability-templates"];

// ────────────────────────────── 帳本（＝兩個分署的**唯讀合成**） ──────────────────────────────

/**
 * ⭐ 這一支現在是**讀取端的合成**，⛔ 不再是一個檔。
 * 材料（我寫）與結果（owner 寫）各自載入後在記憶體裡對齊 —— 合成結果**不落地**。
 * ⚠️ 保留這個函式名是因為它是跨 lane 的契約（middleware / check / pending-digest 都叫它）。
 */
export function loadFeatureLedger(repoRoot) {
  const material = loadMaterial(repoRoot);
  const verdicts = loadVerdicts(repoRoot);
  const batches = {};
  for (const [id, reg] of Object.entries(material.batches)) {
    const v = verdicts[id];
    batches[id] = {
      ...reg,
      verdict: v?.verdict ?? null,
      verdictHash: v?.verdictHash ?? null,
      reason: v?.reason ?? "",
      verdictAt: v?.verdictAt ?? null,
      verdictSource: v?.source ?? null,
    };
  }
  return { schema: "feature-verdicts@2", batches };
}

// ─────────────────────── rollback 開關的解析（＝閘） ───────────────────────

/** 逐段走 dot path；⛔ 任何一段不存在就回 undefined（⚠️ 值本身可以是 false/0/null）。 */
function dotGet(doc, path) {
  let cur = doc;
  for (const seg of path.split(".")) {
    if (cur === null || typeof cur !== "object" || !(seg in cur)) return { found: false };
    cur = cur[seg];
  }
  return { found: true, value: cur };
}

/** configId → 出貨文件（檔名 stem / doc.id / doc.schema 三種都認）。 */
function findSwitchDoc(repoRoot, configId) {
  for (const dir of SWITCH_DIRS) {
    const direct = join(repoRoot, dir, `${configId}.json`);
    if (existsSync(direct)) return { rel: `${dir}/${configId}.json`, doc: JSON.parse(readFileSync(direct, "utf8")) };
  }
  for (const dir of SWITCH_DIRS) {
    const abs = join(repoRoot, dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs).filter((f) => f.endsWith(".json") && f !== "_index.json").sort()) {
      const doc = JSON.parse(readFileSync(join(abs, f), "utf8"));
      if (doc.id === configId || doc.schema === configId) return { rel: `${dir}/${f}`, doc };
    }
  }
  return null;
}

/**
 * ⭐ 登記閘的本體。回傳 { ok:true, docRel, current, drifted } 或 { ok:false, error }。
 * ⛔ 「有一個叫 rollback 的物件」不算數 —— 那一格要**真的存在於出貨文件裡**，
 *    否則帳本上的 rollback 只是一句沒有人驗過的散文（第三守則：註解會說謊）。
 */
export function resolveRollback(repoRoot, rollback) {
  if (rollback === null || typeof rollback !== "object")
    return { ok: false, error: "缺 rollback 開關（要 { configId, field, rollbackValue }）" };
  const { configId, field } = rollback;
  if (typeof configId !== "string" || configId === "" || typeof field !== "string" || field === "")
    return { ok: false, error: "rollback 需要非空的 configId 與 field（config id ＋ 欄位名）" };
  if (!("rollbackValue" in rollback))
    return { ok: false, error: `rollback 缺 rollbackValue —— 「翻成什麼」沒寫出來就不是一鍵還原` };
  const hit = findSwitchDoc(repoRoot, configId);
  if (hit === null)
    return { ok: false, error: `解析不到 rollback.configId「${configId}」（找過 ${SWITCH_DIRS.join(" / ")}）` };
  const got = dotGet(hit.doc, field);
  if (!got.found)
    return { ok: false, error: `${hit.rel} 裡沒有欄位「${field}」—— 這一格開關不存在` };
  const drifted = "liveValue" in rollback && canonical(got.value) !== canonical(rollback.liveValue);
  return { ok: true, docRel: hit.rel, current: got.value, drifted };
}

// ─────────────────────── 連續圖片序列（來源＝終端證據） ───────────────────────

const cleanCell = (s) => s.replace(/\*/g, "").replace(/`/g, "").trim();
const parseCount = (s) => {
  const t = cleanCell(s).replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};

/**
 * 從證據目錄的 .md 撈「每一張圖的亮像素」。
 * ⚠️ 逐欄用**表頭**定位（含「亮像素」的那一欄 / 含「lit」的那一欄），
 *    ⛔ 不是寫死欄位序 —— beam 的表是 6 欄、goku 的是 5 欄，寫死必然只對一半。
 */
export function parseFrameTable(mdText) {
  const rows = new Map();
  const order = [];
  let cols = null;
  for (const line of mdText.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) {
      cols = null;
      continue;
    }
    const cells = t.slice(1, t.endsWith("|") ? -1 : undefined).split("|");
    if (cells.every((c) => /^\s*:?-{2,}:?\s*$/.test(c))) continue; // 分隔列
    if (cols === null) {
      const head = cells.map(cleanCell);
      cols = {
        bright: head.findIndex((h) => h.includes("亮像素")),
        lit: head.findIndex((h) => /^lit/i.test(h)),
      };
      continue;
    }
    const key = cleanCell(cells[0] ?? "");
    if (key === "" || key === "—") continue;
    if (!rows.has(key)) order.push(key);
    rows.set(key, {
      bright: cols.bright >= 0 ? parseCount(cells[cols.bright] ?? "") : null,
      lit: cols.lit >= 0 ? parseCount(cells[cols.lit] ?? "") : null,
      desc: cleanCell(cells[cells.length - 1] ?? ""),
    });
  }
  return { rows, order };
}

/** 掃 `docs/_reports` 底下帶 `_visual-proof_` 的目錄 ⇒ 一個目錄＝一列（一個特效家族/技能）。 */
export function scanSequences(repoRoot) {
  const root = join(repoRoot, SEQUENCE_ROOT_REL);
  if (!existsSync(root)) return [];
  const out = [];
  for (const name of readdirSync(root).sort()) {
    const abs = join(root, name);
    if (!SEQUENCE_DIR_RE.test(name) || !statSync(abs).isDirectory()) continue;
    const files = readdirSync(abs).sort();
    const pngs = files.filter((f) => f.toLowerCase().endsWith(".png"));
    if (pngs.length === 0) continue;
    const mdName = files.find((f) => f.toLowerCase().endsWith(".md"));
    const mdText = mdName === undefined ? "" : readFileSync(join(abs, mdName), "utf8");
    const { rows, order } = parseFrameTable(mdText);
    const title = (mdText.match(/^#\s+(.+)$/m)?.[1] ?? name).trim();

    // 順序＝表格的順序（作者寫的「施放→演出→到期」），表格沒收的補在後面。
    const byStem = new Map(pngs.map((f) => [basename(f, ".png"), f]));
    const ordered = [];
    for (const key of order) {
      const f = byStem.get(key);
      if (f !== undefined && !ordered.includes(f)) ordered.push(f);
    }
    for (const f of pngs) if (!ordered.includes(f)) ordered.push(f);

    const frames = ordered.map((f) => {
      const stem = basename(f, ".png");
      const row = rows.get(stem) ?? {};
      const bytes = readFileSync(join(abs, f));
      return {
        file: f,
        label: stem,
        rel: `${SEQUENCE_ROOT_REL}/${name}/${f}`,
        bytes: bytes.length,
        sha1: sha1(bytes),
        bright: row.bright ?? null,
        lit: row.lit ?? null,
        desc: row.desc ?? "",
      };
    });
    out.push({
      id: name,
      dir: `${SEQUENCE_ROOT_REL}/${name}`,
      title,
      evidenceHead: evidenceHeadOf(mdText),
      notes: mdName === undefined ? null : `${SEQUENCE_ROOT_REL}/${name}/${mdName}`,
      frames,
      // hash＝序列的位元組身分。⭐ 重渲染一次 ⇒ hash 變 ⇒ 舊裁決過期 ⇒ 自動回佇列。
      hash: sha1(canonical({ md: sha1(mdText), frames: frames.map((f) => [f.file, f.sha1]) })),
    });
  }
  return out;
}


// ─────────────── 📅 證據的時間身分（GH#795）───────────────
/**
 * ⭐ **一份過期的證據比沒有證據更危險**：沒有證據時我會說「未驗收」，
 *   有一份格式完美但**比修復更早**的證據時，我會說「已修」。
 * 量到的（2026-08-27 稽核 lane）：#721 / #767 的 `*_visual-proof_*` 報告
 *   驗收 12:00 → 重建 13:29 → additive 修正 20:57 —— 報告比它要驗的東西早 89 分鐘，
 *   而**這件事只寫在檔名裡**，⛔ 沒有任何東西會紅。
 *
 * ⇒ 這一支從報告正文撈它自報的 HEAD（`HEAD=<sha>` / `HEAD 是 <sha>` / `commit <sha>`），
 *   再問 git：**那個 sha 是不是登記的修復 commit 的祖先**？是 ⇒ 證據在修復之前拍的。
 * ⚠️ 撈不到就回 null（⛔ 不猜）—— 「沒寫」與「寫了但過期」是兩件事，不可以混。
 */
export function evidenceHeadOf(mdText) {
  const m =
    /HEAD\s*[=＝:：]\s*`?([0-9a-f]{7,40})/i.exec(mdText) ??
    /\bcommit\s+`?([0-9a-f]{7,40})/i.exec(mdText);
  return m === null ? null : m[1];
}

/**
 * 證據拍攝點 vs 修復 commit 的關係。⛔ 回的是**三態**，不是布林：
 *   "after"（含同一個）／"before"（⚠️ 證據過期）／null（判不了：撈不到、或 git 答不出來）
 * ⭐ 判不了要**說出來**，⛔ 不可以退回「看起來沒問題」。
 */
export function evidenceOrder(repoRoot, evidenceSha, fixSha) {
  if (!evidenceSha || !fixSha) return null;
  try {
    const same = execFileSync("git", ["rev-parse", `${evidenceSha}^{commit}`], { cwd: repoRoot, encoding: "utf8" }).trim();
    const fix = execFileSync("git", ["rev-parse", `${fixSha}^{commit}`], { cwd: repoRoot, encoding: "utf8" }).trim();
    if (same === fix) return "after";
    // evidence 是 fix 的祖先 ⇒ 證據拍的時候 fix 還沒進去。
    const r = spawnSync("git", ["merge-base", "--is-ancestor", same, fix], { cwd: repoRoot });
    if (r.status === 0) return "before";
    return "after";
  } catch {
    return null;
  }
}

// ────────────────────────────── 佇列 ──────────────────────────────

/**
 * 一列＝一個特效家族/技能。狀態是**推導**的：
 *   verdict==="veto"  ⇒ vetoed（該翻開關了）
 *   verdict==="keep" 且 hash 沒漂 ⇒ live-confirmed
 *   其餘（含未審、hash 漂）⇒ live-pending（**已經上線**，只是還沒被看過）
 * ⛔ 未登記的序列也列出來，但**不可判定** —— 它缺的正是那一格 rollback 開關。
 */
export function buildFeatureQueue(repoRoot) {
  const ledger = loadFeatureLedger(repoRoot);
  const batches = [];
  // ⭐ GH#795 Scope④ —— 「證據是不是比修復早」**判不了**的批次要有一個**看得見的數字**。
  //    ⛔ 原本的 Scope④ 寫「回頭補那 23 份的 HEAD」——⭐ 那做不到，而且做了就是
  //    **捏造證據**：捕捉發生在工作樹上，git 只給得出「它在哪個 commit 被 commit」
  //    這個**上界**，⛔ 不是拍攝當下的 HEAD。
  //    ⇒ 誠實的做法是把「判不了」**數出來**：一個沉默的 23 與一個寫著 23 的欄位，
  //      對讀的人是兩件完全不同的事。
  const counts = {
    total: 0, pending: 0, confirmed: 0, vetoed: 0, unregistered: 0, invalid: 0,
    /** 報告沒寫自己拍於哪個 HEAD ⇒ 這一批的證據新舊**永遠判不出來**。 */
    evidenceUndeterminable: 0,
    /** ⚠️ 報告自報的 HEAD 是修復 commit 的祖先 ⇒ 證據**比修復早**。 */
    evidenceStale: 0,
    /** ⚠️ GH#797 —— 登記的修復 commit **一個宣稱檔案都沒碰到** ⇒ 這個錨是錯的。 */
    fixAnchorUnrelated: 0,
    /** GH#797 —— 錨對不對**判不了**（沒登記 commit／sha 解析不到／推導不出宣稱檔案）。 */
    fixAnchorUndeterminable: 0,
  };
  for (const seq of scanSequences(repoRoot)) {
    counts.total++;
    const reg = ledger.batches[seq.id];
    if (reg === undefined) {
      counts.unregistered++;
      batches.push({
        ...seq,
        registered: false,
        status: "unregistered",
        blockers: ["⛔ 未登記 —— 缺 rollback 開關（config id ＋ 欄位名），⇒ 不可判定"],
      });
      continue;
    }
    const rb = resolveRollback(repoRoot, reg.rollback);
    if (!rb.ok) counts.invalid++;
    const fresh = reg.verdict !== undefined && reg.verdict !== null && reg.verdictHash === seq.hash;
    // ⚠️ invalid 是**登記閘的紅**，⛔ 不是一種狀態 —— 所以它另外計數，不吃掉狀態那一格。
    const status = reg.verdict === "veto" && fresh ? "vetoed" : fresh ? "confirmed" : "pending";
    counts[status]++;
    const notes = [];
    if (!rb.ok) notes.push(`⛔ 登記閘：${rb.error}`);
    else if (rb.drifted)
      notes.push(`⚠️ 開關現值 ${JSON.stringify(rb.current)} ≠ 登記的 liveValue ${JSON.stringify(reg.rollback.liveValue)}`);
    if (reg.verdict != null && !fresh) notes.push("⚠️ 序列已重渲染（hash 漂）—— 先前的裁決過期，請重看");
    // 📅 GH#795：證據**比它要驗的修復更早** ⇒ 那份報告驗的是舊的東西。
    const order = evidenceOrder(repoRoot, seq.evidenceHead, reg.commit);
    if (seq.evidenceHead === null) counts.evidenceUndeterminable++;
    if (order === "before") counts.evidenceStale++;
    if (order === "before")
      notes.push(
        `⚠️⚠️ **證據比修復早**：報告在 ${seq.evidenceHead} 拍的，而登記的修復是 ${reg.commit} —— ` +
          "這份連續圖片驗的是**修復之前**的東西。⛔ 不可以拿它當「已修」的證據，請重拍。",
      );
    else if (seq.evidenceHead === null && reg.commit)
      notes.push("ℹ️ 報告沒寫它在哪一個 HEAD 上拍的 ⇒ 判不出證據是不是比修復早（⛔ 不等於沒問題）");
    // 🎯 GH#797：⭐ 上面那條祖孫比對**架在一個前提上** —— 登記的 sha 真的是這批的修復嗎？
    //    ⛔ 錨錯了，`evidenceOrder()` 比的就是「證據 vs 一支毫無關係的 commit」。
    //    ⚠️ 判準是 **diff 碰到的檔案**，⛔ 不是 commit 訊息（訊息會說謊 —— 見 fix-anchor.mjs 檔頭）。
    const anchor = fixTouchesBatch(repoRoot, { ...reg, rollbackDocRel: rb.ok ? rb.docRel : null });
    if (anchor.status === "unrelated") {
      counts.fixAnchorUnrelated++;
      notes.push(`🎯 **修復錨可疑**：${anchor.reason}`);
    } else if (anchor.status === null) {
      counts.fixAnchorUndeterminable++;
    }
    batches.push({
      ...seq,
      registered: true,
      status,
      title: reg.title ?? seq.title,
      family: reg.family ?? null,
      issues: reg.issues ?? [],
      commit: reg.commit ?? null,
      abilities: reg.abilities ?? [],
      rollback: reg.rollback ?? null,
      rollbackOk: rb.ok,
      rollbackDoc: rb.ok ? rb.docRel : null,
      rollbackCurrent: rb.ok ? rb.current : null,
      verdict: fresh ? reg.verdict : null,
      reason: fresh ? (reg.reason ?? "") : "",
      verdictAt: fresh ? (reg.verdictAt ?? null) : null,
      fixAnchor: anchor,
      blockers: notes,
    });
  }
  return { schema: "feature-queue@1", counts, batches };
}

// ──────────────────────── 寫入端（登記 / 裁決） ────────────────────────

/** ⭐ 登記。閘沒過就 throw ——「不准登記」是這條規則唯一的執行方式。 */
export function registerBatch(repoRoot, batch) {
  const { id, sequenceDir, rollback } = batch;
  if (typeof id !== "string" || id === "") throw new Error("登記需要 id（＝證據目錄名）");
  const rb = resolveRollback(repoRoot, rollback);
  if (!rb.ok) throw new Error(`拒絕登記「${id}」：${rb.error}`);
  const seq = scanSequences(repoRoot).find((s) => s.id === id);
  if (seq === undefined) throw new Error(`拒絕登記「${id}」：找不到連續圖片序列 ${SEQUENCE_ROOT_REL}/${id}/`);
  // ⭐ 只讀**材料**（⛔ 不讀裁決）—— 登記這條路徑結構上碰不到 owner 的裁決欄位。
  const material = loadMaterial(repoRoot);
  const prev = material.batches[id] ?? {};
  material.batches[id] = {
    title: batch.title ?? seq.title,
    family: batch.family ?? prev.family ?? null,
    issues: batch.issues ?? prev.issues ?? [],
    abilities: batch.abilities ?? prev.abilities ?? [],
    commit: batch.commit ?? prev.commit ?? null,
    sequenceDir: sequenceDir ?? seq.dir,
    rollback,
    registeredAt: prev.registeredAt ?? new Date().toISOString(),
  };
  saveMaterial(repoRoot, material.batches);
  return material.batches[id];
}

/** 裁決。keep＝確認保留（預設狀態）；veto＝否決還原 ⇒ **必填原因**。 */
export function saveFeatureVerdict(repoRoot, { id, hash, verdict, reason, source = "local" }) {
  if (verdict !== "keep" && verdict !== "veto") throw new Error("verdict 只能是 keep 或 veto");
  const trimmed = typeof reason === "string" ? reason.trim() : "";
  if (verdict === "veto" && trimmed === "")
    throw new Error("否決必填原因 —— ⛔ 無原因的否決是心情，不是資料");
  // ⭐ 只讀**材料**來確認「這一批登記過」，⛔ 讀不到也寫不到別人的裁決。
  const reg = loadMaterial(repoRoot).batches[id];
  if (reg === undefined) throw new Error(`未登記的批次「${id}」—— 先登記（含 rollback 開關）才判定得了`);
  const entry = saveVerdictEntry(repoRoot, source, id, {
    verdict,
    verdictHash: hash,
    reason: trimmed,
    verdictAt: new Date().toISOString(),
  });
  return { ...reg, ...entry, rollback: reg.rollback };
}
