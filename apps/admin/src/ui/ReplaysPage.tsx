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
import { useEffect, useState } from "react";
import * as replayApi from "../replays";
import { fmtBytes, fmtDuration, type ReplaySummary, type ReplayIdentity } from "../replays";
import { resolveHubLinks } from "../config";
import { ApiError } from "../session";
import { Btn, ErrorBanner, Panel } from "./widgets";
import { GOLD, TEXT_DIM, TEXT_MAIN } from "./theme";

const TEAM_LABEL = ["紅", "藍", "綠", "黃"];

function clientBaseUrl(): string {
  const links = resolveHubLinks((import.meta as { env?: Record<string, string | undefined> }).env ?? {});
  return links.find((l) => l.key === "client")?.url ?? "http://localhost:39527";
}

export function ReplaysPage(): React.JSX.Element {
  const [rows, setRows] = useState<ReplaySummary[]>([]);
  const [identity, setIdentity] = useState<ReplayIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      const res = await replayApi.listReplays();
      setRows(res.replays);
      setIdentity(res.identity);
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
      const url = replayApi.replayWatchUrl(clientBaseUrl(), row.id, t.ticket);
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
      {identity && (
        <div style={{ fontSize: 11, color: TEXT_DIM, margin: "6px 0 10px" }}>
          目前伺服器內容版本 <code style={{ color: GOLD }}>{identity.contentVersion || "(未載入)"}</code> ·
          建置 <code>{identity.buildStamp}</code>　—　只有相同版本錄製的回放能重播，其餘會被明確拒絕。
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

function Th({ children }: { children?: React.ReactNode }): React.JSX.Element {
  return <th style={{ padding: "6px 10px", fontWeight: 600 }}>{children}</th>;
}
function Td({ children }: { children?: React.ReactNode }): React.JSX.Element {
  return <td style={{ padding: "7px 10px", verticalAlign: "top" }}>{children}</td>;
}
