/**
 * 🔴 LIVE dataset：技能特效模板 × 模型 × 粒子視覺設定 對照（GET /__live/vfx-templates）。
 *
 * 三張真的表 join 起來（⛔ 一格都不自己重算公式，第〇·四守則）：
 *   ① content/ability-templates/*.json —— 帶 `params.modelKey` 的 modelFx 家族
 *      （params[*].default 就是家族預設，載入時由 modelFxPreset.ts 補進節點）。
 *   ② content/models/*.json —— model@1：glbPath / scale / clipMap / fxLongAxis /
 *      fxSpawnHeight / fxTint。
 *   ③ content/config/vfx-families.json —— 粒子家族旋鈕（primitive/element/scale/
 *      alpha/timeScale/heightY/sounds）。⚠️ 它與模板的 `family` 是**兩個命名空間**，
 *      沒有 join key（vfxKey→家族的解析住 apps/client 的 resolveFamilyArt，這裡不重算）
 *      ⇒ 粒子表獨立呈現，⛔ 不假裝 join 得起來。
 *
 * ⭐「現值」的規則**逐字鏡照出貨解析器**：欄位清單是**當場從
 * packages/shared/src/content/modelFxPreset.ts 的 PRESET_FIELDS / TOUCH_FIELDS /
 * SOUND_FIELDS 剖出來的**（⛔ 不抄一份會過期的副本）——
 * effective = 節點覆寫 ?? 模板 params[k].default；touch 兩格只在節點有 onTouch 時補；
 * 聲音兩格無條件補。剖不出來就 throw（fail-loud：頁面會畫出錯誤）。
 *
 * ⛔ 唯讀。⛔ 不 import apps/** / packages/**（node 環境；modelFxPreset.ts 是**讀文字**）。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * GH#821 豁免（能被反駁）：三張表裡 ①ability-templates 與 ③vfx-families 是產生器產物
 * （genguard AUTHOR —— 寫了下一次 sync 打回來）；②model@1 有手編子集，但 scale/clipMap/
 * fxTint 是**要對 glb 驗的視覺值** —— 單格寫入會做出「改了但沒有終端證據」的宣稱
 * （👁 用詞紀律：鏈路接上 ≠ 玩家看得到），那一族的修改走 audition＋visual-proof 流程。
 * 反駁法：指出一格既是手編的家、又不需要視覺驗收的欄位。
 */
export const readonlyWhy =
  "①③是產生器產物；②model@1 的視覺欄要 audition 終端證據 —— 單格盲寫違反 👁 用詞紀律。";

export const deps = [
  "content/ability-templates",
  "content/ability-templates/_index.json",
  "content/models",
  "content/models/_index.json",
  "content/abilities",
  "content/abilities/_index.json",
  "content/config/vfx-families.json",
  "packages/shared/src/content/modelFxPreset.ts",
];

/** 剖出貨解析器的欄位表（只認 `"xxx",` 這種**純字串行**，⛔ 註解裡的引號不算）。 */
function parseFieldList(src, constName) {
  const m = src.match(new RegExp(`const ${constName} = \\[([\\s\\S]*?)\\] as const`));
  if (!m) throw new Error(`modelFxPreset.ts 剖不出 ${constName} —— 出貨解析器改形狀了，dataset 要跟著改`);
  const fields = [];
  for (const line of m[1].split("\n")) {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) continue; // 註解裡的引號不算
    for (const f of t.matchAll(/"([A-Za-z]+)"/g)) fields.push(f[1]);
  }
  if (fields.length === 0) throw new Error(`${constName} 剖出 0 個欄位 —— 剖法過期了`);
  return fields;
}

function readJsonDir(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    try {
      out.push(JSON.parse(readFileSync(join(dir, f), "utf8")));
    } catch (err) {
      out.push({ id: f, _parseError: String(err) });
    }
  }
  return out;
}

/** 模型文件 → 頁面要的那幾格（⛔ 不把 attachPoints 整包回去）。 */
function modelSummary(doc) {
  if (!doc) return null;
  return {
    id: doc.id,
    glbPath: doc.glbPath ?? null,
    scale: doc.scale ?? null,
    collisionRadius: doc.collisionRadius ?? null,
    clipMap: doc.clipMap ?? null,
    fxLongAxis: doc.fxLongAxis ?? null,
    fxSpawnHeight: doc.fxSpawnHeight ?? null,
    fxTint: doc.fxTint ?? null,
  };
}

/** 深走訪一份文件，撈出每一個 spawnModelFx 節點（含巢狀在 onArrive 等裡的）。 */
function collectModelFxNodes(obj, acc) {
  if (Array.isArray(obj)) {
    for (const v of obj) collectModelFxNodes(v, acc);
    return;
  }
  if (obj === null || typeof obj !== "object") return;
  if (obj.kind === "spawnModelFx") acc.push(obj);
  for (const v of Object.values(obj)) collectModelFxNodes(v, acc);
}

export async function build(repoRoot) {
  const presetSrc = readFileSync(
    join(repoRoot, "packages/shared/src/content/modelFxPreset.ts"),
    "utf8",
  );
  const PRESET_FIELDS = parseFieldList(presetSrc, "PRESET_FIELDS");
  const TOUCH_FIELDS = parseFieldList(presetSrc, "TOUCH_FIELDS");
  const SOUND_FIELDS = parseFieldList(presetSrc, "SOUND_FIELDS");

  // ① 模板：只留有 params.modelKey 的 modelFx 家族。
  const allTemplates = readJsonDir(join(repoRoot, "content/ability-templates"));
  const modelFxTemplates = allTemplates.filter((t) => t.params && t.params.modelKey);
  const templateById = new Map(modelFxTemplates.map((t) => [t.id, t]));

  // ② 模型：全部載進 map，輸出只留被引用到的。
  const modelDocs = readJsonDir(join(repoRoot, "content/models"));
  const modelById = new Map(modelDocs.filter((m) => m.id).map((m) => [m.id, m]));

  // ③ 粒子家族設定（出貨 config，值照抄 ⛔ 不重算）。
  const vfxFam = JSON.parse(
    readFileSync(join(repoRoot, "content/config/vfx-families.json"), "utf8"),
  );
  const knobs = {};
  for (const [k, v] of Object.entries(vfxFam)) {
    if (typeof v !== "object" || v === null) knobs[k] = v;
  }
  const particleFamilies = Object.entries(vfxFam.families ?? {}).map(([key, f]) => ({
    key,
    ...f,
  }));

  // 出貨技能樹裡的每一個 spawnModelFx 節點。
  const abilityDocs = readJsonDir(join(repoRoot, "content/abilities"));
  const membersByTpl = new Map(modelFxTemplates.map((t) => [t.id, []]));
  const noPreset = [];
  const referencedModelIds = new Set();
  let presetNodeCount = 0;

  const DISPLAY_FIELDS = [...PRESET_FIELDS, ...SOUND_FIELDS, ...TOUCH_FIELDS];

  for (const doc of abilityDocs) {
    if (doc._parseError) continue;
    const nodes = [];
    collectModelFxNodes(doc.effects ?? [], nodes);
    nodes.forEach((node, idx) => {
      const overrides = {};
      for (const k of DISPLAY_FIELDS) if (node[k] !== undefined) overrides[k] = node[k];
      const hasOnTouch = Array.isArray(node.onTouch) && node.onTouch.length > 0;
      const hasOnArrive = Array.isArray(node.onArrive) && node.onArrive.length > 0;
      const tpl = node.preset ? templateById.get(node.preset) : undefined;

      // ⭐ 鏡照 modelFxPreset.ts：effective = 節點 ?? 模板預設。
      const effective = {};
      for (const k of PRESET_FIELDS) {
        const v = node[k] !== undefined ? node[k] : tpl ? tpl.params[k]?.default : undefined;
        if (v !== undefined) effective[k] = v;
      }
      for (const k of SOUND_FIELDS) {
        const v = node[k] !== undefined ? node[k] : tpl ? tpl.params[k]?.default : undefined;
        if (v !== undefined) effective[k] = v;
      }
      if (hasOnTouch) {
        for (const k of TOUCH_FIELDS) {
          const v = node[k] !== undefined ? node[k] : tpl ? tpl.params[k]?.default : undefined;
          if (v !== undefined) effective[k] = v;
        }
      }

      const modelId = effective.modelKey ?? null;
      if (modelId) referencedModelIds.add(modelId);
      const model = modelId ? modelById.get(modelId) : undefined;
      const clip = effective.clip;
      const member = {
        abilityId: doc.id,
        abilityName: doc.name ?? doc.id,
        slot: doc.slot ?? null,
        nodeIndex: idx,
        overrides,
        effective,
        hasOnTouch,
        hasOnArrive,
        model: modelId
          ? {
              id: modelId,
              found: Boolean(model),
              glbPath: model?.glbPath ?? null,
              modelScale: model?.scale ?? null,
              fxLongAxis: model?.fxLongAxis ?? null,
              fxTint: model?.fxTint ?? null,
              clipResolved: clip && model?.clipMap ? (model.clipMap[clip] ?? null) : null,
            }
          : null,
      };
      if (tpl) {
        presetNodeCount += 1;
        membersByTpl.get(tpl.id).push(member);
      } else {
        noPreset.push({ ...member, preset: node.preset ?? null });
      }
    });
  }

  // 模板列（預設值 + 預設模型 join + 成員）。
  const templates = modelFxTemplates
    .map((t) => {
      const defaults = {};
      const inert = [];
      for (const [k, slot] of Object.entries(t.params)) {
        if (slot && slot.default !== undefined) defaults[k] = slot.default;
        if (slot && slot.inert) inert.push(k);
      }
      const defModelId = defaults.modelKey ?? null;
      if (defModelId) referencedModelIds.add(defModelId);
      return {
        id: t.id,
        name: t.name ?? t.id,
        family: t.family ?? null,
        status: t.status ?? null,
        exemplar: t.exemplar ?? null,
        defaults,
        inert,
        paramCount: Object.keys(t.params).length,
        model: modelSummary(defModelId ? modelById.get(defModelId) : null),
        members: membersByTpl.get(t.id),
      };
    })
    .sort((a, b) => b.members.length - a.members.length || a.id.localeCompare(b.id));

  const models = [...referencedModelIds]
    .sort()
    .map((id) => ({ ...modelSummary(modelById.get(id) ?? { id }), found: modelById.has(id) }));

  return {
    stats: {
      modelFxTemplates: modelFxTemplates.length,
      templatesTotal: allTemplates.length,
      presetNodes: presetNodeCount,
      noPresetNodes: noPreset.length,
      referencedModels: referencedModelIds.size,
      modelDocsTotal: modelDocs.length,
      particleFamilies: particleFamilies.length,
      abilityDocs: abilityDocs.length,
    },
    fieldSources: {
      presetFields: PRESET_FIELDS,
      touchFields: TOUCH_FIELDS,
      soundFields: SOUND_FIELDS,
      note: "欄位清單當場剖自 packages/shared/src/content/modelFxPreset.ts（⛔ 不是抄的副本）",
    },
    templates,
    noPreset,
    models,
    particles: { knobs, families: particleFamilies },
    honest: [
      "模板 family 名與 vfx-families.json 的粒子家族是兩個命名空間，沒有 join key —— 粒子表獨立呈現（vfxKey→家族的解析住 apps/client/src/render/vfx/w3xAbilityArt.ts 的 resolveFamilyArt，這裡不重算）。",
      "model@1 沒有 fxAlpha 欄位（2026-08-26 對全部 model docs 的欄位 union 量過）；透明度住節點級 alpha 與粒子家族的 alpha。fxTint 只有 2 份 model doc 有。",
      "只掃 content/abilities/ 的標準本；content/champions/ 的鏡射副本不重複掃（鏡射同步守衛保證同值）。",
      "deps 是目錄 mtime：手改單一檔而不跑 content:build 時目錄 mtime 可能不動 —— 但 content:build 會改 _index.json（也在 deps），所以正常流程一定重算。",
    ],
  };
}
