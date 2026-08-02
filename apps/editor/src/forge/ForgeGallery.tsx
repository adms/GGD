/**
 * 鑄技工坊 — 選卡頁 (design §2.3 step 1).
 *
 * 29 cards, one per behaviour family recovered from the JASS reverse-engineering
 * pass. Each card shows what the designer needs in order to CHOOSE: the family
 * name, one line of description, the exemplar it was measured from, and the
 * 引擎支援度 badge. Draft families are dimmed and unselectable with a P2/P3 chip —
 * `expand()` throws on them, so offering them would be a lie.
 */
import { useQuery } from "@tanstack/react-query";
import type { TemplateDoc } from "@ggd/shared/content";
import { api } from "../api/client";
import { badgeFor } from "./badge";
import { degradeNotes } from "./degrade";

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
  onPick(t: TemplateDoc, all: readonly TemplateDoc[]): void;
}) {
  const { data, error, isLoading } = useQuery({
    queryKey: ["forge", "templates"],
    queryFn: fetchTemplates,
  });

  if (error) {
    return <p className="error">模板索引讀取失敗 — content-api 有在跑嗎？</p>;
  }
  if (isLoading || !data) return <p className="forge-loading">載入模板…</p>;

  const enabled = data.filter((t) => t.status === "enabled");
  const drafts = data.filter((t) => t.status !== "enabled");

  return (
    <div className="forge-gallery">
      <header className="forge-head">
        <h1>鑄技工坊</h1>
        <p className="forge-sub">
          選行為模板 → 填參數 → 即時試放 → 一鍵寫回。模板取自 90 英雄 JASS 逆向的{" "}
          {data.length} 類行為分類，參數預設值是範本技能的實測值。
        </p>
      </header>

      <h2 className="forge-section">
        可用模板 <span className="forge-count">{enabled.length}</span>
      </h2>
      <div className="forge-grid">
        {enabled.map((t) => (
          <TemplateCard key={t.id} t={t} onPick={(x) => onPick(x, data)} />
        ))}
      </div>

      <h2 className="forge-section">
        規劃中 <span className="forge-count">{drafts.length}</span>
        <span className="forge-section-note">
          — 這些家族的 sim 詞彙還沒有，展開器會直接拒絕，不會偷偷產出無效技能
        </span>
      </h2>
      <div className="forge-grid">
        {drafts.map((t) => (
          <TemplateCard key={t.id} t={t} onPick={(x) => onPick(x, data)} />
        ))}
      </div>
    </div>
  );
}

function TemplateCard({ t, onPick }: { t: TemplateDoc; onPick(t: TemplateDoc): void }) {
  const badge = badgeFor(t.gapScore);
  const draft = t.status !== "enabled";
  const notes = degradeNotes(t.requires);
  const slots = Object.keys(t.params).length;

  return (
    <button
      type="button"
      className={`forge-card${draft ? " draft" : ""}`}
      disabled={draft}
      onClick={() => onPick(t)}
      title={draft ? "此家族尚未實作展開路徑 (P2/P3)" : `以「${t.name}」建立技能`}
    >
      <div className="forge-card-top">
        <span className="forge-card-name">{t.name}</span>
        <span className={`forge-badge ${badge.tone}`}>{badge.label}</span>
      </div>
      <p className="forge-card-desc">{t.description}</p>
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
      {draft ? <span className="forge-chip">P2 / P3</span> : null}
    </button>
  );
}
