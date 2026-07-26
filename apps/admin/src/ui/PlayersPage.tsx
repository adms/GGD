/**
 * Players — search table with ban/unban, M COIN adjust, MMR set and a detail
 * drawer. Destructive actions confirm first; API-envelope errors surface.
 *
 * #126: this table also carries APPROVAL state, and that is not decoration.
 * The approval backend shipped complete while `AccountRow` had no `status`
 * field, so a relative sitting in the pending queue was invisible on the one
 * page an operator actually opens to look at people. A dedicated 帳號審核 page
 * alone would repeat that mistake for anyone who never clicks it — so the
 * status column, the 待審核 filter, the queue banner and a one-tap 通過 all
 * live here too. The badges come from ../approvals.ts through the shared
 * AccountStateBadges, so this list and the queue page cannot disagree.
 */
import { useEffect, useRef, useState } from "react";
import * as apiFns from "../api";
import { ApiError } from "../session";
import { filterAccounts, seenState, winRate, type SeenTone } from "../players";
import {
  DENY_VS_BAN,
  STATUS_FILTERS,
  approvalState,
  canApprove,
  canDeny,
  pendingBannerText,
  stateBadge,
} from "../approvals";
import { useApp } from "../store";
import type { AccountRow, Profile } from "../types";
import { AccountStateBadges, DenyAccountDialog } from "./ApprovalsPage";
import { Badge, Btn, ConfirmDialog, ErrorBanner, Panel, TextInput } from "./widgets";
import { ACCENT, GOLD, OK, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";

/**
 * #246 上線燈號 — how often the table re-reads itself.
 *
 * A liveness light frozen at page-load time is WORSE than no light: it looks
 * authoritative while quietly ageing, and no tooltip can rescue that. Before
 * this, `search()` only ran on mount and after a mutation. 30s is well under the
 * light's own 60s write granularity, so the displayed answer is never more than
 * one coalescing window behind the truth.
 */
const SEEN_REFRESH_MS = 30_000;

/** Dot colours, brightest = a live socket. */
const SEEN_DOT: Record<SeenTone, { fill: string; ring: string }> = {
  live: { fill: OK, ring: OK },
  active: { fill: ACCENT, ring: "transparent" },
  dim: { fill: "#3c4460", ring: "transparent" },
  off: { fill: "transparent", ring: "#3c4460" },
};

export function PlayersPage(): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [confirmBan, setConfirmBan] = useState<AccountRow | null>(null);
  const [confirmDeny, setConfirmDeny] = useState<AccountRow | null>(null);
  const navigate = useApp((s) => s.navigate);
  const pendingCount = useApp((s) => s.pendingCount);
  const refreshPendingCount = useApp((s) => s.refreshPendingCount);

  const [seenAsOf, setSeenAsOf] = useState(() => Date.now());

  const pageSize = 20;

  /**
   * What the CURRENT listing is (as opposed to what is typed in the box).
   * The background refresh reads this ref rather than closing over state, so
   * one interval installed on mount always re-runs the query actually on
   * screen — including after paging or switching the status filter.
   */
  const shown = useRef({ query: "", page: 1, status: "" });

  async function search(p = 1, st = status): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFns.searchAccounts(query, p, pageSize, st);
      shown.current = { query, page: p, status: st };
      setRows(res.accounts);
      setTotal(res.total);
      setPage(p);
      setStatus(st);
      setSeenAsOf(Date.now());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "search failed");
    } finally {
      setLoading(false);
    }
    void refreshPendingCount();
  }

  /**
   * The background re-read behind the online light. Deliberately quieter than
   * `search`: it never shows the spinner (the table must not flicker every 30s)
   * and it never raises the error banner, because a transient blip on a poll the
   * operator did not ask for is not worth interrupting them — the 「資料時間」
   * stamp simply stops advancing, which is the honest signal.
   */
  async function refreshSeen(): Promise<void> {
    const at = shown.current;
    try {
      const res = await apiFns.searchAccounts(at.query, at.page, pageSize, at.status);
      setRows(res.accounts);
      setTotal(res.total);
      setSeenAsOf(Date.now());
    } catch {
      /* keep the last good page and the last good timestamp */
    }
  }

  /** Approve or decline straight from the list — the owner is already here. */
  async function decide(row: AccountRow, approve: boolean, reason: string): Promise<void> {
    try {
      if (approve) await apiFns.approveAccount(row.id, reason);
      else await apiFns.denyAccount(row.id, reason);
      setConfirmDeny(null);
      await search(page);
      if (selected?.account.id === row.id) await refreshSelected(row.id);
    } catch (err) {
      setConfirmDeny(null);
      setError(
        err instanceof ApiError
          ? `${approve ? "放行" : "婉拒"} ${row.username} 失敗：${err.message}`
          : "approval failed",
      );
    }
  }

  useEffect(() => {
    void search(1);
    void refreshPendingCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the online light live. Skipped while the tab is hidden — an operator
  // who is not looking does not need the poll, and it is free to resume.
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refreshSeen();
    }, SEEN_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshSelected(id: string): Promise<void> {
    try {
      setSelected(await apiFns.getProfile(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "load failed");
    }
  }

  async function doBan(row: AccountRow, reason: string): Promise<void> {
    try {
      await apiFns.banAccount(row.id, reason);
      setConfirmBan(null);
      await search(page);
      if (selected?.account.id === row.id) await refreshSelected(row.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ban failed");
      setConfirmBan(null);
    }
  }

  async function doUnban(row: AccountRow): Promise<void> {
    try {
      await apiFns.unbanAccount(row.id);
      await search(page);
      if (selected?.account.id === row.id) await refreshSelected(row.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "unban failed");
    }
  }

  // client-side refinement over the current server page
  const visible = filterAccounts(rows, "");
  const maxPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 340px" : "1fr", gap: 16 }}>
      <Panel
        title={`Players · ${total}`}
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ width: 220 }}>
              <TextInput value={query} onChange={setQuery} placeholder="search username / email / id" onEnter={() => void search(1)} />
            </div>
            <Btn kind="primary" small onClick={() => void search(1)}>
              Search
            </Btn>
          </div>
        }
      >
        <ErrorBanner text={error} onDismiss={() => setError(null)} />

        {/*
          THE QUEUE BANNER. It is on the players page, not only on 帳號審核,
          because this is the page an operator opens when he wonders about a
          person — and a waiting relative he has not noticed is exactly the
          thing that must interrupt him here.
        */}
        {pendingCount > 0 && (
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              padding: "10px 12px",
              borderRadius: 8,
              background: "#1d1a11",
              border: `1px solid ${WARN}`,
              color: WARN,
              fontSize: 12.5,
              fontWeight: 700,
            }}
          >
            <span>⏳ {pendingBannerText(pendingCount)}</span>
            <span style={{ flex: 1 }} />
            <Btn small onClick={() => void search(1, "pending")}>
              只看待審核
            </Btn>
            <Btn small kind="primary" onClick={() => navigate("approvals")}>
              前往帳號審核 →
            </Btn>
          </div>
        )}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {STATUS_FILTERS.map((f) => (
            <Btn
              key={f.value || "all"}
              small
              kind={f.value === status ? "primary" : "ghost"}
              onClick={() => void search(1, f.value)}
            >
              {f.label}
            </Btn>
          ))}
        </div>

        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: TEXT_DIM, textAlign: "left" }}>
                <th style={th}>Username</th>
                <th style={th}>MMR</th>
                <th style={th}>Games</th>
                <th style={th}>Win%</th>
                <th style={th}>M COIN</th>
                <th style={th}>審核 / 狀態</th>
                <th style={th}>上線</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td style={td} colSpan={8}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && visible.length === 0 && (
                <tr>
                  <td style={{ ...td, color: TEXT_DIM }} colSpan={8}>
                    No players.
                  </td>
                </tr>
              )}
              {visible.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #232c40" }}>
                  <td style={td}>
                    <button
                      onClick={() => void refreshSelected(r.id)}
                      style={{ background: "none", border: "none", color: TEXT_MAIN, cursor: "pointer", fontWeight: 600, padding: 0 }}
                    >
                      {r.username}
                    </button>
                    {r.roles.includes("admin") && <span style={{ marginLeft: 6 }}><Badge color={GOLD}>admin</Badge></span>}
                  </td>
                  <td style={td}>{r.mmr}</td>
                  <td style={td}>{r.games}</td>
                  <td style={td}>{winRate(r)}</td>
                  <td style={{ ...td, color: GOLD }}>Ⓜ {r.mcoin.toLocaleString()}</td>
                  {/*
                    Approval AND ban, never folded into one word. They are
                    independent on the platform, and the old single
                    banned/active cell is precisely what hid 待審核.
                  */}
                  <td style={td}>
                    <AccountStateBadges row={r} />
                  </td>
                  {/*
                    #246 上線燈號. Deliberately NOT folded into AccountStateBadges:
                    that component is APPROVAL state, shared with the 帳號審核
                    queue, and liveness is a different question that must not
                    start looking like a moderation verdict.
                  */}
                  <td style={td}>
                    <SeenLight row={r} now={seenAsOf} />
                  </td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      {/* one tap, no confirm — the happy path, and reversible */}
                      {canApprove(r) && (
                        <Btn small kind="primary" onClick={() => void decide(r, true, "")}>
                          ✓ 通過
                        </Btn>
                      )}
                      {canDeny(r) && (
                        <Btn small onClick={() => setConfirmDeny(r)} title="婉拒註冊（不是停權）">
                          婉拒
                        </Btn>
                      )}
                      {r.banned ? (
                        <Btn small onClick={() => void doUnban(r)}>
                          解除停權
                        </Btn>
                      ) : (
                        <Btn small kind="danger" onClick={() => setConfirmBan(r)} title="違規停權（不是婉拒）">
                          停權
                        </Btn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/*
          THE HONEST CAVEAT, stated once instead of on every row's tooltip. The
          owner chose 「有做任何 session 連線動作都算」, which means a browser tab
          left open keeps someone lit. That is his call, but the light would be
          misread without it being written down somewhere he can see.
        */}
        <div style={{ marginTop: 10, fontSize: 11, color: TEXT_DIM, lineHeight: 1.9 }}>
          <span style={{ marginRight: 14, whiteSpace: "nowrap" }}>
            <Dot tone="live" /> 目前連線中（對戰中 / 大廳中）
          </span>
          <span style={{ marginRight: 14, whiteSpace: "nowrap" }}>
            <Dot tone="active" /> 1 小時內有動作
          </span>
          <span style={{ marginRight: 14, whiteSpace: "nowrap" }}>
            <Dot tone="dim" /> 超過 1 小時
          </span>
          <span style={{ whiteSpace: "nowrap" }}>
            <Dot tone="off" /> 沒有記錄
          </span>
          <br />
          任何連線動作都算，包含畫面自動更新——所以分頁一直開著的人會一直亮著。滑過燈號可以看最後動作時間。
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, color: TEXT_DIM, fontSize: 12 }}>
          <Btn small disabled={page <= 1} onClick={() => void search(page - 1)}>
            ← Prev
          </Btn>
          <span>
            Page {page} / {maxPage}
          </span>
          <Btn small disabled={page >= maxPage} onClick={() => void search(page + 1)}>
            Next →
          </Btn>
          <span style={{ flex: 1 }} />
          {/* The light is only as fresh as this stamp says it is. */}
          <span title="上線燈號每 30 秒自動更新一次">資料時間 {clockText(seenAsOf)}</span>
          <Btn small onClick={() => void refreshSeen()}>
            重新整理
          </Btn>
        </div>
      </Panel>

      {selected && (
        <PlayerDetail
          profile={selected}
          onClose={() => setSelected(null)}
          onChanged={() => {
            void refreshSelected(selected.account.id);
            void search(page);
          }}
          onApprove={() => void decide(selected.account, true, "")}
          onDeny={() => setConfirmDeny(selected.account)}
          onError={setError}
        />
      )}

      {confirmBan && (
        <BanDialog row={confirmBan} onCancel={() => setConfirmBan(null)} onConfirm={(reason) => void doBan(confirmBan, reason)} />
      )}

      {confirmDeny && (
        <DenyAccountDialog
          row={confirmDeny}
          onCancel={() => setConfirmDeny(null)}
          onConfirm={(reason) => void decide(confirmDeny, false, reason)}
        />
      )}
    </div>
  );
}

function BanDialog(props: { row: AccountRow; onCancel: () => void; onConfirm: (reason: string) => void }): React.JSX.Element {
  const [reason, setReason] = useState("");
  return (
    <ConfirmDialog
      title={`停權 ${props.row.username}？`}
      body={
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Named against 婉拒 explicitly — the two buttons sit side by side
              in this table and record different things in the audit log. */}
          <span style={{ lineHeight: 1.7 }}>
            <b style={{ color: TEXT_MAIN }}>這是違規停權，不是婉拒註冊。</b>
            {DENY_VS_BAN.ban.effect}
          </span>
          <TextInput value={reason} onChange={setReason} placeholder="理由（會顯示給玩家）" autoFocus />
        </div>
      }
      confirmLabel="停權"
      danger
      onCancel={props.onCancel}
      onConfirm={() => props.onConfirm(reason)}
    />
  );
}

function PlayerDetail(props: {
  profile: Profile;
  onClose: () => void;
  onChanged: () => void;
  onApprove: () => void;
  onDeny: () => void;
  onError: (msg: string) => void;
}): React.JSX.Element {
  const { profile } = props;
  const [mcoin, setMcoin] = useState("");
  const [mmr, setMmr] = useState(String(profile.account.mmr));
  const [reason, setReason] = useState("");

  async function grantMcoin(): Promise<void> {
    const delta = parseInt(mcoin, 10);
    if (!Number.isFinite(delta) || delta === 0) return;
    try {
      await apiFns.adjustMCoin(profile.account.id, delta, reason);
      setMcoin("");
      props.onChanged();
    } catch (err) {
      props.onError(err instanceof ApiError ? err.message : "grant failed");
    }
  }

  async function saveMmr(): Promise<void> {
    const v = parseInt(mmr, 10);
    if (!Number.isFinite(v)) return;
    try {
      await apiFns.setMMR(profile.account.id, v, reason);
      props.onChanged();
    } catch (err) {
      props.onError(err instanceof ApiError ? err.message : "mmr failed");
    }
  }

  return (
    <Panel title="Player detail" right={<Btn small onClick={props.onClose}>Close</Btn>} style={{ height: "fit-content" }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{profile.account.username}</div>
      <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 10 }}>{profile.account.email}</div>
      <Row k="ID" v={profile.account.id} mono />
      <Row k="MMR" v={String(profile.account.mmr)} />
      <Row k="Games / Wins" v={`${profile.account.games} / ${profile.account.wins}`} />
      <Row k="M COIN" v={`Ⓜ ${profile.wallet.mcoin.toLocaleString()}`} />
      <Row k="Champions" v={String(profile.wallet.ownedChampions.length)} />
      <Row k="Friends" v={String(profile.friendsCount)} />
      <Row k="Banned" v={profile.account.banned ? `yes — ${profile.account.banReason ?? ""}` : "no"} />
      {/* Same light as the list, so the drawer cannot disagree with the row. */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, padding: "3px 0" }}>
        <span style={{ color: TEXT_DIM }}>上線</span>
        <SeenLight row={profile.account} now={Date.now()} />
      </div>

      {/* 帳號審核 (#126) — the drawer is where an operator lands after clicking
          a name, so the approval decision has to be reachable from here too. */}
      <div style={{ height: 1, background: "#232c40", margin: "14px 0" }} />
      <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 6 }}>帳號審核狀態</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <AccountStateBadges row={profile.account} />
        <span style={{ flex: 1 }} />
        {canApprove(profile.account) && (
          <Btn small kind="primary" onClick={props.onApprove}>
            ✓ 通過
          </Btn>
        )}
        {canDeny(profile.account) && (
          <Btn small onClick={props.onDeny}>
            婉拒
          </Btn>
        )}
      </div>
      <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 6, lineHeight: 1.7 }}>
        {stateBadge(approvalState(profile.account)).hint}
      </div>

      <div style={{ height: 1, background: "#232c40", margin: "14px 0" }} />
      <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 6 }}>Reason (audited)</div>
      <TextInput value={reason} onChange={setReason} placeholder="reason for the change" />

      <div style={{ fontSize: 11, color: TEXT_DIM, margin: "12px 0 6px" }}>Grant / deduct M COIN</div>
      <div style={{ display: "flex", gap: 8 }}>
        <TextInput value={mcoin} onChange={setMcoin} placeholder="+500 / -200" type="number" />
        <Btn kind="primary" small onClick={() => void grantMcoin()}>
          Apply
        </Btn>
      </div>

      <div style={{ fontSize: 11, color: TEXT_DIM, margin: "12px 0 6px" }}>Set MMR</div>
      <div style={{ display: "flex", gap: 8 }}>
        <TextInput value={mmr} onChange={setMmr} type="number" />
        <Btn kind="primary" small onClick={() => void saveMmr()}>
          Set
        </Btn>
      </div>
    </Panel>
  );
}

function Row(props: { k: string; v: string; mono?: boolean }): React.JSX.Element {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, padding: "3px 0" }}>
      <span style={{ color: TEXT_DIM }}>{props.k}</span>
      <span style={{ color: TEXT_MAIN, fontFamily: props.mono ? "monospace" : "inherit", overflow: "hidden", textOverflow: "ellipsis" }}>
        {props.v}
      </span>
    </div>
  );
}

/** HH:MM for the 「資料時間」 stamp. */
function clockText(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The bare dot, reused by the row light and the legend. */
function Dot(props: { tone: SeenTone }): React.JSX.Element {
  const c = SEEN_DOT[props.tone];
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: 999,
        background: c.fill,
        border: `1px solid ${c.ring === "transparent" ? c.fill : c.ring}`,
        // only a live socket glows — the difference has to be visible at a glance
        boxShadow: props.tone === "live" ? `0 0 6px ${c.fill}` : "none",
        verticalAlign: "middle",
        marginRight: 5,
      }}
    />
  );
}

/**
 * #246 上線燈號 for one row. All the judgement lives in ../players.ts
 * (`seenState`), so this is presentation only — and the tooltip carries both
 * approved lines: 最後動作 N 分鐘前, and the REAL connection state rather than an
 * ambiguous 「目前連線中」 that an idle lobby tab would also satisfy.
 */
function SeenLight(props: { row: AccountRow; now: number }): React.JSX.Element {
  const s = seenState(props.row, props.now);
  return (
    <span
      title={s.tooltip}
      style={{
        whiteSpace: "nowrap",
        cursor: "help",
        color: s.tone === "live" ? TEXT_MAIN : s.tone === "off" ? TEXT_DIM : TEXT_MAIN,
        fontWeight: s.tone === "live" ? 700 : 400,
      }}
    >
      <Dot tone={s.tone} />
      {s.label}
    </span>
  );
}

const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "8px 8px", color: TEXT_MAIN };
