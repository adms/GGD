/**
 * 鑄技工坊 — 選卡頁 (design §2.3 step 1).
 *
 * 29 cards, one per behaviour family recovered from the JASS reverse-engineering
 * pass. Each card shows what the designer needs in order to CHOOSE: the family
 * name, one line of description, the exemplar it was measured from, and the
 * 引擎支援度 badge. Draft families are dimmed and unselectable with a P2/P3 chip —
 * `expand()` throws on them, so offering them would be a lie.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TemplateDoc } from "@ggd/shared/content";
import { api } from "../api/client";
import { useChampionDocs } from "../preview/useChampionDocs";
import { originOf } from "@ggd/shared/content/statNormalization";
import { badgeFor } from "./badge";
import { degradeNotes } from "./degrade";
import {
  FORGE_TIER_LABELS,
  SKILL_TYPE_PRESETS,
  rankSkillTypes,
  skillTypeRecipeIssues,
  type SkillTypePreset,
  type StatNormalizationRecommendationDoc,
} from "./skillTypePresets";
import {
  CAPABILITY_ONLY_CONDITION_KINDS,
  CAPABILITY_ONLY_EFFECT_KINDS,
  CAPABILITY_ONLY_HOOK_EVENTS,
  SKILL_ACCEPTANCE_CANDIDATES,
  SKILL_ACCEPTANCE_THEME_IDS,
} from "./skillAcceptanceCatalog";

async function fetchTemplates(): Promise<TemplateDoc[]> {
  const index = await api.index("ability-templates");
  const docs = await Promise.all(
    index.entries.map((e) => api.doc<TemplateDoc>("ability-templates", e.id)),
  );
  // enabled first, then by descending 引擎支援度 — the designer's real ordering
  return docs.sort((a, b) => {
    if (a.status !== b.status) return a.status === "enabled" ? -1 : 1;
    return b.gapScore - a.gapScore;
  });
}

export function ForgeGallery({
  onPick,
}: {
  /**
   * The clicked card AND the whole indexed set. 模板複數套用 needs the studio to
   * be able to offer a SECOND card, and the gallery is the only place that has
   * already paid for the index — handing the list over is one argument and
   * removes a second fetch that could disagree with what was just clicked.
   */
  onPick(
    t: TemplateDoc,
    all: readonly TemplateDoc[],
    context?: { readonly skillType?: SkillTypePreset; readonly championId?: string },
  ): void;
}) {
  const [query, setQuery] = useState("");
  const [championId, setChampionId] = useState("");
  const { data, error, isLoading } = useQuery({
    queryKey: ["forge", "templates"],
    queryFn: fetchTemplates,
  });
  const championQuery = useChampionDocs();
  const statNormalizationQuery = useQuery({
    queryKey: ["forge", "stat-normalization"],
    queryFn: () => api.doc<StatNormalizationRecommendationDoc>("config", "stat-normalization"),
    staleTime: 60_000,
  });

  if (error) {
    return <p className="error">模板索引讀取失敗 — content-api 有在跑嗎？</p>;
  }
  if (isLoading || !data) return <p className="forge-loading">載入模板…</p>;

  const enabled = data.filter((t) => t.status === "enabled");
  const drafts = data.filter((t) => t.status !== "enabled");
  // Only 27 rows today. Keeping this as a plain calculation is both cheaper than
  // memo bookkeeping and, crucially, safe across the loading → loaded render:
  // no hook may appear after the early loading/error returns above.
  const visibleEnabled = enabled.filter((template) => templateMatchesQuery(template, query));
  const visibleDrafts = drafts.filter((template) => templateMatchesQuery(template, query));
  const selectedChampion = championQuery.champions.find((champion) => champion.id === championId) ?? null;
  const selectedOrigin = selectedChampion ? originOf(selectedChampion) : null;
  const templatesById = new Map(data.map((template) => [template.id, template]));
  const recipeIssues = new Map(
    SKILL_TYPE_PRESETS.map((preset) => [preset.id, skillTypeRecipeIssues(preset, templatesById)] as const)
      .filter(([, issues]) => issues.length > 0),
  );
  const rankedTypes = rankSkillTypes(
    selectedOrigin,
    new Set(enabled.map((template) => template.id)),
    statNormalizationQuery.data,
    recipeIssues,
  );

  return (
    <div className="forge-gallery">
      <header className="forge-head">
        <h1>鑄技工坊</h1>
        <p className="forge-sub">
          選行為模板 → 填參數 → 即時試放 → 一鍵寫回。模板取自 90 英雄 JASS 逆向的{" "}
          {data.length} 類行為分類，參數預設值是範本技能的實測值。
        </p>
      </header>

      <section className="forge-skill-types" aria-labelledby="forge-skill-type-title">
        <div className="forge-skill-type-head">
          <div>
            <h2 id="forge-skill-type-title" className="forge-section">快速技能類型</h2>
            <p className="forge-note">
              選一種類型就會帶入效果積木與建議五級距；進工作台後每一項都能改。
            </p>
          </div>
          <label className="forge-origin-picker">
            <span>依角色出身推薦排序</span>
            <select value={championId} onChange={(event) => setChampionId(event.target.value)}>
              <option value="">— 不指定角色 —</option>
              {championQuery.champions
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"))
                .map((champion) => (
                  <option key={champion.id} value={champion.id}>
                    {champion.name} · {originOf(champion)} · {champion.id}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {championQuery.error ? <p className="error">角色資料讀取失敗：{championQuery.error.message}</p> : null}
        {selectedOrigin && statNormalizationQuery.error ? (
          <p className="error">出身推薦資料讀取失敗；保留全部手動選項，不顯示推測推薦。</p>
        ) : null}
        {selectedChampion ? (
          <p className="forge-origin-summary">
            <b>{selectedChampion.name}</b> · 出身 <b>{selectedOrigin}</b>
            {selectedChampion.playstyle?.length ? ` · ${selectedChampion.playstyle.join("・")}` : ""}
            <span>（只調整排序，不限制可選類型）</span>
          </p>
        ) : null}
        <div className="forge-type-grid">
          {rankedTypes.map(({ preset, recommendationRank, recommendationReasons, available, unavailableReasons }) => {
            const seed = templatesById.get(preset.templateIds[0] ?? "");
            const tiers = Object.entries(preset.tierDefaults)
              .map(([axis, tier]) => `${FORGE_TIER_LABELS[axis as keyof typeof FORGE_TIER_LABELS]} ${tier}`)
              .join(" · ");
            return (
              <button
                key={preset.id}
                type="button"
                className={`forge-type-card${recommendationRank === 1 ? " recommended" : ""}`}
                disabled={!available || !seed}
                onClick={() => seed && onPick(seed, data, { skillType: preset, championId: championId || undefined })}
              >
                <span className="forge-card-top">
                  <b>{preset.label}</b>
                  {recommendationRank ? <span className="forge-recommend">推薦 {recommendationRank}</span> : null}
                </span>
                <span>{preset.summary}</span>
                <small>積木：{preset.templateIds.map((id) => templatesById.get(id)?.name ?? id).join(" ＋ ")}</small>
                <small>預設：{tiers || "沿用技能現值"}</small>
                {recommendationRank ? (
                  <small className="forge-recommend-reason">
                    依主程式出身表：{recommendationReasons.join("・")}
                  </small>
                ) : null}
                {!available ? (
                  <small className="error">
                    目前無法建立：{unavailableReasons.join("；") || "缺少必要積木"}
                  </small>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <label className="forge-search">
        <span>搜尋模板</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="名稱、模板 ID、範本技能、JASS 或說明"
        />
      </label>

      <h2 className="forge-section">
        可用模板 <span className="forge-count">{visibleEnabled.length}{query.trim() ? ` / ${enabled.length}` : ""}</span>
      </h2>
      <div className="forge-grid">
        {visibleEnabled.map((t) => (
          <TemplateCard key={t.id} t={t} onPick={(x) => onPick(x, data, { championId: championId || undefined })} />
        ))}
        {visibleEnabled.length === 0 ? <p className="forge-empty">沒有符合的可用模板。</p> : null}
      </div>

      <h2 className="forge-section">
        規劃中 <span className="forge-count">{visibleDrafts.length}{query.trim() ? ` / ${drafts.length}` : ""}</span>
        <span className="forge-section-note">
          — 這些家族的 sim 詞彙還沒有，展開器會直接拒絕，不會偷偷產出無效技能
        </span>
      </h2>
      <div className="forge-grid">
        {visibleDrafts.map((t) => (
          <TemplateCard key={t.id} t={t} onPick={(x) => onPick(x, data, { championId: championId || undefined })} />
        ))}
        {visibleDrafts.length === 0 ? <p className="forge-empty">沒有符合的規劃中模板。</p> : null}
      </div>

      <AcceptanceCatalog />
    </div>
  );
}

function AcceptanceCatalog() {
  const owner = SKILL_ACCEPTANCE_CANDIDATES.filter((row) => row.group === "owner-union");
  const coverage = SKILL_ACCEPTANCE_CANDIDATES.filter((row) => row.group === "runtime-coverage");
  const capabilityOnly = [
    ...CAPABILITY_ONLY_EFFECT_KINDS.map((id) => `effect:${id}`),
    ...CAPABILITY_ONLY_HOOK_EVENTS.map((id) => `hook:${id}`),
    ...CAPABILITY_ONLY_CONDITION_KINDS.map((id) => `condition:${id}`),
  ];
  return (
    <details className="forge-acceptance-catalog">
      <summary>
        自我驗收目錄 · {SKILL_ACCEPTANCE_THEME_IDS.size} 個技能主題／{SKILL_ACCEPTANCE_CANDIDATES.length} 份實際技能 JSON
      </summary>
      <p>
        前 {owner.length} 份是 Owner 聯集與視覺代表；另 {coverage.length} 份補齊目前內容真的使用到的
        effect／hook／condition。清單只拿現役技能作重建基準，不直接改回遊戲內容。
      </p>
      <div className="forge-acceptance-groups">
        <AcceptanceRows title="Owner 聯集與代表情境" rows={owner} />
        <AcceptanceRows title="Runtime 覆蓋補集" rows={coverage} />
      </div>
      <p className="forge-capability-only">
        <b>仍須合成 fixture 驗證的已出貨積木：</b>{capabilityOnly.join(" · ")}
      </p>
    </details>
  );
}

function AcceptanceRows({
  title,
  rows,
}: {
  title: string;
  rows: readonly (typeof SKILL_ACCEPTANCE_CANDIDATES)[number][];
}) {
  return (
    <section>
      <h3>{title} <span className="forge-count">{rows.length}</span></h3>
      <ol>
        {rows.map((row) => (
          <li key={row.id}>
            <code>{row.id}</code> <b>{row.name}</b>
            <span>{row.acceptance}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function templateMatchesQuery(template: TemplateDoc, rawQuery: string): boolean {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return true;
  return [
    template.id,
    template.name,
    template.description,
    template.family,
    template.exemplar.skill,
    template.exemplar.jass,
  ].some((value) => value.toLocaleLowerCase().includes(query));
}

function TemplateCard({ t, onPick }: { t: TemplateDoc; onPick(t: TemplateDoc): void }) {
  const badge = badgeFor(t.gapScore);
  const draft = t.status !== "enabled";
  const notes = degradeNotes(t.requires);
  const slots = Object.keys(t.params).length;

  const longDescription = t.description.length > 280;

  return (
    <article className={`forge-card${draft ? " draft" : ""}`}>
      <button
        type="button"
        className="forge-card-pick"
        disabled={draft}
        onClick={() => onPick(t)}
        title={draft ? "此家族尚未實作展開路徑 (P2/P3)" : `以「${t.name}」建立技能`}
      >
        <div className="forge-card-top">
          <span className="forge-card-name">{t.name}</span>
          <span className={`forge-badge ${badge.tone}`}>{badge.label}</span>
        </div>
        <p className={`forge-card-desc${longDescription ? " clipped" : ""}`}>{t.description}</p>
        <dl className="forge-card-meta">
          <div>
            <dt>範本</dt>
            <dd>
              {t.exemplar.skill} · <code>{t.exemplar.jass}</code>
            </dd>
          </div>
          <div>
            <dt>參數槽</dt>
            <dd>{draft ? "—" : slots}</dd>
          </div>
        </dl>
        {notes.length > 0 ? (
          <ul className="forge-card-degrade">
            {notes.map((n) => (
              <li key={n.capability}>
                <span className="cap">{n.capability}</span> 缺席 · P{n.phase}
              </li>
            ))}
          </ul>
        ) : null}
      </button>
      {longDescription ? (
        <details className="forge-card-details">
          <summary>完整模板說明</summary>
          <p>{t.description}</p>
        </details>
      ) : null}
      {draft ? <span className="forge-chip">P2 / P3</span> : null}
    </article>
  );
}
