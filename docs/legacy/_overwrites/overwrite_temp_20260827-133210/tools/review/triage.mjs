/**
 * tools/review/triage.mjs —— GH#664 HITL 驗收 triage 引擎（R1）。
 *
 * owner 2026-08-24（逐字）：
 * > 「所有關於視覺、特效、音效等非結構化資料驗收，你應該要特別對應的自動化流程，
 * >  並且把風險高的、辨識能力差的額外安插人類驗收的步驟，但避免全部都給人類驗收的極端，
 * >  應該還是要有邏輯的篩選放到 HITL，並且考慮批次於一頁網頁瀏覽打勾標記通過與否的方式」
 *
 * 三層分工：
 *   Tier0（機器閘）—— 結構正確性交給既有守衛（refs.ts dangling、models:check、
 *     sfxbind:check、budget:check），⛔ 這裡不重做。零上架引用且無抱怨旗標的資產
 *     屬於這一層：沒有玩家看得到它，人審它是浪費。
 *   HITL（本引擎）—— risk = Σ 引用它的上架技能（R/EX 槽 ×2）＋ 抱怨族 bonus
 *     （tools/review/complaints.json，逐列附 owner 原話）。
 *   核准帳本 —— docs/_review/approvals.json（review-approvals@1）。
 *     判準是 hash：內容變了（hash 與帳本不符）＝ 核准過期 ⇒ 回 pending。
 *
 * ⚠️ 佇列輸出（queue.json）刻意零時鐘欄位 —— review:check 逐位元組比對，
 *    帶日期的欄位會逼閘放寬成模糊比對（CLAUDE.md：一條被放寬的閘等於沒有閘）。
 *    帳本（approvals.json）是人審紀錄，reviewedAt 合法住在那邊。
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { voiceHitl } from "./voice.mjs";

const sha1 = (buf) => createHash("sha1").update(buf).digest("hex");

/** 排序鍵的 canonical JSON —— 同一份文件永遠得到同一個 hash。 */
export function canonical(o) {
  if (Array.isArray(o)) return `[${o.map(canonical).join(",")}]`;
  if (o && typeof o === "object") {
    const keys = Object.keys(o).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(o);
}

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const listJson = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "_index.json").sort() : [];

/** 技能 JSON 裡「字串值 ⇒ 資產」的鍵。⚠️ 巢狀（vfxLayers/persistentVfx 內）由遞迴 walk 接住。 */
const STRING_REF_KEYS = {
  vfxKey: "vfx",
  vfxId: "vfx",
  stepVfx: "vfx",
  sfxKey: "sfx",
  soundKey: "sfx",
  arriveSoundKey: "sfx",
  modelKey: "model",
};

/** ability-templates 的 params.*.default 也可能指資產（例：tpl-beam-roll → imported.netherstrike）。 */
function templateDefaults(repoRoot) {
  const out = new Map();
  for (const f of listJson(join(repoRoot, "content/ability-templates"))) {
    const doc = readJson(join(repoRoot, "content/ability-templates", f));
    const refs = [];
    const params = doc.params && !Array.isArray(doc.params) ? doc.params : {};
    for (const [k, spec] of Object.entries(params)) {
      const kind = STRING_REF_KEYS[k];
      if (kind && spec && typeof spec.default === "string") refs.push(`${kind}:${spec.default}`);
    }
    out.set(doc.id ?? basename(f, ".json"), refs);
  }
  return out;
}

function loadComplaints(repoRoot) {
  const p = join(repoRoot, "tools/review/complaints.json");
  return existsSync(p) ? (readJson(p).families ?? []) : [];
}

/**
 * 盤點出貨資產 ＋ 引用圖 ＋ risk。
 * 回傳 [{ id, kind, hash, refs, risk, reasons, spec? }]，risk 降冪、同分按 id。
 */
export function buildInventory(repoRoot) {
  const assets = new Map(); // "kind:id" -> item
  const add = (kind, id, hash) =>
    assets.set(`${kind}:${id}`, { id, kind, hash, refs: [], risk: 0, reasons: [] });

  // ── vfx：content/vfx/*.json（hash = canonical JSON）
  for (const f of listJson(join(repoRoot, "content/vfx"))) {
    const doc = readJson(join(repoRoot, "content/vfx", f));
    add("vfx", doc.id ?? basename(f, ".json"), sha1(canonical(doc)));
  }
  // ── model：content/assets/models/imported/*.glb（hash = 檔案位元組）
  const modelsDir = join(repoRoot, "content/assets/models/imported");
  if (existsSync(modelsDir)) {
    for (const f of readdirSync(modelsDir).filter((f) => f.endsWith(".glb")).sort()) {
      add("model", `imported.${basename(f, ".glb")}`, sha1(readFileSync(join(modelsDir, f))));
    }
  }
  // ── sfx：audio-map.json 的 sfx 綁定（hash = 該綁定的 canonical JSON）。
  //    綁定的「家」是 abilities 的 sfxKey（ability-sfx-cues 只是推導的對照，⛔ 不重抄）。
  const audioMapPath = join(repoRoot, "content/config/audio-map.json");
  if (existsSync(audioMapPath)) {
    for (const [key, entry] of Object.entries(readJson(audioMapPath).sfx ?? {})) {
      add("sfx", key, sha1(canonical(entry)));
    }
  }

  // ── voice：content/assets/audio/voices/lines/<英雄>/status.json（GH#756 段③）
  //    ⭐ **一位英雄一列**，hash 沿用 status.json 既有的 sha256（⛔ 不另立一套）。
  //    風險由分離度灰區決定 —— 見下面的 voiceHitl()，⛔ 不是「有語音就送人審」。
  const voice = voiceHitl(repoRoot);
  const grayDegree = new Map();
  for (const p of voice.pairs) {
    for (const who of [p.a, p.b]) grayDegree.set(who, (grayDegree.get(who) ?? 0) + 1);
  }
  for (const v of voice.inventory) {
    add("voice", v.id, v.hash);
    const a = assets.get(`voice:${v.id}`);
    a.clips = v.clips;
    // ⭐ 有邏輯的篩選：只有**分離度灰區**裡的英雄才值得人耳去聽（owner：⛔ 不要全給人）。
    const deg = grayDegree.get(v.id) ?? 0;
    if (deg > 0) {
      a.risk += deg * 2;
      a.reasons.push(`分離度灰區 ${deg} 對（${voice.reason}）—— 需要人耳 ABX`);
    }
  }
  // ⚠️ 量測過期時**一對都選不出來**，而那是「判不了」⛔ 不是「沒問題」——
  //    ⇒ 它要有一個看得見的數字（counts.voiceUndeterminable），⛔ 不是沉默。
  const voiceNote = voice.status === "ok" ? null : { status: voice.status, reason: voice.reason };

  // ── 引用圖：出貨技能 JSON 遞迴掃 ＋ tpl preset 解析
  const tplDefaults = templateDefaults(repoRoot);
  const abilitiesDir = join(repoRoot, "content/abilities");
  for (const f of listJson(abilitiesDir)) {
    const doc = readJson(join(abilitiesDir, f));
    const abilityId = doc.id ?? basename(f, ".json");
    const weight = doc.slot === "R" || doc.slot === "EX" ? 2 : 1; // R/EX 槽 ×2
    const hit = new Set();
    (function walk(o) {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== "object") return;
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === "string") {
          const kind = STRING_REF_KEYS[k];
          if (kind) hit.add(`${kind}:${v}`);
          else if ((k === "preset" || k === "tpl" || k === "ref") && v.startsWith("tpl-"))
            for (const r of tplDefaults.get(v) ?? []) hit.add(r);
        } else walk(v);
      }
    })(doc);
    for (const key of hit) {
      const a = assets.get(key);
      if (!a) continue; // dangling ref 是 refs.ts 的守備範圍，這裡不重做
      a.refs.push(abilityId);
      a.risk += weight;
    }
  }

  // ── 抱怨族 bonus（owner 點名過的家族，逐列附原話）
  const families = loadComplaints(repoRoot);
  for (const a of assets.values()) {
    a.refs.sort();
    if (a.refs.length > 0)
      a.reasons.push(`${a.refs.length} 支上架技能引用（R/EX ×2 加權後 risk ${a.risk}）`);
    for (const fam of families) {
      if ((fam.match ?? []).some((m) => a.id.toLowerCase().includes(m.toLowerCase()))) {
        a.risk += fam.bonus ?? 0;
        a.reasons.push(`抱怨族「${fam.name}」+${fam.bonus}`);
        if (a.spec === undefined && (fam.spec || fam.quote)) a.spec = fam.spec ?? fam.quote;
      }
    }
  }
  return [...assets.values()].sort((x, y) => y.risk - x.risk || (x.id < y.id ? -1 : 1));
}

const LEDGER_REL = "docs/_review/approvals.json";
export function loadLedger(repoRoot) {
  const p = join(repoRoot, LEDGER_REL);
  return existsSync(p) ? readJson(p) : { schema: "review-approvals@1", entries: {} };
}

/** 寫一筆裁決進帳本（middleware 的 POST /__review/verdict 走這裡）。 */
export function saveVerdict(repoRoot, { kind, id, hash, verdict, note }) {
  const ledger = loadLedger(repoRoot);
  ledger.entries[`${kind}:${id}`] = {
    hash,
    verdict,
    note: note ?? "",
    reviewedAt: new Date().toISOString(),
    reviewer: "owner",
  };
  mkdirSync(join(repoRoot, "docs/_review"), { recursive: true });
  writeFileSync(join(repoRoot, LEDGER_REL), `${JSON.stringify(ledger, null, 2)}\n`);
  return ledger;
}

/**
 * 佇列 = risk > 0 且（沒被核准過，或 hash 與帳本不符＝核准過期）。
 * risk 0 的資產屬於 Tier0（機器閘），⛔ 不進人審佇列。
 */
export function buildQueue(repoRoot) {
  const inventory = buildInventory(repoRoot);
  const entries = loadLedger(repoRoot).entries ?? {};
  const items = [];
  let tier0 = 0;
  let reviewed = 0;
  for (const a of inventory) {
    if (a.risk <= 0) {
      tier0++;
      continue;
    }
    const e = entries[`${a.kind}:${a.id}`];
    if (e && e.hash === a.hash) {
      reviewed++;
      continue;
    }
    const reasons = [...a.reasons, e ? "內容已變 —— 先前的裁決 hash 過期" : "未審"];
    const item = { id: a.id, kind: a.kind, hash: a.hash, risk: a.risk, reasons, refs: a.refs };
    if (a.spec !== undefined) item.spec = a.spec;
    items.push(item);
  }
  return {
    schema: "review-queue@1",
    counts: { assets: inventory.length, tier0, reviewed, pending: items.length },
    items,
  };
}

export const QUEUE_REL = "docs/_review/queue.json";
export const queueText = (repoRoot) => `${JSON.stringify(buildQueue(repoRoot), null, 2)}\n`;

export function writeQueue(repoRoot) {
  mkdirSync(join(repoRoot, "docs/_review"), { recursive: true });
  const text = queueText(repoRoot);
  writeFileSync(join(repoRoot, QUEUE_REL), text);
  return JSON.parse(text);
}
