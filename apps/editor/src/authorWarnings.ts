/**
 * ⭐【GH#480】編輯器側的**存檔當下警示** —— 技能卡與英雄卡。
 *
 * owner 2026-08-20：「後台跟 **codex編輯器**的 創建新英雄 ⋯ 生成代入與**檢查跳警示**」。
 *
 * ── 這一支補的是編輯器缺的哪一半 ────────────────────────────────────────────
 *
 * `EditorView` 已經在每一次改動上跑**出貨 Zod**（`entry.schema.safeParse`），
 * 所以「空值 / 落在上下界外」那一半**已經有了**，而且是即時的。
 *
 * ⛔ 缺的是**語意**那一半 —— Zod 收得下但遊戲裡什麼都不會發生的那一族：
 *   · 說明寫「25 秒冷卻」而 `cooldown` 是 60（兩個都是合法數字）
 *   · 整棵效果樹一個數字都動不到（第一·五守則）
 *   · ⭐ 機制數字被寫進 `「…」` —— 台詞不是效果，引擎一格都不讀（第〇·六守則②）
 *   · ⭐ GH#1260 B3 修正輪：沒標級別的距離／範圍**載入時會吸格**（`geometrySnap.ts`）——
 *     欄位寫 2.75、場上是 3，在同一格裡微調**不會有任何效果**。
 *
 * ⚠️ 這幾條沒有一條會讓 `safeParse` 失敗，所以在這支之前，編輯器對它們**完全沉默**。
 *
 * ⛔ 它**不擋存檔**（owner 2026-08-12：「只是個警告標記，並不會擋」）——
 * `save` 的 disabled 條件只讀 `errorCount`，這裡的東西一條都不進去。
 */
import {
  checkNewHeroDocs,
  type NewHeroWarning,
} from "@ggd/shared/content/newHeroChecks";
import {
  geometrySnapNotices,
  geometrySnapTablesFromConfigs,
  type GeometrySnapNotice,
} from "@ggd/shared/content/geometrySnap";

/** 只有這兩個集合有這組判斷；其餘一律回空陣列（⛔ 不猜）。 */
const CHECKED = new Set(["abilities", "champions"]);

/** 吸格提示要讀的三張表（`EditorView` 照這張清單抓 config）。 */
export const GEOMETRY_SNAP_CONFIG_IDS = ["aoe-tiers", "range-tiers", "displacement-tiers"] as const;

export type AuthorWarning = Omit<NewHeroWarning, "rule"> & {
  readonly rule: NewHeroWarning["rule"] | "geometry-snap";
};

const SWITCH: Readonly<Record<GeometrySnapNotice["ladder"], string>> = {
  aoe: "aoe-tiers",
  range: "range-tiers",
  travel: "displacement-tiers",
  push: "displacement-tiers",
};

/**
 * @param snapConfigs 三張級距表的 config 文件；⛔ 還沒抓到（`undefined`）就不判吸格，⛔ 不拿預設表猜
 *   —— 後台可能已經把 `snapUntiered` 關掉，拿出貨預設去喊等於一句假警示。
 */
export function authorWarnings(
  collection: string | null,
  docId: string | null,
  draft: unknown,
  snapConfigs?: readonly unknown[],
): AuthorWarning[] {
  if (collection === null || docId === null) return [];
  if (!CHECKED.has(collection)) return [];
  if (draft === null || typeof draft !== "object") return [];
  const out: AuthorWarning[] = checkNewHeroDocs([
    {
      collection: collection as "abilities" | "champions",
      id: docId,
      doc: draft as Record<string, unknown>,
    },
  ]);
  if (collection !== "abilities" || snapConfigs === undefined) return out;
  for (const n of geometrySnapNotices(draft, geometrySnapTablesFromConfigs(snapConfigs))) {
    out.push({
      level: "warn",
      rule: "geometry-snap",
      doc: `abilities/${docId}`,
      field: n.path,
      message:
        `寫的是 ${n.from}，載入時會吸到最近一格 ${n.to}（${n.tier}）—— 場上跑的是 ${n.to}，` +
        `在同一格裡微調這個數字不會有任何效果。要精確值：改寫級別欄位，或到後台 ${SWITCH[n.ladder]} 關掉 snapUntiered。`,
    });
  }
  return out;
}
