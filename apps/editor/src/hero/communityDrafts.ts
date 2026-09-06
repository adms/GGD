import { zHeroWork, type HeroWork } from "@ggd/shared/content/communityHero";
import { createLocalDraft, draftFingerprint, type LocalDraft } from "../drafts/repository";
import { enqueueDraft } from "../drafts/session";
import { heroTransferDraft, restoreHeroDraftAssets, type HeroTransferDraft } from "./draftAssets";
import { heroPlatform, useHeroAccount } from "./communitySession";
import { useHeroStore, type HeroDraftPayload } from "./store";

export function heroEditFingerprint(value: HeroDraftPayload): string {
  const { project, rawInputs = {}, mode, origin, originalIconRefs = {}, source } = value;
  return draftFingerprint({ project, rawInputs, mode, origin, originalIconRefs, ...(source ? { source } : {}) });
}
export async function syncHeroDraft(value: HeroDraftPayload, accountId: string): Promise<HeroWork> {
  const fingerprint = heroEditFingerprint(value);
  const payload = await heroTransferDraft(value);
  if (new TextEncoder().encode(JSON.stringify(payload)).length > 2 * 1024 * 1024) throw new Error("草稿與原圖超過雲端單份 2 MiB 上限；本機保存仍有效，可先下載完整草稿備份。");
  const expectedRevision = value.cloud?.accountId === accountId ? value.cloud.revision : 0;
  const work = zHeroWork.parse(await heroPlatform.request("/hero-works/draft", { body: { workId: value.project.projectId, expectedRevision, payload, ...(value.source ? { source: value.source } : {}) } }));
  const state = useHeroStore.getState(); const current = state.value;
  if (current?.project.projectId === value.project.projectId && useHeroAccount.getState().account?.id === accountId) state.commit({ ...current, cloud: { accountId, revision: work.draftRevision, localFingerprint: fingerprint } });
  return work;
}
export async function localDraftFromCloud(work: HeroWork, accountId: string): Promise<LocalDraft> {
  if (work.ownerId !== accountId) throw new Error("雲端草稿屬於另一個帳號。");
  const payload = await restoreHeroDraftAssets(work.draft as HeroTransferDraft);
  if (payload.project.projectId !== work.id) throw new Error("雲端草稿身分不符。");
  // Attribution is owned by Platform; a private draft cannot replace it.
  payload.source = work.source;
  payload.cloud = { accountId, revision: work.draftRevision, localFingerprint: heroEditFingerprint(payload) };
  return saveHeroLocalCopy(payload);
}
export function saveHeroLocalCopy(payload: HeroDraftPayload, key = `hero/${payload.project.projectId}/copy-${crypto.randomUUID()}`): LocalDraft {
  const draft = createLocalDraft(key, "hero", payload.project.revision, payload); enqueueDraft(key, "hero", payload); return draft;
}
