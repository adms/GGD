import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ImportStore } from "../../../content-api/src/importStore";
import { readPublishedHeroPackage } from "./communityRuntime";

const directories: string[] = [];
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })); });

it("accepts Main's actual durable version record and rejects a changed snapshot before downloading bytes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ggd-game-work-version-")); directories.push(dir);
  const store = new ImportStore({ dir, now: () => new Date("2026-09-06T00:00:00Z") });
  const packageDigest = `sha256:${"a".repeat(64)}`;
  const archive = new Uint8Array([80, 75, 3, 4]);
  const { record } = store.putWorkVersion({ workId: "hero-proof", projectId: "hero-proof", packageDigest }, new Map([["package.zip", archive]]));
  const pin = { workId: record.workId, submissionId: "submission-proof", authorId: "author", authorName: "作者", name: "測試英雄", packageDigest, snapshotDigest: record.snapshotDigest };
  vi.stubEnv("GGD_CONTENT_API_URL", "http://main.invalid");
  const fetcher = vi.fn(async (url: string | URL) => String(url).endsWith("/package") ? new Response(archive) : Response.json({ schema: "ggd-work-version-detail@1", version: store.getWorkVersion(record.workId, record.versionId) }));
  vi.stubGlobal("fetch", fetcher);
  expect(await readPublishedHeroPackage(pin)).toEqual(archive);
  expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockClear();
  await expect(readPublishedHeroPackage({ ...pin, snapshotDigest: `sha256:${"b".repeat(64)}` })).rejects.toThrow("固定英雄快照與核准版本不一致");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
