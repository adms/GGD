/**
 * RoomView — inside a room: member list with ready states, ready toggle, host
 * start button, invite code display, and the room chat (lobby WS).
 * Membership/ready changes have no WS push, so the room is polled while open.
 *
 * ---------------------------------------------------------------------------
 * GH#491 — 這裡以前還有一個「充滿一堆 id」的下拉（owner 2026-08-21 的原話）
 * ---------------------------------------------------------------------------
 * 它是一個 `<select>`，把 `catalog.champions` 整份倒出來當選項，而 label 印的是
 * **原始 id**（`godie-e001`、`godie-h02u`⋯，實測 71 筆），沒有名字 ——
 * `CatalogChampion` 只有 `{id, price, owned}`，Go 的 `GET /store/catalog` 是
 * 刻意 name-free 的。#227 那一輪把 store 與排行榜接上 `championDisplayFor`，
 * 唯獨漏掉這一格，所以它是全大廳最後一個印 id 給玩家看的地方。
 *
 * ⛔ 而且它是**死的**（拆下來之前逐段量過）：
 *   ① 選了 → `setPick` → `POST /rooms/:id/ready {champion}` → 寫進 redis
 *      `room:<id>:champions`。到此為止。
 *   ② 那份 hash 全平台**只有一個讀者**：`room.Service.Start` 的持有權閘。
 *      而這個 `<select>` 對沒買的英雄下 `disabled`，所以那道閘從這個 UI
 *      **永遠觸發不了**；真的觸發也只能「擋住開始」，不會讓你玩到那隻。
 *   ③ `gamelink.Seat.Champion` 這個欄位在整個 platform **從來沒有被賦值過**
 *      —— 選擇從來沒有送到遊戲伺服器。真正的英雄選擇在場內
 *      `ui/panels/ChampSelectPanel`（由 `Seat.Owned` 權威把關）。
 *   ④ `GET /rooms/:id` 不回傳 picks，所以誰都看不到它，重整之後連自己都看不到。
 *   ⑤ 它自己的 placeholder 就寫著「pick champion in-game」。
 *
 * 伺服器那半（`PickChampion` + `readyReq.Champion` + 開場持有權閘）**刻意留著**：
 * 沒有寫入者之後它就是一道對偽造客戶端的防守，而且有 Go 測試在守。
 */
import { useEffect, useRef, useState } from "react";
import { useApp } from "./store";
import { memberSeatLabel, seatSum } from "./couch";
import { connectedPadIndices, listPadSources } from "../../input/GamepadInput";
import { Btn, TextInput, Panel, Badge, CodeBox, unescapeHtml, ACCENT, OK, DANGER } from "./widgets";
import { arenaLabel } from "./maps";
import { GOLD, TEXT_DIM, TEXT_MAIN } from "../theme";

// ⚠️ 從登錄表查（GH#324 之後有 13 張場地）—— 以前查的是一份寫死的五筆清單,
// 所以七張新圖在房間列表上只會顯示原始 id。
const mapLabel = (mapId: string): string => arenaLabel(mapId);

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
  const myReady = useApp((s) => s.myReady);
  const myLocalPlayers = useApp((s) => s.myLocalPlayers);
  const createdInvite = useApp((s) => s.createdInvite);
  const refreshRoom = useApp((s) => s.refreshRoom);
  const setReady = useApp((s) => s.setReady);
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

          {/* ready row. 英雄在場內的英雄選擇畫面挑 —— 見檔頭 GH#491。 */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <Btn
              kind={myReady ? "ghost" : "primary"}
              onClick={() => void setReady(!myReady)}
              style={{ flex: 1 }}
            >
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
