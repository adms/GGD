/**
 * 一份 `content/config/*.json` 的後台頁 —— 結構由 schema 長出來，語意由標籤表寫死。
 *
 * 這是**一個**元件服務多份文件（畫質分級 / 特效回收 / 濺血程度）。它會這樣寫，
 * 是因為手刻三頁會把同一段骨架重複三次：讀 overlay → 讀不到就退回出貨文件 →
 * 驗證上下界 → PUT **整份**文件。骨架重複三次就是三份會 drift 的骨架。
 *
 * 邏輯全部在 `../configForms`（測試也在那裡）；這個檔案只負責畫。
 *
 * ⚠️ 兩件不可以動的事：
 *
 * 1. **讀不到基底文件就不准存。** 儲存送的是「基底文件 ⊕ 這次的編輯」，而基底是
 *    現在生效的整份文件。基底是 null 時硬存，等於把文件裡這一頁不認得的東西
 *    （例如 `gore.championStyles` 那十位角色的降級表）整批刪掉，而畫面會顯示
 *    「✓ 已寫入」。所以 `base === null` 時儲存鈕是關的，而且畫面上寫出原因。
 *
 * 2. **生效時機要寫真話。** 這三份文件都是客戶端**開機**時讀進去的，所以存檔
 *    之後玩家要重新整理頁面才拿得到。寫成「下一場生效」是 #278 那個形態：
 *    操作者照著做，然後以為功能壞了。
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, Btn } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";
import { getOverlayDoc, getShippedDoc, putOverlayDoc } from "../api";
import {
  applyEdits,
  displayValue,
  docIfMatches,
  fieldRows,
  inputValue,
  parseFieldInput,
  type ConfigDocSpec,
  type ConfigFieldRow,
} from "../configForms";
import {
  addCurveRow,
  curvePreviewRows,
  curveRowsFrom,
  removeCurveRow,
  setCurveCell,
  validateCurve,
  type ConfigCurveSpec,
  type CurveRowDraft,
} from "../configCurve";

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 這一格的範圍，寫成人看得懂的一句（沒有上下界時回空字串）。 */
function boundsText(row: ConfigFieldRow): string {
  const { min, max, exclusiveMin, exclusiveMax } = row.bounds;
  if (min === undefined && max === undefined) return "";
  const lo = min === undefined ? "" : `${exclusiveMin ? ">" : "≥"} ${min}`;
  const hi = max === undefined ? "" : `${exclusiveMax ? "<" : "≤"} ${max}`;
  return [lo, hi].filter(Boolean).join(" · ");
}

export function ConfigDocPage(props: { spec: ConfigDocSpec }): JSX.Element {
  const { spec } = props;
  /** 現在生效的整份文件（overlay ?? 出貨）。null = 還沒讀到 → 不准存。 */
  const [base, setBase] = useState<unknown>(null);
  const [shipped, setShipped] = useState<unknown>(null);
  const [source, setSource] = useState<"overlay" | "shipped" | "none">("none");
  const [draft, setDraft] = useState<Record<string, string>>({});
  /**
   * 斷點曲線的畫面狀態（`spec.curve` 沒宣告時永遠是 null）。
   *
   * ⚠️ 它和 `draft` 分開存，因為 `draft` 是「path → 一個字串」而曲線是一張表。
   * 硬塞進 `draft` 的話，加一列就得發明一套 `curve.3.x` 路徑語法，而那套語法要在
   * 存檔時再被拆回來一次 —— 兩次翻譯就是兩個會 drift 的地方。
   */
  const [curveRows, setCurveRows] = useState<CurveRowDraft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        // 覆蓋層優先 —— 那是遊戲真的會載到的東西。
        const overlaid = docIfMatches(spec, await getOverlayDoc(spec.collection, spec.docId));
        const shippedResp = await getShippedDoc(spec.collection, spec.docId);
        const shippedDoc = shippedResp.present ? docIfMatches(spec, shippedResp.doc) : null;
        setShipped(shippedDoc);
        const live = overlaid ?? shippedDoc;
        if (overlaid) {
          setBase(overlaid);
          setSource("overlay");
        } else if (shippedDoc) {
          setBase(shippedDoc);
          setSource("shipped");
        } else {
          setSource("none");
        }
        if (spec.curve) setCurveRows(curveRowsFrom(live, spec.curve));
      } catch (err) {
        setApiErr(errText(err));
      }
    })();
    // spec 在一次掛載期間不會變（路由換頁會重新掛載）。
  }, [spec]);

  const rows = useMemo(() => fieldRows(spec, base, shipped), [spec, base, shipped]);

  /** 這一格畫面上現在的字面值（沒編輯過就是生效值）。 */
  const shownOf = (r: ConfigFieldRow): string => draft[r.path] ?? inputValue(r.current);

  /** path -> 拒絕理由（沒有就是合法）。 */
  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const r of rows) {
      if (draft[r.path] === undefined) continue;
      const verdict = parseFieldInput(r, draft[r.path]!);
      if (!verdict.ok) out[r.path] = verdict.error;
    }
    return out;
  }, [rows, draft]);

  /** 斷點表的判決（沒有曲線的文件是 null）。 */
  const curveVerdict = useMemo(
    () => (spec.curve && curveRows !== null ? validateCurve(curveRows, spec.curve) : null),
    [spec.curve, curveRows],
  );

  /** 表被動過了嗎（和基底文件裡那一張比）。 */
  const curveDirty = useMemo(() => {
    if (!spec.curve || curveRows === null) return false;
    return JSON.stringify(curveRows) !== JSON.stringify(curveRowsFrom(base, spec.curve));
  }, [spec.curve, curveRows, base]);

  const dirty = Object.keys(draft).length > 0 || curveDirty;
  const allValid =
    Object.keys(errors).length === 0 && (curveVerdict === null || curveVerdict.points !== null);
  const canSave = dirty && allValid && base !== null && !busy;

  const save = async (): Promise<void> => {
    setBusy(true);
    setApiErr(null);
    try {
      const edits = new Map<string, unknown>();
      for (const r of rows) {
        const raw = draft[r.path];
        if (raw === undefined) continue;
        const verdict = parseFieldInput(r, raw);
        if (!verdict.ok) throw new Error(`${r.label.zh}：${verdict.error}`);
        edits.set(r.path, verdict.value);
      }
      if (spec.curve && curveDirty) {
        // 判決是 null 就是這張表現在不合法 —— 這裡丟例外而不是「送出還能送的部分」，
        // 因為半張曲線在 sim 那端會整條退回出貨曲線，而畫面會說「✓ 已寫入」。
        if (!curveVerdict?.points) throw new Error(`${spec.curve.title}：這張表還沒填對`);
        edits.set(spec.curve.path, curveVerdict.points);
      }
      // ⚠️ 整份文件 = 基底 ⊕ 編輯。把 `base` 換成 `{}` 或只放編輯過的鍵，
      // 這一頁不認得的分支就會在這一次儲存裡消失。
      const next = applyEdits(base, edits);
      const head = await putOverlayDoc(spec.collection, spec.docId, next);
      setBase(next);
      setSource("overlay");
      setDraft({});
      setFlash(`✓ 已寫入耐久覆蓋層（generation ${head.generation}）`);
    } catch (err) {
      setFlash(null);
      setApiErr(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const sourceLine =
    source === "overlay"
      ? "現在畫面上的值來自**耐久覆蓋層**（有人在後台改過）"
      : source === "shipped"
        ? "現在畫面上的值來自 content/ 的出貨文件（還沒有人在後台改過）"
        : "⚠️ 讀不到這份文件（覆蓋層與出貨版都沒有）。儲存已停用 —— 沒有基底文件的話，這次寫入會弄丟文件裡其他所有東西。";

  return (
    <Panel title={spec.title}>
      {spec.intro.map((p, i) => (
        <p key={i} style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.75, margin: "0 0 10px" }}>
          {p}
        </p>
      ))}

      <p style={{ color: GOLD, fontSize: 13, lineHeight: 1.75, margin: "0 0 6px" }}>
        ⚠️ 生效時機：{spec.effect}
      </p>
      <p style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.7, margin: "0 0 4px" }}>
        真的讀這份文件的是：<code style={{ color: ACCENT }}>{spec.consumer}</code>
      </p>
      <p
        data-field="doc-source"
        style={{
          color: source === "none" ? DANGER : TEXT_DIM,
          fontSize: 12,
          lineHeight: 1.7,
          margin: "0 0 14px",
        }}
      >
        <code style={{ color: TEXT_MAIN }}>
          content/{spec.collection}/{spec.docId}.json
        </code>{" "}
        · {sourceLine}
      </p>

      {flash && <div style={{ color: OK, fontSize: 13, marginBottom: 10 }}>{flash}</div>}
      {apiErr && <div style={{ color: DANGER, fontSize: 13, marginBottom: 10 }}>{apiErr}</div>}

      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((r) => {
          const err = errors[r.path];
          const value = shownOf(r);
          const onChange = (v: string): void => setDraft({ ...draft, [r.path]: v });
          const control =
            r.leaf.kind === "boolean" || r.leaf.kind === "enum" ? (
              <select
                aria-label={r.label.zh}
                data-field={r.path}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                style={{
                  padding: "5px 8px",
                  minWidth: 190,
                  background: "#10141f",
                  color: err ? DANGER : TEXT_MAIN,
                  border: `1px solid ${err ? DANGER : PANEL_BORDER}`,
                  borderRadius: 4,
                  fontSize: 13,
                }}
              >
                {(r.leaf.kind === "boolean" ? ["true", "false"] : r.leaf.options).map((o) => (
                  <option key={o} value={o}>
                    {r.leaf.kind === "boolean"
                      ? o === "true"
                        ? "開啟"
                        : "關閉"
                      : (r.label.optionLabels?.[o] ?? o)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-label={r.label.zh}
                data-field={r.path}
                value={value}
                inputMode="decimal"
                onChange={(e) => onChange(e.target.value)}
                style={{
                  width: 120,
                  padding: "5px 8px",
                  background: "#10141f",
                  color: err ? DANGER : TEXT_MAIN,
                  border: `1px solid ${err ? DANGER : PANEL_BORDER}`,
                  borderRadius: 4,
                  fontSize: 13,
                  textAlign: "right",
                }}
              />
            );
          return (
            <div
              key={r.path}
              data-testid={`field-${r.path}`}
              style={{
                padding: "10px 12px",
                border: `1px solid ${err ? DANGER : PANEL_BORDER}`,
                borderRadius: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ color: TEXT_MAIN, fontSize: 13, fontWeight: 600, minWidth: 190 }}>
                  {r.label.zh}
                </span>
                {control}
                <code style={{ color: TEXT_DIM, fontSize: 11 }}>{r.path}</code>
                {boundsText(r) && (
                  <span style={{ color: TEXT_DIM, fontSize: 11 }}>範圍 {boundsText(r)}</span>
                )}
                <span style={{ color: TEXT_DIM, fontSize: 11 }}>
                  出貨值 {displayValue(r.shipped, r.label)}
                </span>
              </div>
              {/* 說明寫「它影響什麼」。複述欄位名的說明等於沒有說明 —— configForms.test.ts 在守。 */}
              <div style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.7, marginTop: 6 }}>
                {r.label.note}
              </div>
              {err && <div style={{ color: DANGER, fontSize: 12, marginTop: 5 }}>{err}</div>}
            </div>
          );
        })}
      </div>

      {spec.curve && (
        <CurveTable
          spec={spec.curve}
          rows={curveRows}
          setRows={setCurveRows}
          enabled={
            (draft["enabled"] ?? inputValue((base as { enabled?: unknown } | null)?.enabled)) !==
            "false"
          }
        />
      )}

      {spec.preserved.length > 0 && (
        <div
          data-field="preserved-note"
          style={{
            marginTop: 14,
            padding: "10px 12px",
            border: `1px solid ${PANEL_BORDER}`,
            borderRadius: 6,
            color: TEXT_DIM,
            fontSize: 12,
            lineHeight: 1.7,
          }}
        >
          這一頁**不編輯**下面這些，但每次儲存都原封不動帶著走：
          {spec.preserved.map((b) => (
            <div key={b.path} style={{ marginTop: 5 }}>
              <code style={{ color: TEXT_MAIN }}>{b.path}</code> — {b.why}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
        <Btn kind="primary" disabled={!canSave} onClick={() => void save()}>
          儲存 Save
        </Btn>
        <span style={{ color: TEXT_DIM, fontSize: 12 }}>
          {base === null
            ? "讀不到基底文件，儲存已停用"
            : allValid
              ? "送出的是整份文件（含這一頁不編輯的欄位）"
              : "有欄位超出允許範圍"}
        </span>
      </div>
    </Panel>
  );
}

// ───────────────────────────────────────────────────── 斷點曲線的表格 ──────

/**
 * 一張可以加/刪列的兩欄斷點表（GH#252 的 `attackRangeCurve`）。
 *
 * ⚠️ 這個元件**只負責畫**。「這一列填得對不對」「這張表順序對不對」「存下去會
 * 變成什麼」全部在 `../configCurve`，理由和 `statCaps.ts` 檔頭那一段一樣：規則
 * 寫在畫面裡就沒有人測得到，而這張表最容易錯的是順序與重複，不是排版。
 *
 * ⚠️ 預覽那一段走的是 sim 出貨的 `attackRangeScaleFactor`（`curvePreviewRows`
 * 裡呼叫），不是這裡自己內插一次 —— 後台自己算一次就會很有自信地畫出一條和
 * 伺服器不一樣的曲線，而兩邊都不會報錯。
 */
function CurveTable(props: {
  spec: ConfigCurveSpec;
  rows: CurveRowDraft[] | null;
  setRows: (next: CurveRowDraft[]) => void;
  /** 總開關現在的狀態 —— 關著的時候預覽要誠實地全部顯示 1.00× */
  enabled: boolean;
}): JSX.Element {
  const { spec, rows, setRows, enabled } = props;
  const verdict = useMemo(() => (rows ? validateCurve(rows, spec) : null), [rows, spec]);
  const preview = useMemo(
    () => curvePreviewRows(verdict?.points ?? null, spec, enabled),
    [verdict, spec, enabled],
  );

  const cell = (i: number, col: "x" | "y"): JSX.Element => {
    const err = verdict?.rows[i]?.[col];
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}>
        <input
          aria-label={`第 ${i + 1} 列 ${spec[col].zh}`}
          data-field={`curve.${i}.${col}`}
          value={rows![i]![col]}
          inputMode="decimal"
          onChange={(e) => setRows(setCurveCell(rows!, i, col, e.target.value))}
          style={{
            width: 96,
            padding: "5px 8px",
            background: "#10141f",
            color: err ? DANGER : TEXT_MAIN,
            border: `1px solid ${err ? DANGER : PANEL_BORDER}`,
            borderRadius: 4,
            fontSize: 13,
            textAlign: "right",
          }}
        />
        {err && <span style={{ color: DANGER, fontSize: 11 }}>{err}</span>}
      </span>
    );
  };

  return (
    <div
      data-field="curve-section"
      style={{
        marginTop: 14,
        padding: "12px 14px",
        border: `1px solid ${PANEL_BORDER}`,
        borderRadius: 6,
      }}
    >
      <div style={{ color: TEXT_MAIN, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
        {spec.title}
      </div>
      {spec.intro.map((p, i) => (
        <p key={i} style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.75, margin: "0 0 8px" }}>
          {p}
        </p>
      ))}
      <div style={{ color: TEXT_DIM, fontSize: 11, lineHeight: 1.7, margin: "0 0 10px" }}>
        <b style={{ color: TEXT_MAIN }}>{spec.x.zh}</b>（{spec.x.min} ～ {spec.x.max}）
        {spec.x.note}
        <br />
        <b style={{ color: TEXT_MAIN }}>{spec.y.zh}</b>（{spec.y.min} ～ {spec.y.max}）
        {spec.y.note}
      </div>

      {rows === null || rows.length === 0 ? (
        <div data-field="curve-empty" style={{ color: DANGER, fontSize: 12, lineHeight: 1.7 }}>
          ⚠️ 這份文件裡讀不到 <code>{spec.path}</code>。按「＋ 新增一列」把整張表填回來
          —— 至少 {spec.minRows} 列，否則遊戲會整條退回出貨曲線（＝這次儲存不會有效果）。
        </div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ width: 28 }} />
            <span style={{ width: 96, color: TEXT_DIM, fontSize: 11, textAlign: "right" }}>
              {spec.x.zh}
            </span>
            <span style={{ width: 96, color: TEXT_DIM, fontSize: 11, textAlign: "right" }}>
              {spec.y.zh}
            </span>
          </div>
          {rows.map((_, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ width: 28, color: TEXT_DIM, fontSize: 12, paddingTop: 6 }}>
                {i + 1}.
              </span>
              {cell(i, "x")}
              {cell(i, "y")}
              <Btn
                small
                kind="danger"
                dataField={`curve.remove.${i}`}
                disabled={rows.length <= spec.minRows}
                title={
                  rows.length <= spec.minRows
                    ? `已經只剩 ${spec.minRows} 列 —— 再刪就不成一條曲線了`
                    : "刪掉這一列"
                }
                onClick={() => setRows(removeCurveRow(rows, i))}
              >
                刪除
              </Btn>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
        <Btn
          small
          dataField="curve.add"
          disabled={(rows?.length ?? 0) >= spec.maxRows}
          title={
            (rows?.length ?? 0) >= spec.maxRows
              ? `最多 ${spec.maxRows} 列`
              : "加一列（留白，填上去之後才會被存出去）"
          }
          onClick={() => setRows(addCurveRow(rows ?? []))}
        >
          ＋ 新增一列
        </Btn>
        {verdict?.table && (
          <span data-field="curve-error" style={{ color: DANGER, fontSize: 12 }}>
            {verdict.table}
          </span>
        )}
      </div>

      {preview.length > 0 && (
        <div
          data-field="curve-preview"
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: `1px solid ${PANEL_BORDER}`,
            color: TEXT_DIM,
            fontSize: 12,
            lineHeight: 1.8,
          }}
        >
          這張表套下去，場上的人會拿到：
          {preview.map((p) => (
            <div key={p.x}>
              體型 <code style={{ color: TEXT_MAIN }}>{p.x}</code> →{" "}
              <code style={{ color: p.mult === 1 ? TEXT_DIM : GOLD }}>
                {p.mult.toFixed(3)}×
              </code>{" "}
              射程　<span style={{ opacity: 0.8 }}>{p.who}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
