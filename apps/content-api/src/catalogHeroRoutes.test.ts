import { afterEach, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { rebuildAllIndexes } from "@ggd/shared/content/node";
import { sha256Bytes } from "@ggd/shared/content/sha256";
import { buildServer } from "./server";
import { ImportStore } from "./importStore";
import { HERO_CATALOG_WORK_ID } from "./catalogVersions";

const roots: string[] = [], apps: ReturnType<typeof buildServer>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const repo = resolve(__dirname, "../../..");
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ggd-full-hero-restore-")); roots.push(root);
  const content = join(root, "content"), backupDir = join(root, "backups");
  const write = (path: string, bytes: string | Uint8Array) => { mkdirSync(dirname(join(content, path)), { recursive: true }); writeFileSync(join(content, path), bytes); };
  const json = (path: string, value: unknown) => write(path, JSON.stringify(value, null, 2) + "\n");
  const base = JSON.parse(readFileSync(join(repo, "content/champions/sela.json"), "utf8")); delete base.icon;
  base.modelKey = "shared-body"; base.buildPriority = []; base.passive = { name: "原始被動", hooks: [] };
  for (const slot of ["Q", "W", "E", "R"]) {
    const ability = { ...base.abilities.Q, id: `version-test.${slot.toLowerCase()}`, name: slot, slot, effects: [{ kind: "damage", damageType: "magic", amount: { flat: 20 } }], description: "原文\n「角色台詞」\n" };
    delete ability.icon; delete ability.vfxKey; base.abilities[slot] = ability;
    json(`abilities/${ability.id}.json`, { ...ability, schema: "ability@1" });
  }
  const hero = { ...base, id: "version-test", name: "版本英雄", description: "完整\n原文" };
  json("champions/version-test.json", hero);
  json("champions/shared-hero.json", { ...hero, id: "shared-hero", name: "共用模型英雄" });
  json("_legacy/champions/archived.json", { ...hero, id: "archived", name: "未上架英雄" });
  const model = { id: "shared-body", schema: "model@1", glbPath: "assets/body.glb", scale: 1, collisionRadius: 0.6, clipMap: { idle: "Idle", run: "Run", attack: "Attack", cast: "Cast", hurt: "Hurt", death: "Death" } };
  json("models/shared-body.json", model); write("assets/body.glb", new Uint8Array([1,2,3]));
  json("assets-manifest.json", { schema: "ggd-assets-manifest@1", entries: [{path: "assets/body.glb", bytes: 3, sha256: sha256Bytes(new Uint8Array([1,2,3]))}] });
  rebuildAllIndexes(content);
  const create = () => { const app = buildServer({ contentDir: content, backupDir, repoRoot: repo }); apps.push(app); return app; };
  const app = create(), storeDir = join(backupDir, "hero-catalog-versions"), store = new ImportStore({dir: storeDir});
  const capture = async () => { const response = await app.inject({method: "POST", url: "/content-api/hero-catalog/versions/capture"}); expect(response.statusCode, response.body).toBe(200); return response.json().version.versionId as string; };
  const preview = async (versionId: string, heroPath = "catalog/champions/version-test.json") => { const response = await app.inject({method: "POST", url: "/content-api/hero-catalog/preview", payload: {heroPath, versionId}}); expect(response.statusCode, response.body).toBe(200); return response.json(); };
  const restore = (plan: any) => app.inject({method: "POST", url: "/content-api/hero-catalog/restore", payload: {heroPath: plan.hero.path, versionId: plan.versionId, expectedCurrentVersion: plan.currentVersion, planDigest: plan.planDigest}});
  return { root, content, write, json, hero, model, app, create, store, storeDir, capture, preview, restore };
}

it("instantiates a historical hero independently without changing another hero or shared templates", async () => {
  const f = fixture(), original = await f.capture(), originalFiles = f.store.readWorkFiles(HERO_CATALOG_WORK_ID, original)!;
  f.json("champions/version-test.json", { ...f.hero, name: "修改後名稱", baseStats: {...f.hero.baseStats, ad: 99} });
  const ability = JSON.parse(readFileSync(join(f.content, "abilities/version-test.q.json"), "utf8")); ability.cooldown[0] = 19;
  f.json("abilities/version-test.q.json", ability);
  f.json("models/shared-body.json", {...f.model, scale: 2, clipMap: {...f.model.clipMap, cast: "NewCast"}});
  f.write("assets/body.glb", new Uint8Array([4,5,6])); rebuildAllIndexes(f.content);
  const changed = await f.capture(), plan = await f.preview(original);
  expect(plan.issues).toEqual([]); expect(plan.blockedSources).toEqual([]);
  expect(plan.affected.map((hero: any) => hero.id).sort()).toEqual(["version-test"]);
  const sharedBefore = readFileSync(join(f.content, "champions/shared-hero.json"));
  const modelBefore = readFileSync(join(f.content, "models/shared-body.json"));
  const skillBefore = readFileSync(join(f.content, "abilities/version-test.q.json"));
  const result = await f.restore(plan); expect(result.statusCode, result.body).toBe(200);
  const restored = JSON.parse(readFileSync(join(f.content, "champions/version-test.json"), "utf8"));
  expect(restored.name).toBe(f.hero.name); expect(restored.description).toBe(f.hero.description); expect(restored.baseStats).toEqual(f.hero.baseStats);
  expect(restored.modelKey).not.toBe("shared-body"); expect(restored.abilities.Q.id).not.toBe("version-test.q");
  const ownModel = JSON.parse(readFileSync(join(f.content, "models", restored.modelKey + ".json"), "utf8"));
  expect(ownModel.clipMap).toEqual(f.model.clipMap); expect(ownModel.scale).toBe(1);
  expect(readFileSync(join(f.content, ownModel.glbPath))).toEqual(Buffer.from([1,2,3]));
  const ownAbility = JSON.parse(readFileSync(join(f.content, "abilities", restored.abilities.Q.id + ".json"), "utf8"));
  expect(ownAbility.cooldown).toEqual(f.hero.abilities.Q.cooldown); expect(ownAbility.description).toBe(f.hero.abilities.Q.description);
  expect(readFileSync(join(f.content, "champions/shared-hero.json"))).toEqual(sharedBefore);
  expect(readFileSync(join(f.content, "models/shared-body.json"))).toEqual(modelBefore);
  expect(readFileSync(join(f.content, "abilities/version-test.q.json"))).toEqual(skillBefore);
  expect(readFileSync(join(f.content, "assets/body.glb"))).toEqual(Buffer.from([4,5,6]));
  expect(f.store.getWorkVersion(HERO_CATALOG_WORK_ID, changed)).not.toBeNull(); expect(f.store.active()).toBeNull();
  const back = await f.preview(changed); expect((await f.restore(back)).statusCode).toBe(200);
  expect(JSON.parse(readFileSync(join(f.content, "champions/version-test.json"), "utf8")).name).toBe("修改後名稱");
  expect(readFileSync(join(f.content, "_legacy/champions/archived.json"))).toEqual(originalFiles.get("catalog/_legacy/champions/archived.json"));
});

it("rejects stale comparisons and missing source assets before changing live files", async () => {
  const f = fixture(), original = await f.capture(); f.json("champions/version-test.json", {...f.hero, name: "新名稱"}); rebuildAllIndexes(f.content);
  const plan = await f.preview(original); f.json("models/shared-body.json", {...f.model, scale: 3}); rebuildAllIndexes(f.content);
  const result = await f.restore(plan); expect(result.statusCode).toBe(409);
  expect(JSON.parse(readFileSync(join(f.content, "champions/version-test.json"), "utf8")).name).toBe("新名稱");
  f.write("models/shared-body.json", JSON.stringify({...f.model, glbPath: "assets/missing.glb"})); const incomplete = await f.capture();
  f.json("models/shared-body.json", f.model); rebuildAllIndexes(f.content);
  const missing = await f.preview(incomplete); expect(missing.issues.join(" ")).toContain("assets/missing.glb"); expect((await f.restore(missing)).statusCode).toBe(422);
});

it("recovers a interrupted multi-file restore on startup without publishing archived heroes", async () => {
  const f = fixture(), baseline = await f.capture(), path = "catalog/champions/version-test.json";
  const altered = Buffer.from(JSON.stringify({...f.hero, name: "中斷的回復"})); f.write(path.slice(8), altered);
  writeFileSync(join(f.storeDir, "hero-restore.pending.json"), JSON.stringify({id: "interrupted", before: baseline, target: baseline, heroPath: path, paths: [{path, afterHash: "sha256:" + sha256Bytes(altered)}]}));
  f.create();
  expect(JSON.parse(readFileSync(join(f.content, path.slice(8)), "utf8")).name).toBe("版本英雄");
  expect(existsSync(join(f.storeDir, "hero-restore.pending.json"))).toBe(false);
  const archived = await f.preview(baseline, "catalog/_legacy/champions/archived.json"); expect(archived.hero.catalog).toBe("legacy");
  expect(existsSync(join(f.content, "champions/archived.json"))).toBe(false);
});

it("instantiates pinned templates and retains their exact source version without changing the original", async () => {
  const f = fixture();
  const template = JSON.parse(readFileSync(join(repo, "content/ability-templates/tpl-single-strike.json"), "utf8"));
  const { contentSha256 } = await import("@ggd/shared/content/import/jcs");
  const { resolveTemplateExpansion } = await import("@ggd/shared/content/templates/resolve");
  const card = {ref: template.id, inheritDefaults: true, contentSha256: contentSha256(template), params: {damage: {flat: 123}}};
  const ability = {...f.hero.abilities.Q, effects: [], template: card};
  f.json("ability-templates/" + template.id + ".json", template);
  f.json("abilities/version-test.q.json", {...ability, schema: "ability@1"});
  f.json("champions/version-test.json", {...f.hero, abilities: {...f.hero.abilities, Q: ability}});
  rebuildAllIndexes(f.content); const baseline = await f.capture(), before = readFileSync(join(f.content, "ability-templates", template.id + ".json"));
  const result = await f.restore(await f.preview(baseline)); expect(result.statusCode, result.body).toBe(200);
  const hero = JSON.parse(readFileSync(join(f.content, "champions/version-test.json"), "utf8"));
  const own = JSON.parse(readFileSync(join(f.content, "abilities", hero.abilities.Q.id + ".json"), "utf8"));
  const ownTemplate = JSON.parse(readFileSync(join(f.content, "ability-templates", own.template.ref + ".json"), "utf8"));
  expect(own.template.ref).not.toBe(template.id); expect(own.template.contentSha256).toBe(contentSha256(ownTemplate));
  expect(resolveTemplateExpansion(own, new Map([[ownTemplate.id, ownTemplate]])).ok).toBe(true);
  expect(ownTemplate.name).toBe(template.name); expect(ownTemplate.description).toBe(template.description);
  expect(readFileSync(join(f.content, "ability-templates", template.id + ".json"))).toEqual(before);
});
