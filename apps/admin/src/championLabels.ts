/**
 * 英雄 id → 「看得懂是誰」的一行字。GH#497。
 *
 * owner 2026-08-21:
 *   「**英雄上下架 及 免費解鎖名單 英雄ID以外還要有英雄名稱** 不然看不出來是誰，
 *    **變身態的話也要註明**」
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 只加名字是**不夠**的 —— 這是這個模組存在的真正理由
 * ---------------------------------------------------------------------------
 * 內容樹裡有 20 對 base/alternate，其中一大半**兩張卡的 `name` 逐字相同**
 * （索隆 · 勇者小呆 · 妖狐藏馬 · 草泥馬 · 飛影 · 莉娜因巴斯 · 天地志狼 · 櫻綻剎那
 *  · Saber · 龍宮禮奈 · 白木卡迪那 · 依文潔琳 · 臭作 · 魯夫 · 傑富力士 …）。
 * 在下架名單上印出兩列一模一樣的「三刀流劍士 - 索隆」，比只印 id **更危險**：
 * 操作者會以為自己看到重複列而挑掉錯的那一張，⛔ 而兩張卡的意義完全相反
 * （本體是玩家選的那一位，變身態只有技能觸發得到）。
 *
 * ⇒ 所以一列的組成是 **id + 名字 + 形態標註**，三者缺一不可。
 *
 * ---------------------------------------------------------------------------
 * ⛔ 判定是**推導**的，這裡一個英雄 id 都沒有
 * ---------------------------------------------------------------------------
 * 唯一的問題是 `transform.role === "alternate"`，讀 `/content/champions/<id>.json`
 * ——⭐ 與 #486「一鍵清理變身態」**同一個謂詞**（{@link isTransformedBodyRow}），
 * 刻意重用而不是抄第二份：兩份會各自腐爛，而它們腐爛的症狀（新的變身英雄沒被認出來）
 * 長得跟正常一模一樣。下個月新增的變身英雄，內容側寫完 doc 這裡當天就標得出來。
 *
 * ---------------------------------------------------------------------------
 * 🎛 決策點：本體那一列要不要也標註（{@link CHAMPION_LABEL_DEFAULTS}）
 * ---------------------------------------------------------------------------
 * owner 只要求「變身態要註明」。但同名的那些**成對**出現，只標一邊的話，另一邊仍然
 * 是一句沒有下文的「三刀流劍士 - 索隆」—— 操作者要靠「沒有標註 ⇒ 大概是本體」反推。
 * ⇒ 預設**兩邊都標**（本體用暗色的 `[本體 → …]`，變身態用強調色）。
 * ⛔ 這裡刻意**不是**一份新的 `content/config/*.json`：它是這台主控台的顯示偏好，
 * 不是遊戲內容，而新增一份 config 會連帶要求 session-gate + 導覽列 + schema 三處落地
 * （`configDocCoverage.test.ts`）。**Rollback = 把下面那個常數的 `baseHint` 改成
 * false，一行，其餘都不用動。**
 */
import type { ContentRow } from "./curation";
import { isTransformedBodyRow } from "./curationTransform";

/** 見檔頭「決策點」。Rollback：`baseHint: false`。 */
export const CHAMPION_LABEL_DEFAULTS = { baseHint: true };

export interface ChampionLabelOptions {
  /** 本體（`transform.role === "base"`）那一列也標註它的變身態 id。 */
  baseHint?: boolean;
}

/** 一個英雄 id 在後台名單上該長的樣子。 */
export interface ChampionLabel {
  id: string;
  /** 內容樹裡的顯示名。讀不到 doc 時是空字串，⛔ 不是 id（呼叫端要分得出來）。 */
  name: string;
  /** 內容樹裡有這份 doc 嗎？false ＝ 打錯字或還沒做 */
  known: boolean;
  /** `transform.role === "alternate"` —— 只有技能觸發得到的那張卡 */
  alternate: boolean;
  /** `transform.role === "base"` 且真的有一張變身態卡 */
  base: boolean;
  /**
   * 名字是從 `content/_legacy/champions/` 撈到的 —— 這個 id **不在出貨的英雄集合裡**。
   * ⚠️ 出貨的下架名單 7 個 id 有 6 個是這一種，所以少了這一格，那一頁的多數列會停在
   * 「內容樹裡沒有這個 doc」，而 owner 要的就是那幾列的名字。
   */
  legacy: boolean;
  /** 另一半的 id（`transform.counterpartId`），沒有配對時 undefined */
  counterpartId?: string;
}

/** 讀不到 doc 的那種列。 */
function unknownLabel(id: string): ChampionLabel {
  return { id, name: "", known: false, alternate: false, base: false, legacy: false };
}

/**
 * ⚠️ 只收 `hydrated` 的列：placeholder 列的 `name` 逐字等於 id，把它當成名字寫出去
 * 就是「載入中」偽裝成「這位英雄就叫 godie-h020」——⛔ 那正是 owner 在抱怨的東西。
 */
function labelFromRow(r: ContentRow, legacy: boolean): ChampionLabel | null {
  if (r.hydrated !== true) return null;
  const alternate = isTransformedBodyRow(r);
  const label: ChampionLabel = {
    id: r.id,
    name: r.name === r.id ? "" : r.name,
    known: true,
    alternate,
    base: !alternate && r.transformRole !== undefined && r.transformCounterpartId !== undefined,
    legacy,
  };
  if (r.transformCounterpartId !== undefined) label.counterpartId = r.transformCounterpartId;
  return label;
}

/**
 * 把載進來的英雄列表壓成 id → 標籤。出貨集合優先，`_legacy` 只補出貨集合沒有的 id
 * （⛔ 不覆蓋 —— 一個 id 同時在兩邊時，玩家看到的是出貨那一份）。
 */
export function buildChampionLabelIndex(
  rows: readonly ContentRow[],
  legacyRows: readonly ContentRow[] = [],
): Map<string, ChampionLabel> {
  const out = new Map<string, ChampionLabel>();
  for (const r of rows) {
    const label = labelFromRow(r, false);
    if (label) out.set(r.id, label);
  }
  for (const r of legacyRows) {
    if (out.has(r.id)) continue;
    const label = labelFromRow(r, true);
    if (label) out.set(r.id, label);
  }
  return out;
}

/** 一個 id 的標籤；索引裡沒有就回「讀不到」的那一種（⛔ 不編一個名字出來）。 */
export function championLabelFor(
  index: ReadonlyMap<string, ChampionLabel>,
  id: string,
): ChampionLabel {
  return index.get(id) ?? unknownLabel(id);
}

/** 一整張 id 清單 → 一列一個標籤（順序照傳進來的）。 */
export function championLabelsFor(
  index: ReadonlyMap<string, ChampionLabel>,
  ids: readonly string[],
): ChampionLabel[] {
  return ids.map((id) => championLabelFor(index, id));
}

/** 形態標註（`[變身態 ← …]` / `[本體 → …]`）。沒有配對就回空字串。 */
export function championFormNote(
  label: ChampionLabel,
  opts: ChampionLabelOptions = {},
): string {
  const baseHint = opts.baseHint ?? CHAMPION_LABEL_DEFAULTS.baseHint;
  if (label.alternate) {
    return label.counterpartId ? `[變身態 ← ${label.counterpartId}]` : "[變身態]";
  }
  if (label.base && baseHint && label.counterpartId) return `[本體 → ${label.counterpartId}]`;
  return "";
}

/**
 * 完整的一行（純文字版；UI 用同一組零件排版，測試用這一個）。
 *
 * ⚠️ 名字讀不到的時候寫的是「⚠ 內容樹裡沒有這個 doc」，⛔ 不是把 id 再印一次冒充名字。
 */
export function championLabelText(
  label: ChampionLabel,
  opts: ChampionLabelOptions = {},
): string {
  const name = label.known ? label.name || "（這份 doc 沒有 name）" : "⚠ 內容樹裡沒有這個 doc";
  const parts = [label.id, name];
  const note = championFormNote(label, opts);
  if (note !== "") parts.push(note);
  if (label.legacy) parts.push(LEGACY_NOTE);
  return parts.join("　");
}

/** `_legacy/` 那一種列的標註。 */
export const LEGACY_NOTE = "[已移入 _legacy · 不在出貨集合裡]";
