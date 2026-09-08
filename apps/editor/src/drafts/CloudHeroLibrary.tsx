import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { HERO_STATUS_LABELS, zHeroControl, zHeroListRow, zHeroReviewView, zHeroSnapshot, zHeroWork, type HeroListRow, type HeroReviewView, type HeroWork } from "@ggd/shared/content/communityHero";
import { HeroAccountBar } from "../hero/HeroCommunityPanel";
import { HeroWithdrawAction } from "../hero/HeroWithdrawAction";
import { heroPlatform, useHeroAccount } from "../hero/communitySession";
import { heroEditFingerprint, localDraftFromCloud, saveHeroLocalCopy, syncHeroDraft } from "../hero/communityDrafts";
import { rememberHeroInspectionIcons, downloadHeroFile, openHeroZip, recoveredHeroModelDraft } from "../hero/packageClient";
import { contentSha256 } from "@ggd/shared/content/import/jcs";
import { remixHeroDraft } from "../hero/remix";
import type { LocalDraft } from "./repository";
import { autosave } from "./session";
import { PublishedHeroPortrait } from "./PublishedHeroPortrait";

const zWorkView = z.object({ work: zHeroWork, publication: zHeroControl }).strict();

export function CloudHeroLibrary({ onOpen }: { onOpen?(draft: LocalDraft): void }) {
  const { account } = useHeroAccount();
  const [works, setWorks] = useState<HeroWork[]>([]); const [published, setPublished] = useState<HeroListRow[]>([]);
  const [review, setReview] = useState<HeroReviewView | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const generation = useRef(0);
  const run = async (action: () => Promise<void>) => {
    const token = ++generation.current; setBusy(true); setMessage(null);
    try { await action(); } catch (error) { if (token === generation.current) setMessage(String(error)); }
    finally { if (token === generation.current) setBusy(false); }
  };
  const stillSignedIn = (accountId: string) => { if (useHeroAccount.getState().account?.id !== accountId) throw new Error("登入帳號已切換，請重新選取作品。"); };
  const refresh = async () => {
    const accountId = account?.id; const token = generation.current;
    const results = await Promise.allSettled([
      accountId ? heroPlatform.request("/hero-works/mine").then((value) => z.array(zHeroWork).max(1000).parse(value)) : Promise.resolve([]),
      heroPlatform.request("/hero-works/published", { auth: false }).then((value) => z.array(zHeroListRow).max(1000).parse(value)),
    ]);
    if (token !== generation.current || accountId !== useHeroAccount.getState().account?.id) return;
    if (results[0].status === "fulfilled") setWorks(results[0].value);
    if (results[1].status === "fulfilled") setPublished(results[1].value);
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length) throw new Error(failures.map((result) => result.status === "rejected" ? String(result.reason) : "").join("；"));
  };
  useEffect(() => {
    setWorks([]); setPublished([]); setReview(null); void run(refresh);
    return () => { generation.current++; };
  }, [account?.id]);
  const openCloud = async (work: HeroWork) => {
    if (!account) return; const accountId = account.id;
    const latest = zWorkView.parse(await heroPlatform.request(`/hero-works/${encodeURIComponent(work.id)}`));
    stillSignedIn(accountId);
    const draft = await localDraftFromCloud(latest.work, accountId); await autosave.flush(); stillSignedIn(accountId); onOpen?.(draft);
  };
  const readReview = async (work: HeroWork) => {
    if (!account) return; const accountId = account.id;
    const view = zWorkView.parse(await heroPlatform.request(`/hero-works/${encodeURIComponent(work.id)}`));
    const id = view.publication.pendingSubmission || view.publication.published?.submissionId || view.publication.submissions.at(-1);
    if (!id) { setReview(null); setMessage("這份作品仍是私人草稿，尚未投稿。"); return; }
    const result = zHeroReviewView.parse(await heroPlatform.request(`/hero-submissions/${encodeURIComponent(id)}`));
    stillSignedIn(accountId); setReview(result);
  };
  const openPublished = async (row: HeroListRow) => {
    if (!account) return; const accountId = account.id;
    const snapshot = zHeroSnapshot.parse(await heroPlatform.request(`/hero-works/${encodeURIComponent(row.workId)}/source`));
    stillSignedIn(accountId);
    if (snapshot.workId !== row.workId || snapshot.id !== row.id || snapshot.version.packageDigest !== row.packageDigest) throw new Error("作品已有新的發布版本，請更新作品清單後再開啟。");
    await rememberHeroInspectionIcons(snapshot.inspection);
    if (snapshot.inspection.project.presentation.uploadedModel) {
      const response = await heroPlatform.binaryResponse(`/hero-works/${encodeURIComponent(row.workId)}/source/package`);
      stillSignedIn(accountId);
      if (response.headers.get("x-ggd-package-digest") !== snapshot.version.packageDigest) throw new Error("作品發布版本已變更，請更新清單後重試。");
      const project = await openHeroZip(await response.blob()); stillSignedIn(accountId);
      if (contentSha256(project) !== contentSha256(snapshot.inspection.project)) throw new Error("發布模型與來源作品不符。");
    }
    const modelDraft = await recoveredHeroModelDraft(snapshot.inspection.project);
    if (snapshot.accountId === accountId) {
      const current = zWorkView.parse(await heroPlatform.request(`/hero-works/${encodeURIComponent(row.workId)}`));
      stillSignedIn(accountId);
      const payload = { project: snapshot.inspection.project, rawInputs: {}, mode: "quick" as const, origin: snapshot.inspection.project.acceptedPlan?.origin ?? "鬥士" as const, ...(modelDraft ? { modelDraft } : {}), ...(snapshot.source ? { source: snapshot.source } : {}) };
      const draft = saveHeroLocalCopy({ ...payload, cloud: { accountId, revision: current.work.draftRevision } });
      await autosave.flush(); stillSignedIn(accountId); onOpen?.(draft); return;
    }
    const payload = { ...remixHeroDraft(snapshot, `hero-${crypto.randomUUID()}`), ...(modelDraft ? { modelDraft } : {}) };
    // Keep a recoverable local copy even if the source is withdrawn mid-request.
    const local = saveHeroLocalCopy(payload); await autosave.flush(); stillSignedIn(accountId);
    const work = await syncHeroDraft(payload, accountId); stillSignedIn(accountId);
    const ready = saveHeroLocalCopy({ ...payload, source: work.source, cloud: { accountId, revision: work.draftRevision, localFingerprint: heroEditFingerprint(payload) } }, local.key);
    await autosave.flush(); stillSignedIn(accountId); onOpen?.(ready);
  };
  return <section aria-label="雲端與社群作品">
    <h2>雲端與社群作品</h2><HeroAccountBar />
    <button type="button" disabled={busy} onClick={() => void run(refresh)}>更新雲端與發布清單</button>
    {message ? <p role="status">{message}</p> : null}
    {account ? <><h3>我的雲端草稿</h3><p>開啟時會建立本機副本，原本的本機修改仍保留。</p>
      {!busy && !works.length ? <p>尚未同步英雄草稿。</p> : null}
      <ul className="draft-cards">{works.map((work) => <li key={work.id}>
        <h4>{(work.draft as { project?: { brief?: { name?: string } } })?.project?.brief?.name || work.id}</h4>
        <p>雲端第 {work.draftRevision} 版 · {new Date(work.updatedAt).toLocaleString()}</p>
        {work.source ? <p>改作來源：{work.source.workId} · 作者 {work.source.authorId} · 版本 {work.source.submissionId}</p> : null}
        <button type="button" disabled={busy || !onOpen} onClick={() => void run(() => openCloud(work))}>開啟雲端草稿</button>
        <button type="button" disabled={busy} onClick={() => void run(() => readReview(work))}>查詢投稿結果</button>
      </li>)}</ul>
      {review ? <article aria-label="我的投稿結果"><h4>{review.snapshot.inspection.project.brief.name}：{HERO_STATUS_LABELS[review.status]}</h4>
        <HeroWithdrawAction review={review} disabled={busy} onChange={setReview} />
        <p>{review.decision?.reason}</p>{review.decision?.problems?.map((problem, i) => <p key={i}>{problem.slot} {problem.field}：{problem.message}</p>)}
        <button type="button" disabled={busy} onClick={() => void run(async () => {
          const accountId = account.id;
          const response = await heroPlatform.binaryResponse(`/hero-submissions/${encodeURIComponent(review.snapshot.id)}/package`);
          const zip = await response.blob(); stillSignedIn(accountId);
          downloadHeroFile(zip, `${review.snapshot.workId}-${review.snapshot.id}.zip`);
        })}>下載這份投稿 ZIP</button>
      </article> : null}
    </> : <p>登入後可取回雲端草稿，或開啟作者授權的署名改作。</p>}
    <h3>已發布英雄</h3>
    {!busy && !published.length ? <p>目前沒有開放瀏覽的已發布英雄。</p> : null}
    <ul className="draft-cards">{published.map((row) => <li key={row.id}><PublishedHeroPortrait hero={row} /><h4>{row.name}</h4><p>作者 {row.authorName ?? row.accountId} · 已發布</p>
      <button type="button" disabled={busy || !account || !onOpen || (row.accountId !== account?.id && row.allowAttributionRemix !== true)} onClick={() => void run(() => openPublished(row))}>{row.accountId === account?.id ? "開啟我的已發布版" : row.allowAttributionRemix === true ? "建立署名改作" : "作者未授權改作"}</button>
    </li>)}</ul>
  </section>;
}
