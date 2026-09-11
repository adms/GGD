import { parentPort, workerData } from "node:worker_threads";
import { buildHeroImportPackage } from "@ggd/shared/content/import/heroPackage";
import { validatePackage } from "@ggd/shared/content/import/validatePackage";
import { readHeroPackageCatalog } from "./heroPackageIO";
import type { HeroPackageJob } from "./heroPackageWorkerClient";
import { normalizeHeroSource } from "./heroIconNormalization";
import { ImportStore } from "./importStore";
import { normalizedHeroIcons } from "./normalizedHeroIcons";
import { ContentLoader } from "@ggd/shared/content/loader";
import { FsContentSource } from "@ggd/shared/content/node/FsContentSource";
import { OverlayContentSource } from "@ggd/shared/content/overlay";
import { COLLECTION_NAMES } from "@ggd/shared/content/schema/index";
import { withUploadedHeroModel } from "@ggd/shared/content/import/uploadedHeroModel";
import { zEditorImportPackage } from "@ggd/shared/content/import/packageSchema";
import { resolve } from "node:path";
import { retainHeroTemplates, readHeroTemplateVersion } from "./heroTemplateHistory";
import { retainHeroBuildSources } from "./heroBuildHistory";

const { root, job, importDir } = workerData as { root: string; job: HeroPackageJob; importDir?: string };
async function run() {
try {
  let project = job.kind === "build" ? job.project : null;
  if (job.kind === "build" && job.sourcePackage) {
    if (!importDir || !job.iconPolicy) throw new Error("此目標未提供圖示正規化政策與保存位置。");
    project = normalizeHeroSource(job.sourcePackage, new ImportStore({ dir: importDir }), job.iconPolicy, job.target);
  }
  let catalog = readHeroPackageCatalog(root, importDir, job.kind === "validate" ? normalizedHeroIcons(job.input.raw) : undefined);
  const base = new FsContentSource(root);
  const source = job.overlay ? new OverlayContentSource(base, job.overlay) : base;
  const manifest = await source.readManifest();
  const target = job.kind === "build" ? job.target : job.input.heroTarget;
  if (!target || manifest.contentVersion !== target.contentVersion) throw new Error("遊戲內容已在檢查期間變更，請重新取得目標後再試。");
  const buildStore = new ImportStore({ dir: resolve(importDir ?? resolve(root, "..", "data", "content-import"), "build-sources") });
  catalog = { ...catalog, buildSources: retainHeroBuildSources(job.repoRoot ?? resolve(root, ".."), buildStore, target.processorFingerprint) };
  if (job.overlay) {
    const loaded = await new ContentLoader(source).load({ policy: "fail-closed" });
    const documents = new Map(COLLECTION_NAMES.flatMap((collection) => loaded.store.all<Record<string, unknown>>(collection).map((doc) => [`${collection}/${doc.id}`, doc] as const)));
    catalog = { ...catalog, documents };
  }
  if (job.canonicalTakeoverId) catalog = { ...catalog, canonicalTakeoverId: job.canonicalTakeoverId };
  const templateStore = new ImportStore({ dir: job.templateHistoryDir ?? resolve(root, "..", "data", "content-backups", "hero-catalog-versions") });
  retainHeroTemplates(templateStore, [...catalog.documents].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc));
  catalog = { ...catalog, resolveTemplateVersion: (id, digest) => readHeroTemplateVersion(templateStore, id, digest) };
  if (job.kind === "build") {
    if ((project as { presentation?: { uploadedModel?: unknown } } | null)?.presentation?.uploadedModel && catalog.documents.get("config/ugc")?.heroModelUploadsEnabled === false) throw new Error("目前未開放新的英雄模型上傳，原檔仍保存在草稿。");
    catalog = await withUploadedHeroModel(catalog, project, job.sourcePackage, Boolean(job.canonicalTakeoverId));
  } else {
    const pkg = zEditorImportPackage.parse(job.input.raw);
    const roots = pkg.documents.filter((entry) => entry.path.startsWith("authoring/hero-projects/"));
    if (roots.length === 1) catalog = await withUploadedHeroModel(catalog, roots[0]!.document, pkg, Boolean(job.canonicalTakeoverId));
  }
  const result = job.kind === "build"
    ? buildHeroImportPackage(project, catalog, job.target)
    : validatePackage({ ...job.input, heroCatalog: catalog });
  parentPort!.postMessage({ ok: true, result });
} catch (error) { parentPort!.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) }); }
}
void run();
