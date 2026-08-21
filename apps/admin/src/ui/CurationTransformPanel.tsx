/**
 * 🧹 一鍵清理變身態 — the panel owner asked for on 2026-08-21.
 *
 *   「白名單還是 59 / 10 個變身態在線上仍然選得到 => 幫我後台跳出一鍵清理變身態的按鈕」
 *
 * TWO STAGES, because this is not reversible from the list itself: pressing the
 * button PREVIEWS (names every champion it would remove), and only the second
 * button writes. The write goes through the platform, which re-derives the list
 * itself, re-checks the count under its mutex and takes an undo snapshot first —
 * so 還原 in the 危險操作 panel below is the one-key rollback.
 *
 * All of the arithmetic lives in ../curationTransform.ts (pure, unit-tested);
 * this file is presentation + wiring.
 */
import { useMemo, useState } from "react";
import { evictTransformedBodies, type EvictTransformedResponse } from "../api";
import type { ContentRow, WhitelistDoc } from "../curation";
import {
  buildTransformCleanupPlan,
  canCleanTransformed,
  reconcileWithServer,
  transformConfirmSummary,
} from "../curationTransform";
import { Btn, Panel } from "./widgets";
import { GOLD, OK, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";

export function CurationTransformPanel(props: {
  /** the live whitelist as the server returned it */
  server: WhitelistDoc;
  /** champion rows loaded from /content/champions/ */
  championRows: readonly ContentRow[];
  busy: boolean;
  /** unsaved draft edits exist — a write from here would race them */
  dirty: boolean;
  onApplied: (doc: WhitelistDoc) => void;
}): React.JSX.Element {
  const [preview, setPreview] = useState<EvictTransformedResponse | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [running, setRunning] = useState(false);

  const plan = useMemo(
    () => buildTransformCleanupPlan({ live: props.server, rows: props.championRows }),
    [props.server, props.championRows],
  );
  const mismatch = preview === null ? null : reconcileWithServer(plan, preview);
  const disabled = props.busy || running || props.dirty;

  const onPreview = async (): Promise<void> => {
    setRunning(true);
    setMsg(null);
    try {
      setPreview(await evictTransformedBodies({ dryRun: true }));
    } catch (err) {
      setPreview(null);
      setMsg({ ok: false, text: `預覽失敗：${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setRunning(false);
    }
  };

  const onRun = async (): Promise<void> => {
    setRunning(true);
    setMsg(null);
    try {
      // The count comes from the SERVER's own dry run, not from this console's
      // derivation: it is the number the platform will re-check, so sending our
      // own would turn a genuine precondition into a self-fulfilling one.
      const res = await evictTransformedBodies({
        dryRun: false,
        expect: preview?.remove.length ?? 0,
      });
      props.onApplied(res.whitelist);
      setPreview(null);
      setMsg({
        ok: true,
        text:
          `✓ 已清理 ${res.remove.length} 個變身態：啟用英雄 ${res.before} → ${res.after}。` +
          (res.snapshotId ? `　還原點 ${res.snapshotId}（下方「危險操作」可一鍵還原）` : ""),
      });
    } catch (err) {
      setMsg({ ok: false, text: `清理失敗：${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Panel
      title="🧹 清理變身態 · Transformed bodies"
      right={
        <span style={{ fontSize: 11, color: TEXT_DIM }}>
          {plan.ready
            ? `內容樹宣告 ${plan.indexed} 個變身態 · 白名單上還有 ${plan.remove.length} 個`
            : "英雄清單載入中…"}
        </span>
      }
    >
      <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.8 }}>
        變身態（<code>transform.role === &quot;alternate&quot;</code>）是**技能觸發**才會出現的第二具身體，
        永遠不是一個可以被選的英雄。勾在白名單上不會讓玩家選到它（伺服器擋掉），
        只會讓這一頁的數字說謊、並且被 <code>opstate export</code> 複製到下一台機器。
        <br />
        ⭐ 名單是從 <code>/content/champions/</code> 逐份**推導**的，⛔ 不是寫死的 id ——
        以後新增的變身英雄自動適用。<b>本體不受影響</b>。
      </div>

      {props.dirty && (
        <div style={{ marginTop: 10, fontSize: 12, color: GOLD }}>
          有未儲存的變更 — 請先「儲存」或「放棄變更」，這個動作直接寫伺服器。
        </div>
      )}

      {plan.wouldEmpty && (
        <div style={{ marginTop: 10, fontSize: 12, color: WARN, lineHeight: 1.7 }}>
          ⚠ 白名單上**每一個**啟用的英雄都讀成變身態 — 這幾乎一定是{" "}
          <code>content/champions</code> 的 <code>transform.role</code> 標錯了，不是白名單髒了。
          已停用這個按鈕（清下去會讓選人畫面整個空掉）。
        </div>
      )}

      {plan.unresolved.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: TEXT_DIM }}>
          另有 {plan.unresolved.length} 個白名單英雄在內容樹裡找不到文件（退場 / 打錯 id）。
          這顆按鈕**不碰**它們 — 那是另一個問題（平台開機時會自行剔除已歸檔的）。
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
        <Btn
          onClick={() => void onPreview()}
          disabled={disabled || !canCleanTransformed(plan)}
          dataField="preview-transform-cleanup"
        >
          {running ? "計算中…" : "🧹 清理變身態（先預覽）"}
        </Btn>
        {plan.ready && plan.remove.length === 0 && (
          <span style={{ fontSize: 12, color: OK }}>白名單上沒有變身態 — 不需要清理。</span>
        )}
        {msg && (
          <span style={{ fontSize: 12, color: msg.ok ? OK : WARN, maxWidth: 620 }}>{msg.text}</span>
        )}
      </div>

      {preview !== null && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            borderRadius: 10,
            border: `1px solid ${mismatch ? WARN : GOLD}`,
            background: "#221b13",
          }}
        >
          <div style={{ fontSize: 12, color: TEXT_MAIN, lineHeight: 1.8 }}>
            {transformConfirmSummary(plan)}
          </div>
          {mismatch && (
            <div style={{ fontSize: 12, color: WARN, marginTop: 8, lineHeight: 1.7 }}>{mismatch}</div>
          )}
          {!preview.gateEnabled && (
            <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 6 }}>
              註：平台的自動剔除開關 <code>GGD_CURATION_TRANSFORM_GATE</code> 目前是關的 —
              這顆按鈕仍然可以清理存量，但下一次有人把變身態存回去時不會被自動擋下。
            </div>
          )}
          <ul style={{ margin: "10px 0 0 0", padding: "0 0 0 18px", fontSize: 12, color: TEXT_MAIN }}>
            {preview.remove.map((id) => (
              <li key={id} style={{ lineHeight: 1.7 }}>
                {preview.names[id] || plan.remove.find((r) => r.id === id)?.name || id}{" "}
                <span style={{ color: TEXT_DIM, fontSize: 11 }}>{id}</span>
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <Btn
              kind="danger"
              onClick={() => void onRun()}
              disabled={disabled || preview.remove.length === 0}
              dataField="confirm-transform-cleanup"
            >
              確認移除這 {preview.remove.length} 個
            </Btn>
            <Btn small onClick={() => setPreview(null)} disabled={running}>
              取消
            </Btn>
          </div>
        </div>
      )}
    </Panel>
  );
}
