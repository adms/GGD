/**
 * 🧭 GGD 平行處理盤（GH#775 的一頁）—— 批次／票的看板。
 *
 * owner 2026-08-26（逐字）：
 * > 「這些後台頁面的內容都要 **script 實時動態產生**，**不是靜態內容**喔」
 *
 * ⇒ 這一頁 mount 時 fetch `/__live/parallel-board`（tools/admin-live/datasets/parallel-board.mjs
 *   當場算），⛔ 零 build-time import、⛔ 零資料抄進 tsx。dev-only（/__live 只掛在 vite serve）。
 *
 * 三塊：① open 票按優先級 tag 分欄（gh best-effort；離線時錯誤可見、其餘照畫）
 *       ② 今天的裁決流水 ＋ 逐訊息對票（docs/_daily 的逐則對票表）
 *       ③ session 任務帳本（docs/_task-ledger.json，產生器產物）
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, TextInput } from "../widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "../theme";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

interface OpenTicket {
  number: number;
  priority: string;
  types: string[];
  title: string;
  updatedAt: string;
  mentions: number;
  lastMention: string | null;
}
interface DailyRow {
  date: string;
  time: string;
  quote: string;
  tickets: number[];
  note: string;
}
interface SessionTask {
  id: number;
  subject: string;
  status: "completed" | "in_progress" | "pending";
}
interface BoardData {
  tickets: {
    ghAvailable: boolean;
    ghError: string | null;
    note: string;
    open: OpenTicket[];
    priorityCounts: Record<string, number>;
  };
  sessionTasks: {
    ok: boolean;
    error: string | null;
    generated: string | null;
    source: string | null;
    counts: Record<string, number>;
    tasks: SessionTask[];
  };
  daily: { files: number; rowCount: number; latestDate: string | null; rows: DailyRow[] };
  _live?: { computedAt: string; ms: number };
}

const PRIORITY_ORDER = ["緊急", "重要", "優先", "一般", "未標"] as const;
const PRIORITY_COLOR: Record<string, string> = {
  緊急: DANGER,
  重要: GOLD,
  優先: ACCENT,
  一般: TEXT_DIM,
  未標: TEXT_DIM,
};

function Th(props: { children: React.ReactNode; align?: "left" | "right" }): React.JSX.Element {
  return (
    <th
      style={{
        padding: "6px 10px",
        textAlign: props.align ?? "left",
        fontSize: 12,
        color: TEXT_DIM,
        borderBottom: PANEL_BORDER,
        whiteSpace: "nowrap",
      }}
    >
      {props.children}
    </th>
  );
}

function Td(props: {
  children: React.ReactNode;
  align?: "left" | "right";
  mono?: boolean;
  color?: string;
  nowrap?: boolean;
}): React.JSX.Element {
  return (
    <td
      style={{
        padding: "6px 10px",
        borderTop: PANEL_BORDER,
        fontSize: 13,
        textAlign: props.align ?? "left",
        fontFamily: props.mono ? MONO : undefined,
        color: props.color ?? TEXT_MAIN,
        whiteSpace: props.nowrap ? "nowrap" : undefined,
      }}
    >
      {props.children}
    </td>
  );
}

function TicketChips(props: { tickets: number[]; note: string }): React.JSX.Element {
  if (props.tickets.length === 0)
    return (
      <span style={{ color: TEXT_DIM, fontSize: 12 }} title={props.note}>
        {props.note || "—"}
      </span>
    );
  return (
    <span title={props.note}>
      {props.tickets.map((n) => (
        <code
          key={n}
          style={{
            fontFamily: MONO,
            color: ACCENT,
            marginRight: 6,
            fontSize: 12,
          }}
        >
          #{n}
        </code>
      ))}
    </span>
  );
}

/** 🧭 平行處理盤（fetch /__live/parallel-board，⛔ 無 build-time 資料）。 */
export function ParallelBoardPage(): React.JSX.Element {
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticketQ, setTicketQ] = useState("");
  const [msgQ, setMsgQ] = useState("");
  const [taskQ, setTaskQ] = useState("");
  const [reloadAt, setReloadAt] = useState(0);

  useEffect(() => {
    let dead = false;
    setError(null);
    fetch("/__live/parallel-board")
      .then(async (res) => {
        const body = (await res.json()) as BoardData & { error?: string };
        if (dead) return;
        if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`);
        setData(body);
      })
      .catch((e: unknown) => {
        if (!dead) setError(String(e));
      });
    return () => {
      dead = true;
    };
  }, [reloadAt]);

  const openFiltered = useMemo(() => {
    if (!data) return [];
    const needle = ticketQ.trim().toLowerCase();
    if (needle === "") return data.tickets.open;
    return data.tickets.open.filter((t) =>
      `#${t.number} ${t.priority} ${t.types.join(" ")} ${t.title}`.toLowerCase().includes(needle),
    );
  }, [data, ticketQ]);

  const msgFiltered = useMemo(() => {
    if (!data) return [];
    const needle = msgQ.trim().toLowerCase();
    if (needle === "") return data.daily.rows;
    return data.daily.rows.filter((r) =>
      `${r.date} ${r.time} ${r.quote} ${r.note} ${r.tickets.map((n) => `#${n}`).join(" ")}`
        .toLowerCase()
        .includes(needle),
    );
  }, [data, msgQ]);

  const openTasks = useMemo(() => {
    if (!data) return [];
    const needle = taskQ.trim().toLowerCase();
    const live = data.sessionTasks.tasks.filter((t) => t.status !== "completed");
    if (needle === "") return live;
    return live.filter((t) => `${t.id} ${t.subject} ${t.status}`.toLowerCase().includes(needle));
  }, [data, taskQ]);

  if (error !== null)
    return (
      <Panel title="🧭 平行處理盤">
        <div style={{ color: DANGER, fontSize: 13, lineHeight: 1.6 }}>
          ⛔ /__live/parallel-board 取不到：<code style={{ fontFamily: MONO }}>{error}</code>
          <div style={{ color: TEXT_DIM, marginTop: 8 }}>
            這一頁是 dev-only（/__live 只掛在 vite dev server）。
            <button style={{ marginLeft: 8 }} onClick={() => setReloadAt(Date.now())}>
              重試
            </button>
          </div>
        </div>
      </Panel>
    );
  if (data === null)
    return (
      <Panel title="🧭 平行處理盤">
        <div style={{ color: TEXT_DIM, fontSize: 13 }}>計算中…（gh 查詢最多等 8 秒）</div>
      </Panel>
    );

  const todayRows = data.daily.rows.filter((r) => r.date === data.daily.latestDate);
  const st = data.sessionTasks;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1280 }}>
      {/* ① open 票 · 按優先級 tag 分欄 */}
      <Panel
        title={`🎫 open 票 · 按優先級分欄（${data.tickets.ghAvailable ? `共 ${data.tickets.open.length} 張` : "gh 取不到"}）`}
        right={
          <span style={{ fontSize: 12, color: TEXT_DIM }}>
            {PRIORITY_ORDER.map((p) => `${p} ${data.tickets.priorityCounts[p] ?? 0}`).join(" · ")}
          </span>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {!data.tickets.ghAvailable && (
            <div style={{ color: WARN, fontSize: 13 }}>
              ⚠️ gh 不可用（{data.tickets.ghError}）—— open 票這一欄畫不出來；
              下面的逐訊息對票與任務帳本不受影響。
            </div>
          )}
          <div style={{ fontSize: 12, color: TEXT_DIM }}>{data.tickets.note}</div>
          <TextInput value={ticketQ} onChange={setTicketQ} placeholder="過濾：#票號 / 標題 / tag…" />
          <div style={{ display: "flex", gap: 10, overflowX: "auto", alignItems: "flex-start" }}>
            {PRIORITY_ORDER.map((p) => {
              const col = openFiltered.filter((t) => t.priority === p);
              return (
                <div
                  key={p}
                  style={{
                    flex: "1 0 220px",
                    minWidth: 220,
                    border: PANEL_BORDER,
                    borderRadius: 8,
                    padding: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: "bold",
                      color: PRIORITY_COLOR[p],
                      marginBottom: 6,
                    }}
                  >
                    [{p}]（{col.length}）
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflowY: "auto" }}>
                    {col.map((t) => (
                      <div key={t.number} style={{ fontSize: 12, lineHeight: 1.5 }}>
                        <code style={{ fontFamily: MONO, color: ACCENT }}>#{t.number}</code>{" "}
                        {t.types.map((ty) => (
                          <span key={ty} style={{ color: TEXT_DIM, marginRight: 4 }}>
                            [{ty}]
                          </span>
                        ))}
                        <span style={{ color: TEXT_MAIN }}>{t.title}</span>
                        <div style={{ color: TEXT_DIM, fontSize: 11 }}>
                          更新 {t.updatedAt}
                          {t.mentions > 0 && (
                            <span style={{ color: GOLD }}>
                              {" "}
                              · 帳本提及 {t.mentions} 次（最近 {t.lastMention}）
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {col.length === 0 && <div style={{ color: TEXT_DIM, fontSize: 12 }}>—</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      {/* ② 今天的裁決流水 */}
      <Panel title={`📜 今天的裁決流水（${data.daily.latestDate ?? "—"} · ${todayRows.length} 則）`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {todayRows.length === 0 && (
            <div style={{ color: TEXT_DIM, fontSize: 13 }}>docs/_daily 裡還沒有今天的逐則對票表。</div>
          )}
          {todayRows.map((r, i) => (
            <div key={`${r.time}-${i}`} style={{ display: "flex", gap: 10, fontSize: 13, lineHeight: 1.6 }}>
              <code style={{ fontFamily: MONO, color: TEXT_DIM, whiteSpace: "nowrap" }}>{r.time}</code>
              <div style={{ flex: 1 }}>
                <span style={{ color: TEXT_MAIN }}>{r.quote}</span>
                <div>
                  <TicketChips tickets={r.tickets} note={r.note} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* ③ 逐訊息對票（全期間） */}
      <Panel title={`🧾 逐訊息對票（${data.daily.files} 天帳本 · 共 ${data.daily.rowCount} 則）`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: TEXT_DIM }}>
            來源：docs/_daily/&lt;日期&gt;.md 的逐則對票表（scripts/message-ledger.sh 維護；
            引言是截斷過的，全文在 ledger-source_temp_*.md）。
          </div>
          <TextInput value={msgQ} onChange={setMsgQ} placeholder="過濾：日期 / #票號 / 關鍵字…" />
          <div style={{ overflowX: "auto", maxHeight: 480, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr>
                  <Th>日期</Th>
                  <Th>時間</Th>
                  <Th>owner 說了什麼（逐字 · 截斷）</Th>
                  <Th>票</Th>
                </tr>
              </thead>
              <tbody>
                {msgFiltered.map((r, i) => (
                  <tr key={`${r.date}-${r.time}-${i}`}>
                    <Td mono color={TEXT_DIM} nowrap>
                      {r.date}
                    </Td>
                    <Td mono color={TEXT_DIM} nowrap>
                      {r.time}
                    </Td>
                    <Td>{r.quote}</Td>
                    <Td nowrap>
                      <TicketChips tickets={r.tickets} note={r.note} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      {/* ④ session 任務帳本 */}
      <Panel
        title={`🗂 session 任務帳本（進行中 ${st.counts.in_progress ?? 0} · 待辦 ${st.counts.pending ?? 0} · 已完成 ${st.counts.completed ?? 0}）`}
        right={
          <span style={{ fontSize: 12, color: TEXT_DIM }}>
            快照時間 {st.generated ?? "—"}
          </span>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {!st.ok && (
            <div style={{ color: WARN, fontSize: 13 }}>⚠️ docs/_task-ledger.json 讀不到：{st.error}</div>
          )}
          <div style={{ fontSize: 12, color: TEXT_DIM }}>
            來源：docs/_task-ledger.json（tools/status/gen_status.py 的產物；已完成的只計數不列）。
          </div>
          <TextInput value={taskQ} onChange={setTaskQ} placeholder="過濾：任務 id / 標題…" />
          <div style={{ overflowX: "auto", maxHeight: 360, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead>
                <tr>
                  <Th>id</Th>
                  <Th>狀態</Th>
                  <Th>任務</Th>
                </tr>
              </thead>
              <tbody>
                {openTasks.map((t) => (
                  <tr key={t.id}>
                    <Td mono color={TEXT_DIM}>
                      {t.id}
                    </Td>
                    <Td nowrap color={t.status === "in_progress" ? OK : TEXT_DIM}>
                      {t.status === "in_progress" ? "🔄 進行中" : "⏳ 待辦"}
                    </Td>
                    <Td>{t.subject}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      {/* 頁角：這一頁是幾點幾分算的 */}
      <div style={{ fontSize: 12, color: TEXT_DIM }}>
        ⏱ 這一頁由 /__live/parallel-board 當場算：computedAt{" "}
        <code style={{ fontFamily: MONO }}>{data._live?.computedAt ?? "—"}</code> · 耗時{" "}
        <code style={{ fontFamily: MONO }}>{data._live?.ms ?? "—"} ms</code>
        <button style={{ marginLeft: 10 }} onClick={() => setReloadAt(Date.now())}>
          重新計算
        </button>
      </div>
    </div>
  );
}
