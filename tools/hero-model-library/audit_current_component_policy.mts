import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HERO_MODEL_ADOPTION_POLICY } from "../../packages/shared/src/content/modelUpload/budget";
import { measureGlb } from "../model-budget/glb";
import { gateFor, scoreAgainst } from "../model-budget/roles";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const SOURCE = path.join(ROOT, "materials/hero-model-library/download-sources.json");
const OUTPUT = path.join(ROOT, "materials/hero-model-library/priority-evidence/current-component-policy-audit.json");
const CHECK = process.argv.includes("--check");
const BODY_ROLES = new Set([
  "independent-static-skinned-model-component",
  "independent-skinned-model-motion-component",
  "independent-historical-model-body-component",
]);

function sha256(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
function rel(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join("/");
}
function pin(file: string) {
  return { path: rel(file), bytes: fs.statSync(file).size, sha256: sha256(file) };
}

function main(): void {
  const downloads = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
  const gate = gateFor("champion");
  if (!gate) throw new Error("champion model gate is missing");
  const candidates = [...(downloads.publicSources ?? []), ...(downloads.paidSources ?? [])]
    .flatMap((source: any) => (source.componentCandidates ?? []).map((candidate: any) => ({ source, candidate })))
    .filter(({ candidate }: any) => candidate.componentReady === true)
    .sort((a: any, b: any) => String(a.candidate.id).localeCompare(String(b.candidate.id), "en"));

  const records = candidates.map(({ source, candidate }: any) => {
    const glbPath = path.resolve(ROOT, candidate.gitPath);
    if (!glbPath.startsWith(ROOT + path.sep)) throw new Error(`component escapes checkout: ${candidate.id}`);
    const actualSha = sha256(glbPath);
    const actualBytes = fs.statSync(glbPath).size;
    if (actualSha !== candidate.sha256 || actualBytes !== candidate.bytes) {
      throw new Error(`component bytes differ from download-sources: ${candidate.id}`);
    }
    const metrics = measureGlb(glbPath);
    const scored = scoreAgainst(metrics, gate);
    const bodyCandidate = BODY_ROLES.has(candidate.resourceRole);
    const requiresDecimatedCandidate = bodyCandidate && metrics.triangles > HERO_MODEL_ADOPTION_POLICY.decimateWhenTrianglesAbove;
    const blockingAxes = scored.axes.filter((axis) => axis.verdict === "over").map((axis) => axis.key);
    const heroAdoptionEligible = bodyCandidate && !requiresDecimatedCandidate && scored.worst !== "over" && metrics.skins > 0;
    return {
      id: candidate.id,
      sourceId: source.id,
      resourceRole: candidate.resourceRole,
      gitPath: candidate.gitPath,
      sha256: actualSha,
      bytes: actualBytes,
      metrics: {
        triangles: metrics.triangles,
        meshes: metrics.meshes,
        maxTextureEdge: metrics.maxTextureEdge,
        channelsPerFrame: metrics.channelsPerFrame,
        skins: metrics.skins,
        joints: metrics.joints,
        clips: metrics.clips,
        embeddedImages: metrics.images.length,
      },
      runtimeBudget: {
        role: gate.role,
        warningValues: Object.fromEntries(scored.axes.map((axis) => [axis.key, axis.warn])),
        limitValues: Object.fromEntries(scored.axes.map((axis) => [axis.key, axis.limit])),
        verdict: scored.worst,
        blockingAxes,
        pass: scored.worst !== "over",
      },
      formalHeroAdoption: {
        applicable: bodyCandidate,
        sourceTriangleTriggerAbove: HERO_MODEL_ADOPTION_POLICY.decimateWhenTrianglesAbove,
        decimatedCandidateTargetMax: HERO_MODEL_ADOPTION_POLICY.decimatedTargetTrianglesMax,
        requiresDecimatedCandidate,
        eligible: heroAdoptionEligible,
      },
      catalogSemantics: {
        componentReady: true,
        runtimeSelectable: false,
        fullHeroModel: false,
        note: "Current policy measurement does not promote this independent component to a hero or runtime dropdown option.",
      },
    };
  });

  const sourceFiles = [
    SOURCE,
    path.join(ROOT, "packages/shared/src/content/modelUpload/adoptionPolicy.json"),
    path.join(ROOT, "packages/shared/src/content/modelUpload/budget.ts"),
    path.join(ROOT, "tools/model-budget/limits.ts"),
    path.join(ROOT, "tools/model-budget/glb.ts"),
    path.join(ROOT, "tools/model-budget/roles.ts"),
    fileURLToPath(import.meta.url),
  ];
  const output = {
    schema: "ggd-current-component-policy-audit@1",
    scope: "Current measurements for independently reusable Git GLBs. Historical conversion receipts remain immutable; this audit does not prove hero registration, dropdown availability, visual acceptance, or production deployment.",
    generatedFrom: sourceFiles.map(pin),
    policy: {
      formalHeroAdoption: HERO_MODEL_ADOPTION_POLICY,
      runtimeChampionGate: {
        triangles: gate.tris,
        meshes: gate.meshes,
        maxTextureEdge: gate.texEdge,
        channelsPerFrame: gate.channels,
      },
    },
    totals: {
      audited: records.length,
      runtimeBudgetPass: records.filter((row) => row.runtimeBudget.pass).length,
      runtimeBudgetNeedsWork: records.filter((row) => !row.runtimeBudget.pass).length,
      heroAdoptionEligible: records.filter((row) => row.formalHeroAdoption.eligible).length,
      requiresDecimatedCandidate: records.filter((row) => row.formalHeroAdoption.requiresDecimatedCandidate).length,
    },
    records,
  };
  const encoded = JSON.stringify(output, null, 2) + "\n";
  if (CHECK) {
    if (!fs.existsSync(OUTPUT) || fs.readFileSync(OUTPUT, "utf8") !== encoded) {
      throw new Error(`stale current component policy audit: ${rel(OUTPUT)}`);
    }
    process.stdout.write(`current component policy audit is current (${records.length} components)\n`);
    return;
  }
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, encoded);
  process.stdout.write(`wrote ${rel(OUTPUT)} (${records.length} components)\n`);
}

main();
