import { useEffect, useState } from "react";
import { HERO_STATUS_LABELS, zHeroReviewView, zHeroSnapshot, zHeroWork, type HeroReviewView, type HeroWork } from "@ggd/shared/content/communityHero";
import { ApiError } from "../../../admin/src/session";
import { autosave } from "../drafts/session";
import { heroPlatform, loginHeroAccount, logoutHeroAccount, restoreHeroAccount, useHeroAccount } from "./communitySession";
import { heroEditFingerprint, localDraftFromCloud, syncHeroDraft } from "./communityDrafts";
import { useHeroStore, type HeroDraftPayload } from "./store";
import type { HeroPackageInspection } from "./packageClient";

export function HeroAccountBar() {
  const { account } = useHeroAccount();
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { void restoreHeroAccount().catch((error: unknown) => setError(String(error))); }, []);
  if (account) return <div className="hero-actions"><span>雲端帳號：{account.username}</span><button type="button" onClick={() => void logoutHeroAccount().catch((error: unknown) => setError(String(error)))}>登出雲端</button>{error ? <p role="alert">{error}</p> : null}</div>;
  return <form className="hero-actions" onSubmit={(event) => {
    event.preventDefault(); setBusy(true); setError(null);
    void loginHeroAccount(username, password).catch((error: unknown) => setError(String(error))).finally(() => { setBusy(false); setPassword(""); });
  }}><label>遊戲帳號<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label><label>密碼<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><button disabled={busy || !username || !password}>登入以同步與投稿</button>{error ? <p role="alert">{error}</p> : null}</form>;
}

export function HeroCommunityPanel({ value, prepared }: { value: HeroDraftPayload; prepared: { zip: Blob; inspection: HeroPackageInspection } | null }) {
  const { account } = useHeroAccount(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState<HeroWork | null>(null); const [review, setReview] = useState<HeroReviewView | null>(null); const [allowRemix, setAllowRemix] = useState(value.submission?.allowAttributionRemix ?? false);
  useEffect(() => { setAllowRemix(value.submission?.allowAttributionRemix ?? false); }, [value.project.projectId, value.submission?.id]);
  const readReview = async (id: string) => setReview(zHeroReviewView.parse(await heroPlatform.request(`/hero-submissions/${encodeURIComponent(id)}`)));
  useEffect(() => { setConflict(null); setReview(null); if (account && value.submission?.id) void readReview(value.submission.id).catch((error: unknown) => setMessage(String(error))); }, [account?.id, value.project.projectId, value.submission?.id]);
  const run = async (task: () => Promise<void>) => {
    setBusy(true); setMessage(null);
    try { await task(); }
    catch (error) {
      setMessage(String(error));
      if (error instanceof ApiError && error.status === 409 && account) {
        try { const result = await heroPlatform.request<{ work: unknown }>(`/hero-works/${encodeURIComponent(value.project.projectId)}`); setConflict(zHeroWork.parse(result.work)); } catch { /* Keep the original conflict and all local edits. */ }
      }
    } finally { setBusy(false); }
  };
  return <section className="hero-community" aria-label="雲端保存與社群投稿">
    <h3>雲端保存與社群投稿</h3><HeroAccountBar />
    {value.source ? <p>署名改作 · 原作者：{value.source.authorId} · 來源作品：{value.source.workId} · 固定來源版本：{value.source.submissionId}</p> : null}
    {account ? <>
      <p>{value.cloud?.accountId === account.id ? heroEditFingerprint(value) === value.cloud.localFingerprint ? `已同步至雲端第 ${value.cloud.revision} 版` : "本機有尚未同步的修改" : "目前只有本機草稿"}。同步草稿與投稿審查是分開的步驟。</p>
      <button type="button" disabled={busy || !!conflict} onClick={() => void run(async () => { await syncHeroDraft(value, account.id); setMessage("草稿與引用的圖片已同步。"); })}>同步雲端草稿</button>
      <label><input type="checkbox" checked={allowRemix} disabled={busy} onChange={(event) => setAllowRemix(event.target.checked)} />允許其他玩家在署名原作者與來源版本後改作此發布版本</label>
      <button type="button" className="hero-primary" disabled={busy || !prepared || !!conflict} onClick={() => void run(async () => {
        if (!prepared) return;
        await syncHeroDraft(value, account.id);
        const state = useHeroStore.getState(); const current = state.value;
        if (!current || current.project.projectId !== value.project.projectId || useHeroAccount.getState().account?.id !== account.id) throw new Error("目前作品或登入帳號已切換；草稿仍保留，請回到原作品重新送審。");
        const prior = current.submission;
        const submission = prior?.packageDigest === prepared.inspection.packageDigest && prior.allowAttributionRemix === allowRemix ? prior : { operationId: crypto.randomUUID(), packageDigest: prepared.inspection.packageDigest, allowAttributionRemix: allowRemix };
        state.commit({ ...current, submission }); await autosave.flush();
        const response = await heroPlatform.binaryResponse("/hero-submissions", prepared.zip, { contentType: "application/zip", headers: { "x-ggd-work-id": value.project.projectId, "x-ggd-operation-id": submission.operationId, "x-ggd-allow-attribution-remix": String(allowRemix) } });
        const snapshot = zHeroSnapshot.parse(await response.json());
        const latest = useHeroStore.getState(); if (latest.value?.project.projectId === value.project.projectId) latest.commit({ ...latest.value, submission: { ...submission, id: snapshot.id } });
        await readReview(snapshot.id); setMessage("完整英雄已送審，後續修改會保留在草稿，不會改寫這份投稿。");
      })}>提交這份完整英雄審查</button>
      {!prepared ? <p>先建立完整英雄 ZIP，檢查正規化圖片後即可投稿。</p> : null}
      {conflict ? <div role="alert"><p>雲端已有第 {conflict.draftRevision} 版。這台裝置的修改仍保留，請先開啟雲端副本比較。</p><button type="button" onClick={() => void run(async () => { const draft = await localDraftFromCloud(conflict, account.id); useHeroStore.getState().open(draft); setConflict(null); })}>將雲端版開啟為本機副本</button></div> : null}
      {review ? <div><h4>投稿結果：{HERO_STATUS_LABELS[review.status]}</h4><p>{review.decision?.reason}</p>{review.decision?.problems?.map((problem, index) => <p key={index}>{problem.slot} {problem.field}：{problem.message}</p>)}<button type="button" disabled={busy} onClick={() => void run(() => readReview(review.snapshot.id))}>更新審查結果</button></div> : null}
    </> : <p>未登入時可繼續離線創作與本機保存。</p>}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
