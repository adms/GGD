import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { rebuildAllIndexes, writeDocAtomic } from "@ggd/shared/content/node";
import { buildServer } from "./server";

let root: string;
let app: FastifyInstance | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ggd-remote-asset-"));
  const item = {
    id: "test-item",
    schema: "item@1",
    name: "Test",
    cost: 1,
    tier: 1,
    modifiers: [],
    tags: [],
  };
  writeDocAtomic(root, "items", item);
  rebuildAllIndexes(root);
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  rmSync(root, { recursive: true, force: true });
});

describe("desktop remote asset bridge", () => {
  it("downloads a missing preview asset once, then serves the local cache", async () => {
    const bytes = Buffer.from([0x67, 0x6c, 0x54, 0x46]);
    const fetchMock = vi.fn(async () => new Response(bytes, {
      status: 200,
      headers: { "content-type": "model/gltf-binary", "content-length": String(bytes.length) },
    }));
    const cache = join(root, ".remote-assets");
    app = buildServer({
      contentDir: root,
      remoteAssets: {
        contentBaseUrl: "https://ggd.adms.ai/content/",
        cacheDir: cache,
        maxAssetBytes: 1024,
        timeoutMs: 1000,
        fetchImpl: fetchMock as typeof fetch,
      },
    });
    await app.ready();

    const first = await app.inject({ url: "/content-api/assets/models/test.glb" });
    expect(first.statusCode).toBe(200);
    expect(first.rawPayload).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(existsSync(join(cache, "models", "test.glb"))).toBe(true);

    const second = await app.inject({ url: "/content-api/assets/models/test.glb" });
    expect(second.statusCode).toBe(200);
    expect(second.rawPayload).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops a chunked response at the configured byte budget", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array(2048), { status: 200 }));
    app = buildServer({
      contentDir: root,
      remoteAssets: {
        contentBaseUrl: "https://ggd.adms.ai/content/",
        cacheDir: join(root, ".remote-assets"),
        maxAssetBytes: 1024,
        timeoutMs: 1000,
        fetchImpl: fetchMock as typeof fetch,
      },
    });
    await app.ready();

    const response = await app.inject({ url: "/content-api/assets/models/too-large.glb" });
    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ error: expect.stringContaining("1024") });
  });

  it("never lets a remote URL escape the asset namespace", async () => {
    const fetchMock = vi.fn();
    app = buildServer({
      contentDir: root,
      remoteAssets: {
        contentBaseUrl: "https://ggd.adms.ai/content/",
        cacheDir: join(root, ".remote-assets"),
        maxAssetBytes: 1024,
        timeoutMs: 1000,
        fetchImpl: fetchMock as typeof fetch,
      },
    });
    await app.ready();

    const response = await app.inject({ url: "/content-api/assets/../manifest.json" });
    expect([400, 404]).toContain(response.statusCode);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
