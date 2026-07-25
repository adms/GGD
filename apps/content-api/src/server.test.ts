/**
 * content-08 (content-api-validate-write): PUT validates with the shared Zod
 * schemas BEFORE the atomic write; invalid docs 422 with field errors and
 * never touch disk. content-09 (content-api-path-traversal): ids/collections
 * that try to escape content/ are rejected. Plus CRUD/manifest/SSE/prod-refusal
 * items from docs/todo/content-api.md.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { cover } from "@ggd/shared/testkit/cover";
import { hashDoc } from "@ggd/shared/content";
import { rebuildAllIndexes, writeDocAtomic } from "@ggd/shared/content/node";
import { buildServer } from "./server";
import { SseHub } from "./sse";

const ITEM = {
  id: "ember-rod",
  schema: "item@1",
  name: "Ember Rod",
  cost: 900,
  tier: 2,
  modifiers: [{ stat: "ap", op: "flat", value: 45 }],
  tags: ["ap"],
};

let root: string;
let app: FastifyInstance;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "ggd-content-api-"));
  writeDocAtomic(root, "items", ITEM);
  rebuildAllIndexes(root);
  // undo store inside the tmp dir so the suite cleans up after itself (the real
  // default is <content>/../data/content-backups — outside the deployable tree)
  app = buildServer({ contentDir: root, backupDir: join(root, ".backups") });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  rmSync(root, { recursive: true, force: true });
});

describe("reads (capi-01)", () => {
  it("serves manifest, _index and objects", async () => {
    cover("content-api-get-endpoints");
    const manifest = await app.inject({ url: "/content-api/manifest" });
    expect(manifest.statusCode).toBe(200);
    expect(manifest.json().contentVersion).toMatch(/^cv_[0-9a-f]{12}$/);

    const index = await app.inject({ url: "/content-api/items/_index" });
    expect(index.statusCode).toBe(200);
    expect(index.json().entries).toHaveLength(1);
    expect(index.json().entries[0]).toMatchObject({ id: "ember-rod", path: "items/ember-rod.json" });

    const doc = await app.inject({ url: "/content-api/items/ember-rod" });
    expect(doc.statusCode).toBe(200);
    expect(doc.json()).toEqual(ITEM);

    expect((await app.inject({ url: "/content-api/items/nope" })).statusCode).toBe(404);
    expect((await app.inject({ url: "/content-api/nonsense/_index" })).statusCode).toBe(404);
  });
});

describe("validate-on-write (content-08)", () => {
  it("PUT rejects an invalid doc with 422 field errors and writes NOTHING", async () => {
    cover("content-api-validate-write");
    const res = await app.inject({
      method: "PUT",
      url: "/content-api/items/bad-item",
      payload: {
        id: "bad-item",
        schema: "item@1",
        name: "", // min(1)
        cost: -5, // min(0)
        tier: 99, // max(5)
        bogus: true, // strict()
        tags: [],
      },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json() as { errors: { path: string; message: string }[] };
    const paths = body.errors.map((e) => e.path);
    expect(paths).toContain("name");
    expect(paths).toContain("cost");
    expect(paths).toContain("tier");
    // the invalid doc must never have been written
    expect(existsSync(join(root, "items", "bad-item.json"))).toBe(false);
    // and the index/manifest are untouched
    const index = JSON.parse(readFileSync(join(root, "items", "_index.json"), "utf8"));
    expect(index.entries).toHaveLength(1);
  });

  it("PUT with mismatched url/doc id or wrong schema tag is a 422", async () => {
    const wrongId = await app.inject({
      method: "PUT",
      url: "/content-api/items/other-id",
      payload: { ...ITEM },
    });
    expect(wrongId.statusCode).toBe(422);
    expect(wrongId.json().errors.map((e: { path: string }) => e.path)).toContain("id");

    const wrongTag = await app.inject({
      method: "PUT",
      url: "/content-api/items/ember-rod",
      payload: { ...ITEM, schema: "augment@1" },
    });
    expect(wrongTag.statusCode).toBe(422);
    expect(wrongTag.json().errors.map((e: { path: string }) => e.path)).toContain("schema");
  });

  it("valid PUT atomically writes, returns hashes, and reindexes", async () => {
    const updated = { ...ITEM, cost: 950 };
    const res = await app.inject({
      method: "PUT",
      url: "/content-api/items/ember-rod",
      payload: updated,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { hash: string; collectionHash: string; contentVersion: string };
    expect(body.hash).toBe(hashDoc(updated));
    expect(body.contentVersion).toMatch(/^cv_[0-9a-f]{12}$/);

    // file really changed + index picked up the new hash (incremental reindex)
    expect(JSON.parse(readFileSync(join(root, "items", "ember-rod.json"), "utf8")).cost).toBe(950);
    const index = JSON.parse(readFileSync(join(root, "items", "_index.json"), "utf8"));
    expect(index.entries[0].hash).toBe(body.hash);
    const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
    expect(manifest.contentVersion).toBe(body.contentVersion);
    // editing a doc must CHANGE the collection hash and contentVersion
    expect(index.hash).toBe(body.collectionHash);
    // no tmp litter from the atomic write
    expect(readdirSync(join(root, "items")).filter((f) => f.includes(".tmp"))).toEqual([]);
  });
});

describe("path traversal (content-09)", () => {
  it("blocks ids and collections that try to escape content/", async () => {
    cover("content-api-path-traversal");
    const attempts = [
      { method: "GET" as const, url: "/content-api/items/..%2f..%2fmanifest" },
      { method: "PUT" as const, url: "/content-api/items/..%2f..%2fpwn" },
      { method: "PUT" as const, url: "/content-api/items/%2e%2e%2fpwn" },
      { method: "DELETE" as const, url: "/content-api/items/..%2f_index" },
      { method: "PUT" as const, url: "/content-api/..%2f..%2fdata/pwn" },
      { method: "PUT" as const, url: "/content-api/items/.hidden" },
      { method: "PUT" as const, url: "/content-api/items/UPPER" },
    ];
    for (const a of attempts) {
      const res = await app.inject({
        method: a.method,
        url: a.url,
        ...(a.method === "PUT" ? { payload: { id: "pwn", schema: "item@1" } } : {}),
      });
      expect([400, 404], `${a.method} ${a.url} -> ${res.statusCode}`).toContain(res.statusCode);
    }
    // nothing escaped the root: parent tmp dir only contains our content root
    expect(existsSync(join(root, "..", "pwn.json"))).toBe(false);
    expect(existsSync(join(root, "pwn.json"))).toBe(false);
  });
});

describe("assets route (editor 3D preview: editor-asset-route)", () => {
  const GLB = Buffer.concat([Buffer.from("glTF"), Buffer.from([2, 0, 0, 0, 42, 0, 0, 0, 9, 9])]);
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  it("serves GLB models and particle textures with correct content types", async () => {
    cover("editor-asset-route");
    mkdirSync(join(root, "assets/models/champions"), { recursive: true });
    mkdirSync(join(root, "assets/textures/particles"), { recursive: true });
    writeFileSync(join(root, "assets/models/champions/blocky-mage.glb"), GLB);
    writeFileSync(join(root, "assets/textures/particles/flame_01.png"), PNG);

    const glb = await app.inject({ url: "/content-api/assets/models/champions/blocky-mage.glb" });
    expect(glb.statusCode).toBe(200);
    expect(glb.headers["content-type"]).toBe("model/gltf-binary");
    expect(glb.rawPayload.equals(GLB)).toBe(true);
    expect(glb.rawPayload.subarray(0, 4).toString()).toBe("glTF");

    const png = await app.inject({ url: "/content-api/assets/textures/particles/flame_01.png" });
    expect(png.statusCode).toBe(200);
    expect(png.headers["content-type"]).toBe("image/png");
    expect(png.rawPayload.equals(PNG)).toBe(true);
  });

  it("404s missing assets and refuses to escape content/assets", async () => {
    const missing = await app.inject({ url: "/content-api/assets/models/props/nope.glb" });
    expect(missing.statusCode).toBe(404);

    const attempts = [
      "/content-api/assets/../items/ember-rod.json",
      "/content-api/assets/%2e%2e%2fitems/ember-rod.json",
      "/content-api/assets/..%2f..%2fmanifest.json",
      "/content-api/assets/models//x.glb",
      "/content-api/assets/.",
    ];
    for (const url of attempts) {
      const res = await app.inject({ url });
      expect([400, 404], `${url} -> ${res.statusCode}`).toContain(res.statusCode);
      // never leaks a JSON doc through the asset route
      expect(res.headers["content-type"]).not.toContain("model/");
      expect(String(res.body)).not.toContain('"Ember Rod"');
    }
  });
});

describe("asset write route (editor AI-icon Accept: content-api-asset-write)", () => {
  // 1x1 transparent PNG
  const PNG_B64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  it("writes a base64 PNG under content/assets, creating parent dirs (atomic)", async () => {
    cover("content-api-asset-write");
    const res = await app.inject({
      method: "PUT",
      url: "/content-api/assets/icons/champions/hero.png",
      payload: { base64: PNG_B64 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { path: string; bytes: number };
    expect(body.path).toBe("assets/icons/champions/hero.png");
    expect(body.bytes).toBeGreaterThan(0);

    const file = join(root, "assets/icons/champions/hero.png");
    expect(existsSync(file)).toBe(true);
    // real PNG magic bytes landed on disk
    expect(readFileSync(file).subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    // no tmp litter from the atomic write
    expect(readdirSync(join(root, "assets/icons/champions")).filter((f) => f.includes(".tmp"))).toEqual([]);

    // and it is now readable back through the GET asset route
    const get = await app.inject({ url: "/content-api/assets/icons/champions/hero.png" });
    expect(get.statusCode).toBe(200);
    expect(get.headers["content-type"]).toBe("image/png");
  });

  it("accepts a data: URL prefix and strips it before decoding", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/content-api/assets/icons/items/rod.png",
      payload: { base64: `data:image/png;base64,${PNG_B64}` },
    });
    expect(res.statusCode).toBe(200);
    expect(readFileSync(join(root, "assets/icons/items/rod.png")).subarray(0, 4)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  it("rejects non-image extensions, missing body, and path escapes", async () => {
    const badExt = await app.inject({
      method: "PUT",
      url: "/content-api/assets/icons/x.json",
      payload: { base64: PNG_B64 },
    });
    expect(badExt.statusCode).toBe(400);

    const noBody = await app.inject({
      method: "PUT",
      url: "/content-api/assets/icons/champions/y.png",
      payload: { notBase64: true },
    });
    expect(noBody.statusCode).toBe(422);

    for (const url of [
      "/content-api/assets/..%2f..%2fpwn.png",
      "/content-api/assets/%2e%2e%2fpwn.png",
      "/content-api/assets/icons//z.png",
    ]) {
      const res = await app.inject({ method: "PUT", url, payload: { base64: PNG_B64 } });
      expect([400, 404], `${url} -> ${res.statusCode}`).toContain(res.statusCode);
    }
    // nothing escaped the content root
    expect(existsSync(join(root, "..", "pwn.png"))).toBe(false);
  });
});

describe("create/delete/dry-run (capi-02..04)", () => {
  it("POST creates (201) and rejects duplicates (409)", async () => {
    cover("content-api-create-conflict");
    const doc = { id: "swift-boots", schema: "item@1", name: "Swift Boots", cost: 600, tier: 1, tags: [] };
    const created = await app.inject({ method: "POST", url: "/content-api/items/swift-boots", payload: doc });
    expect(created.statusCode).toBe(201);
    const dup = await app.inject({ method: "POST", url: "/content-api/items/swift-boots", payload: doc });
    expect(dup.statusCode).toBe(409);
  });

  it("DELETE removes the doc and reindexes", async () => {
    cover("content-api-delete-reindex");
    const res = await app.inject({ method: "DELETE", url: "/content-api/items/ember-rod" });
    expect(res.statusCode).toBe(200);
    expect(existsSync(join(root, "items", "ember-rod.json"))).toBe(false);
    const index = JSON.parse(readFileSync(join(root, "items", "_index.json"), "utf8"));
    expect(index.entries).toHaveLength(0);
    expect((await app.inject({ method: "DELETE", url: "/content-api/items/ember-rod" })).statusCode).toBe(404);
  });

  it("dry-run validate returns field errors / hash without writing", async () => {
    cover("content-api-dry-validate");
    const bad = await app.inject({
      method: "POST",
      url: "/content-api/items/new-item/validate",
      payload: { id: "new-item", schema: "item@1", name: "X", cost: "not-a-number", tier: 1, tags: [] },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().errors.map((e: { path: string }) => e.path)).toContain("cost");
    expect(existsSync(join(root, "items", "new-item.json"))).toBe(false);

    const good = await app.inject({
      method: "POST",
      url: "/content-api/items/new-item/validate",
      payload: { id: "new-item", schema: "item@1", name: "X", cost: 100, tier: 1, tags: [] },
    });
    expect(good.statusCode).toBe(200);
    expect(good.json().hash).toMatch(/^[0-9a-f]{12}$/);
    expect(existsSync(join(root, "items", "new-item.json"))).toBe(false);
  });
});

describe("production refusal (capi-05)", () => {
  it("buildServer throws when NODE_ENV=production", () => {
    cover("content-api-prod-refusal");
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => buildServer({ contentDir: root })).toThrow(/refuses/i);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

describe("SSE hub (capi-06)", () => {
  it("streams content:changed frames to subscribers; writes publish to the hub", async () => {
    cover("content-api-sse-events");
    const hub = new SseHub();
    const chunks: string[] = [];
    const unsub = hub.subscribe({ write: (c) => chunks.push(c) });
    hub.publish({ type: "content:changed", collection: "items", id: "x", change: "change" });
    expect(chunks.join("")).toContain("event: content:changed");
    expect(chunks.join("")).toContain('"collection":"items"');
    unsub();
    hub.publish({ type: "content:changed", collection: "items", id: "y", change: "add" });
    expect(chunks.join("")).not.toContain('"id":"y"');

    // the server's hub receives an event on every successful write
    const seen: string[] = [];
    app.sseHub.subscribe({ write: (c) => seen.push(c) });
    await app.inject({ method: "PUT", url: "/content-api/items/ember-rod", payload: { ...ITEM, cost: 901 } });
    expect(seen.join("")).toContain('"id":"ember-rod"');
  });
});

/**
 * The content bundle (content/bundle.json) is a WHOLE-TREE artifact produced by
 * `pnpm content:build`. This service rewrites ONE doc at a time, so any bundle
 * on disk goes stale the instant a write lands — and a stale bundle is worse
 * than no bundle: the client would hydrate old docs AND an old contentVersion,
 * so the version gate would not even fire, while the game-server (which reads
 * the filesystem directly) already has the new ones. Every mutating verb must
 * therefore delete it, dropping the client back to the always-fresh per-doc path.
 */
describe("content bundle staleness guard", () => {
  const bundleFile = (): string => join(root, "bundle.json");

  it("PUT deletes a stale bundle", async () => {
    expect(existsSync(bundleFile())).toBe(true); // rebuildAllIndexes emitted it
    const res = await app.inject({
      method: "PUT",
      url: "/content-api/items/ember-rod",
      payload: { ...ITEM, cost: 1000 },
    });
    expect(res.statusCode).toBe(200);
    expect(existsSync(bundleFile())).toBe(false);
  });

  it("POST (create) deletes a stale bundle", async () => {
    expect(existsSync(bundleFile())).toBe(true);
    const res = await app.inject({
      method: "POST",
      url: "/content-api/items/frost-rod",
      payload: { ...ITEM, id: "frost-rod", name: "Frost Rod" },
    });
    expect(res.statusCode).toBe(201);
    expect(existsSync(bundleFile())).toBe(false);
  });

  it("DELETE deletes a stale bundle", async () => {
    expect(existsSync(bundleFile())).toBe(true);
    const res = await app.inject({
      method: "DELETE",
      url: "/content-api/items/ember-rod",
    });
    expect(res.statusCode).toBe(200);
    expect(existsSync(bundleFile())).toBe(false);
  });

  it("a REJECTED write leaves the bundle alone (nothing became stale)", async () => {
    expect(existsSync(bundleFile())).toBe(true);
    const res = await app.inject({
      method: "PUT",
      url: "/content-api/items/ember-rod",
      payload: { ...ITEM, cost: "free" },
    });
    expect(res.statusCode).toBe(422);
    expect(existsSync(bundleFile())).toBe(true);
  });

  it("reads never touch the bundle", async () => {
    await app.inject({ url: "/content-api/manifest" });
    await app.inject({ url: "/content-api/items/_index" });
    await app.inject({ url: "/content-api/items/ember-rod" });
    expect(existsSync(bundleFile())).toBe(true);
  });
});
