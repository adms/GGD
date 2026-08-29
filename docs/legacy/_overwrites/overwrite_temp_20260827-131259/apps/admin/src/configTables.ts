/**
 * 「一張對照表」的後台編輯邏輯 —— `Record<string, enum>` 與 `string[]` 兩種形狀。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼通用設定引擎需要第二塊補丁（第一塊是 `configCurve.ts`）
 * ════════════════════════════════════════════════════════════════════════════
 * `configForms.ts` 的走訪器只長得出**純量**欄位；record 與 array 一律被歸成
 * 「不編輯的分支」，而不編輯的分支只有 `preserved`（存檔時原封不動帶著走）一條
 * 出路。對 `gore.championStyles` 那種降級表，那是對的。
 *
 * 對 `item-card.markers` 那是**錯的**：owner 2026-08-02 對卡片排版下指示的那一天，
 * 他要改的就是「`[On-Hit]` 算主動還是被動」，而那是這張表的一列。把它宣告成
 * 「這一頁不編輯」，等於這一頁沒有回答 owner 真正問的那個問題 —— 剩下的四個顏色
 * 只是配色，分類歸屬才是那份文件存在的理由。
 *
 * 所以 `ConfigDocSpec` 多了一格 `tables`，而 `configForms.test.ts` 的「每一個非
 * 純量分支都要被宣告過」放寬成 preserved / curve / tables **三選一**，仍然沒有
 * 第四條「沒有人管它」的路。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 兩種形狀共用一支，因為它們的錯誤形態一模一樣
 * ════════════════════════════════════════════════════════════════════════════
 *   · `recordEnum`  → `{ "On-Hit": "active", … }`（markers）
 *   · `stringList`  → `["效能"]`（efficacyHeadings / loreHeadings /
 *                      inlineValueMarkers）
 *
 * 兩種都是「一串**逐字比對**的鍵」，所以兩種都會踩同樣三個地雷：空白鍵、重複鍵、
 * 鍵的前後多一個空格。第三個是這份文件特有而且**完全看不出來**的那個 ——
 * `itemCardText.parseItemCard` 先 `line.trim()` 再 `Set.has(head)`，而 config 這
 * 一側**不 trim**；所以一列 `" 效能"` 會安靜地永遠不命中，畫面上的症狀是「解說
 * 區沒有變暗」而不是任何錯誤。逐格驗證擋在這裡，操作者當場看得到理由。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 規則住在這裡（測得到），畫面住在 tsx（只剩排版）
 * ════════════════════════════════════════════════════════════════════════════
 * 和 `configCurve.ts` / `vfxLayers.ts` 同一個分工。規則寫進元件就沒有人測得到，
 * 而這張表最容易錯的是「這一列永遠不會命中」，不是排版。
 */
import { getAtPath, validateNumeric } from "./configFields";

/**
 * 表的形狀。
 *
 * ⭐ 第三種 `recordScalars` 是 GH#806 加的，而它**先想清楚了自己的錯誤形態**
 * （這一行原本寫著「只有這兩種 —— 第三種要先想清楚它的錯誤形態長什麼樣」）：
 *
 * | 錯誤形態 | 為什麼它在別的形狀上不存在 | 擋在哪 |
 * |---|---|---|
 * | ⛔ **存檔把沒畫在表上的子鍵洗掉** | 前兩種的值就是一個字串，沒有「其餘欄位」 | `validateTable` 的第三個參數 `base` —— 逐鍵**合併**，⛔ 不是覆蓋 |
 * | ⛔ **操作者加一列，而那一列缺必填子鍵** | 前兩種加一列只要填一個鍵 | `keysFixed` —— 這一族的鍵**由內容作者決定**（沒有音檔就沒有那個事件），後台只調既有列的值 |
 * | ⛔ **選填欄位留白被寫成 0** | 前兩種沒有數字 | 留白 ⇒ **刪掉那一格**（走消費端的預設），⛔ 不是 `Number("") === 0` |
 *
 * ⚠️ 第一個是這三個裡唯一**畫面上完全看不出來**的：`sfx.basicAttack.files` 被洗掉
 * 之後 Zod 會擋（`files` 必填 min(1)），但 `gain` 那種選填子鍵被洗掉不會有任何
 * 錯誤 —— 它只是安靜地退回 1.0，而操作者以為自己只改了 `cooldownMs`。
 */
export type ConfigTableShape = "recordEnum" | "stringList" | "recordScalars";

/**
 * `recordScalars` 的一欄 —— ⭐ **一個 entry 模板**（第零守則⑨：N 個同型 = K 個
 * 模板 + 一張表）。232 顆 SFX × 3 格 ⛔ 不是 696 個手寫欄位，是 3 欄 × 232 列。
 */
export interface ConfigTableColumn {
  /** entry 裡的子鍵（`gain` / `cooldownMs` / `loop` / `file`） */
  field: string;
  zh: string;
  /** **它影響什麼** —— 不是複述子鍵名 */
  note: string;
  kind: "number" | "int" | "boolean" | "text";
  /** number/int 專用。⭐ 上界是必填的（#277：欄位要有上界，不是只有下界）。 */
  min?: number;
  max?: number;
  /** text 專用；同樣是必填的上界。 */
  maxLen?: number;
  /**
   * 這一格在 schema 上是 `.optional()`。
   * ⭐ 留白 ⇒ **從文件裡刪掉這一格**（走消費端的預設），⛔ 不是寫 0 / false。
   */
  optional?: boolean;
  /** 畫面上這一欄多寬（px） */
  width?: number;
}

/** 值那一欄的一個選項（`value` 是文件裡的字面值，`zh` 是操作者看到的字）。 */
export interface ConfigTableOption {
  value: string;
  zh: string;
}

/** 一張表在後台的完整宣告。 */
export interface ConfigTableSpec {
  /** 文件裡的點路徑（`markers`、`inlineValueMarkers`…） */
  path: string;
  shape: ConfigTableShape;
  title: string;
  /** 這張表怎麼被讀、改一列會發生什麼事 —— 一段一段畫在表格上面 */
  intro: string[];
  /** 鍵那一欄 */
  key: {
    zh: string;
    /** **它影響什麼** —— 不是複述欄位名 */
    note: string;
    /**
     * 一個鍵最多幾個字。**上界不是潔癖**（#277 在字串上的形狀）：這些字會被畫成
     * 卡片上的 chip，太長的那一個會把整張卡片撐開，而畫面上不會有任何錯誤。
     */
    maxLen: number;
  };
  /**
   * 值那一欄（`recordEnum` 專用；`stringList` 沒有值那一欄）。
   *
   * ⚠️ `options` 是 Zod enum 之外的第二份「合法值有哪些」，也就是一份會 drift 的
   * 知識。`configTables.test.ts` 直接拿 `zItemCardCategory.options` 交叉比對，
   * drift 當場紅。
   */
  value?: {
    zh: string;
    note: string;
    options: readonly ConfigTableOption[];
  };
  /**
   * 至少幾列。**0 不一定合法** —— `markers` 空掉時客戶端的
   * `applyItemCardDoc` 會整張退回出貨表（刻意的：全部落到 unknownCategory 會讓
   * 卡片變單色，看起來像功能沒做），於是操作者存了一張空表、畫面說已儲存、
   * 遊戲照舊。那正是這個 repo 最討厭的那種失敗，所以 markers 的下限是 1。
   */
  minRows: number;
  maxRows: number;
}

/** 畫面上一列的字面內容。`stringList` 只用 `key`。 */
export interface TableRowDraft {
  key: string;
  value: string;
}

/** 一列的錯誤；沒有錯的欄位不會出現在這裡。 */
export type TableRowErrors = Partial<Record<"key" | "value", string>>;

export interface TableVerdict {
  /** 逐列逐欄的拒絕理由 */
  rows: TableRowErrors[];
  /** 整張表的問題（列數），沒有就是 null */
  table: string | null;
  /** 全部合法時要寫進文件的值；有任何錯誤就是 null */
  value: Record<string, string> | string[] | null;
}

/** 空白的一列。 */
export function emptyTableRow(spec: ConfigTableSpec): TableRowDraft {
  // 值那一欄**預設填第一個選項**而不是留白：enum 沒有「空」這個合法值，留白的話
  // 操作者加一列、填好鍵、按儲存 → 被自己的表擋下來，而他看不出少填了什麼。
  return { key: "", value: spec.value ? (spec.value.options[0]?.value ?? "") : "" };
}

/**
 * 文件 → 畫面上的列。讀不到 / 型別不對 → 空陣列（呼叫端據此顯示「讀不到」而不是
 * 畫一張假的表）。
 *
 * ⚠️ **順序**：`recordEnum` 走 `Object.entries`，也就是 JSON 裡的原順序。刻意不
 * 排序 —— 出貨的 `markers` 是按分類分組寫的（四段各自成一塊），排序會把那個
 * 人為的分組洗掉，而那個分組正是操作者用來找一列的東西。
 */
export function tableRowsFrom(doc: unknown, spec: ConfigTableSpec): TableRowDraft[] {
  if (!doc || typeof doc !== "object") return [];
  const raw = getAtPath(doc, spec.path);
  if (spec.shape === "stringList") {
    if (!Array.isArray(raw)) return [];
    return raw.filter((s): s is string => typeof s === "string").map((s) => ({ key: s, value: "" }));
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>)
    .filter(([, v]) => typeof v === "string")
    .map(([k, v]) => ({ key: k, value: v as string }));
}

/** 加一列。 */
export function addTableRow(
  rows: readonly TableRowDraft[],
  spec: ConfigTableSpec,
): TableRowDraft[] {
  return [...rows, emptyTableRow(spec)];
}

/** 刪一列。 */
export function removeTableRow(rows: readonly TableRowDraft[], index: number): TableRowDraft[] {
  return rows.filter((_, i) => i !== index);
}

/** 改一格。 */
export function setTableCell(
  rows: readonly TableRowDraft[],
  index: number,
  col: "key" | "value",
  text: string,
): TableRowDraft[] {
  return rows.map((r, i) => (i === index ? { ...r, [col]: text } : r));
}

/**
 * 一個鍵合不合法。
 *
 * ⚠️ **不 trim 之後照樣收下**：這裡拒絕前後有空白的鍵，而不是幫操作者切掉。
 * 幫他切掉是「悄悄改掉他打的字」，而拒絕是「告訴他為什麼這一列不會命中」——
 * 兩種都不會壞掉文件，但只有後者讓他下次不會再打錯。
 */
function keyIssue(text: string, spec: ConfigTableSpec): string | null {
  if (text.length === 0) return `${spec.key.zh}不可以是空的`;
  if (text !== text.trim()) {
    return `${spec.key.zh}的開頭或結尾有空白 —— 比對是逐字的，這一列永遠不會命中`;
  }
  if (text.length > spec.key.maxLen) {
    return `${spec.key.zh}最多 ${spec.key.maxLen} 個字（現在 ${text.length} 個）`;
  }
  return null;
}

/**
 * 整張表的判決。
 *
 * 三種錯各有各的**行為**後果，不是潔癖：
 *   · 空白 / 前後空白 / 過長 → 見 `keyIssue`；
 *   · 重複的鍵 → `recordEnum` 存進 JSON 之後**後面那一列覆蓋前面那一列**，於是
 *     操作者以為自己設了兩條規則，實際上只有一條，而畫面上兩列都在；
 *   · 列數不足 → 見 `ConfigTableSpec.minRows`。
 */
export function validateTable(
  rows: readonly TableRowDraft[],
  spec: ConfigTableSpec,
): TableVerdict {
  const allowed = new Set((spec.value?.options ?? []).map((o) => o.value));
  const rowErrors: TableRowErrors[] = rows.map((r) => {
    const e: TableRowErrors = {};
    const ki = keyIssue(r.key, spec);
    if (ki) e.key = ki;
    if (spec.shape === "recordEnum" && !allowed.has(r.value)) {
      e.value = `${spec.value?.zh ?? "值"}要從清單裡選一個`;
    }
    return e;
  });

  // 重複鍵：指回**第一次**出現的那一列，這樣操作者知道去哪裡改。
  const seen = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    const k = rows[i]!.key;
    if (k.length === 0) continue;
    const first = seen.get(k);
    if (first === undefined) {
      seen.set(k, i);
      continue;
    }
    rowErrors[i]!.key ??= `和第 ${first + 1} 列重複 —— 存進去之後只有一列會生效`;
  }

  let table: string | null = null;
  if (rows.length < spec.minRows) {
    table = `至少要 ${spec.minRows} 列`;
  } else if (rows.length > spec.maxRows) {
    table = `最多 ${spec.maxRows} 列`;
  }

  const clean = rowErrors.every((e) => e.key === undefined && e.value === undefined);
  const ok = clean && table === null;
  let value: TableVerdict["value"] = null;
  if (ok) {
    if (spec.shape === "stringList") {
      value = rows.map((r) => r.key);
    } else {
      const rec: Record<string, string> = {};
      for (const r of rows) rec[r.key] = r.value;
      value = rec;
    }
  }
  return { rows: rowErrors, table, value };
}

/**
 * 這張表和基底文件裡那一張比，被動過了嗎。
 *
 * ⚠️ 走 JSON 字串比對而不是逐鍵比對，因為**順序也算改動** ——
 * `recordEnum` 存回 JSON 時保留列的順序，而那個順序是操作者用來找一列的東西。
 */
export function tableDirty(
  rows: readonly TableRowDraft[] | null,
  base: unknown,
  spec: ConfigTableSpec,
): boolean {
  if (rows === null) return false;
  return JSON.stringify(rows) !== JSON.stringify(tableRowsFrom(base, spec));
}
