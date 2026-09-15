import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HERO_MODEL_ADOPTION_POLICY } from "../../packages/shared/src/content/modelUpload/budget";
import { measureGlb } from "./glb";
import { gateFor, scoreAgainst } from "./roles";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const SOURCE = path.join(ROOT, "materials/hero-model-library/priority-release.json");
const JSON_OUT = path.join(ROOT, "materials/hero-model-library/priority-model-policy-audit.json");
const MD_OUT = path.join(ROOT, "materials/hero-model-library/priority-model-policy-audit.md");
const CHECK = process.argv.includes("--check");

type PriorityRelease = {
  branch: string;
  pullRequest: string;
  productionDeployed: boolean;
  priority15: Array<{
    heroId: string;
    name: string;
    activeModelKey: string;
    automaticEligible?: boolean;
  }>;
};

function sha256(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

function main(): void {
  const source = JSON.parse(fs.readFileSync(SOURCE, "utf8")) as PriorityRelease;
  const gate = gateFor("champion");
  if (!gate) throw new Error("champion gate is missing");

  const records = source.priority15.map((entry) => {
    const modelDocPath = path.join(ROOT, "content/models", `${entry.activeModelKey}.json`);
    const modelDoc = JSON.parse(fs.readFileSync(modelDocPath, "utf8"));
    const glbPath = path.join(ROOT, "content", modelDoc.glbPath);
    const metrics = measureGlb(glbPath);
    const scored = scoreAgainst(metrics, gate);
    const adoptionEligible = metrics.triangles <= HERO_MODEL_ADOPTION_POLICY.decimateWhenTrianglesAbove;
    const blockingAxes = scored.axes.filter((axis) => axis.verdict === "over").map((axis) => axis.key);
    if (!adoptionEligible && !blockingAxes.includes("triangles")) blockingAxes.unshift("triangles");
    const clipMap = modelDoc.clipMap ?? {};
    const clipNames = Object.values(clipMap).filter((value): value is string => typeof value === "string");
    return {
      heroId: entry.heroId,
      name: entry.name,
      modelKey: entry.activeModelKey,
      modelDocPath: path.relative(ROOT, modelDocPath).split(path.sep).join("/"),
      glbPath: path.relative(ROOT, glbPath).split(path.sep).join("/"),
      glbSha256: sha256(glbPath),
      metrics: {
        triangles: metrics.triangles,
        meshes: metrics.meshes,
        maxTextureEdge: metrics.maxTextureEdge,
        channelsPerFrame: metrics.channelsPerFrame,
        skins: metrics.skins,
        clips: metrics.clips,
      },
      motionBinding: {
        stateCount: Object.keys(clipMap).length,
        uniqueClipCount: new Set(clipNames).size,
        kind: clipNames.some((name) => name.startsWith("GGD_procedural_")) ? "ggd-procedural" : "source-or-shared",
        nativeCompletenessNotClaimed: true,
      },
      formalAdoption: {
        eligible: adoptionEligible,
        triggerTrianglesAbove: HERO_MODEL_ADOPTION_POLICY.decimateWhenTrianglesAbove,
        decimatedTargetTrianglesMax: HERO_MODEL_ADOPTION_POLICY.decimatedTargetTrianglesMax,
      },
      runtimeGateWorst: scored.worst,
      blockingAxes,
      currentPolicyReady: adoptionEligible && scored.worst !== "over" && metrics.skins > 0,
      productionDeployed: false,
    };
  });

  const out = {
    schema: "ggd-priority-model-policy-audit@1",
    generatedFrom: {
      priorityRelease: path.relative(ROOT, SOURCE).split(path.sep).join("/"),
      priorityReleaseSha256: sha256(SOURCE),
      adoptionPolicy: "packages/shared/src/content/modelUpload/adoptionPolicy.json",
      adoptionPolicySha256: sha256(path.join(ROOT, "packages/shared/src/content/modelUpload/adoptionPolicy.json")),
      runtimeBudget: "packages/shared/src/content/modelUpload/budget.ts",
      runtimeBudgetSha256: sha256(path.join(ROOT, "packages/shared/src/content/modelUpload/budget.ts")),
    },
    scope: "Priority-15 current model bytes and six-state bindings. This is a model-policy audit, not deployment proof or native-motion/VFX acceptance.",
    branch: source.branch,
    pullRequest: source.pullRequest,
    productionDeployed: false,
    totals: {
      audited: records.length,
      currentPolicyReady: records.filter((record) => record.currentPolicyReady).length,
      needsWork: records.filter((record) => !record.currentPolicyReady).length,
    },
    records,
  };

  const md = [
    "# 優先 15 名模型現行政策稽核",
    "",
    "> 本頁由 `pnpm modelpolicy:priority-audit` 產生。數字來自目前 GLB 與現行政策；不代表正式站已部署，也不代表六段皆為原生動作或已有專用特效。",
    "",
    `- 已核算：${out.totals.audited}`,
    `- 模型現行政策通過：${out.totals.currentPolicyReady}`,
    `- 仍需處理：${out.totals.needsWork}`,
    "",
    "| 角色 | 面數 | mesh | 貼圖 | 通道 | 動作綁定 | 現行模型結論 | 阻擋項目 |",
    "|---|---:|---:|---:|---:|---|---|---|",
    ...records.map((record) =>
      `| ${record.name} | ${record.metrics.triangles} | ${record.metrics.meshes} | ${record.metrics.maxTextureEdge}px | ${record.metrics.channelsPerFrame} | ${record.motionBinding.stateCount} 態／${record.motionBinding.uniqueClipCount} 個不同 clip／${record.motionBinding.kind} | ${record.currentPolicyReady ? "通過，待 Main 合併部署" : "進行中"} | ${record.blockingAxes.join("、") || "—"} |`,
    ),
    "",
    "正式採用面數規則：來源超過 10,000 面時，必須另產生不超過 8,000 面的候選並重新完成視覺與骨架驗收。貼圖、mesh、動畫通道等值由程式載入現行 budget，不在本頁另寫一份門檻。",
    "",
  ].join("\n");

  const json = stableJson(out);
  if (CHECK) {
    const outputs: Array<[string, string]> = [[JSON_OUT, json], [MD_OUT, md]];
    const mismatches = outputs.filter(([file, expected]) => !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== expected);
    if (mismatches.length) {
      for (const [file] of mismatches) process.stderr.write(`stale: ${path.relative(ROOT, file)}\n`);
      process.exit(1);
    }
    process.stdout.write(`priority model policy audit is current (${records.length} records)\n`);
    return;
  }
  fs.writeFileSync(JSON_OUT, json);
  fs.writeFileSync(MD_OUT, md);
  process.stdout.write(`wrote ${path.relative(ROOT, JSON_OUT)} and ${path.relative(ROOT, MD_OUT)}\n`);
}

main();
