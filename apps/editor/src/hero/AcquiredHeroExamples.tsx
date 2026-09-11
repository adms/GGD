import { useState } from "react";
import { ACQUIRED_MODEL_OPTIONS, ACQUIRED_PROXY_MODELS, COMMUNITY_ACQUIRED_HEROES, createAcquiredHeroProject } from "@ggd/shared/content/heroForge/communityAcquired";
import type { LocalDraft } from "../drafts/repository";
import { autosave, useDraftSession } from "../drafts/session";
import { useHeroCatalog } from "./catalog";
import { saveHeroLocalCopy } from "./communityDrafts";

export function AcquiredHeroExamples({ onOpen }: { onOpen(draft: LocalDraft): void }) {
  const catalog = useHeroCatalog().data;
  const [pending, setPending] = useState<string | null>(null);
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const create = async (id: string) => {
    setPending(id); setError(null);
    try {
      const legacy = id.startsWith("godie-");
      if (legacy) {
        await autosave.flush();
        const existing = useDraftSession.getState().drafts.filter((draft) => draft.kind === "hero" && (draft.payload as { project?: { projectId?: string } })?.project?.projectId === id)
          .sort((a, b) => b.updatedAt - a.updatedAt)[0];
        if (existing) { onOpen(existing); return; }
      }
      const project = createAcquiredHeroProject(id, legacy ? id : `hero-${crypto.randomUUID()}`, catalog.templates, catalog.generatorVersion);
      if (selectedModels[id]) project.presentation.modelKey = selectedModels[id]!;
      const draft = saveHeroLocalCopy({ project, rawInputs: {}, mode: "visual", origin: project.acceptedPlan!.origin });
      await autosave.flush(); onOpen(draft);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setPending(null); }
  };
  return <section className="community-hero-examples" aria-label="已取得素材英雄">
    <h2>已取得素材・新英雄與舊角改編</h2>
    <p>{COMMUNITY_ACQUIRED_HEROES.length} 名角色已附出身、六槽技能與 GGD 演出。建立獨立作品後可調整、試玩及送審；素材待綁定者須先完成模型選擇。</p>
    {error ? <p role="alert">{error}</p> : null}
    <ul className="draft-cards">{COMMUNITY_ACQUIRED_HEROES.map((hero) => {
      const options = ACQUIRED_MODEL_OPTIONS[hero.id] ?? [];
      const chosen = selectedModels[hero.id] ?? options[0];
      const supported = chosen && catalog.modelIds.includes(chosen);
      return <li key={hero.id}>
        <h3>{hero.name}</h3><p>{hero.sourceWork} · {hero.origin}</p><p>{hero.summary}</p>
        <details><summary>技能連動與改編說明</summary><ul>{hero.adaptations.map((text) => <li key={text}>{text}</li>)}</ul></details>
        {options.length ? <label>模型版本（僅此作品）<select aria-label={`${hero.name}模型版本`} value={chosen} onChange={(event) => setSelectedModels((current) => ({ ...current, [hero.id]: event.target.value }))}>
          {options.map((key, index) => <option key={key} value={key}>{index === 0 ? (ACQUIRED_PROXY_MODELS[hero.id] === key ? "替代預設 · " : "預設 · ") : "保留版本 · "}{key}</option>)}
        </select></label> : <p>模型與動作待綁定，可先編輯技能。</p>}
        {chosen && ACQUIRED_PROXY_MODELS[hero.id] === chosen ? <p>本尊來源缺可用六動作，先使用已核准 GGD 替代模型；日後本尊以新模型版本切換。</p> : null}
        {chosen && !supported ? <p>目前服務尚未收錄此模型，建包前須更新素材目錄。</p> : null}
        {hero.id.startsWith("godie-") ? <p>保留舊角色 {hero.id}，有本機草稿時繼續編輯；首版與後續更新都需投稿審查。</p> : null}
        <button type="button" disabled={pending !== null} onClick={() => void create(hero.id)}>{pending === hero.id ? "正在保存…" : `建立${hero.name}作品`}</button>
      </li>;
    })}</ul>
  </section>;
}
