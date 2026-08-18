/**
 * 「一個**物件陣列**」的後台編輯邏輯 —— 通用設定引擎的**第四種**非純量形狀。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼需要第四種（前三種是 preserved / curve / tables）
 * ════════════════════════════════════════════════════════════════════════════
 * `configForms.ts` 的走訪器只長得出**純量**欄位；record 與 array 一律被歸成
 * 「不編輯的分支」。`configCurve.ts` 補了「一條曲線」，`configTables.ts` 補了
 * 「一串鍵 →（可選）一個 enum 值」。剩下的那一種是 **`z.array(z.object(…))`**：
 * 每一列是一個有型別欄位的物件。
 *
 * GH#355 就是這個缺口的第一個受害者：`config.arena-rules@1` 的 `weaponTiers`
 * （[EX解放]／[EX∅ 根源] 的出現窗口、基礎機率、劣勢加權強度與曲線、保底門檻、
 * 數量限制）與 `augmentTiers`（聖杯願望的同一組）**每一格都是 owner 親自指定的
 * 決策**，而它們今天只能改檔案 → rebuild → 重啟容器（違反第一守則）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 結構從 Zod 推導，語意手寫 —— 和 `configForms.ts` 同一條規矩
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ **這裡沒有第二份「一列長什麼樣」的知識。** 欄位清單、型別、上下界、enum
 * 選項、可不可省略，全部由 `walkZod(spec.zod)` 從**出貨的 Zod** 走出來 ——
 * schema 加一欄，後台當場多一欄；schema 把上界從 100 改成 50，後台的輸入框當場
 * 跟著改。手抄一份的話，那份抄本會以「後台放行、平台 PUT 退回、理由是一句英文
 * schema 錯誤」的形態腐爛（GH#277 的形狀）。
 *
 * 手寫的只有**人話**（`columns` 那一格：中文名 + 「它影響什麼」），而
 * `configRows.test.ts` 斷言「Zod 的每一欄都有一筆人話」且「每一筆人話都對得上一
 * 個真的欄位」—— 加了欄位沒寫中文 → 紅。
 *
 * ⭐ 最終驗證直接跑 **`spec.zod.safeParse(整列)`**：逐格的中文訊息是為了讓操作者
 * 當場看得懂，但「能不能存」這件事由出貨 schema 自己回答。所以 regex、refine、
 * `.strict()` 這些走訪器看不到的規則也一樣擋得下來，⛔ 不需要在這裡重寫一次。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 規則住這裡（測得到），畫面住 tsx（只剩排版）
 * ════════════════════════════════════════════════════════════════════════════
 * 同 `configCurve.ts` / `configTables.ts` / `vfxLayers.ts` 的分工。
 */
import { walkZod } from "../../editor/src/form/walk";
import type { UINode } from "../../editor/src/form/uiSchema";

/** `ZodTypeAny`，⛔ 不從 `"zod"` 取（`apps/admin` 沒有把 zod 列進 dependencies —— 見 `configForms.ts` 的長註解）。 */
type ConfigZodSchema = Parameters<typeof walkZod>[0];

/** 一欄的**人話**。結構（型別／界／選項）⛔ 不寫在這裡，那是 Zod 的工作。 */
export interface ConfigRowColumn {
  /** 操作者看到的欄名 */
  zh: string;
  /** **它影響什麼** —— ⛔ 不是複述欄位名 */
  note: string;
  /**
   * Zod 給不出上界時補一個（同 `configForms.ts` 的 `everyNumberHasCeiling`）。
   * ⚠️ 有上界的欄位填這一格會被測試擋下來 —— 兩份界就是兩份會分岔的界。
   */
  max?: number;
  /** enum 選項的中文（鍵 = 字面值）。⚠️ **選項清單本身**從 Zod 推，這裡只補人話。 */
  optionZh?: Readonly<Record<string, string>>;
  /** 欄寬（px）。純排版。 */
  width?: number;
}

/** 一張「物件陣列」在後台的完整宣告。 */
export interface ConfigRowsSpec {
  /** 文件裡的點路徑（`weaponTiers`、`augmentTiers`…） */
  path: string;
  /** **一列**的 Zod（⛔ 不是 `z.array(...)`，是元素那一份） */
  zod: ConfigZodSchema;
  title: string;
  /** 這張表怎麼被讀、改一列會發生什麼 —— 一段一段畫在表格上面 */
  intro: string[];
  /** 逐欄人話。⛔ 少一欄 / 多一欄 → `configRows.test.ts` 紅 */
  columns: Readonly<Record<string, ConfigRowColumn>>;
  /** 按「新增一列」時的預設值。⛔ 不留白：enum 沒有「空」這個合法值。 */
  blank: Readonly<Record<string, unknown>>;
  minRows: number;
  maxRows: number;
  /**
   * 列的**順序有沒有意義**。`weaponTiers` 是由高到低逐階問，所以有 —— 畫面因此
   * 提供上移／下移。⚠️ 沒有意義的表不要開這一格：那會讓操作者以為排序會改變行為。
   */
  ordered: boolean;
}

/** 一欄被推導出來的**結構**（畫哪一種輸入框、界在哪）。 */
export interface DerivedColumn {
  key: string;
  kind: "text" | "number" | "boolean" | "enum";
  optional: boolean;
  int: boolean;
  min?: number;
  max?: number;
  options: readonly string[];
  zh: string;
  note: string;
  width: number;
}

/** 畫面上一列 —— 每一格都是**字串**（輸入框的值就是字串，⛔ 不在畫面上做型別轉換）。 */
export type RowDraft = Record<string, string>;

/** 一列裡出錯的那幾格；沒出錯的欄位不會出現。 */
export type RowErrors = Record<string, string>;

export interface RowsVerdict {
  /** 逐列逐欄的拒絕理由 */
  rows: RowErrors[];
  /** 整張表的問題（列數），沒有就是 null */
  table: string | null;
  /** 全部合法時要寫進文件的值；有任何錯誤就是 null */
  value: Record<string, unknown>[] | null;
}

/**
 * 從**出貨 Zod** 推導欄位清單。
 *
 * ⚠️ 走訪器把 `.optional()` 的界照樣帶出來（它先剝殼再讀 checks），所以
 * `guaranteeAtD` 這種「可省略但有界」的欄位不會漏掉界。
 */
export function rowColumns(spec: ConfigRowsSpec): DerivedColumn[] {
  const node = walkZod(spec.zod, "", spec.title);
  if (node.kind !== "object") return [];
  return node.fields.map((f) => deriveColumn(f, spec));
}

function deriveColumn(f: UINode, spec: ConfigRowsSpec): DerivedColumn {
  const key = f.path;
  const hand = spec.columns[key];
  const base = {
    key,
    optional: f.optional,
    zh: hand?.zh ?? key,
    note: hand?.note ?? "",
    width: hand?.width ?? 110,
  };
  if (f.kind === "number") {
    return {
      ...base,
      kind: "number",
      int: f.int,
      // ⚠️ 排他界（`.positive()` / `.lt()`）**不可以**當成含界用：走訪器特地把它
      // 分開帶出來，正是因為「> 0」被當成「≥ 0」時輸入框會放行 0，而 PUT 才失敗。
      min: f.min === undefined ? undefined : f.exclusiveMin === true ? f.min + (f.int ? 1 : 1e-9) : f.min,
      max: f.max === undefined ? hand?.max : f.exclusiveMax === true ? f.max - (f.int ? 1 : 1e-9) : f.max,
      options: [],
    };
  }
  if (f.kind === "enum") {
    return { ...base, kind: "enum", int: false, options: f.options.map(String) };
  }
  if (f.kind === "boolean") return { ...base, kind: "boolean", int: false, options: [] };
  return { ...base, kind: "text", int: false, options: [] };
}

/** 讀 `doc` 裡的那個陣列並攤成畫面上的列；讀不到／型別不對 → 空陣列。 */
export function rowsFrom(doc: unknown, spec: ConfigRowsSpec): RowDraft[] {
  const cols = rowColumns(spec);
  const raw = valueAt(doc, spec.path);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r))
    .map((r) => draftFrom(r, cols));
}

function draftFrom(obj: Record<string, unknown>, cols: readonly DerivedColumn[]): RowDraft {
  const out: RowDraft = {};
  for (const c of cols) {
    const v = obj[c.key];
    // ⚠️ 省略的欄位寫成**空字串**而不是 "undefined"：空字串是操作者看得懂的
    // 「沒有設」，而下面的 `coerce` 會把它變回「這個鍵不存在」。
    out[c.key] = v === undefined || v === null ? "" : typeof v === "boolean" ? String(v) : String(v);
  }
  return out;
}

/** 空白的一列（由 `spec.blank` 決定，⛔ 不是全部留白）。 */
export function emptyRow(spec: ConfigRowsSpec): RowDraft {
  return draftFrom(spec.blank as Record<string, unknown>, rowColumns(spec));
}

export function addRow(rows: readonly RowDraft[], spec: ConfigRowsSpec): RowDraft[] {
  if (rows.length >= spec.maxRows) return [...rows];
  return [...rows, emptyRow(spec)];
}

export function removeRow(rows: readonly RowDraft[], index: number): RowDraft[] {
  return rows.filter((_, i) => i !== index);
}

/** 上移／下移一列（`ordered` 的表才畫得出這兩個鈕）。 */
export function moveRow(rows: readonly RowDraft[], index: number, delta: number): RowDraft[] {
  const to = index + delta;
  if (index < 0 || index >= rows.length || to < 0 || to >= rows.length) return [...rows];
  const next = [...rows];
  const [row] = next.splice(index, 1);
  if (row) next.splice(to, 0, row);
  return next;
}

export function setCell(
  rows: readonly RowDraft[],
  index: number,
  key: string,
  value: string,
): RowDraft[] {
  return rows.map((r, i) => (i === index ? { ...r, [key]: value } : r));
}

/**
 * 逐格驗證 + 整列丟回**出貨 Zod**。
 *
 * ⭐ 兩層是刻意的，而且分工不同：
 *   · 逐格：給操作者**當場看得懂的中文**（哪一欄、為什麼、界在哪）
 *   · 整列 `safeParse`：真正的閘。regex / refine / `.strict()` 這些走訪器看不到
 *     的規則由它擋，⛔ 不在這裡重寫一次。
 */
export function validateRows(rows: readonly RowDraft[], spec: ConfigRowsSpec): RowsVerdict {
  const cols = rowColumns(spec);
  const errs: RowErrors[] = rows.map(() => ({}));
  const parsed: Record<string, unknown>[] = [];
  let bad = false;

  rows.forEach((row, i) => {
    const obj: Record<string, unknown> = {};
    for (const c of cols) {
      const raw = (row[c.key] ?? "").trim();
      if (raw === "") {
        if (!c.optional) {
          errs[i]![c.key] = `${c.zh}不可以空白`;
          bad = true;
        }
        continue; // 省略 = 這個鍵不存在（⛔ 不是 0、也不是空字串）
      }
      if (c.kind === "number") {
        const n = Number(raw);
        if (!Number.isFinite(n)) errs[i]![c.key] = `${c.zh}要填數字`;
        else if (c.int && !Number.isInteger(n)) errs[i]![c.key] = `${c.zh}要填整數`;
        else if (c.min !== undefined && n < c.min) errs[i]![c.key] = `${c.zh}不可以小於 ${c.min}`;
        else if (c.max !== undefined && n > c.max) errs[i]![c.key] = `${c.zh}不可以大於 ${c.max}`;
        else {
          obj[c.key] = n;
          continue;
        }
        bad = true;
        continue;
      }
      if (c.kind === "boolean") {
        obj[c.key] = raw === "true";
        continue;
      }
      if (c.kind === "enum" && !c.options.includes(raw)) {
        errs[i]![c.key] = `${c.zh}只能是 ${c.options.join(" / ")}`;
        bad = true;
        continue;
      }
      obj[c.key] = raw;
    }
    // 整列丟回出貨 schema —— 逐格沒抓到的（regex、未知鍵、refine）在這裡紅。
    const res = spec.zod.safeParse(obj);
    if (!res.success) {
      for (const issue of res.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && errs[i]![key] === undefined) errs[i]![key] = issue.message;
        bad = true;
      }
    }
    parsed.push(obj);
  });

  const table =
    rows.length < spec.minRows
      ? `至少要有 ${spec.minRows} 列`
      : rows.length > spec.maxRows
        ? `最多 ${spec.maxRows} 列`
        : null;

  return { rows: errs, table, value: bad || table !== null ? null : parsed };
}

/** `"a.b"` → 值。⛔ 不用 `configFields` 的那一支：這裡只需要讀，而且要能吃頂層鍵。 */
function valueAt(doc: unknown, path: string): unknown {
  let cur: unknown = doc;
  for (const seg of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** 把整張表接回**整份**文件（同 `patchItemDraft` 的理由：覆蓋層存的是整份）。 */
export function patchRows(
  doc: Record<string, unknown>,
  spec: ConfigRowsSpec,
  value: readonly Record<string, unknown>[],
): Record<string, unknown> {
  return { ...doc, [spec.path]: value.map((r) => ({ ...r })) };
}
