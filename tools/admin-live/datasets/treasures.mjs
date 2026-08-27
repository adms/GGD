/**
 * 🗡️ 寶具三選一（/__live/treasures）—— 武器輪抽 + 聖杯願望輪抽的組合對照。
 *
 * 兩張「三選一」其實是兩條不同的管線，這一份把兩邊都攤開：
 *   · 武器側：content/loot-tables/*.json 的池（哪幾件、權重）×
 *     config.arena-rules@1 的 weaponTiers / rounds（哪一回合、多少 %、限幾件）×
 *     content/items/*.json 的現值（cost）× 寶具總表_EX三階.csv 的翻盤力（產生器產物）。
 *   · 聖杯側：content/augments/grail-*.json（60 張願望：tier / weight / selectionSlot /
 *     eligibility）× grailDraft 規則 × tools/grail-wishes CSV 的顯示名（級・第幾願望）。
 *
 * ⭐ 第〇·四守則：一切引用出貨 JSON／產生器產物，⛔ 不重算公式。
 *   「佔比」只是滿池權重的除法（給人看密度用），實際機率還要過
 *   eligibility / 白名單 / 已擁有 / 顯現位置多樣性（sim/economy/draft.ts）——
 *   這裡刻意不模擬那條鏈。
 * build() 不寫任何檔；儲存走共用寫入端（見下面的 `write` 宣告，GH#821）。
 * CSV 解析 spawn python3（多行引號欄位，⛔ 不自己手刻 parser）。
 */

export const deps = [
  "content/config/arena-rules.json",
  "content/loot-tables",
  "content/loot-tables/_index.json",
  "content/items",
  "content/items/_index.json",
  "content/augments",
  "content/augments/_index.json",
  "寶具總表_EX三階.csv",
  "tools/grail-wishes/ggd_sacred_grail_wishes_v1.csv",
];

/** python3 -c：兩份 CSV → 一包 JSON（utf-8-sig 吃掉 BOM；csv 模組處理多行引號欄）。 */
const PY_DUMP = `
import csv, json, sys
out = {}
for key, path in (("treasure", sys.argv[1]), ("wishes", sys.argv[2])):
    try:
        with open(path, encoding="utf-8-sig", newline="") as f:
            out[key] = list(csv.DictReader(f))
    except Exception as e:
        out[key + "_error"] = str(e)
print(json.dumps(out, ensure_ascii=False))
`;

const TIER_ZH = { silver: "白銀", gold: "黃金", prismatic: "稜彩" };
/** 池的呈現順序照賽程：基礎 EX（第 2/5 回合）→ EX解放 → EX∅ 根源。 */
const TABLE_ORDER = ["legendary-weapons", "ex-release-weapons", "ex-origin-weapons"];

/**
 * ⭐ GH#821 寫入宣告 —— POST /__live/treasures/save。
 * loot table 是手編檔（genguard ✓；寫入端每次寫前仍會再問它）。
 * pointer 用**檔案裡的原始索引**（rows 的 srcIndex），⛔ 不是頁面排序後的位置。
 */
export const write = {
  kind: "source",
  rules: [
    {
      paths: ["content/loot-tables/*.json"],
      pointers: ["/entries/*/weight"],
      value: { type: "number", min: 0, max: 1000 },
      why: "獎池逐件權重（sharePct 由它推導）",
    },
  ],
};

export async function build(repoRoot) {
  const { readFileSync, readdirSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { spawnSync } = await import("node:child_process");

  const readJson = (p) => JSON.parse(readFileSync(join(repoRoot, p), "utf8"));
  const warnings = [];
  const rules = readJson("content/config/arena-rules.json");

  // ---- 產生器產物的兩份 CSV（join 用，⛔ 不是資料的主住處） ----
  const treasureCsv = new Map();
  const wishCsv = new Map();
  const py = spawnSync(
    "python3",
    ["-c", PY_DUMP, join(repoRoot, "寶具總表_EX三階.csv"), join(repoRoot, "tools/grail-wishes/ggd_sacred_grail_wishes_v1.csv")],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (py.status === 0 && py.stdout) {
    const dump = JSON.parse(py.stdout);
    for (const r of dump.treasure ?? []) treasureCsv.set(r.id, r);
    for (const r of dump.wishes ?? []) wishCsv.set(r.id, r);
    if (dump.treasure_error) warnings.push(`寶具總表_EX三階.csv 讀取失敗：${dump.treasure_error}`);
    if (dump.wishes_error) warnings.push(`grail-wishes CSV 讀取失敗：${dump.wishes_error}`);
  } else {
    warnings.push(`python3 CSV dump 失敗（exit ${py.status}）：${(py.stderr || "").slice(0, 300)}`);
  }

  // ---- 武器側：loot table × weaponTiers × rounds × items ----
  const tierByTable = new Map((rules.weaponTiers ?? []).map((t) => [t.table, t]));
  /** table id → 固定發卡的回合（rounds.<n>.weaponLootTable）。 */
  const fixedRounds = new Map();
  for (const [rd, cfg] of Object.entries(rules.rounds ?? {})) {
    if (!cfg || !cfg.weaponLootTable) continue;
    const list = fixedRounds.get(cfg.weaponLootTable) ?? [];
    list.push({ round: Number(rd), pct: cfg.weaponDraftPct ?? null, draftBoth: cfg.draftBoth === true });
    fixedRounds.set(cfg.weaponLootTable, list);
  }

  const lootDir = join(repoRoot, "content/loot-tables");
  const tables = [];
  let missingItems = 0;
  let csvMisses = 0;
  for (const f of readdirSync(lootDir)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const table = JSON.parse(readFileSync(join(lootDir, f), "utf8"));
    const tid = table.id ?? f.slice(0, -5);
    const tierRow = tierByTable.get(tid) ?? null;
    const entries = [];
    const totalWeight = (table.entries ?? []).reduce((s, e) => s + (e.weight ?? 1), 0);
    let srcIndex = -1; // 檔案裡的原始索引（寫入端的 pointer 用它；entries 稍後會重排）
    for (const e of table.entries ?? []) {
      srcIndex += 1;
      const p = join(repoRoot, "content/items", `${e.itemId}.json`);
      let doc = null;
      if (existsSync(p)) doc = JSON.parse(readFileSync(p, "utf8"));
      else missingItems++;
      const csvRow = treasureCsv.get(e.itemId) ?? null;
      if (!csvRow) csvMisses++;
      const swingRaw = csvRow ? String(csvRow["翻盤力"] ?? "") : "";
      const bar = swingRaw.indexOf("｜");
      entries.push({
        srcIndex,
        itemId: e.itemId,
        name: doc?.name ?? "（content/items 缺這一份）",
        weight: e.weight ?? 1,
        sharePct: totalWeight > 0 ? Math.round(((e.weight ?? 1) / totalWeight) * 1000) / 10 : 0,
        cost: doc?.cost ?? null,
        craftRole: doc?.craftRole ?? "none",
        draftEligible: doc?.draftEligible !== false, // 省略＝true（schema/item.ts）
        requiresAttackType: doc?.requiresAttackType ?? null,
        swingScore: bar > 0 ? Number(swingRaw.slice(0, bar)) : null,
        swingMarks: bar > 0 ? swingRaw.slice(bar + 1) : swingRaw || null,
        tags: doc?.tags ?? [],
      });
    }
    entries.sort((a, b) => (b.swingScore ?? -1) - (a.swingScore ?? -1) || a.itemId.localeCompare(b.itemId));
    tables.push({
      id: tid,
      file: `content/loot-tables/${f}`, // 寫入端的 path 用它（⛔ 不從 id 拼檔名）
      name: table.name ?? tid,
      note: table.note ?? "",
      label: tierRow?.label ?? "EX（基礎池）",
      tier: tierRow, // minRound/maxRound/basePct/underdog*/guaranteeAtD/limitScope/limitCount —— 出貨值原樣
      fixedRounds: fixedRounds.get(tid) ?? [],
      entryCount: entries.length,
      totalWeight,
      entries,
    });
  }
  tables.sort((a, b) => {
    const ia = TABLE_ORDER.indexOf(a.id);
    const ib = TABLE_ORDER.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.id.localeCompare(b.id);
  });
  if (missingItems > 0) warnings.push(`loot table 指到 ${missingItems} 件 content/items 沒有的道具`);
  if (csvMisses > 0 && treasureCsv.size > 0)
    warnings.push(`${csvMisses} 件不在 寶具總表_EX三階.csv 裡（產物過期？跑 python3 tools/economy/gen_treasure_csv.py）`);

  // ---- 聖杯側：出貨 augments（60 願望 + 31 舊卡） ----
  const augDir = join(repoRoot, "content/augments");
  const wishes = [];
  const legacy = [];
  for (const f of readdirSync(augDir)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const doc = JSON.parse(readFileSync(join(augDir, f), "utf8"));
    const isWish = Array.isArray(doc.tags) && doc.tags.includes("grail-wish");
    if (!isWish) {
      legacy.push({ id: doc.id, name: doc.name, tier: doc.tier, weight: doc.weight });
      continue;
    }
    const csvRow = wishCsv.get(doc.id) ?? null;
    wishes.push({
      id: doc.id,
      name: doc.name,
      tier: doc.tier,
      tierZh: TIER_ZH[doc.tier] ?? doc.tier,
      rankDisplay: csvRow?.rank_display ?? "",
      weight: doc.weight,
      slot: doc.selectionSlot ?? "generic",
      slotDisplay: csvRow?.selection_slot_display ?? "",
      eligibility: doc.eligibility ? JSON.stringify(doc.eligibility) : "",
      tags: doc.tags,
      description: doc.description ?? "",
    });
  }
  const tierOrder = { silver: 0, gold: 1, prismatic: 2 };
  wishes.sort((a, b) => (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9) || a.id.localeCompare(b.id));
  legacy.sort((a, b) => (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9) || a.id.localeCompare(b.id));
  const wishCsvMisses = wishes.filter((w) => w.slotDisplay === "").length;
  if (wishCsvMisses > 0 && wishCsv.size > 0)
    warnings.push(`${wishCsvMisses} 張願望不在 tools/grail-wishes CSV 裡（顯示名列不出「第幾願望」）`);

  const bySlot = {};
  const byTier = {};
  for (const w of wishes) {
    bySlot[w.slot] = (bySlot[w.slot] ?? 0) + 1;
    const t = (byTier[w.tier] ??= { count: 0, totalWeight: 0 });
    t.count += 1;
    t.totalWeight += w.weight;
  }

  /** 每一回合發哪一階的願望卡（rounds.<n>.augmentTier，出貨值原樣）。 */
  const roundAugmentTiers = Object.entries(rules.rounds ?? {})
    .filter(([, c]) => c && c.augmentTier)
    .map(([rd, c]) => ({ round: Number(rd), tier: c.augmentTier }))
    .sort((a, b) => a.round - b.round);

  return {
    warnings,
    weapon: {
      offerCount: rules.offerCount ?? 3,
      draftConflict: rules.draftConflict ?? "",
      itemDraft: rules.itemDraft ?? {},
      legendaryShelf: rules.legendaryShelf ?? {},
      tables,
    },
    grail: {
      rules: rules.grailDraft ?? {},
      augmentTiers: rules.augmentTiers ?? [],
      roundAugmentTiers,
      bySlot,
      byTier,
      wishCount: wishes.length,
      legacyCount: legacy.length,
      wishes,
      legacy,
    },
  };
}
