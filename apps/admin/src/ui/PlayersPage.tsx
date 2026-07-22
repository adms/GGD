/**
 * Players — search table with ban/unban, M COIN adjust, MMR set and a detail
 * drawer. Destructive actions confirm first; API-envelope errors surface.
 */
import { useEffect, useState } from "react";
import * as apiFns from "../api";
import { ApiError } from "../session";
import { filterAccounts, winRate } from "../players";
import type { AccountRow, Profile } from "../types";
import { Badge, Btn, ConfirmDialog, ErrorBanner, Panel, TextInput } from "./widgets";
import { DANGER, GOLD, OK, TEXT_DIM, TEXT_MAIN } from "./theme";

export function PlayersPage(): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [confirmBan, setConfirmBan] = useState<AccountRow | null>(null);

  const pageSize = 20;

  async function search(p = 1): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFns.searchAccounts(query, p, pageSize);
      setRows(res.accounts);
      setTotal(res.total);
      setPage(p);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "search failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void search(1);
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
        <div style={{ overflowX: "auto", marginTop: error ? 10 : 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: TEXT_DIM, textAlign: "left" }}>
                <th style={th}>Username</th>
                <th style={th}>MMR</th>
                <th style={th}>Games</th>
                <th style={th}>Win%</th>
                <th style={th}>M COIN</th>
                <th style={th}>Status</th>
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
                  <td style={td}>
                    {r.banned ? <Badge color={DANGER}>banned</Badge> : <Badge color={OK}>active</Badge>}
                  </td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    {r.banned ? (
                      <Btn small onClick={() => void doUnban(r)}>
                        Unban
                      </Btn>
                    ) : (
                      <Btn small kind="danger" onClick={() => setConfirmBan(r)}>
                        Ban
                      </Btn>
                    )}
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
          onError={setError}
        />
      )}

      {confirmBan && (
        <BanDialog row={confirmBan} onCancel={() => setConfirmBan(null)} onConfirm={(reason) => void doBan(confirmBan, reason)} />
      )}
    </div>
  );
}

function BanDialog(props: { row: AccountRow; onCancel: () => void; onConfirm: (reason: string) => void }): React.JSX.Element {
  const [reason, setReason] = useState("");
  return (
    <ConfirmDialog
      title={`Ban ${props.row.username}?`}
      body={
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span>They will be logged out and blocked from signing in.</span>
          <TextInput value={reason} onChange={setReason} placeholder="reason (shown to the player)" autoFocus />
        </div>
      }
      confirmLabel="Ban player"
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
