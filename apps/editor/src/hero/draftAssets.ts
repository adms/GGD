import { HERO_SLOTS } from "@ggd/shared/content/heroForge/constants";
import { sha256Bytes } from "@ggd/shared/content/sha256";
import { resolveIconUpload, zConfigIconUploadDoc } from "@ggd/shared/content/schema/config/iconUpload";
import bundledIconPolicy from "../../../../content/config/icon-upload.json";
import { stageLocalIcon, type StagedLocalIcon } from "../local-icons/model";
import { getStagedLocalIcon, getStagedLocalIconVersion, putStagedLocalIconVersion, getNormalizedIcon, rememberNormalizedIcon } from "../local-icons/storage";
import type { HeroDraftPayload } from "./store";
import { zHeroModelDraft, loadHeroModelBytes, saveHeroModelBytes, heroModelFileRefs } from "./modelAssets";
import { MODEL_UPLOAD_LIMITS, parseUploadGlb } from "@ggd/shared/content/modelUpload/glb";

type OriginalIcon = Omit<StagedLocalIcon, "blob"> & { base64: string };
export interface HeroTransferDraft extends HeroDraftPayload { originalIcons: OriginalIcon[]; normalizedIcons: { path: string; base64: string; sha256: string }[]; modelFiles?: { sha256: string; base64: string }[] }
export function heroIconOwners(project: HeroDraftPayload["project"]) {
  return [{ kind: "champions" as const, docId: project.projectId, path: project.presentation.championIcon }, ...HERO_SLOTS.map((slot) => ({ kind: "abilities" as const, docId: `${project.projectId}.${slot.toLowerCase()}`, path: project.presentation.slots[slot].icon }))];
}
export async function heroOriginalIcons(value: HeroDraftPayload): Promise<StagedLocalIcon[]> {
  const icons: StagedLocalIcon[] = [];
  for (const owner of heroIconOwners(value.project)) {
    if (owner.path !== `assets/icons/${owner.kind}/${owner.docId}.webp`) continue;
    const hash = value.originalIconRefs?.[`${owner.kind}/${owner.docId}`];
    const icon = hash ? await getStagedLocalIconVersion(owner, hash) : await getStagedLocalIcon(owner);
    if (!icon) throw new Error("找不到這一版作品的原始圖片，請從備份恢復或重新選圖。");
    await putStagedLocalIconVersion(icon); icons.push(icon);
  }
  return icons;
}
function encodeBase64(bytes: Uint8Array): string { let text = ""; for (let offset = 0; offset < bytes.length; offset += 8192) text += String.fromCharCode(...bytes.subarray(offset, offset + 8192)); return btoa(text); }
function decodeBase64(value: string): Uint8Array { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }
export async function heroTransferDraft(value: HeroDraftPayload, options: { includeModels?: boolean } = {}): Promise<HeroTransferDraft> {
  const originalIcons: OriginalIcon[] = [];
  const originalIconRefs = { ...value.originalIconRefs };
  for (const icon of await heroOriginalIcons(value)) {
    const { blob, ...metadata } = icon; const bytes = new Uint8Array(await blob.arrayBuffer());
    if (`sha256:${sha256Bytes(bytes)}` !== icon.contentSha256 || bytes.length !== icon.bytes) throw new Error("原圖版本完整性檢查失敗。");
    originalIcons.push({ ...metadata, base64: encodeBase64(bytes) }); originalIconRefs[`${icon.kind}/${icon.docId}`] = icon.contentSha256;
  }
  const normalizedIcons: HeroTransferDraft["normalizedIcons"] = [];
  for (const path of new Set(heroIconOwners(value.project).map((owner) => owner.path))) {
    if (!path?.startsWith("assets/icons/community/")) continue;
    const blob = await getNormalizedIcon(path); if (!blob) throw new Error("正規化圖片尚未保存在這台裝置，請重新回讀完整英雄 ZIP。");
    const bytes = new Uint8Array(await blob.arrayBuffer()); const sha256 = sha256Bytes(bytes);
    if (path !== `assets/icons/community/${sha256}.webp`) throw new Error("正規化圖片完整性檢查失敗。");
    normalizedIcons.push({ path, sha256, base64: encodeBase64(bytes) });
  }
  const { cloud: _cloud, submission: _submission, ...draft } = value;
  const modelFiles: NonNullable<HeroTransferDraft["modelFiles"]> = [];
  if (options.includeModels !== false) for (const ref of heroModelFileRefs(value)) {
    const bytes = await loadHeroModelBytes(ref.sha256); if (bytes.length !== ref.bytes) throw new Error("模型原檔與草稿大小不符。");
    modelFiles.push({ sha256: ref.sha256, base64: encodeBase64(bytes) });
  }
  return { ...draft, originalIconRefs, originalIcons, normalizedIcons, ...(modelFiles.length ? { modelFiles } : {}) };
}

export async function restoreHeroDraftAssets(raw: HeroDraftPayload & Partial<HeroTransferDraft>): Promise<HeroDraftPayload> {
  const owners = heroIconOwners(raw.project); const refs = { ...raw.originalIconRefs };
  const modelDraft = raw.modelDraft ? zHeroModelDraft.parse(raw.modelDraft) : undefined;
  const modelRefs = new Map(heroModelFileRefs(raw).map((ref) => [ref.sha256, ref]));
  const modelFiles = raw.modelFiles ?? [];
  if (!Array.isArray(modelFiles) || modelFiles.length > 7 || new Set(modelFiles.map((file) => file.sha256)).size !== modelFiles.length) throw new Error("模型備份集合不合法。");
  let modelBytes = 0;
  const checkedModels: { sha256: string; bytes: Uint8Array }[] = [];
  for (const file of modelFiles) {
    if (!modelRefs.has(file.sha256) || typeof file.base64 !== "string" || file.base64.length > Math.ceil(MODEL_UPLOAD_LIMITS.fileBytes / 3) * 4) throw new Error("模型備份不屬於這份草稿或超過大小上限。");
    const bytes = decodeBase64(file.base64); modelBytes += bytes.length;
    if (modelBytes > 128 * 1024 * 1024 || bytes.length !== modelRefs.get(file.sha256)!.bytes || sha256Bytes(bytes) !== file.sha256) throw new Error("模型備份超過上限或完整性檢查失敗。");
    parseUploadGlb(bytes); checkedModels.push({ sha256: file.sha256, bytes });
  }
  for (const [sha256, ref] of modelRefs) if (!checkedModels.some((file) => file.sha256 === sha256) && (await loadHeroModelBytes(sha256)).length !== ref.bytes) throw new Error("本機模型與草稿大小不符。");
  if (!Array.isArray(raw.originalIcons ?? []) || !Array.isArray(raw.normalizedIcons ?? []) || (raw.originalIcons?.length ?? 0) > 7 || (raw.normalizedIcons?.length ?? 0) > 7) throw new Error("草稿圖片集合不合法。");
  const maxSourceEdge = resolveIconUpload(zConfigIconUploadDoc.parse(bundledIconPolicy)).maxSourceEdge;
  for (const source of raw.originalIcons ?? []) {
    const owner = owners.find((owner) => owner.kind === source.kind && owner.docId === source.docId && owner.path === source.contentPath);
    if (!owner || typeof source.base64 !== "string" || source.base64.length > 28 * 1024 * 1024) throw new Error("草稿原圖不屬於這個英雄。");
    const bytes = decodeBase64(source.base64);
    const file = new File([Uint8Array.from(bytes)], source.sourceName, { type: source.mimeType });
    const staged = await stageLocalIcon(owner.kind, owner.docId, file, { maxSourceEdge, baseSha256: null });
    if (staged.contentSha256 !== source.contentSha256 || (refs[`${owner.kind}/${owner.docId}`] && refs[`${owner.kind}/${owner.docId}`] !== source.contentSha256)) throw new Error("草稿原圖與固定版本不符。");
    await putStagedLocalIconVersion(staged); refs[`${owner.kind}/${owner.docId}`] = staged.contentSha256;
  }
  for (const icon of raw.normalizedIcons ?? []) {
    if (!owners.some((owner) => owner.path === icon.path) || typeof icon.base64 !== "string" || icon.base64.length > 12 * 1024 * 1024) throw new Error("正規化圖片不屬於這個英雄。");
    const bytes = decodeBase64(icon.base64); const hash = sha256Bytes(bytes);
    if (icon.sha256 !== hash || icon.path !== `assets/icons/community/${hash}.webp`) throw new Error("正規化圖片版本不符。");
    await rememberNormalizedIcon(icon.path, new Blob([Uint8Array.from(bytes)], { type: "image/webp" }));
  }
  for (const file of checkedModels) await saveHeroModelBytes(file.bytes, modelDraft?.originals.find((ref) => ref.sha256 === file.sha256)?.name ?? "hero-body.glb");
  return { project: raw.project, rawInputs: raw.rawInputs, mode: raw.mode, origin: raw.origin, originalIconRefs: refs, ...(modelDraft ? { modelDraft } : {}), ...(raw.source ? { source: raw.source } : {}), ...(raw.cloud ? { cloud: raw.cloud } : {}) };
}
