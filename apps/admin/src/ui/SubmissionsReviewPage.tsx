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
import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as apiFns from "../api";
import type { SubmissionView } from "../api";
import { createContentEditApi } from "../contentApi";
import {
  canPromoteAiProposal,
  decisionLabels,
  isCapabilityFixture,
  parseHumanVisualScore,
  percent,
  statusText,
  type AiReviewQueue,
  type AiReviewQueueItem,
} from "../aiReviewPresentation";
import { ApiError } from "../session";
import { Badge, Btn, ErrorBanner, Panel, TextArea, TextInput } from "./widgets";
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

interface AiReviewFields {
  reviewer: string;
  note: string;
  score: string;
}

const EMPTY_AI_QUEUE: AiReviewQueue = { counts: {}, items: [] };

function aiTone(item: AiReviewQueueItem): string {
  if (item.status === "promoted" || item.status === "fixture-passed") return OK;
  if (item.status === "rejected" || item.status === "fixture-failed") return DANGER;
  if (item.status === "approved") return GOLD;
  if (item.status === "changed-after-review") return WARN;
  return TEXT_DIM;
}

export function SubmissionsReviewPage(): React.JSX.Element {
  const [rows, setRows] = useState<SubmissionView[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [aiQueue, setAiQueue] = useState<AiReviewQueue>(EMPTY_AI_QUEUE);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [aiFields, setAiFields] = useState<Record<string, AiReviewFields>>({});
  const aiReview = useMemo(() => createContentEditApi().aiReview, []);

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

  const loadAi = useCallback(async () => {
    try {
      setAiQueue(await aiReview.proposals<AiReviewQueue>());
      setAiErr(null);
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : String(e));
    }
  }, [aiReview]);

  useEffect(() => {
    void loadAi();
  }, [loadAi]);

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

  const setAiField = (key: string, field: keyof AiReviewFields, value: string): void => {
    setAiFields((current) => ({
      ...current,
      [key]: {
        reviewer: current[key]?.reviewer ?? "Owner",
        note: current[key]?.note ?? "",
        score: current[key]?.score ?? "",
        [field]: value,
      },
    }));
  };

  const actAi = async (key: string, fn: () => Promise<unknown>): Promise<void> => {
    setAiBusy(key);
    try {
      await fn();
      setAiErr(null);
      await loadAi();
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(null);
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

      <div style={{ borderTop: `1px solid ${PANEL_BORDER}`, margin: "20px 0 14px" }} />
      <h3 style={{ color: TEXT_MAIN, marginBottom: 6 }}>🤖 Editor／AI 候選（hash 鎖定）</h3>
      <p style={{ color: TEXT_DIM, marginTop: 0, lineHeight: 1.7 }}>
        每張候選都顯示實際擷圖、機器分數與候選 hash。人工必填審查者、0～10
        肉眼分數及意見；能力驗收樣本只能 pass／fail，production candidate
        才能 approve／reject，且核准後仍需另按一次 Promote。
      </p>
      {aiErr !== null && <ErrorBanner text={aiErr} />}
      {aiQueue.items.length === 0 && aiErr === null && (
        <p style={{ color: TEXT_DIM }}>目前沒有 Editor／AI 候選。</p>
      )}
      {aiQueue.items.map((item) => {
        const fixture = isCapabilityFixture(item);
        const labels = decisionLabels(item);
        const fields = aiFields[item.key] ?? { reviewer: "Owner", note: "", score: "" };
        const score = parseHumanVisualScore(fields.score);
        const inputsReady = fields.reviewer.trim() !== "" && fields.note.trim() !== "" && score !== null;
        const canPromote = canPromoteAiProposal(item);
        return (
          <div
            key={item.key}
            data-field={`ai-proposal-${item.key}`}
            style={{
              border: `1px solid ${fixture ? WARN : PANEL_BORDER}`,
              borderRadius: 8,
              padding: 12,
              marginBottom: 14,
              background: fixture ? "rgba(234,179,8,0.035)" : undefined,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ color: TEXT_MAIN }}>{item.target.id}</b>
              <Badge color={fixture ? WARN : GOLD}>
                {fixture ? "🧪 編輯器能力驗收" : "🚢 上線候選"}
              </Badge>
              <Badge color={aiTone(item)}>{statusText(item.status)}</Badge>
              {item.autoVisualScore !== undefined && (
                <Badge color={item.autoVisualScore >= 7 ? OK : WARN}>
                  自動視覺 {item.autoVisualScore}/10
                </Badge>
              )}
            </div>
            <p style={{ color: TEXT_MAIN, lineHeight: 1.6, margin: "8px 0" }}>{item.summary}</p>
            <div style={{ color: TEXT_DIM, fontSize: 12, wordBreak: "break-all" }}>
              candidate <code>{item.candidateHash}</code>
              {<> · review <code>{item.reviewHash}</code></>}
              {item.baseHash !== null && <> · base <code>{item.baseHash}</code></>}
            </div>
            {fixture && (
              <div style={{ color: WARN, marginTop: 6, fontSize: 12 }}>
                ⛔ 這是八招能力驗收，只驗證 Editor 是否能用積木拼出場景；無論分數或 pass 結果都永遠不可套用。
              </div>
            )}
            <div
              data-field={`visual-evidence-${item.key}`}
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 10 }}
            >
              {item.visualEvidence.map((frame, index) => (
                <figure key={`${frame.atMs}-${index}`} style={{ margin: 0 }}>
                  <img
                    src={frame.dataUrl}
                    alt={`${item.target.id} ${frame.label}`}
                    style={{ width: "100%", maxHeight: 320, objectFit: "contain", background: "#080b12", borderRadius: 6 }}
                  />
                  <figcaption style={{ color: TEXT_DIM, fontSize: 12, marginTop: 4 }}>
                    {frame.label} · {frame.atMs}ms · {frame.view}
                  </figcaption>
                </figure>
              ))}
            </div>
            {item.visualAudit ? (
              <div
                data-field={`visual-audit-${item.key}`}
                style={{ marginTop: 10, padding: 10, border: `1px solid ${PANEL_BORDER}`, borderRadius: 6, color: TEXT_DIM, fontSize: 12, lineHeight: 1.7 }}
              >
                <b style={{ color: TEXT_MAIN }}>GPU 完整時間軸稽核</b>
                <div>
                  {item.visualAudit.sampledFrames} 格 · 最差 {(item.visualAudit.worstAtMs / 1000).toFixed(3)}秒 ·
                  粒子峰值 {item.visualAudit.peakParticleCount}／系統 {item.visualAudit.peakSystemCount}
                </div>
                <div>
                  亮區 {percent(item.visualAudit.worst.highlightShare)} · 純亮 {percent(item.visualAudit.worst.brightShare)} ·
                  近白 {percent(item.visualAudit.worst.nearWhiteShare)} · 局部白底 {percent(item.visualAudit.worst.localWhiteCardShare)}
                </div>
                {item.visualAudit.worst.reason && <div>診斷：{item.visualAudit.worst.reason}</div>}
                {item.visualAudit.suspects.length > 0 && <div>疑似來源：{item.visualAudit.suspects.join("；")}</div>}
              </div>
            ) : item.target.collection === "vfx-scripts" ? (
              <div style={{ color: WARN, marginTop: 8, fontSize: 12 }}>
                ⛔ 舊候選缺少 GPU 完整時間軸稽核收據，必須由 Editor 重新送審後才能裁決。
              </div>
            ) : null}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, 0.5fr) minmax(120px, 0.35fr) minmax(260px, 1.5fr)", gap: 8, marginTop: 12 }}>
              <TextInput
                dataField={`ai-reviewer-${item.key}`}
                value={fields.reviewer}
                onChange={(value) => setAiField(item.key, "reviewer", value)}
                placeholder="審查者（必填）"
              />
              <TextInput
                dataField={`ai-score-${item.key}`}
                value={fields.score}
                onChange={(value) => setAiField(item.key, "score", value)}
                type="number"
                placeholder="肉眼分數 0～10"
              />
              <TextArea
                value={fields.note}
                onChange={(value) => setAiField(item.key, "note", value)}
                placeholder="人工審查意見（必填；說明動作、構圖、時序或素材問題）"
                rows={2}
              />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <Btn
                dataField={`ai-positive-${item.key}`}
                onClick={() => void actAi(item.key, () => aiReview.verdict({
                  key: item.key,
                  candidateHash: item.candidateHash,
                  reviewHash: item.reviewHash,
                  verdict: labels.positiveVerdict,
                  reviewer: fields.reviewer,
                  note: fields.note,
                  humanVisualScore: score ?? undefined,
                }))}
                disabled={aiBusy === item.key || !inputsReady}
              >
                {labels.positive}
              </Btn>
              <Btn
                kind="danger"
                dataField={`ai-negative-${item.key}`}
                onClick={() => void actAi(item.key, () => aiReview.verdict({
                  key: item.key,
                  candidateHash: item.candidateHash,
                  reviewHash: item.reviewHash,
                  verdict: labels.negativeVerdict,
                  reviewer: fields.reviewer,
                  note: fields.note,
                  humanVisualScore: score ?? undefined,
                }))}
                disabled={aiBusy === item.key || !inputsReady}
              >
                {labels.negative}
              </Btn>
              <Btn
                kind="primary"
                dataField={`ai-promote-${item.key}`}
                onClick={() => void actAi(item.key, () => aiReview.promote({
                  key: item.key,
                  candidateHash: item.candidateHash,
                  reviewHash: item.reviewHash,
                }))}
                disabled={aiBusy === item.key || !canPromote}
                title={fixture ? "能力驗收樣本永遠不可 Promote" : "只有 hash 未變且已人工核准的 production candidate 才能套用"}
              >
                🚀 Promote（重驗後套用）
              </Btn>
            </div>
            <details style={{ marginTop: 10, color: TEXT_DIM }}>
              <summary>檢視候選 JSON 與文字證據</summary>
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 11 }}>
                {JSON.stringify({ evidence: item.evidence, candidate: item.candidate }, null, 2)}
              </pre>
            </details>
          </div>
        );
      })}
    </Panel>
  );
}
