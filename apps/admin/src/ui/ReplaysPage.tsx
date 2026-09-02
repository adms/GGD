/**
 * 對戰回放 (task #175) — the owner's playtest feedback channel. He chose exactly
 * one way to get feedback from his family: 「用回放重播的方式即可」. This is where
 * he FINDS the match a family member mentioned — a list newest-first showing
 * when, who played, how many rounds, how long, and the result — and opens it in
 * the reused game renderer with one click.
 *
 * The list is proxied through the platform admin API (recordings carry player
 * names, so they stay behind admin auth); 觀看 mints a short-lived view ticket
 * and opens the client's replay viewer.
 */
import { useEffect, useMemo, useState } from "react";
import * as replayApi from "../replays";
import {
  fmtBytes,
  fmtDuration,
  fmtRetention,
  type ReplaySummary,
  type ReplayIdentity,
  type ReplayStorage,
} from "../replays";
import { resolveReplayClientBase, type ReplayClientBase } from "../config";
import { ApiError } from "../session";
import { Btn, ErrorBanner, Panel } from "./widgets";
import { GOLD, TEXT_DIM, TEXT_MAIN } from "./theme";

const TEAM_LABEL = ["紅", "藍", "綠", "黃"];

/**
 * GH#496 —— 「觀看」要開哪個網址，以及**它是不是不可能通**。
 *
 * ⚠️ 在此之前這裡是 `resolveHubLinks(env)`（少了 mode 參數）→ 永遠拿 dev preset
 * → 正式站上也給 `http://localhost:39527`，而 `?? "http://localhost:39527"`
 * 那個 fallback 是死碼、只是讓兩種狀態長得一模一樣。判斷與警告文字整段住在
 * `config.ts`（純函式、node 下跑得動、有守衛），這裡只負責把它畫出來。
 */
function replayClientBase(): ReplayClientBase {
  // ⚠️ `PROD` is a BOOLEAN on import.meta.env while every VITE_* is a string, so
  // the bag is read as `unknown` here and narrowed once. Typing it as
  // `Record<string, string | undefined>` (what this file used to do) makes
  // `env.PROD === true` a type error — and the tempting "fix" of dropping the
  // check is exactly the bug #496 is about.
  const env = ((import.meta as { env?: Record<string, unknown> }).env ?? {}) as Record<string, unknown>;
  const href = typeof window !== "undefined" ? window.location.href : "http://localhost/";
  const isProd = env.PROD === true || env.PROD === "true";
  const strings: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) if (typeof v === "string") strings[k] = v;
  return resolveReplayClientBase(strings, isProd, href);
}

export function ReplaysPage(): React.JSX.Element {
  const [rows, setRows] = useState<ReplaySummary[]>([]);
  const [identity, setIdentity] = useState<ReplayIdentity | null>(null);
  const [storage, setStorage] = useState<ReplayStorage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const clientBase = useMemo(() => replayClientBase(), []);

  async function load(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      const res = await replayApi.listReplays();
      setRows(res.replays);
      setIdentity(res.identity);
      setStorage(res.storage ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "無法讀取回放列表（遊戲伺服器可能未啟動）");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function watch(row: ReplaySummary): Promise<void> {
    setBusy(row.id);
    setError(null);
    try {
      const t = await replayApi.mintReplayTicket(row.id);
      const url = replayApi.replayWatchUrl(clientBase.url, row.id, t.ticket);
      window.open(url, "_blank", "noopener");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "無法產生觀看連結");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel
      title={`對戰回放 · ${rows.length}`}
      right={
        <Btn small onClick={() => void load()}>
          重新整理
        </Btn>
      }
    >
      <ErrorBanner text={error} onDismiss={() => setError(null)} />
      {/*
        GH#496 的 fail-loud。⛔ 這**不是** ErrorBanner（那個可以按叉關掉，而這個
        狀態不會因為關掉就消失），也⛔ 不是 console.warn（沒有人會讀）。它就長在
        「觀看」按鈕上面，說出點下去會發生什麼、以及那個網址是什麼。
      */}
      {clientBase.warning && (
        <div
          role="alert"
          style={{
            margin: "8px 0 10px",
            padding: "8px 10px",
            border: "1px solid #e5483f",
            borderRadius: 4,
            background: "rgba(229,72,63,.10)",
            color: "#ff8b83",
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          ⚠️ 回放連結不可用：{clientBase.warning}
          <div style={{ color: TEXT_DIM, marginTop: 4 }}>
            目前會開啟：<code style={{ color: "#ff8b83" }}>{clientBase.url}</code>
          </div>
        </div>
      )}
      {storage && <StorageLine s={storage} />}
      {identity && (
        <div style={{ fontSize: 11, color: TEXT_DIM, margin: "6px 0 10px" }}>
          目前伺服器內容版本 <code style={{ color: GOLD }}>{identity.contentVersion || "(未載入)"}</code> ·
          建置 <code>{identity.buildStamp}</code>
          {identity.buildStamp === "dev" ? (
            // ⛔⛔ GH#949 —— 這句話在此之前逐字寫著「其餘會被明確拒絕」，
            // ⭐ 而正式站上每一份錄影的建置編號都是 `"dev"` ⇒ **什麼都不會被拒絕**。
            // 第一·五守則：卡面上不可以有說了不會發生的字。
            <>
              　—　⚠️ 這台<strong>沒有建置編號</strong>（見 /healthz 的{" "}
              <code>build.stamped</code>）⇒ ⛔ 版本柵欄目前是<strong>關著的</strong>，
              舊版錄的回放不會被擋下來。
            </>
          ) : (
            <>　—　只有相同版本錄製的回放能重播，其餘會被明確拒絕。</>
          )}
        </div>
      )}
      {loading ? (
        <div style={{ color: TEXT_DIM, fontSize: 12, marginTop: 10 }}>載入中…</div>
      ) : rows.length === 0 ? (
        <div style={{ color: TEXT_DIM, fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>
          還沒有任何回放。開一場對戰（純電腦也可以）打到結束，這裡就會出現——
          之後家人說「第三回合怪怪的」，你就從這裡把那場點開來看。
        </div>
      ) : (
        <div style={{ overflowX: "auto", marginTop: 4 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: TEXT_DIM, textAlign: "left" }}>
                <Th>時間</Th>
                <Th>玩家</Th>
                <Th>回合</Th>
                <Th>時長</Th>
                <Th>勝方</Th>
                <Th>大小</Th>
                <Th>狀態</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const humans = r.players.filter((p) => !p.isBot);
                const names = (humans.length > 0 ? humans : r.players).slice(0, 6).map((p) => p.displayName);
                return (
                  <tr key={r.id} style={{ borderTop: "1px solid rgba(120,140,190,.18)", color: TEXT_MAIN }}>
                    <Td>{new Date(r.startedAt).toLocaleString("zh-TW", { hour12: false })}</Td>
                    <Td>
                      <span title={r.players.map((p) => `${p.displayName}${p.isBot ? "(電腦)" : ""}`).join(", ")}>
                        {names.join("、")}
                        {names.length < r.players.length ? ` +${r.players.length - names.length}` : ""}
                      </span>
                    </Td>
                    <Td>{r.rounds || "—"}</Td>
                    <Td>{fmtDuration(r.durationSec)}</Td>
                    <Td>{r.winnerTeamId === null ? "—" : `${TEAM_LABEL[r.winnerTeamId] ?? r.winnerTeamId}隊`}</Td>
                    <Td>{fmtBytes(r.bytes)}</Td>
                    <Td>
                      {r.complete ? (
                        <span style={{ color: "#47cc6a" }}>完成</span>
                      ) : (
                        <span style={{ color: "#e0a13a" }} title="伺服器中途結束，回放到最後一幀為止仍可看">
                          未完成
                        </span>
                      )}
                      {r.faultCount > 0 && <span style={{ color: "#e5483f", marginLeft: 6 }}>⚠{r.faultCount}</span>}
                    </Td>
                    <Td>
                      <Btn small kind="primary" onClick={() => void watch(r)} disabled={busy === r.id}>
                        {busy === r.id ? "…" : "觀看"}
                      </Btn>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/**
 * GH#498 —— 錄影佔了多少碟，那顆碟還剩多少。
 *
 * ⚠️ 這一行是「預設不刪除」唯一的煞車。owner 2026-08-21 要的是不刪，而不刪 =
 * 無限成長；正式機的 docker data-root 和 `data/replays` 在**同一顆碟**
 * （2026-08-16 那次 80GB build cache 把碟塞爆 → 網站 502）。所以剩餘空間要和
 * 佔用量印在一起 —— ⛔ 只印「錄影佔 40 MB」是一個只驗名詞的儀表，它在磁碟快滿
 * 的那一天仍然是綠的。
 *
 * 剩餘低於 10% 時整行轉紅。⭐ 那個門檻**刻意不做成後台欄位**：它是一個顯示上的
 * 提醒，不是一個會改變任何比賽結果的決策；真正的決策（要留多久、留幾份）已經
 * 在「對戰錄影」那一頁各有一格。
 */
function StorageLine({ s }: { s: ReplayStorage }): React.JSX.Element {
  const pctFree = s.freeBytes !== null && s.totalBytes ? s.freeBytes / s.totalBytes : null;
  const low = pctFree !== null && pctFree < 0.1;
  return (
    <div
      style={{
        fontSize: 11,
        color: low ? "#ff8b83" : TEXT_DIM,
        margin: "6px 0 10px",
        lineHeight: 1.7,
        borderLeft: `2px solid ${low ? "#e5483f" : "rgba(120,140,190,.35)"}`,
        paddingLeft: 8,
      }}
    >
      錄影佔用 <b style={{ color: low ? "#ff8b83" : GOLD }}>{fmtBytes(s.bytes)}</b>（{s.files} 份）·{" "}
      保留規則 <b style={{ color: low ? "#ff8b83" : TEXT_MAIN }}>{fmtRetention(s.retainMaxFiles, s.retainMaxAgeDays)}</b>
      {s.freeBytes === null ? (
        <> · 磁碟剩餘 <span title="這個檔案系統不回答 statfs">(量不到)</span></>
      ) : (
        <>
          {" "}
          · 磁碟剩餘 <b style={{ color: low ? "#ff8b83" : TEXT_MAIN }}>{fmtBytes(s.freeBytes)}</b>
          {s.totalBytes ? ` / ${fmtBytes(s.totalBytes)}` : ""}
        </>
      )}
      <div style={{ color: low ? "#ff8b83" : TEXT_DIM, marginTop: 2 }}>
        {s.retainMaxFiles === 0 && s.retainMaxAgeDays === 0
          ? "⚠️ 目前設定是「永不刪除」（owner 的裁決），所以這個數字只會往上長。"
          : "超過保留規則的錄影會在每場結束後自動刪除。"}
        {low && " ⛔ 這顆碟也是 docker 的家 —— 塞爆會讓整個網站掛掉，請到「對戰錄影」那一頁設一個保留量。"}
        <code style={{ marginLeft: 6, color: TEXT_DIM }}>{s.dir}</code>
      </div>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }): React.JSX.Element {
  return <th style={{ padding: "6px 10px", fontWeight: 600 }}>{children}</th>;
}
function Td({ children }: { children?: React.ReactNode }): React.JSX.Element {
  return <td style={{ padding: "7px 10px", verticalAlign: "top" }}>{children}</td>;
}
