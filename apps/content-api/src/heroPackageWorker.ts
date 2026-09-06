import { parentPort, workerData } from "node:worker_threads";
import { buildHeroImportPackage } from "@ggd/shared/content/import/heroPackage";
import { validatePackage } from "@ggd/shared/content/import/validatePackage";
import { readHeroPackageCatalog } from "./heroPackageIO";
import type { HeroPackageJob } from "./heroPackageWorkerClient";
import { normalizeHeroSource } from "./heroIconNormalization";
import { ImportStore } from "./importStore";
import { normalizedHeroIcons } from "./normalizedHeroIcons";

const { root, job, importDir } = workerData as { root: string; job: HeroPackageJob; importDir?: string };
try {
  let project = job.kind === "build" ? job.project : null;
  if (job.kind === "build" && job.sourcePackage) {
    if (!importDir || !job.iconPolicy) throw new Error("此目標未提供圖示正規化政策與保存位置。");
    project = normalizeHeroSource(job.sourcePackage, new ImportStore({ dir: importDir }), job.iconPolicy, job.target);
  }
  const catalog = readHeroPackageCatalog(root, importDir, job.kind === "validate" ? normalizedHeroIcons(job.input.raw) : undefined);
  const result = job.kind === "build"
    ? buildHeroImportPackage(project, catalog, job.target)
    : validatePackage({ ...job.input, heroCatalog: catalog });
  parentPort!.postMessage({ ok: true, result });
} catch (error) { parentPort!.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) }); }
