import { extractRefs } from "@ggd/shared/content/refs";
import { COLLECTIONS, isCollectionName, type CollectionName } from "@ggd/shared/content/schema/index";
import { referencedAssetPaths } from "@ggd/shared/content/assetReferences";
import { contentSha256 } from "@ggd/shared/content/import/jcs";
import { HERO_RESOLVER_CONFIG_IDS, HERO_RENDER_CONFIG_IDS } from "@ggd/shared/content/import/heroPackage";
import { normalizeTemplateBinding } from "@ggd/shared/content/templates/expand";
import { BUILTIN_VFX_TEXTURES } from "@ggd/shared/content/builtinVfxTextures";
import { sha256Bytes } from "@ggd/shared/content/sha256";
import type { CatalogSourceArchive } from "./catalogGeneratorSources";
import type { AddressedAssetFact } from "./catalogAddressedAssets";

export const HERO_REF_COLLECTIONS: Record<string, string> = {
  modelKey: "models", sourceModelKey: "models", abilityId: "abilities", passiveAbility: "abilities", exAbility: "abilities",
  projectileId: "projectiles", championId: "champions", counterpartId: "champions",
  statusId: "status-effects", markId: "status-effects", markStatusId: "status-effects", whileStatus: "status-effects",
  vfxId: "vfx", vfxKey: "vfx", trailVfxId: "vfx", subtype: "vfx-subtypes",
};

export type CatalogFiles = ReadonlyMap<string, Uint8Array>;
export interface CatalogHero { id: string; name: string; path: string; catalog: "shipping" | "legacy" | "overlay" }
export function catalogHeroes(files: CatalogFiles): CatalogHero[] {
  const manifest = files.get("catalog-version.json");
  return manifest ? JSON.parse(Buffer.from(manifest).toString()).heroes : [];
}
/** GH#1178：版本清單記著、但位元組不在 `files` 裡的素材（見 `catalogAddressedAssets.ts`）。 */
export function catalogAddressedAssets(files: CatalogFiles): Map<string, AddressedAssetFact> {
  const manifest = files.get("catalog-version.json");
  const list = manifest ? (JSON.parse(Buffer.from(manifest).toString()).contentAddressedAssets ?? []) as AddressedAssetFact[] : [];
  return new Map(list.map((fact) => [fact.path, fact]));
}

/** The closure retains authoring bytes; parsing is used only to discover edges.
 * No hero conversion, ID inference from names, or prose rewriting occurs here. */
export function projectCatalogHero(files: CatalogFiles, heroPath: string) {
  const hero = catalogHeroes(files).find((entry) => entry.path === heroPath);
  if (!hero) throw Object.assign(new Error("此版本沒有指定英雄。"), { statusCode: 404 });
  const selected = new Map<string, Uint8Array>(), issues = new Set<string>();
  // ⭐ 只記雜湊的素材也是閉包的一員：事實（路徑／大小／雜湊）與全量模式逐位元相同，只是沒有位元組。
  const addressed = catalogAddressedAssets(files), selectedAddressed = new Map<string, AddressedAssetFact>();
  const prefix = hero.catalog === "legacy" ? "catalog/_legacy/" : hero.catalog === "overlay" ? "overlay/" : "catalog/";
  const find = (collection: string, id: string) => [prefix, "catalog/"].map((p) => `${p}${collection}/${id}.json`).find((p) => files.has(p));
  const visit = (path: string) => {
    if (selected.has(path) || selectedAddressed.has(path)) return;
    const bytes = files.get(path), hashed = bytes ? undefined : addressed.get(path);
    if (hashed) { selectedAddressed.set(path, hashed); return; }
    if (!bytes) { issues.add(`缺少 ${path}`); return; }
    selected.set(path, bytes);
    if (selected.size + selectedAddressed.size > 10000) throw new Error("英雄版本引用超過上限。");
    if (!path.endsWith(".json") || path.startsWith("assets/")) return;
    const doc = JSON.parse(Buffer.from(bytes).toString()) as Record<string, unknown>;
    const collection = path.split("/").at(-2)!;
    if (!isCollectionName(collection)) return;
    const edge = (target: string, id: string, optional = false) => {
      const found = find(target, id);
      if (found) visit(found); else if (!optional) issues.add(`缺少 ${target}/${id}（${path}）`);
    };
    const parsed = COLLECTIONS[collection].schema.safeParse(doc);
    if (!parsed.success) issues.add(`舊版格式待調整：${path}`);
    else for (const ref of extractRefs(collection as CollectionName, parsed.data)) edge(ref.targetCollection, ref.targetId, ref.soft);
    // Templates and script timelines are authoring dependencies in addition to
    // the normal runtime reference graph. Their original documents stay intact.
    const inspect = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(inspect);
      else if (value && typeof value === "object") {
        const node = value as Record<string, unknown>;
        if (node.template) {
          try { for (const card of normalizeTemplateBinding(node.template as Parameters<typeof normalizeTemplateBinding>[0]).cards) edge("ability-templates", card.ref); }
          catch { issues.add(`模板格式待調整：${path}`); }
        }
        if (node.kind === "spawnModelFx" && typeof node.preset === "string") edge("ability-templates", node.preset);
        for (const [field, target] of Object.entries(HERO_REF_COLLECTIONS)) {
          if (typeof node[field] === "string" && node[field] !== "self") edge(target, node[field], target === "status-effects" || target === "vfx");
        }
        if (typeof node.sfxKey === "string" || typeof node.soundKey === "string" || typeof node.arriveSoundKey === "string") edge("config", "audio-map");
        Object.values(node).forEach(inspect);
      }
    };
    inspect(doc);
    if (collection === "ability-templates" && doc.params && typeof doc.params === "object") {
      for (const [name, spec] of Object.entries(doc.params as Record<string, {default?: unknown}>)) {
        const target = HERO_REF_COLLECTIONS[name];
        if (target && typeof spec.default === "string" && spec.default !== "self") edge(target, spec.default, target === "status-effects" || target === "vfx");
      }
    }
    if (collection === "abilities") edge("vfx-scripts", String(doc.id), true);
    for (const asset of referencedAssetPaths(doc)) visit(asset);
  };
  visit(heroPath);
  // Global rules are retained for comparison, but their unrelated heroes/VFX
  // are not this hero's authoring dependencies and must never be instantiated.
  const heroFiles = new Set([...selected.keys(), ...selectedAddressed.keys()]);
  for (const id of [...HERO_RESOLVER_CONFIG_IDS, ...HERO_RENDER_CONFIG_IDS]) {
    const path = find("config", id); if (path) visit(path);
  }
  for (const path of Object.values(BUILTIN_VFX_TEXTURES)) if (files.has(path) || addressed.has(path)) visit(path);
  const archive = JSON.parse(Buffer.from(files.get("catalog-version.json")!).toString()).generatorSources as CatalogSourceArchive | undefined;
  const generatorSources = (archive?.bindings ?? []).filter((binding) => selected.has(binding.productPath));
  for (const binding of generatorSources) {
    if (!binding.generatorVersion) continue;
    const generator = archive!.generators.find((entry) => entry.versionId === binding.generatorVersion);
    if (!generator || contentSha256({step: generator.step, files: generator.files}) !== generator.versionId) throw new Error("產生器來源版本不符。");
    for (const fact of generator.files) {
      const bytes = files.get(fact.path);
      if (!bytes || bytes.length !== fact.bytes || `sha256:${sha256Bytes(bytes)}` !== fact.sha256) throw new Error(`產生器來源缺少或已改變：${fact.path}`);
      selected.set(fact.path, bytes);
    }
  }
  const facts = [...[...selected].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: "sha256:" + sha256Bytes(bytes) })), ...[...selectedAddressed.values()].map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }))]
    .sort((a, b) => a.path.localeCompare(b.path, "en"));
  return { hero, heroFiles, files: selected, addressed: selectedAddressed, facts, digest: contentSha256(facts), issues: [...issues].sort(), generatorSources: generatorSources.map((binding) => ({...binding, source: binding.sourcePath && files.has(binding.sourcePath) ? Buffer.from(files.get(binding.sourcePath)!).toString() : null})) };
}
