import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { HeroPackageTarget } from "@ggd/shared/content/import/heroPackage";
import { zEditorImportPackage } from "@ggd/shared/content/import/packageSchema";
import { buildRuntimePackageZip, packageZipInput } from "@ggd/shared/content/import/packageZip";
import { contentSha256 } from "@ggd/shared/content/import/jcs";
import { ZIP_LIMITS } from "@ggd/shared/content/import/zipSafety";
import type { ValidateOutput } from "@ggd/shared/content/import/validatePackage";
import { assetMediaType } from "@ggd/shared/content/assetReferences";
import { ImportStore } from "./importStore";
import { assetSha256 } from "./iconLanding";
import { heroPackageFiles, readHeroWorkPackage } from "./heroPackageIO";
import { runHeroPackageJob, HeroWorkerUnavailable } from "./heroPackageWorkerClient";
import type { IconUploadPolicy } from "@ggd/shared/content/import/iconAssets";
import { HERO_SLOTS } from "@ggd/shared/content/heroForge/constants";
import type { OverlayBundle } from "@ggd/shared/content/overlay";
import { HeroContentUnavailable } from "./heroContentSnapshot";

export const HERO_WORK_ENDPOINTS = [
  { method: "POST", path: "/hero-package" },
  { method: "POST", path: "/inspect-hero-package" },
  { method: "POST", path: "/prepare-work" },
  { method: "GET", path: "/work-versions/:workId/:versionId" },
  { method: "GET", path: "/work-versions/:workId/:versionId/package" },
  { method: "GET", path: "/work-versions/:workId/:versionId/files/*" },
] as const;
export const HERO_TAKEOVER_ENDPOINTS = [
  { method: "POST", path: "/admin/hero-package-takeover" },
  { method: "POST", path: "/admin/inspect-hero-package-takeover" },
  { method: "POST", path: "/admin/prepare-work-takeover" },
] as const;

interface Dependencies {
  repoRoot: string;
  templateHistoryDir?: string;
  root: string;
  store: ImportStore;
  context: () => Promise<{ target: HeroPackageTarget; overlay?: OverlayBundle } | null>;
  packageOf: (body: unknown, jsonField: unknown) => unknown;
  validate: (raw: unknown, canonicalTakeoverId?: string) => Promise<ValidateOutput>;
  iconPolicy: () => IconUploadPolicy;
}

const failure = (code: string, message: string, retryable = false) => ({ schema: "ggd-content-import-error@1", code, message, retryable });
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);
const unavailable = (error: unknown) => error instanceof HeroWorkerUnavailable || error instanceof HeroContentUnavailable;

/** Part of Main's existing importer. Platform remains the author/publish authority. */
export function registerHeroWorkRoutes(app: FastifyInstance, prefix: string, d: Dependencies, allowCanonicalTakeover = false): void {
  const canonicalId = (req: FastifyRequest): string => String(req.headers["x-ggd-work-id"] ?? "");
  const validWorkId = (value: string): boolean => /^[A-Za-z0-9][A-Za-z0-9._@-]{0,127}$/.test(value);
  const registerBuild = (path: string, takeover: boolean) => app.post<{ Body: { project?: unknown } }>(`${prefix}${path}`, { bodyLimit: ZIP_LIMITS.maxArchiveCompressedBytes }, async (req, reply) => {
    try {
      const context = await d.context();
      if (!context) return reply.code(503).send(failure("HERO_TARGET_UNAVAILABLE", "目前目標缺少可驗證的建置版本。", true));
      const takeoverId = takeover ? canonicalId(req) : undefined;
      if (takeover && (!takeoverId || !validWorkId(takeoverId))) return reply.code(400).send(failure("WORK_IDENTITY_REQUIRED", "管理員接管需要合法的 canonical 英雄 ID。"));
      const sourcePackage = Buffer.isBuffer(req.body) ? d.packageOf(req.body, null) : undefined;
      const pkg = await runHeroPackageJob(d.root, { kind: "build", repoRoot: d.repoRoot, templateHistoryDir: d.templateHistoryDir, project: req.body?.project, ...context, sourcePackage, iconPolicy: d.iconPolicy(), canonicalTakeoverId: takeoverId }, d.store.directory);
      const zip = await buildRuntimePackageZip(packageZipInput(pkg, pkg.manifest.selectionRoots[0]!.id));
      return reply.type("application/zip").header("x-ggd-package-digest", pkg.manifest.packageDigest).send(Buffer.from(zip.bytes));
    } catch (error) { return reply.code(unavailable(error) ? 503 : 422).send(failure("HERO_PACKAGE_INVALID", messageOf(error), unavailable(error))); }
  });
  registerBuild("/hero-package", false);
  if (allowCanonicalTakeover) registerBuild("/admin/hero-package-takeover", true);

  const registerInspect = (path: string, takeover: boolean) => app.post(`${prefix}${path}`, { bodyLimit: ZIP_LIMITS.maxArchiveCompressedBytes }, async (req, reply) => {
    try {
      const takeoverId = takeover ? canonicalId(req) : undefined;
      if (takeover && (!takeoverId || !validWorkId(takeoverId))) return reply.code(400).send(failure("WORK_IDENTITY_REQUIRED", "管理員接管需要合法的 canonical 英雄 ID。"));
      const checked = await d.validate(d.packageOf(req.body, req.body), takeoverId);
      if (!checked.ok || !checked.hero || !checked.value) return reply.code(422).send({ ...failure("HERO_PACKAGE_INVALID", "完整英雄檢查未通過。"), diagnostics: checked.diagnostics });
      const project = checked.hero.project;
      const icons = [{ slot: "hero", path: project.presentation.championIcon }, ...HERO_SLOTS.map((slot) => ({ slot, path: project.presentation.slots[slot].icon }))].flatMap(({ slot, path }) => {
        const asset = checked.hero!.assets.find((asset) => asset.path === path);
        return asset ? [{ slot, path, contentSha256: asset.contentSha256, mime: asset.mediaType, base64: Buffer.from(asset.bytes).toString("base64") }] : [];
      });
      return reply.send({ schema: "ggd-hero-package-inspection@1", project, packageDigest: checked.value.manifest.packageDigest, manifest: checked.value.manifest, icons, diagnostics: checked.diagnostics });
    } catch (error) { return reply.code(unavailable(error) ? 503 : 422).send(failure("HERO_PACKAGE_INVALID", messageOf(error), unavailable(error))); }
  });
  registerInspect("/inspect-hero-package", false);
  if (allowCanonicalTakeover) registerInspect("/admin/inspect-hero-package-takeover", true);

  type PrepareRequest = FastifyRequest<{ Body: { operationId?: string; workId?: string; package?: unknown } }>;
  const prepare = (takeover: boolean) => async (req: PrepareRequest, reply: FastifyReply) => {
    const operationId = Buffer.isBuffer(req.body) ? String(req.headers["x-ggd-operation-id"] ?? "") : req.body?.operationId ?? "";
    const workId = Buffer.isBuffer(req.body) ? String(req.headers["x-ggd-work-id"] ?? "") : req.body?.workId ?? "";
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(operationId) || !/^[A-Za-z0-9][A-Za-z0-9._@-]{0,127}$/.test(workId)) return reply.code(400).send(failure("WORK_IDENTITY_REQUIRED", "作品與操作身分格式錯誤。"));
    let raw: unknown;
    let requestDigest: string;
    try {
      raw = d.packageOf(req.body, Buffer.isBuffer(req.body) ? null : req.body?.package);
      const parsed = zEditorImportPackage.parse(raw);
      const { transport: _transport, ...manifest } = parsed.manifest;
      requestDigest = contentSha256({ workId, package: { ...parsed, manifest, assets: parsed.assets.map((asset) => {
        if (!(asset.bytes instanceof Uint8Array)) throw new Error("資產必須走 ZIP 二進位傳輸。");
        return { path: asset.path, sha256: assetSha256(asset.bytes) };
      }) } });
    } catch (error) { return reply.code(422).send(failure("HERO_PACKAGE_INVALID", messageOf(error))); }
    const prior = d.store.getOperation(operationId);
    if (prior && (prior.kind !== "work-prepare" || prior.requestDigest !== requestDigest)) return reply.code(409).send(failure("OPERATION_INPUT_CONFLICT", "同一操作身分不能改用另一份作品或快照。"));
    if (prior?.status === "stored") return reply.send({ schema: "ggd-work-prepare-result@1", operationId, status: "stored", replayed: true, version: d.store.getWorkVersion(workId, prior.workVersionId!) });
    if (prior?.status === "rejected") return reply.code(422).send({ schema: "ggd-work-prepare-result@1", operationId, status: "rejected", replayed: true, diagnostics: prior.diagnostics });
    if (!prior) {
      d.store.beginOperation(operationId, "content-api");
      d.store.updateOperation(operationId, { kind: "work-prepare", requestDigest, workId });
    }
    try {
      const checked = await d.validate(raw, takeover ? workId : undefined);
      if (!checked.ok || !checked.value || !checked.hero) {
        const diagnostics = checked.diagnostics.length ? checked.diagnostics : [{ code: "HERO_PACKAGE_INVALID", severity: "error", message: "此入口只接受完整英雄作品。" }];
        d.store.updateOperation(operationId, { status: "rejected", diagnostics });
        return reply.code(422).send({ schema: "ggd-work-prepare-result@1", operationId, status: "rejected", diagnostics });
      }
      const pkg = checked.value;
      d.store.updateOperation(operationId, { status: "validated", packageDigest: pkg.manifest.packageDigest });
      const stored = d.store.putWorkVersion({ workId, projectId: checked.hero.project.projectId, packageDigest: pkg.manifest.packageDigest }, heroPackageFiles(pkg));
      d.store.updateOperation(operationId, { status: "stored", workVersionId: stored.record.versionId });
      d.store.audit("content-api", "content-import.work-stored", { operationId, workId, versionId: stored.record.versionId, snapshotDigest: stored.record.snapshotDigest });
      return reply.send({ schema: "ggd-work-prepare-result@1", operationId, status: "stored", replayed: !stored.stored, version: stored.record });
    } catch (error) {
      // A crash after object placement resumes with the same operation, never a new version.
      return reply.code(503).send({ ...failure("WORK_PREPARE_FAILED", messageOf(error), true), operationId });
    }
  };
  app.post<{ Body: { operationId?: string; workId?: string; package?: unknown } }>(`${prefix}/prepare-work`, { bodyLimit: ZIP_LIMITS.maxArchiveCompressedBytes }, prepare(false));
  if (allowCanonicalTakeover) app.post<{ Body: { operationId?: string; workId?: string; package?: unknown } }>(`${prefix}/admin/prepare-work-takeover`, { bodyLimit: ZIP_LIMITS.maxArchiveCompressedBytes }, prepare(true));

  app.get<{ Params: { workId: string; versionId: string } }>(`${prefix}/work-versions/:workId/:versionId`, async (req, reply) => {
    const record = d.store.getWorkVersion(req.params.workId, req.params.versionId);
    if (!record) return reply.code(404).send(failure("WORK_VERSION_NOT_FOUND", "找不到作品版本。"));
    const bytes = d.store.readWorkFile(record.workId, record.versionId, `authoring/hero-projects/${record.projectId}.json`);
    if (!bytes) return reply.code(500).send(failure("WORK_VERSION_CORRUPTED", "作品版本缺少可編輯來源。"));
    return reply.send({ schema: "ggd-work-version-detail@1", version: record, project: JSON.parse(bytes.toString("utf8")) });
  });
  app.get<{ Params: { workId: string; versionId: string } }>(`${prefix}/work-versions/:workId/:versionId/package`, async (req, reply) => {
    const pkg = readHeroWorkPackage(d.store, req.params.workId, req.params.versionId);
    if (!pkg) return reply.code(404).send(failure("WORK_VERSION_NOT_FOUND", "找不到作品版本。"));
    const zip = await buildRuntimePackageZip(packageZipInput(pkg, req.params.workId));
    return reply.type("application/zip").header("cache-control", "private, max-age=31536000, immutable").send(Buffer.from(zip.bytes));
  });
  app.get<{ Params: { workId: string; versionId: string; "*": string } }>(`${prefix}/work-versions/:workId/:versionId/files/*`, async (req, reply) => {
    const bytes = d.store.readWorkFile(req.params.workId, req.params.versionId, req.params["*"]);
    if (!bytes) return reply.code(404).send(failure("WORK_FILE_NOT_FOUND", "找不到作品檔案。"));
    return reply.type(assetMediaType(req.params["*"]) ?? "application/json").header("cache-control", "private, max-age=31536000, immutable").send(bytes);
  });
}
