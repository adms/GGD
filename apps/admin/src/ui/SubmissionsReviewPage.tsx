/**
 * 🧑‍⚖️⭐⭐ **AI／玩家投稿的批核審查頁** —— owner 2026-09-01 逐字：
 *
 * > 「八個驗收技能特效是用來**驗收編輯器是否能做出對應技能**，
 * >  **不是直接套用回去遊戲主程式中**，所有技能效果機制動畫特效由 AI 來調整變更
 * >  都要經過**後台一頁批核審查頁 通過才能套用**，因為目前 AI 產特效的正確性
 * >  太差了且太不穩定了（**肉眼評價 0~4/10 分**, 加上**視覺擷圖自動審查 2~6/10 分**）」
 *
 * ── ⛔ 這一頁與 `FeatureReviewPage` 是**兩件事** ────────────────────────────
 * | 頁 | 審什麼 | 預設 |
 * |---|---|---|
 * | 🧑‍⚖️ 批次驗收（連續圖片） | **我們自己**做完的一批功能 | ⭐ **先上線**，這頁是事後否決 |
 * | 📥 這一頁 | **AI／玩家送進來**的內容 | ⛔ **先不上線**，通過才套用 |
 *
 * ⚠️ ⭐ 預設相反是刻意的，⛔ 不是不一致：owner 給的兩個數字（肉眼 0~4/10、
 * 自動 2~6/10）**直接否決**了「先上線再說」用在 AI 產的內容上。
 *
 * ── ⭐ 三段階梯，而**每一段都是一個按鈕** ─────────────────────────────────
 *  ① 提案（AI／編輯器憑證送進來，這頁只看得到結果）
 *  ② **通過／否決** —— 否決必填原因
 *  ③ ⭐ **套用（promote）** —— ⛔ 一個**分開的**按鈕。
 *     「通過」只代表「編輯器做得出來」，⛔ 不代表「可以出貨」。
 *
 * ⚠️ ⭐ `editor-capability-fixture` 那一族**永遠**是灰的，⛔ 即使人工通過 ——
 * 而且它旁邊要**印出原因**（⛔ 一個灰掉的按鈕不算說明）。
 */
import React, { useCallback, useEffect, useState } from "react";
import * as apiFns from "../api";
import type { SubmissionView } from "../api";
import { ApiError } from "../session";
import { Badge, Btn, ErrorBanner, Panel, TextInput } from "./widgets";
import {
  DANGER,
  GOLD,
  OK,
  PANEL_BORDER,
  TEXT_DIM,
  TEXT_MAIN,
  WARN,
} from "./theme";

/** ⭐ 來源決定這一列有多危險 —— ⛔ 不是 kind。 */
function originBadge(v: SubmissionView): { text: string; tone: string } {
  return v.origin === "ai-editor"
    ? { text: "🤖 AI／編輯器", tone: WARN }
    : { text: "🧑 玩家", tone: TEXT_DIM };
}

function statusBadge(v: SubmissionView): { text: string; tone: string } {
  if (v.promoted) return { text: "✅ 已套用", tone: OK };
  if (v.status === "approved")
    return { text: "☑️ 已通過（尚未套用）", tone: GOLD };
  if (v.status === "rejected") return { text: "⛔ 已否決", tone: DANGER };
  return { text: "⏳ 等審", tone: TEXT_DIM };
}

export function SubmissionsReviewPage(): React.JSX.Element {
  const [rows, setRows] = useState<SubmissionView[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setRows(await apiFns.getPendingSubmissions());
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, fn: () => Promise<unknown>): Promise<void> => {
    setBusy(id);
    try {
      await fn();
      setErr(null);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title="📥 投稿批核（AI／玩家內容）">
      <p style={{ color: TEXT_DIM, marginTop: 0, lineHeight: 1.7 }}>
        ⭐ <b>通過</b>與<b>套用</b>是<b>兩個</b>
        決定。「通過」只代表「編輯器做得出來」， ⛔ 不代表可以出貨 ——
        要上線得再按一次<b>套用</b>， 而那一刻伺服器會<b>重驗</b>{" "}
        base／schema／capability／資產安全。
        <br />
        ⚠️ <code>editor-capability-fixture</code>（八招驗收技能）
        <b>永遠不可套用</b>，⛔ 即使人工通過（owner 2026-09-01）。
      </p>
      {err !== null && <ErrorBanner text={err} />}
      {rows.length === 0 && (
        <p style={{ color: TEXT_DIM }}>⭐ 佇列是空的 —— 沒有等審的投稿。</p>
      )}
      {rows.map((v) => {
        const ob = originBadge(v);
        const sb = statusBadge(v);
        const canPromote = v.promotable && !v.promoted;
        return (
          <div
            key={v.id}
            style={{
              border: `1px solid ${PANEL_BORDER}`,
              borderRadius: 8,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <b style={{ color: TEXT_MAIN }}>{v.id}</b>
              <Badge color={ob.tone}>{ob.text}</Badge>
              <Badge color={TEXT_DIM}>{v.kind}</Badge>
              <Badge color={sb.tone}>{sb.text}</Badge>
            </div>
            <div
              style={{
                color: TEXT_DIM,
                fontSize: 12,
                marginTop: 4,
                wordBreak: "break-all",
              }}
            >
              digest <code>{v.digest}</code>
            </div>
            {v.reason !== undefined && v.reason !== "" && (
              <div style={{ color: DANGER, fontSize: 12, marginTop: 4 }}>
                原因：{v.reason}
              </div>
            )}
            {/* ⭐ 灰掉的按鈕**要說出原因** —— ⛔ 一個沒有解釋的灰按鈕會被當成壞掉。 */}
            {!canPromote &&
              v.notPromotableWhy !== undefined &&
              v.notPromotableWhy !== "" && (
                <div style={{ color: WARN, fontSize: 12, marginTop: 4 }}>
                  ⛔ 不可套用：{v.notPromotableWhy}
                </div>
              )}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 10,
                flexWrap: "wrap",
              }}
            >
              <Btn
                dataField={`approve-${v.id}`}
                onClick={() =>
                  void act(v.id, () =>
                    apiFns.decideSubmission(v.id, "approved"),
                  )
                }
                disabled={busy === v.id || v.status === "approved"}
              >
                ☑️ 通過
              </Btn>
              <TextInput
                dataField={`reason-${v.id}`}
                value={reason[v.id] ?? ""}
                onChange={(t) => setReason((r) => ({ ...r, [v.id]: t }))}
                placeholder="否決原因（必填）"
              />
              <Btn
                kind="danger"
                dataField={`reject-${v.id}`}
                onClick={() =>
                  void act(v.id, () =>
                    apiFns.decideSubmission(
                      v.id,
                      "rejected",
                      reason[v.id] ?? "",
                    ),
                  )
                }
                disabled={busy === v.id || (reason[v.id] ?? "") === ""}
              >
                ⛔ 否決
              </Btn>
              <Btn
                kind="primary"
                dataField={`promote-${v.id}`}
                onClick={() =>
                  void act(v.id, () =>
                    apiFns.promoteSubmission(
                      v.id,
                      v.digest,
                      reason[v.id] ?? "",
                    ),
                  )
                }
                disabled={busy === v.id || !canPromote}
              >
                🚀 套用（重驗後上線）
              </Btn>
            </div>
          </div>
        );
      })}
    </Panel>
  );
}
