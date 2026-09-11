import { useEffect, useState } from "react";
import { HERO_STATUS_LABELS, zHeroIntakePolicy, zHeroReviewView, zHeroSnapshot, zHeroWork, type HeroIntakePolicy, type HeroReviewView, type HeroWork } from "@ggd/shared/content/communityHero";
import { ApiError } from "../../../admin/src/session";
import { autosave } from "../drafts/session";
import { heroPlatform, loginHeroAccount, logoutHeroAccount, restoreHeroAccount, useHeroAccount } from "./communitySession";
import { heroEditFingerprint, syncHeroDraft } from "./communityDrafts";
import { resolveHeroDraftConflict } from "./conflictResolution";
import { HeroDraftComparison, HeroDraftConflictView } from "./HeroDraftConflictView";
import { HeroWithdrawAction } from "./HeroWithdrawAction";
import { HeroDraftVersionsPanel } from "./HeroDraftVersionsPanel";
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

export function HeroCommunityPanel({ value, prepared }: { value: HeroDraftPayload; prepared: { zip: Blob; inspection: HeroPackageInspection; canonicalTakeover?: boolean } | null }) {
  const { account } = useHeroAccount(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState<HeroWork | null>(null); const [review, setReview] = useState<HeroReviewView | null>(null); const [allowRemix, setAllowRemix] = useState(value.submission?.allowAttributionRemix ?? false);
  const [policy, setPolicy] = useState<HeroIntakePolicy | null>(null);
  const archiveLimit = policy ? value.project.presentation.uploadedModel && policy.modelMaxBytes ? policy.modelMaxBytes : policy.maxBytes : 0;
  const readPolicy = async () => {
    const result = zHeroIntakePolicy.parse(await heroPlatform.request("/hero-submissions/policy"));
    if (useHeroAccount.getState().account?.id === account?.id) setPolicy(result);
  };
  useEffect(() => { setPolicy(null); if (account) void readPolicy().catch((error: unknown) => { if (useHeroAccount.getState().account?.id === account.id) setMessage(String(error)); }); }, [account?.id]);
  useEffect(() => { setAllowRemix(value.submission?.allowAttributionRemix ?? false); }, [value.project.projectId, value.submission?.id]);
  const readReview = async (id: string) => {
    const result = zHeroReviewView.parse(await heroPlatform.request(`/hero-submissions/${encodeURIComponent(id)}`));
    if (useHeroAccount.getState().account?.id === account?.id && useHeroStore.getState().value?.project.projectId === value.project.projectId) setReview(result);
  };
  useEffect(() => { setConflict(null); setReview(null); if (account && value.submission?.id) void readReview(value.submission.id).catch((error: unknown) => setMessage(String(error))); }, [account?.id, value.project.projectId, value.submission?.id]);
  const run = async (task: () => Promise<void>) => {
    const key = useHeroStore.getState().key;
    const stillCurrent = () => useHeroAccount.getState().account?.id === account?.id && useHeroStore.getState().key === key;
    setBusy(true); setMessage(null);
    try { await task(); }
    catch (error) {
      if (stillCurrent()) setMessage(String(error));
      if (error instanceof ApiError && error.status === 409 && account && stillCurrent()) {
        try { const result = await heroPlatform.request<{ work: unknown }>(`/hero-works/${encodeURIComponent(value.project.projectId)}`); if (stillCurrent()) setConflict(zHeroWork.parse(result.work)); } catch { /* Keep the original conflict and all local edits. */ }
      }
    } finally { setBusy(false); }
  };
  return <section className="hero-community" aria-label="雲端保存與社群投稿">
    <h3>雲端保存與社群投稿</h3><HeroAccountBar />
    {value.source ? <p>署名改作 · 原作者：{value.source.authorId} · 來源作品：{value.source.workId} · 固定來源版本：{value.source.submissionId}</p> : null}
    {account ? <>
      <p>{value.cloud?.accountId === account.id ? heroEditFingerprint(value) === value.cloud.localFingerprint ? `已同步至雲端第 ${value.cloud.revision} 版` : "本機有尚未同步的修改" : "目前只有本機草稿"}。同步草稿與投稿審查是分開的步驟。</p>
      <button type="button" disabled={busy || !!conflict} onClick={() => void run(async () => { await syncHeroDraft(value, account.id); setMessage("草稿、圖片及模型原檔已同步。"); })}>同步雲端草稿</button>
      <HeroDraftVersionsPanel key={`${account.id}/${value.project.projectId}`} value={value} accountId={account.id} busy={busy || !!conflict} run={run} />
      <label><input type="checkbox" checked={allowRemix} disabled={busy} onChange={(event) => setAllowRemix(event.target.checked)} />允許其他玩家在署名原作者與來源版本後改作此發布版本</label>
      {policy ? <p>投稿目前{policy.enabled ? "開放" : "關閉"}；同帳號最多 {policy.maxPendingPerPlayer} 份待審，每日最多 {policy.quotaPerPlayerPerDay} 次新版本投稿（同一英雄的修正版另計；相同版本重試不重複計數；UTC 00:00 重置），此作品 ZIP 上限 {(archiveLimit / 1024 / 1024).toFixed(2)} MiB。撤回不會退還當日投稿次數。英雄仍須由管理員審查發布。</p> : <p>尚未取得投稿政策；可繼續保存草稿。</p>}
      <button type="button" disabled={busy} onClick={() => void run(readPolicy)}>更新投稿政策</button>
      {value.project.presentation.uploadedModel && policy?.modelUploadsEnabled === false ? <p>目前暫停上傳模型的新投稿，本機草稿與原檔仍可保存。</p> : null}
      <button type="button" className="hero-primary" disabled={busy || !prepared || !!conflict || !policy?.enabled || (value.project.presentation.uploadedModel && !policy.modelUploadsEnabled) || prepared.zip.size > archiveLimit} onClick={() => void run(async () => {
        if (!prepared) return;
        await syncHeroDraft(value, account.id);
        const state = useHeroStore.getState(); const current = state.value;
        if (!current || current.project.projectId !== value.project.projectId || useHeroAccount.getState().account?.id !== account.id) throw new Error("目前作品或登入帳號已切換；草稿仍保留，請回到原作品重新送審。");
        const prior = current.submission;
        const submission = prior?.packageDigest === prepared.inspection.packageDigest && prior.allowAttributionRemix === allowRemix ? prior : { operationId: crypto.randomUUID(), packageDigest: prepared.inspection.packageDigest, allowAttributionRemix: allowRemix };
        state.commit({ ...current, submission }); await autosave.flush();
        if (prepared.canonicalTakeover && account.roles?.includes("admin") !== true) throw new Error("這份 canonical 接管 ZIP 只能由管理員送審。");
        const response = await heroPlatform.binaryResponse(prepared.canonicalTakeover ? "/admin/hero-submissions/takeover" : "/hero-submissions", prepared.zip, { contentType: "application/zip", headers: { "x-ggd-work-id": value.project.projectId, "x-ggd-operation-id": submission.operationId, "x-ggd-allow-attribution-remix": String(allowRemix) } });
        const snapshot = zHeroSnapshot.parse(await response.json());
        const latest = useHeroStore.getState(); if (latest.value?.project.projectId === value.project.projectId) latest.commit({ ...latest.value, submission: { ...submission, id: snapshot.id } });
        await readReview(snapshot.id); setMessage("完整英雄已送審，後續修改會保留在草稿，不會改寫這份投稿。");
      })}>{prepared?.canonicalTakeover ? "提交 canonical 接管審查" : "提交這份完整英雄審查"}</button>
      {!prepared ? <p>先建立完整英雄 ZIP，檢查正規化圖片後即可投稿。</p> : null}
      {prepared && policy && prepared.zip.size > archiveLimit ? <p role="alert">目前 ZIP 超過投稿大小上限；原稿與本機匯出仍可保存。</p> : null}
      {conflict ? <HeroDraftConflictView local={value} remote={conflict} busy={busy} onChoose={(choice) => void run(async () => {
        await resolveHeroDraftConflict(conflict, account.id, choice);
        setConflict(null);
        setMessage(choice === "local" ? "本機版本已同步；原本的雲端版保存在我的作品副本中。" : choice === "remote" ? "已開啟雲端副本；原本的本機修改仍保留。" : "已另存新的本機作品；原雲端作品保持原樣，可單獨同步新作。");
      })} /> : null}
      {review ? <div><h4>投稿結果：{HERO_STATUS_LABELS[review.status]}</h4><p>{review.decision?.reason}</p>{review.decision?.problems?.map((problem, index) => <p key={index}>{problem.slot} {problem.field}：{problem.message}</p>)}<button type="button" disabled={busy} onClick={() => void run(() => readReview(review.snapshot.id))}>更新審查結果</button><HeroWithdrawAction review={review} disabled={busy} onChange={setReview} /></div> : null}
      {review ? <details><summary>與這份投稿比較</summary><p>比較目前草稿與固定投稿 {review.snapshot.id}。投稿不含未完成輸入；圖片顯示當時送審的正規化版本。</p>
        <HeroDraftComparison local={value} remote={{ project: review.snapshot.inspection.project, rawInputs: {}, mode: value.mode, origin: review.snapshot.inspection.project.acceptedPlan?.origin ?? value.origin, source: review.snapshot.source, normalizedIcons: review.snapshot.inspection.icons }} remoteLabel="固定投稿" />
      </details> : null}
    </> : <p>未登入時可繼續離線創作與本機保存。</p>}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
