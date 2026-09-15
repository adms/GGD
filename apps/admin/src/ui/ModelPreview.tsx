/**
 * 🔭 後台「上線模型版本」下拉選單的**即時預覽** —— 選了就載入，⛔ 不會套用。
 *
 * owner 2026-09-15（逐字）：「請你比照最近上架的素材重新比對在後台上架 特別是下拉式選單 要能即時載入御覽」
 *
 * ⭐ 不自己畫：直接用編輯器的 `ModelPanel` —— 它與遊戲走同一套規則
 * （`hiddenPrimitives` · `glbYawOffset` · `normalizedModelScale` · `clipMap` 快速播放），
 * 外觀照編輯器英雄預覽的組法（`effectiveHeroAppearance` ＋ `normalizeBody`）。
 * ⇒ 後台看到的，就是玩家那一場會看到的那一顆，⛔ 不是第二套近似的渲染。
 *
 * ⛔ 這個檔**只能被 lazy 載入**（`ChampionModelVersions.tsx`）：Babylon（~1MB）不可以進 admin 主 bundle
 * （`contentGate.test.ts`，GH#730 的回歸修復同一個理由）。樣式也跟著這個 chunk 才載入。
 */
import "./modelPreview.css";
import { ModelPanel } from "../../../editor/src/preview3d/ModelPanel";
import { effectiveHeroAppearance } from "../../../editor/src/preview3d/heroAppearance";

type ChampionLike = Parameters<typeof effectiveHeroAppearance>[0];

function appearanceOf(champion: unknown): ReturnType<typeof effectiveHeroAppearance> | null {
  const c = champion as Partial<ChampionLike> | null;
  if (!c || typeof c.id !== "string" || typeof c.modelKey !== "string") return null;
  try {
    return effectiveHeroAppearance(c as ChampionLike);
  } catch {
    return null; // 外觀組不出來 ⇒ 仍然畫模型本身（⛔ 不是整個預覽消失）
  }
}

export function ModelPreview({ doc, champion }: { doc: Record<string, unknown>; champion: unknown }): React.JSX.Element {
  const appearance = appearanceOf(champion);
  return (
    <div className="admin-model-preview">
      <ModelPanel doc={doc} autoPlay="idle" appearance={{ ...(appearance ?? {}), normalizeBody: true }} />
    </div>
  );
}
