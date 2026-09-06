import { beforeAll, beforeEach, afterEach, expect, it, vi } from "vitest";
import { heroPackageProject, shippedHeroCatalog } from "../../../../packages/shared/testkit/heroPackageFixture";
import { buildHeroImportPackage } from "@ggd/shared/content/import/heroPackage";
import { buildRuntimePackageZip, packageZipInput } from "@ggd/shared/content/import/packageZip";
import { buildCommunityRoomContent, captureCommunityContentBase, type CommunityRoomManifest } from "@ggd/shared/content/communityRoom";
import { ContentStore } from "@ggd/shared/content/store";
import { registerAll } from "@ggd/shared/content/registries";
import { isCollectionName } from "@ggd/shared/content/schema/index";
import { contentSha256 } from "@ggd/shared/content/import/jcs";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import { api } from "../ui/platform/api";
import { captureClientCommunityBase, prepareCommunityMatch, prepareReplayCommunity, activeCommunityManifest, assertCommunityState, setCommunityLoading } from "./communityMatch";
import { Configs } from "@ggd/shared/content";
import type { ConfigVfxFamiliesDoc } from "@ggd/shared/content";
import { setFamilyTuning } from "../render/vfx/w3xAbilityArt";
import { withContentVersion } from "./assetVersion";

vi.mock("../ui/platform/api", () => ({ api: { request: vi.fn(), binaryResponse: vi.fn() } }));
vi.mock("./communityIdentity", () => ({ clientCommunityIdentity: () => ({ gameRevision: "fixture", migrationFingerprint: "fixture", processorFingerprint: "fixture" }) }));

const target = { gameRevision: "fixture", migrationFingerprint: "fixture", processorFingerprint: "fixture", contentVersion: "fixture" };
let manifest: CommunityRoomManifest;
let archive: Uint8Array;
let lease: Awaited<ReturnType<typeof prepareCommunityMatch>> | null = null;
beforeAll(async () => {
  const catalog = shippedHeroCatalog(); const store = new ContentStore();
  for (const [key, document] of catalog.documents) {
    const [collection, id] = key.split("/");
    if (isCollectionName(collection!)) store.add(collection, id!, document);
  }
  registerAll(store); captureClientCommunityBase(store, target.contentVersion);
  const project = heroPackageProject(catalog, "client-community-proof");
  const pkg = buildHeroImportPackage(project, catalog, target);
  archive = (await buildRuntimePackageZip(packageZipInput(pkg, project.projectId))).bytes;
  manifest = buildCommunityRoomContent({ base: captureCommunityContentBase(store), target, pins: [{ workId: project.projectId, name: project.brief.name, authorId: "author", authorName: "作者", submissionId: "submission", packageDigest: pkg.manifest.packageDigest, snapshotDigest: contentSha256("snapshot") }], archives: new Map([[project.projectId, archive]]) }).manifest;
}, 30000);
beforeEach(() => {
  vi.mocked(api.request).mockReset().mockResolvedValue(manifest);
  vi.mocked(api.binaryResponse).mockReset().mockImplementation(async () => new Response(Uint8Array.from(archive), { headers: { "content-type": "application/zip" } }));
});
afterEach(() => { lease?.dispose(); lease = null; setCommunityLoading(""); });

it("downloads and verifies the real package before readiness, then releases its isolated registries and asset URLs", async () => {
  lease = await prepareCommunityMatch("match", manifest, () => true);
  expect(activeCommunityManifest()).toBeNull();
  expect(vi.mocked(api.request).mock.calls.at(-1)).toEqual(["/community-matches/match/ready", expect.objectContaining({ body: { digest: manifest.digest } })]);
  lease.activate();
  expect(activeCommunityManifest()?.digest).toBe(manifest.digest);
  expect(() => assertCommunityState(JSON.stringify(manifest))).not.toThrow();
  expect(() => assertCommunityState("")).toThrow("版本不同");
  expect(() => setFamilyTuning(Configs.tryGet("vfx-families") as ConfigVfxFamiliesDoc)).not.toThrow();
  expect(Champions.get("client-community-proof" as ChampionId).name).toBe("封包驗證英雄");
  const path = manifest.assets[0]!.path;
  expect(withContentVersion(`/content/${path}`)).toMatch(/^blob:/);
  lease.dispose(); lease = null;
  expect(activeCommunityManifest()).toBeNull();
  expect(Champions.tryGet("client-community-proof" as ChampionId)).toBeUndefined();
  expect(withContentVersion(`/content/${path}`)).not.toMatch(/^blob:/);
});

it("loads the recorded version with its replay ticket without acknowledging a live room", async () => {
  vi.mocked(api.request).mockResolvedValue({ communityContent: manifest });
  lease = await prepareReplayCommunity("recorded-game", "one-recording-ticket", () => true);
  expect(vi.mocked(api.binaryResponse).mock.calls[0]).toEqual(["/replay-content/recorded-game/heroes/client-community-proof", expect.objectContaining({ auth: false, body: { ticket: "one-recording-ticket" } })]);
  expect(vi.mocked(api.request).mock.calls.some(([path]) => path.includes("community-matches"))).toBe(false);
  lease!.activate(); expect(activeCommunityManifest()?.digest).toBe(manifest.digest);
});

it("does not acknowledge or activate corrupt downloads", async () => {
  const bytes = archive.slice(); bytes[200] = bytes[200]! ^ 1;
  vi.mocked(api.binaryResponse).mockResolvedValue(new Response(bytes));
  await expect(prepareCommunityMatch("match", manifest, () => true)).rejects.toThrow();
  expect(vi.mocked(api.request).mock.calls.some(([path]) => path.endsWith("/ready"))).toBe(false);
  expect(activeCommunityManifest()).toBeNull();
});

it("an account change or cancelled launch cannot acknowledge or install old content", async () => {
  let current = true;
  vi.mocked(api.binaryResponse).mockImplementation(async () => { current = false; return new Response(Uint8Array.from(archive)); });
  await expect(prepareCommunityMatch("match", manifest, () => current)).rejects.toThrow("取消");
  expect(vi.mocked(api.request).mock.calls.some(([path]) => path.endsWith("/ready"))).toBe(false);
  expect(activeCommunityManifest()).toBeNull();
});
