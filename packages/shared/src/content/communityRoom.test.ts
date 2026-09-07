import { beforeAll, expect, it } from "vitest";
import { heroPackageProject, shippedHeroCatalog } from "../../testkit/heroPackageFixture";
import { buildHeroImportPackage } from "./import/heroPackage";
import { buildRuntimePackageZip, packageZipInput } from "./import/packageZip";
import { ContentStore } from "./store";
import { registerAll } from "./registries";
import { isCollectionName } from "./schema";
import { registerSkeletonContent } from "../sim/content/skeleton";
import { modelUploadFixture } from "./modelUpload/fixtures";
import { prepareUploadedHeroModel } from "./modelUpload/heroModel";
import { Models } from "./registries";
import { Champions } from "../sim/content/registry";
import { withRegistryContext } from "../sim/content/registryContext";
import { contentSha256 } from "./import/jcs";
import { buildCommunityRoomContent, captureCommunityContentBase, verifyCommunityRoomManifest, type CommunityContentBase, type CommunityHeroPin } from "./communityRoom";
import type { ChampionId } from "../ids";

const catalog = shippedHeroCatalog();
const target = { gameRevision: "fixture-revision", contentVersion: "fixture-content", migrationFingerprint: "fixture-migration", processorFingerprint: "fixture-processor" };
const archives = new Map<string, Uint8Array>();
const pins: CommunityHeroPin[] = [];
let base: CommunityContentBase;
beforeAll(async () => {
  const store = new ContentStore();
  for (const [key, document] of catalog.documents) {
    const [collection, id] = key.split("/");
    if (isCollectionName(collection!)) store.add(collection, id!, document);
  }
  registerAll(store); registerSkeletonContent();
  base = captureCommunityContentBase(store);
  for (const id of ["community-room-one", "community-room-two"]) {
    const pkg = buildHeroImportPackage(heroPackageProject(catalog, id), catalog, target);
    const zip = await buildRuntimePackageZip(packageZipInput(pkg, id));
    archives.set(id, zip.bytes);
    pins.push({ workId: id, submissionId: `submission-${id}`, authorId: "author", authorName: "作者", name: "封包驗證英雄", packageDigest: pkg.manifest.packageDigest, snapshotDigest: contentSha256(id) });
  }
}, 30000);

it("loads approved heroes into an immutable match snapshot without mutating the release base", () => {
  const room = buildCommunityRoomContent({ base, target, pins, archives });
  expect(room.manifest.heroes).toHaveLength(2);
  expect(room.manifest.assets.length).toBeGreaterThan(19);
  expect(verifyCommunityRoomManifest(room.manifest)).toEqual(room.manifest);
  withRegistryContext(room.context, () => {
    for (const pin of pins) expect(Champions.get(pin.workId as ChampionId).id).toBe(pin.workId);
  });
  withRegistryContext(base.context, () => {
    for (const pin of pins) expect(Champions.tryGet(pin.workId as ChampionId)).toBeUndefined();
  });
  const client = buildCommunityRoomContent({ base, target, pins: [...pins].reverse(), archives, expected: room.manifest });
  expect(client.manifest.digest).toBe(room.manifest.digest);
});

it("rejects stale dependencies, stale engines, duplicate works, wrong approval hashes, and missing archives", () => {
  const build = (overrides: Partial<Parameters<typeof buildCommunityRoomContent>[0]>) => buildCommunityRoomContent({ base, target, pins, archives, ...overrides });
  expect(() => build({ target: { ...target, gameRevision: "next-build" } })).toThrow("不相容");
  expect(() => build({ base: { ...base, documents: { ...base.documents, "config/damage-tiers": contentSha256("changed") } } })).toThrow("固定依賴");
  expect(() => build({ pins: [pins[0]!, pins[0]!] })).toThrow("兩個版本");
  expect(() => build({ pins: [{ ...pins[0]!, packageDigest: contentSha256("different") }] })).toThrow("固定版本");
  expect(() => build({ archives: new Map() })).toThrow("尚未取得");
});

it("rejects a corrupted archive and a forged room manifest before installing content", () => {
  const corrupt = archives.get(pins[0]!.workId)!.slice(); corrupt[200] = corrupt[200]! ^ 1;
  expect(() => buildCommunityRoomContent({ base, target, pins: [pins[0]!], archives: new Map([[pins[0]!.workId, corrupt]]) })).toThrow();
  const room = buildCommunityRoomContent({ base, target, pins, archives });
  expect(() => verifyCommunityRoomManifest({ ...room.manifest, assets: [] })).toThrow("完整性");
  expect(() => buildCommunityRoomContent({ base, target, pins: [pins[0]!], archives, expected: room.manifest })).toThrow("固定清單");
});

it("loads package-local uploaded model bindings and shares identical models across approved heroes", async () => {
 const prepared = await prepareUploadedHeroModel(modelUploadFixture().bytes, {idle:0,run:0,attack:0,cast:0,hurt:0,death:0});
 const modelCatalog = { ...catalog, documents: new Map(catalog.documents), readAsset: (path: string) => path === prepared.document.glbPath ? prepared.bytes : catalog.readAsset(path) };
 modelCatalog.documents.set(`models/${prepared.document.id}`, prepared.document);
 const modelPins: CommunityHeroPin[] = [], modelArchives = new Map<string, Uint8Array>();
 for (const id of ["upload-one", "upload-two"]) {
  const project = heroPackageProject(catalog,id);
  project.presentation.uploadedModel = prepared.model;
  project.presentation.modelKey = prepared.document.id;
  const pkg = buildHeroImportPackage(project,{...modelCatalog,validatedUploadedModel:{projectId:id,model:prepared.model}},target);
  const zip = await buildRuntimePackageZip(packageZipInput(pkg,id));
  modelArchives.set(id,zip.bytes);
  modelPins.push({...pins[0]!,workId:id,submissionId:`submission-${id}`,packageDigest:pkg.manifest.packageDigest,snapshotDigest:contentSha256(id)});
 }
 const room = buildCommunityRoomContent({base,target,pins:modelPins,archives:modelArchives});
 withRegistryContext(room.context,()=>{
  expect(Models.get(prepared.document.id).clipMap).toEqual(prepared.model.clipMap);
  for(const pin of modelPins) expect(Champions.get(pin.workId as ChampionId).modelKey).toBe(prepared.document.id);
 });
 expect(room.manifest.assets.filter(a=>a.path===prepared.document.glbPath)).toHaveLength(1);
 expect(()=>buildCommunityRoomContent({base:{...base,documents:{...base.documents,[`models/${prepared.document.id}`]:contentSha256("different")}},target,pins:modelPins,archives:modelArchives})).toThrow("既有內容衝突");
});
