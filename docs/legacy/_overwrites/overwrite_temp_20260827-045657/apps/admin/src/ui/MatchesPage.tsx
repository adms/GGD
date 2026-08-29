/** Matches — settled-match history table with an optional account filter and a
 * detail drawer.
 *
 * #793 —— 詳情抽屜的「Map」那一格在此之前是**裸 id**（`arena.godie`）。
 * owner 2026-08-27:「給人看的話不能只有ID 還要有名稱」—— 那句話不限於排行榜，
 * 所以這裡重用 #786 的 `contentNames`（⛔ 不寫第二份 join）。
 */
import { useEffect, useState } from "react";
import * as apiFns from "../api";
import { ApiError } from "../session";
import type { MatchRecord } from "../types";
import { fetchNameIndex, nameLabelFor, type NameIndex } from "../contentNames";
import { Btn, ErrorBanner, Panel, TextInput } from "./widgets";
import { GOLD, TEXT_DIM, TEXT_MAIN } from "./theme";

export function MatchesPage(): React.JSX.Element {
  const [accountId, setAccountId] = useState("");
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MatchRecord | null>(null);
  const pageSize = 20;

  async function load(p = 1): Promise<void> {
    setError(null);
    try {
      const res = await apiFns.listMatches(accountId.trim(), p, pageSize);
      setMatches(res.matches);
      setTotal(res.total);
      setPage(p);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "load failed");
    }
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 340px" : "1fr", gap: 16 }}>
      <Panel
        title={`Matches · ${total}`}
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ width: 240 }}>
              <TextInput value={accountId} onChange={setAccountId} placeholder="filter by account id (optional)" onEnter={() => void load(1)} />
            </div>
            <Btn kind="primary" small onClick={() => void load(1)}>
              Filter
            </Btn>
          </div>
        }
      >
        <ErrorBanner text={error} onDismiss={() => setError(null)} />
        {matches.length === 0 ? (
          <div style={{ color: TEXT_DIM, fontSize: 12, marginTop: 10 }}>
            No match records yet — settle a match (bots are fine) and it will appear here.
          </div>
        ) : (
          <div style={{ overflowX: "auto", marginTop: error ? 10 : 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: TEXT_DIM, textAlign: "left" }}>
                  <th style={th}>Match</th>
                  <th style={th}>Mode</th>
                  <th style={th}>Status</th>
                  <th style={th}>Seats</th>
                  <th style={th}>Ended</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => (
                  <tr key={m.matchId} style={{ borderTop: "1px solid #232c40", cursor: "pointer" }} onClick={() => setSelected(m)}>
                    <td style={{ ...td, fontFamily: "monospace" }}>{m.matchId.slice(0, 12)}…</td>
                    <td style={td}>{m.mode}</td>
                    <td style={td}>{m.status}</td>
                    <td style={td}>{m.seats?.length ?? 0}</td>
                    <td style={{ ...td, color: TEXT_DIM }}>{fmt(m.endedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, color: TEXT_DIM, fontSize: 12 }}>
          <Btn small disabled={page <= 1} onClick={() => void load(page - 1)}>
            ← Prev
          </Btn>
          <span>
            Page {page} / {maxPage}
          </span>
          <Btn small disabled={page >= maxPage} onClick={() => void load(page + 1)}>
            Next →
          </Btn>
        </div>
      </Panel>

      {selected && (
        <Panel title="Match detail" right={<Btn small onClick={() => setSelected(null)}>Close</Btn>} style={{ height: "fit-content" }}>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: TEXT_MAIN, wordBreak: "break-all", marginBottom: 10 }}>
            {selected.matchId}
          </div>
          <Row k="Mode" v={selected.mode} />
          <Row k="Status" v={selected.status} />
          <Row k="Map" v={selected.mapId ?? "—"} />
          <Row k="Ended" v={fmt(selected.endedAt)} />
          <div style={{ fontSize: 11, color: TEXT_DIM, margin: "12px 0 6px" }}>Placements</div>
          {(selected.placements ?? []).map((p) => (
            <Row key={p.team} k={`Team ${p.team}`} v={`#${p.place}`} />
          ))}
          <div style={{ fontSize: 11, color: TEXT_DIM, margin: "12px 0 6px" }}>Seats</div>
          {(selected.seats ?? []).map((s, i) => (
            <div key={i} style={{ fontSize: 11, color: TEXT_MAIN, padding: "2px 0" }}>
              <span style={{ color: GOLD }}>T{s.team}</span> {s.isBot ? "🤖 bot" : s.accountId}
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
}

function Row(props: { k: string; v: string }): React.JSX.Element {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
      <span style={{ color: TEXT_DIM }}>{props.k}</span>
      <span style={{ color: TEXT_MAIN }}>{props.v}</span>
    </div>
  );
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "8px 8px", color: TEXT_MAIN };
