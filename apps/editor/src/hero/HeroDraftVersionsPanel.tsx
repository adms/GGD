import { useEffect, useRef, useState } from "react";
import { zHeroDraftHistory, zHeroWork, type HeroDraftHistory, type HeroWork } from "@ggd/shared/content/communityHero";
import { HeroDraftComparison } from "./HeroDraftConflictView";
import { heroPlatform } from "./communitySession";
import { restoreHeroDraftVersion } from "./draftVersions";
import type { HeroDraftPayload } from "./store";

export function HeroDraftVersionsPanel({ value, accountId, busy, run }: {
  value: HeroDraftPayload; accountId: string; busy: boolean; run(task: () => Promise<void>): Promise<void>;
}) {
  const [history, setHistory] = useState<HeroDraftHistory | null>(null);
  const [selectedId, setSelectedId] = useState(""); const [selected, setSelected] = useState<HeroWork | null>(null);
  const [reading, setReading] = useState(false); const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const request = useRef(0);
  const path = `/hero-works/${encodeURIComponent(value.project.projectId)}/draft-versions`;
  const revision = value.cloud?.accountId === accountId ? value.cloud.revision : null;
  const load = async (older = false) => {
    const token = ++request.current; setReading(true); setError(null);
    try {
      const page = zHeroDraftHistory.parse(await heroPlatform.request(path + (older && history?.nextVersion ? `?cursor=${encodeURIComponent(history.nextVersion)}` : "")));
      if (token !== request.current) return;
      if (page.versions.some((row) => row.workId !== value.project.projectId || row.ownerId !== accountId)) throw new Error("草稿歷史不屬於目前作品與帳號。");
      if (older && history) {
        if (page.headVersion !== history.headVersion) throw new Error("雲端已有新版本，請更新歷史後再比較。");
        setHistory({ ...page, versions: [...history.versions, ...page.versions.filter((row) => !history.versions.some((old) => old.versionId === row.versionId))] });
      } else { setHistory(page); setSelectedId(""); setSelected(null); }
    } catch (error) { if (token === request.current) setError(String(error)); }
    finally { if (token === request.current) setReading(false); }
  };
  useEffect(() => {
    setHistory(null); setSelected(null); setSelectedId(""); setError(null);
    if (revision !== null) void load();
    return () => { request.current++; };
  }, [path, accountId, revision]);
  const choose = async (id: string) => {
    const token = ++request.current; setSelectedId(id); setSelected(null); setError(null);
    if (!id) { setReading(false); return; }
    setReading(true);
    try {
      const work = zHeroWork.parse(await heroPlatform.request(`/hero-works/${encodeURIComponent(value.project.projectId)}/draft-versions/${encodeURIComponent(id)}`));
      if (token !== request.current) return;
      if (work.id !== value.project.projectId || work.ownerId !== accountId || work.draftVersion !== id) throw new Error("讀取的版本與選擇不符。");
      setSelected(work);
    } catch (error) { if (token === request.current) setError(String(error)); }
    finally { if (token === request.current) setReading(false); }
  };
  if (revision === null) return <p>首次同步後即可查看完整草稿版本歷史。</p>;
  return <section aria-label="完整草稿版本管理">
    <h4>完整草稿版本</h4>
    <p>每次同步會保留原文、未完成輸入、英雄設定、技能與演出、圖片及模型動作綁定。回復會另存新版本；上架仍由管理員審查發布。</p>
    <div className="hero-actions">
      <label>查看草稿版本<select aria-label="完整草稿版本" value={selectedId} disabled={busy || reading || !history} onChange={(event) => void choose(event.target.value)}>
        <option value="">選擇版本以比較</option>
        {history?.versions.map((row) => <option key={row.versionId} value={row.versionId}>第 {row.revision} 版 · {new Date(row.updatedAt).toLocaleString()}{row.versionId === history.headVersion ? " · 最新雲端" : ""}{row.restoredFrom ? " · 歷史回復" : ""}{!row.previousVersion && row.revision > 1 ? " · 既有草稿基線" : ""}</option>)}
      </select></label>
      <button type="button" disabled={busy || reading} onClick={() => void load()}>更新草稿歷史</button>
      {history?.nextVersion ? <button type="button" disabled={busy || reading} onClick={() => void load(true)}>載入更早版本</button> : null}
    </div>
    {reading ? <p role="status">讀取草稿版本…</p> : null}
    {selected && history ? <>
      <HeroDraftComparison local={value} remote={selected.draft} remoteLabel={`草稿第 ${selected.draftRevision} 版`} />
      <p>回復前會先保存目前的本機修改為副本，並確認舊版素材可以還原。</p>
      <button type="button" disabled={busy || reading || selected.draftVersion === history.headVersion} onClick={() => void run(async () => { setNotice(null); const restored = await restoreHeroDraftVersion(selected, accountId, history.revision); setNotice(`已回復並保存為雲端第 ${restored.draftRevision} 版，回復前的本機修改保留在我的作品副本。`); })}>回復此草稿並另存新版本</button>
    </> : null}
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </section>;
}
