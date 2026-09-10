import { useState } from "react";
import { AcquiredHeroExamples } from "./AcquiredHeroExamples";
import { COMMUNITY_HERO_EXAMPLES, createCommunityHeroRecipe, type CommunityHeroExample } from "@ggd/shared/content/heroForge/communityExamples";
import { COMMUNITY_LOL_BATCH2_EXAMPLES, COMMUNITY_LOL_BATCH2_RELEASE_READY } from "@ggd/shared/content/heroForge/communityLolBatch2";
import type { LocalDraft } from "../drafts/repository";
import { autosave } from "../drafts/session";
import { useHeroCatalog } from "./catalog";
import { saveHeroLocalCopy } from "./communityDrafts";

const examples = [...COMMUNITY_HERO_EXAMPLES, ...(COMMUNITY_LOL_BATCH2_RELEASE_READY ? COMMUNITY_LOL_BATCH2_EXAMPLES : [])];

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
    <ul className="draft-cards">{examples.map((example) => <li key={example.id}>
      <h3>{example.name}</h3><p>{example.summary}</p>
      <details><summary>查看改編差異</summary><ul>{example.adaptations.map((text) => <li key={text}>{text}</li>)}</ul>
        <a href={example.sourceUrl} target="_blank" rel="noreferrer">角色概念來源</a>
      </details>
      <button type="button" disabled={pending !== null} onClick={() => void create(example)}>{pending === example.id ? "正在保存…" : `建立${example.inspiration}改編作品`}</button>
    </li>)}</ul>
  </section><AcquiredHeroExamples onOpen={onOpen} /></>;
}
