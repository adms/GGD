/**
 * RoomView — inside a room: member list with ready states, champion pick
 * dropdown (owned champions only), ready toggle, host start button, invite
 * code display, and the room chat (lobby WS). Membership/ready changes have
 * no WS push, so the room is polled while open.
 */
import { useEffect, useRef, useState } from "react";
import { useApp } from "./store";
import { memberSeatLabel, seatSum } from "./couch";
import { connectedPadIndices, listPadSources } from "../../input/GamepadInput";
import { Btn, TextInput, Panel, Badge, CodeBox, unescapeHtml, ACCENT, OK, DANGER } from "./widgets";
import { ARENA_OPTIONS } from "./maps";
import { GOLD, TEXT_DIM, TEXT_MAIN } from "../theme";

const mapLabel = (mapId: string): string =>
  ARENA_OPTIONS.find((m) => m.id === mapId)?.label ?? (mapId || "Skeleton (預設)");

const ROOM_POLL_MS = 2000;
const PAD_POLL_MS = 150;

/**
 * Pad-join prompt: when a NEW pad connects while in the room, offer
 * "press A to join" — pressing A on that pad adds a local (couch) player.
 */
function usePadJoinPrompt(
  myLocalPlayers: number,
  canAdd: boolean,
  onJoin: () => void,
): { promptPad: number | null; dismiss: () => void } {
  const [promptPad, setPromptPad] = useState<number | null>(null);
  const known = useRef<number[] | null>(null);
  const armed = useRef(false);

  useEffect(() => {
    const t = setInterval(() => {
      const pads = listPadSources();
      const indices = connectedPadIndices(pads);
      if (known.current === null) {
        known.current = indices; // pads present at mount don't prompt
        return;
      }
      const fresh = indices.find((i) => !known.current!.includes(i));
      known.current = indices;
      if (fresh !== undefined && canAdd && promptPad === null) {
        setPromptPad(fresh);
        armed.current = false; // require a release before A counts
      }
      if (promptPad !== null) {
        if (!indices.includes(promptPad)) {
          setPromptPad(null); // the pad went away
          return;
        }
        const aDown = pads[promptPad]?.buttons[0]?.pressed === true;
        if (!aDown) armed.current = true;
        else if (armed.current) {
          setPromptPad(null);
          onJoin();
        }
      }
    }, PAD_POLL_MS);
    return () => clearInterval(t);
  }, [myLocalPlayers, canAdd, promptPad, onJoin]);

  return { promptPad, dismiss: () => setPromptPad(null) };
}

function ChatBox(): React.JSX.Element {
  const chat = useApp((s) => s.ws.chat);
  const wsError = useApp((s) => s.ws.wsError);
  const sendChat = useApp((s) => s.sendChat);
  const meId = useApp((s) => s.account?.id);
  const [text, setText] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [chat.length]);

  const submit = (): void => {
    if (!text.trim()) return;
    sendChat(text);
    setText("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div
        ref={logRef}
        style={{
          flex: 1,
          overflowY: "auto",
          minHeight: 60,
          background: "#10141f",
          border: "1px solid #232b3d",
          borderRadius: 8,
          padding: 8,
          marginBottom: 6,
        }}
      >
        {chat.length === 0 && <div style={{ fontSize: 11, color: TEXT_DIM }}>say hi…</div>}
        {chat.map((m, i) => (
          <div key={`${m.at}-${i}`} style={{ fontSize: 12, marginBottom: 3, wordBreak: "break-word" }}>
            <span style={{ color: m.from === meId ? ACCENT : GOLD, fontWeight: 600 }}>
              {unescapeHtml(m.fromName || m.from)}
            </span>
            <span style={{ color: TEXT_MAIN }}> {unescapeHtml(m.text)}</span>
          </div>
        ))}
      </div>
      {wsError && (
        <div style={{ fontSize: 11, color: "#f08c8c", marginBottom: 4 }}>
          {wsError.code}: {wsError.message}
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <TextInput value={text} onChange={setText} placeholder="chat…" onEnter={submit} />
        <Btn small onClick={submit} style={{ flexShrink: 0 }}>
          Send
        </Btn>
      </div>
    </div>
  );
}

export function RoomView(): React.JSX.Element | null {
  const room = useApp((s) => s.room);
  const meId = useApp((s) => s.account?.id);
  const friends = useApp((s) => s.friends);
  const myPick = useApp((s) => s.myPick);
  const myReady = useApp((s) => s.myReady);
  const myLocalPlayers = useApp((s) => s.myLocalPlayers);
  const createdInvite = useApp((s) => s.createdInvite);
  const catalog = useApp((s) => s.catalog);
  const refreshRoom = useApp((s) => s.refreshRoom);
  const setReady = useApp((s) => s.setReady);
  const setPick = useApp((s) => s.setPick);
  const setLocalPlayers = useApp((s) => s.setLocalPlayers);
  const updateRoomSettings = useApp((s) => s.updateRoomSettings);
  const startMatch = useApp((s) => s.startMatch);
  const leaveRoom = useApp((s) => s.leaveRoom);

  useEffect(() => {
    const t = setInterval(() => void refreshRoom(), ROOM_POLL_MS);
    return () => clearInterval(t);
  }, [refreshRoom]);

  const seats = room ? seatSum(room.members) : 0;
  const canAddLocal = room !== null && myLocalPlayers < 4 && seats < 12;
  const { promptPad, dismiss } = usePadJoinPrompt(myLocalPlayers, canAddLocal, () =>
    void setLocalPlayers(myLocalPlayers + 1),
  );

  if (!room) return null;
  const iAmHost = room.room.hostId === meId;
  const allReady = room.members.every((m) => m.ready || m.isHost);
  const nameOf = (accountId: string): string => {
    if (accountId === meId) return "you";
    return friends?.friends.find((f) => f.id === accountId)?.username ?? accountId.slice(0, 10) + "…";
  };

  return (
    <Panel title={`Room · ${room.room.name}`} style={{ flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", gap: 14, flex: 1, minHeight: 0 }}>
        {/* members + controls */}
        <div style={{ flex: 1.2, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 6 }}>
            {seats}/12 seats · {12 - seats} bot fill · {room.room.botDifficulty} bots · {room.room.mode}
            <br />
            🗺 <span style={{ color: TEXT_MAIN }}>{mapLabel(room.room.mapId)}</span>
          </div>
          {/* 肉鴿殭屍模式 (#215) — host-only toggle; absent === ON. Takes effect for
              the NEXT match (arenaRules is frozen at match start). */}
          {iAmHost ? (
            <label
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: TEXT_MAIN, marginBottom: 6 }}
            >
              <input
                type="checkbox"
                checked={room.room.rogueliteMobs !== false}
                onChange={(e) => void updateRoomSettings({ rogueliteMobs: e.target.checked })}
                style={{ width: 15, height: 15 }}
              />
              肉鴿殭屍模式{" "}
              <span style={{ fontSize: 11, color: TEXT_DIM }}>(下一場生效)</span>
            </label>
          ) : (
            <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 6 }}>
              肉鴿殭屍模式: <span style={{ color: TEXT_MAIN }}>{room.room.rogueliteMobs !== false ? "開啟" : "關閉"}</span>
            </div>
          )}
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {room.members.map((m) => (
              <div
                key={m.accountId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  marginBottom: 4,
                  borderRadius: 8,
                  background: m.accountId === meId ? "rgba(80,100,160,0.25)" : "#141926",
                }}
              >
                <span style={{ flex: 1, fontSize: 13, color: TEXT_MAIN, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {nameOf(m.accountId)}
                </span>
                {memberSeatLabel(m.localPlayers) && <Badge color={ACCENT}>🎮 {memberSeatLabel(m.localPlayers)}</Badge>}
                {m.isHost && <Badge color={GOLD}>host</Badge>}
                {(!m.isHost || m.ready) && (
                  <Badge color={m.ready ? OK : DANGER}>{m.ready ? "ready" : "not ready"}</Badge>
                )}
              </div>
            ))}
          </div>

          {/* couch (local) players on this machine */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <span style={{ fontSize: 12, color: TEXT_DIM }}>
              本機玩家: <b style={{ color: TEXT_MAIN }}>{myLocalPlayers}</b>
              {myLocalPlayers > 1 ? " (split-screen)" : ""}
            </span>
            <Btn small disabled={!canAddLocal} onClick={() => void setLocalPlayers(myLocalPlayers + 1)}>
              + 本機玩家
            </Btn>
            {myLocalPlayers > 1 && (
              <Btn small kind="ghost" onClick={() => void setLocalPlayers(myLocalPlayers - 1)}>
                −
              </Btn>
            )}
          </div>
          {promptPad !== null && (
            <div
              style={{
                marginTop: 6,
                padding: "6px 10px",
                borderRadius: 8,
                background: "rgba(90,120,200,0.18)",
                border: "1px solid #3d4f80",
                fontSize: 12,
                color: TEXT_MAIN,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ flex: 1 }}>
                🎮 Pad #{promptPad + 1} detected — press <b>A</b> to join as {myLocalPlayers + 1}P
              </span>
              <Btn small kind="ghost" onClick={dismiss}>
                dismiss
              </Btn>
            </div>
          )}

          {/* champion pick + ready row */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <select
              value={myPick}
              onChange={(e) => setPick(e.target.value)}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #2c3448",
                background: "#10141f",
                color: TEXT_MAIN,
                fontSize: 13,
              }}
            >
              <option value="">pick champion in-game</option>
              {(catalog?.champions ?? []).map((c) => (
                <option key={c.id} value={c.id} disabled={!c.owned}>
                  {c.id}
                  {c.owned ? "" : ` (locked · Ⓜ${c.price})`}
                </option>
              ))}
            </select>
            <Btn kind={myReady ? "ghost" : "primary"} onClick={() => void setReady(!myReady)}>
              {myReady ? "Unready" : "Ready"}
            </Btn>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {iAmHost && (
              <Btn
                kind="primary"
                disabled={!allReady}
                title={allReady ? "start the match" : "everyone must ready up first"}
                onClick={() => void startMatch()}
                style={{ flex: 1 }}
              >
                Start match
              </Btn>
            )}
            <Btn kind="danger" onClick={() => void leaveRoom()}>
              Leave
            </Btn>
          </div>

          {createdInvite && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 4 }}>
                invite for <span style={{ color: TEXT_MAIN }}>{createdInvite.forName}</span> (also sent live · 10 min):
              </div>
              <CodeBox value={createdInvite.token} />
            </div>
          )}
          {iAmHost && !createdInvite && (
            <div style={{ marginTop: 10, fontSize: 11, color: TEXT_DIM }}>
              invite friends from the Friends panel — they get a live prompt + a code
            </div>
          )}
        </div>

        {/* chat */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <ChatBox />
        </div>
      </div>
    </Panel>
  );
}
