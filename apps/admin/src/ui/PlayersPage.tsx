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
import { useEffect, useState } from "react";
import * as apiFns from "../api";
import { ApiError } from "../session";
import { filterAccounts, winRate } from "../players";
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
import { GOLD, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";

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

  const pageSize = 20;

  async function search(p = 1, st = status): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFns.searchAccounts(query, p, pageSize, st);
      setRows(res.accounts);
      setTotal(res.total);
      setPage(p);
      setStatus(st);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "search failed");
    } finally {
      setLoading(false);
    }
    void refreshPendingCount();
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
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td style={td} colSpan={7}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && visible.length === 0 && (
                <tr>
                  <td style={{ ...td, color: TEXT_DIM }} colSpan={7}>
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

const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "8px 8px", color: TEXT_MAIN };
