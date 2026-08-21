/**
 * Quick Approval 第②區 — 清理／移除 (GH#495). Presentation + wiring only; every
 * decision lives in ../quickCleanup.ts.
 *
 * ⭐ ONE CARD TEMPLATE, N ACTIONS. 清理變身態, 下架未經審查的英雄 and 下架未經審查的
 * 道具 differ ONLY in where the preview comes from and where the write goes — so
 * they are three parameter sets of one card, not three panels (CLAUDE.md 第零守則
 * ⑨). A fourth removal is a row in an array, and it inherits the two-stage
 * contract for free rather than re-implementing it slightly differently.
 *
 * ⭐ THE GUARD OF THIS TICKET IS STRUCTURAL, NOT A HABIT. The confirm button
 * EXISTS ONLY INSIDE `preview !== null`, and `onRun` re-asks `confirmGate` before
 * it touches the network. A removal in this zone cannot be reached in one click,
 * by mis-tap or by a future refactor that forgets why.
 */
import { useState } from "react";
import {
  CLEANUP_LABEL,
  confirmGate,
  confirmLabel,
  type CleanupKind,
  type CleanupPreview,
} from "../quickCleanup";
import { Btn, Panel } from "./widgets";
import { DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";

/** What a completed cleanup hands back: what happened, and how to take it back. */
export interface CleanupOutcome {
  text: string;
  /** the one-key 還原; null when this action has no undo (and then SAY so) */
  undo: (() => Promise<string>) | null;
}

/** One removal, as a parameter set. */
export interface CleanupAction {
  kind: CleanupKind;
  /** what it is and why it is safe — printed above the buttons */
  blurb: React.ReactNode;
  /** why it cannot even be previewed right now (still loading, read failed), or null */
  unavailable: string | null;
  preview: () => Promise<CleanupPreview>;
  run: (preview: CleanupPreview) => Promise<CleanupOutcome>;
}

export function QuickCleanupSection(props: {
  actions: readonly CleanupAction[];
  busy: boolean;
}): React.JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: `1px solid ${WARN}`,
          background: "#221b13",
          fontSize: 12,
          color: TEXT_DIM,
          lineHeight: 1.8,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 800, color: TEXT_MAIN }}>② 清理／移除</div>
        這一區<b>會移除已經啟用的東西</b>，所以它<b>不是</b>上面那顆一鍵送出的一部分。
        每一個動作都是<b>兩段式</b>：先<b>逐項預覽</b>（名字 + id）→ 再確認 → 完成後給你一個
        <b>一鍵還原</b>。⛔ 沒有預覽就按不到確認。
      </div>
      {props.actions.map((a) => (
        <CleanupCard key={a.kind} action={a} busy={props.busy} />
      ))}
    </div>
  );
}

/**
 * One removal. Exported so the guard can drive it without a browser.
 *
 * State machine, and the reason each edge exists:
 *   idle ──預覽──▶ previewed ──確認──▶ done ──還原──▶ idle
 *          ▲            │
 *          └───取消─────┘
 * `done` keeps the undo closure alive because the operator's regret arrives
 * AFTER the list has vanished from the screen.
 */
export function CleanupCard(props: { action: CleanupAction; busy: boolean }): React.JSX.Element {
  const { action } = props;
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [undo, setUndo] = useState<(() => Promise<string>) | null>(null);
  const [running, setRunning] = useState(false);

  const gate = confirmGate(preview);
  const locked = props.busy || running || action.unavailable !== null;

  const onPreview = async (): Promise<void> => {
    setRunning(true);
    setMsg(null);
    try {
      setPreview(await action.preview());
    } catch (err) {
      setPreview(null);
      setMsg({ ok: false, text: `預覽失敗：${errText(err)}` });
    } finally {
      setRunning(false);
    }
  };

  const onRun = async (): Promise<void> => {
    // ⭐ asked again HERE, not only in the render: the button is the first gate,
    // this is the one a refactor cannot delete by accident.
    if (preview === null || !confirmGate(preview).allowed) return;
    setRunning(true);
    setMsg(null);
    try {
      const out = await action.run(preview);
      setPreview(null);
      setUndo(() => out.undo);
      setMsg({ ok: true, text: out.text });
    } catch (err) {
      setMsg({ ok: false, text: `執行失敗：${errText(err)}` });
    } finally {
      setRunning(false);
    }
  };

  const onUndo = async (): Promise<void> => {
    if (undo === null) return;
    setRunning(true);
    try {
      const text = await undo();
      setUndo(null);
      setMsg({ ok: true, text: `↩ ${text}` });
    } catch (err) {
      setMsg({ ok: false, text: `還原失敗：${errText(err)}` });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Panel
      title={`🧹 ${CLEANUP_LABEL[action.kind]}`}
      right={
        <span style={{ fontSize: 11, color: TEXT_DIM }}>
          {action.unavailable ?? (preview === null ? "兩段式：先預覽" : "等你確認")}
        </span>
      }
    >
      <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.8 }}>{action.blurb}</div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
        <Btn
          onClick={() => void onPreview()}
          disabled={locked}
          dataField={`cleanup-preview-${action.kind}`}
        >
          {running && preview === null ? "計算中…" : "🔍 預覽要移除的項目"}
        </Btn>
        {action.unavailable !== null && (
          <span style={{ fontSize: 12, color: WARN }}>{action.unavailable}</span>
        )}
        {msg && (
          <span style={{ fontSize: 12, color: msg.ok ? OK : DANGER, maxWidth: 620 }}>{msg.text}</span>
        )}
        {undo !== null && (
          <Btn small onClick={() => void onUndo()} disabled={running} dataField={`cleanup-undo-${action.kind}`}>
            ↩ 一鍵還原
          </Btn>
        )}
      </div>

      {/* ⛔ THE CONFIRM LIVES HERE AND NOWHERE ELSE. No preview ⇒ no button. */}
      {preview !== null && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            borderRadius: 10,
            border: `1px solid ${gate.allowed ? GOLD : WARN}`,
            background: "#221b13",
          }}
        >
          <div style={{ fontSize: 12, color: TEXT_MAIN, lineHeight: 1.8 }}>{preview.headline}</div>
          {preview.notes.map((n) => (
            <div key={n} style={{ fontSize: 11, color: WARN, marginTop: 6, lineHeight: 1.7 }}>
              {n}
            </div>
          ))}
          <ul style={{ margin: "10px 0 0 0", padding: "0 0 0 18px", fontSize: 12, color: TEXT_MAIN }}>
            {preview.items.map((it) => (
              <li key={it.id} style={{ lineHeight: 1.7 }}>
                {it.name} <span style={{ color: TEXT_DIM, fontSize: 11 }}>{it.id}</span>
              </li>
            ))}
          </ul>
          {!gate.allowed && (
            <div style={{ fontSize: 12, color: WARN, marginTop: 10, lineHeight: 1.7 }}>{gate.reason}</div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 12, borderTop: PANEL_BORDER, paddingTop: 12 }}>
            {gate.allowed && (
              <Btn
                kind="danger"
                onClick={() => void onRun()}
                disabled={running}
                dataField={`cleanup-confirm-${action.kind}`}
              >
                {confirmLabel(preview)}
              </Btn>
            )}
            <Btn small onClick={() => setPreview(null)} disabled={running}>
              取消
            </Btn>
          </div>
        </div>
      )}
    </Panel>
  );
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
