import { z } from "zod";
import { COLLECTION_NAMES, isCollectionName } from "./schema";
import { ContentStore } from "./store";
import { registerAll } from "./registries";
import { contentSha256 } from "./import/jcs";
import { readPackageZip } from "./import/readPackageZip";
import { zHeroProject } from "./heroForge/schema";
import { HERO_SLOTS } from "./heroForge/constants";
import { heroTemplateInstances } from "./heroForge/templateVersions";
import { uploadedHeroModelDoc } from "./modelUpload/heroModel";
import { heroCounterpartId } from "./heroForge/forms";
import type { ChampionDoc } from "./schema/champion";
import { captureRegistryContext, extendRegistryContext, type RegistryContext } from "../sim/content/registryContext";

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/).refine((value) => !value.includes(".."));
// Published roster metadata, independent of the 12 seats in a match.
// Keep aligned with platform/submissions.MaxPublishedRosterHeroes.
export const MAX_COMMUNITY_HEROES = 256;
export const MAX_COMMUNITY_ROOM_ASSET_BYTES = 256 * 1024 * 1024;
/**
 * ⭐⭐ GH#1157 —— **已發布英雄的收據要對哪幾欄。** ⛔ 這裡與 Go 端
 * (`apps/platform/internal/submissions/hero_intake.go` 的 `HeroTargetMatch.Matches`)
 * 是**同一個判準的兩個語言實作** —— ⛔ 跨語言沒辦法共用一份，
 * ⭐ 但**語意必須逐字相同**,而 `heroTargetSemanticsAgree.test.ts` 在守這件事。
 *
 * ⛔ 在此之前這裡是**四欄 ＋ contractVersion** 全等,而四欄裡有三欄每天轉幾十次:
 * 實測(2026-09-10):只改 `content/config/ugc.json` 的一個 `note` **字串**、
 * 跑一次 `pnpm content:build` ⇒ `contentVersion` 與 `processorFingerprint` **兩欄同時轉**。
 *
 * ⚠️⚠️ ⭐ 而**這一個**比對點比 Go 那個更嚴重:它在**開房**路徑上 `throw`
 * ⇒ ⛔ 不是「那名英雄不見」,是**那間房開不起來**。
 *
 * > owner 2026-09-09:「74 名一旦上架,下一次部署就會全部靜靜消失 => 開票修阿」
 */
export type HeroTargetMatchMode = "migration" | "game-and-migration" | "strict";

/**
 * ⭐ 回傳**哪一欄不合**(`null` ＝ 相容)。⛔ 不回 boolean:
 * 「不相容」而說不出哪一欄,正是這一票要修的病的另一半。
 */
export function heroTargetMismatch(
  mode: HeroTargetMatchMode,
  row: { gameRevision: string; contentVersion: string; migrationFingerprint: string; processorFingerprint: string },
  target: { gameRevision: string; contentVersion: string; migrationFingerprint: string; processorFingerprint: string },
): string | null {
  // ⭐ 四欄裡唯一在回答「這名英雄的資料需不需要被轉換」的那一欄 —— 三檔都比它。
  if (row.migrationFingerprint !== target.migrationFingerprint) return "migrationFingerprint";
  if (mode === "strict") {
    if (row.gameRevision !== target.gameRevision) return "gameRevision";
    if (row.contentVersion !== target.contentVersion) return "contentVersion";
    if (row.processorFingerprint !== target.processorFingerprint) return "processorFingerprint";
  } else if (mode === "game-and-migration") {
    if (row.gameRevision !== target.gameRevision) return "gameRevision";
  }
  return null;
}

export const zCommunityTarget = z.object({ gameRevision: z.string().min(1).max(128), contentVersion: z.string().min(1).max(128), migrationFingerprint: z.string().min(1).max(128), processorFingerprint: z.string().min(1).max(128) }).strict();
/** Only the authenticated platform publication resolver may supply these pins. */
export const zCommunityHeroPin = z.object({ workId: id, submissionId: id, authorId: id, authorName: z.string().min(1).max(128), name: z.string().min(1).max(256), packageDigest: digest, snapshotDigest: digest }).strict();
const zAsset = z.object({ path: z.string().min(1).max(1024), contentSha256: digest, bytes: z.number().int().nonnegative().max(8 * 1024 * 1024), mime: z.string().min(1).max(128) }).strict();
export const zCommunityRoomManifest = z.object({
  schema: z.literal("ggd-community-room@1"), digest, baseContentDigest: digest, target: zCommunityTarget,
  heroes: z.array(zCommunityHeroPin).min(1).max(MAX_COMMUNITY_HEROES), assets: z.array(zAsset).max(12000),
}).strict();
export type CommunityHeroPin = z.infer<typeof zCommunityHeroPin>;
export type CommunityTarget = z.infer<typeof zCommunityTarget>;
export const zCommunityContentRequest = z.union([
  z.object({ matchId: id, accountId: id, workId: id.optional(), readyDigest: digest.optional() }).strict(),
  z.object({ replayId: id, ticket: z.string().min(1).max(512), workId: id.optional() }).strict(),
]);
export type CommunityContentRequest = z.infer<typeof zCommunityContentRequest>;
export type CommunityRoomManifest = z.infer<typeof zCommunityRoomManifest>;
export interface CommunityContentBase { readonly context: RegistryContext; readonly digest: string; readonly documents: Readonly<Record<string, string>> }
export interface CommunityRoomContent { readonly context: RegistryContext; readonly manifest: CommunityRoomManifest; readonly assets: ReadonlyMap<string, Uint8Array>; readonly documents: ContentStore }

/** Call after official content and skeleton registration, before accepting rooms. */
export function captureCommunityContentBase(store: ContentStore): CommunityContentBase {
  const documents: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const collection of COLLECTION_NAMES) for (const id of store.ids(collection).sort()) documents[`${collection}/${id}`] = contentSha256(store.get(collection, id));
  const digest = contentSha256(documents);
  return Object.freeze({ context: captureRegistryContext(digest), digest, documents: Object.freeze(documents) });
}

export function communityManifestDigest(manifest: Omit<CommunityRoomManifest, "digest">): string { return contentSha256(manifest); }
export function verifyCommunityRoomManifest(raw: unknown): CommunityRoomManifest {
  const manifest = zCommunityRoomManifest.parse(raw);
  const { digest, ...identity } = manifest;
  if (communityManifestDigest(identity) !== digest) throw new Error("房間內容清單的完整性校驗失敗。");
  if (new Set(manifest.heroes.map((hero) => hero.workId)).size !== manifest.heroes.length) throw new Error("房間不能同時載入同一作品的兩個版本。");
  if (new Set(manifest.assets.map((asset) => asset.path)).size !== manifest.assets.length || manifest.assets.reduce((total, asset) => total + asset.bytes, 0) > MAX_COMMUNITY_ROOM_ASSET_BYTES) throw new Error("房間資產重複或超過總容量上限。");
  for (const hero of manifest.heroes) Object.freeze(hero);
  for (const asset of manifest.assets) Object.freeze(asset);
  Object.freeze(manifest.heroes); Object.freeze(manifest.assets); Object.freeze(manifest.target);
  return Object.freeze(manifest);
}

/** Reuse Main's ZIP contract. This checks bytes and dependencies; it does not grant publication authority. */
export function buildCommunityRoomContent(input: {
  base: CommunityContentBase; target: CommunityTarget; pins: readonly CommunityHeroPin[];
  archives: ReadonlyMap<string, Uint8Array>;
  expected?: CommunityRoomManifest;
  inflate?: (bytes: Uint8Array, maxBytes: number) => Uint8Array;
  /**
   * ⭐ GH#1157 —— 收據比對哪幾欄（`config.ugc@1` 的 `heroTargetMatch`）。
   * ⛔ 留空 ⇒ 出貨值 `migration`：⭐ 呼叫端**還沒接上設定時**要拿到的是
   * **今天出貨的行為**，⛔ 不是最嚴格那一檔（那會讓沒接線看起來像「壞了」）。
   */
  targetMatch?: HeroTargetMatchMode;
}): CommunityRoomContent {
  const target = zCommunityTarget.parse(input.target);
  const targetMatchMode: HeroTargetMatchMode = input.targetMatch ?? "migration";
  const pins = z.array(zCommunityHeroPin).min(1).max(MAX_COMMUNITY_HEROES).parse(input.pins).sort((a, b) => a.workId < b.workId ? -1 : a.workId > b.workId ? 1 : 0);
  if (new Set(pins.map((pin) => pin.workId)).size !== pins.length) throw new Error("房間不能同時載入同一作品的兩個版本。");
  const overlay = new ContentStore();
  const documents = new ContentStore();
  const assetFacts = new Map<string, z.infer<typeof zAsset>>();
  const assets = new Map<string, Uint8Array>();
  let totalBytes = 0;
  for (const pin of pins) {
    const archive = input.archives.get(pin.workId);
    if (!archive) throw new Error(`尚未取得完整英雄：${pin.name}`);
    const pkg = readPackageZip(archive, { inflate: input.inflate });
    const manifest = pkg.manifest;
    if (manifest.packageDigest !== pin.packageDigest || manifest.scope !== "community-work" || manifest.mode !== "bootstrap") throw new Error(`英雄套件與房間固定版本不同：${pin.name}`);
    // ⭐⭐ GH#1157 —— 走**共用判準**（⛔ 不在這裡再寫一次四欄比對）。
    // ⚠️ ⭐ `contractVersion` 那一格**保留**：它問的是「這個包是用哪一版**契約格式**寫的」，
    //   ⛔ 不是版本指紋 —— 契約格式不同 ⇒ 欄位讀不出來，那是真的不相容。
    // ⭐⭐ `migrationFingerprint` 在包的 schema 裡是 **nullable ＋ optional**
    //   （`packageSchema.ts:375`）⇒ ⛔ 一個**沒有遷移指紋**的包是存在的。
    // ⭐ 舊行為對它是 `undefined !== "mig…"` ⇒ **擋**。⇒ 保持 fail-closed:
    //   ⛔ 不要 `?? target.migrationFingerprint`（那會讓「沒填」變成「一定相容」）。
    const rowMigration = manifest.migrationFingerprint ?? "";
    const mismatch = heroTargetMismatch(targetMatchMode, {
      gameRevision: manifest.base.gameRevision,
      contentVersion: manifest.base.contentVersion,
      migrationFingerprint: rowMigration,
      processorFingerprint: manifest.authoringProcessor.fingerprint,
    }, target);
    if (mismatch !== null || manifest.authoringProcessor.contractVersion !== "runtime-direct@1") throw new Error(`英雄版本與目前遊戲不相容：${pin.name}。請作者更新並重新送審。`);
    const root = pkg.documents.find((entry) => entry.path === `authoring/hero-projects/${pin.workId}.json`);
    const project = zHeroProject.parse(root?.document);
    const templateVersions = new Map((project.acceptedPlan ? heroTemplateInstances(project.acceptedPlan) : []).map((template) => [`ability-templates/${template.id}`, template]));
    if (project.projectId !== pin.workId || project.brief.name !== pin.name || manifest.selectionRoots.length !== 1 || manifest.selectionRoots[0]!.id !== pin.workId || manifest.selectionRoots[0]!.contentSha256 !== contentSha256(project)) throw new Error("已發布英雄的來源身分不一致。");
    const own = new Set([`champions/${pin.workId}`, ...HERO_SLOTS.map((slot) => `abilities/${pin.workId}.${slot.toLowerCase()}`)]);
    const body = pkg.compiled.find((entry) => entry.path === `compiled/champions/${pin.workId}.json`)?.document as ChampionDoc | undefined;
    if (body?.transform) {
      const counterpartId = heroCounterpartId(pin.workId);
      const counterpart = pkg.compiled.find((entry) => entry.path === `compiled/champions/${counterpartId}.json`)?.document as ChampionDoc | undefined;
      if (body.transform.role !== "base" || body.transform.counterpartId !== counterpartId
        || counterpart?.id !== counterpartId || counterpart.transform?.role !== "alternate" || counterpart.transform.counterpartId !== pin.workId) {
        throw new Error("生成英雄的變身對應體缺少或連結不一致。");
      }
      // A paired body is runtime content, not another independently selectable work.
      own.add(`champions/${counterpartId}`);
    }
    // Uploaded models are immutable package-local dependencies, not documents
    // shipped in the release base. Match their exact descriptor before admission.
    const uploaded = project.presentation.uploadedModel ? uploadedHeroModelDoc(project.presentation.uploadedModel) : null;
    const uploadedKey = uploaded ? `models/${uploaded.id}` : null;
    if (uploaded && project.presentation.modelKey !== uploaded.id) throw new Error("上傳模型與英雄綁定不一致。");
    for (const slot of HERO_SLOTS) if (project.presentation.slots[slot]?.script) own.add(`vfx-scripts/${pin.workId}.${slot.toLowerCase()}`);
    for (const key of own) {
      const [collection, id] = key.split("/");
      if (input.base.documents[key] || (isCollectionName(collection!) && overlay.has(collection, id!))) throw new Error(`社群英雄與現有內容身分衝突：${key}`);
    }
    const dependencies = new Set<string>();
    for (const dependency of manifest.requires) {
      const key = `${dependency.kind}/${dependency.id}`;
      const template = templateVersions.get(key);
      const expected = key === uploadedKey ? contentSha256(uploaded) : template ? contentSha256(template) : input.base.documents[key];
      if (dependencies.has(key) || expected !== dependency.contentSha256) throw new Error(`固定依賴已變更或缺少：${key}`);
      if (template && input.base.documents[key] && input.base.documents[key] !== expected) throw new Error("模板版本與既有內容衝突。");
      if (key === uploadedKey && input.base.documents[key] && input.base.documents[key] !== expected) throw new Error("上傳模型與既有內容衝突。");
      dependencies.add(key);
    }
    if (uploadedKey && !dependencies.has(uploadedKey)) throw new Error("英雄套件缺少固定上傳模型。");
    const compiled = new Set<string>();
    for (const entry of pkg.compiled) {
      const match = /^compiled\/([^/]+)\/([^/]+)\.json$/.exec(entry.path);
      if (!match || !isCollectionName(match[1]!) || !entry.document || typeof entry.document !== "object") throw new Error("英雄遊戲資料路徑不合法。");
      const collection = match[1]!; const id = match[2]!; const key = `${collection}/${id}`;
      if ((entry.document as { id?: unknown }).id !== id || compiled.has(key)) throw new Error(`英雄遊戲資料身分重複或錯誤：${key}`);
      compiled.add(key);
      if (!own.has(key) && !dependencies.has(key)) throw new Error(`英雄包含未固定的遊戲資料：${key}`);
      if (key === uploadedKey && contentSha256(entry.document) !== contentSha256(uploaded)) throw new Error("上傳模型的動作或外觀設定與固定版本不同。");
      const existing = documents.tryGet(collection, id);
      if (existing && contentSha256(existing) !== contentSha256(entry.document)) throw new Error(`同局英雄的依賴內容衝突：${key}`);
      documents.add(collection, id, entry.document);
      if (own.has(key) || key === uploadedKey) overlay.add(collection, id, entry.document);
    }
    for (const key of own) if (!compiled.has(key)) throw new Error(`英雄缺少完整技能或演出：${key}`);
    if (uploadedKey && !compiled.has(uploadedKey)) throw new Error("英雄缺少固定模型資料。");
    for (const asset of pkg.assets) {
      if (!(asset.bytes instanceof Uint8Array)) throw new Error(`英雄資產缺少位元組：${asset.path}`);
      const entry = manifest.entries.find((entry) => entry.path === asset.path && entry.role === "asset");
      if (!entry?.mime) throw new Error(`英雄資產沒有媒體格式：${asset.path}`);
      const fact = zAsset.parse({ path: asset.path, contentSha256: entry.contentSha256, bytes: asset.bytes.length, mime: entry.mime });
      const existing = assetFacts.get(asset.path);
      if (existing && contentSha256(existing) !== contentSha256(fact)) throw new Error(`同局英雄的資產路徑衝突：${asset.path}`);
      if (!existing) {
        totalBytes += fact.bytes;
        if (totalBytes > MAX_COMMUNITY_ROOM_ASSET_BYTES) throw new Error("社群英雄合計資產超過房間容量上限。");
        assetFacts.set(asset.path, fact); assets.set(asset.path, asset.bytes);
      }
    }
  }
  const identity: Omit<CommunityRoomManifest, "digest"> = { schema: "ggd-community-room@1", baseContentDigest: input.base.digest, target, heroes: pins, assets: [...assetFacts.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0) };
  const manifest = verifyCommunityRoomManifest({ ...identity, digest: communityManifestDigest(identity) });
  if (input.expected && contentSha256(verifyCommunityRoomManifest(input.expected)) !== contentSha256(manifest)) throw new Error("下載內容與房間固定清單不同，無法進場。");
  const context = extendRegistryContext(input.base.context, manifest.digest, () => registerAll(overlay, { representation: "verified-runtime", onTemplateFailure: "throw" }));
  return { context, manifest, assets, documents };
}
