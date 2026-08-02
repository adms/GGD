/**
 * 斷點曲線的後台編輯邏輯 —— 一張「可以加/刪列」的兩欄表 (GH#252).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼通用設定引擎需要這一塊補丁
 * ════════════════════════════════════════════════════════════════════════════
 * `configForms.ts` 的走訪器只長得出**純量**欄位;任何陣列都被歸成一個「不編輯的
 * 分支」,而不編輯的分支只有一條出路 —— 列進 `preserved`,存檔時原封不動帶著走。
 * 對 `gore.championStyles` 那種十位角色的降級表,那是對的。對 `attackRangeCurve`
 * 那是**錯的**:那張表就是這一頁唯一要調的東西,把它宣告成「這一頁不編輯」等於
 * 這一頁不存在。
 *
 * 所以 `ConfigDocSpec` 多了一格 `curve`,而 `configForms.test.ts` 的
 * 「每一個非純量分支都要在 preserved」放寬成「在 preserved **或**就是那張曲線」
 * —— 兩條路都是明著宣告的,沒有第三條「沒人管它」的路。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 沿用而不是發明:這是 `vfxLayers.ts` 的形狀
 * ════════════════════════════════════════════════════════════════════════════
 * 後台已經有一個「可加/刪列 + 每列幾個輸入框 + 逐格驗證」的前例 ——
 * 技能特效堆疊(`vfxLayers.ts` 的 `addLayer` / `removeLayer` /
 * `validateLayerDraft` + `ui/AbilityLayersEditor.tsx` 只負責畫)。這一支照同一個
 * 分工:**規則住在這裡(測得到),畫面住在 tsx(測不到的部分只剩排版)**。
 * 規則寫進畫面就沒有人測得到,那是 `statCaps.ts` 檔頭講過的同一件事。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 預覽用的是**出貨的那一支函式**,不是抄一份
 * ════════════════════════════════════════════════════════════════════════════
 * {@link curvePreviewRows} 直接呼叫 `@ggd/shared/sim/bodyScale` 的
 * `attackRangeScaleFactor`。抄一份內插公式進後台就是 CLAUDE.md 第⑤種失敗
 * (「被測的不是出貨的那個」)的教科書形狀:後台會很有自信地畫出一條和伺服器
 * 不一樣的曲線,而兩邊都不會報錯。
 */
import { attackRangeScaleFactor, type BodyScaleRules } from "@ggd/shared/sim/bodyScale";
import { getAtPath } from "./configFields";

/** 表格的一欄。 */
export interface CurveColumnSpec {
  /** 文件裡的鍵名(例如 `bodyScale`) */
  key: string;
  /** 中文欄名 */
  zh: string;
  /** **它影響什麼** —— 不是複述欄位名 */
  note: string;
  /** 這一欄的合法區間,**兩端都要有**(#277) */
  min: number;
  max: number;
}

/** 一張斷點曲線在後台的完整宣告。 */
export interface ConfigCurveSpec {
  /** 文件裡的點路徑(這一版只支援頂層鍵) */
  path: string;
  title: string;
  /** 這張表怎麼讀、兩端怎麼夾 —— 一段一段畫在表格上面 */
  intro: string[];
  x: CurveColumnSpec;
  y: CurveColumnSpec;
  minRows: number;
  maxRows: number;
  /**
   * 預覽要拿哪幾個 x 去問曲線。這一格的意義是「操作者改完之後,**場上真的有的
   * 那幾位**會變成什麼樣」—— 一張只有斷點的表看不出 1.5 倍體型的人拿到多少。
   */
  previewAt: readonly { x: number; who: string }[];
}

/** 畫面上一列的字面內容(兩個輸入框)。 */
export interface CurveRowDraft {
  x: string;
  y: string;
}

/** 一列的錯誤;沒有錯的欄位就不會出現在這裡。 */
export type CurveRowErrors = Partial<Record<"x" | "y", string>>;

export interface CurveVerdict {
  /** 逐列逐欄的拒絕理由 */
  rows: CurveRowErrors[];
  /** 整張表的問題(列數、順序),沒有就是 null */
  table: string | null;
  /** 全部合法時的文件值;有任何錯誤就是 null */
  points: { [k: string]: number }[] | null;
}

/** 空白的一列。 */
export function emptyCurveRow(): CurveRowDraft {
  return { x: "", y: "" };
}

/**
 * 文件 → 畫面上的列。讀不到 / 不是陣列 → 空陣列(呼叫端會據此顯示「讀不到」而
 * 不是畫一張假的表)。
 *
 * ⚠️ `spec.path` 走 `getAtPath`,所以它是一條**點路徑**而不只是頂層鍵 ——
 * `attackRangeCurve`(頂層,`bodyScale` 那一份)和 `match.fireRing.burnCurve`
 * (巢狀,火圈灼燒曲線)用的是同一支。
 */
export function curveRowsFrom(doc: unknown, spec: ConfigCurveSpec): CurveRowDraft[] {
  if (!doc || typeof doc !== "object") return [];
  const raw = getAtPath(doc, spec.path);
  if (!Array.isArray(raw)) return [];
  const out: CurveRowDraft[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    out.push({ x: literal(r[spec.x.key]), y: literal(r[spec.y.key]) });
  }
  return out;
}

function literal(v: unknown): string {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : "";
}

/**
 * 加一列。新的一列**留白**而不是猜一個值:自動填出來的斷點會被順序檢查當成
 * 合法的一列,於是操作者按下儲存時,一個他沒有填過的斷點就進了曲線。
 */
export function addCurveRow(rows: readonly CurveRowDraft[]): CurveRowDraft[] {
  return [...rows, emptyCurveRow()];
}

/** 刪一列。 */
export function removeCurveRow(rows: readonly CurveRowDraft[], index: number): CurveRowDraft[] {
  return rows.filter((_, i) => i !== index);
}

/** 改一格。 */
export function setCurveCell(
  rows: readonly CurveRowDraft[],
  index: number,
  col: "x" | "y",
  text: string,
): CurveRowDraft[] {
  return rows.map((r, i) => (i === index ? { ...r, [col]: text } : r));
}

function cellIssue(text: string, col: CurveColumnSpec): string | null {
  const t = text.trim();
  if (t === "") return `${col.zh}不可以是空的`;
  const n = Number(t);
  if (!Number.isFinite(n)) return `${col.zh}要填一個數字`;
  // 上界和下界一樣重要(#277):只擋下界的話,1.3 打成 13 會過後台,然後在
  // sim 的 normalize 被靜默夾掉,而操作者看到的是「✓ 已儲存」。
  if (n < col.min) return `${col.zh}不可以小於 ${col.min}`;
  if (n > col.max) return `${col.zh}不可以大於 ${col.max}`;
  return null;
}

/**
 * 整張表的判決。
 *
 * 三種錯各有各的理由,而且**都是行為缺陷不是潔癖**:
 *   · 空白 / 超界 → 見 `cellIssue`;
 *   · 列數不足   → 一個點不是曲線,`normalizeAttackRangeCurve` 會整條退回出貨
 *                  曲線,於是操作者存了一列、遊戲照舊、畫面說已儲存;
 *   · 順序 / 重複 → 重複的 x 會讓內插除以 0(→ `Infinity` 倍射程),順序錯掉的
 *                  表在畫面上看起來完全正常而內插結果是亂的。
 */
export function validateCurve(
  rows: readonly CurveRowDraft[],
  spec: ConfigCurveSpec,
): CurveVerdict {
  const rowErrors: CurveRowErrors[] = rows.map((r) => {
    const e: CurveRowErrors = {};
    const xi = cellIssue(r.x, spec.x);
    const yi = cellIssue(r.y, spec.y);
    if (xi) e.x = xi;
    if (yi) e.y = yi;
    return e;
  });

  let table: string | null = null;
  if (rows.length < spec.minRows) {
    table = `至少要 ${spec.minRows} 個斷點 —— 少於這個數字時遊戲會整條退回出貨曲線，等於這次儲存沒有效果`;
  } else if (rows.length > spec.maxRows) {
    table = `最多 ${spec.maxRows} 個斷點`;
  }

  const clean = rowErrors.every((e) => e.x === undefined && e.y === undefined);
  if (clean && table === null) {
    for (let i = 1; i < rows.length; i++) {
      const prev = Number(rows[i - 1]!.x);
      const cur = Number(rows[i]!.x);
      if (cur === prev) {
        rowErrors[i]!.x = `和第 ${i} 列同樣是 ${cur} —— 重複的${spec.x.zh}會讓中間的內插除以 0`;
        table = `第 ${i + 1} 列的${spec.x.zh}重複了`;
        break;
      }
      if (cur < prev) {
        rowErrors[i]!.x = `要比第 ${i} 列的 ${prev} 大 —— 這張表必須由小到大`;
        table = `第 ${i + 1} 列的${spec.x.zh}比上一列小`;
        break;
      }
    }
  }

  const ok = table === null && rowErrors.every((e) => e.x === undefined && e.y === undefined);
  return {
    rows: rowErrors,
    table,
    points: ok
      ? rows.map((r) => ({ [spec.x.key]: Number(r.x.trim()), [spec.y.key]: Number(r.y.trim()) }))
      : null,
  };
}

/** 畫面上一列預覽。 */
export interface CurvePreviewRow {
  x: number;
  who: string;
  mult: number;
}

/**
 * 「出貨體型 → 這條曲線給幾倍射程」。
 *
 * ⚠️ 走的是 sim 出貨的 `attackRangeScaleFactor`,不是後台自己算一次 —— 抄一份
 * 內插公式進來,後台就會很有自信地畫出一條和伺服器不一樣的曲線。
 */
export function curvePreviewRows(
  points: readonly { [k: string]: number }[] | null,
  spec: ConfigCurveSpec,
  enabled: boolean,
): CurvePreviewRow[] {
  if (points === null) return [];
  const rules: BodyScaleRules = {
    enabled,
    attackRangeCurve: points.map((p) => ({
      bodyScale: p[spec.x.key]!,
      rangeMult: p[spec.y.key]!,
    })),
  };
  return spec.previewAt.map((s) => ({
    x: s.x,
    who: s.who,
    mult: attackRangeScaleFactor(s.x, rules),
  }));
}
