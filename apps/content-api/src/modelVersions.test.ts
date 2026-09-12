import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./server";
import { writeDocAtomic, rebuildAllIndexes } from "@ggd/shared/content/node";
import { modelUploadFixture } from "@ggd/shared/content/modelUpload/fixtures";
import { encodeUploadGlb } from "@ggd/shared/content/modelUpload/glb";
import { zChampionDoc } from "@ggd/shared/content/schema/champion";
import { contentSha256 } from "@ggd/shared/content/import/jcs";
import type { ChampionModelVersionState, ModelVersionCommand } from "@ggd/shared/content/schema/championModelVersions";

const repo = resolve(__dirname, "../../..");
const heroId = "test-model-hero";
const route = `/content-api/champions/${heroId}/model-versions`;
const source = { kind: "alternate", character: "Archer", work: "Fate/stay night UBW", library: "驗收素材", reference: "角色其他形態，採用替代造型" } as const;
let root: string;
let app: FastifyInstance;
let bytes: Uint8Array;
const model = (id: string, glbPath: string, scale = 1) => ({
  id, schema: "model@1", glbPath, scale, collisionRadius: 0.6,
  clipMap: { idle: "Motion", run: "Motion", attack: "Cast", cast: "Cast", hurt: "Motion", death: "Cast" },
  attachPoints: { hand: { x: 1, y: 2, z: 3 } }, heroBody: true,
});
const read = (collection: string, id: string) => JSON.parse(readFileSync(join(root, collection, `${id}.json`), "utf8"));
const putAsset = (path: string, value: Uint8Array) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); };
const state = async () => (await app.inject({ url: route })).json<ChampionModelVersionState>();
const update = (command: ModelVersionCommand) => app.inject({ method: "POST", url: route, payload: command });
const register = async () => update({ action: "register", expectedHash: (await state()).expectedHash, sourceModelKey: "candidate", label: "Archer 動作版", source });

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "ggd-model-versions-"));
  const fixture = modelUploadFixture();
  fixture.json.animations![1]!.name = "Cast";
  bytes = encodeUploadGlb(fixture.json, fixture.bin);
  putAsset("assets/models/imported/old.glb", bytes);
  putAsset("assets/models/new.glb", bytes);
  writeDocAtomic(root, "models", model("old-body", "assets/models/imported/old.glb", 0.7));
  const candidate = { ...model("candidate", "assets/models/new.glb", 1.2), yawOffsetDeg: 180 };
  writeDocAtomic(root, "models", candidate);
  const champion = JSON.parse(readFileSync(join(repo, "content/champions/sela.json"), "utf8"));
  writeDocAtomic(root, "champions", { ...champion, id: heroId, modelKey: "old-body" });
  rebuildAllIndexes(root);
  app = buildServer({ contentDir: root, repoRoot: repo, backupDir: join(root, ".backups") });
  await app.ready();
});
afterEach(async () => { await app.close(); rmSync(root, { recursive: true, force: true }); });

describe("retained hero model versions", () => {
  it("retains paid delivery aliases of identical bytes as independent selectable versions", async () => {
    const add = async (reference: string, label: string) => update({ action: "register", expectedHash: (await state()).expectedHash,
      sourceModelKey: "candidate", label, source: { ...source, library: "論壇付費", reference } });
    const first = await add("forum:attachment-a:v1", "付費來源 A v1");
    expect(first.statusCode, first.body).toBe(200);
    const second = await add("forum:attachment-b:v2", "付費來源 B v2");
    expect(second.statusCode, second.body).toBe(200);
    const versions = second.json<ChampionModelVersionState>().versions;
    expect(versions).toHaveLength(3);
    expect(versions[1]!.binarySha256).toBe(versions[2]!.binarySha256);
    expect(versions[1]!.modelKey).not.toBe(versions[2]!.modelKey);
    expect(versions.slice(1).map((v) => v.source.reference)).toEqual(["forum:attachment-a:v1", "forum:attachment-b:v2"]);
    for (const version of versions.slice(1)) {
      const selected = await update({ action: "activate", expectedHash: (await state()).expectedHash, modelKey: version.modelKey });
      expect(selected.statusCode, selected.body).toBe(200);
      expect(selected.json().activeModelKey).toBe(version.modelKey);
      expect(selected.json().versions).toEqual(versions);
    }
    expect((await add("forum:attachment-b:v2", "付費來源 B v2")).statusCode).toBe(409);
  });

  it("retains unapproved high-tier proxies for manual selection while automatic mode uses approved candidates", async () => {
    const approved = (await register()).json<ChampionModelVersionState>();
    const response = await update({ action: "register", expectedHash: approved.expectedHash, sourceModelKey: "candidate", label: "保留的相似模型",
      source: { ...source, kind: "style-proxy", tier: "300heroes" } });
    expect(response.statusCode, response.body).toBe(200);
    const saved = response.json<ChampionModelVersionState>();
    const proxy = saved.versions.at(-1)!;
    expect(proxy.automaticEligible).toBe(false);
    expect(saved.activeModelKey).toBe(approved.activeModelKey);
    expect(saved.preferredModelKey).toBe(approved.activeModelKey);
    const manual = await update({ action: "activate", expectedHash: saved.expectedHash, modelKey: proxy.modelKey });
    expect(manual.json().activeModelKey).toBe(proxy.modelKey);
    const automatic = await update({ action: "automatic", expectedHash: manual.json().expectedHash });
    expect(automatic.json().activeModelKey).toBe(approved.activeModelKey);
    expect(automatic.json().versions).toHaveLength(3);
    const ownerApproved = await update({ action: "register", expectedHash: automatic.json().expectedHash, sourceModelKey: "candidate", label: "Owner 核准加工副本",
      source: { ...source, kind: "style-proxy", tier: "300heroes" }, automaticEligible: true });
    expect(ownerApproved.statusCode, ownerApproved.body).toBe(200);
    expect(ownerApproved.json().activeModelKey).toBe(ownerApproved.json().versions.at(-1).modelKey);
  });

  it("defaults to the new frozen body, retains old bytes/bindings, and rolls both ways after the import source is deleted", async () => {
    const before = read("champions", heroId);
    const beforeBytes = readFileSync(join(root, "models/old-body.json"));
    const registered = await register();
    expect(registered.statusCode, registered.body).toBe(200);
    const saved = registered.json<ChampionModelVersionState>();
    expect(saved.versions).toHaveLength(2);
    const [old, next] = saved.versions;
    expect(saved.activeModelKey).toBe(next!.modelKey);
    expect(saved.expectedHash).not.toBe(contentSha256(before));
    const after = read("champions", heroId);
    const { modelKey: _key, modelVersions: _versions, modelSelectionMode: _mode, ...unchanged } = after;
    const { modelKey: _beforeKey, ...original } = before;
    expect(unchanged).toEqual(original);
    expect(readFileSync(join(root, "models/old-body.json"))).toEqual(beforeBytes);
    expect(read("models", old!.modelKey)).toMatchObject({ scale: 0.7, yawOffsetDeg: 90, clipMap: model("", "").clipMap, bodyVersion: { legacyAppearance: true, sourceModelKey: "old-body" } });
    expect(read("models", next!.modelKey)).toMatchObject({ scale: 1.2, yawOffsetDeg: 180, bodyVersion: { legacyAppearance: false } });
    expect(readFileSync(join(root, read("models", old!.modelKey).glbPath))).toEqual(Buffer.from(bytes));
    expect(readFileSync(join(root, read("models", next!.modelKey).glbPath))).toEqual(Buffer.from(bytes));
    expect(existsSync(join(root, "bundle.json"))).toBe(false);
    rmSync(join(root, "assets/models/new.glb"));
    expect((await app.inject({ method: "DELETE", url: "/content-api/models/candidate" })).statusCode).toBe(200);
    for (const version of [old!, next!]) {
      const response = await update({ action: "activate", modelKey: version.modelKey, expectedHash: (await state()).expectedHash });
      expect(response.statusCode, response.body).toBe(200);
      expect(read("champions", heroId).modelKey).toBe(version.modelKey);
      expect(response.json().versions).toEqual(saved.versions);
    }
  });

  it("prioritizes 300 > MBA > original > W3X and preserves manual choices across imports", async () => {
    const add = async (id: string, tier: "300heroes" | "mba" | "original" | "w3x") => {
      writeDocAtomic(root, "models", model(id, "assets/models/new.glb"));
      const response = await update({ action: "register", expectedHash: (await state()).expectedHash, sourceModelKey: id, label: id, source: { ...source, tier } });
      expect(response.statusCode, response.body).toBe(200);
      return response.json<ChampionModelVersionState>();
    };
    const borrowed = await add("borrowed", "w3x");
    expect(borrowed.activeModelKey).toBe(borrowed.versions[0]!.modelKey);
    const mba = await add("mba", "mba");
    expect(mba.activeModelKey).toBe(mba.versions.at(-1)!.modelKey);
    const high = await add("300", "300heroes");
    expect(high.activeModelKey).toBe(high.versions.at(-1)!.modelKey);
    expect((await add("lower", "mba")).activeModelKey).toBe(high.activeModelKey);
    const manual = await update({ action: "activate", expectedHash: (await state()).expectedHash, modelKey: borrowed.versions[0]!.modelKey });
    expect(manual.json().selectionMode).toBe("manual");
    const newer = await add("300-new", "300heroes");
    expect(newer.activeModelKey).toBe(borrowed.versions[0]!.modelKey);
    expect(newer.preferredModelKey).toBe(newer.versions.at(-1)!.modelKey);
    const restored = await update({ action: "automatic", expectedHash: newer.expectedHash });
    expect(restored.json()).toMatchObject({ selectionMode: "automatic", activeModelKey: newer.preferredModelKey });
    const doc = read("champions", heroId);
    expect((await app.inject({ method: "PUT", url: `/content-api/champions/${heroId}`, payload: { ...doc, modelSelectionMode: "manual" } })).statusCode).toBe(409);
  });

  it("rejects stale and simultaneous selections without losing a version", async () => {
    const expectedHash = (await state()).expectedHash;
    const command = { action: "register", expectedHash, sourceModelKey: "candidate", label: "新版", source } as const;
    const results = await Promise.all([update(command), update(command)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const current = await state();
    expect(current.versions).toHaveLength(2);
    const stale = await update({ action: "activate", modelKey: current.versions[0]!.modelKey, expectedHash });
    expect(stale.statusCode).toBe(409);
    expect((await state()).activeModelKey).toBe(current.activeModelKey);
  });

  it("blocks direct replacement, history removal, frozen-model edits/deletes, and pre-version backup restore", async () => {
    const champion = read("champions", heroId);
    expect((await app.inject({ method: "PUT", url: `/content-api/champions/${heroId}`, payload: { ...champion, modelKey: "candidate" } })).statusCode).toBe(409);
    const saved = (await register()).json();
    const key = saved.activeModelKey;
    const frozen = read("models", key);
    expect((await app.inject({ method: "PUT", url: `/content-api/models/${key}`, payload: { ...frozen, scale: 7 } })).statusCode).toBe(409);
    expect((await app.inject({ method: "DELETE", url: `/content-api/models/${key}` })).statusCode).toBe(409);
    expect((await app.inject({ method: "PUT", url: `/content-api/champions/${heroId}`, payload: champion })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: `/content-api/champions/${heroId}/restore`, payload: { file: saved.backup } })).statusCode).toBe(409);
    const valid = read("champions", heroId);
    expect((await app.inject({ method: "PUT", url: `/content-api/champions/${heroId}`, payload: { ...valid, name: "衛宮士郎" } })).statusCode).toBe(200);
    expect(read("models", key)).toEqual(frozen);
  });

  it("rejects incomplete bindings and missing original files before publishing anything", async () => {
    const initial = readFileSync(join(root, "champions", `${heroId}.json`));
    const invalid = { ...model("candidate", "assets/models/new.glb"), clipMap: { ...model("", "").clipMap, cast: "absent" } };
    writeDocAtomic(root, "models", invalid);
    const bad = await register();
    expect(bad.statusCode, bad.body).toBe(422);
    expect(readFileSync(join(root, "champions", `${heroId}.json`))).toEqual(initial);
    writeDocAtomic(root, "models", model("candidate", "assets/models/new.glb"));
    rmSync(join(root, "assets/models/imported/old.glb"));
    expect((await register()).statusCode).toBe(422);
    expect((await state()).versions).toEqual([]);
    expect(existsSync(join(root, "assets/models/versions"))).toBe(false);
  });

  it("detects damaged retained bytes and refuses to activate them", async () => {
    expect((await register()).statusCode).toBe(200);
    const current = await state();
    const old = current.versions[0]!;
    const file = join(root, read("models", old.modelKey).glbPath);
    const changed = Uint8Array.from(bytes);
    changed[changed.length - 1] = changed[changed.length - 1]! ^ 1;
    writeFileSync(file, changed);
    const response = await update({ action: "activate", modelKey: old.modelKey, expectedHash: current.expectedHash });
    expect(response.statusCode, response.body).toBe(409);
    expect((await state()).activeModelKey).toBe(current.activeModelKey);
  });

  it("shared loading rejects dangling selection and duplicate version keys", async () => {
    await register();
    const champion = read("champions", heroId);
    expect(zChampionDoc.safeParse({ ...champion, modelKey: "old-body" }).success).toBe(false);
    expect(zChampionDoc.safeParse({ ...champion, modelVersions: [...champion.modelVersions, champion.modelVersions[0]] }).success).toBe(false);
  });

  it("rejects a model document linked outside the content root", async () => {
    const outside = mkdtempSync(join(tmpdir(), "ggd-version-external-"));
    try {
      const original = read("models", "candidate");
      writeFileSync(join(outside, "candidate.json"), JSON.stringify(original));
      rmSync(join(root, "models/candidate.json"));
      symlinkSync(join(outside, "candidate.json"), join(root, "models/candidate.json"));
      const response = await register();
      expect(response.statusCode, response.body).toBe(422);
      expect((await state()).versions).toEqual([]);
      expect(read("champions", heroId).modelKey).toBe("old-body");
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });
});
