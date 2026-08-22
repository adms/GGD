/**
 * 變身外觀 — 讓「變身」在畫面上看得出來的三個旋鈕 (task #249 / GH#288)。
 *
 * 所有邏輯在 `../formVisuals`(測試也在那裡),這個檔只是視圖。
 *
 * ⚠️ 這一頁存在的理由,一句話:26 對變身裡有 21 對**前後同一個模型**。
 * 悟空與 Saber 都在裡面,而它們在 `war3map.w3u` 的顏色與大小欄位兩半完全相同 ——
 * 照抄 w3x 的話,變身在畫面上是零差異。所以顏色與大小是**美術決定**,出貨值只是
 * 起點;球體掛件那一欄則是真的 w3x 事實(悟空 A0MI→A0MJ)。
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, Btn } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";
import { getOverlayDoc, getShippedDoc, putOverlayDoc, revertOverlayDoc } from "../api";
import {
  FORM_VISUALS_COLLECTION,
  FORM_VISUALS_DOC_ID,
  FORM_VISUAL_GLOBAL_FIELDS,
  FORM_VISUAL_GLOBAL_HINT,
  FORM_VISUAL_GLOBAL_LABEL,
  FORM_VISUAL_ROW_FIELDS,
  FORM_VISUAL_ROW_HINT,
  FORM_VISUAL_ROW_LABEL,
  SHIPPED_FORM_VISUALS,
  draftFromEntry,
  entryFromDraft,
  extractFormVisuals,
  formVisualRows,
  formVisualSummary,
  formVisualsDocFor,
  isFormVisualBooleanGlobal,
  setFormEntry,
  setFormGlobal,
  setStatusEntry,
  statusVisualRows,
  validateFormVisualGlobal,
  validateFormVisualInput,
  validateStatusVisualId,
  type FormVisualDraft,
  type FormVisualRow,
  type FormVisualRowField,
} from "../formVisuals";
import type { ConfigFormVisualsDoc } from "@ggd/shared/content/schema/config";

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const NARROW: FormVisualRowField[] = ["tintR", "tintG", "tintB", "scaleMult", "attachScale", "attachOffsetY"];

export function FormVisualsPage(): JSX.Element {
  const [doc, setDoc] = useState<ConfigFormVisualsDoc | null>(null);
  const [drafts, setDrafts] = useState<Record<string, FormVisualDraft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmRevert, setConfirmRevert] = useState(false);
  // ⭐ M1（GH#599）—— 狀態外觀那一區的草稿與「新增」輸入框。
  const [statusDrafts, setStatusDrafts] = useState<Record<string, FormVisualDraft>>({});
  const [newStatusId, setNewStatusId] = useState("");

  const load = async (): Promise<void> => {
    try {
      // LIVE FIRST —— overlay 才是 shard 真的在讀的東西。
      const overlaid = (await getOverlayDoc(FORM_VISUALS_COLLECTION, FORM_VISUALS_DOC_ID)) as unknown;
      let full: unknown = overlaid ?? null;
      if (!full) {
        const shipped = await getShippedDoc(FORM_VISUALS_COLLECTION, FORM_VISUALS_DOC_ID);
        if (shipped.present && shipped.doc) full = shipped.doc;
      }
      // 兩份都讀不到 → 用出貨常數,而不是空表。理由和 基礎加成 那一頁一樣:
      // 空表會讓面板顯示「全部關掉」,而伺服器其實照樣在套出貨值。
      setDoc(extractFormVisuals(full) ?? SHIPPED_FORM_VISUALS);
    } catch (err) {
      setApiErr(errText(err));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo(() => formVisualRows(doc), [doc]);
  const summary = useMemo(() => formVisualSummary(rows), [rows]);
  const statusRows = useMemo(() => statusVisualRows(doc), [doc]);
  const newStatusErr = validateStatusVisualId(newStatusId);

  const write = async (next: ConfigFormVisualsDoc, id: string, msg: string): Promise<void> => {
    setBusy(id);
    setApiErr(null);
    try {
      const head = await putOverlayDoc(
        FORM_VISUALS_COLLECTION,
        FORM_VISUALS_DOC_ID,
        formVisualsDocFor(next) as unknown as Record<string, unknown>,
      );
      setDoc(next);
      setFlash(`✓ ${msg}（generation ${head.generation}）`);
    } catch (err) {
      setFlash(null);
      setApiErr(errText(err));
    } finally {
      setBusy(null);
    }
  };

  const revertAll = async (): Promise<void> => {
    setBusy("__revert__");
    setApiErr(null);
    try {
      const head = await revertOverlayDoc(FORM_VISUALS_COLLECTION, FORM_VISUALS_DOC_ID);
      setDrafts({});
      setConfirmRevert(false);
      await load();
      setFlash(`✓ 已還原出貨版（generation ${head.generation}）`);
    } catch (err) {
      setFlash(null);
      setApiErr(errText(err));
    } finally {
      setBusy(null);
    }
  };

  const draftOf = (r: FormVisualRow): FormVisualDraft =>
    drafts[r.alternateId] ?? draftFromEntry(r.authored ?? r.shipped);

  return (
    <Panel title="變身外觀">
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 6px" }}>
        26 對變身裡有 <b style={{ color: TEXT_MAIN }}>21 對前後是同一個模型</b>
        （悟空、Saber 都在裡面）。所以讓玩家看出變身的只有三樣：
        <b style={{ color: GOLD }}>顏色 · 大小 · 球體掛件</b>，而這一頁就是它們唯一的入口。
      </p>
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 6px" }}>
        ⚠️ <b style={{ color: ACCENT }}>顏色與大小多半不是從 w3x 抄的</b>：悟空與 Saber 兩對的
        <code> uclr/uclg/uclb </code>與<code> usca </code>在 war3map.w3u 裡前後
        <b style={{ color: TEXT_MAIN }}>完全相同</b>，觸發器也沒有改顏色 —— 照抄的話變身是零差異。
        出貨值是刻意挑的美術起點，<b style={{ color: TEXT_MAIN }}>不是量到的數字</b>。
        「球體模型」那一欄則是真的 w3x 事實（悟空 A0MI → A0MJ）。
      </p>
      <p style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.7, margin: "0 0 14px" }}>
        只有<b style={{ color: TEXT_MAIN }}>變身態</b>可以填 —— 基本型永遠不會套用任何一格
        （所以基本型悟空不會長出超三的頭）。設定寫進耐久覆蓋層，
        <b style={{ color: OK }}>撐得過重新部署</b>。
      </p>

      <div style={{ color: TEXT_MAIN, fontSize: 13, marginBottom: 12 }}>{summary}</div>
      {flash && <div style={{ color: OK, fontSize: 13, marginBottom: 10 }}>{flash}</div>}
      {apiErr && <div style={{ color: DANGER, fontSize: 13, marginBottom: 10 }}>{apiErr}</div>}

      {/* ---- 全域旋鈕 ---- */}
      <div style={{ display: "grid", gap: 6, marginBottom: 16 }}>
        {FORM_VISUAL_GLOBAL_FIELDS.map((f) => {
          // ⛔ 這裡以前寫死 `f === "enabled" || f === "attachmentsEnabled"` —— 一份
          // 手抄的欄位分類，而它會在下一次加欄位時把數字框畫成核取方塊（M1 的
          // `statusStrength` 就是下一次）。判斷收在 formVisuals.ts，和驗證共用一份。
          const isBool = isFormVisualBooleanGlobal(f);
          const cur = doc ? doc[f] : SHIPPED_FORM_VISUALS[f];
          const text = String(cur ?? "");
          const err = validateFormVisualGlobal(f, text);
          return (
            <div
              key={f}
              data-testid={`formvis-global-${f}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 10px",
                border: `1px solid ${err === "" ? PANEL_BORDER : DANGER}`,
                borderRadius: 4,
                fontSize: 13,
              }}
            >
              <span style={{ color: TEXT_MAIN, minWidth: 92 }}>{FORM_VISUAL_GLOBAL_LABEL[f]}</span>
              {isBool ? (
                <input
                  type="checkbox"
                  aria-label={FORM_VISUAL_GLOBAL_LABEL[f]}
                  data-field={`formvis-${f}`}
                  checked={cur === true}
                  disabled={!doc || busy !== null}
                  onChange={(e) => {
                    if (!doc) return;
                    void write(setFormGlobal(doc, f, e.target.checked), f, `已更新 ${FORM_VISUAL_GLOBAL_LABEL[f]}`);
                  }}
                />
              ) : (
                <input
                  aria-label={FORM_VISUAL_GLOBAL_LABEL[f]}
                  data-field={`formvis-${f}`}
                  aria-invalid={err === "" ? undefined : true}
                  defaultValue={text}
                  inputMode="decimal"
                  disabled={!doc || busy !== null}
                  onBlur={(e) => {
                    if (!doc) return;
                    if (validateFormVisualGlobal(f, e.target.value) !== "") return;
                    void write(
                      setFormGlobal(doc, f, Number(e.target.value)),
                      f,
                      `已更新 ${FORM_VISUAL_GLOBAL_LABEL[f]}`,
                    );
                  }}
                  style={{
                    width: 80,
                    padding: "4px 6px",
                    background: "transparent",
                    color: TEXT_MAIN,
                    border: `1px solid ${PANEL_BORDER}`,
                    borderRadius: 3,
                    textAlign: "right",
                  }}
                />
              )}
              <span style={{ color: TEXT_DIM, fontSize: 11 }}>{FORM_VISUAL_GLOBAL_HINT[f]}</span>
            </div>
          );
        })}
      </div>

      {/* ---- 每個變身態一列 ---- */}
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((r) => {
          const draft = draftOf(r);
          const errs = FORM_VISUAL_ROW_FIELDS.map((f) =>
            validateFormVisualInput(f, draft[f] ?? ""),
          ).filter((m) => m !== "");
          const valid = errs.length === 0;
          const live = r.effective !== null;
          return (
            <div
              key={r.alternateId}
              data-testid={`formvis-row-${r.alternateId}`}
              style={{
                padding: "8px 10px",
                border: `1px solid ${valid ? PANEL_BORDER : DANGER}`,
                borderLeft: `3px solid ${live ? GOLD : PANEL_BORDER}`,
                borderRadius: 4,
                fontSize: 13,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ color: GOLD, minWidth: 28 }}>{r.heroNumber}</span>
                <code style={{ color: TEXT_MAIN, minWidth: 108 }}>{r.alternateId}</code>
                <span style={{ color: TEXT_DIM, fontSize: 11 }}>
                  {r.abilityName} · 本體 {r.baseId}
                </span>
                <span style={{ flex: 1 }} />
                <Btn
                  dataField={`formvis-save-${r.alternateId}`}
                  disabled={!doc || !valid || busy !== null}
                  onClick={() => {
                    if (!doc) return;
                    void write(
                      setFormEntry(doc, r.alternateId, entryFromDraft(draft, r.authored?.note)),
                      r.alternateId,
                      `已更新 ${r.alternateId}`,
                    );
                  }}
                >
                  儲存
                </Btn>
                <Btn
                  dataField={`formvis-clear-${r.alternateId}`}
                  disabled={!doc || busy !== null}
                  onClick={() => {
                    if (!doc) return;
                    setDrafts({ ...drafts, [r.alternateId]: {} });
                    void write(
                      setFormEntry(doc, r.alternateId, undefined),
                      r.alternateId,
                      `已移除 ${r.alternateId} 的外觀`,
                    );
                  }}
                >
                  移除外觀
                </Btn>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {FORM_VISUAL_ROW_FIELDS.map((f) => {
                  const v = draft[f] ?? "";
                  const err = validateFormVisualInput(f, v);
                  return (
                    <label
                      key={f}
                      style={{ display: "flex", alignItems: "center", gap: 4, color: TEXT_DIM, fontSize: 11 }}
                      title={FORM_VISUAL_ROW_HINT[f]}
                    >
                      {FORM_VISUAL_ROW_LABEL[f]}
                      <input
                        aria-label={`${r.alternateId} ${FORM_VISUAL_ROW_LABEL[f]}`}
                        data-field={`formvis-${r.alternateId}-${f}`}
                        aria-invalid={err === "" ? undefined : true}
                        value={v}
                        onChange={(e) =>
                          setDrafts({
                            ...drafts,
                            [r.alternateId]: { ...draft, [f]: e.target.value },
                          })
                        }
                        style={{
                          width: NARROW.includes(f) ? 62 : 150,
                          padding: "3px 5px",
                          background: "transparent",
                          color: err === "" ? TEXT_MAIN : DANGER,
                          border: `1px solid ${err === "" ? PANEL_BORDER : DANGER}`,
                          borderRadius: 3,
                          textAlign: NARROW.includes(f) ? "right" : "left",
                        }}
                      />
                    </label>
                  );
                })}
              </div>
              {!valid && (
                <div style={{ color: DANGER, fontSize: 11, marginTop: 4 }}>{errs.join(" · ")}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* ---- ⭐ M1（GH#599）：狀態外觀 —— 同三個旋鈕，但鍵是**狀態 id** ---- */}
      <h3 style={{ color: TEXT_MAIN, fontSize: 14, margin: "20px 0 6px" }}>狀態外觀</h3>
      <p style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.7, margin: "0 0 10px" }}>
        同樣三個旋鈕，但成立條件是「<b style={{ color: GOLD }}>身上掛著這個狀態</b>」而不是
        「身體換成了變身態」。⭐ 這是<b style={{ color: TEXT_MAIN }}>變身態退場</b>要用的那一格：
        七軸量測顯示 <code>e00l</code>／<code>e010</code>／<code>o00x</code>／<code>o030</code>／
        <code>u01u</code> 五對變身在畫面上的<b style={{ color: TEXT_MAIN }}>全部差別就是這三樣</b>，
        搬到狀態上之後那五份變身態文件可以整份退掉而畫面一個像素都不掉。
        上面的「狀態外觀濃度」轉到 <b style={{ color: TEXT_MAIN }}>0</b> 就是這一整區的一鍵 rollback。
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        {statusRows.map((r) => {
          const draft = statusDrafts[r.statusId] ?? draftFromEntry(r.authored);
          const errs = FORM_VISUAL_ROW_FIELDS.map((f) =>
            validateFormVisualInput(f, draft[f] ?? ""),
          ).filter((m) => m !== "");
          const valid = errs.length === 0;
          return (
            <div
              key={r.statusId}
              data-testid={`formvis-status-${r.statusId}`}
              style={{
                padding: "8px 10px",
                border: `1px solid ${valid ? PANEL_BORDER : DANGER}`,
                borderLeft: `3px solid ${r.effective !== null ? GOLD : PANEL_BORDER}`,
                borderRadius: 4,
                fontSize: 13,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <code style={{ color: TEXT_MAIN, minWidth: 150 }}>{r.statusId}</code>
                <span style={{ flex: 1 }} />
                <Btn
                  dataField={`formvis-status-save-${r.statusId}`}
                  disabled={!doc || !valid || busy !== null}
                  onClick={() => {
                    if (!doc) return;
                    void write(
                      setStatusEntry(doc, r.statusId, entryFromDraft(draft, r.authored.note)),
                      r.statusId,
                      `已更新 ${r.statusId}`,
                    );
                  }}
                >
                  儲存
                </Btn>
                <Btn
                  dataField={`formvis-status-clear-${r.statusId}`}
                  disabled={!doc || busy !== null}
                  onClick={() => {
                    if (!doc) return;
                    void write(
                      setStatusEntry(doc, r.statusId, undefined),
                      r.statusId,
                      `已移除 ${r.statusId} 的外觀`,
                    );
                  }}
                >
                  移除外觀
                </Btn>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {FORM_VISUAL_ROW_FIELDS.map((f) => {
                  const v = draft[f] ?? "";
                  const err = validateFormVisualInput(f, v);
                  return (
                    <label
                      key={f}
                      style={{ display: "flex", alignItems: "center", gap: 4, color: TEXT_DIM, fontSize: 11 }}
                      title={FORM_VISUAL_ROW_HINT[f]}
                    >
                      {FORM_VISUAL_ROW_LABEL[f]}
                      <input
                        aria-label={`${r.statusId} ${FORM_VISUAL_ROW_LABEL[f]}`}
                        data-field={`formvis-status-${r.statusId}-${f}`}
                        aria-invalid={err === "" ? undefined : true}
                        value={v}
                        onChange={(e) =>
                          setStatusDrafts({
                            ...statusDrafts,
                            [r.statusId]: { ...draft, [f]: e.target.value },
                          })
                        }
                        style={{
                          width: NARROW.includes(f) ? 62 : 150,
                          padding: "3px 5px",
                          background: "transparent",
                          color: err === "" ? TEXT_MAIN : DANGER,
                          border: `1px solid ${err === "" ? PANEL_BORDER : DANGER}`,
                          borderRadius: 3,
                          textAlign: NARROW.includes(f) ? "right" : "left",
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <input
            aria-label="新增狀態外觀"
            data-field="formvis-status-new"
            placeholder="狀態 id（例：bankai）"
            value={newStatusId}
            onChange={(e) => setNewStatusId(e.target.value)}
            style={{
              width: 220,
              padding: "4px 6px",
              background: "transparent",
              color: newStatusErr === "" ? TEXT_MAIN : DANGER,
              border: `1px solid ${newStatusErr === "" ? PANEL_BORDER : DANGER}`,
              borderRadius: 3,
            }}
          />
          <Btn
            dataField="formvis-status-add"
            disabled={!doc || newStatusErr !== "" || busy !== null}
            onClick={() => {
              if (!doc) return;
              const id = newStatusId.trim();
              void write(setStatusEntry(doc, id, { scaleMult: 1 }), id, `已新增 ${id}`);
              setNewStatusId("");
            }}
          >
            ＋ 新增狀態外觀
          </Btn>
          {newStatusErr !== "" && newStatusId !== "" && (
            <span style={{ color: DANGER }}>{newStatusErr}</span>
          )}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        {confirmRevert ? (
          <>
            <span style={{ color: DANGER, fontSize: 12, marginRight: 8 }}>
              整份設定會回到出貨版（覆蓋層條目移除），確定？
            </span>
            <Btn dataField="formvis-revert-yes" disabled={busy !== null} onClick={() => void revertAll()}>
              確定還原
            </Btn>
            <Btn dataField="formvis-revert-no" onClick={() => setConfirmRevert(false)}>
              取消
            </Btn>
          </>
        ) : (
          <Btn dataField="formvis-revert" disabled={busy !== null} onClick={() => setConfirmRevert(true)}>
            還原出貨版
          </Btn>
        )}
      </div>
    </Panel>
  );
}
