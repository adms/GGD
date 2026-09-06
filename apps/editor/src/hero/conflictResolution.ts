import { HERO_SLOTS } from "@ggd/shared/content/heroForge/constants";
import type { HeroWork } from "@ggd/shared/content/communityHero";
import { sniffImageHeader } from "@ggd/shared/content/icons/encodeIcon";
import { autosave } from "../drafts/session";
import { localIconAssetPath, localIconSourcePath } from "../local-icons/model";
import { putStagedLocalIconVersion } from "../local-icons/storage";
import { heroEditFingerprint, localDraftFromCloud, saveHeroLocalCopy, syncHeroDraft } from "./communityDrafts";
import { heroOriginalIcons, heroTransferDraft } from "./draftAssets";
import { copyHeroProjectDraft } from "./remix";
import { useHeroAccount } from "./communitySession";
import { useHeroStore, type HeroDraftPayload } from "./store";

export type HeroConflictChoice = "local" | "remote" | "new-work";

/** A private draft may be incomplete; copying never runs publish validation. */
export async function copyHeroDraftAsNew(value: HeroDraftPayload, projectId: string): Promise<HeroDraftPayload> {
  const copy: HeroDraftPayload = {
    project: copyHeroProjectDraft(value.project, projectId), rawInputs: structuredClone(value.rawInputs),
    mode: value.mode, origin: value.origin, originalIconRefs: {},
    ...(value.modelDraft ? { modelDraft: structuredClone(value.modelDraft) } : {}),
    ...(value.source ? { source: structuredClone(value.source) } : {}),
  };
  for (const icon of await heroOriginalIcons(value)) {
    const slot = HERO_SLOTS.find((slot) => icon.kind === "abilities" && icon.docId === `${value.project.projectId}.${slot.toLowerCase()}`);
    const header = sniffImageHeader(new Uint8Array(await icon.blob.arrayBuffer()));
    if (!header || !slot && icon.kind !== "champions") throw new Error("草稿原圖身分或格式無法驗證，原作品仍保留。");
    const docId = icon.kind === "champions" ? projectId : `${projectId}.${slot!.toLowerCase()}`;
    const contentPath = localIconAssetPath(icon.kind, docId);
    await putStagedLocalIconVersion({ ...icon, docId, contentPath, sourcePath: localIconSourcePath(icon.kind, docId, header.format), baseSha256: null });
    copy.originalIconRefs![`${icon.kind}/${docId}`] = icon.contentSha256;
    if (icon.kind === "champions") copy.project.presentation.championIcon = contentPath;
    else copy.project.presentation.slots[slot!].icon = contentPath;
    for (const lock of copy.project.presentation.assetLocks) if (lock.path === icon.contentPath) lock.path = contentPath;
  }
  return copy;
}

/** Preserve both sides durably before replacing cloud content or switching editor.
 * The reviewed remote revision is the CAS token; a second conflict is returned to
 * the UI without retrying against a revision the author has never compared.
 */
export async function resolveHeroDraftConflict(remote: HeroWork, accountId: string, choice: HeroConflictChoice): Promise<void> {
  const start = useHeroStore.getState();
  if (!start.key || !start.value || remote.id !== start.value.project.projectId || remote.ownerId !== accountId) throw new Error("衝突資料不屬於目前作品與帳號。");
  const value = structuredClone(start.value); const fingerprint = heroEditFingerprint(value);
  const current = () => {
    const live = useHeroStore.getState();
    if (useHeroAccount.getState().account?.id !== accountId || live.key !== start.key || !live.value || heroEditFingerprint(live.value) !== fingerprint) {
      throw new Error("處理期間作品、內容或帳號已切換；原稿仍保留，請重新比較後再選擇。");
    }
  };
  current();
  const captured = await heroTransferDraft(value); current();
  const pinned = { ...value, originalIconRefs: captured.originalIconRefs };
  saveHeroLocalCopy(pinned); // Includes unfinished text and exact original-image revisions.
  const remoteCopy = await localDraftFromCloud(remote, accountId);
  await autosave.flush(); current();
  if (choice === "remote") { useHeroStore.getState().open(remoteCopy); return; }
  if (choice === "local") {
    await syncHeroDraft({ ...pinned, source: remote.source, cloud: { accountId, revision: remote.draftRevision } }, accountId);
    await autosave.flush(); return;
  }
  const payload = await copyHeroDraftAsNew({ ...pinned, source: remote.source }, `hero-${crypto.randomUUID()}`);
  current();
  const copy = saveHeroLocalCopy(payload, `hero/${payload.project.projectId}`);
  await autosave.flush(); current();
  useHeroStore.getState().open(copy);
}
