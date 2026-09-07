import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { afterEach, expect, it } from "vitest";
import { ImportStore } from "./importStore";
import { captureHeroCatalogVersion, HERO_CATALOG_WORK_ID } from "./catalogVersions";
import { sha256Bytes } from "@ggd/shared/content/sha256";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ggd-catalog-version-")); roots.push(root);
  const content = join(root, "content");
  const write = (path: string, bytes: string | Uint8Array) => { mkdirSync(dirname(join(content, path)), { recursive: true }); writeFileSync(join(content, path), bytes); };
  const model = new Uint8Array([1, 2, 3, 4]);
  write("champions/live.json", '{"id":"live","name":"現有英雄","hp":100.0,"description":"原文\\n保留"}\n');
  write("_legacy/champions/unlisted.json", '{"id":"unlisted","name":"未上架英雄"}\n');
  write("abilities/live.q.json", '{"id":"live.q","damage":2.00}\n');
  write("models/body.json", '{"id":"body","glbPath":"assets/body.glb","clipMap":{"idle":"原待機"}}\n');
  write("assets/body.glb", model);
  write("manifest.json", '{"contentVersion":"fixture"}');
  write("assets-manifest.json", JSON.stringify({ entries: [{ path: "assets/body.glb", bytes: model.length, sha256: sha256Bytes(model) }] }));
  return { content, write, store: new ImportStore({ dir: join(root, "versions") }) };
}

it("archives shipping and unpublished heroes with exact source and asset bytes, without activating", () => {
  const f = fixture();
  const first = captureHeroCatalogVersion(f.content, f.store, { gameRevision: "game-1" });
  expect(first.manifest.heroes.map((hero) => hero.id).sort()).toEqual(["live", "unlisted"]);
  const id = first.record.versionId;
  expect(f.store.readWorkFile(HERO_CATALOG_WORK_ID, id, "catalog/champions/live.json")).toEqual(readFileSync(join(f.content, "champions/live.json")));
  expect(f.store.readWorkFile(HERO_CATALOG_WORK_ID, id, "assets/body.glb")).toEqual(readFileSync(join(f.content, "assets/body.glb")));
  expect(f.store.active()).toBeNull();
  expect(captureHeroCatalogVersion(f.content, f.store, { gameRevision: "game-1" }).stored).toBe(false);
  f.write("abilities/live.q.json", '{"id":"live.q","damage":7.00}\n');
  const next = captureHeroCatalogVersion(f.content, f.store, { gameRevision: "game-1" });
  expect(next.record.versionId).not.toBe(id);
  expect(f.store.readWorkFile(HERO_CATALOG_WORK_ID, id, "catalog/abilities/live.q.json")?.toString()).toContain("2.00");
  expect(f.store.readWorkFile(HERO_CATALOG_WORK_ID, next.record.versionId, "catalog/abilities/live.q.json")?.toString()).toContain("7.00");
});

it("keeps the exact overlay and its model bindings separate from the shipped baseline", () => {
  const f = fixture();
  const overlay = new TextEncoder().encode('{"generation":2,"docs":{"champions/live":{"id":"live","name":"新名稱"}},"deleted":{"champions/unlisted":true}}');
  const saved = captureHeroCatalogVersion(f.content, f.store, { gameRevision: "game-1", overlay });
  expect(saved.manifest.heroes).toHaveLength(3);
  expect(f.store.readWorkFile(HERO_CATALOG_WORK_ID, saved.record.versionId, "catalog/overlay.json")).toEqual(Buffer.from(overlay));
  expect(f.store.active()).toBeNull();
});

it("rejects missing or changed assets and escaping references before storing a baseline", () => {
  const f = fixture();
  f.write("assets/body.glb", new Uint8Array([5, 6]));
  expect(() => captureHeroCatalogVersion(f.content, f.store, { gameRevision: "game-1" })).toThrow("偏離清單");
  rmSync(join(f.content, "assets/body.glb"));
  expect(() => captureHeroCatalogVersion(f.content, f.store, { gameRevision: "game-1" })).toThrow("缺少本機檔案");
  f.write("models/body.json", '{"id":"body","glbPath":"assets/../../outside.glb"}');
  expect(() => captureHeroCatalogVersion(f.content, f.store, { gameRevision: "game-1" })).toThrow();
});
