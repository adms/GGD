/**
 * 帳號審核 · Account approval (task #126).
 *
 * The private deploy's second door. 邀請碼 (#174) controls who may REGISTER;
 * this controls who may PLAY. A family member who registers lands `pending`,
 * and `auth.PlayableOnly` re-reads the durable account on every room route and
 * on the lobby WebSocket handshake — so until someone presses 通過 here they
 * are stuck on a waiting screen, and until this page existed the only way to
 * press it was a bearer-token curl.
 *
 * Built for the moment it will actually be used: the owner ON HIS PHONE, a
 * relative on the line who just registered. Therefore —
 *   • The queue is CARDS, not a table. A table on a 390px screen means
 *     horizontal scrolling to reach the button, and the button is the point.
 *   • 通過 is ONE tap, no confirm dialog. It is the expected outcome and it is
 *     reversible (婉拒 puts them back out).
 *   • 婉拒 confirms, and the dialog spells out how it differs from 停權 —
 *     the two live next to each other and record different things in the audit
 *     log. See ../approvals.ts DENY_VS_BAN.
 *   • The queue is oldest-first (the platform's ordering) and each card says
 *     how long that person has been waiting, so the order is legible instead of
 *     arbitrary.
 *
 * All classification/labelling is pure (../approvals.ts, unit-tested); this
 * file is presentation + wiring only, mirroring InvitesPage.
 */
import { useEffect, useState } from "react";
import * as apiFns from "../api";
import { ApiError } from "../session";
import { useApp } from "../store";
import {
  DENY_VS_BAN,
  accountBadges,
  approvalState,
  shortTime,
  waitedText,
  type Tone,
} from "../approvals";
import type { AccountRow } from "../types";
import { Badge, Btn, ConfirmDialog, ErrorBanner, Panel, TextInput } from "./widgets";
import { ACCENT, DANGER, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";

export const TONE: Record<Tone, string> = {
  ok: OK,
  warn: WARN,
  dim: TEXT_DIM,
  danger: DANGER,
  accent: ACCENT,
};

/** Approval + ban badges for one row. Shared with PlayersPage so no list can drift. */
export function AccountStateBadges(props: { row: AccountRow }): React.JSX.Element {
  return (
    <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>
      {accountBadges(props.row).map((b) => (
        <span key={b.text} title={b.hint}>
          <Badge color={TONE[b.tone]}>
            {b.emoji} {b.text}
          </Badge>
        </span>
      ))}
    </span>
  );
}

export function ApprovalsPage(): React.JSX.Element {
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [total, setTotal] = useState(0);
  const [recent, setRecent] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmDeny, setConfirmDeny] = useState<AccountRow | null>(null);
  const refreshPendingCount = useApp((s) => s.refreshPendingCount);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const queue = await apiFns.listPendingAccounts(1, 50);
      setRows(queue.accounts ?? []);
      setTotal(queue.total ?? 0);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.message}（平台是否有 /admin/accounts/pending？）`
          : "審核佇列載入失敗",
      );
    } finally {
      setLoading(false);
    }
    // The RECENTLY DECIDED strip. Denials are the reversible mistake this page
    // can cause, and a decision the owner cannot see is a decision he cannot
    // take back — so the last few denied accounts stay on screen with a 通過
    // button next to them.
    try {
      const denied = await apiFns.searchAccounts("", 1, 10, "denied");
      setRecent(denied.accounts ?? []);
    } catch {
      setRecent([]);
    }
    void refreshPendingCount();
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decide(row: AccountRow, approve: boolean, reason: string): Promise<void> {
    setBusyId(row.id);
    setError(null);
    try {
      if (approve) await apiFns.approveAccount(row.id, reason);
      else await apiFns.denyAccount(row.id, reason);
      setFlash(
        approve
          ? `✓ 已放行 ${row.username} — 他現在可以進遊戲了`
          : `已婉拒 ${row.username}（不是停權；隨時可以再放行）`,
      );
      setConfirmDeny(null);
      await load();
    } catch (err) {
      setConfirmDeny(null);
      setError(
        err instanceof ApiError
          ? `${approve ? "放行" : "婉拒"} ${row.username} 失敗：${err.message}`
          : "操作失敗",
      );
    } finally {
      setBusyId(null);
    }
  }

  const waiting = rows.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 860 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: TEXT_MAIN }}>帳號審核 · Account approval</div>
        <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4, lineHeight: 1.8 }}>
          有人註冊之後會停在<b style={{ color: TEXT_MAIN }}>「等待審核」</b>畫面，
          在你按下<b style={{ color: TEXT_MAIN }}>「通過」</b>之前<b style={{ color: TEXT_MAIN }}>進不了對戰</b>
          （檢查在伺服器端：每次進房間和連線大廳都會重新讀一次帳號狀態）。
          放行之後對方<b style={{ color: TEXT_MAIN }}>不用重新註冊</b>，重新登入就可以了。
        </div>
      </div>

      <ErrorBanner text={error} onDismiss={() => setError(null)} />

      <Panel
        title={`等待審核 · Waiting${total > 0 ? ` · ${total}` : ""}`}
        right={
          <Btn small onClick={() => void load()} disabled={loading}>
            {loading ? "讀取中…" : "重新整理"}
          </Btn>
        }
        style={waiting > 0 ? { border: `1px solid ${WARN}` } : undefined}
      >
        {loading && rows.length === 0 && (
          <div style={{ fontSize: 13, color: TEXT_DIM, padding: "8px 0" }}>載入中…</div>
        )}
        {!loading && waiting === 0 && (
          <div style={{ fontSize: 13, color: TEXT_DIM, padding: "8px 0", lineHeight: 1.8 }}>
            目前沒有人在等審核。
            <br />
            有家人要加入的話，先到「邀請碼」產生一組給他註冊，註冊完他就會出現在這裡。
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r) => (
            <PendingCard
              key={r.id}
              row={r}
              busy={busyId === r.id}
              onApprove={() => void decide(r, true, "")}
              onDeny={() => setConfirmDeny(r)}
            />
          ))}
        </div>
        {total > rows.length && (
          <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 10 }}>
            顯示前 {rows.length} 筆，共 {total} 筆等待中。處理完會自動帶出下一批。
          </div>
        )}
      </Panel>

      {recent.length > 0 && (
        <Panel title="最近婉拒 · Recently declined">
          <div style={{ fontSize: 11.5, color: TEXT_DIM, marginBottom: 10, lineHeight: 1.7 }}>
            按錯了？這裡按「通過」就可以把人放回來 — 帳號沒有被刪掉，資料也還在。
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recent.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  borderTop: PANEL_BORDER,
                  paddingTop: 8,
                }}
              >
                <b style={{ color: TEXT_MAIN, fontSize: 13 }}>{r.username}</b>
                <AccountStateBadges row={r} />
                <span style={{ flex: 1 }} />
                <Btn
                  small
                  kind="primary"
                  disabled={busyId === r.id}
                  onClick={() => void decide(r, true, "")}
                >
                  改為通過
                </Btn>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="婉拒 vs 停權 · 兩個不一樣的處分">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <ActionExplainer
            color={WARN}
            title={`${DENY_VS_BAN.deny.label} — ${DENY_VS_BAN.deny.what}`}
            who={DENY_VS_BAN.deny.who}
            effect={DENY_VS_BAN.deny.effect}
          />
          <ActionExplainer
            color={DANGER}
            title={`${DENY_VS_BAN.ban.label} — ${DENY_VS_BAN.ban.what}`}
            who={DENY_VS_BAN.ban.who}
            effect={DENY_VS_BAN.ban.effect}
          />
        </div>
        <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 12, lineHeight: 1.7 }}>
          兩個都可以還原，也都會把對方目前的登入踢掉。停權在「Players」頁面操作。
        </div>
      </Panel>

      {confirmDeny && (
        <DenyAccountDialog
          row={confirmDeny}
          onCancel={() => setConfirmDeny(null)}
          onConfirm={(reason) => void decide(confirmDeny, false, reason)}
        />
      )}

      {flash && (
        <div
          style={{
            position: "sticky",
            bottom: 8,
            alignSelf: "flex-start",
            padding: "8px 14px",
            borderRadius: 999,
            border: `1px solid ${OK}`,
            background: "#10241a",
            color: OK,
            fontSize: 12.5,
            fontWeight: 700,
            cursor: "pointer",
          }}
          onClick={() => setFlash(null)}
        >
          {flash}
        </div>
      )}
    </div>
  );
}

/**
 * One waiting person. Everything the owner needs to recognise a relative
 * (username, email, when they registered, how long they have waited) and the
 * two decisions, sized for a thumb.
 */
function PendingCard(props: {
  row: AccountRow;
  busy: boolean;
  onApprove: () => void;
  onDeny: () => void;
}): React.JSX.Element {
  const { row } = props;
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        alignItems: "center",
        padding: "12px 14px",
        borderRadius: 10,
        background: "#1d1a11",
        border: `1px solid ${WARN}`,
      }}
    >
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: TEXT_MAIN }}>{row.username}</span>
          <Badge color={WARN}>{waitedText(row.createdAt)}</Badge>
        </div>
        <div style={{ fontSize: 11.5, color: TEXT_DIM, marginTop: 3, overflowWrap: "anywhere" }}>
          {row.email || "（沒有 email）"}
        </div>
        <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2, overflowWrap: "anywhere" }}>
          註冊於 {shortTime(row.createdAt)} · <code style={{ userSelect: "all" }}>{row.id}</code>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Btn
          kind="primary"
          disabled={props.busy}
          onClick={props.onApprove}
          style={{ padding: "12px 24px", fontSize: 15, fontWeight: 800 }}
        >
          {props.busy ? "處理中…" : "✓ 通過"}
        </Btn>
        <Btn small disabled={props.busy} onClick={props.onDeny} style={{ padding: "10px 16px", fontSize: 12.5 }}>
          婉拒
        </Btn>
      </div>
    </div>
  );
}

/**
 * The 婉拒 confirmation. EXPORTED and shared with PlayersPage on purpose: deny
 * is offered from two places and the whole risk of the action is that it gets
 * confused with 停權 — so there is exactly one piece of copy explaining the
 * difference, and it cannot fall out of date on one of the two screens.
 */
export function DenyAccountDialog(props: {
  row: AccountRow;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}): React.JSX.Element {
  const [reason, setReason] = useState("");
  const state = approvalState(props.row);
  return (
    <ConfirmDialog
      title={`婉拒 ${props.row.username}？`}
      body={
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ lineHeight: 1.7 }}>
            <b style={{ color: TEXT_MAIN }}>這不是停權。</b>
            {DENY_VS_BAN.deny.effect}
          </span>
          {state === "approved" && (
            <span style={{ color: WARN, lineHeight: 1.7 }}>
              注意：這個帳號<b>已經通過</b>審核。婉拒會立刻把他踢出目前的登入。
              如果是違規要處理，應該用 Players 頁面的「停權」。
            </span>
          )}
          <TextInput value={reason} onChange={setReason} placeholder="原因（只記在稽核紀錄）" autoFocus />
        </div>
      }
      confirmLabel="婉拒這個註冊"
      danger
      onCancel={props.onCancel}
      onConfirm={() => props.onConfirm(reason)}
    />
  );
}

function ActionExplainer(props: {
  color: string;
  title: string;
  who: string;
  effect: string;
}): React.JSX.Element {
  return (
    <div style={{ borderLeft: `3px solid ${props.color}`, paddingLeft: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: props.color }}>{props.title}</div>
      <div style={{ fontSize: 11.5, color: TEXT_MAIN, marginTop: 5, lineHeight: 1.7 }}>用在：{props.who}</div>
      <div style={{ fontSize: 11.5, color: TEXT_DIM, marginTop: 3, lineHeight: 1.7 }}>{props.effect}</div>
    </div>
  );
}
