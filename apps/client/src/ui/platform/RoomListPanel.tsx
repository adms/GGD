/**
 * RoomListPanel — open room browser (poll /lobby/rooms), create-room dialog
 * (name / mode / bot difficulty / localPlayers for future couch play) and the
 * join-by-code input for invite tokens.
 *
 * PINNED DEFAULT ROOM (GH#258) — owner: 「單人 vs BOT 變成 create room 底下預設
 * 的一個房間 (意思是這兩個也合併)」. The caller hands the entry down as `pinned`
 * and it renders as the FIRST row of the list, under the Create room button.
 * It is a slot rather than a hard-coded row on purpose: the bot-match entry is
 * lobby chrome (it owns the arena select, the payout badges and the store
 * action), and this panel stays what it is — the browser for rooms the
 * platform reports. Nothing here starts a match.
 *
 * `pinned` IS OPTIONAL AND MUST STAY OPTIONAL. There is exactly one caller
 * today, and it always passes the entry — so any change that starts assuming
 * `pinned` is present (an early return, a wrapper that needs a child, a
 * required prop) would break every future caller without a single existing
 * test noticing. `lobbyLayout.test.ts` therefore mounts THIS component with no
 * props at all and reads the browser back off the DOM. (Mutation-verified: an
 * `if (!pinned) return <Panel title="Rooms" />` early return fails it with
 * `expected null not to be null` on the room list container.)
 */
import { useEffect, useState } from "react";
import { useApp } from "./store";
import { Btn, TextInput, Panel, Badge, ACCENT, OK } from "./widgets";
import { ARENA_OPTIONS, DEFAULT_MAP_ID } from "./maps";
import { TEXT_DIM, TEXT_MAIN } from "../theme";

const ROOM_POLL_MS = 5000;

function CreateRoomDialog(props: { onClose: () => void }): React.JSX.Element {
  const createRoom = useApp((s) => s.createRoom);
  const [name, setName] = useState("");
  const [difficulty, setDifficulty] = useState("normal");
  const [mapId, setMapId] = useState(DEFAULT_MAP_ID);
  const [localPlayers, setLocalPlayers] = useState(1);
  // 肉鴿殭屍模式 (#215) — default CHECKED (ON) per the owner directive. Only when a
  // host UNCHECKS it does createRoom transmit `false` down the chain.
  const [rogueliteMobs, setRogueliteMobs] = useState(true);

  const selStyle: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #2c3448",
    background: "#10141f",
    color: TEXT_MAIN,
    fontSize: 13,
    width: "100%",
  };

  return (
    <div
      // task #197 — pad focus scopes to the create-room dialog (B / Cancel backs out)
      data-pad-scope="create-room"
      data-pad-scope-priority="45"
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(4,6,10,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 30,
        pointerEvents: "auto",
      }}
    >
      <Panel title="Create room" style={{ width: 320 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <TextInput value={name} onChange={setName} placeholder="room name" autoFocus />
          <div>
            <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 3 }}>Mode</div>
            <select style={selStyle} value="PairedDuels" onChange={() => undefined}>
              <option value="PairedDuels">Paired Duels (3v3v3v3)</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 3 }}>Arena</div>
            <select style={selStyle} value={mapId} onChange={(e) => setMapId(e.target.value)}>
              {ARENA_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 3 }}>
              Bot fill — empty seats are auto-filled with bots
            </div>
            <select style={selStyle} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="easy">easy bots</option>
              <option value="normal">normal bots</option>
              <option value="hard">hard bots</option>
            </select>
          </div>
          <label
            style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: TEXT_MAIN }}
          >
            <input
              type="checkbox"
              checked={rogueliteMobs}
              onChange={(e) => setRogueliteMobs(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <span>
              肉鴿殭屍模式{" "}
              <span style={{ fontSize: 11, color: TEXT_DIM }}>(第3場起喪屍湧入 · 預設開啟)</span>
            </span>
          </label>
          <div>
            <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 3 }}>
              Local players (couch co-op — coming soon)
            </div>
            <input
              type="number"
              min={1}
              max={1}
              value={localPlayers}
              onChange={(e) => setLocalPlayers(Math.max(1, Math.min(1, Number(e.target.value) || 1)))}
              style={{ ...selStyle, boxSizing: "border-box" }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <Btn
              kind="primary"
              style={{ flex: 1 }}
              onClick={() => {
                void createRoom(name.trim() || "New Room", difficulty, mapId, rogueliteMobs);
                props.onClose();
              }}
            >
              Create
            </Btn>
            <Btn onClick={props.onClose}>Cancel</Btn>
          </div>
        </div>
      </Panel>
    </div>
  );
}

export function RoomListPanel({ pinned }: { pinned?: React.ReactNode } = {}): React.JSX.Element {
  const rooms = useApp((s) => s.rooms);
  const refreshRooms = useApp((s) => s.refreshRooms);
  const joinRoom = useApp((s) => s.joinRoom);
  const joinByCode = useApp((s) => s.joinByCode);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    void refreshRooms();
    const t = setInterval(() => void refreshRooms(), ROOM_POLL_MS);
    return () => clearInterval(t);
  }, [refreshRooms]);

  const submitCode = (): void => {
    if (!code.trim()) return;
    void joinByCode(code);
    setCode("");
  };

  return (
    <Panel title="Rooms" style={{ flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <Btn kind="primary" onClick={() => setCreating(true)}>
          Create room
        </Btn>
        <div style={{ flex: 1 }} />
        <TextInput
          value={code}
          onChange={setCode}
          placeholder="invite code"
          onEnter={submitCode}
          style={{ width: 160 }}
        />
        <Btn small onClick={submitCode} style={{ flexShrink: 0 }}>
          Join by code
        </Btn>
      </div>

      <div data-ggd-room-list="" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {/* GH#258 — the default room, ahead of whatever the platform reports. */}
        {pinned}
        {rooms.length === 0 && (
          <div style={{ fontSize: 12, color: TEXT_DIM, padding: 8 }}>
            No open rooms — create one and invite your friends.
          </div>
        )}
        {rooms.map((r) => (
          <div
            key={r.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              marginBottom: 6,
              borderRadius: 8,
              background: "#141926",
              border: "1px solid #232b3d",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: TEXT_MAIN, overflow: "hidden", textOverflow: "ellipsis" }}>
                {r.name}
              </div>
              <div style={{ fontSize: 11, color: TEXT_DIM }}>
                {r.mode} · {r.botDifficulty} bots
              </div>
            </div>
            <Badge color={r.players < r.max ? OK : ACCENT}>
              {r.players}/{r.max}
            </Badge>
            <Btn small kind="primary" onClick={() => void joinRoom(r.id)}>
              Join
            </Btn>
          </div>
        ))}
      </div>
      {creating && <CreateRoomDialog onClose={() => setCreating(false)} />}
    </Panel>
  );
}
