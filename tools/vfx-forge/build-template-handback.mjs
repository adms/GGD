#!/usr/bin/env node

/**
 * Build the Editor -> Main VFX template handback.
 *
 * The output is advisory. It inventories compositions that already exist in
 * VFX Forge and isolates low-level runtime gaps; it never promotes a recipe to
 * Main or turns a skill-specific timeline into a primitive by itself.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  VFX_FORGE_RECIPES,
  buildVfxForgeRecipe,
} from "../../apps/editor/src/vfx-forge/recipes.ts";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const jsonPath = resolve(root, "docs/editor-contract/editor-vfx-template-handback.json");
const markdownPath = resolve(root, "docs/editor-contract/EDITOR_VFX_TEMPLATE_HANDBACK.md");
const proofManifestPath = resolve(root, "docs/_reports/editor-skill-basic-visual-proof/manifest.json");
const mainTypeCatalogPath = resolve(root, "docs/editor-contract/ggd-type-catalog.json");
const check = process.argv.includes("--check");

const passiveRecipes = new Set(["avalon-counter-chain"]);
const usage = {
  "classic-beam-fire": ["godie-ogrh.r", "godie-o00x.r"],
  "classic-beam-blue": ["godie-nbbc.e"],
  "line-blast-fire": ["godie-hjai.e", "godie-h020.e"],
  "dash-slash-void": ["godie-hjai.r"],
  "shockwave-dash-light": ["godie-nbbc.r"],
  "combo-slash-holy": ["godie-hart.r"],
  "reflect-counter-open": ["godie-e002.ex", "godie-e00l.ex"],
  "avalon-counter-chain": ["godie-e002.ex", "godie-e00l.ex"],
  "rider-dash-beam-blue": ["godie-hvsh.r"],
  "avalon-guard-window": ["godie-e00l.r"],
  "chain-lightning-storm": ["godie-udea.r"],
  "bankai-transform": ["godie-h01n.r"],
  "perfect-parry": ["godie-h00l.r"],
};

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function uniq(values) {
  return [...new Set(values)].sort();
}

function semanticPart(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const mainTypeCatalog = JSON.parse(readFileSync(mainTypeCatalogPath, "utf8"));
if (mainTypeCatalog.schema !== "ggd-type-catalog@1" || !Array.isArray(mainTypeCatalog.types)) {
  throw new Error("Main ggd-type-catalog@1 is missing or malformed");
}
const modelsWithOwnedEmitters = new Set(
  (mainTypeCatalog.modelFxEmitters?.modelsWithEmitters ?? []).map((row) => row.modelKey),
);
const affectedEmitterAbilities = uniq(
  (mainTypeCatalog.modelFxEmitters?.affectedNodes ?? [])
    .filter((row) => Array.isArray(row.fieldsLost) && row.fieldsLost.length > 0)
    .map((row) => row.ability),
);

const candidates = VFX_FORGE_RECIPES.map((recipe) => {
  const segments = buildVfxForgeRecipe(recipe.id, {
    activationMode: passiveRecipes.has(recipe.id) ? "passive" : "active",
  });
  const recipeModelKeys = uniq(segments.flatMap((segment) => segment.kind === "modelFx" ? [segment.modelKey] : []));
  const blockingBrickRequest = recipeModelKeys.some((modelKey) => modelsWithOwnedEmitters.has(modelKey))
    ? ["model-fx-owned-emitter-instance-inheritance"]
    : [];
  return {
    id: recipe.id,
    label: recipe.label,
    description: recipe.description,
    owner: "editor-template",
    suggestedFamily: recipe.familyId,
    suggestedFamilyLabel: recipe.familyLabel,
    semanticVariantId: recipe.variantId,
    suggestedVariantKey: `${recipe.familyId}/${recipe.variantId}`,
    variantDistinction: recipe.variantLabel,
    mainDisposition: blockingBrickRequest.length > 0
      ? "review-blocking-brick-extension"
      : "reference-only-keep-as-editor-composition",
    acceptanceAbilityIds: usage[recipe.id] ?? [],
    segmentKinds: uniq(segments.map((segment) => segment.kind)),
    triggers: uniq(segments.map((segment) => `${segment.on}${segment.strikeIndex === undefined ? "" : `:${segment.strikeIndex}`}`)),
    modelKeys: recipeModelKeys,
    vfxIds: uniq(segments.flatMap((segment) => segment.kind === "vfx" ? [segment.vfxId] : [])),
    blockingBrickRequests: blockingBrickRequest,
  };
});

const variantKeys = candidates.map((candidate) => candidate.suggestedVariantKey);
if (new Set(variantKeys).size !== variantKeys.length) {
  throw new Error("family/type suggestions must be unique");
}
const familyMembers = new Map();
for (const candidate of candidates) {
  const members = familyMembers.get(candidate.suggestedFamily) ?? [];
  members.push(candidate);
  familyMembers.set(candidate.suggestedFamily, members);
}
const familyVariantSuggestions = [...familyMembers.entries()].map(([familyId, members]) => ({
  familyId,
  label: members[0].suggestedFamilyLabel,
  naming: `${familyId}/<semantic-variant-id>`,
  variants: members.map((candidate) => ({
    variantId: candidate.semanticVariantId,
    key: candidate.suggestedVariantKey,
    recipeId: candidate.id,
    distinction: candidate.variantDistinction,
  })),
})).sort((left, right) => left.familyId.localeCompare(right.familyId));

// Preserve the mechanic-aware work from the complete 42-theme/46-document
// run. These are live automatic recommendation types, not hand-authored skill
// timelines. Grouping by the authoritative effect kind lets a designer start
// from a proven recommendation while the matrix remains available afterward.
const proofManifest = JSON.parse(readFileSync(proofManifestPath, "utf8"));
if (proofManifest.themes !== 42 || proofManifest.documents !== 46 || !Array.isArray(proofManifest.cases)) {
  throw new Error("visual proof manifest must contain the exact 42-theme/46-document scope");
}
const mechanicVariantMap = new Map();
for (const row of proofManifest.cases) {
  for (const addition of row.mechanicVisualAdditions ?? []) {
    const key = `${addition.afterKind}\u0000${addition.at}\u0000${addition.vfxId}`;
    const current = mechanicVariantMap.get(key) ?? {
      afterKind: addition.afterKind,
      at: addition.at,
      vfxId: addition.vfxId,
      abilityIds: [],
      occurrences: 0,
    };
    current.occurrences++;
    if (!current.abilityIds.includes(row.id)) current.abilityIds.push(row.id);
    mechanicVariantMap.set(key, current);
  }
}
const mechanicMembers = new Map();
for (const variant of [...mechanicVariantMap.values()].sort((left, right) =>
  `${left.afterKind}/${left.at}/${left.vfxId}`.localeCompare(`${right.afterKind}/${right.at}/${right.vfxId}`))) {
  const members = mechanicMembers.get(variant.afterKind) ?? [];
  members.push(variant);
  mechanicMembers.set(variant.afterKind, members);
}
const mechanicRecommendationTypes = [...mechanicMembers.entries()].map(([afterKind, members]) => ({
  familyId: `mechanic-${afterKind}`,
  triggerMechanic: afterKind,
  availability: "live-auto-recommendation",
  visualEvidence: "captured-owner-review-pending",
  variants: members.map((variant) => ({
    variantId: `${semanticPart(variant.at)}-${semanticPart(variant.vfxId)}`,
    key: `mechanic-${afterKind}/${semanticPart(variant.at)}-${semanticPart(variant.vfxId)}`,
    at: variant.at,
    vfxId: variant.vfxId,
    occurrences: variant.occurrences,
    exampleAbilityIds: variant.abilityIds.sort(),
  })),
}));
const mechanicRecommendationTypeCount = mechanicRecommendationTypes
  .reduce((total, family) => total + family.variants.length, 0);

const payloadWithoutFingerprint = {
  schema: "ggd-editor-vfx-template-handback@2",
  authority: "advisory-only",
  ownership: {
    main: "可重用 primitive、runtime 行為、限制 resolver 與機器契約",
    editor: "模板組合、推薦排序、角色動作、時間軸、配色、鏡頭與視覺驗收",
    promotion: "Main/Owner 審查後才可收編；此檔本身不會修改或發布遊戲內容",
  },
  remediationPolicy: {
    editorMustFix: ["明顯顏色錯誤", "方向相反", "形狀類型錯誤", "大小尺度明顯失真", "物理意義不成立"],
    humanFineTuning: ["亮度微調", "飽和度微調", "尾焰密度", "數幀節奏", "鏡頭手感", "美術偏好"],
  },
  adoptionRule: "只有多個 Editor 模板重複需要同一個低階能力，且現有 Main primitive/contract 無法表達時，才建議 Main 收編或擴充積木；技能時間軸與配色仍留在 Editor。",
  familyVariantPolicy: "同族可以有多個可選方案，但落地使用語意化 recipe/variant id；純配色、寬度等差異由 params 預設表達，不把 type1/type2 寫進內容或 Main template id。",
  designerWorkflow: "設計師先選家族，再選名稱能說明差異的完整預設；套用後展開為標準積木與時間軸，矩陣／slider 只做最後微調，不要求設計師從零調出每個視覺。",
  preservationReceipt: {
    selectablePresetTypes: candidates.length,
    automaticMechanicTypes: mechanicRecommendationTypeCount,
    preservedTypeOutcomes: candidates.length + mechanicRecommendationTypeCount,
    rule: "既有調整先收斂成具名 Editor 配方與參數預設；矩陣只修改已選配方的參數，不作為從零設計入口。",
  },
  mainTypeCatalogReceipt: {
    path: "docs/editor-contract/ggd-type-catalog.json",
    schema: mainTypeCatalog.schema,
    counts: mainTypeCatalog.counts,
    selectionRule: "只選 expands=true，依 wiring 決定 doc/node，逐格依 fillsVia，inertParams 永遠不可調。",
  },
  familyVariantSuggestions,
  mechanicRecommendationSource: {
    path: "docs/_reports/editor-skill-basic-visual-proof/manifest.json",
    themes: proofManifest.themes,
    documents: proofManifest.documents,
    sourceGeneratedAt: proofManifest.sourceGeneratedAt,
    rule: "只讀結構化 runtime effect；Owner 對白不參與機制或家族推論",
  },
  mechanicRecommendationTypes,
  mainBrickRequests: [
    {
      id: "model-fx-owned-emitter-instance-inheritance",
      severity: "blocking",
      affectedAbilityIds: affectedEmitterAbilities,
      observed: "modelFx 模型本體會套用該次 instance 的 scale/scaleAxis/yaw/tint/alpha，但 model@1.fxEmitters 目前只以 vfxId + 世界座標出生；因此固定黃色、大尺寸的 emitter 不會跟著藍白/黃藍配方改色縮放。",
      requiredOutcome: "模型自帶 emitter 必須能取得等效的該次 instance 變換與顏色/透明度，或提供語意等價且機器契約可驗證的 per-instance override/disable；具體 API 由 Main 與 Owner 決定。",
      editorBoundary: "Editor 不修改 Main renderer、不直接使用 MDL/JASS、不另造每招專用粒子，也不以第二套疊播遮掉固定 emitter。",
      evidence: ["docs/editor-contract/ggd-type-catalog.json#modelFxEmitters"],
      correctedAttribution: {
        notOnThisPath: ["godie-e002.ex", "godie-e00l.ex", "godie-hvsh.r"],
        reason: "這三支走 spawnVfx + vfxId，不是 model@1.fxEmitters；不可用本票假裝修好。",
      },
    },
  ],
  candidates,
};
const fingerprint = createHash("sha256").update(stable(payloadWithoutFingerprint)).digest("hex").slice(0, 12);
const payload = { ...payloadWithoutFingerprint, fingerprint };
const json = `${JSON.stringify(payload, null, 2)}\n`;

const md = [
  "# Editor VFX 模板候選 → Main 參考收編",
  "",
  `狀態：**advisory-only** · 指紋 \`${fingerprint}\``,
  "",
  "這是 VFX Forge 已有共用配方的機器產物。Main 造積木，Editor 組積木；列在這裡不代表 Main 應把每個技能配方寫進 runtime。",
  "",
  "## 目前真正阻塞的積木接縫",
  "",
  `- \`model-fx-owned-emitter-instance-inheritance\`：Main 已確認成立；真正母體由 \`ggd-type-catalog.json#modelFxEmitters\` 量出，共 ${affectedEmitterAbilities.length} 支技能。\`godie-e002.ex\`、\`godie-e00l.ex\`、\`godie-hvsh.r\` 走的是另一條 \`spawnVfx\` 窄通道，不再錯掛本票。`,
  "",
  "## 收編原則",
  "",
  `- ${payload.adoptionRule}`,
  `- ${payload.familyVariantPolicy}`,
  `- ${payload.designerWorkflow}`,
  `- 本次保存 ${payload.preservationReceipt.preservedTypeOutcomes} 個成果：${payload.preservationReceipt.selectablePresetTypes} 個具名完整配方，加上 ${payload.preservationReceipt.automaticMechanicTypes} 個已在 42／46 使用的具名機制推薦；不把既有成果丟回矩陣重調。`,
  "- Editor 修明顯大錯：顏色、方向、形狀、尺度、物理意義。亮度、密度、數幀節奏、鏡頭手感與美術偏好只送人工微調。",
  "- AI 與本檔都沒有 Promote 權限；人工批核前不得套回正式內容。",
  "",
  "## 已有 Editor 共用配方",
  "",
  "| 具名家族變體 | 配方 | 驗收技能 | 組成 | 給 Main 的建議 |",
  "| --- | --- | --- | --- | --- |",
  ...candidates.map((candidate) =>
    `| \`${candidate.suggestedVariantKey}\` | \`${candidate.id}\` ${candidate.label} | ${candidate.acceptanceAbilityIds.join("<br>") || "—"} | ${candidate.segmentKinds.join(" + ")} | ${candidate.mainDisposition === "review-blocking-brick-extension" ? "檢查上列低階缺口；其餘時間軸留 Editor" : "參考即可；維持 Editor 組合模板"} |`,
  ),
  "",
  "## 42／46 已收斂的具名機制推薦",
  "",
  `自動盤點得到 ${mechanicRecommendationTypeCount} 個可重用機制視覺變體；它們已在 Editor 的「依技能自動組裝基本視覺」使用。Owner 對白不參與推論，現有 framebuffer 仍全部等待人工批核。`,
  "",
  "| 機制家族 | 具名變體數 | 已出現技能 |",
  "| --- | ---: | ---: |",
  ...mechanicRecommendationTypes.map((family) =>
    `| \`${family.familyId}\` | ${family.variants.length} | ${new Set(family.variants.flatMap((variant) => variant.exampleAbilityIds)).size} |`,
  ),
  "",
  "完整 modelKey、vfxId、trigger 與受影響清單請讀同目錄 `editor-vfx-template-handback.json`。",
].join("\n");

function verify(path, expected) {
  try {
    if (readFileSync(path, "utf8") === expected) return;
  } catch {
    // A missing generated file is reported by the shared stale-file path below.
  }
  console.error(`FAIL stale or missing ${path.slice(root.length + 1)}`);
  process.exitCode = 1;
}

if (check) {
  verify(jsonPath, json);
  verify(markdownPath, `${md}\n`);
  if (!process.exitCode) console.log(`PASS Editor VFX template handback ${fingerprint} (${candidates.length} recipes)`);
} else {
  writeFileSync(jsonPath, json);
  writeFileSync(markdownPath, `${md}\n`);
  console.log(`WROTE Editor VFX template handback ${fingerprint} (${candidates.length} recipes)`);
}
