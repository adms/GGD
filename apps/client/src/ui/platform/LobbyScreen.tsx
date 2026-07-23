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
import { FriendsPanel } from "./FriendsPanel";
import { LeaderboardPanel } from "./LeaderboardPanel";
import { RoomListPanel } from "./RoomListPanel";
import { RoomView } from "./RoomView";
import { StoreScreen } from "./StoreScreen";
import { openCodex } from "../codex/CodexRoute";
import { topRightClear, topRightReserve } from "../chromeReserve";
import { Btn, MCoin, Panel, ACCENT, OK, DANGER } from "./widgets";
import { ARENA_OPTIONS, DEFAULT_MAP_ID } from "./maps";
import { GOLD, TEXT_DIM, TEXT_MAIN } from "../theme";

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

export function LobbyScreen(): React.JSX.Element {
  const account = useApp((s) => s.account);
  const wallet = useApp((s) => s.wallet);
  const wsStatus = useApp((s) => s.wsStatus);
  const lobbyView = useApp((s) => s.lobbyView);
  const setLobbyView = useApp((s) => s.setLobbyView);
  const room = useApp((s) => s.room);
  const doLogout = useApp((s) => s.doLogout);
  const playOffline = useApp((s) => s.playOffline);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
        <MCoin amount={wallet?.mcoin ?? 0} size={15} />
        <div style={{ fontSize: 13, color: TEXT_MAIN }}>
          {account?.username}
          <span style={{ color: TEXT_DIM, fontSize: 11 }}> · MMR {account?.mmr ?? "—"}</span>
        </div>
        <Btn small kind={lobbyView === "store" ? "primary" : "ghost"} onClick={() => setLobbyView(lobbyView === "store" ? "play" : "store")}>
          {lobbyView === "store" ? "Back to lobby" : "Store"}
        </Btn>
        <select
          value={offlineMap}
          onChange={(e) => setOfflineMap(e.target.value)}
          title="offline arena"
          style={{
            padding: "5px 8px",
            borderRadius: 6,
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
        <Btn small onClick={() => playOffline(offlineMap)} title="dev direct-join — no platform match record">
          Play vs bots
        </Btn>
        <Btn small onClick={openCodex} title="內容圖鑑：所有道具 / 英雄 / 技能的完整資料 (#codex)">
          📖 圖鑑
        </Btn>
        <Btn small onClick={() => setSettingsOpen(true)} title="graphics & network settings">
          ⚙ Settings
        </Btn>
        <Btn small kind="danger" onClick={() => void doLogout()}>
          Logout
        </Btn>
      </div>
      {settingsOpen && <SettingsScreen onClose={() => setSettingsOpen(false)} />}

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
          </div>
          <div className="ggd-lobby-col" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            {room ? <RoomView /> : <RoomListPanel />}
          </div>
          <div className="ggd-lobby-col" style={{ width: 280, display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
            <LeaderboardPanel />
          </div>
        </div>
      )}

      <InviteToasts />
      <ErrorToast />
    </div>
  );
}
