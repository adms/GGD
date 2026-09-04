import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { rebuildAllIndexes, writeDocAtomic } from "@ggd/shared/content/node";
import { buildServer } from "./server";

let root: string;
let app: FastifyInstance | undefined;

function assetManifest(
  path: string,
  bytes: Uint8Array,
  expectedBytes = bytes.byteLength,
) {
  return {
    schema: "ggd-assets-manifest@1" as const,
    entries: [{
      path: `assets/${path}`,
      bytes: expectedBytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      contentType: path.endsWith(".glb") ? "model/gltf-binary" : "application/octet-stream",
    }],
  };
}

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
        assetManifest: assetManifest("models/test.glb", bytes),
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
    const bytes = new Uint8Array(2048);
    const fetchMock = vi.fn(async () => new Response(bytes, { status: 200 }));
    app = buildServer({
      contentDir: root,
      remoteAssets: {
        contentBaseUrl: "https://ggd.adms.ai/content/",
        cacheDir: join(root, ".remote-assets"),
        maxAssetBytes: 1024,
        timeoutMs: 1000,
        assetManifest: assetManifest("models/too-large.glb", bytes, 1024),
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
        assetManifest: { schema: "ggd-assets-manifest@1", entries: [] },
        fetchImpl: fetchMock as typeof fetch,
      },
    });
    await app.ready();

    const response = await app.inject({ url: "/content-api/assets/../manifest.json" });
    expect([400, 404]).toContain(response.statusCode);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed for an asset absent from the pinned manifest", async () => {
    const fetchMock = vi.fn();
    app = buildServer({
      contentDir: root,
      remoteAssets: {
        contentBaseUrl: "https://ggd.adms.ai/content/",
        cacheDir: join(root, ".remote-assets"),
        maxAssetBytes: 1024,
        timeoutMs: 1000,
        assetManifest: { schema: "ggd-assets-manifest@1", entries: [] },
        fetchImpl: fetchMock as typeof fetch,
      },
    });
    await app.ready();

    const response = await app.inject({ url: "/content-api/assets/models/unlisted.glb" });
    expect(response.statusCode).toBe(412);
    expect(response.json()).toMatchObject({ error: expect.stringContaining("pinned manifest") });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects remote bytes whose digest differs and never caches them", async () => {
    const expected = Buffer.from("expected");
    const tampered = Buffer.from("tampered");
    const cache = join(root, ".remote-assets");
    const fetchMock = vi.fn(async () => new Response(tampered, {
      status: 200,
      headers: { "content-length": String(tampered.byteLength) },
    }));
    app = buildServer({
      contentDir: root,
      remoteAssets: {
        contentBaseUrl: "https://ggd.adms.ai/content/",
        cacheDir: cache,
        maxAssetBytes: 1024,
        timeoutMs: 1000,
        assetManifest: assetManifest("models/tampered.glb", expected),
        fetchImpl: fetchMock as typeof fetch,
      },
    });
    await app.ready();

    const response = await app.inject({ url: "/content-api/assets/models/tampered.glb" });
    expect(response.statusCode).toBe(502);
    expect(existsSync(join(cache, "models", "tampered.glb"))).toBe(false);
  });

  it("discards a corrupt old cache and refetches the pinned bytes", async () => {
    const bytes = Buffer.from("fresh-glb");
    const cache = join(root, ".remote-assets");
    const cached = join(cache, "models", "fresh.glb");
    mkdirSync(join(cache, "models"), { recursive: true });
    writeFileSync(cached, "wrong");
    const fetchMock = vi.fn(async () => new Response(bytes, {
      status: 200,
      headers: { "content-length": String(bytes.byteLength) },
    }));
    app = buildServer({
      contentDir: root,
      remoteAssets: {
        contentBaseUrl: "https://ggd.adms.ai/content/",
        cacheDir: cache,
        maxAssetBytes: 1024,
        timeoutMs: 1000,
        assetManifest: assetManifest("models/fresh.glb", bytes),
        fetchImpl: fetchMock as typeof fetch,
      },
    });
    await app.ready();

    const response = await app.inject({ url: "/content-api/assets/models/fresh.glb" });
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload).toEqual(bytes);
    expect(readFileSync(cached)).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
