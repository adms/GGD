import { useRef, useState } from "react";
import type { CollectionName } from "@ggd/shared/content";
import { useEditorStore } from "../store";
import { autosave, documentPayload, recoverDraft, reportDraftError, restoreDocumentDraft, saveDraftCopy, useDraftSession } from "./session";
import { indexedDraftRepository, type LocalDraft } from "./repository";
import { CloudHeroLibrary } from "./CloudHeroLibrary";
import { CommunityHeroExamples } from "../hero/CommunityHeroExamples";
import { heroPayloadFromDraft } from "../hero/store";
import { copyHeroDraftAsNew } from "../hero/conflictResolution";
import { saveHeroLocalCopy } from "../hero/communityDrafts";

export function unsupportedHeroDraft(draft: LocalDraft): string | null {
  if (draft.kind !== "hero") return null;
  const schema = (draft.payload as { project?: { schema?: unknown } } | null)?.project?.schema;
  return ["ggd-hero-project@1", "ggd-hero-project@2"].includes(String(schema)) ? null : typeof schema === "string" ? schema : "未標記的英雄格式";
}

export function LocalDraftStatus({ draftKey: activeKey, restored, onCopy }: { draftKey?: string | null; restored?: boolean; onCopy?(draft: LocalDraft): void } = {}) {
  const { status } = useDraftSession();
  const editor = useEditorStore();
  const restoredDraft = restored ?? editor.restoredDraft;
  const draftKey = activeKey ?? editor.draftKey;
  const labels = { idle: "本機自動儲存已啟用", pending: "正在等待保存…", saving: "正在保存到本機…", saved: "已保存到本機", error: "草稿尚未保存", conflict: "草稿版本衝突" };
  return <section className={`local-draft-status local-draft-${status.phase}`} aria-live="polite">
    <span>{restoredDraft ? "已恢復本機草稿 · " : ""}{labels[status.phase]}</span>
    {status.message ? <span role={status.phase === "error" || status.phase === "conflict" ? "alert" : undefined}>{status.message}</span> : null}
    {status.phase === "error" || status.phase === "conflict" ? <>
      <button type="button" onClick={() => void autosave.flush().catch(reportDraftError)}>重試保存</button>
      {draftKey ? <button type="button" onClick={() => void saveDraftCopy(draftKey).then((copy) => onCopy?.(copy)).catch(reportDraftError)}>另存本機副本</button> : null}
    </> : null}
  </section>;
}

export function DraftLibrary({ onOpenDocument, onOpenHero }: {
  onOpenDocument(collection: CollectionName): void;
  onOpenHero?(draft: LocalDraft): void;
}) {
  const { drafts, recoveries } = useDraftSession();
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false); const copyingRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const copy = async (draft: LocalDraft) => {
    if (copyingRef.current) return;
    copyingRef.current = true; setCopying(true); setError(null); setMessage(null);
    try {
      const source = heroPayloadFromDraft(draft);
      await autosave.flush();
      const payload = await copyHeroDraftAsNew(source, `hero-${crypto.randomUUID()}`);
      saveHeroLocalCopy(payload, `hero/${payload.project.projectId}`);
      await autosave.flush();
      setMessage("已建立新的本機英雄作品，原稿仍保留；可在清單中繼續編輯新作。");
    } catch (error) { setError(`複製未完成，原稿仍保留：${String(error)}`); }
    finally { copyingRef.current = false; setCopying(false); }
  };
  const open = (draft: LocalDraft) => {
    if (unsupportedHeroDraft(draft)) { setError("目前版本無法編輯這份英雄格式，原稿保持唯讀；請使用支援該格式的版本或完整備份恢復。"); return; }
    try {
      const data = documentPayload(draft);
      if (data) { restoreDocumentDraft(draft); onOpenDocument(data.collection); }
      else onOpenHero?.(draft);
    } catch (error) { setError(`無法開啟，原稿仍保留：${String(error)}`); }
  };
  const downloadRaw = async (key: string) => {
    const raw = await indexedDraftRepository.exportRaw(key);
    const url = URL.createObjectURL(new Blob([JSON.stringify(raw, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "draft-recovery.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <main className="draft-library editor-main">
    <h1>我的作品</h1>
    <p>本機草稿會保留未完成的欄位。保存草稿後仍需另行提交審查。</p>
    <LocalDraftStatus />
    {error ? <p role="alert">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {drafts.length === 0 ? <p>開始創作後，作品會出現在這裡。</p> : null}
    <ul className="draft-cards">{drafts.map((draft) => {
      const data = documentPayload(draft);
      const unsupported = unsupportedHeroDraft(draft);
      const name = data?.docId ?? String((draft.payload as { project?: { brief?: { name?: string } } })?.project?.brief?.name || "未命名英雄");
      return <li key={draft.key}><h2>{name}</h2>
        <p>{draft.kind === "hero" ? "英雄作品" : data?.collection} · 本機第 {draft.revision} 版 · {new Date(draft.updatedAt).toLocaleString()}</p>
        {draft.key.includes("/copy-") || draft.key.includes("/recovered-") ? <p>獨立恢復副本</p> : null}
        {unsupported ? <>
          <p role="status">這份原稿使用 {unsupported}，目前版本只能唯讀。請使用支援該格式的版本或完整備份恢復。</p>
          <details><summary>唯讀檢視原稿</summary><pre>{JSON.stringify(draft.payload, null, 2)}</pre></details>
          <button type="button" onClick={() => void downloadRaw(draft.key).catch((error: unknown) => setError(String(error)))}>匯出原始資料</button>
        </> : <><button type="button" disabled={!data && !onOpenHero} onClick={() => open(draft)}>繼續編輯</button>
          {draft.kind === "hero" ? <button type="button" disabled={copying} onClick={() => void copy(draft)}>複製為新作品</button> : null}
        </>}
      </li>;
    })}</ul>
    <CloudHeroLibrary onOpen={onOpenHero ? open : undefined} />
    {onOpenHero ? <CommunityHeroExamples onOpen={open} /> : null}
    {recoveries.map(({ key, backup }) => <section key={key} role="alert">
      <h2>發現需要恢復的草稿</h2><p>{key} 的完整性檢查未通過，原始資料已保留。</p>
      <button type="button" onClick={() => void downloadRaw(key).catch((e: unknown) => setError(String(e)))}>匯出原始資料</button>
      {backup ? <button type="button" onClick={() => void recoverDraft(backup).then(open).catch((e: unknown) => setError(String(e)))}>從上一版建立恢復副本</button> : <p>沒有可驗證的上一版備份。</p>}
    </section>)}
  </main>;
}
