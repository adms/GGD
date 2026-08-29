/**
 * 🧩 技能機制模板對照＋距離範圍五級距 —— /__live/mech-templates
 *
 * 每次請求（deps 有動時）當場掃：
 *   · content/ability-templates/*.json —— 46 個模板家族（id/name/family/status/params…）
 *   · content/abilities/*.json        —— 421 支 standalone 技能：誰 ref 哪個模板、
 *                                        rangeTier / radiusTier（含 effects 裡巢狀的）用哪一級
 *   · content/config/{aoe-tiers,range-tiers}.json —— 五級距的**出貨值**（⛔ 不重算梯子）
 *   · content/config/map-spec.json     —— 場地格數與 tileSize（俯視圖的底）
 *   · content/config/range-guide.json  —— 範圍指引的出貨顏色（頁面同色，⛔ 不自己挑色）
 *
 * ⚠️ 只掃 standalone abilities（鏡射權威側）；champion-embedded 那一份是 sync 出來的
 *    副本，掃它只會重複計數。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CONFIG_FILES = [
  "content/config/aoe-tiers.json",
  "content/config/range-tiers.json",
  "content/config/map-spec.json",
  "content/config/range-guide.json",
];

/** deps 是函式：逐檔列 mtime（目錄 mtime 抓不到「就地改一個檔」）。 */
export function deps(repoRoot) {
  const out = [...CONFIG_FILES];
  for (const dir of ["content/ability-templates", "content/abilities"]) {
    try {
      for (const f of readdirSync(join(repoRoot, dir))) {
        if (f.endsWith(".json")) out.push(`${dir}/${f}`);
      }
    } catch {
      out.push(dir); // 目錄不存在 → 以目錄本身當 dep（absent 也是一種狀態）
    }
  }
  return out;
}

function readJson(repoRoot, rel) {
  return JSON.parse(readFileSync(join(repoRoot, rel), "utf8"));
}

function listJson(repoRoot, dir) {
  return readdirSync(join(repoRoot, dir))
    .filter((f) => f.endsWith(".json") && f !== "_index.json")
    .map((f) => ({ file: f, doc: readJson(repoRoot, `${dir}/${f}`) }));
}

/** 走訪整份文件，收集所有（含巢狀）radiusTier / rangeTier 的字串值。 */
function collectTiers(node, acc, depth = 0) {
  if (depth > 24 || node == null) return;
  if (Array.isArray(node)) {
    for (const v of node) collectTiers(v, acc, depth + 1);
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if ((k === "radiusTier" || k === "rangeTier") && typeof v === "string") acc[k].push(v);
      collectTiers(v, acc, depth + 1);
    }
  }
}

export async function build(repoRoot) {
  const aoeCfg = readJson(repoRoot, "content/config/aoe-tiers.json");
  const rangeCfg = readJson(repoRoot, "content/config/range-tiers.json");
  const mapSpec = readJson(repoRoot, "content/config/map-spec.json");
  const rangeGuide = readJson(repoRoot, "content/config/range-guide.json");

  const templates = listJson(repoRoot, "content/ability-templates");
  const abilities = listJson(repoRoot, "content/abilities");

  // ---- 採用掃描：ability.template = { ref, params } ----
  const adopters = new Map(); // tplId -> [{id,name,slot,champion}]
  const orphanRefs = []; // ref 指到不存在的模板
  const tplIds = new Set(templates.map((t) => t.doc.id));
  const tierAbilities = { rangeTier: new Map(), radiusTier: new Map() }; // tier -> Set(abilityId)
  const tierNodes = { rangeTier: {}, radiusTier: {} }; // tier -> 節點數（含巢狀）
  const anyTier = { rangeTier: new Set(), radiusTier: new Set() }; // 有用到這一軸的技能（去重）
  let withTemplate = 0;

  for (const { doc } of abilities) {
    const t = doc.template;
    if (t && typeof t === "object" && typeof t.ref === "string") {
      withTemplate += 1;
      const row = {
        id: doc.id,
        name: doc.name ?? "",
        slot: doc.slot ?? "",
        overrides: t.params && typeof t.params === "object" ? Object.keys(t.params).length : 0,
      };
      if (!tplIds.has(t.ref)) orphanRefs.push({ ref: t.ref, ability: doc.id });
      if (!adopters.has(t.ref)) adopters.set(t.ref, []);
      adopters.get(t.ref).push(row);
    }
    const acc = { radiusTier: [], rangeTier: [] };
    collectTiers(doc, acc);
    for (const axis of ["rangeTier", "radiusTier"]) {
      for (const tier of acc[axis]) {
        tierNodes[axis][tier] = (tierNodes[axis][tier] ?? 0) + 1;
      }
      for (const tier of new Set(acc[axis])) {
        if (!tierAbilities[axis].has(tier)) tierAbilities[axis].set(tier, new Set());
        tierAbilities[axis].get(tier).add(doc.id);
      }
    }
  }

  const templateRows = templates
    .map(({ doc }) => {
      const used = adopters.get(doc.id) ?? [];
      const params = doc.params && typeof doc.params === "object" ? Object.keys(doc.params) : [];
      return {
        id: doc.id,
        name: doc.name ?? "",
        family: doc.family ?? "",
        status: doc.status ?? "",
        description: typeof doc.description === "string" ? doc.description.slice(0, 220) : "",
        gapScore: doc.gapScore ?? null,
        paramNames: params,
        requires: Array.isArray(doc.requires) ? doc.requires : [],
        exemplar: doc.exemplar ?? null,
        adoptedBy: used.length,
        adopters: used.sort((a, b) => a.id.localeCompare(b.id)),
      };
    })
    .sort((a, b) => b.adoptedBy - a.adoptedBy || a.id.localeCompare(b.id));

  // ---- 五級距（出貨值直讀，⛔ 不重算） ----
  const tierOrder = ["極小", "小", "中", "大", "極大"];
  const tiers = tierOrder.map((tier) => ({
    tier,
    radius: aoeCfg.radius?.[tier] ?? null,
    range: rangeCfg.range?.[tier] ?? null,
    rangeAbilities: tierAbilities.rangeTier.get(tier)?.size ?? 0,
    radiusAbilities: tierAbilities.radiusTier.get(tier)?.size ?? 0,
    rangeNodes: tierNodes.rangeTier[tier] ?? 0,
    radiusNodes: tierNodes.radiusTier[tier] ?? 0,
  }));

  const grid = mapSpec.grid ?? {};
  return {
    stats: {
      templatesTotal: templateRows.length,
      templatesEnabled: templateRows.filter((t) => t.status === "enabled").length,
      templatesAdopted: templateRows.filter((t) => t.adoptedBy > 0).length,
      abilitiesTotal: abilities.length,
      abilitiesWithTemplate: withTemplate,
      abilitiesWithRangeTier: [...tierAbilities.rangeTier.values()].reduce((n, s) => n + s.size, 0),
      abilitiesWithRadiusTier: [...tierAbilities.radiusTier.values()].reduce(
        (n, s) => n + s.size,
        0,
      ),
      orphanRefs,
    },
    templates: templateRows,
    tiers,
    tierConfigs: {
      aoe: { enabled: aoeCfg.enabled ?? true, note: String(aoeCfg.note ?? "").slice(0, 400) },
      range: { enabled: rangeCfg.enabled ?? true, note: String(rangeCfg.note ?? "").slice(0, 400) },
    },
    arena: {
      // 俯視圖的底：map-spec 的參考格盤（24×18 格 × tileSize 2 = 48×36 世界單位）
      cols: 24,
      rows: 18,
      colsRange: [grid.colsMin ?? null, grid.colsMax ?? null],
      rowsRange: [grid.rowsMin ?? null, grid.rowsMax ?? null],
      tileSize: grid.tileSize ?? 2,
    },
    colors: {
      range: rangeGuide.rangeColor ?? "#73BFFF",
      rangeFillAlpha: rangeGuide.rangeFillAlpha ?? 0.09,
      aoe: rangeGuide.aoeColor ?? "#FF9E3B",
      aoeFillAlpha: rangeGuide.aoeFillAlpha ?? 0.2,
    },
  };
}
