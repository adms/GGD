import { lazy, Suspense, useState, type ReactNode } from "react";
import { ACQUIRED_MODEL_OPTIONS, ACQUIRED_PROXY_MODELS, COMMUNITY_ACQUIRED_HEROES, createAcquiredHeroProject } from "@ggd/shared/content/heroForge/communityAcquired";
import type { LocalDraft } from "../drafts/repository";
import { autosave, useDraftSession } from "../drafts/session";
import { useHeroCatalog } from "./catalog";
import { saveHeroLocalCopy } from "./communityDrafts";

// ⛔ Babylon 只能 lazy —— 與 PreviewPanel 共用同一個 Preview3D chunk，⛔ 不進編輯器主 bundle。
const LazyModelKeyPreview = lazy(() => import("../preview3d/Preview3D").then((m) => ({ default: m.ModelKeyPreview })));
const lazyPreview = (modelKey: string) => <Suspense fallback={<p>正在載入 3D 預覽…</p>}><LazyModelKeyPreview modelKey={modelKey} /></Suspense>;

/**
 * 🔭 `preview` 只在測試換成樁（無 DOM 的環境跑不了 Babylon 與 lazy）。
 * ⭐ 一次只畫**一張卡**：這一頁 30 幾張卡，瀏覽器的 WebGL context 上限約 16 個，全開會把前面的預覽擠掉。
 */
export function AcquiredHeroExamples({ onOpen, preview = lazyPreview }: { onOpen(draft: LocalDraft): void; preview?: (modelKey: string) => ReactNode }) {
  const catalog = useHeroCatalog().data;
  const [pending, setPending] = useState<string | null>(null);
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>({});
  const [previewing, setPreviewing] = useState<string | null>(null);
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
        {options.length ? <><label>模型版本（僅此作品）<select aria-label={`${hero.name}模型版本`} value={chosen} onChange={(event) => { const next = event.target.value; setSelectedModels((current) => ({ ...current, [hero.id]: next })); setPreviewing(hero.id); }}>
          {options.map((key, index) => <option key={key} value={key}>{index === 0 ? (ACQUIRED_PROXY_MODELS[hero.id] === key ? "替代預設 · " : "預設 · ") : "保留版本 · "}{key}</option>)}
        </select></label>
          {previewing === hero.id && chosen
            ? <div data-field="acquired-model-preview" data-model={chosen}><p>即時預覽（只看，⛔ 不會建立作品）</p>{preview(chosen)}</div>
            : <button type="button" onClick={() => setPreviewing(hero.id)}>預覽{hero.name}模型</button>}
        </> : <p>模型與動作待綁定，可先編輯技能。</p>}
        {chosen && ACQUIRED_PROXY_MODELS[hero.id] === chosen ? <p>本尊來源缺可用六動作，先使用已核准 GGD 替代模型；日後本尊以新模型版本切換。</p> : null}
        {chosen && !supported ? <p>目前服務尚未收錄此模型，建包前須更新素材目錄。</p> : null}
        {hero.id.startsWith("godie-") ? <p>保留舊角色 {hero.id}，有本機草稿時繼續編輯；首版與後續更新都需投稿審查。</p> : null}
        <button type="button" disabled={pending !== null} onClick={() => void create(hero.id)}>{pending === hero.id ? "正在保存…" : `建立${hero.name}作品`}</button>
      </li>;
    })}</ul>
  </section>;
}
