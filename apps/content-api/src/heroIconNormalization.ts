import { zHeroProject, type HeroProject } from "@ggd/shared/content/heroForge/schema";
import { HERO_SLOTS } from "@ggd/shared/content/heroForge/constants";
import { zEditorImportPackage } from "@ggd/shared/content/import/packageSchema";
import { checkIconAssets, type IconUploadPolicy } from "@ggd/shared/content/import/iconAssets";
import { packageDigest } from "@ggd/shared/content/import/digest";
import { contentSha256, jcsByteLength } from "@ggd/shared/content/import/jcs";
import { encodeIcon } from "@ggd/shared/content/icons/encodeIconNode";
import { ImportStore } from "./importStore";
import { assetSha256 } from "./iconLanding";
import { buildHeroSourcePackage } from "@ggd/shared/content/import/heroSourcePackage";
import type { HeroPackageTarget } from "@ggd/shared/content/import/heroPackage";
import { verifyNormalizedHeroIcon } from "./normalizedHeroIcons";

/** Normalize the standard package's original icon channel before freezing it. */
export function normalizeHeroSource(raw: unknown, store: ImportStore, policy: IconUploadPolicy, target: HeroPackageTarget): HeroProject {
  const pkg = zEditorImportPackage.parse(raw);
  if (pkg.manifest.packageDigest !== packageDigest(pkg.manifest) || pkg.documents.length !== 1 || pkg.compiled.length || pkg.validation.length || Object.keys(pkg.reports).length) throw new Error("圖示來源包的文件集合或 digest 不符。");
  const root = pkg.documents[0]!;
  const project = zHeroProject.parse(root.document);
  if (root.path !== `authoring/hero-projects/${project.projectId}.json`) throw new Error("圖示来源與英雄身分不符。");
  const entry = pkg.manifest.entries.find((entry) => entry.path === root.path);
  if (!entry || entry.role !== "authoring" || entry.contentSha256 !== contentSha256(root.document) || entry.contentSize !== jcsByteLength(root.document)) throw new Error("圖示來源的英雄資料已變更。");
  if (pkg.manifest.entries.length !== pkg.assets.length + 1 || new Set(pkg.manifest.entries.map((entry) => entry.path)).size !== pkg.manifest.entries.length || new Set(pkg.assets.map((entry) => entry.path)).size !== pkg.assets.length || pkg.assets.length > HERO_SLOTS.length + 1) throw new Error("一份英雄只接受肖像與六個技能圖示。");
  const bytes = new Map<string, Uint8Array>();
  for (const asset of pkg.assets) {
    if (!(asset.bytes instanceof Uint8Array)) throw new Error("圖示原圖必須以 ZIP 傳輸。");
    bytes.set(asset.path, asset.bytes);
  }
  const frozen = pkg.manifest.entries.filter((entry) => entry.role === "asset" && entry.path.startsWith("assets/icons/community/"));
  const checked = checkIconAssets({ entries: pkg.manifest.entries.filter((entry) => !frozen.includes(entry)), bytes, policy, existing: new Map(), sha256: assetSha256 });
  if (checked.diagnostics.some((diagnostic) => diagnostic.severity === "error")) throw new Error(checked.diagnostics.map((diagnostic) => diagnostic.message).join("；"));
  if (checked.plans.length + frozen.length !== pkg.assets.length || (frozen.length && !policy.enabled)) throw new Error("圖示來源包含未宣告資產或目前禁止匯入。");
  const expected = buildHeroSourcePackage(project, pkg.manifest.entries.filter((entry) => entry.role === "asset").map((entry) => ({ path: entry.path, collection: entry.collection as "champions" | "abilities", id: entry.id!, mime: entry.mime!, bytes: bytes.get(entry.path)! })), target);
  const { transport: _transport, ...manifest } = pkg.manifest;
  if (contentSha256(manifest) !== contentSha256(expected.manifest)) throw new Error("圖示來源的目標版本或資料集合已漂移，請重新建立。");
  const owners = new Set<string>();
  for (const entry of frozen) {
    const raw = bytes.get(entry.path)!;
    verifyNormalizedHeroIcon(entry.path, raw);
    if (entry.contentSha256 !== assetSha256(raw) || entry.contentSize !== raw.length || entry.mime !== "image/webp") throw new Error("正規化圖示的 manifest 與 bytes 不符。");
    const consumers = [{ id: project.projectId, collection: "champions", path: project.presentation.championIcon, name: "champion:icon" }, ...HERO_SLOTS.map((slot) => ({ id: `${project.projectId}.${slot.toLowerCase()}`, collection: "abilities", path: project.presentation.slots[slot].icon, name: `${slot}:icon` }))].filter((owner) => owner.path === entry.path);
    if (!consumers.some((owner) => owner.id === entry.id && owner.collection === entry.collection)) throw new Error("正規化圖片未被目前英雄引用。");
    const stored = store.putNormalizedIcon(raw, raw, { preserveAlpha: policy.preserveAlpha, processorFingerprint: target.processorFingerprint });
    const lock = project.presentation.assetLocks.find((lock) => lock.path === entry.path);
    if (!lock || lock.sha256 !== stored.contentSha256.slice(7) || lock.byteSize !== raw.length || lock.registry !== "normalized-upload") throw new Error("正規化圖片缺少原版本的固定資產紀錄。");
    lock.consumers = consumers.map((consumer) => consumer.name);
  }
  for (const plan of checked.plans) {
    const slot = HERO_SLOTS.find((slot) => plan.collection === "abilities" && plan.id === `${project.projectId}.${slot.toLowerCase()}`);
    const champion = plan.collection === "champions" && plan.id === project.projectId;
    if (!slot && !champion) throw new Error("圖示只能屬於目前英雄與其六個技能，不能覆写其他作品。");
    const owner = `${plan.collection}/${plan.id}`;
    if (owners.has(owner)) throw new Error("同一個英雄／技能不能提交兩张原圖。");
    owners.add(owner);
    const pointer = champion ? project.presentation.championIcon : project.presentation.slots[slot!].icon;
    if (pointer !== plan.outputPath) throw new Error("原圖不再被目前英雄引用，請移除或重新指定。");
    const normalized = encodeIcon(bytes.get(plan.path)!, { preserveAlpha: policy.preserveAlpha });
    const stored = store.putNormalizedIcon(bytes.get(plan.path)!, normalized, { preserveAlpha: policy.preserveAlpha, processorFingerprint: target.processorFingerprint });
    if (champion) project.presentation.championIcon = stored.path;
    else project.presentation.slots[slot!].icon = stored.path;
    project.presentation.assetLocks = project.presentation.assetLocks.filter((lock) => lock.path !== pointer);
    const lock = project.presentation.assetLocks.find((lock) => lock.path === stored.path);
    const consumer = champion ? "champion:icon" : `${slot}:icon`;
    if (lock) lock.consumers = [...new Set([...lock.consumers, consumer])];
    else project.presentation.assetLocks.push({ path: stored.path, sha256: stored.contentSha256.slice(7), byteSize: normalized.length, mediaType: "image/webp", kind: "icon", registry: "normalized-upload", consumers: [consumer] });
  }
  return project;
}
