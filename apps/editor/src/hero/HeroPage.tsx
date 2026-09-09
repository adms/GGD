import { useEffect, useMemo, useState } from "react";
import {
  HERO_SLOTS, ORIGINS, ARCHETYPES, zHeroProject, zHeroStatOverrides, zHeroPresentation,
  createDeterministicHeroPlans, type HeroPlan, type HeroProject, type HeroSectionId, type HeroSlot,
} from "@ggd/shared/content";
import { FormRenderer } from "../form/FormRenderer";
import { walkZod } from "../form/walk";
import { RawInputContext, rawInputErrors } from "../form/RawInputContext";
import { LocalDraftStatus } from "../drafts/DraftLibrary";
import { reportDraftError, saveDraftCopy, useDraftSession } from "../drafts/session";
import { hasLegacyStatOverrides } from "@ggd/shared/content/schema/championStats";
import { useHeroCatalog } from "./catalog";
import { useHeroStore } from "./store";
import { acceptHeroPlan, adoptHeroGenerator, changeHeroOrigin, editHeroProject, fieldOwner, replaceLegacyStatOverrides, setHeroFieldOwner } from "./projectModel";
import { useHeroValidation } from "./useHeroValidation";
import { HeroSlotEditor } from "./HeroSlotEditor";
import { HeroInteractivePreview } from "./HeroInteractivePreview";
import { LocalIconUploadPanel } from "../local-icons/LocalIconUploadPanel";
import { HeroPackagePanel } from "./HeroPackagePanel";
import { HeroModelUploadPanel } from "./HeroModelUploadPanel";
import { HeroSourceDesignPanel } from "./HeroSourceDesignPanel";
import { modelDraftFingerprint } from "./modelAssets";
import { useUploadedHeroModel } from "./useUploadedHeroModel";
import { uploadedHeroModelPath } from "@ggd/shared/content/modelUpload/heroModelSchema";

export function HeroPage() {
  const state = useHeroStore();
  const baseCatalog = useHeroCatalog().data;
  const [candidates, setCandidates] = useState<readonly HeroPlan[]>([]);
  const [slot, setSlot] = useState<HeroSlot>("Q");
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (useHeroStore.getState().value) return;
    const latest = useDraftSession.getState().drafts.find((draft) => draft.kind === "hero");
    if (latest) {
      try { useHeroStore.getState().open(latest); } catch (error) { reportDraftError(error); setMessage(String(error)); }
    } else useHeroStore.getState().start();
  }, []);
  const project = state.value?.project ?? null;
  const uploaded = useUploadedHeroModel(project, baseCatalog);
  const catalog = uploaded.catalog;
  const rawErrors = useMemo(() => rawInputErrors(state.value?.rawInputs ?? {}), [state.value?.rawInputs]);
  const validation = useHeroValidation(project, catalog, Object.keys(rawErrors).length > 0 || state.value?.rawInputs.advanced !== undefined);
  if (!project || !state.value) return <main className="editor-empty">{message ? <><p role="alert">{message}</p><button type="button" onClick={() => state.start()}>建立新英雄並保留原資料</button></> : "正在建立英雄草稿…"}</main>;
  const value = state.value;
  const commit = (next: HeroProject) => {
    const current = useHeroStore.getState().value!;
    state.commit({ ...current, project: { ...next, revision: Math.max(next.revision, current.project.revision + 1) } });
  };
  const edit = (section: HeroSectionId, path: string, next: unknown) => commit(editHeroProject(project, section, path, next));
  const isLocked = (section: HeroSectionId, path: string) => fieldOwner(project, section, path) === "locked";
  const lockButton = (section: HeroSectionId, path: string) => <button type="button" onClick={() => commit(setHeroFieldOwner(project, section, path, isLocked(section, path) ? "manual" : "locked"))}>{isLocked(section, path) ? "解除鎖定" : "保留並鎖定"}</button>;
  const generate = () => {
    try {
      setCandidates(createDeterministicHeroPlans({ projectId: project.projectId, brief: project.brief, sourceLock: project.sourceLock,
        origin: project.acceptedPlan?.origin ?? value.origin, generatorVersion: catalog.generatorVersion, availableTemplateIds: catalog.templates.map((template) => template.id), availableTemplates: catalog.templates }));
      setMessage(null);
    } catch (error) { setMessage(String(error)); }
  };
  const selected = validation.result?.scenarios[HERO_SLOTS.indexOf(slot)];
  const compiled = validation.result?.compiled;
  return <main className="hero-page">
    <header className="hero-header"><div><h1>{project.brief.name || "新英雄"}</h1><p>從概念到六槽技能，逐項試作與調整。</p></div>
      <div><button type="button" disabled={!state.past.length} onClick={state.undo}>復原</button><button type="button" disabled={!state.future.length} onClick={state.redo}>重做</button><button type="button" onClick={() => { state.start(); setCandidates([]); }}>建立另一位英雄</button></div>
    </header>
    <LocalDraftStatus draftKey={state.key} restored={state.restored} onCopy={state.open} />
    <p className="hero-catalog-note">{catalog.source === "bundled" ? "使用內建內容，可離線編輯" : "已讀取本機內容設定"} · AI 關閉</p>
    {project.acceptedPlan ? <section aria-label="英雄生成器版本">
      <p>{project.acceptedPlan.generatorVersion ? `英雄生成器版本 ${project.acceptedPlan.generatorVersion.slice(7, 15)}` : "舊草稿尚未記錄起稿生成器版本"}</p>
      {catalog.generatorVersion && project.acceptedPlan.generatorVersion !== catalog.generatorVersion ? <>
        <p>目前可使用生成器 {catalog.generatorVersion.slice(7, 15)}。採用後保留固定模板、原文與微調，建立新的草稿修訂並重新檢查；已發布版本維持原狀。</p>
        <button type="button" disabled={isLocked("skills", "acceptedPlan.generatorVersion")} onClick={() => commit(adoptHeroGenerator(project, catalog.generatorVersion!))}>採用目前生成器並重新檢查</button>
      </> : null}
    </section> : null}
    <nav className="hero-modes" aria-label="英雄編輯模式">{([ ["quick", "快速創作"], ["visual", "視覺編輯"], ["advanced", "進階編輯"] ] as const).map(([mode, label]) => <button type="button" key={mode} aria-pressed={value.mode === mode} onClick={() => state.commit({ ...value, mode })}>{label}</button>)}</nav>
    {message ? <p role="alert">{message}</p> : null}
    <RawInputContext.Provider value={{ values: value.rawInputs, set: (path, text, kind) => {
      const current = useHeroStore.getState().value!;
      state.commit({ ...current, project: { ...current.project, revision: current.project.revision + 1 }, rawInputs: { ...current.rawInputs, [path]: { text, kind } } });
    } }}>
    <HeroSourceDesignPanel project={project} slot={slot} onSlot={setSlot} onChange={commit} />
    <div className="hero-workspace"><section className="hero-authoring">
      {value.mode === "quick" ? <>
        <label>英雄名稱<input aria-label="英雄名稱" value={project.brief.name} disabled={isLocked("identity", "brief.name")} onChange={(event) => edit("identity", "brief.name", event.target.value)} /></label>{lockButton("identity", "brief.name")}
        <label>完整概念、背景與台詞<textarea aria-label="英雄概念" rows={6} value={project.brief.concept} disabled={isLocked("identity", "brief.concept")} onChange={(event) => edit("identity", "brief.concept", event.target.value)} /></label>{lockButton("identity", "brief.concept")}
        <label>出身<select aria-label="英雄出身" value={project.acceptedPlan?.origin ?? value.origin} onChange={(event) => project.acceptedPlan ? commit(changeHeroOrigin(project, event.target.value as HeroPlan["origin"])) : state.commit({ ...value, origin: event.target.value as HeroPlan["origin"], project: { ...project, revision: project.revision + 1 } })}>{ORIGINS.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
        {project.acceptedPlan ? <label>定位<select value={project.acceptedPlan.archetype} onChange={(event) => edit("attributes", "acceptedPlan.archetype", event.target.value)}>{ARCHETYPES.map((entry) => <option key={entry}>{entry}</option>)}</select></label> : null}
        <details><summary>已想好的招式名稱</summary>{HERO_SLOTS.map((entry) => <label key={entry}>{entry}<input value={project.brief.moveNames[entry] ?? ""} onChange={(event) => edit("identity", `brief.moveNames.${entry}`, event.target.value)} /></label>)}</details>
        <button type="button" className="hero-primary" disabled={!project.brief.name.trim() || !project.brief.concept.trim() || !catalog.templates.length} onClick={generate}>{project.acceptedPlan ? "重新產生可比較的方案" : "產生三個方案"}</button>
        {candidates.length ? <div className="hero-candidates">{candidates.map((candidate) => <article key={candidate.planId}><h2>{candidate.title}</h2><p>{candidate.summary}</p><ul>{HERO_SLOTS.map((entry) => <li key={entry}>{entry} · {candidate.slots[entry].products.map((product) => catalog.templates.find((template) => template.id === product.template.ref)?.name ?? product.template.ref).join(" ＋ ")}</li>)}</ul><button type="button" onClick={() => { commit(acceptHeroPlan(project, candidate, catalog.templates)); setCandidates([]); }}>採用這個方案</button></article>)}</div> : null}
        {project.acceptedPlan ? <><button type="button" onClick={() => state.commit({ ...value, mode: "visual" })}>調整六槽技能與演出 →</button>
          <details><summary>個別屬性覆寫</summary>{hasLegacyStatOverrides(project.acceptedPlan.statOverrides) ? <>
            <p role="alert">舊稿使用數字覆寫，目前遊戲只接受五級距。原值已保留；請建立副本，再依出身選擇新的級距，完成前不能投稿。</p>
            <pre>{JSON.stringify(project.acceptedPlan.statOverrides, null, 2)}</pre>
            <button type="button" onClick={() => {
              const key = useHeroStore.getState().key;
              if (!key) return;
              void saveDraftCopy(key).then((copy) => {
                if (useHeroStore.getState().key !== key) return;
                state.open(copy);
                const current = useHeroStore.getState().value!;
                state.commit({ ...current, project: replaceLegacyStatOverrides(current.project) });
                setMessage("已在獨立副本改用出身級距。原草稿的數字與鎖定仍完整保留；請調整並檢查新副本。");
              }).catch((error) => { reportDraftError(error); setMessage(String(error)); });
            }}>另存為五級距版本，保留原草稿</button>
          </> : <><p>留空時跟隨出身；覆寫只使用目前遊戲的五級距，實際數字由共用公式解析。</p><FormRenderer node={walkZod(zHeroStatOverrides)} value={project.acceptedPlan.statOverrides} dataPath="acceptedPlan.statOverrides" errors={rawErrors} onChange={(path, next) => edit("attributes", path, next)} /></>}</details></> : null}
      </> : value.mode === "visual" ? project.acceptedPlan ? <>
        <nav className="hero-slots" aria-label="技能槽">{HERO_SLOTS.map((entry) => <button type="button" aria-pressed={entry === slot} key={entry} onClick={() => setSlot(entry)}>{entry}</button>)}</nav>
        <HeroSlotEditor project={project} slot={slot} templates={catalog.templates} configs={catalog.configs} errors={rawErrors} onChange={commit} />
        <label>英雄模型<select value={project.presentation.modelKey} disabled={isLocked("presentation", "presentation.modelKey") || isLocked("presentation", "presentation.uploadedModel")} onChange={(event) => {
          if (project.presentation.uploadedModel && event.target.value === project.presentation.modelKey) return;
          const next = editHeroProject(project, "presentation", "presentation.modelKey", event.target.value);
          delete next.presentation.uploadedModel;
          next.presentation.assetLocks = next.presentation.assetLocks.map((lock) => ({ ...lock, consumers: lock.consumers.filter((consumer) => consumer !== "champion:model") })).filter((lock) => lock.consumers.length);
          state.commit({ ...value, project: next, ...(value.modelDraft ? { modelDraft: { ...value.modelDraft, active: false } } : {}) });
        }}>
          {!catalog.modelIds.includes(project.presentation.modelKey) ? <option value={project.presentation.modelKey} disabled>{project.presentation.modelKey}（原值，目前目錄未支援）</option> : null}
          {catalog.modelIds.map((id) => <option key={id} value={id}>{project.presentation.uploadedModel && id === project.presentation.modelKey ? "已上傳的英雄模型" : id}</option>)}</select></label>{lockButton("presentation", "presentation.modelKey")}
        {project.presentation.modelProvenance ? <aside className="hero-model-source" aria-label="模型實際來源">
          <strong>{{ exact: "同角色素材", alternate: "同角色版本互通", "style-proxy": "近似風格替代" }[project.presentation.modelProvenance.relationship]}</strong>
          <p>{project.presentation.modelProvenance.sourceCharacter} · {project.presentation.modelProvenance.sourceWork}</p>
          <p style={{ whiteSpace: "pre-wrap" }}>{project.presentation.modelProvenance.notes}</p>
        </aside> : null}
        <HeroModelUploadPanel key={project.projectId} draft={value.modelDraft} locked={isLocked("presentation", "presentation.modelKey") || isLocked("presentation", "presentation.uploadedModel") || isLocked("presentation", "presentation.assetLocks")} onDraft={(modelDraft) => {
          const current = useHeroStore.getState().value;
          if (current?.project.projectId !== project.projectId) return;
          if (["presentation.modelKey", "presentation.uploadedModel", "presentation.assetLocks"].some((path) => fieldOwner(current.project, "presentation", path) === "locked")) throw new Error("模型欄位已鎖定，請解除鎖定後再試。");
          state.commit({ ...current, modelDraft, project: { ...current.project, revision: current.project.revision + 1 } });
        }} onApply={(modelDraft, prepared) => {
          const current = useHeroStore.getState().value;
          if (current?.project.projectId !== project.projectId) return;
          if (["presentation.modelKey", "presentation.uploadedModel", "presentation.assetLocks"].some((path) => fieldOwner(current.project, "presentation", path) === "locked")) throw new Error("模型欄位已鎖定，請解除鎖定後再試。");
          if (!current.modelDraft || modelDraftFingerprint(current.modelDraft) !== modelDraftFingerprint(modelDraft)) throw new Error("處理期間模型或動作已變更，請重新套用。");
          let next = editHeroProject(current.project, "presentation", "presentation.modelKey", prepared.document!.id);
          next = editHeroProject(next, "presentation", "presentation.uploadedModel", prepared.model);
          const locks = next.presentation.assetLocks.map((lock) => ({ ...lock, consumers: lock.consumers.filter((consumer) => consumer !== "champion:model") })).filter((lock) => lock.consumers.length);
          next = editHeroProject(next, "presentation", "presentation.assetLocks", [...locks, { path: uploadedHeroModelPath(prepared.model!), sha256: prepared.model!.sha256, byteSize: prepared.model!.byteSize, mediaType: "model/gltf-binary", kind: "model", registry: "normalized-upload", consumers: ["champion:model"] }]);
          state.commit({ ...current, project: next, modelDraft });
        }} />
        <details><summary>英雄肖像與技能圖片</summary>
          <LocalIconUploadPanel key={`${project.projectId}/hero`} kind="champions" docId={project.projectId} label="英雄肖像" value={project.presentation.championIcon ?? undefined} sourceSha256={value.originalIconRefs?.[`champions/${project.projectId}`]} onStaged={(icon) => { const current = useHeroStore.getState().value!; state.commit({ ...current, originalIconRefs: { ...current.originalIconRefs, [`champions/${project.projectId}`]: icon.contentSha256 } }); }} onChange={(path) => edit("presentation", "presentation.championIcon", path ?? null)} />
          <LocalIconUploadPanel key={`${project.projectId}/${slot}`} kind="abilities" docId={`${project.projectId}.${slot.toLowerCase()}`} label={`${slot} 技能圖片`} value={project.presentation.slots[slot].icon ?? undefined} sourceSha256={value.originalIconRefs?.[`abilities/${project.projectId}.${slot.toLowerCase()}`]} onStaged={(icon) => { const current = useHeroStore.getState().value!; state.commit({ ...current, originalIconRefs: { ...current.originalIconRefs, [`abilities/${project.projectId}.${slot.toLowerCase()}`]: icon.contentSha256 } }); }} onChange={(path) => edit("presentation", `presentation.slots.${slot}.icon`, path ?? null)} />
        </details>
        <details><summary>施法特效與聲音</summary><p>施法特效只在技能確實施放時播放。被動回饋請使用對應機制事件的演出。</p>
          <FormRenderer node={walkZod(zHeroPresentation.shape.slots.shape[slot].pick({ vfxLayers: true, sfxKey: true }))} value={project.presentation.slots[slot]} dataPath={`presentation.slots.${slot}`} errors={rawErrors} onChange={(path, next) => edit("presentation", path, next)} />
        </details>
      </> : <p>請先在快速創作採用一份方案。</p> : <>
        <h2>完整英雄創作資料</h2><p>進階、快速與視覺模式編輯同一份作品。鎖定欄位在套用時仍會保留。</p>
        <textarea className="hero-json" aria-label="完整英雄資料" spellCheck={false} value={value.rawInputs.advanced?.text ?? JSON.stringify(project, null, 2)} onChange={(event) => state.commit({ ...value, project: { ...project, revision: project.revision + 1 }, rawInputs: { ...value.rawInputs, advanced: { text: event.target.value, kind: "json" } } })} />
        <button type="button" onClick={() => {
          try {
            const parsed = zHeroProject.parse(JSON.parse(value.rawInputs.advanced?.text ?? JSON.stringify(project)));
            if (JSON.stringify(parsed.sourceLock) !== JSON.stringify(project.sourceLock) || parsed.projectId !== project.projectId) throw new Error("專案與來源身分不能由進階替換改寫。");
            let next = editHeroProject(project, "identity", "brief", parsed.brief);
            next = editHeroProject(next, "skills", "acceptedPlan", parsed.acceptedPlan);
            next = editHeroProject(next, "presentation", "presentation", parsed.presentation);
            const rawInputs = { ...value.rawInputs }; delete rawInputs.advanced;
            state.commit({ ...value, project: next, rawInputs }); setMessage("已套用進階修改。");
          } catch (error) { setMessage(String(error)); }
        }}>套用到作品</button>
      </>}
    </section><aside className="hero-result"><h2>目前結果</h2>
      {Object.entries(rawErrors).map(([path, errors]) => <p key={path} role="alert">{path}: {errors.join("、")}</p>)}
      {validation.error ? <p role="alert">{validation.error}</p> : null}
      {uploaded.error ? <p role="alert">模型載入失敗：{uploaded.error}</p> : null}
      {value.rawInputs.advanced ? <p>進階修改尚未套用。原始輸入已加入本機草稿。</p> : null}
      {project.acceptedPlan && !validation.result && !Object.keys(rawErrors).length ? <p>正在背景驗證六槽技能…</p> : null}
      {validation.result?.errors.map((error, index) => <p role="alert" key={index}>{error}</p>)}
      {compiled ? <><p>{validation.result!.errors.length === 0 ? "六槽編譯與模擬已通過" : "請修正上方問題"}</p><p>目前預覽 {slot} · 第 {project.revision} 版</p>
        {selected ? <><p>目標生命：{Math.round(selected.before.targetHp)} → {Math.round(selected.after.targetHp)}</p><p>事件：{Object.entries(selected.eventCounts).map(([name, count]) => `${name} × ${count}`).join("、")}</p></> : null}
        <details><summary>檢視執行結果</summary><pre>{JSON.stringify(compiled.abilityDrafts[slot], null, 2)}</pre></details>
      </> : null}
      {validation.preview && uploaded.ready ? <HeroInteractivePreview key={project.projectId} project={project} slot={slot} catalog={catalog} frozenContent={uploaded.frozenContent} result={validation.preview} current={validation.result?.revision === project.revision && !!validation.result.compiled && !Object.keys(rawErrors).length && !value.rawInputs.advanced} editable={value.mode === "visual"} errors={rawErrors} onChange={commit} /> : null}
    </aside></div></RawInputContext.Provider>
    <HeroPackagePanel key={project.projectId} value={value} valid={!!project.acceptedPlan && uploaded.ready && (!value.modelDraft?.active || value.modelDraft.appliedFingerprint === modelDraftFingerprint(value.modelDraft)) && validation.result?.revision === project.revision && validation.result.errors.length === 0 && !Object.keys(rawErrors).length && !value.rawInputs.advanced} />
  </main>;
}
