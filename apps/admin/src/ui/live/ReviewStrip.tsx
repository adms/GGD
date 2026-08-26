/**
 * 🧑‍⚖️【批核條】—— 掛在**每一個對照/設定頁**頂端的一條批核區。
 *
 * owner 2026-08-27（逐字）：
 * > 「我提醒你以下這些設定頁面 **都會有批核頁面的部分**喔」（隨後列出 13 頁）
 *
 * ⭐ 這是**一個元件 × 一格 family 參數**，⛔ 不是 13 頁各寫一塊（第零守則⑨：
 * N 個同型 = K 個模板 + 一張表）。每一頁只要 `<ReviewStrip family="…" />`。
 *
 * ── 它顯示什麼（⭐ 只顯示**與這一頁有關**的批次）────────────────────────────
 * 帳本（`/__review/features`，與 #669 的批核頁**同一份**資料，⛔ 不是第二個住處）
 * 依 `family` 篩出這一頁負責的那幾批：
 *   · 待你裁決幾批、有沒有帶 ⚠️ 紅旗的
 *   · **一鍵保留／否決（必填原因）** —— owner 的定義：先上線、事後否決、追加原因
 *   · 連續圖片就地展開（`/__review/frame`，柵欄只供應 docs/_reports 底下的 .png）
 *   · 每一批印出它登記的 **rollback 開關**（configId ＋ 欄位）——
 *     ⭐ 否決＝翻那一格，⛔ 不是 revert commit
 *
 * ⚠️ 這一頁沒有任何批次時**不是空白**：它明說「這一頁還沒有登記過批次」並指出
 * 怎麼登記（`pnpm review:register`）—— fail-open 沒錯，靜默才是缺陷。
 */
import { useCallback, useEffect, useState } from "react";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "../theme";

interface Frame {
  readonly rel: string;
  readonly label?: string;
  readonly bright?: number;
}
interface Rollback {
  readonly configId?: string;
  readonly field?: string;
  readonly liveValue?: unknown;
  readonly rollbackValue?: unknown;
}
interface Batch {
  readonly id: string;
  readonly title?: string;
  readonly family?: string;
  readonly issues?: readonly number[];
  readonly frames?: readonly Frame[];
  readonly rollback?: Rollback;
  readonly verdict?: "keep" | "veto" | null;
  readonly status?: string;
  readonly hash?: string;
  readonly reason?: string | null;
}

const RED_FLAG = /⚠️|未驗收|0 亮像素|沒過|失敗/;

function statusOf(b: Batch): string {
  if (b.status) return b.status;
  if (b.verdict === "veto") return "vetoed";
  if (b.verdict === "keep") return "confirmed";
  return "pending";
}

/**
 * @param family 這一頁負責的批次家族（比對 `batch.family`／`batch.id` 的子字串）。
 *               ⭐ 一頁可以吃多個 —— 傳陣列。
 * @param title  顯示名（省略時用 family）。
 */
export function ReviewStrip(props: {
  family: string | readonly string[];
  title?: string;
}): React.JSX.Element {
  const keys = (Array.isArray(props.family) ? props.family : [props.family]) as readonly string[];
  const [all, setAll] = useState<readonly Batch[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const r = await fetch("/__review/features", { headers: { accept: "application/json" } });
      if (!(r.headers.get("content-type") ?? "").includes("json")) {
        throw new Error(`/__review 沒掛（HTTP ${r.status}）—— 這一條是 dev-only`);
      }
      const j = (await r.json()) as { batches?: readonly Batch[]; error?: string };
      if (j.error) throw new Error(j.error);
      setAll(j.batches ?? []);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (b: Batch, verdict: "keep" | "veto"): Promise<void> => {
    let reason = "";
    if (verdict === "veto") {
      reason = (globalThis.prompt?.("否決原因（必填 —— 進帳本）") ?? "").trim();
      if (reason === "") return;
    }
    setBusy(b.id);
    try {
      const r = await fetch("/__review/feature-verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: b.id, hash: b.hash, verdict, reason }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await load();
    } catch (e) {
      setErr(`裁決寫不進帳本：${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const mine = (all ?? []).filter((b) => {
    const hay = `${b.family ?? ""} ${b.id}`.toLowerCase();
    return keys.some((k) => hay.includes(k.toLowerCase()));
  });
  const pending = mine.filter((b) => statusOf(b) === "pending");
  const flagged = mine.filter((b) => RED_FLAG.test(b.title ?? ""));

  const box: React.CSSProperties = {
    border: PANEL_BORDER,
    borderLeft: `4px solid ${flagged.length > 0 ? WARN : pending.length > 0 ? OK : TEXT_DIM}`,
    borderRadius: 8,
    padding: "10px 12px",
    marginBottom: 12,
    background: "#12161f",
  };

  if (err !== null) {
    return (
      <div style={box}>
        <b style={{ color: WARN }}>🧑‍⚖️ 批核區讀不到帳本</b>
        <div style={{ color: TEXT_DIM, fontSize: 12, marginTop: 4 }}>{err}</div>
      </div>
    );
  }

  return (
    <div style={box}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ color: TEXT_MAIN }}>🧑‍⚖️ 一頁批次後台驗收 —— {props.title ?? keys.join(" / ")}</b>
        {all === null ? (
          <span style={{ color: TEXT_DIM, fontSize: 12 }}>讀取中…</span>
        ) : (
          <span style={{ color: TEXT_DIM, fontSize: 12 }}>
            這一頁相關 <b style={{ color: TEXT_MAIN }}>{mine.length}</b> 批 · 待裁決{" "}
            <b style={{ color: pending.length > 0 ? OK : TEXT_DIM }}>{pending.length}</b>
            {flagged.length > 0 ? (
              <> · <b style={{ color: WARN }}>⚠️ 帶紅旗 {flagged.length}</b></>
            ) : null}
          </span>
        )}
        <a href="#" onClick={(e) => { e.preventDefault(); void load(); }} style={{ marginLeft: "auto", color: ACCENT, fontSize: 12 }}>
          重新讀取
        </a>
      </div>

      {all !== null && mine.length === 0 ? (
        <div style={{ color: TEXT_DIM, fontSize: 12, marginTop: 6 }}>
          這一頁**還沒有登記過批次**。上線一批成果之後用{" "}
          <code>pnpm review:register</code> 登記（⭐ 登記時必須寫得出 rollback 開關，
          寫不出來就代表那一批違反「留後台開關」的常設指令）。
        </div>
      ) : null}

      {mine.map((b) => {
        const st = statusOf(b);
        const frames = b.frames ?? [];
        const isOpen = open === b.id;
        return (
          <div key={b.id} style={{ marginTop: 8, paddingTop: 8, borderTop: PANEL_BORDER }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 5, background: "#1d2334",
                             color: st === "pending" ? OK : st === "vetoed" ? DANGER : ACCENT }}>
                {st === "pending" ? "已上線 · 待裁決" : st === "vetoed" ? "已否決" : "已確認"}
              </span>
              <span style={{ color: TEXT_MAIN, fontSize: 13 }}>{b.title ?? b.id}</span>
              {(b.issues ?? []).map((n) => (
                <a key={n} href={`https://github.com/adms/GGD/issues/${n}`} target="_blank" rel="noreferrer"
                   style={{ color: ACCENT, fontSize: 11.5 }}>#{n}</a>
              ))}
              <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                {frames.length > 0 ? (
                  <button onClick={() => setOpen(isOpen ? null : b.id)}
                          style={{ background: "transparent", color: ACCENT, border: PANEL_BORDER, borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontSize: 12 }}>
                    {isOpen ? "收起" : `圖 ${frames.length}`}
                  </button>
                ) : null}
                <button disabled={busy === b.id} onClick={() => void decide(b, "keep")}
                        style={{ background: "transparent", color: OK, border: `1px solid ${OK}`, borderRadius: 5, padding: "2px 10px", cursor: "pointer", fontSize: 12 }}>
                  ✅ 保留
                </button>
                <button disabled={busy === b.id} onClick={() => void decide(b, "veto")}
                        style={{ background: "transparent", color: DANGER, border: `1px solid ${DANGER}`, borderRadius: 5, padding: "2px 10px", cursor: "pointer", fontSize: 12 }}>
                  ⛔ 否決
                </button>
              </span>
            </div>
            {b.rollback ? (
              <div style={{ color: TEXT_DIM, fontSize: 11.5, marginTop: 3 }}>
                🔙 還原＝後台 <code style={{ color: GOLD }}>{b.rollback.configId}</code> 的{" "}
                <code style={{ color: GOLD }}>{b.rollback.field}</code> 改成{" "}
                <code>{JSON.stringify(b.rollback.rollbackValue)}</code>
              </div>
            ) : (
              <div style={{ color: WARN, fontSize: 11.5, marginTop: 3 }}>⚠️ 沒有登記 rollback 開關</div>
            )}
            {b.reason ? <div style={{ color: DANGER, fontSize: 11.5, marginTop: 3 }}>否決原因：{b.reason}</div> : null}
            {isOpen ? (
              <div style={{ marginTop: 8, display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                {frames.map((f) => (
                  <figure key={f.rel} style={{ margin: 0, minWidth: 220 }}>
                    <img src={`/__review/frame?p=${encodeURIComponent(f.rel)}`} alt={f.label ?? f.rel}
                         style={{ width: 220, borderRadius: 5, border: PANEL_BORDER, background: "#000", display: "block" }} />
                    <figcaption style={{ color: TEXT_DIM, fontSize: 11, marginTop: 3 }}>
                      {f.label ?? ""}{typeof f.bright === "number" ? ` · 亮 ${f.bright.toLocaleString()}` : ""}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
