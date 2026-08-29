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
 * 💾 GH#826：①的 `params.<名>.default` **可存** —— 數字格（scale/alpha/lifeSec…）走共用的
 * tplDefaultRule，**綁定格**（modelKey／soundKey／arriveSoundKey）走這裡的 tplBindingRule；
 * ②③仍唯讀（理由見 write 檔頭）。
 * ⛔ 不 import apps/** / packages/**（node 環境；modelFxPreset.ts 是**讀文字**）。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { numericParamRows, tplDefaultRule, tplOriginRule } from "./_tplWrite.mjs";

/**
 * 🔗 綁定格（docRef）—— owner 2026-08-20 逐字點名的那一族：
 * > 「⋯包含**球體綁定位置**、特效 pitch/scale/color/透明度等調整、**特效音效綁定**⋯」
 *
 * ⭐ 三格都是「換一個 id」，⛔ 不是數字 —— 所以它們走自己的規則（tplDefaultRule 只吃 number）。
 * 上下界：出貨 schema（effects/spawnModelFx.ts）三格都是 `z.string().min(1)`，**沒有上界**，
 * 而且 modelKey/soundKey ⛔ 不是 zRef ⇒ 打錯字**內容驗證不會擋**（存得下去、遊戲裡什麼都不生／
 * 不出聲＝失敗形態①②）。⇒ check() 補上出貨 schema 沒有的那一半：**存在性**。
 * maxLen 64 取 schema 裡同族 `clip` 的上界（量到的最長 model id／sfx key 都是 34）。
 */
const BINDING_PARAMS = {
  modelKey: { label: "模型", ref: "content/models 的 model@1 id" },
  soundKey: { label: "施放音", ref: "audio-map 的 sfx key" },
  arriveSoundKey: { label: "落點音", ref: "audio-map 的 sfx key" },
};

/** content/models 的 id 全集 —— 與頁面「⚠️ 模型不存在」同一個來源（⛔ 不查 _index 產物）。 */
function modelIdSet(repoRoot) {
  const out = new Set();
  for (const f of readdirSync(join(repoRoot, "content/models"))) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    try {
      const id = JSON.parse(readFileSync(join(repoRoot, "content/models", f), "utf8")).id;
      if (typeof id === "string" && id !== "") out.add(id);
    } catch {
      /* 壞掉的文件頁面自己會顯示；這裡只回答「這個 id 在不在」 */
    }
  }
  return out;
}

/** 綁定預設：/params/{modelKey,soundKey,arriveSoundKey}/default。 */
function tplBindingRule(paths) {
  return {
    paths,
    pointers: Object.keys(BINDING_PARAMS).map((k) => `/params/${k}/default`),
    value: { type: "string", maxLen: 64 },
    why: "模板家族的綁定預設：模型／施放音／落點音（改一格，引用這張模板的每一個節點一起換）",
    check(repoRoot, { path, pointer, value }) {
      const key = pointer.split("/").filter((s) => s !== "")[1];
      const doc = JSON.parse(readFileSync(join(repoRoot, path), "utf8"));
      const slot = doc.params && typeof doc.params === "object" ? doc.params[key] : undefined;
      if (!slot) return `這份模板沒有參數 ${key}`;
      if (slot.type !== "docRef") return `params.${key} 是 ${String(slot.type)} —— 這條路只開放 docRef 綁定格`;
      if (typeof slot.default !== "string")
        return `params.${key} 目前沒有家族預設（刻意留白＝逐支填 —— 例：tpl-beam-roll.arriveSoundKey 的 origin 逐字寫著「6/13 個節點沒有 onArrive」）。要新增預設請在 JSON 連 origin 一起補，否則 templateDefaultsHaveOrigin 閘會紅在「沒有出處的預設」`;
      const v = value.trim();
      if (v === "")
        return "綁定不可以是空的 —— 「刻意留白」是一個要連 origin 一起寫的決定，⛔ 不從這一格做";
      if (key === "modelKey") {
        if (!modelIdSet(repoRoot).has(v))
          return `「${v}」不是任何 content/models 文件的 id —— 出貨 schema 只驗 string(min 1)，所以它存得下去而遊戲裡**一具都不生**（失敗形態①）`;
        return "";
      }
      const am = JSON.parse(readFileSync(join(repoRoot, "content/config/audio-map.json"), "utf8"));
      const sfx = am.sfx ?? {};
      if (!Object.prototype.hasOwnProperty.call(sfx, v))
        return `「${v}」不在 audio-map 的 sfx 表（${Object.keys(sfx).length} 個 key）—— 沒有檔案可播，存了就是卡面上的一句謊話（第一·五守則）`;
      return "";
    },
  };
}

/** 綁定格 → 頁面要的逐格陣列（形狀刻意與 _tplWrite 的 numericParamRows 同構）。 */
function bindingParamRows(paramsObj) {
  if (!paramsObj || typeof paramsObj !== "object" || Array.isArray(paramsObj)) return [];
  return Object.entries(BINDING_PARAMS)
    .filter(([key]) => paramsObj[key] && paramsObj[key].type === "docRef")
    .map(([key, meta]) => {
      const s = paramsObj[key];
      return {
        key,
        label: meta.label,
        ref: meta.ref,
        default: typeof s.default === "string" ? s.default : null,
        origin: s.origin ?? null,
        optional: s.optional === true,
        // 沒預設的格＝刻意留白（逐支填）：⛔ 頁上不開編輯（新增 default 而沒有 origin
        // 會讓 templateDefaultsHaveOrigin ① 當場紅 —— 與數字格同一條邊界）。
        editable: typeof s.default === "string",
      };
    });
}

/**
 * ⭐ GH#826 寫入宣告 —— 舊豁免的①「ability-templates 是產生器產物（genguard AUTHOR）」
 * **是錯的**（第三守則：genguard ✓、sync-io 只認領 _index.json、tools/ 零寫入端）——
 * 模板的 `params.<名>.default`（scale / alpha / lifeSec / count 那一族）是手編的家，可存。
 * 仍唯讀的兩側（理由不變、能被反駁）：
 *   ② model@1 的 scale/clipMap/fxTint 是**要對 glb 驗的視覺值** —— 單格盲寫違反
 *     👁 用詞紀律（鏈路接上 ≠ 玩家看得到），走 audition＋visual-proof 流程；
 *   ③ vfx-families.json 是 vfxfam:build 的產物 —— 改**來源**再 genrun，⛔ 不開直寫。
 */
export const write = {
  kind: "source",
  rules: [
    // ⚠️ 綁定格排**第一**是承重的：tplDefaultRule 的 pointer 是萬用的
    // `/params/*/default`，而 middleware 取 rules.find() 的**第一個**命中 ——
    // 排在它後面就永遠輪不到，而且使用者會拿到指著錯方向的訊息（「只開放 number 預設」）。
    tplBindingRule(["content/ability-templates/tpl-*.json"]),
    tplDefaultRule(["content/ability-templates/tpl-*.json"]),
    tplOriginRule(["content/ability-templates/tpl-*.json"]),
  ],
};

export const deps = [
  "content/ability-templates",
  "content/ability-templates/_index.json",
  "content/models",
  "content/models/_index.json",
  "content/abilities",
  "content/abilities/_index.json",
  "content/config/vfx-families.json",
  "content/config/audio-map.json",
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
      const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
      doc._file = f; // 寫入端的 path 要用真的檔名（⛔ 不從 id 拼）
      out.push(doc);
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
  // 聲音那兩格的**總開關**（audio-map 的 modelFxSound）—— 關著的時候 soundKey/
  // arriveSoundKey 存得下去而一聲都不會播 ⇒ 頁面要說出來（⛔ 不是靜靜地存）。
  const audioMap = JSON.parse(
    readFileSync(join(repoRoot, "content/config/audio-map.json"), "utf8"),
  );
  const audio = {
    modelFxSoundEnabled: (audioMap.modelFxSound ?? {}).enabled !== false,
    arriveEnabled: (audioMap.modelFxSound ?? {}).arrive !== false,
    sfxKeys: Object.keys(audioMap.sfx ?? {}).length,
  };
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
        file: `content/ability-templates/${t._file}`, // 寫入端的 path 用它
        name: t.name ?? t.id,
        family: t.family ?? null,
        status: t.status ?? null,
        exemplar: t.exemplar ?? null,
        defaults,
        inert,
        paramCount: Object.keys(t.params).length,
        numericParams: numericParamRows(t.params), // 可存的格（number 且已有預設）
        bindingParams: bindingParamRows(t.params), // 可存的綁定格（docRef 且已有預設）
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
    audio,
    particles: { knobs, families: particleFamilies },
    honest: [
      "模板 family 名與 vfx-families.json 的粒子家族是兩個命名空間，沒有 join key —— 粒子表獨立呈現（vfxKey→家族的解析住 apps/client/src/render/vfx/w3xAbilityArt.ts 的 resolveFamilyArt，這裡不重算）。",
      "model@1 沒有 fxAlpha 欄位（2026-08-26 對全部 model docs 的欄位 union 量過）；透明度住節點級 alpha 與粒子家族的 alpha。fxTint 只有 2 份 model doc 有。",
      "只掃 content/abilities/ 的標準本；content/champions/ 的鏡射副本不重複掃（鏡射同步守衛保證同值）。",
      "綁定格（modelKey／soundKey／arriveSoundKey）只改**已經有家族預設**的那幾格；標「留白」的是刻意沒有家族預設（逐支填），要新增預設請在 JSON 連 origin 一起補 —— 否則 templateDefaultsHaveOrigin 閘會紅在「沒有出處的預設」。",
      "出貨 schema 對這三格只有 z.string().min(1)（⛔ 不是 zRef）—— 打錯字內容驗證不會擋，所以存檔前另外驗存在性：modelKey 對 content/models 的 id、兩個音效鍵對 audio-map 的 sfx 表。",
      "deps 是目錄 mtime：手改單一檔而不跑 content:build 時目錄 mtime 可能不動 —— 但 content:build 會改 _index.json（也在 deps），所以正常流程一定重算。",
    ],
  };
}
