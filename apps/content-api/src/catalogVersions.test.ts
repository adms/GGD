import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
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

it("stores only changed files while keeping complete, flattened, verified snapshots", () => {
  const f = fixture();
  const first = captureHeroCatalogVersion(f.content, f.store, { gameRevision: "game-1" });
  f.write("abilities/live.q.json", '{"id":"live.q","damage":9}\n');
  const next = captureHeroCatalogVersion(f.content, f.store, { gameRevision: "game-1", reuseUnchangedFrom: first.record.versionId });
  const dir = join(f.content, "..", "versions", "works", sha256Bytes(new TextEncoder().encode(HERO_CATALOG_WORK_ID)), "versions");
  expect(next.record.storageRefs?.["assets/body.glb"]).toBe(first.record.versionId);
  expect(existsSync(join(dir, next.record.versionId.slice(7), "assets/body.glb"))).toBe(false);
  expect(next.record.storageRefs?.["catalog/abilities/live.q.json"]).toBeUndefined();
  expect(f.store.readWorkFiles(HERO_CATALOG_WORK_ID, next.record.versionId)?.get("assets/body.glb")).toEqual(Buffer.from([1,2,3,4]));
  f.write("champions/live.json", '{"id":"live","name":"下一版本"}\n');
  const third = captureHeroCatalogVersion(f.content, f.store, { gameRevision: "game-1", reuseUnchangedFrom: next.record.versionId });
  expect(third.record.storageRefs?.["assets/body.glb"]).toBe(first.record.versionId);
  expect(third.record.storageRefs?.["catalog/abilities/live.q.json"]).toBe(next.record.versionId);
  expect(f.store.readWorkFile(HERO_CATALOG_WORK_ID, first.record.versionId, "catalog/abilities/live.q.json")?.toString()).toContain("2.00");
  const full = new ImportStore({ dir: join(f.content, "..", "full") });
  expect(captureHeroCatalogVersion(f.content, full, { gameRevision: "game-1" }).record.snapshotDigest).toBe(third.record.snapshotDigest);
  // Corrupting a shared immutable object must fail closed for every reader.
  writeFileSync(join(dir, first.record.versionId.slice(7), "assets/body.glb"), new Uint8Array([9]));
  expect(() => f.store.getWorkVersion(HERO_CATALOG_WORK_ID, third.record.versionId)).toThrow("損壞");
  f.write("champions/live.json", '{"id":"live","name":"不得保存"}');
  expect(() => captureHeroCatalogVersion(f.content, f.store, { gameRevision: "game-1", reuseUnchangedFrom: third.record.versionId })).toThrow("損壞");
});

it("rejects missing storage origins and indirect references", () => {
  const f = fixture();
  const first = captureHeroCatalogVersion(f.content, f.store, { gameRevision: "game-1" });
  f.write("abilities/live.q.json", '{"id":"live.q","damage":9}');
  const next = captureHeroCatalogVersion(f.content, f.store, { gameRevision: "game-1", reuseUnchangedFrom: first.record.versionId });
  f.write("champions/live.json", '{"id":"live","name":"第三版"}');
  const third = captureHeroCatalogVersion(f.content, f.store, { gameRevision: "game-1", reuseUnchangedFrom: next.record.versionId });
  const dir = join(f.content, "..", "versions", "works", sha256Bytes(new TextEncoder().encode(HERO_CATALOG_WORK_ID)), "versions");
  const recordPath = join(dir, third.record.versionId.slice(7), "version.json");
  const record = JSON.parse(readFileSync(recordPath, "utf8"));
  record.storageRefs["assets/body.glb"] = next.record.versionId;
  writeFileSync(recordPath, JSON.stringify(record));
  expect(() => f.store.readWorkFiles(HERO_CATALOG_WORK_ID, third.record.versionId)).toThrow("引用版本不符");
  rmSync(join(dir, first.record.versionId.slice(7)), { recursive: true });
  expect(() => f.store.readWorkFiles(HERO_CATALOG_WORK_ID, next.record.versionId)).toThrow("已遺失");
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

/**
 * ⭐ 內容去重：同一份**位元組**兩個路徑，只算一次額度、只存一份。
 *
 * > owner 2026-09-10（逐字）：「⭐ 更好的一刀：內容去重（根因在這裡）⋯**do it**」
 *
 * ⚠️ 這不是節省潔癖 —— 模型版本化保存的是**來源 GLB 的原始位元組**，
 * 所以 `versions/<sha>.glb` 與來源檔逐位元組相同。⛔ 按路徑擋重複會讓
 * 同一份位元組被算兩次，而快照額度就是這樣被吃掉的。
 */
it("★ 同一份位元組在兩個路徑上只算一次額度、只存一份（⛔ 不按路徑算）", () => {
  // ⭐ 用一顆夠大的假資產，讓「多出來的 JSON 文件」在算術上可以忽略
  const blob = new Uint8Array(64 * 1024).map((_, i) => (i * 7) % 251);
  const other = new Uint8Array(64 * 1024).map((_, i) => (i * 11 + 3) % 251);

  const build = (second: Uint8Array) => {
    const f = fixture();
    writeFileSync(join(f.content, "assets/a.glb"), blob);
    writeFileSync(join(f.content, "assets/b.glb"), second);
    f.write("models/a.json", '{"id":"a","glbPath":"assets/a.glb","clipMap":{"idle":"原待機"}}\n');
    f.write("models/b.json", '{"id":"b","glbPath":"assets/b.glb","clipMap":{"idle":"原待機"}}\n');
    f.write("assets-manifest.json", JSON.stringify({ entries: [
      { path: "assets/a.glb", bytes: blob.length, sha256: sha256Bytes(blob) },
      { path: "assets/b.glb", bytes: second.length, sha256: sha256Bytes(second) },
    ] }));
    return captureHeroCatalogVersion(f.content, f.store, { gameRevision: "game-1" });
  };

  const same = build(blob);      // 兩個路徑、**一份**內容
  const diff = build(other);     // 兩個路徑、**兩份**內容

  // ⛔ 去重不可以弄丟任何一個路徑
  for (const r of [same, diff]) {
    expect(r.files.has("assets/a.glb")).toBe(true);
    expect(r.files.has("assets/b.glb")).toBe(true);
  }
  // ⭐ 同內容那一份**共用同一個實例**（⇒ 記憶體也只有一份）
  expect(same.files.get("assets/a.glb")).toBe(same.files.get("assets/b.glb"));
  expect(diff.files.get("assets/a.glb")).not.toBe(diff.files.get("assets/b.glb"));
  // ⭐ 而物件庫真的只存了一份：同內容的快照比不同內容的少掉約一顆 blob
  const stored = (r: ReturnType<typeof build>) =>
    new Set(r.record.files.map((fact) => fact.sha256)).size;
  expect(stored(diff) - stored(same)).toBe(1);
});
