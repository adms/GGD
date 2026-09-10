import { useState } from "react";
import { COMMUNITY_HERO_EXAMPLES, createCommunityHeroRecipe, type CommunityHeroExample } from "@ggd/shared/content/heroForge/communityExamples";
import { COMMUNITY_LOL_BATCH2_EXAMPLES, COMMUNITY_LOL_BATCH2_RELEASE_READY } from "@ggd/shared/content/heroForge/communityLolBatch2";
import type { LocalDraft } from "../drafts/repository";
import { autosave } from "../drafts/session";
import { useHeroCatalog } from "./catalog";
import { saveHeroLocalCopy } from "./communityDrafts";

export function CommunityHeroExamples({ onOpen }: { onOpen(draft: LocalDraft): void }) {
  const catalog = useHeroCatalog().data;
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = async (recipe: CommunityHeroExample) => {
    setPending(recipe.id); setError(null);
    try {
      const project = createCommunityHeroRecipe(recipe, `hero-${crypto.randomUUID()}`, catalog.templates, catalog.generatorVersion);
      const draft = saveHeroLocalCopy({ project, rawInputs: {}, mode: "visual", origin: project.acceptedPlan!.origin });
      // Show the editable copy only after its durable save has completed.
      await autosave.flush(); onOpen(draft);
    } catch (cause) { setError(String(cause)); }
    finally { setPending(null); }
  };
  return <><section className="community-hero-examples" aria-label="社群角色驗收範例">
    <h2>LoL 概念改編・社群角色驗收</h2>
    <p>建立自己的六槽英雄副本，直接試玩、調整及送審。範例使用本遊戲的積木與級距，AI 關閉也能完成。</p>
    {error ? <p role="alert">{error}</p> : null}
    <ul className="draft-cards">{COMMUNITY_HERO_EXAMPLES.map((example) => <li key={example.id}>
      <h3>{example.name}</h3><p>{example.summary}</p>
      <details><summary>查看改編差異</summary><ul>{example.adaptations.map((text) => <li key={text}>{text}</li>)}</ul>
        <a href={example.sourceUrl} target="_blank" rel="noreferrer">角色概念來源</a>
      </details>
      <button type="button" disabled={pending !== null} onClick={() => void create(example)}>{pending === example.id ? "正在保存…" : `建立${example.inspiration}改編作品`}</button>
    </li>)}</ul>
  </section>
  <section className="community-hero-examples" aria-label="LoL 第四批可編輯草稿候選">
    <h2>LoL 第四批・11 名可編輯草稿候選</h2>
    <p>建立獨立本機草稿後可繼續編輯與備份；這些候選尚未發布，也不代表已完成上架驗收。</p>
    {!COMMUNITY_LOL_BATCH2_RELEASE_READY ? <p role="note"><strong>核心機制尚未完成。</strong>各角色目前的簡化與待補項目列在下方，請先閱讀再建立草稿。</p> : null}
    <ul className="draft-cards">{COMMUNITY_LOL_BATCH2_EXAMPLES.map((example) => <li key={example.id}>
      <h3>{example.name}・草稿候選</h3><p>{example.summary}</p>
      <p><strong>目前改編差異與待完成項目</strong></p>
      <ul>{example.adaptations.map((text) => <li key={text}>{text}</li>)}</ul>
      <a href={example.sourceUrl} target="_blank" rel="noreferrer">角色概念來源</a>
      {example.modelKey && !catalog.modelIds.includes(example.modelKey) ? <p role="note">此草稿引用的模型目前不在可用目錄；建立草稿會保留原引用，需待模型可用後才能完成模型檢查。</p> : null}
      <button type="button" disabled={pending !== null} onClick={() => void create(example)}>{pending === example.id ? "正在保存…" : `建立${example.inspiration}草稿候選`}</button>
    </li>)}</ul>
  </section></>;
}
