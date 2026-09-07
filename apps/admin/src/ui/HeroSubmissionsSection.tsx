import { useCallback, useEffect, useRef, useState } from "react";
import { HERO_SLOTS, type HeroSlot } from "@ggd/shared/content/heroForge/constants";
import { HERO_PUBLICATION_STATUSES, HERO_STATUS_LABELS, type HeroListRow, type HeroReviewView } from "@ggd/shared/content/communityHero";
import { heroReviewApi, type HeroPublishRequest } from "../heroReview";
import { Btn, ErrorBanner, Panel, TextArea, TextInput } from "./widgets";
import { TEXT_DIM, PANEL_BORDER } from "./theme";
import { HeroSourceDesignPanel } from "../../../editor/src/hero/HeroSourceDesignPanel";
import "./heroSourceReview.css";

type Problem = { slot?: string; field?: string; message: string };
const durableKey = (id: string) => `ggd.hero.publish.${id}`;

export function HeroSubmissionsSection() {
  const [query, setQuery] = useState(""); const [status, setStatus] = useState("");
  const [queue, setQueue] = useState<{ items: HeroListRow[]; total: number; nextOffset: number }>({ items: [], total: 0, nextOffset: 0 });
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [review, setReview] = useState<HeroReviewView | null>(null);
  const [sourceSlot, setSourceSlot] = useState<HeroSlot>("Q");
  const [reason, setReason] = useState(""); const [problems, setProblems] = useState<Problem[]>([]);
  const [inspected, setInspected] = useState(false);
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const loadQueue = useCallback(async (nextOffset = 0) => {
    try { setQueue(await heroReviewApi.queue(query, status, nextOffset)); setOffset(nextOffset); }
    catch (cause) { setError(String(cause)); }
  }, [query, status]);
  useEffect(() => { void heroReviewApi.queue().then(setQueue).catch((cause: unknown) => setError(String(cause))); }, []);
  const choose = async (id: string) => {
    const request = ++sequence.current;
    setSelected(id); setReview(null); setSourceSlot("Q"); setInspected(false); setReason(""); setProblems([]); setError(null); setNotice(null);
    try { const result = await heroReviewApi.read(id); if (sequence.current === request) setReview(result); }
    catch (cause) { if (sequence.current === request) setError(String(cause)); }
  };
  const refresh = async (id: string) => {
    const result = await heroReviewApi.read(id);
    if (result.snapshot.id === id) setReview(result);
    await loadQueue(offset);
  };
  const act = async (action: "publish" | "restore" | "returned" | "rejected" | "unpublish", retry?: HeroPublishRequest) => {
    if (!review) return;
    const id = review.snapshot.id; const control = review.publication;
    setBusy(true); setError(null); setNotice(null);
    try {
      if (action === "returned" || action === "rejected") {
        await heroReviewApi.decide(id, { status: action, reason: reason.trim(), expectedRevision: control.revision, problems: problems.filter((row) => row.message.trim()).map((row) => ({ ...row, message: row.message.trim() })) });
        setNotice(action === "returned" ? "已退回修改，作者可查看具體問題。" : "已拒絕此送審版本。");
      } else if (action === "unpublish") {
        await heroReviewApi.unpublish(review.snapshot.workId, { operationId: `hero-down-${crypto.randomUUID()}`, reason: reason.trim(), expectedRevision: control.revision });
        setNotice("已下架；歷史版本與審查紀錄仍保留。");
      } else {
        const request = retry ?? { operationId: `hero-publish-${crypto.randomUUID()}`, action, reason: reason.trim(), expectedRevision: control.revision };
        // Save before sending. A timeout or page reload must reuse this identity.
        localStorage.setItem(durableKey(id), JSON.stringify(request));
        await heroReviewApi.publish(id, request);
        localStorage.removeItem(durableKey(id));
        setNotice(action === "restore" ? "相容性檢查通過，已恢復此歷史版本。" : "已核准並成功發布這份固定版本。");
      }
    } catch (cause) { setError(String(cause)); }
    finally {
      try { await refresh(id); } catch (cause) { setError((old) => [old, String(cause)].filter(Boolean).join("；")); }
      setBusy(false);
    }
  };
  const current = review?.publication;
  const isPublished = current?.published?.submissionId === review?.snapshot.id;
  const isHistorical = current?.history.some((row) => row.submissionId === review?.snapshot.id) ?? false;
  const serverRetry = current && Object.values(current.operations).reverse().find((operation) => operation.submissionId === review?.snapshot.id && (operation.status === "failed" || operation.status === "publishing") && operation.action !== "unpublish");
  let retry: HeroPublishRequest | undefined = serverRetry ? { operationId: serverRetry.id, action: serverRetry.action as "publish" | "restore", reason: serverRetry.reason, expectedRevision: serverRetry.expectedRevision } : undefined;
  if (!retry && review) {
    try {
      const saved = JSON.parse(localStorage.getItem(durableKey(review.snapshot.id)) ?? "null") as HeroPublishRequest | null;
      if (saved && typeof saved.operationId === "string" && (saved.action === "publish" || saved.action === "restore") && typeof saved.reason === "string" && Number.isInteger(saved.expectedRevision) && !current?.operations[saved.operationId]) retry = saved;
    } catch { /* Server journal remains available if local storage is unavailable. */ }
  }
  const canDecide = !!review && reason.trim().length > 0 && !busy;
  const project = review?.snapshot.inspection.project;
  const versionIds = [...new Set([...(current?.submissions ?? []), ...(current?.history.map((entry) => entry.submissionId) ?? []), ...(selected ? [selected] : [])])].reverse();
  const onlineFiles = new Map(current?.published?.version.files.map((file) => [file.path, file]) ?? []);
  const viewingFiles = new Map(review?.snapshot.version.files.map((file) => [file.path, file]) ?? []);
  const changedFiles = [...new Set([...onlineFiles.keys(), ...viewingFiles.keys()])].sort().flatMap((path) => {
    const before = onlineFiles.get(path), after = viewingFiles.get(path);
    return before?.sha256 === after?.sha256 && before?.bytes === after?.bytes ? [] : [{ path, action: !before ? "新增" : !after ? "移除" : "變更" }];
  });
  return <Panel title="完整英雄作品審查" style={{ marginBottom: 20 }}>
    <p>檢查作者原文、六槽技能與演出後，一次核准並發布。伺服器會重新驗證同一份快照；發布失敗時保留既有上線版本。</p>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <label>搜尋作品<TextInput value={query} onChange={setQuery} onEnter={() => void loadQueue()} /></label>
      <label>狀態 <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部</option>{HERO_PUBLICATION_STATUSES.map((state) => <option key={state} value={state}>{HERO_STATUS_LABELS[state]}</option>)}</select></label>
      <Btn disabled={busy} onClick={() => void loadQueue()}>重新查詢</Btn>
    </div>
    {error ? <ErrorBanner text={error} /> : null}
    {notice ? <p role="status">{notice}</p> : null}
    <p style={{ color: TEXT_DIM }}>共 {queue.total} 份送審版本</p>
    <ul style={{ listStyle: "none", padding: 0 }}>{queue.items.map((row) => <li key={row.id} style={{ margin: "8px 0" }}>
      <Btn disabled={busy} kind={selected === row.id ? "primary" : "ghost"} onClick={() => void choose(row.id)}>{row.name} · {HERO_STATUS_LABELS[row.status]} · {new Date(row.submittedAt).toLocaleString()}</Btn>
    </li>)}</ul>
    <div style={{ display: "flex", gap: 8 }}><Btn disabled={busy || offset === 0} onClick={() => void loadQueue(Math.max(0, offset - 50))}>上一頁</Btn><Btn disabled={busy || queue.nextOffset >= queue.total} onClick={() => void loadQueue(queue.nextOffset)}>下一頁</Btn></div>
    {selected && !review ? <p role="status">正在讀取固定送審版本…</p> : null}
    {review && project ? <article style={{ borderTop: PANEL_BORDER, marginTop: 20, paddingTop: 12 }}>
      <h2>{project.brief.name} · 第 {project.revision} 版 · {HERO_STATUS_LABELS[review.status]}</h2>
      <label>英雄完整資料版本 <select aria-label="英雄完整資料版本" value={review.snapshot.id} disabled={busy} onChange={(event) => void choose(event.target.value)}>
        {versionIds.map((id) => {
          const active = current?.published?.submissionId === id;
          const historical = current?.history.some((entry) => entry.submissionId === id);
          const label = active ? "目前上線" : current?.pendingSubmission === id ? "待審" : historical ? "曾上線" : "未上線";
          return <option key={id} value={id}>{label} · {id.slice(-12)}</option>;
        })}
      </select></label>
      <p>每版包含原文、屬性、六槽技能、機制、特效、音效及模型與動作綁定。選單切換查看版本；核准或恢復後才會更動上線版本，既有對局保留開局時的版本。</p>
      {current?.published && !isPublished ? <details><summary>與目前上線版本比較：{changedFiles.length} 個檔案不同</summary>
        <ul>{changedFiles.map((file) => <li key={file.path}>{file.action} · {file.path}</li>)}</ul>
      </details> : null}
      <p>作者：{review.snapshot.accountId} · 送審：{new Date(review.snapshot.submittedAt).toLocaleString()}</p>
      {review.snapshot.source ? <p>改作來源：{review.snapshot.source.workId} · 原作者：{review.snapshot.source.authorId} · 固定來源版本：{review.snapshot.source.submissionId}</p> : <p>原創作品</p>}
      <p>改作授權：{review.snapshot.allowAttributionRemix ? "允許保留署名的改作" : "未開放改作"}</p>
      <h3>作者完整原文</h3><div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{project.brief.concept}</div>
      <div className="hero-source-review"><HeroSourceDesignPanel project={project} slot={sourceSlot} onSlot={setSourceSlot} readOnly /></div>
      <h3>六槽技能</h3>
      {HERO_SLOTS.map((slot) => { const plan = project.acceptedPlan?.slots[slot]; return <details key={slot}><summary>{slot} · {plan?.name ?? "缺少技能"}</summary><p style={{ whiteSpace: "pre-wrap" }}>{plan?.purpose}</p><pre style={{ overflow: "auto", maxHeight: 380 }}>{JSON.stringify({ ability: plan, presentation: project.presentation.slots[slot] }, null, 2)}</pre></details>; })}
      <details><summary>屬性、來源鎖與素材固定紀錄</summary><pre style={{ overflow: "auto", maxHeight: 400 }}>{JSON.stringify({ attributes: project.acceptedPlan?.statOverrides, sourceLock: project.sourceLock, assets: project.presentation.assetLocks }, null, 2)}</pre></details>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{review.snapshot.inspection.icons.map((icon) => <figure key={icon.slot}><img src={`data:${icon.mime};base64,${icon.base64}`} alt={`${icon.slot} 送審圖片`} width={96} height={96} /><figcaption>{icon.slot}</figcaption></figure>)}</div>
      <h3>送審版本試玩與演出</h3>
      <p><a href={`${import.meta.env.BASE_URL}?heroReview=${encodeURIComponent(review.snapshot.id)}`} target="_blank" rel="noopener noreferrer">另開視窗檢查固定版本</a></p>
      <iframe key={review.snapshot.id} title="完整英雄固定版本預覽" src={`${import.meta.env.BASE_URL}?heroReview=${encodeURIComponent(review.snapshot.id)}`} style={{ width: "100%", height: 940, border: PANEL_BORDER, borderRadius: 8 }} />
      <details><summary>相依資料與驗證結果</summary><pre style={{ overflow: "auto", maxHeight: 380 }}>{JSON.stringify({ packageDigest: review.snapshot.version.packageDigest, snapshotDigest: review.snapshot.version.snapshotDigest, base: review.snapshot.inspection.manifest.base, dependencies: review.snapshot.inspection.manifest.requires, diagnostics: review.snapshot.inspection.diagnostics }, null, 2)}</pre></details>
      {review.decision ? <p>上次審查：{review.decision.decidedBy} · {new Date(review.decision.decidedAt).toLocaleString()} · {review.decision.reason}</p> : null}
      {current?.published ? <p>目前上線版本：{current.published.submissionId} {isPublished ? "（本次查看版本）" : ""}</p> : <p>此作品目前沒有已發布版本。</p>}
      <label style={{ display: "block", margin: "12px 0" }}>審查意見（必填）<TextArea value={reason} onChange={setReason} /></label>
      {problems.map((problem, index) => <div key={index} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <label>問題位置 <select value={problem.slot ?? ""} onChange={(event) => setProblems((rows) => rows.map((row, at) => at === index ? { ...row, slot: event.target.value || undefined } : row))}><option value="">整體作品</option>{HERO_SLOTS.map((slot) => <option key={slot}>{slot}</option>)}</select></label>
        <label>欄位<TextInput value={problem.field ?? ""} onChange={(field) => setProblems((rows) => rows.map((row, at) => at === index ? { ...row, field } : row))} /></label>
        <label>具體問題<TextInput value={problem.message} onChange={(message) => setProblems((rows) => rows.map((row, at) => at === index ? { ...row, message } : row))} /></label>
        <Btn onClick={() => setProblems((rows) => rows.filter((_, at) => at !== index))}>移除問題</Btn>
      </div>)}
      <Btn disabled={busy || problems.length >= 12} onClick={() => setProblems((rows) => [...rows, { message: "" }])}>新增欄位問題</Btn>
      <label style={{ display: "block", margin: "12px 0" }}><input type="checkbox" checked={inspected} onChange={(event) => setInspected(event.target.checked)} />我已檢查完整原文、六槽技能與演出</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Btn kind="primary" disabled={!canDecide || !inspected || isPublished || current?.pendingSubmission !== review.snapshot.id} onClick={() => void act("publish")}>核准並發布完整英雄</Btn>
        <Btn disabled={!canDecide || isPublished} onClick={() => void act("returned")}>退回修改</Btn>
        <Btn kind="danger" disabled={!canDecide || isPublished} onClick={() => void act("rejected")}>拒絕此版本</Btn>
        {retry ? <Btn disabled={busy} onClick={() => void act(retry!.action, retry)}>重試原發布操作</Btn> : null}
        {isPublished ? <Btn kind="danger" disabled={!canDecide} onClick={() => void act("unpublish")}>下架此作品</Btn> : null}
        {isHistorical && !isPublished ? <Btn disabled={!canDecide || !inspected} onClick={() => void act("restore")}>驗證並恢復此歷史版本</Btn> : null}
      </div>
      <details><summary>發布歷程與可恢復版本</summary>
        {current?.history.map((entry, index) => <p key={`${entry.operationId}/${index}`}><Btn disabled={busy} onClick={() => void choose(entry.submissionId)}>{new Date(entry.publishedAt).toLocaleString()} · {entry.submissionId}</Btn></p>)}
        {Object.values(current?.operations ?? {}).map((operation) => <p key={operation.id} style={{ whiteSpace: "pre-wrap" }}>{operation.action} · {operation.status} · {operation.requestedBy} · {operation.reason}{operation.error ? `\n${operation.error}` : ""}</p>)}
      </details>
    </article> : null}
  </Panel>;
}
