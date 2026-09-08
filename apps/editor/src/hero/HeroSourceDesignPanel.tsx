import { HERO_SLOTS, type HeroProject, type HeroSlot } from "@ggd/shared/content";
import { editHeroProject } from "./projectModel";

export function HeroSourceDesignPanel({ project, slot, onSlot, onChange, readOnly = false }: {
  project: HeroProject; slot: HeroSlot; onSlot(slot: HeroSlot): void; onChange?(project: HeroProject): void; readOnly?: boolean;
}) {
  const source = project.sourceDesign;
  if (!source) return null;
  const original = source.slots[slot];
  return <section className="hero-source-design" aria-label="原設計與逐槽審查">
    <h2>原設計與逐槽審查</h2>
    <p>保留 {source.name} 的交接原文。模板模擬通過與模型替代，不會自動完成這些設計要求。</p>
    <details><summary>原始角色說明與完整投稿文字</summary><pre style={{ whiteSpace: "pre-wrap" }}>{source.ownerText}</pre><p style={{ whiteSpace: "pre-wrap" }}>{source.reviewText}</p></details>
    <nav className="hero-slots" aria-label="原設計技能槽">{HERO_SLOTS.map((entry) => <button type="button" key={entry} aria-pressed={entry === slot} onClick={() => onSlot(entry)}>{entry}</button>)}</nav>
    <h3>{slot} · {original.name}</h3>
    <p style={{ whiteSpace: "pre-wrap" }}>{original.ownerDescription}</p>
    <details><summary>交接時的模板行為</summary><p style={{ whiteSpace: "pre-wrap" }}>{original.baselineBehavior}</p></details>
    <p><strong>待補與複核：</strong><span style={{ whiteSpace: "pre-wrap" }}>{original.requiredRefinement || "原稿未列差異，仍需檢查機制與畫面。"}</span></p>
    {readOnly || !onChange ? <div><strong>作者的此槽處理說明</strong><p style={{ whiteSpace: "pre-wrap" }}>{project.refinementNotes?.[slot] || "作者尚未填寫處理說明。"}</p></div>
      : <label>此槽處理說明<textarea rows={3} value={project.refinementNotes?.[slot] ?? ""} onChange={(event) => onChange(editHeroProject(project, "mechanics", `refinementNotes.${slot}`, event.target.value))} /></label>}
    <p>{readOnly ? "這是送審時固定的原文與處理說明；正式裁決請填入審查意見。" : "處理說明會隨作品保存，正式裁決仍由投稿審查記錄。"}</p>
  </section>;
}
