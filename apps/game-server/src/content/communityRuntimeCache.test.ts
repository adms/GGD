import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ImportStore } from "../../../content-api/src/importStore";
import { ContentStore } from "@ggd/shared/content/store";
import { communityManifestDigest, verifyCommunityRoomManifest, type CommunityHeroPin } from "@ggd/shared/content/communityRoom";
import { initializeCommunityRuntime, resolveCommunityRoom } from "./communityRuntime";

// Exercise download/cache boundaries without spending this test on compilation;
// real ZIP validation and immutable registry behavior have their own contracts.
const compiled = vi.hoisted(() => vi.fn());
vi.mock("@ggd/shared/content/import/authoringProcessor", () => ({ buildAuthoringProcessor: () => ({ fingerprint: "cache-test" }) }));
vi.mock("@ggd/shared/content/communityRoom", async (load) => ({ ...await load<typeof import("@ggd/shared/content/communityRoom")>(), buildCommunityRoomContent: compiled }));
const dirs: string[] = [];
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); compiled.mockReset(); dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })); });

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "ggd-roster-cache-")); dirs.push(dir);
  const store = new ImportStore({ dir });
  const pins: CommunityHeroPin[] = ["a", "b", "c"].map((letter) => {
    const packageDigest = `sha256:${letter.repeat(64)}`;
    const { record } = store.putWorkVersion({ workId: "cache-hero", projectId: "cache-hero", packageDigest }, new Map([["package.zip", new Uint8Array([80, 75, 3, 4])]]));
    return { workId: record.workId, submissionId: `submission-${letter}`, authorId: "author", authorName: "作者", name: "英雄", packageDigest, snapshotDigest: record.snapshotDigest };
  });
  vi.stubEnv("GGD_BUILD_STAMP", "cache-game"); vi.stubEnv("GGD_CONTENT_API_URL", "http://main.invalid");
  initializeCommunityRuntime(new ContentStore(), "cache-content");
  const fetcher = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    const version = decodeURIComponent(url.pathname.split("/")[6]!);
    return url.pathname.endsWith("/package") ? new Response(new Uint8Array([80, 75, 3, 4])) : Response.json({ schema: "ggd-work-version-detail@1", version: store.getWorkVersion("cache-hero", version) });
  });
  vi.stubGlobal("fetch", fetcher);
  compiled.mockImplementation(({ base, target, pins: heroes }) => {
    const identity = { schema: "ggd-community-room@1" as const, baseContentDigest: base.digest, target, heroes, assets: [] };
    return { context: Object.freeze({ version: heroes[0].packageDigest }), manifest: verifyCommunityRoomManifest({ ...identity, digest: communityManifestDigest(identity) }), assets: new Map(), documents: new ContentStore() };
  });
  return { pins, fetcher };
}

it("downloads once for simultaneous readers, retains one roster, and keeps old/new versions independent", async () => {
  const { pins, fetcher } = fixture();
  const [first, same] = await Promise.all([resolveCommunityRoom([pins[0]]), resolveCommunityRoom([pins[0]])]);
  expect(first).toBe(same); expect(fetcher).toHaveBeenCalledTimes(2); expect(compiled).toHaveBeenCalledTimes(1);
  expect(await resolveCommunityRoom([pins[0]], first.manifest)).toBe(first);
  const next = await resolveCommunityRoom([pins[1]]);
  expect(next.context).not.toBe(first.context); expect(first.manifest.heroes[0]!.packageDigest).toBe(pins[0]!.packageDigest);
  expect(Object.isFrozen(first.context)).toBe(true);
  await resolveCommunityRoom([pins[0]]); // one-entry bound: A was evicted by B
  expect(fetcher).toHaveBeenCalledTimes(6); expect(compiled).toHaveBeenCalledTimes(3);
});

it("checks the complete expected manifest even on warm hits and shared downloads", async () => {
  const { pins, fetcher } = fixture();
  const first = await resolveCommunityRoom([pins[0]]);
  const changed = { ...first.manifest, baseContentDigest: `sha256:${"d".repeat(64)}` };
  const { digest: _, ...identity } = changed;
  changed.digest = communityManifestDigest(identity);
  await expect(resolveCommunityRoom([pins[0]], changed)).rejects.toThrow("固定清單不同");
  await expect(resolveCommunityRoom([pins[0]], { ...first.manifest, digest: `sha256:${"e".repeat(64)}` })).rejects.toThrow("完整性");
  expect(await resolveCommunityRoom([pins[0]], first.manifest)).toBe(first); expect(fetcher).toHaveBeenCalledTimes(2);
  const results = await Promise.allSettled([resolveCommunityRoom([pins[1]]), resolveCommunityRoom([pins[1]], first.manifest)]);
  expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it("never caches failed downloads or accepts a changed snapshot as the same version", async () => {
  const { pins, fetcher } = fixture();
  fetcher.mockResolvedValueOnce(new Response("temporarily unavailable", { status: 503 }));
  await expect(resolveCommunityRoom([pins[0]])).rejects.toThrow("503");
  const first = await resolveCommunityRoom([pins[0]]);
  await expect(resolveCommunityRoom([{ ...pins[0], snapshotDigest: `sha256:${"f".repeat(64)}` }])).rejects.toThrow("快照與核准版本不一致");
  expect(await resolveCommunityRoom([pins[0]])).toBe(first); expect(compiled).toHaveBeenCalledTimes(1);
});

it("reload invalidates the cache and an older pending load cannot overwrite the new base", async () => {
  const { pins, fetcher } = fixture();
  const actual = fetcher.getMockImplementation()!;
  let release!: () => void;
  const gate = new Promise<void>((done) => { release = done; });
  fetcher.mockImplementationOnce(async (input) => { await gate; return actual(input); });
  const oldPending = resolveCommunityRoom([pins[0]]);
  initializeCommunityRuntime(new ContentStore(), "new-content");
  const current = await resolveCommunityRoom([pins[0]]);
  release(); const old = await oldPending;
  expect(old.manifest.target.contentVersion).toBe("cache-content");
  expect(current.manifest.target.contentVersion).toBe("new-content");
  expect(await resolveCommunityRoom([pins[0]])).toBe(current);
  expect(fetcher).toHaveBeenCalledTimes(4);
});
