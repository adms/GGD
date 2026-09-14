import { afterEach, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { rebuildAllIndexes } from "@ggd/shared/content/node";
import { buildServer } from "./server";
import { ImportStore } from "./importStore";
import { HERO_CATALOG_WORK_ID, captureHeroCatalogVersion } from "./catalogVersions";
import { addressedDigestReads, sha256Hex } from "./catalogAddressedAssets";

/**
 * ⭐ GH#1178：git 裡「檔名即內容雜湊」的素材只記雜湊 —— ⚠️ 兩個方向都要驗：
 *   ① 只記雜湊時，⛔ 不只信檔名（未 commit／檔名與內容不符 ⇒ 照舊複製位元組），而且雜湊按 stat 快取
 *   ② 回復需要位元組而工作樹找不到 ⇒ **指名失敗、一個檔都不寫**；找得到 ⇒ 位元組逐一相同
 */
const repo = resolve(__dirname, "../../.."), roots: string[] = [], apps: ReturnType<typeof buildServer>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, "-c", "user.email=t@example.invalid", "-c", "user.name=t", ...args], { stdio: "pipe" });
const glb = (seed: number) => new Uint8Array(512).map((_, i) => (i * seed + 7) % 251);
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ggd-addressed-")); roots.push(root);
  const content = join(root, "content"), write = (path: string, data: string | Uint8Array) => { mkdirSync(dirname(join(content, path)), { recursive: true }); writeFileSync(join(content, path), data); };
  const body = glb(3), bodyPath = `assets/models/community/${sha256Hex(body)}.glb`, liar = `assets/models/community/${sha256Hex(glb(5))}.glb`;
  const hero = JSON.parse(readFileSync(join(repo, "content/champions/sela.json"), "utf8")); delete hero.icon;
  Object.assign(hero, { id: "addr-hero", name: "原名", modelKey: "addr-body", buildPriority: [], passive: { name: "被動", hooks: [] } });
  for (const slot of ["Q", "W", "E", "R"]) {
    const a = { ...hero.abilities.Q, id: `addr-hero.${slot.toLowerCase()}`, name: slot, slot, effects: [{ kind: "damage", damageType: "magic", amount: { flat: 20 } }] };
    delete a.icon; delete a.vfxKey; delete a.template; hero.abilities[slot] = a; write(`abilities/${a.id}.json`, JSON.stringify({ ...a, schema: "ability@1" }));
  }
  write("champions/addr-hero.json", JSON.stringify(hero));
  write("models/addr-body.json", JSON.stringify({ id: "addr-body", schema: "model@1", glbPath: bodyPath, scale: 1, collisionRadius: 0.6, clipMap: { idle: "Idle", run: "Run", attack: "Attack", cast: "Cast", hurt: "Hurt", death: "Death" } }));
  write(bodyPath, body); write(liar, glb(9)); // ⛔ 檔名是 glb(5) 的雜湊，內容卻是 glb(9)
  const staleBlob = `assets/models/community/${sha256Hex(glb(13))}.glb`; write(staleBlob, glb(15)); // commit 進去的是 glb(15)…
  rebuildAllIndexes(content); git(root, "init", "-q"); git(root, "add", "."); git(root, "commit", "-qm", "fixture");
  write(staleBlob, glb(13)); // …工作樹換成 glb(13)：判準①檔名＝雜湊、②大小相同都成立，只有③HEAD blob 不符（2026-09-15 補：審查者 MR2 拿掉③仍綠）
  const untracked = `assets/models/community/${sha256Hex(glb(11))}.glb`; write(untracked, glb(11));
  write("assets-manifest.json", JSON.stringify({ entries: [liar, staleBlob, untracked].map((path) => ({ path, bytes: 512, sha256: sha256Hex(readFileSync(join(content, path))) })) }));
  const app = buildServer({ contentDir: content, backupDir: join(root, "backups"), repoRoot: repo }); apps.push(app);
  return { root, content, hero, body, bodyPath, liar, staleBlob, untracked, app, write, store: new ImportStore({ dir: join(root, "backups", "hero-catalog-versions") }) };
}

it("① 只有「git 追蹤＋大小＋雜湊都對」的才只記雜湊；雜湊按 stat 快取", () => {
  const f = fixture(), store = new ImportStore({ dir: join(f.root, "probe") }), capture = () => captureHeroCatalogVersion(f.content, store, { gameRevision: "t", allowIncomplete: true });
  const first = capture(), afterFirst = addressedDigestReads();
  expect(first.manifest.contentAddressedAssets?.map((fact) => fact.path)).toEqual([f.bodyPath]);
  expect(store.readWorkFile(HERO_CATALOG_WORK_ID, first.record.versionId, f.bodyPath)).toBeNull();
  for (const path of [f.liar, f.staleBlob, f.untracked]) expect(store.readWorkFile(HERO_CATALOG_WORK_ID, first.record.versionId, path)).toEqual(readFileSync(join(f.content, path)));
  capture(); expect(addressedDigestReads()).toBe(afterFirst);
  f.write(f.bodyPath, f.body); capture(); expect(addressedDigestReads()).toBeGreaterThan(afterFirst);
});

it("② 回復：工作樹有同雜湊 ⇒ 位元組逐一寫回；沒有 ⇒ 指名失敗而且一個檔都不寫", async () => {
  for (const deleted of [false, true]) {
    const f = fixture(), post = (url: string, payload?: object) => f.app.inject({ method: "POST", url, payload });
    const original = (await post("/content-api/hero-catalog/versions/capture")).json().version.versionId;
    f.write("champions/addr-hero.json", JSON.stringify({ ...f.hero, name: "新名稱" })); rebuildAllIndexes(f.content);
    if (deleted) rmSync(join(f.content, f.bodyPath));
    const plan = (await post("/content-api/hero-catalog/preview", { heroPath: "catalog/champions/addr-hero.json", versionId: original })).json();
    const result = await post("/content-api/hero-catalog/restore", { heroPath: plan.hero.path, versionId: plan.versionId, expectedCurrentVersion: plan.currentVersion, planDigest: plan.planDigest });
    const instance = join(f.content, `assets/hero-instances/${sha256Hex(f.body)}.glb`), name = JSON.parse(readFileSync(join(f.content, "champions/addr-hero.json"), "utf8")).name;
    if (!deleted) { expect(result.statusCode, result.body).toBe(200); expect(readFileSync(instance)).toEqual(Buffer.from(f.body)); expect(name).toBe("原名"); continue; }
    expect(result.statusCode).toBe(409); expect(result.json().message).toContain(f.bodyPath);
    expect(existsSync(instance)).toBe(false); expect(name).toBe("新名稱");
  }
});
