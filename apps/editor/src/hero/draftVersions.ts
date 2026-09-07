import { zHeroWork, type HeroWork } from "@ggd/shared/content/communityHero";
import { autosave } from "../drafts/session";
import { heroEditFingerprint, localDraftFromCloud, saveHeroLocalCopy } from "./communityDrafts";
import { heroTransferDraft } from "./draftAssets";
import { heroPlatform, useHeroAccount } from "./communitySession";
import { useHeroStore, type HeroDraftPayload } from "./store";

/** Restore adds a cloud revision. Preserve unsynced input and verify historical
 * asset recovery before the request; never retry a changed cloud head unseen. */
export async function restoreHeroDraftVersion(selected: HeroWork, accountId: string, expectedRevision: number): Promise<HeroWork> {
  const start = useHeroStore.getState();
  if (!start.key || !start.value || selected.id !== start.value.project.projectId || selected.ownerId !== accountId || !selected.draftVersion) throw new Error("歷史版本不屬於目前作品與帳號。");
  const value = structuredClone(start.value); const fingerprint = heroEditFingerprint(value);
  const current = () => {
    const live = useHeroStore.getState();
    if (useHeroAccount.getState().account?.id !== accountId || live.key !== start.key || !live.value || heroEditFingerprint(live.value) !== fingerprint) throw new Error("回復期間作品、內容或帳號已切換；副本仍保留，請重新讀取雲端版本。");
  };
  current();
  const captured = await heroTransferDraft(value); current();
  saveHeroLocalCopy({ ...value, originalIconRefs: captured.originalIconRefs });
  const historicalCopy = await localDraftFromCloud(selected, accountId);
  await autosave.flush(); current();
  const restored = zHeroWork.parse(await heroPlatform.request(`/hero-works/${encodeURIComponent(selected.id)}/draft-versions/${encodeURIComponent(selected.draftVersion)}/restore`, { body: { expectedRevision } }));
  if (restored.id !== selected.id || restored.ownerId !== accountId || restored.draftDigest !== selected.draftDigest || restored.draftRevision !== expectedRevision + 1) throw new Error("雲端回復回應與選定版本不符；副本仍保留，請重新讀取雲端作品。");
  // The request may have committed even if the author switched tabs/accounts.
  // Do not switch their current editor or reuse another account's credentials.
  current();
  const payload = historicalCopy.payload as HeroDraftPayload;
  payload.cloud = { accountId, revision: restored.draftRevision, localFingerprint: heroEditFingerprint(payload) };
  payload.submission = value.submission;
  const copy = saveHeroLocalCopy(payload);
  await autosave.flush(); current();
  useHeroStore.getState().open(copy);
  return restored;
}
