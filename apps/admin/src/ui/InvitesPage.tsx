/**
 * 邀請碼 (registration invite codes, task #174).
 *
 * The private-deploy gate: the platform refuses any registration that does not
 * burn a code minted here. THE GATE IS THE SERVER — this page is where the
 * owner produces codes and sees who used them.
 *
 * Built for the situation it will actually be used in: the owner on a PHONE,
 * with a family member on the line. So minting is one obvious action (備註 →
 * 產生), the freshly-minted codes are shown big at the top, and every code has
 * both a 複製 (the bare string, to read out or paste) and a 複製邀請訊息 (a
 * ready-to-send LINE message with the URL, the code and the expiry).
 *
 * All parse/validate/format logic is pure (../invites.ts, unit-tested); this
 * file is presentation + wiring only, mirroring CombatEnvPage.
 */
import { useEffect, useMemo, useState } from "react";
import { getInvites, mintInvites, revokeInvite } from "../api";
import {
  COUNT_CHOICES,
  FALLBACK_LIMITS,
  TTL_CHOICES,
  canRevoke,
  defaultRegisterUrl,
  expiryText,
  inviteMessage,
  parseMint,
  shortTime,
  statusLabel,
  summarize,
  type InviteLimits,
  type InviteRow,
} from "../invites";
import { Badge, Btn, ErrorBanner, Panel, TextInput } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";

const TONE: Record<"ok" | "warn" | "dim" | "danger", string> = {
  ok: OK,
  warn: WARN,
  dim: TEXT_DIM,
  danger: DANGER,
};

/** Clipboard with a hard fallback — an old WebView on a phone may have no async clipboard. */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export function InvitesPage(): React.JSX.Element {
  const [rows, setRows] = useState<InviteRow[]>([]);
  const [limits, setLimits] = useState<InviteLimits>(FALLBACK_LIMITS);
  const [minted, setMinted] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [note, setNote] = useState("");
  const [count, setCount] = useState(1);
  const [ttlDays, setTtlDays] = useState(FALLBACK_LIMITS.defaultTtlDays);
  const [registerUrl, setRegisterUrl] = useState(() =>
    defaultRegisterUrl(typeof location === "undefined" ? "" : location.origin),
  );

  useEffect(() => {
    void (async () => {
      try {
        const p = await getInvites();
        setRows(p.invites);
        setLimits(p.limits);
        setTtlDays(p.limits.defaultTtlDays);
      } catch (err) {
        setApiErr(`${err instanceof Error ? err.message : "載入失敗"}（平台 API 尚未提供 /admin/invites？）`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => summarize(rows), [rows]);
  const parsed = useMemo(() => parseMint({ note, count, ttlDays }, limits), [note, count, ttlDays, limits]);

  const onMint = async (): Promise<void> => {
    if (!parsed.ok) return;
    setBusy(true);
    setApiErr(null);
    try {
      const p = await mintInvites(parsed.value.note, parsed.value.count, parsed.value.ttlDays);
      setRows(p.invites);
      setLimits(p.limits);
      setMinted(p.minted);
      setFlash(`✓ 已產生 ${p.minted.length} 組邀請碼（備註：${parsed.value.note}）`);
      setNote("");
    } catch (err) {
      setFlash(null);
      setApiErr(err instanceof Error ? err.message : "產生失敗");
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = async (row: InviteRow): Promise<void> => {
    if (!window.confirm(`確定要撤銷 ${row.code}（${row.note}）嗎？撤銷後無法復原，需要重新產生一組。`)) return;
    setBusy(true);
    setApiErr(null);
    try {
      const p = await revokeInvite(row.code);
      setRows(p.invites);
      setMinted((m) => m.filter((x) => x.code !== row.code));
      setFlash(`已撤銷 ${row.code}`);
    } catch (err) {
      setApiErr(err instanceof Error ? err.message : "撤銷失敗");
    } finally {
      setBusy(false);
    }
  };

  const doCopy = async (text: string, what: string): Promise<void> => {
    setFlash((await copy(text)) ? `✓ 已複製${what}` : "複製失敗，請手動選取");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 940 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: TEXT_MAIN }}>邀請碼 · Invite codes</div>
        <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4, lineHeight: 1.8 }}>
          這是私人測試版的<b style={{ color: TEXT_MAIN }}>唯一入口</b>：沒有邀請碼就<b style={{ color: TEXT_MAIN }}>註冊不了</b>
          （檢查在伺服器端，不是網頁上的必填欄位）。一組邀請碼<b style={{ color: TEXT_MAIN }}>只能用一次</b>，用掉之後這裡會顯示是誰用的、什麼時候用的。
        </div>
      </div>

      <ErrorBanner text={apiErr} onDismiss={() => setApiErr(null)} />

      <Panel title="產生邀請碼 · Mint">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <Label>備註（要給誰）</Label>
            <TextInput
              value={note}
              onChange={setNote}
              placeholder="例如：媽媽、大表哥、阿姨一家"
              onEnter={() => void onMint()}
            />
            <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 4 }}>
              一定要填。之後這張表只會有一堆隨機字串，備註是你唯一分得出誰是誰的東西。
            </div>
          </div>

          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div>
              <Label>組數</Label>
              <Chips
                values={[...COUNT_CHOICES]}
                value={count}
                disabled={busy}
                onPick={setCount}
                render={(n) => `${n} 組`}
              />
            </div>
            <div>
              <Label>有效天數</Label>
              <Chips
                values={[...TTL_CHOICES]}
                value={ttlDays}
                disabled={busy}
                onPick={setTtlDays}
                render={(n) => `${n} 天`}
              />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Btn
              kind="primary"
              disabled={busy || loading || !parsed.ok}
              onClick={() => void onMint()}
              style={{ padding: "12px 26px", fontSize: 15, fontWeight: 800 }}
            >
              {busy ? "產生中…" : `🎟️ 產生 ${count} 組邀請碼`}
            </Btn>
            {!parsed.ok && note !== "" && <span style={{ fontSize: 12, color: WARN }}>{parsed.error}</span>}
          </div>
        </div>
      </Panel>

      {minted.length > 0 && (
        <Panel
          title="剛剛產生的邀請碼 · 立刻複製給對方"
          right={
            <Btn
              small
              onClick={() =>
                void doCopy(minted.map((m) => `${m.note}：${m.code}`).join("\n"), "全部邀請碼")
              }
            >
              複製全部
            </Btn>
          }
          style={{ border: `1px solid ${GOLD}` }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: TEXT_DIM }}>註冊網址</span>
              <span style={{ flex: 1, minWidth: 200 }}>
                <TextInput value={registerUrl} onChange={setRegisterUrl} placeholder="https://…" />
              </span>
            </div>
            {minted.map((m) => (
              <div
                key={m.code}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "#231d10",
                }}
              >
                <code
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    letterSpacing: 2,
                    color: GOLD,
                    fontVariantNumeric: "tabular-nums",
                    userSelect: "all",
                  }}
                >
                  {m.code}
                </code>
                <span style={{ fontSize: 12, color: TEXT_DIM }}>{m.note}</span>
                <span style={{ flex: 1 }} />
                <Btn small onClick={() => void doCopy(m.code, "邀請碼")}>
                  複製
                </Btn>
                <Btn small kind="primary" onClick={() => void doCopy(inviteMessage(m, registerUrl), "邀請訊息")}>
                  複製邀請訊息
                </Btn>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel
        title="全部邀請碼 · All codes"
        right={
          loading ? (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>載入中…</span>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <Badge color={OK}>未使用 {stats.active}</Badge>
              <Badge color={TEXT_DIM}>已使用 {stats.redeemed}</Badge>
              {stats.dead > 0 && <Badge color={WARN}>失效 {stats.dead}</Badge>}
            </div>
          )
        }
      >
        {rows.length === 0 && !loading ? (
          <div style={{ fontSize: 13, color: TEXT_DIM, padding: "8px 0" }}>
            還沒有任何邀請碼。上面填個備註（例如「媽媽」）按下產生就可以了。
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 720 }}>
              <thead>
                <tr style={{ color: TEXT_DIM, textAlign: "left" }}>
                  <Th>邀請碼</Th>
                  <Th>備註</Th>
                  <Th>由誰產生</Th>
                  <Th>狀態</Th>
                  <Th>使用者</Th>
                  <Th>到期</Th>
                  <Th>建立</Th>
                  <Th> </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const label = statusLabel(r.effectiveStatus);
                  return (
                    <tr key={r.code} style={{ borderTop: PANEL_BORDER }}>
                      <Td>
                        <code
                          style={{
                            fontSize: 13.5,
                            fontWeight: 700,
                            letterSpacing: 1,
                            color: r.effectiveStatus === "active" ? ACCENT : TEXT_DIM,
                            userSelect: "all",
                          }}
                        >
                          {r.code}
                        </code>
                      </Td>
                      <Td>{r.note || "—"}</Td>
                      <Td>
                        {r.source === "referral" ? (
                          <span>
                            <Badge color={ACCENT}>玩家推薦</Badge>
                            {r.note.includes("·") ? (
                              <>
                                <br />
                                <span style={{ fontSize: 11, color: TEXT_DIM }}>
                                  {r.note.split("·").pop()?.trim()}
                                </span>
                              </>
                            ) : null}
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: TEXT_DIM }}>後台</span>
                        )}
                      </Td>
                      <Td>
                        <Badge color={TONE[label.tone]}>{label.text}</Badge>
                      </Td>
                      <Td>
                        {r.redeemedUsername ? (
                          <span>
                            <b style={{ color: TEXT_MAIN }}>{r.redeemedUsername}</b>
                            <br />
                            <span style={{ fontSize: 11, color: TEXT_DIM }}>{shortTime(r.redeemedAt)}</span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td>{r.effectiveStatus === "redeemed" ? "—" : expiryText(r.expiresAt)}</Td>
                      <Td style={{ fontSize: 11, color: TEXT_DIM }}>{shortTime(r.createdAt)}</Td>
                      <Td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <Btn small onClick={() => void doCopy(r.code, "邀請碼")}>
                            複製
                          </Btn>
                          {canRevoke(r) && (
                            <Btn small kind="danger" disabled={busy} onClick={() => void onRevoke(r)}>
                              撤銷
                            </Btn>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

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
          }}
          onClick={() => setFlash(null)}
        >
          {flash}
        </div>
      )}
    </div>
  );
}

function Label(props: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: ACCENT, marginBottom: 5 }}>
      {props.children}
    </div>
  );
}

function Chips<T extends number>(props: {
  values: T[];
  value: T | number;
  disabled?: boolean;
  onPick: (v: T) => void;
  render: (v: T) => string;
}): React.JSX.Element {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {props.values.map((v) => (
        <Btn
          key={v}
          small
          disabled={props.disabled}
          kind={v === props.value ? "primary" : "ghost"}
          onClick={() => props.onPick(v)}
          style={{ padding: "7px 14px", fontSize: 12.5 }}
        >
          {props.render(v)}
        </Btn>
      ))}
    </div>
  );
}

function Th(props: { children: React.ReactNode }): React.JSX.Element {
  return <th style={{ padding: "6px 8px", fontWeight: 700, whiteSpace: "nowrap" }}>{props.children}</th>;
}

function Td(props: { children: React.ReactNode; style?: React.CSSProperties }): React.JSX.Element {
  return <td style={{ padding: "8px", color: TEXT_MAIN, verticalAlign: "top", ...props.style }}>{props.children}</td>;
}
