import { afterEach, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildHeroImportServer } from "./heroImportServer";
import { HERO_IMPORT_PREFIX as prefix, heroImportHeaders } from "@ggd/shared/content/node/heroImportAuth";
import { heroPackageProject, shippedHeroCatalog } from "../../../packages/shared/testkit/heroPackageFixture";
import { buildHeroSourcePackage } from "@ggd/shared/content/import/heroSourcePackage";
import { buildRuntimePackageZip, packageZipInput } from "@ggd/shared/content/import/packageZip";
import { FsContentSource } from "@ggd/shared/content/node/FsContentSource";
import { OverlayContentSource, type OverlayBundle } from "@ggd/shared/content/overlay";
import { ContentLoader } from "@ggd/shared/content/loader";
import { registerAll } from "@ggd/shared/content/registries";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { captureCommunityContentBase, buildCommunityRoomContent } from "@ggd/shared/content/communityRoom";
import { contentSha256 } from "@ggd/shared/content/import/jcs";
import { readHeroContentSnapshot } from "./heroContentSnapshot";

const repo = resolve(import.meta.dirname, "../../..");
const contentDir = join(repo, "content");
const secret = "private-hero-overlay-fixture-20260906";
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

it("publishes against the captured Platform overlay and loads the exact package into the game's merged room", async () => {
  const ui = JSON.parse(readFileSync(join(contentDir, "config/ui-cues.json"), "utf8"));
  ui.playerContent = { ...ui.playerContent, submit: true, discover: true };
  let overlay: OverlayBundle = { generation: 1, docs: { "config/ui-cues": ui }, deleted: {} };
  let unavailable = false;
  let reads = 0;
  const dir = mkdtempSync(join(tmpdir(), "ggd-overlay-import-")); dirs.push(dir);
  const app = buildHeroImportServer({ repoRoot: repo, contentDir, importDir: dir, secret, gameVersion: "overlay-fixture", readOverlay: async () => { reads++; if (unavailable) throw new Error("Platform offline"); return structuredClone(overlay); } });
  const get = (path: string) => app.inject({ method: "GET", url: prefix + path, headers: heroImportHeaders(secret, "GET", prefix + path) });
  const post = (path: string, bytes: Uint8Array) => app.inject({ method: "POST", url: prefix + path, headers: { ...heroImportHeaders(secret, "POST", prefix + path, Uint8Array.from(bytes)), "content-type": "application/zip" }, payload: Buffer.from(bytes) });
  try {
    await app.ready();
    const profileResponse = await get("/active/target-profile");
    expect(profileResponse.statusCode, profileResponse.body).toBe(200);
    const profile = profileResponse.json();
    const target = { gameRevision: profile.gameVersion, contentVersion: profile.base.contentVersion, migrationFingerprint: profile.migrationFingerprint, processorFingerprint: profile.authoringProcessor.fingerprint };
    const loaded = await new ContentLoader(new OverlayContentSource(new FsContentSource(contentDir), overlay)).load({ policy: "fail-closed" });
    expect(target.contentVersion).toBe(loaded.manifest.contentVersion);
    expect(target.contentVersion).not.toBe((await new FsContentSource(contentDir).readManifest()).contentVersion);
    const project = heroPackageProject(shippedHeroCatalog(), "overlay-hero");
    const source = buildHeroSourcePackage(project, [], target);
    const sourceZip = await buildRuntimePackageZip(packageZipInput(source, project.projectId));
    const beforeBuild = reads;
    const built = await post("/hero-package", sourceZip.bytes);
    expect(built.statusCode, built.statusCode === 200 ? "" : built.body).toBe(200);
    expect(reads - beforeBuild).toBe(1);
    const inspected = await post("/inspect-hero-package", built.rawPayload);
    expect(inspected.statusCode, inspected.body).toBe(200);
    registerAll(loaded.store); registerSkeletonContent();
    const base = captureCommunityContentBase(loaded.store);
    const pin = { workId: project.projectId, submissionId: "reviewed", authorId: "author", authorName: "作者", name: project.brief.name, packageDigest: String(built.headers["x-ggd-package-digest"]), snapshotDigest: contentSha256("reviewed") };
    const room = buildCommunityRoomContent({ base, target, pins: [pin], archives: new Map([[pin.workId, built.rawPayload]]) });
    expect(room.manifest.heroes).toHaveLength(1);

    overlay = { generation: 2, docs: { "config/ui-cues": { ...ui, playerContent: { ...ui.playerContent, discover: false } } }, deleted: {} };
    expect((await get("/active/target-profile")).json().base.contentVersion).not.toBe(target.contentVersion);
    expect((await post("/inspect-hero-package", built.rawPayload)).statusCode).toBe(422);
    expect((await post("/hero-package", sourceZip.bytes)).statusCode).toBe(422);
    // An unavailable Platform must not silently fall back to the shipped tree.
    unavailable = true;
    expect((await get("/active/target-profile")).statusCode).toBe(503);
    expect((await post("/hero-package", sourceZip.bytes)).statusCode).toBe(503);
    expect((await post("/inspect-hero-package", built.rawPayload)).statusCode).toBe(503);
    expect(room.manifest.heroes[0]!.packageDigest).toBe(pin.packageDigest);
  } finally { await app.close(); }
}, 60_000);

it("rejects malformed overlay input instead of issuing a shipped target profile", async () => {
  await expect(readHeroContentSnapshot(contentDir, async () => ({ generation: -1, docs: {}, deleted: {} }))).rejects.toMatchObject({ statusCode: 503 });
});
