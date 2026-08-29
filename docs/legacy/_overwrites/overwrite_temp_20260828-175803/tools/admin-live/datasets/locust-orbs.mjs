/**
 * 🦗 蝗蟲群球體實作對照（dataset: locust-orbs）
 *
 * 兩邊 join，每次請求當場算（⛔ 不是 build-time 烘的 JSON）：
 *   · 原作側：tools/locust-census/census.json（pnpm locust:build 的產物 ——
 *     236 隻 dummy 的 usca(scale)/tint/runtimeAlpha ＋ war3map.j 的 timedLife/生成點）
 *   · GGD 側：content/abilities + content/items 的 spawnModelFx 節點（modelKey 直寫
 *     或經 preset 讀 content/ability-templates 的家族預設）＋ content/models 的模型文件
 *
 * join 是**模型層級**：census 的 model basename（小寫、去 .mdl）對
 * `w3x.stock.<base>` / `imported.<base>` 兩個候選 key。
 * ⚠️ 同一具模型會被多隻 dummy 共用（TornadoElemental ×6 那一族）——
 * 落點掛在模型上，逐隻的 tint/α 差異要看兩邊欄位人工比對。
 *
 * 狀態分級（頁面上「缺的標紅」的判準）：
 *   proxy      —— 隱形/承襲模型（原作就看不見）⇒ 引擎對應物是 proxyCast，⛔ 不進模板
 *   landed     —— 有 ≥1 個出貨 spawnModelFx 節點引用得到這具模型
 *   model-only —— 模型文件已進 content/models 但沒有任何技能/道具引用（黃）
 *   missing    —— 連模型文件都沒有（紅）
 *
 * 對照值全部**引用出貨 JSON／產生器產物**（第〇·四守則），⛔ 這裡零重算公式。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { numericParamRows, tplDefaultRule, tplOriginRule } from "./_tplWrite.mjs";

/**
 * ⭐ GH#824 寫入宣告 —— 舊豁免被自己的反駁法反駁掉了一半：
 * 「左側 census＝產物、右側 effects 巢狀節點不可單格定址」對那**兩側**仍然成立
 * （census 仍唯讀、逐技能節點仍歸技能編輯器），⛔ 但頁上還有**第三側**：
 * 家族模板 tpl-locust-*.json 的 `params.<名>.default` —— 手編檔（genguard ✓）、
 * 名字定址（object 形 params，⛔ 不是索引）、正是票上「一鍵 rollback 那格」。
 * 改一格，引用該模板的每一支技能一起變（⚠️ 存之前頁面會列出動到哪幾支）。
 */
export const write = {
  kind: "source",
  rules: [
    tplDefaultRule(["content/ability-templates/tpl-locust-*.json", "content/ability-templates/tpl-beam-roll.json"]),
    tplOriginRule(["content/ability-templates/tpl-locust-*.json", "content/ability-templates/tpl-beam-roll.json"]),
  ],
};

/** deps 誠實列到檔案層級：目錄 mtime 在 macOS 上不因「改既有檔內容」而動。 */
export function deps(repoRoot) {
  const out = ["tools/locust-census/census.json"];
  for (const dir of ["content/abilities", "content/ability-templates", "content/items", "content/models"]) {
    const abs = join(repoRoot, dir);
    if (!existsSync(abs)) { out.push(dir); continue; }
    for (const f of readdirSync(abs)) if (f.endsWith(".json")) out.push(`${dir}/${f}`);
  }
  return out;
}

function readJson(p) { return JSON.parse(readFileSync(p, "utf8")); }

/** 走訪一份文件裡所有 spawnModelFx 節點。 */
function* walkSpawnModelFx(node) {
  if (Array.isArray(node)) { for (const v of node) yield* walkSpawnModelFx(v); return; }
  if (node && typeof node === "object") {
    if (node.kind === "spawnModelFx") yield node;
    for (const v of Object.values(node)) yield* walkSpawnModelFx(v);
  }
}

function modelBase(mdlPath) {
  if (!mdlPath) return null;
  const parts = mdlPath.split("\\");
  const base = parts[parts.length - 1].replace(/\.mdl$/i, "").toLowerCase();
  return base === "" ? null : base;
}

export async function build(repoRoot) {
  const census = readJson(join(repoRoot, "tools/locust-census/census.json"));

  // ── GGD 側 ①：模板家族預設（preset → 預設 modelKey ＋ 幾格演出參數） ──
  const templates = new Map(); // tplId -> { modelKey, path, count, lifeSec, scale }
  const tplDir = join(repoRoot, "content/ability-templates");
  for (const f of readdirSync(tplDir)) {
    if (!f.startsWith("tpl-") || !f.endsWith(".json")) continue;
    const doc = readJson(join(tplDir, f));
    const params = Array.isArray(doc.params) ? doc.params : [];
    const def = (key) => params.find((p) => p.key === key)?.default ?? null;
    templates.set(doc.id, {
      id: doc.id,
      modelKey: def("modelKey"),
      path: def("path"),
      count: def("count"),
      lifeSec: def("lifeSec"),
      scale: def("scale"),
      tint: def("tint"),
      alpha: def("alpha"),
    });
  }

  // ── GGD 側 ②：出貨 spawnModelFx 節點（abilities ＋ items；champions 是鏡射不重掃） ──
  const landings = new Map(); // modelKey -> [{docId, docName, docKind, preset, explicit, scale, scaleAxis, tint, alpha, lifeSec, count, path}]
  let spawnNodes = 0;
  for (const [dir, docKind] of [["content/abilities", "ability"], ["content/items", "item"]]) {
    const abs = join(repoRoot, dir);
    for (const f of readdirSync(abs)) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      const doc = readJson(join(abs, f));
      for (const n of walkSpawnModelFx(doc)) {
        spawnNodes++;
        const tpl = n.preset ? templates.get(n.preset) : null;
        const key = n.modelKey ?? tpl?.modelKey ?? null;
        if (!key) continue;
        if (!landings.has(key)) landings.set(key, []);
        landings.get(key).push({
          docId: doc.id ?? f.replace(/\.json$/, ""),
          docName: doc.name ?? "",
          docKind,
          preset: n.preset ?? null,
          explicit: n.modelKey != null,
          scale: n.scale ?? tpl?.scale ?? null,
          scaleAxis: n.scaleAxis ?? null,
          tint: n.tint ?? tpl?.tint ?? null,
          alpha: n.alpha ?? tpl?.alpha ?? null,
          lifeSec: n.lifeSec ?? tpl?.lifeSec ?? null,
          count: n.count ?? tpl?.count ?? null,
          path: n.path ?? tpl?.path ?? null,
        });
      }
    }
  }

  // ── GGD 側 ③：content/models 的模型文件集合 ──
  const modelDocs = new Set(
    readdirSync(join(repoRoot, "content/models"))
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => f.replace(/\.json$/, "")),
  );

  // ── join：census 236 隻逐一對 ──
  const jassByRaw = new Map(census.jass.map((j) => [j.rawcode, j]));
  const tplSugByRaw = new Map(census.templateSuggestions.map((t) => [t.rawcode, t]));
  const rows = [];
  const summary = { total: 0, proxy: 0, landed: 0, modelOnly: 0, missing: 0 };
  for (const u of census.units) {
    summary.total++;
    const base = modelBase(u.model);
    const isBare = u.model != null && !u.model.includes("\\");
    const candidates = base == null ? [] : isBare
      ? [`imported.${base}`, `w3x.stock.${base}`]
      : [`w3x.stock.${base}`, `imported.${base}`];
    const modelKey = candidates.find((k) => modelDocs.has(k)) ?? null;
    const hits = candidates.flatMap((k) => landings.get(k) ?? []);
    const j = jassByRaw.get(u.id);
    const sug = tplSugByRaw.get(u.id);
    let status;
    if (u.modelKind !== "model") status = "proxy";
    else if (hits.length > 0) status = "landed";
    else if (modelKey != null) status = "model-only";
    else status = "missing";
    summary[status === "proxy" ? "proxy" : status === "landed" ? "landed" : status === "model-only" ? "modelOnly" : "missing"]++;
    rows.push({
      id: u.id,
      name: u.name || "",
      model: base,
      modelKind: u.modelKind,
      scale: u.scale,                    // ＝ w3u usca
      tint: u.tint,                      // rgb255 解析後（null = 未染色）
      alphaPct: u.runtimeAlphaPct,       // SetUnitVertexColorBJ 回溯的不透明度%
      timedLife: j?.timedLifeSecs ?? [], // war3map.j 的 UnitApplyTimedLife 秒數
      sites: j?.sites ?? 0,
      triggers: j?.triggers?.length ?? 0,
      tplShape: sug?.shape ?? null,
      tplSuggested: sug?.template ?? null,
      gray: u.gray?.length ? u.gray : [],
      modelKey,
      status,
      landings: hits,
    });
  }
  // 排序：紅的最上面（missing → model-only → landed → proxy），同級按 id
  const rank = { missing: 0, "model-only": 1, landed: 2, proxy: 3 };
  rows.sort((a, b) => rank[a.status] - rank[b.status] || a.id.localeCompare(b.id));

  const locustTemplates = [...templates.values()].filter(
    (t) => t.id.startsWith("tpl-locust-") || t.id === "tpl-beam-roll",
  );

  return {
    source: {
      census: "tools/locust-census/census.json（pnpm locust:build，⛔ 產物不要手改）",
      ggd: "content/abilities + content/items 的 spawnModelFx（champions 為鏡射不重掃）＋ content/ability-templates 預設 ＋ content/models",
      censusCounts: census.meta?.counts ?? {},
    },
    summary: { ...summary, spawnNodes, modelDocs: modelDocs.size, landingKeys: landings.size },
    locustTemplates,
    rows,
  };
}
