import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Abilities } from "@ggd/shared/sim";
import { heroPackageProject, shippedHeroCatalog } from "../../../packages/shared/testkit/heroPackageFixture";
import { registerImportRoutes } from "./importRoutes";
import { ImportStore } from "./importStore";
import { readHeroWorkPackage } from "./heroPackageIO";
import { buildRuntimePackageZip, packageZipInput } from "@ggd/shared/content/import/packageZip";
import { packageDigest } from "@ggd/shared/content/import/digest";
import { buildHeroSourcePackage } from "@ggd/shared/content/import/heroSourcePackage";
import { sniffImageHeader } from "@ggd/shared/content/icons/encodeIcon";
import { ImportTransientCleanup, IMPORT_TRANSIENT_RETENTION } from "./importTransientCleanup";
import { modelUploadFixture } from "@ggd/shared/content/modelUpload/fixtures";
import { prepareUploadedHeroModel } from "@ggd/shared/content/modelUpload/heroModel";
import { uploadedHeroModelPath } from "@ggd/shared/content/modelUpload/heroModelSchema";
import { readPackageZip } from "@ggd/shared/content/import/readPackageZip";
import { zHeroBuildProvenance } from "@ggd/shared/content/import/heroBuildProvenance";

const repo = resolve(import.meta.dirname, "../../..");
const prefix = "/api/v1/content-import";
const project = heroPackageProject(shippedHeroCatalog());
let app: FastifyInstance;
let dir: string;
let zip: Buffer;
let versionId: string;
const init = async () => {
  app = Fastify();
  registerImportRoutes(app, { contentDir: join(repo, "content"), importDir: dir, repoRoot: repo, gameVersion: "integration-fixture-revision" });
  await app.ready();
};
const upload = (path: string, operationId: string, workId = "work-a", payload = zip) => app.inject({ method: "POST", url: `${prefix}/${path}`, headers: { "content-type": "application/zip", "x-ggd-operation-id": operationId, "x-ggd-work-id": workId }, payload });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ggd-hero-import-"));
  await init();
  const before = Abilities.ids();
  const response = await app.inject({ method: "POST", url: `${prefix}/hero-package`, payload: { project } });
  expect(response.statusCode, response.statusCode === 200 ? "" : response.body).toBe(200);
  zip = response.rawPayload;
  versionId = String(response.headers["x-ggd-package-digest"]);
  expect(Abilities.ids()).toEqual(before);
}, 30_000);
afterAll(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });

describe("complete hero over the existing Main ZIP/import/store seam", () => {
  it("retains the actual build sources named by the ZIP and can reopen them after restart", () => {
    const pkg = readPackageZip(zip);
    const provenance = pkg.validation.find((entry) => entry.path === "validation/hero-build-provenance.json")!.document as Record<string, string | null>;
    expect(provenance).toMatchObject({ schema: "ggd-hero-build-provenance@1", processorFingerprint: pkg.manifest.authoringProcessor.fingerprint, planGeneratorVersion: null });
    const history = new ImportStore({ dir: join(dir, "build-sources") });
    for (const [kind, versionId] of [["hero-generator", provenance.generatorVersion], ["hero-processor", provenance.processorVersion]]) {
      expect(versionId).toMatch(/^sha256:[a-f0-9]{64}$/);
      const workId = `ggd-${kind}-source`;
      const manifest = JSON.parse(Buffer.from(history.readWorkFile(workId, versionId!, "source-manifest.json")!).toString());
      expect(manifest.kind).toBe(kind);
      expect(history.readWorkFile(workId, versionId!, "source/pnpm-lock.yaml")).toEqual(readFileSync(join(repo, "pnpm-lock.yaml")));
      expect(history.readWorkFile(workId, versionId!, "source/packages/shared/src/content/heroForge/generator.ts")).toEqual(readFileSync(join(repo, "packages/shared/src/content/heroForge/generator.ts")));
    }
  });

  it("revalidates an uploaded body, carries it through the work package, and never globally approves it", async () => {
    const prepared = await prepareUploadedHeroModel(modelUploadFixture().bytes, { idle: 0, run: 1, attack: 0, cast: 1, hurt: 0, death: 1 });
    const hero = structuredClone(project);
    hero.presentation.uploadedModel = prepared.model; hero.presentation.modelKey = prepared.document.id;
    const profile = (await app.inject(`${prefix}/active/target-profile`)).json();
    const target = { gameRevision: profile.gameVersion, contentVersion: profile.base.contentVersion ?? profile.content.contentVersion, migrationFingerprint: profile.migrationFingerprint, processorFingerprint: profile.authoringProcessor.fingerprint };
    const source = buildHeroSourcePackage(hero, [], target, prepared.bytes);
    const input = await buildRuntimePackageZip(packageZipInput(source, hero.projectId));
    const built = await upload("hero-package", "model-build", "model-work", Buffer.from(input.bytes));
    expect(built.statusCode, built.statusCode === 200 ? "" : built.body).toBe(200);
    const pkg = readPackageZip(built.rawPayload), path = uploadedHeroModelPath(prepared.model);
    const provenance = zHeroBuildProvenance.parse(pkg.validation.find((entry) => entry.path === "validation/hero-build-provenance.json")?.document);
    expect(provenance.processorFingerprint).toBe(target.processorFingerprint);
    expect(new ImportStore({ dir: join(dir, "build-sources") }).readWorkFile("ggd-hero-generator-source", provenance.generatorVersion, "source-manifest.json")).not.toBeNull();
    expect(pkg.assets.find((asset) => asset.path === path)?.bytes).toEqual(prepared.bytes);
    expect(pkg.compiled.find((entry) => entry.path === `compiled/models/${prepared.document.id}.json`)?.document).toEqual(prepared.document);
    expect((await upload("inspect-hero-package", "model-inspect", "model-work", built.rawPayload)).statusCode).toBe(200);
    expect((await upload("prepare-work", "model-store", "model-work", built.rawPayload)).statusCode).toBe(200);
    expect(new ImportStore({ dir }).readWorkFile("model-work", pkg.manifest.packageDigest, path)).toEqual(Buffer.from(prepared.bytes));
    expect((await app.inject(`${prefix}/active`)).json().active).toBeNull();
    expect(shippedHeroCatalog().documents.has(`models/${prepared.document.id}`)).toBe(false);
    const staleGenerator = structuredClone(hero);
    staleGenerator.acceptedPlan!.generatorVersion = `sha256:${"0".repeat(64)}`;
    const staleSource = buildHeroSourcePackage(staleGenerator, [], target, prepared.bytes);
    const staleZip = await buildRuntimePackageZip(packageZipInput(staleSource, hero.projectId));
    const staleBuild = await upload("hero-package", "model-stale-generator", "model-work", Buffer.from(staleZip.bytes));
    expect(staleBuild.statusCode).toBe(422);
    expect(staleBuild.body).toContain("明確採用目前生成器");
    const missingDescriptor = structuredClone(hero); delete missingDescriptor.presentation.uploadedModel;
    const denied = await app.inject({ method: "POST", url: `${prefix}/hero-package`, payload: { project: missingDescriptor } });
    expect(denied.statusCode).toBe(422);
    // Neither a descriptor without bytes nor the old asset under a changed mapping is accepted.
    expect((await app.inject({ method: "POST", url: `${prefix}/hero-package`, payload: { project: hero } })).statusCode).toBe(422);
    source.documents[0]!.document = { ...hero, presentation: { ...hero.presentation, modelKey: "champ.thorne" } };
    const corrupted = await buildRuntimePackageZip(packageZipInput(source, hero.projectId));
    expect((await upload("hero-package", "model-tamper", "model-work", Buffer.from(corrupted.bytes))).statusCode).toBe(422);
  }, 60_000);

  it("normalizes an original image before inspection and freezes the exact reviewed WebP", async () => {
    const hero = structuredClone(project);
    hero.presentation.championIcon = `assets/icons/champions/${hero.projectId}.webp`;
    const profile = (await app.inject(`${prefix}/active/target-profile`)).json();
    const target = { gameRevision: profile.gameVersion, contentVersion: profile.base.contentVersion ?? profile.content.contentVersion, migrationFingerprint: profile.migrationFingerprint, processorFingerprint: profile.authoringProcessor.fingerprint };
    const bytes = new Uint8Array(readFileSync(join(repo, "content/assets/icons/champions/godie-oshd.png")));
    const source = buildHeroSourcePackage(hero, [{ path: `assets/icon/champions/${hero.projectId}/source.png`, collection: "champions", id: hero.projectId, mime: "image/png", bytes }], target);
    const raw = await buildRuntimePackageZip(packageZipInput(source, hero.projectId));
    const built = await upload("hero-package", "icon-build", "icon-work", Buffer.from(raw.bytes));
    expect(built.statusCode, built.statusCode === 200 ? "" : built.body).toBe(200);
    const inspected = await upload("inspect-hero-package", "icon-inspect", "icon-work", built.rawPayload);
    expect(inspected.statusCode, inspected.statusCode === 200 ? "" : inspected.body).toBe(200);
    const preview = inspected.json().icons.find((icon: { slot: string }) => icon.slot === "hero");
    const normalized = Buffer.from(preview.base64, "base64");
    expect(sniffImageHeader(normalized)).toMatchObject({ width: 128, height: 128, mime: "image/webp" });
    expect(hero.presentation.championIcon).toContain(`/champions/${hero.projectId}`);
    expect(inspected.json().project.presentation.championIcon).toMatch(/^assets\/icons\/community\/[a-f0-9]{64}\.webp$/);
    const receipts = (readdirSync(join(dir, "objects/icon-receipts")) as string[]).map((file) => JSON.parse(readFileSync(join(dir, "objects/icon-receipts", file), "utf8")));
    expect(receipts.some((receipt) => receipt.contentSha256 === preview.contentSha256 && readFileSync(join(dir, "objects/icon-sources", receipt.sourceSha256.slice(7))).equals(Buffer.from(bytes)))).toBe(true);
    expect((await upload("prepare-work", "icon-store", "icon-work", built.rawPayload)).statusCode).toBe(200);
    const frozen = new ImportStore({ dir }).readWorkFile("icon-work", inspected.json().packageDigest, preview.path);
    expect(frozen).toEqual(normalized);
    const expired = Date.now() - 2 * IMPORT_TRANSIENT_RETENTION.iconCacheMs;
    for (const group of ["icons", "icon-sources", "icon-receipts"]) for (const file of readdirSync(join(dir, "objects", group))) utimesSync(join(dir, "objects", group, file), expired / 1000, expired / 1000);
    const cleanup = new ImportTransientCleanup(dir);
    try {
      let complete = false;
      for (let i = 0; i < 100 && !complete; i++) { const result = cleanup.step(); expect(result.errors).toBe(0); complete = result.cycleComplete; }
      expect(complete).toBe(true);
    } finally { cleanup.close(); }
    expect(readdirSync(join(dir, "objects/icons"))).toEqual([]);
    // A published/replay version remains self-contained after cache eviction.
    expect(new ImportStore({ dir }).readWorkFile("icon-work", inspected.json().packageDigest, preview.path)).toEqual(normalized);
    expect((await upload("inspect-hero-package", "icon-after-eviction", "icon-work", built.rawPayload)).statusCode).toBe(200);
    // Saved local/cloud drafts resend their embedded normalized image bytes.
    const reopened = buildHeroSourcePackage(inspected.json().project, [{ path: preview.path, collection: "champions", id: hero.projectId, mime: "image/webp", bytes: normalized }], target);
    const reopenedZip = await buildRuntimePackageZip(packageZipInput(reopened, hero.projectId));
    const rebuilt = await upload("hero-package", "icon-reopen", "icon-work", Buffer.from(reopenedZip.bytes));
    expect(rebuilt.statusCode, rebuilt.body).toBe(200);
    expect(rebuilt.headers["x-ggd-package-digest"]).toBe(built.headers["x-ggd-package-digest"]);
    source.manifest.base.gameRevision = "stale-target";
    source.manifest.packageDigest = packageDigest(source.manifest);
    const stale = await buildRuntimePackageZip(packageZipInput(source, "stale"));
    expect((await upload("hero-package", "icon-stale", "icon-work", Buffer.from(stale.bytes))).statusCode).toBe(422);
  }, 60_000);

  it("validates all source, runtime, evidence and assets without store or registry mutation", async () => {
    const before = readdirSync(dir, { recursive: true });
    const abilities = Abilities.ids();
    const result = await upload("validate", "validate-only");
    expect(result.statusCode, result.body).toBe(200);
    expect(result.json().packageDigest).toBe(versionId);
    expect(readdirSync(dir, { recursive: true })).toEqual(before);
    expect(Abilities.ids()).toEqual(abilities);
  }, 30_000);

  it("stores two works, restores exact authoring after restart, and leaves official ACTIVE unchanged", async () => {
    for (const work of ["work-a", "work-b"]) {
      const result = await upload("prepare-work", `store-${work}`, work);
      expect(result.statusCode, result.body).toBe(200);
      expect(result.json().status).toBe("stored");
    }
    await app.close(); await init();
    for (const work of ["work-a", "work-b"]) {
      const detail = await app.inject(`${prefix}/work-versions/${work}/${encodeURIComponent(versionId)}`);
      expect(detail.statusCode, detail.body).toBe(200);
      expect(detail.json().project).toEqual(project);
    }
    expect((await app.inject(`${prefix}/active`)).json().active).toBeNull();
    const retry = await upload("prepare-work", "store-work-a");
    expect(retry.statusCode, retry.body).toBe(200);
    expect(retry.json().replayed).toBe(true);
    const exported = await app.inject(`${prefix}/work-versions/work-a/${encodeURIComponent(versionId)}/package`);
    expect(exported.statusCode).toBe(200);
    expect((await upload("validate", "readback-check", "work-a", exported.rawPayload)).statusCode).toBe(200);
  }, 60_000);

  it("rejects replacing operation input or sending a work to the official activation endpoint", async () => {
    const other = await upload("prepare-work", "store-work-a", "another-work");
    expect(other.statusCode).toBe(409);
    const apply = await upload("apply", "no-global-activation");
    expect(apply.statusCode, apply.body).toBe(422);
    expect(apply.json().code).toBe("WORK_SCOPE_REQUIRED");
    expect((await app.inject(`${prefix}/active`)).json().active).toBeNull();
  }, 30_000);

  it("resumes after a crash between immutable placement and operation completion", async () => {
    const original = ImportStore.prototype.putWorkVersion;
    const spy = vi.spyOn(ImportStore.prototype, "putWorkVersion").mockImplementationOnce(function (this: ImportStore, identity, files) {
      original.call(this, identity, files); throw new Error("injected crash after placement");
    });
    const failed = await upload("prepare-work", "crash-retry", "work-crash");
    spy.mockRestore();
    expect(failed.statusCode, failed.body).toBe(503);
    const retry = await upload("prepare-work", "crash-retry", "work-crash");
    expect(retry.statusCode, retry.body).toBe(200);
    expect(retry.json().replayed).toBe(true);
    expect(retry.json().version.versionId).toBe(versionId);
  }, 60_000);

  it("rejects forged target pins and detects damaged frozen asset bytes on read", async () => {
    const store = new ImportStore({ dir });
    const pkg = readHeroWorkPackage(store, "work-a", versionId)!;
    pkg.manifest.base.gameRevision = "forged-other-game";
    pkg.manifest.packageDigest = packageDigest(pkg.manifest);
    const bad = await buildRuntimePackageZip(packageZipInput(pkg, "bad-target"));
    const checked = await upload("validate", "bad-target", "work-a", Buffer.from(bad.bytes));
    expect(checked.statusCode, checked.body).toBe(422);
    const paths = readdirSync(dir, { recursive: true }) as string[];
    const versionPath = paths.find((path) => path.endsWith("/version.json") && JSON.parse(readFileSync(join(dir, path), "utf8")).workId === "work-a")!;
    const asset = paths.find((path) => path.startsWith(versionPath.slice(0, -"version.json".length)) && path.endsWith(".glb"))!;
    expect(asset).toBeTruthy();
    const path = join(dir, asset); const original = readFileSync(path);
    writeFileSync(path, Buffer.from("corrupted asset"));
    expect(() => new ImportStore({ dir }).getWorkVersion("work-a", versionId)).toThrow();
    writeFileSync(path, original);
  }, 30_000);
});
