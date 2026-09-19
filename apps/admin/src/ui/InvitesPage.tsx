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
import { getInvites, mintInvites, putInvitePolicy, revokeInvite } from "../api";
import {
  COUNT_CHOICES,
  FALLBACK_LIMITS,
  INVITE_CODE_MODES,
  SHIPPED_INVITE_CODE_MODE,
  SOURCE_FILTERS,
  TTL_CHOICES,
  canRevoke,
  defaultRegisterUrl,
  describeInviteMode,
  expiryText,
  filterBySource,
  inviteMessage,
  inviteModeOrigin,
  parseMint,
  shortTime,
  statusLabel,
  summarize,
  type InviteCodeMode,
  type InviteLimits,
  type InvitePayload,
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

  /**
   * 來源 filter (#246). Defaults to 後台發出 — the codes the owner MINTED are what
   * he opens this page to find, and one auto-minted personal referral code per
   * registration otherwise interleaves with them newest-first until his own are
   * buried. Nothing is removed: 全部 is one tap away and the header states how
   * many rows each view holds.
   */
  const [source, setSource] = useState("admin");

  /**
   * GH#1274 必填／選填. Seeded from the SHIPPED default only so the panel can
   * render before the first response arrives; every response overwrites all
   * three of these, and `policyStored` is what decides whether the page says
   * 「尚未設定」 or names who saved it.
   */
  const [codeMode, setCodeMode] = useState<InviteCodeMode>(SHIPPED_INVITE_CODE_MODE);
  const [policyStored, setPolicyStored] = useState(false);
  const [policyOrigin, setPolicyOrigin] = useState("讀取中…");

  const [note, setNote] = useState("");
  const [count, setCount] = useState(1);
  const [ttlDays, setTtlDays] = useState(FALLBACK_LIMITS.defaultTtlDays);
  const [registerUrl, setRegisterUrl] = useState(() =>
    defaultRegisterUrl(typeof location === "undefined" ? "" : location.origin),
  );

  /**
   * Every response from this surface carries the policy, so it is absorbed in
   * ONE place rather than at each call site. That is what keeps the switch and
   * the code list from ever being repainted out of step — the failure this
   * page would otherwise have: a mode from one round trip beside a list from
   * another.
   */
  const absorbPolicy = (p: InvitePayload): void => {
    setCodeMode(p.policy.inviteCode);
    setPolicyStored(p.policyStored);
    setPolicyOrigin(inviteModeOrigin(p));
  };

  useEffect(() => {
    void (async () => {
      try {
        const p = await getInvites();
        setRows(p.invites);
        setLimits(p.limits);
        setTtlDays(p.limits.defaultTtlDays);
        absorbPolicy(p);
      } catch (err) {
        setApiErr(`${err instanceof Error ? err.message : "載入失敗"}（平台 API 尚未提供 /admin/invites？）`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => summarize(rows), [rows]);
  const shown = useMemo(() => filterBySource(rows, source), [rows, source]);
  const shownStats = useMemo(() => summarize(shown), [shown]);
  const hidden = rows.length - shown.length;
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
      absorbPolicy(p);
      // A freshly minted code is an operator code; never leave the table on a
      // view that would hide what the owner just made.
      setSource("admin");
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
      absorbPolicy(p);
      setFlash(`已撤銷 ${row.code}`);
    } catch (err) {
      setApiErr(err instanceof Error ? err.message : "撤銷失敗");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Save 必填／選填. It takes effect on the NEXT registration — the server
   * re-reads it every time — so the confirmation says so rather than implying
   * a restart is needed.
   *
   * Switching to 選填 asks first, and the question names what it costs. This is
   * the one control on the page that can let strangers in; the rest only mint
   * and kill codes.
   */
  const onSetMode = async (next: InviteCodeMode): Promise<void> => {
    if (next === codeMode) return;
    if (
      next === "optional" &&
      !window.confirm(
        "改成「選填」之後，沒有邀請碼的人也可以註冊（帳號一樣會停在待審，要你批准才能玩）。\n\n" +
          "代價：陌生人可以試出某個帳號名或 email 有沒有被註冊過。\n\n" +
          "要改嗎？隨時可以切回「必填」。",
      )
    ) {
      return;
    }
    setBusy(true);
    setApiErr(null);
    try {
      const p = await putInvitePolicy(next);
      setRows(p.invites);
      absorbPolicy(p);
      setFlash(`✓ 已改成「${describeInviteMode(p.policy.inviteCode).label}」——下一個註冊就生效（不用重啟）`);
    } catch (err) {
      setFlash(null);
      setApiErr(err instanceof Error ? err.message : "設定失敗");
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
        {/* ⚠️ GH#1274: this paragraph used to state flatly「沒有邀請碼就註冊不了」.
            That sentence is only true in 必填, so it is now derived from the
            live setting — a console that keeps asserting the old posture after
            the owner switched is exactly the「卡片上說了但不會發生」failure the
            rules forbid. */}
        <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4, lineHeight: 1.8 }}>
          {codeMode === "required" ? (
            <>
              目前設定是<b style={{ color: TEXT_MAIN }}>必填</b>：沒有邀請碼就
              <b style={{ color: TEXT_MAIN }}>註冊不了</b>（檢查在伺服器端，不是網頁上的必填欄位）。
            </>
          ) : (
            <>
              目前設定是<b style={{ color: GOLD }}>選填</b>：沒有邀請碼<b style={{ color: TEXT_MAIN }}>也能註冊</b>
              ，但帳號會停在<b style={{ color: TEXT_MAIN }}>待審</b>，要你在「帳號審核」批准才能玩。
            </>
          )}
          一組邀請碼<b style={{ color: TEXT_MAIN }}>只能用一次</b>，用掉之後這裡會顯示是誰用的、什麼時候用的。
          <br />
          這裡有<b style={{ color: TEXT_MAIN }}>兩種</b>邀請碼：你在下面產生的「後台發出」，以及每個人註冊時系統自動給他一組的「玩家推薦」。
          下面的表格預設只顯示你自己發的，按<b style={{ color: TEXT_MAIN }}>來源</b>可以切換。
        </div>
      </div>

      <ErrorBanner text={apiErr} onDismiss={() => setApiErr(null)} />

      <Panel title="註冊要不要邀請碼 · Registration">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {INVITE_CODE_MODES.map((m) => {
              const d = describeInviteMode(m);
              const on = codeMode === m;
              return (
                <Btn
                  key={m}
                  kind={on ? "primary" : "ghost"}
                  disabled={busy || loading}
                  dataField={`invite-mode-${m}`}
                  onClick={() => void onSetMode(m)}
                >
                  {on ? `● ${d.label}` : d.label}
                </Btn>
              );
            })}
            <div style={{ fontSize: 11, color: TEXT_DIM, alignSelf: "center" }}>{policyOrigin}</div>
          </div>
          <div style={{ fontSize: 12, color: TEXT_MAIN, lineHeight: 1.8 }}>
            {describeInviteMode(codeMode).what}
          </div>
          <div style={{ fontSize: 11, color: codeMode === "optional" ? WARN : TEXT_DIM, lineHeight: 1.8 }}>
            代價：{describeInviteMode(codeMode).cost}
          </div>
          <div style={{ fontSize: 11, color: TEXT_DIM, lineHeight: 1.8 }}>
            存檔後<b style={{ color: TEXT_MAIN }}>下一個註冊就生效</b>，不用重啟伺服器。
            這一格<b style={{ color: TEXT_MAIN }}>不影響</b>「要不要後台批准」——那是「帳號審核」那一頁的事，兩個是分開的。
            {!policyStored && "（目前還沒有人設定過，用的是內建預設值。）"}
          </div>
        </div>
      </Panel>

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

      {/*
        THE TABLE (#246 layout pass).

        The owner said 排版有點擠 and 不要減少資訊, and those are not in tension
        here — the crowding came from two things, both fixed without deleting a
        single value:

        1. ROW COUNT. Since #203 the list is a MIXED feed: one auto-minted
           personal referral code per registration, interleaved newest-first with
           the operator's own. The 來源 segment control below splits them; every
           row stays one tap away and the header counts both.
        2. COLUMN COUNT. Eight columns at minWidth 720 inside a 940 container.
           Now six: 備註 absorbs the 來源 badge and 狀態 absorbs 到期, both of
           which were one-word cells that each cost a full column. Every value
           that was rendered before is still rendered.
      */}
      <Panel
        title="全部邀請碼 · All codes"
        right={
          loading ? (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>載入中…</span>
          ) : (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Badge color={OK}>未使用 {shownStats.active}</Badge>
              <Badge color={TEXT_DIM}>已使用 {shownStats.redeemed}</Badge>
              {shownStats.dead > 0 && <Badge color={WARN}>失效 {shownStats.dead}</Badge>}
            </div>
          )
        }
      >
        {rows.length === 0 && !loading ? (
          <div style={{ fontSize: 13, color: TEXT_DIM, padding: "8px 0" }}>
            還沒有任何邀請碼。上面填個備註（例如「媽媽」）按下產生就可以了。
          </div>
        ) : (
          <>
            {/* 來源 filter. Counts live on the chips so the owner can see what
                each view holds BEFORE switching to it — the filter can never
                quietly swallow rows. */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: ACCENT, marginRight: 2 }}>
                來源
              </span>
              {SOURCE_FILTERS.map((f) => (
                <Btn
                  key={f.value || "all"}
                  small
                  kind={f.value === source ? "primary" : "ghost"}
                  onClick={() => setSource(f.value)}
                >
                  {f.label} {f.value === "admin" ? stats.admin : f.value === "referral" ? stats.referral : rows.length}
                </Btn>
              ))}
            </div>
            {hidden > 0 && (
              <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 8, lineHeight: 1.7 }}>
                另有 {hidden} 組沒有顯示（這是檢視篩選，沒有刪掉任何東西——按上面的「全部」就看得到）。
                {source === "admin" && "「玩家推薦」是每個人註冊時系統自動給他的個人推薦碼，不是你發的。"}
              </div>
            )}

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 560 }}>
                <thead>
                  <tr style={{ color: TEXT_DIM, textAlign: "left" }}>
                    <Th>邀請碼</Th>
                    <Th>備註 · 來源</Th>
                    <Th>狀態 · 到期</Th>
                    <Th>使用者</Th>
                    <Th style={{ textAlign: "right" }}>建立</Th>
                    <Th> </Th>
                  </tr>
                </thead>
                <tbody>
                  {shown.length === 0 && (
                    <tr style={{ borderTop: PANEL_BORDER }}>
                      <Td style={{ color: TEXT_DIM }}>
                        這個來源目前沒有邀請碼。
                      </Td>
                      <Td> </Td>
                      <Td> </Td>
                      <Td> </Td>
                      <Td> </Td>
                      <Td> </Td>
                    </tr>
                  )}
                  {shown.map((r) => {
                    const label = statusLabel(r.effectiveStatus);
                    const referral = r.source === "referral";
                    // A referral code's 備註 is "個人推薦碼 · <username>" — the tail
                    // is the player it belongs to, and it is the only thing that
                    // makes one of these rows identifiable.
                    const owner = referral && r.note.includes("·") ? r.note.split("·").pop()?.trim() : "";
                    return (
                      <tr key={r.code} style={{ borderTop: PANEL_BORDER }}>
                        <Td>
                          {/* NOT truncated. GGD-XXXX-XXXX is 13 characters and it
                              is the one value this page exists to convey — the
                              owner reads it aloud on the phone. */}
                          <code
                            style={{
                              fontSize: 13.5,
                              fontWeight: 700,
                              letterSpacing: 1,
                              color: r.effectiveStatus === "active" ? ACCENT : TEXT_DIM,
                              userSelect: "all",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {r.code}
                          </code>
                        </Td>
                        <Td>
                          {referral ? (
                            <span>
                              <Badge color={ACCENT}>玩家推薦</Badge>
                              {owner ? (
                                <span style={{ marginLeft: 6, color: TEXT_MAIN }}>{owner}</span>
                              ) : null}
                            </span>
                          ) : (
                            <span>
                              <span style={{ color: TEXT_MAIN }}>{r.note || "—"}</span>
                              <br />
                              <span style={{ fontSize: 11, color: TEXT_DIM }}>後台發出</span>
                            </span>
                          )}
                        </Td>
                        <Td>
                          <Badge color={TONE[label.tone]}>{label.text}</Badge>
                          {r.effectiveStatus !== "redeemed" && (
                            <>
                              <br />
                              <span style={{ fontSize: 11, color: TEXT_DIM }}>{expiryText(r.expiresAt)}</span>
                            </>
                          )}
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
                        <Td style={{ fontSize: 11, color: TEXT_DIM, textAlign: "right", whiteSpace: "nowrap" }}>
                          {shortTime(r.createdAt)}
                        </Td>
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
          </>
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

function Th(props: { children: React.ReactNode; style?: React.CSSProperties }): React.JSX.Element {
  return (
    <th style={{ padding: "6px 8px", fontWeight: 700, whiteSpace: "nowrap", ...props.style }}>{props.children}</th>
  );
}

function Td(props: { children: React.ReactNode; style?: React.CSSProperties }): React.JSX.Element {
  return <td style={{ padding: "8px", color: TEXT_MAIN, verticalAlign: "top", ...props.style }}>{props.children}</td>;
}
