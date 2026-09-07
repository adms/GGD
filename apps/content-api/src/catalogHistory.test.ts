import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { rebuildAllIndexes, writeDocAtomic } from "@ggd/shared/content/node";
import { buildServer } from "./server";
import { ImportStore } from "./importStore";
import { HERO_CATALOG_WORK_ID } from "./catalogVersions";
import { sha256Bytes } from "@ggd/shared/content/sha256";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ggd-hero-history-")); roots.push(root);
  const content = join(root, "content"), backups = join(root, "backups");
  const write = (path: string, bytes: string | Uint8Array) => { mkdirSync(dirname(join(content, path)), { recursive: true }); writeFileSync(join(content, path), bytes); };
  const item = { id: "test-item", schema: "item@1", name: "original", cost: 900, tier: 2, modifiers: [{ stat: "ap", op: "flat", value: 45 }], tags: ["ap"] };
  writeDocAtomic(content, "items", item);
  rebuildAllIndexes(content);
  const original = '{"id":"existing-hero","name":"既有英雄","description":"完整原文\\n「台詞」\\n","hp":100.0,"modelKey":"body"}\n';
  write("champions/existing-hero.json", original);
  write("_legacy/champions/not-published.json", '{"id":"not-published","name":"未上架"}\n');
  write("abilities/existing-hero.q.json", '{"id":"existing-hero.q","description":"原始技能\\n不省略","damage":2.00}\n');
  write("models/body.json", '{"id":"body","glbPath":"assets/body.glb","clipMap":{"cast":"原動作"}}');
  const bytes = new Uint8Array([1, 2, 3, 4]); write("assets/body.glb", bytes);
  write("assets-manifest.json", JSON.stringify({ entries: [{ path: "assets/body.glb", bytes: bytes.length, sha256: sha256Bytes(bytes) }] }));
  const app = buildServer({ contentDir: content, backupDir: backups, repoRoot: resolve(__dirname, "../../..") });
  const storeDir = join(backups, "hero-catalog-versions");
  return { root, content, backups, original, write, item, app, storeDir, store: new ImportStore({ dir: storeDir }) };
}

it("automatically archives all existing/unpublished heroes and shared assets before an ordinary save or delete", async () => {
  const f = fixture();
  try {
    const response = await f.app.inject({ method: "PUT", url: "/content-api/items/test-item", payload: { ...f.item, name: "updated" } });
    expect(response.statusCode, response.body).toBe(200);
    const first = f.store.listWorkVersions(HERO_CATALOG_WORK_ID);
    expect(first).toHaveLength(1);
    const files = f.store.readWorkFiles(HERO_CATALOG_WORK_ID, first[0]!.versionId)!;
    expect(files.get("catalog/champions/existing-hero.json")?.toString()).toBe(f.original);
    expect(files.has("catalog/_legacy/champions/not-published.json")).toBe(true);
    expect(files.get("catalog/abilities/existing-hero.q.json")?.toString()).toContain('"damage":2.00');
    expect(files.get("assets/body.glb")).toEqual(Buffer.from([1,2,3,4]));
    expect(files.get("catalog/items/test-item.json")?.toString()).toContain('"original"');
    const deletion = await f.app.inject({ method: "DELETE", url: "/content-api/items/test-item" });
    expect(deletion.statusCode).toBe(200);
    expect(f.store.listWorkVersions(HERO_CATALOG_WORK_ID)).toHaveLength(2);
    expect(f.store.active()).toBeNull();
    const page = await f.app.inject({ url: "/content-api/hero-catalog/versions" });
    expect(page.json().items).toHaveLength(2);
    const detail = await f.app.inject({ url: "/content-api/hero-catalog/versions/"+encodeURIComponent(first[0]!.versionId) });
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json().heroes.map((hero: {id: string}) => hero.id).sort()).toEqual(["existing-hero", "not-published"]);
  } finally { await f.app.close(); }
});

it("refuses destructive editing if full history cannot be written", async () => {
  const f = fixture();
  try {
    // Fail the immutable store rather than the old best-effort per-doc backup.
    renameSync(f.storeDir, f.storeDir+"-unavailable"); writeFileSync(f.storeDir, "disk unavailable");
    const before = readFileSync(join(f.content, "items/test-item.json"));
    const response = await f.app.inject({ method: "PUT", url: "/content-api/items/test-item", payload: { ...f.item, name: "must not overwrite" } });
    expect(response.statusCode).toBe(503);
    expect(readFileSync(join(f.content, "items/test-item.json"))).toEqual(before);
    expect(readFileSync(join(f.content, "champions/existing-hero.json"), "utf8")).toBe(f.original);
  } finally { await f.app.close(); }
});

it("keeps incomplete authoring states explicit and does not mistake a stale manifest for original asset bytes", async () => {
  const f = fixture();
  try {
    f.write("assets/body.glb", new Uint8Array([9, 8, 7]));
    f.write("vfx/unfinished.json", '{"id":"unfinished","texture":"assets/missing.png"}');
    const response = await f.app.inject({ method: "POST", url: "/content-api/hero-catalog/versions/capture" });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().incomplete).toEqual({ missing: ["assets/missing.png"], staleAssets: ["assets/body.glb"] });
    expect(f.store.readWorkFile(HERO_CATALOG_WORK_ID, response.json().version.versionId, "assets/body.glb")).toEqual(Buffer.from([9,8,7]));
    expect(f.store.active()).toBeNull();
  } finally { await f.app.close(); }
});

it("applies the existing write guard to snapshot creation; listing never creates a version", async () => {
  const f = fixture();
  try {
    const denied = await f.app.inject({ method: "POST", url: "/content-api/hero-catalog/versions/capture", remoteAddress: "192.168.1.10" });
    expect(denied.statusCode).toBe(403);
    const read = await f.app.inject({ url: "/content-api/hero-catalog/versions" });
    expect(read.json().items).toEqual([]); expect(f.store.listWorkVersions(HERO_CATALOG_WORK_ID)).toEqual([]);
  } finally { await f.app.close(); }
});
