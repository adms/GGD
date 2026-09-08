/**
 * 💾 草稿模型（GH#1023）—— ⭐ 存的是**微調值**，⛔ 不是展開後的樹。
 *
 * 票文 Implementation constraints 逐字：
 *   「⭐ 存的是**微調值**（模板 ref ＋ 覆寫），⛔ 不是把整棵展開後的樹存下來 ——
 *     第〇·四守則：算得出來的東西不要有第二個住處，⭐ 而模板一改草稿就該跟著變」
 *
 * ⇒ 一份草稿 ＝ `dataPath → 覆寫值` 的一張表。接回的時候是
 * `applyTweaks(今天重新載入的那一份, tweaks)` ——
 * ⭐ 所以**沒有被覆寫的每一格都跟著模板走**，⛔ 不是被一份冷凍的樹蓋掉。
 *
 * ⚠️ ⭐ 分層（`tweakLayer`）只餵**收據**（畫面上那一行「英雄 1 · 技能 1 · 機制 1 · 特效 1」），
 * ⛔ 它**不參與接回** —— 接回是照 `dataPath` 走的。
 * ⇒ 分層猜錯只會讓那一行數字難看，⛔ 不會掉資料。這是刻意的：
 *   一條會影響資料完整性的正則，是一個等著出事的東西。
 */
import { setIn } from "../store";

export const DRAFT_RECORD_VERSION = 1;

/** ⭐ 「這一格被刪掉了」的標記 —— JSON 存不了 `undefined`，⛔ 而 `null` 是一個合法的值。 */
export const TWEAK_DELETED = "\u0000ggd-draft-deleted";

/** owner 2026-09-06 逐字點名的四層：「英雄層級到技能, 機制, 特效 各層」。 */
export type DraftLayer = "champion" | "ability" | "mechanic" | "vfx";

export const DRAFT_LAYERS: readonly DraftLayer[] = ["champion", "ability", "mechanic", "vfx"];

export const DRAFT_LAYER_LABEL: Readonly<Record<DraftLayer, string>> = Object.freeze({
  champion: "英雄",
  ability: "技能",
  mechanic: "機制",
  vfx: "特效",
});

export interface DraftRecord {
  v: typeof DRAFT_RECORD_VERSION;
  collection: string;
  docId: string;
  /** dataPath → 覆寫值（`TWEAK_DELETED` ＝ 這一格被刪掉了）。 */
  tweaks: Record<string, unknown>;
  savedAt: number;
}

export function draftKey(collection: string, docId: string): string {
  return `${collection}/${docId}`;
}

/** 版本守衛 —— 沿用 `local-icons/model.ts` 的形狀：舊版紀錄一律當成沒有。 */
export function isCurrentDraftRecord(value: unknown): value is DraftRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Partial<DraftRecord>;
  return r.v === DRAFT_RECORD_VERSION
    && typeof r.collection === "string"
    && typeof r.docId === "string"
    && typeof r.savedAt === "number"
    && !!r.tweaks && typeof r.tweaks === "object" && !Array.isArray(r.tweaks);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function sameJson(a: unknown, b: unknown): boolean {
  return Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 出貨的那一份 ↔ 手上這一份的差，攤平成 `dataPath → 值`。
 *
 * ⚠️ ⭐ **陣列只在「長度沒變」時逐 index 比**：
 *  · 長度沒變 ⇒ 逐格比。⭐ 這是**必要的** —— 機制與特效的微調住在
 *    `effects.0.*`，整條陣列當成一個 blob 存下來 ＝ 把展開樹存下來，
 *    而票文的驗收第 5 條要的正是「模板改了，沒覆寫的那些格跟著變」。
 *  · 長度變了（作者加/刪了一段效果）⇒ 整條當葉子。逐 index 比在這裡是錯的：
 *    插一筆會產生一整排位移出來的假覆寫。
 */
export function diffTweaks(original: unknown, draft: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  walk(original, draft, "", out);
  return out;
}

function walk(original: unknown, draft: unknown, path: string, out: Record<string, unknown>): void {
  const step = (key: string | number): string => (path === "" ? String(key) : `${path}.${key}`);
  if (isPlainObject(original) && isPlainObject(draft)) {
    for (const key of new Set([...Object.keys(original), ...Object.keys(draft)])) {
      if (!(key in draft)) out[step(key)] = TWEAK_DELETED;
      else walk(original[key], draft[key], step(key), out);
    }
    return;
  }
  if (Array.isArray(original) && Array.isArray(draft) && original.length === draft.length) {
    for (let i = 0; i < draft.length; i += 1) walk(original[i], draft[i], step(i), out);
    return;
  }
  if (!sameJson(original, draft)) out[path] = draft;
}

/** 把一張覆寫表蓋回**今天重新載入的**那一份文件上。 */
export function applyTweaks(base: unknown, tweaks: Record<string, unknown>): unknown {
  let doc = base;
  // 淺的路徑先蓋：`a` 與 `a.b` 同時存在時，先放整包再放細格。
  for (const path of Object.keys(tweaks).sort((x, y) => x.length - y.length || x.localeCompare(y))) {
    const value = tweaks[path];
    doc = setIn(doc, path, value === TWEAK_DELETED ? undefined : value);
  }
  return doc;
}

/**
 * ⚠️ ⭐ 只給收據看。特效那一族的欄位名在 champion / ability 兩邊都會出現
 * （pitch / scale / color / alpha / 音效綁定 —— CLAUDE.md 第〇·五守則點名的那一批），
 * 所以它先問**欄位**、再問**集合**。
 */
const VFX_TWEAK =
  /(?:^|\.)(vfx[A-Za-z0-9]*|sfx[A-Za-z0-9]*|sound[A-Za-z0-9]*|voice[A-Za-z0-9]*|pitch|scale|scaleAxis|colou?r|alpha|opacity|tint)(?:\.|$)/;
const MECHANIC_TWEAK = /(?:^|\.)(effects|hooks|conditions|status|projectile)(?:\.|$)/;

export function tweakLayer(collection: string, path: string): DraftLayer {
  if (VFX_TWEAK.test(path)) return "vfx";
  if (MECHANIC_TWEAK.test(path)) return "mechanic";
  return collection === "champions" ? "champion" : "ability";
}

export function layerCounts(records: readonly DraftRecord[]): Record<DraftLayer, number> {
  const counts: Record<DraftLayer, number> = { champion: 0, ability: 0, mechanic: 0, vfx: 0 };
  for (const record of records) {
    for (const path of Object.keys(record.tweaks)) counts[tweakLayer(record.collection, path)] += 1;
  }
  return counts;
}
