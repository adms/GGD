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
 * ⚠️ 這裡以前寫著「VFX_BINDINGS.json 是 2026-08-02 的普查（當時 662 份技能文件）」——
 *   #777 把那個缺口關掉了：普查現在**跟著出貨內容重跑**，兩側逐份對齊。
 *   ⛔ 但 `censusDrift` 沒有拿掉，也不該拿掉 —— 它是量到的，而一份不再被量的對齊
 *   就是下一次的過期快照。閘：`packages/shared/src/ops/laneCENSUSVfxCensusFresh.test.ts`。
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ⭐ GH#821 寫入宣告 —— POST /__live/jass-vfx/save（GH#823 從 1 格擴到 4 格）。
 * GGD 側的特效綁定都是技能文件自己的欄位（家在 content/abilities —— 混編目錄，
 * 寫入端逐次 spawn genguard 裁決；skillremake:json 的產物會 409 指名擁有者）。
 *
 * 開放四個 pointer、三條規則（第零守則⑨：兩個同型的 `vfxKey` 陣列共用一條規則，
 * ⛔ 不抄第二份 check）—— ⚠️ 用 `<i>` 寫索引位，pointer 樣式的 `*` 加 `/`
 * 寫進區塊註解會**提早關掉註解**（middleware.mjs 的 pointerHit 上面記過同一件事）：
 *   · `/vfxKey`                  —— 施法主特效（null＝移除綁定）
 *   · `/vfxLayers/<i>/vfxKey`    —— 特效堆疊第 i 層播什麼
 *   · `/persistentVfx/<i>/vfxKey`—— 常駐特效（莉娜 EX 腳下魔法陣那一族）掛什麼
 *   · `/vfxLayers/<i>/delayMs`   —— 第 i 層延遲幾毫秒（蓄力→爆炸→餘燼的時間軸）
 *
 * ⭐ 上下界一律抄**出貨 schema**，⛔ 不自己挑一個看起來合理的：
 *   · vfxKey 是 `zRef("vfx", {soft:true})` ＝ `zId` ＝ `.max(64)`
 *     （packages/shared/src/content/schema/common.ts）。
 *     ⚠️ 這一格在 GH#823 之前寫 `maxLen: 80` —— 比出貨 schema **寬 16 個字**，
 *     也就是「後台存得下、內容驗證拒收」的那個形狀（與 ex-roots 的 offerCount 同型）。
 *   · delayMs 是 `z.number().min(0).max(8000)`
 *     （packages/shared/src/content/schema/abilityVfx.ts 的 zAbilityVfxLayer）。
 *
 * check：key 要在 content/vfx/_index.json 的 entries 裡（zRef("vfx") 的名冊 ——
 * 粒子 `vfx@1` / 緞帶 `ribbon@1` / 掛件 `attachment@1` 三種都住那個集合，量過
 * 649 筆涵蓋現行全部 vfxKey / vfxLayers / persistentVfx）—— 存一個查不到的 key
 * = 卡上宣稱了不會發生的特效（第一·五守則）。
 *
 * ⛔ 陣列元素的 `vfxKey` **不可為 null**：它在 schema 裡是必填，刪掉那一格會讓整份
 * 文件驗不過（而且 middleware 的寫入器對陣列元素本來就拒絕 null-delete）。
 * effects 樹裡巢狀的 spawn 節點**刻意不開**：單格 pointer 表達不了一個節點的編輯，
 * 那屬於技能編輯器（skill-authoring 的骨架路線）。
 */
const VFX_ID_MAX_LEN = 64; // = zId 的 .max(64)（schema/common.ts）——⛔ 不要在這裡放一個更寬的數字

/** 一個 vfx id 在不在 zRef("vfx") 的名冊裡。回 null = 過（與 rule.check 同一個約定）。 */
function vfxIdError(repoRoot, value) {
  const idx = JSON.parse(readFileSync(join(repoRoot, "content/vfx/_index.json"), "utf8"));
  return (idx.entries ?? []).some((e) => e.id === value)
    ? null
    : `「${value}」不在 content/vfx/_index.json —— 存了也畫不出來（第一·五守則）`;
}

export const write = {
  kind: "source",
  rules: [
    {
      paths: ["content/abilities/*.json"],
      pointers: ["/vfxKey"],
      value: { type: "string", maxLen: VFX_ID_MAX_LEN, nullable: true },
      why: "技能頂層 vfxKey（null＝移除）",
      check: (repoRoot, { value }) => (value === null ? null : vfxIdError(repoRoot, value)),
    },
    {
      paths: ["content/abilities/*.json"],
      pointers: ["/vfxLayers/*/vfxKey", "/persistentVfx/*/vfxKey"],
      value: { type: "string", maxLen: VFX_ID_MAX_LEN },
      why: "特效堆疊／常駐特效第 i 格播什麼（⛔ 不可 null —— schema 裡它是必填）",
      check: (repoRoot, { value }) => vfxIdError(repoRoot, value),
    },
    {
      paths: ["content/abilities/*.json"],
      pointers: ["/vfxLayers/*/delayMs"],
      value: { type: "number", min: 0, max: 8000, nullable: true },
      why: "特效堆疊第 i 層延遲毫秒（null＝移除欄位＝0，與主特效同一幀）",
    },
  ],
};

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
    // ⭐ 帶**陣列索引**出去 —— 頁面拿它組 JSON pointer（`/vfxLayers/<i>/vfxKey`）。
    // ⛔ 不 filter：濾掉一格就讓這裡的索引與磁碟上那份 JSON 錯開，而寫入端是照索引寫的
    //   ——「照一把沒驗過的鑰匙 join」正是第〇·六守則記過的資料毀損形狀。
    const vfxLayers = (doc.vfxLayers ?? []).map((l, i) => ({
      i,
      vfxKey: typeof l?.vfxKey === "string" ? l.vfxKey : null,
      delayMs: typeof l?.delayMs === "number" ? l.delayMs : null,
    }));
    const persistent = (doc.persistentVfx ?? []).map((p, i) => ({
      i,
      vfxKey: typeof p?.vfxKey === "string" ? p.vfxKey : null,
    }));
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
        ...vfxLayers.map((l) => l.vfxKey),
        ...persistent.map((p) => p.vfxKey),
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
        retiredFromCensus === 0 && newSinceCensus === 0
          ? "普查與出貨內容逐份對齊（#777）。⭐ 這兩個 0 是**閘**守著的：laneCENSUS 的 " +
            "vfxCensusFresh.test.ts 會在任何一邊漂掉時變紅並指名那幾份文件。"
          : "⛔ 普查與出貨內容對不上了 —— VFX_BINDINGS.json 是產物，跑 " +
            "`python3 tools/w3x-import/build_vfx_bindings.py && python3 tools/w3x-import/build_vfx_census.py`" +
            " 重跑普查（⚠️ 之後 vfxbind / audit / jasscombo 三支產生器都要跟著重跑）。",
    },
    statusCounts,
    rows,
  };
}
