/**
 * 🎬 技能 JASS 特效實作對照（dataset: jass-vfx）
 *
 * 每支出貨技能一列：JASS 側（rawcode / MDL stems / 生成方式）vs GGD 側
 * （effects 裡的 spawnModelFx / spawnVfx / spawnProjectile、vfxKey / vfxLayers /
 * persistentVfx、config ability-vfx-bindings）。對不上（原作有特效、GGD 零表達）標紅。
 *
 * ⭐ 只讀既有產物與出貨 JSON（第〇·四守則：不自己重算公式、不發明資料）：
 *   · tools/w3x-import/out/vfx-bindings/VFX_BINDINGS.json —— w3x 普查產物（含
 *     art 頻道 / buff 頻道 / JASS invocation 的逐行掃描與 ggdDoc join）
 *   · content/config/ability-vfx-bindings.json —— skills:sync 產物
 *   · content/abilities/*.json · content/champions/*.json —— 出貨內容
 *
 * ⚠️ 誠實缺口：VFX_BINDINGS.json 是 2026-08-02 的普查（當時 662 份技能文件），
 *   content/abilities 現在是 ~421 份 —— 普查之後退休/新增的文件在 JASS 側
 *   沒有 join（回傳裡的 censusDrift 把兩個數字都攤開，⛔ 不是假裝對齊）。
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

const FX_EFFECT_KINDS = new Set(["spawnModelFx", "spawnVfx", "spawnProjectile"]);

/**
 * deps 是函式：逐檔列名（⛔ 不用目錄 mtime —— 目錄 mtime 只在增刪檔時動，
 * 就地編輯一份 ability JSON 不會 bust 快取，那就變回「靜態內容」）。
 */
export function deps(repoRoot) {
  const listJson = (dir) => {
    try {
      return readdirSync(join(repoRoot, dir))
        .filter((f) => f.endsWith(".json"))
        .map((f) => `${dir}/${f}`);
    } catch {
      return [dir]; // 目錄不見了也要進 key（absent 會讓快取失效並讓 build() 把錯誤說出來）
    }
  };
  return [
    "tools/w3x-import/out/vfx-bindings/VFX_BINDINGS.json",
    "content/config/ability-vfx-bindings.json",
    ...listJson("content/abilities"),
    ...listJson("content/champions"),
  ];
}

/** 正規化成小寫英數（比對 stem 用）。 */
function norm(s) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** 深走 effects 樹（onHit / delayed / weightedBranch… 都是巢狀陣列），收 vfx 類 effect。 */
function collectFxEffects(node, out) {
  if (Array.isArray(node)) {
    for (const x of node) collectFxEffects(x, out);
    return;
  }
  if (node === null || typeof node !== "object") return;
  if (typeof node.kind === "string" && FX_EFFECT_KINDS.has(node.kind)) {
    out.push({
      kind: node.kind,
      key: node.modelKey ?? node.vfxId ?? node.projectileId ?? null,
      count: typeof node.count === "number" ? node.count : undefined,
      preset: node.preset,
    });
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === "object") collectFxEffects(v, out);
  }
}

/** 一個 rawcode 的 JASS 側摘要：art 頻道 + buff 頻道 + invocation（去重、封頂）。 */
function summarizeJassAbility(entry, dummyUnits) {
  const art = [];
  const seenArt = new Set();
  const pushArt = (ch, e) => {
    const stem = e.stem ?? null;
    if (stem === null) return;
    const k = `${ch}|${stem}`;
    if (seenArt.has(k) || art.length >= 14) return;
    seenArt.add(k);
    art.push({ ch, stem, status: e.assetStatus ?? null, prov: e.provenance ?? null });
  };
  for (const [ch, chan] of Object.entries(entry.art ?? {})) {
    for (const e of chan?.entries ?? []) pushArt(ch, e);
  }
  for (const [buffId, chans] of Object.entries(entry.buffChannel ?? {})) {
    for (const [ch, list] of Object.entries(chans ?? {})) {
      for (const e of list ?? []) pushArt(`buff:${buffId}.${ch}`, e);
    }
  }
  const inv = [];
  const seenInv = new Set();
  for (const iv of entry.invocations ?? []) {
    let stem = iv.modelStem ?? null;
    let call = iv.kind ?? iv.call ?? "?";
    if (iv.kind === "dummyUnit") {
      const du = iv.unitId ? dummyUnits[iv.unitId] : undefined;
      stem = du?.modelStem ?? null;
      call = `dummyUnit:${iv.unitId ?? "?"}`;
    }
    const k = `${call}|${stem}`;
    if (seenInv.has(k) || inv.length >= 10) continue;
    seenInv.add(k);
    inv.push({ call, stem });
  }
  return { art, inv };
}

export async function build(repoRoot) {
  const { readFileSync, readdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  const readJson = (p) => JSON.parse(readFileSync(join(repoRoot, p), "utf8"));

  const census = readJson("tools/w3x-import/out/vfx-bindings/VFX_BINDINGS.json");
  const cfg = readJson("content/config/ability-vfx-bindings.json");

  // config bindings：abilityId(docId) → [{vfxKeys, source, rawcode}]
  const cfgByDoc = new Map();
  for (const b of cfg.bindings ?? []) {
    const list = cfgByDoc.get(b.abilityId) ?? [];
    list.push({ vfxKeys: b.vfxKeys ?? [], source: b.source ?? null, rawcode: b.rawcode ?? null });
    cfgByDoc.set(b.abilityId, list);
  }

  // 英雄名（docId 前綴 → content/champions/<prefix>.json 的 name）
  const champNames = new Map();
  for (const f of readdirSync(join(repoRoot, "content/champions"))) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    try {
      const d = readJson(`content/champions/${f}`);
      if (d.id) champNames.set(d.id, d.name ?? d.id);
    } catch {
      /* 壞檔照樣列（名字缺就缺）——這一頁是對照表，不是驗證器 */
    }
  }

  const abilityFiles = readdirSync(join(repoRoot, "content/abilities"))
    .filter((f) => f.endsWith(".json") && f !== "_index.json")
    .sort();

  const ggdDocIndex = census.ggdDocIndex ?? {};
  const ggdDocState = census.ggdDocState ?? {};
  const jassAbilities = census.abilities ?? {};
  const dummyUnits = census.dummyUnits ?? {};

  const rows = [];
  const statusCounts = {};
  let newSinceCensus = 0;

  for (const f of abilityFiles) {
    let doc;
    try {
      doc = readJson(`content/abilities/${f}`);
    } catch (err) {
      rows.push({ id: f.replace(/\.json$/, ""), name: "（JSON 解析失敗）", status: "parseError", error: String(err) });
      statusCounts.parseError = (statusCounts.parseError ?? 0) + 1;
      continue;
    }
    const docId = doc.id ?? f.replace(/\.json$/, "");
    const champId = docId.split(".")[0];
    const inCensus = docId in ggdDocState;
    if (!inCensus) newSinceCensus++;

    // ---- JASS 側 ----
    const links = ggdDocIndex[docId] ?? [];
    const jass = [];
    const jassStems = new Set();
    for (const link of links) {
      const entry = jassAbilities[link.abilityId];
      if (!entry) continue;
      const s = summarizeJassAbility(entry, dummyUnits);
      for (const a of s.art) jassStems.add(a.stem);
      for (const iv of s.inv) if (iv.stem) jassStems.add(iv.stem);
      jass.push({
        rc: link.abilityId,
        rcConfidence: link.confidence ?? null,
        jassName: entry.name ?? null,
        art: s.art,
        inv: s.inv,
      });
    }

    // ---- GGD 側 ----
    const fxEffects = [];
    collectFxEffects(doc.effects ?? [], fxEffects);
    const vfxLayers = (doc.vfxLayers ?? []).map((l) => l.vfxKey).filter(Boolean);
    const persistent = (doc.persistentVfx ?? []).map((p) => p.vfxKey).filter(Boolean);
    const cfgBindings = cfgByDoc.get(docId) ?? [];
    const ggd = {
      vfxKey: doc.vfxKey ?? null,
      vfxLayers,
      persistentVfx: persistent,
      effects: fxEffects.slice(0, 14),
      cfgVfxKeys: cfgBindings.flatMap((b) => b.vfxKeys).slice(0, 14),
      cfgSources: [...new Set(cfgBindings.map((b) => b.source).filter(Boolean))],
    };

    // ---- 對照 ----
    const ggdBlob = norm(
      [
        ggd.vfxKey,
        ...vfxLayers,
        ...persistent,
        ...fxEffects.map((e) => e.key),
        ...ggd.cfgVfxKeys,
      ].join("|"),
    );
    const matchedStems = [...jassStems].filter((st) => {
      const n = norm(st);
      return n.length >= 4 && ggdBlob.includes(n);
    });
    const jassHasArt = jassStems.size > 0;
    const ggdHasVfx =
      ggdBlob.length > 0 || fxEffects.length > 0; // effect 沒 key 也算有表達（如 preset-only）
    let status;
    if (links.length === 0) status = inCensus ? "unlinked" : "notInCensus";
    else if (jassHasArt && !ggdHasVfx) status = "jassOnly"; // ⛔ 紅：原作有特效，GGD 零表達
    else if (!jassHasArt && ggdHasVfx) status = "ggdOnly";
    else if (!jassHasArt && !ggdHasVfx) status = "none";
    else status = matchedStems.length > 0 ? "match" : "replaced";
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;

    rows.push({
      id: docId,
      name: doc.name ?? docId,
      champion: champNames.get(champId) ?? champId,
      slot: doc.slot ?? docId.split(".")[1] ?? "?",
      censusState: ggdDocState[docId] ?? null,
      status,
      matchedStems,
      jass,
      ggd,
    });
  }

  const censusDocs = Object.keys(ggdDocState).length;
  const currentIds = new Set(rows.map((r) => r.id));
  const retiredFromCensus = Object.keys(ggdDocState).filter((id) => !currentIds.has(id)).length;

  return {
    schema: "live.jass-vfx@1",
    sources: {
      census: "tools/w3x-import/out/vfx-bindings/VFX_BINDINGS.json（w3x 普查產物）",
      config: "content/config/ability-vfx-bindings.json（skills:sync 產物）",
      content: "content/abilities/*.json · content/champions/*.json",
    },
    censusDrift: {
      censusDocs,
      currentDocs: rows.length,
      retiredFromCensus,
      newSinceCensus,
      note:
        "VFX_BINDINGS.json 是一次性的普查產物；普查後退休的文件不在本表，普查後新增的文件 JASS 側沒有 join（status=notInCensus）。",
    },
    statusCounts,
    rows,
  };
}
