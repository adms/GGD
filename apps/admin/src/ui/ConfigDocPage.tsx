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
        if (overlaid) {
          setBase(overlaid);
          setSource("overlay");
        } else if (shippedDoc) {
          setBase(shippedDoc);
          setSource("shipped");
        } else {
          setSource("none");
        }
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

  const dirty = Object.keys(draft).length > 0;
  const allValid = Object.keys(errors).length === 0;
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
