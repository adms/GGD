/**
 * LobbyScreen — the post-auth hub: header (wallet / identity / store /
 * logout), friends panel, room browser or room view, leaderboard, plus the
 * live invite prompts pushed over the lobby WS.
 *
 * TOP-RIGHT SAFE AREA (task #107): the header runs to the right edge, and the
 * persistent audio cluster is <body>-portaled above every screen — so ⚙
 * Settings / Logout used to render UNDERNEATH it. The header now RESERVES the
 * gutter the cluster publishes (`../chromeReserve`) instead of hard-coding a
 * width, and wraps rather than compressing into it.
 */
import { useState } from "react";
import { useApp } from "./store";
import { SettingsScreen } from "../SettingsScreen";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { FriendsPanel } from "./FriendsPanel";
import { LobbyAnnouncement } from "./LobbyAnnouncement";
import { LeaderboardPanel } from "./LeaderboardPanel";
import { RoomListPanel } from "./RoomListPanel";
import { RoomView } from "./RoomView";
import { StoreScreen } from "./StoreScreen";
import { openCodex } from "../codex/CodexRoute";
import { topRightClear, topRightReserve } from "../chromeReserve";
import { Btn, MCoin, Crystal, Panel, CodeBox, ACCENT, OK, DANGER } from "./widgets";
import { ARENA_OPTIONS, DEFAULT_MAP_ID } from "./maps";
import { GOLD, PANEL_BG, TEXT_DIM, TEXT_MAIN } from "../theme";

/** The lobby shell's own edge padding — also the header's `outerInset`. */
const LOBBY_PAD = 16;

function InviteToasts(): React.JSX.Element | null {
  const invites = useApp((s) => s.ws.invites);
  const joinByCode = useApp((s) => s.joinByCode);
  const dismissInvite = useApp((s) => s.dismissInvite);
  if (invites.length === 0) return null;
  return (
    // right-aligned toasts pass UNDER the audio cluster rather than beside it
    // (they are 280px wide — reserving the gutter would squeeze them), so they
    // consume the published HEIGHT instead of the width.
    <div
      style={{
        position: "absolute",
        right: LOBBY_PAD,
        top: topRightClear({ min: 64, gap: 8 }),
        zIndex: 50,
        width: 280,
        pointerEvents: "auto",
      }}
    >
      {invites.map((inv) => (
        <Panel key={inv.token} style={{ marginBottom: 8, border: `1px solid ${ACCENT}` }}>
          <div style={{ fontSize: 13, color: TEXT_MAIN, marginBottom: 8 }}>
            Room invite: <span style={{ fontWeight: 700 }}>{inv.roomName || inv.roomId}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small kind="primary" onClick={() => void joinByCode(inv.token)}>
              Join
            </Btn>
            <Btn small onClick={() => dismissInvite(inv.token)}>
              Dismiss
            </Btn>
          </div>
        </Panel>
      ))}
    </div>
  );
}

export function ErrorToast(): React.JSX.Element | null {
  const lastError = useApp((s) => s.lastError);
  const clearError = useApp((s) => s.clearError);
  if (!lastError) return null;
  return (
    <div
      onClick={clearError}
      style={{
        position: "absolute",
        left: "50%",
        bottom: 24,
        transform: "translateX(-50%)",
        zIndex: 60,
        background: "#3a1c1e",
        border: "1px solid #7a3230",
        color: "#f0a0a0",
        fontSize: 12,
        borderRadius: 8,
        padding: "8px 14px",
        cursor: "pointer",
        pointerEvents: "auto",
      }}
    >
      {lastError} <span style={{ color: TEXT_DIM }}>(click to dismiss)</span>
    </div>
  );
}

/**
 * BOT MATCH STRIP (#188) — 「play offline with bot 也要開放給有註冊的玩家在大廳
 * 一鍵開房直接玩」.
 *
 * TWO BUTTONS THAT LOOK DIFFERENT BECAUSE THEY ARE DIFFERENT:
 *
 *  · 一鍵開打 (primary, oversized, first thing in the play column) →
 *    `playBotMatch` → POST /rooms/solo. The platform creates a private room,
 *    starts it with 11 bots and pushes the seat token over the lobby WS. The
 *    match RECORDS and pays. This is a game mode, and it has to LOOK like one:
 *    a family member opening the lobby must see, without reading, that this is
 *    the button that starts a game.
 *
 *  · dev 直連 (small ghost, parked on the footnote row) → `playOffline` → joins
 *    the game server directly with NO platform match. Nothing settles: no
 *    record, no season points, no 水晶, no ladder row. It stays because the
 *    owner tests with it and the #replay= / offline flows share the launch —
 *    but it is labelled as what it is instead of being the only way to "play
 *    vs bots".
 *
 * ---- WHY THE PAYOUT IS PRINTED ON THE PANEL, NOT IN A TOOLTIP --------------
 * This mode pays LESS than a full human lobby, and the difference is structural
 * (`gamelink/callback.go`), not a bug:
 *   · 水晶 — judged on the EARNER'S OWN TEAM. A bot beside you HALVES the grant
 *     (integer halving, rounds down). That is the anti-farm rule: soloing bots
 *     forever pays at most half rate.
 *   · M幣 — requires an ALL-HUMAN 12-seat lobby. A bot anywhere pays zero, so a
 *     bot match mints none, by construction.
 *   · MMR — unchanged, and that falls out of `ranking/elo.go` rather than the
 *     anti-farm rule: fewer than two teams holding a human is not a rated
 *     contest. Worth saying out loud because it is GOOD news — beating bots
 *     cannot wreck the number that matches you against your family.
 *   · 戰績 / 賽季積分 — ungated. Games, wins and +points all move.
 * A mode that silently pays half is how you lose trust in the economy the first
 * time somebody counts their crystals. So the three deltas are BADGES next to
 * the button, at the moment of the decision — short, and unapologetic: half is
 * still worth playing.
 *
 * ---- LAYOUT (#107 safe-area contract, #151/#159 phone) ---------------------
 * Nothing here is absolutely positioned. The strip is an ordinary Panel in the
 * lobby's centre `.ggd-lobby-col`, so it inherits the column's flow and the
 * header keeps owning the top-right gutter it reserves from `chromeReserve` —
 * no new claim on persistent chrome. Both halves are `flex: 1 1 <basis>` with
 * wrap, so at 390px they stack: info block, then a full-width action row where
 * the primary button grows to the whole column. Buttons are `Btn`, so they
 * carry the shared hover/click SFX (#24) — a raw <button> would be silent.
 */
function RewardBadge(props: { color: string; text: string; title: string }): React.JSX.Element {
  return (
    <span
      title={props.title}
      style={{
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1.6,
        color: props.color,
        border: `1px solid ${props.color}66`,
        background: `${props.color}14`,
        borderRadius: 6,
        padding: "1px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {props.text}
    </span>
  );
}

function BotMatchStrip(props: { mapId: string; onMapId: (id: string) => void }): React.JSX.Element {
  const playBotMatch = useApp((s) => s.playBotMatch);
  const playOffline = useApp((s) => s.playOffline);
  const busy = useApp((s) => s.botMatchBusy);
  // 肉鴿殭屍模式 (#215) — default ON; only sends `false` to the solo path when
  // unchecked. The empty-body solo default already means ON server-side.
  const [rogueliteMobs, setRogueliteMobs] = useState(true);
  return (
    <Panel
      style={{
        border: `1px solid ${ACCENT}88`,
        background: `linear-gradient(180deg, ${ACCENT}1f 0%, ${PANEL_BG} 62%)`,
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        {/* WHAT IT IS + WHAT IT PAYS — one block, so the reward never scrolls
            away from the name of the mode. */}
        <div style={{ flex: "1 1 230px", minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 1, color: TEXT_MAIN }}>
            單人 vs BOT
          </div>
          <div style={{ fontSize: 12, color: TEXT_DIM, margin: "3px 0 7px" }}>
            一個人也能開打 —— 真的<span style={{ color: GOLD, fontWeight: 700 }}>計分</span>、記戰績、上排行榜
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <RewardBadge color={GOLD} text="水晶 ½" title="隊上有 BOT，水晶減半（無條件捨去）" />
            <RewardBadge color={TEXT_DIM} text="無 M幣" title="M幣要 12 個位置全是真人才會發" />
            <RewardBadge color={TEXT_DIM} text="MMR 不變" title="打 BOT 不列入對戰評分，不會影響你跟家人的配對" />
          </div>
        </div>

        {/* THE DECISION. `flex: 1 1 260px` + wrap ⇒ on a 390px phone this row
            drops below the info block and the button grows to full width. The
            maxWidth is the desktop half of the same contract: without it the
            pair keeps absorbing the whole centre column and a five-option
            arena dropdown ends up 500px wide on a 1600px monitor. */}
        <div
          style={{
            flex: "1 1 260px",
            maxWidth: 440,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <select
            value={props.mapId}
            onChange={(e) => props.onMapId(e.target.value)}
            title="選擇競技場"
            style={{
              flex: "1 1 130px",
              minWidth: 0,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #2c3448",
              background: "#10141f",
              color: TEXT_MAIN,
              fontSize: 12,
            }}
          >
            {ARENA_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <label
            title="第3場起喪標麥可喪屍湧入 (預設開啟)"
            style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 100%", fontSize: 12, color: TEXT_MAIN, cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={rogueliteMobs}
              onChange={(e) => setRogueliteMobs(e.target.checked)}
              style={{ width: 15, height: 15 }}
            />
            肉鴿殭屍模式
          </label>
          <Btn
            kind="primary"
            disabled={busy}
            onClick={() => void playBotMatch(props.mapId, rogueliteMobs)}
            title="開一場真正的對 BOT 比賽：記戰績、算賽季積分、發水晶（減半），不發 M幣、不動 MMR"
            style={{
              flex: "1.4 1 160px",
              padding: "13px 22px",
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: 2,
            }}
          >
            {/* VS16 on the swords: without it U+2694 falls back to the TEXT
                glyph, which at this size renders as a thin ✕ — a start button
                that looks like a cancel button. */}
            {busy ? "開房中…" : "⚔️ 一鍵開打"}
          </Btn>
        </div>
      </div>

      {/* the honest footnote, and the dev shortcut parked well away from the
          thing the family is meant to press. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          borderTop: "1px solid rgba(120, 140, 190, 0.18)",
          paddingTop: 8,
        }}
      >
        <div style={{ flex: "1 1 220px", fontSize: 11, color: TEXT_DIM, lineHeight: 1.5 }}>
          隊上有 BOT，水晶只發一半；M幣要 12 人全真人。半份也是白賺，想拿滿就揪人。
        </div>
        <Btn
          small
          kind="ghost"
          onClick={() => playOffline(props.mapId)}
          title="dev 直連（不經平台）：不記錄戰績、不算積分、不發水晶。測試用。"
          style={{ opacity: 0.55 }}
        >
          dev 直連
        </Btn>
      </div>
    </Panel>
  );
}

/**
 * REFERRAL PANEL (task #203) — the player's own single-use invite code, so a
 * family member on an invite-gated deploy can hand a friend a way in. On a
 * non-gated dev platform the account carries no code, so the panel renders
 * nothing (no empty box, no dead copy button). An ordinary Panel in the lobby
 * flow — it claims no persistent chrome (#107 safe-area contract).
 *
 * The auto-approval half of the feature (a consumed code fast-tracks a PENDING
 * inviter) is surfaced at REGISTRATION, where the pending person actually is;
 * a lobby viewer is already approved, so here the message is simply "invite a
 * friend". The code is single-use, which the copy makes honest: it is for one
 * friend, and the server mints the next account its own.
 */
function ReferralPanel(): React.JSX.Element | null {
  const referralCode = useApp((s) => s.account?.referralCode);
  if (!referralCode) return null;
  return (
    <Panel title="邀請好友" style={{ gap: 8 }}>
      <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.5 }}>
        把這組<span style={{ color: ACCENT, fontWeight: 700 }}>專屬邀請碼</span>分享給一位朋友，他就能註冊加入去死團。
      </div>
      <CodeBox value={referralCode} />
      <div style={{ fontSize: 11, color: TEXT_DIM, lineHeight: 1.5 }}>
        限用一次。想邀更多人，可再向管理員索取邀請碼。
      </div>
    </Panel>
  );
}

export function LobbyScreen(): React.JSX.Element {
  const account = useApp((s) => s.account);
  const wallet = useApp((s) => s.wallet);
  const wsStatus = useApp((s) => s.wsStatus);
  const lobbyView = useApp((s) => s.lobbyView);
  const setLobbyView = useApp((s) => s.setLobbyView);
  const room = useApp((s) => s.room);
  const doLogout = useApp((s) => s.doLogout);
  // 大廳公告 (#259): the header chip that reopens a dismissed announcement. It
  // exists only while there IS one, so a lobby with no announcement gains no
  // new control at all.
  const announcement = useApp((s) => s.announcement);
  const openAnnouncement = useApp((s) => s.openAnnouncement);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [offlineMap, setOfflineMap] = useState(DEFAULT_MAP_ID);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        pointerEvents: "auto",
        background: "radial-gradient(ellipse at 50% 0%, #131a2c 0%, #0b0e14 65%)",
        padding: LOBBY_PAD,
        boxSizing: "border-box",
        gap: 12,
      }}
    >
      {/* header — reserves the audio cluster's PUBLISHED gutter (task #107) and
          wraps into a second row instead of sliding underneath it. */}
      <div
        data-ggd-lobby-header=""
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px 14px",
          boxSizing: "border-box",
          paddingRight: topRightReserve({ outerInset: LOBBY_PAD }),
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 2, color: TEXT_MAIN }}>去死團的逆襲</div>
        <div style={{ fontSize: 11, color: TEXT_DIM }}>
          <span
            style={{
              display: "inline-block",
              width: 7,
              height: 7,
              borderRadius: "50%",
              marginRight: 5,
              background: wsStatus === "connected" ? OK : wsStatus === "connecting" ? GOLD : DANGER,
            }}
          />
          lobby {wsStatus}
        </div>
        <div style={{ flex: 1 }} />
        <Crystal amount={wallet?.crystal ?? 0} size={15} />
        <MCoin amount={wallet?.mcoin ?? 0} size={15} />
        <div style={{ fontSize: 13, color: TEXT_MAIN }}>
          {account?.username}
          <span style={{ color: TEXT_DIM, fontSize: 11 }}> · MMR {account?.mmr ?? "—"}</span>
        </div>
        <Btn small kind={lobbyView === "store" ? "primary" : "ghost"} onClick={() => setLobbyView(lobbyView === "store" ? "play" : "store")}>
          {lobbyView === "store" ? "Back to lobby" : "Store"}
        </Btn>
        {announcement && (
          <Btn small onClick={openAnnouncement} title={`最新公告：${announcement.title}`}>
            📢 公告
          </Btn>
        )}
        <Btn small onClick={openCodex} title="內容圖鑑：所有道具 / 英雄 / 技能的完整資料 (#codex)">
          📖 圖鑑
        </Btn>
        <Btn small onClick={() => setSettingsOpen(true)} title="graphics & network settings">
          ⚙ Settings
        </Btn>
        <Btn small onClick={() => setPasswordOpen(true)} title="修改我的登入密碼 · change your own password">
          🔑 密碼
        </Btn>
        <Btn small kind="danger" onClick={() => void doLogout()}>
          Logout
        </Btn>
      </div>
      {settingsOpen && <SettingsScreen onClose={() => setSettingsOpen(false)} />}
      {passwordOpen && <ChangePasswordDialog onClose={() => setPasswordOpen(false)} />}

      {/* body */}
      {lobbyView === "store" ? (
        <StoreScreen />
      ) : (
        // .ggd-lobby-body / .ggd-lobby-col let platform/ranking.css stack these
        // three fixed columns on a narrow viewport (phone portrait) — desktop
        // keeps the inline widths untouched.
        <div className="ggd-lobby-body" style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
          <div className="ggd-lobby-col" style={{ width: 260, display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
            <FriendsPanel />
            <ReferralPanel />
          </div>
          <div className="ggd-lobby-col" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            {!room && <BotMatchStrip mapId={offlineMap} onMapId={setOfflineMap} />}
            {room ? <RoomView /> : <RoomListPanel />}
          </div>
          <div className="ggd-lobby-col" style={{ width: 280, display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
            <LeaderboardPanel />
          </div>
        </div>
      )}

      <InviteToasts />
      <ErrorToast />
      {/* 大廳公告 (#259) — 「玩家會在大廳跳出訊息看到」. Self-gating: renders null
          unless the public feed handed us an announcement this browser has not
          already closed, so on an ordinary day the lobby is byte-identical to
          what it was. It is LAST in the tree and `position: fixed`, so it sits
          over the lobby without disturbing any panel's layout — and it stops
          short of the build-stamp band rather than covering it (#66/#107). */}
      <LobbyAnnouncement />
    </div>
  );
}
