import { extname } from "node:path";
import { contentSha256 } from "@ggd/shared/content/import/jcs";
import { sha256Bytes } from "@ggd/shared/content/sha256";
import { HERO_REF_COLLECTIONS, projectCatalogHero, type CatalogFiles } from "./catalogHero";

const OWNED = new Set(["champions", "abilities", "models", "projectiles", "status-effects", "vfx", "vfx-scripts", "vfx-subtypes", "ability-templates"]);
const REF_FIELDS = new Set(["id", "ref", "preset", ...Object.keys(HERO_REF_COLLECTIONS)]);
const SOUND_FIELDS = new Set(["sfxKey", "soundKey", "arriveSoundKey"]);
const TEXT_FIELDS = new Set(["name", "description", "label", "text", "subtitle", "provenance", "source", "clipMap", "attachPoints"]);

/** A hero version is instantiated into its own document namespace. Shared
 * templates are inputs, never restore destinations. Global game-rule configs
 * and shop items remain game-wide policy, not part of a hero restore command. */
export function instantiateCatalogHero(current: CatalogFiles, historical: CatalogFiles, heroPath: string) {
  const source = projectCatalogHero(historical, heroPath);
  const owner = sha256Bytes(Buffer.from(heroPath)).slice(0, 12), revision = source.digest.slice(7, 19);
  const instanceId = (id: string) => `instance.${owner}.${revision}.${sha256Bytes(Buffer.from(id)).slice(0, 20)}`;
  const ids = new Map<string, string>(), paths = new Map<string, string>(), assetPaths = new Map<string, string>(), sounds = new Map<string, string>();
  const prefix = source.hero.catalog === "legacy" ? "catalog/_legacy/" : "catalog/";
  const docs = [...source.files].flatMap(([path, bytes]) => {
    const collection = path.split("/").at(-2)!;
    if (!path.startsWith("catalog/") || !path.endsWith(".json") || !OWNED.has(collection)) return [];
    const doc = JSON.parse(Buffer.from(bytes).toString()) as Record<string, unknown>;
    if (typeof doc.id !== "string") throw new Error(`版本文件缺少身分：${path}`);
    const id = path === heroPath ? doc.id : instanceId(doc.id);
    ids.set(doc.id, instanceId(doc.id)); paths.set(path, path === heroPath ? path : `${prefix}${collection}/${id}.json`);
    return [{path, collection, doc}];
  });
  // One ID drives both the standalone ability and its optional script timeline.
  // Sound keys are also instantiated; existing entries in audio-map are untouched.
  const inspectSounds = (value: unknown, parentKey = "") => {
    if (Array.isArray(value)) value.forEach((item) => inspectSounds(item, parentKey));
    else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) {
      if ((SOUND_FIELDS.has(key) || (key === "default" && SOUND_FIELDS.has(parentKey))) && typeof child === "string") sounds.set(child, instanceId("sound:" + child));
      if (!TEXT_FIELDS.has(key)) inspectSounds(child, key);
    }
  };
  docs.forEach(({doc}) => inspectSounds(doc));
  for (const [path, bytes] of source.files) if (path.startsWith("assets/")) assetPaths.set(path, `assets/hero-instances/${sha256Bytes(bytes)}${extname(path)}`);
  const rewrite = (value: unknown, key = ""): unknown => {
    if (TEXT_FIELDS.has(key)) return value;
    if (typeof value === "string") {
      if (SOUND_FIELDS.has(key)) return sounds.get(value) ?? value;
      if ((key === "championId" || key === "counterpartId") && value === source.hero.id) return value;
      if (REF_FIELDS.has(key)) return ids.get(value) ?? value;
      return assetPaths.get(value) ?? value;
    }
    if (Array.isArray(value)) return value.map((item) => rewrite(item, key));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([field, child]) => [field, rewrite(child, (field === "default" || field === "values") && (REF_FIELDS.has(key) || SOUND_FIELDS.has(key)) ? key : field)]));
    return value;
  };
  const files = new Map<string, Uint8Array>();
  const addImmutable = (path: string, bytes: Uint8Array) => {
    const present = current.get(path);
    if (present && !Buffer.from(present).equals(Buffer.from(bytes))) throw new Error(`獨立版本身分已有不同資料，未覆寫：${path}`);
    files.set(path, bytes);
  };
  const templateVersions = new Map(docs.filter(({collection}) => collection === "ability-templates").map(({doc}) => {
    const instance = rewrite(doc) as Record<string, unknown>;
    instance.id = instanceId(String(doc.id));
    return [String(doc.id), { before: contentSha256(doc), after: contentSha256(instance) }];
  }));
  const rebindPins = (original: unknown, instance: unknown): void => {
    if (!original || typeof original !== "object" || !instance || typeof instance !== "object") return;
    const a = original as Record<string, unknown>, b = instance as Record<string, unknown>;
    if (typeof a.ref === "string" && typeof a.contentSha256 === "string") {
      const version = templateVersions.get(a.ref);
      if (!version || version.before !== a.contentSha256) throw new Error("歷史模板與原始版本鎖不一致，未生成替代結果。");
      b.contentSha256 = version.after;
    }
    for (const key of Object.keys(a)) if (!TEXT_FIELDS.has(key)) rebindPins(a[key], b[key]);
  };
  for (const {path, doc} of docs) {
    const instance = rewrite(doc) as Record<string, unknown>;
    instance.id = path === heroPath ? doc.id : instanceId(String(doc.id));
    rebindPins(doc, instance);
    const bytes = Buffer.from(JSON.stringify(instance, null, 2) + "\n"), target = paths.get(path)!;
    if (path === heroPath) files.set(target, bytes); else addImmutable(target, bytes);
  }
  // Preserve only binaries actually referenced by instantiated documents/sounds;
  // unrelated globally configured audio and default effects need not be copied.
  const usedAssets = new Set<string>();
  const collect = (value: unknown) => { if (typeof value === "string" && value.startsWith("assets/hero-instances/")) usedAssets.add(value); else if (Array.isArray(value)) value.forEach(collect); else if (value && typeof value === "object") Object.values(value).forEach(collect); };
  for (const bytes of files.values()) collect(JSON.parse(Buffer.from(bytes).toString()));
  if (sounds.size) {
    const audioPath = "catalog/config/audio-map.json", oldBytes = historical.get(audioPath), nowBytes = current.get(audioPath);
    if (!oldBytes || !nowBytes) throw new Error("獨立音效版本缺少聲音設定。");
    const old = JSON.parse(Buffer.from(oldBytes).toString()), now = JSON.parse(Buffer.from(nowBytes).toString());
    for (const [key, privateKey] of sounds) {
      if (!old.sfx?.[key]) throw new Error(`缺少原始音效：${key}`);
      const entry = rewrite(old.sfx[key]);
      if (now.sfx?.[privateKey] && contentSha256(now.sfx[privateKey]) !== contentSha256(entry)) throw new Error("獨立音效鍵已有不同設定。");
      now.sfx = {...now.sfx, [privateKey]: entry}; collect(entry);
    }
    files.set(audioPath, Buffer.from(JSON.stringify(now, null, 2) + "\n"));
  }
  for (const [path, target] of assetPaths) if (usedAssets.has(target)) addImmutable(target, source.files.get(path)!);
  const facts = [...files].sort(([a], [b]) => a.localeCompare(b, "en")).map(([path, bytes]) => ({path, bytes: bytes.length, sha256: "sha256:" + sha256Bytes(bytes)}));
  const changes = facts.flatMap((fact) => {
    const before = current.get(fact.path), beforeSha256 = before ? "sha256:" + sha256Bytes(before) : null;
    return beforeSha256 === fact.sha256 ? [] : [{...fact, beforeSha256, kind: before ? "changed" as const : "added" as const}];
  });
  return { target: {...source, files, facts}, changes, affected: [source.hero] };
}
