import { HERO_SLOTS } from "@ggd/shared/content/heroForge/constants";
import { zHeroProject, type HeroProject } from "@ggd/shared/content/heroForge/schema";
import { zHeroInspection } from "@ggd/shared/content/communityHero";
import { readPackageZip } from "@ggd/shared/content/import/readPackageZip";
import { ICON_ENCODE, sniffImageHeader } from "@ggd/shared/content/icons/encodeIcon";
import { buildHeroSourcePackage, type HeroSourceIcon } from "@ggd/shared/content/import/heroSourcePackage";
import { buildRuntimePackageZip, packageZipInput, binarySha256 } from "@ggd/shared/content/import/packageZip";
import { getNormalizedIcon, rememberNormalizedIcon } from "../local-icons/storage";
import { readTargetProfileFacts } from "../export-center/exportPolicy";
import { heroPlatform } from "./communitySession";
import type { HeroDraftPayload } from "./store";
import { heroOriginalIcons } from "./draftAssets";
import { loadHeroModelBytes, saveHeroModelBytes, modelDraftFingerprint, type HeroModelDraft } from "./modelAssets";
import { uploadedHeroModelPath, HERO_MODEL_STATES } from "@ggd/shared/content/modelUpload/heroModelSchema";
import { runModelUploadJob } from "./modelUploadJob";

const BASE = "/content-api/content-import";
export type HeroPackageInspection = ReturnType<typeof zHeroInspection.parse>;

/** Published ZIPs retain the runtime body; full source libraries live in draft backups. */
export async function recoveredHeroModelDraft(project: HeroProject): Promise<HeroModelDraft | undefined> {
  const model = project.presentation.uploadedModel; if (!model) return undefined;
  const bytes = await loadHeroModelBytes(model.sha256);
  const checked = await runModelUploadJob({ kind: "verify", bytes, model });
  const ref = { sha256: model.sha256, bytes: model.byteSize, name: "hero-body.glb" };
  const draft: HeroModelDraft = { active: true, originals: [ref], working: ref, yawOffsetDeg: model.yawOffsetDeg,
    selections: Object.fromEntries(HERO_MODEL_STATES.map((state) => [state, checked.summary.clips.findIndex((clip) => clip.name === model.clipMap[state])])) as HeroModelDraft["selections"] };
  draft.appliedFingerprint = modelDraftFingerprint(draft); return draft;
}

/** Offline recovery grants no permission to publish or play. */
export async function openHeroZip(zip: Blob): Promise<HeroProject> {
  const pkg = readPackageZip(new Uint8Array(await zip.arrayBuffer()));
  const roots = pkg.manifest.selectionRoots;
  if (pkg.manifest.scope !== "community-work" || roots.length !== 1 || roots[0]?.kind !== "hero") throw new Error("這不是完整英雄作品 ZIP。");
  const path = `authoring/hero-projects/${roots[0].id}.json`;
  const project = zHeroProject.parse(pkg.documents.find((entry) => entry.path === path)?.document);
  if (project.projectId !== roots[0].id || !project.acceptedPlan || pkg.compiled.length === 0 || pkg.validation.length === 0) throw new Error("作品缺少完整英雄來源、遊戲資料或模擬紀錄。");
  if (project.presentation.uploadedModel) {
    const model = project.presentation.uploadedModel, path = uploadedHeroModelPath(model);
    const asset = pkg.assets.find((entry) => entry.path === path);
    if (!(asset?.bytes instanceof Uint8Array)) throw new Error("作品缺少固定的上傳模型。");
    const verified = await runModelUploadJob({ kind: "verify", model, bytes: asset.bytes });
    if (verified.document!.id !== project.presentation.modelKey) throw new Error("作品的模型身分與動作對應不符。");
    await saveHeroModelBytes(asset.bytes, "hero-body.glb");
  }
  for (const asset of pkg.assets) if (asset.path.startsWith("assets/icons/community/")) {
    const entry = pkg.manifest.entries.find((entry) => entry.path === asset.path)!;
    const lock = project.presentation.assetLocks.find((lock) => lock.path === asset.path);
    const header = asset.bytes instanceof Uint8Array ? sniffImageHeader(asset.bytes) : null;
    if (!(asset.bytes instanceof Uint8Array) || !lock || `sha256:${lock.sha256}` !== entry.contentSha256 || lock.byteSize !== entry.contentSize || entry.mime !== "image/webp" || header?.mime !== "image/webp" || header.width !== ICON_ENCODE.edge || header.height !== ICON_ENCODE.edge || asset.path !== `assets/icons/community/${lock.sha256}.webp`) throw new Error("作品的正規化圖片與固定資產紀錄不符。");
    await rememberNormalizedIcon(asset.path, new Blob([Uint8Array.from(asset.bytes)], { type: entry.mime }));
  }
  return project;
}

export async function checkedResponse(response: Response): Promise<Response> {
  if (response.ok) return response;
  const error = await response.json().catch(() => null) as { message?: string; diagnostics?: { message: string }[] } | null;
  throw new Error(error?.diagnostics?.map((row) => row.message).join("；") || error?.message || `服務回應 ${response.status}`);
}

export async function inspectHeroZip(zip: Blob): Promise<HeroPackageInspection> {
  const response = heroPlatform.hasSession ? await heroPlatform.binaryResponse("/hero-import/inspect", zip, { contentType: "application/zip" }) : await checkedResponse(await fetch(`${BASE}/inspect-hero-package`, { method: "POST", headers: { "content-type": "application/zip" }, body: zip }));
  const result = zHeroInspection.parse(await response.json());
  await rememberHeroInspectionIcons(result);
  return result;
}

export async function rememberHeroInspectionIcons(result: HeroPackageInspection): Promise<void> {
  for (const icon of result.icons) if (icon.path.startsWith("assets/icons/community/")) {
    const bytes = Uint8Array.from(atob(icon.base64), (char) => char.charCodeAt(0));
    const lock = result.project.presentation.assetLocks.find((lock) => lock.path === icon.path);
    const header = sniffImageHeader(bytes);
    if (await binarySha256(bytes) !== icon.contentSha256 || !lock || icon.contentSha256 !== `sha256:${lock.sha256}` || lock.byteSize !== bytes.length || icon.path !== `assets/icons/community/${lock.sha256}.webp` || icon.mime !== "image/webp" || header?.mime !== "image/webp" || header.width !== ICON_ENCODE.edge || header.height !== ICON_ENCODE.edge) throw new Error("回讀的圖片與固定資產紀錄不符。");
    await rememberNormalizedIcon(icon.path, new Blob([bytes], { type: icon.mime }));
  }
}

export async function prepareHeroZip(value: HeroDraftPayload): Promise<{ zip: Blob; inspection: HeroPackageInspection }> {
  const project = value.project;
  const profile = heroPlatform.hasSession ? await heroPlatform.request("/hero-import/target-profile") : await (await checkedResponse(await fetch(`${BASE}/active/target-profile`))).json();
  const facts = readTargetProfileFacts(profile);
  if (!facts.gameRevision || !facts.contentVersion || !facts.migrationFingerprint || !facts.authoringProcessorFingerprint) throw new Error("目前目標未提供完整建置資料，請連線至支援英雄作品的 Main。");
  const icons: HeroSourceIcon[] = [];
  for (const icon of await heroOriginalIcons(value)) {
    const slot = HERO_SLOTS.find((slot) => icon.kind === "abilities" && icon.docId === `${project.projectId}.${slot.toLowerCase()}`);
    const pointer = icon.kind === "champions" && icon.docId === project.projectId ? project.presentation.championIcon : slot ? project.presentation.slots[slot].icon : null;
    if (pointer !== icon.contentPath) continue;
    const bytes = new Uint8Array(await icon.blob.arrayBuffer());
    if (bytes.length !== icon.bytes || await binarySha256(bytes) !== icon.contentSha256) throw new Error("本機原圖已損壞，請重新選圖。");
    icons.push({ path: icon.sourcePath, collection: icon.kind as "champions" | "abilities", id: icon.docId, mime: icon.mimeType, bytes });
  }
  const cached = new Set<string>();
  for (const owner of [{ collection: "champions" as const, id: project.projectId, path: project.presentation.championIcon }, ...HERO_SLOTS.map((slot) => ({ collection: "abilities" as const, id: `${project.projectId}.${slot.toLowerCase()}`, path: project.presentation.slots[slot].icon }))]) {
    if (!owner.path?.startsWith("assets/icons/community/") || cached.has(owner.path)) continue;
    const blob = await getNormalizedIcon(owner.path);
    if (!blob) throw new Error("這份草稿的正規化圖片尚未保存到本機；請重新開啟完整英雄 ZIP 或從雲端草稿恢復，再建立投稿。");
    cached.add(owner.path); icons.push({ path: owner.path, collection: owner.collection, id: owner.id, mime: "image/webp", bytes: new Uint8Array(await blob.arrayBuffer()) });
  }
  const modelBytes = project.presentation.uploadedModel ? await loadHeroModelBytes(project.presentation.uploadedModel.sha256) : undefined;
  const source = buildHeroSourcePackage(project, icons, { gameRevision: facts.gameRevision, contentVersion: facts.contentVersion, migrationFingerprint: facts.migrationFingerprint, processorFingerprint: facts.authoringProcessorFingerprint }, modelBytes);
  const upload = await buildRuntimePackageZip(packageZipInput(source, project.projectId));
  const sourceZip = new Blob([Uint8Array.from(upload.bytes)], { type: "application/zip" });
  const response = heroPlatform.hasSession ? await heroPlatform.binaryResponse("/hero-import/build", sourceZip, { contentType: "application/zip" }) : await checkedResponse(await fetch(`${BASE}/hero-package`, { method: "POST", headers: { "content-type": "application/zip" }, body: sourceZip }));
  const zip = await response.blob();
  return { zip, inspection: await inspectHeroZip(zip) };
}

export function downloadHeroFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
