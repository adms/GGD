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
import { Configs } from "@ggd/shared/content";
import type { ConfigMatchDoc } from "@ggd/shared/content";
import {
  MAX_ROUNDS_UNLIMITED,
  ROOM_SETTING_KEYS,
  ROOM_SETTING_LIMITS,
  minCombatMaxSecFor,
  type RoomMatchSettings,
  type RoomSettingKey,
} from "@ggd/shared/roomSettings";
import type { OpenRoom } from "./types";
import { appStore, useApp } from "./store";
import { Btn, TextInput, Panel, Badge, FieldError, ACCENT, OK } from "./widgets";
import { useArenaOptions, DEFAULT_MAP_ID } from "./maps";
import { useContentReady } from "./ContentGate";
import { TEXT_DIM, TEXT_MAIN } from "../theme";

const ROOM_POLL_MS = 5000;

// ------------------------------------------------- 房主每房設定 (#288) ----

/**
 * 建房表單的四格（選角 / 商店 / 每回合時間 + 總回合數）—— **一律存字串**。
 *
 * 空字串是這個功能唯一重要的狀態：「房主沒碰這一格」。存成 number 就得拿 0 或
 * NaN 去代表「沒填」，而 0 對三個時間欄位是越界拒絕、對 `maxRounds` 是「不設限」
 * —— 兩種都不是使用者的意思。
 */
export type RoomSettingsForm = Record<RoomSettingKey, string>;

export const EMPTY_ROOM_SETTINGS_FORM: RoomSettingsForm = {
  champSelectSec: "",
  intermissionSec: "",
  combatMaxSec: "",
  maxRounds: "",
};

/**
 * 表單 → `RoomMatchSettings`。
 *
 * ⭐ **承重點**：留空的格子**不可以出現在回傳的物件裡**（契約語意①，缺席 ≠ 重設）。
 * 房主沒碰的欄位要一路缺席到伺服器，才會退回 `content/config/config.match.json`
 * 的出貨值 —— 包含 vs bot 的 320 秒選角。送一個 0 下去會被當成「明確設定 0」。
 */
/**
 * ⭐ 房間的牌位區間，一句話（⛔ 沒有牌位資訊 ⇒ `null`，呼叫端整段不畫）。
 *
 * ⚠️ ⭐ **順序不在這裡算** —— Go 那一側用 `ranking.TierRank` 決定了哪個低哪個高，
 * ⛔ 而前端再排一次就是第二個住處（加一個牌位的那天它會安靜地錯）。
 * ⇒ 這裡只負責**怎麼寫成一句話**。
 */
function roomTierRange(r: OpenRoom): string | null {
  if (r.tierLow === undefined || r.tierLow === "") return null;
  if (r.tierHigh === undefined || r.tierHigh === "" || r.tierHigh === r.tierLow) {
    return r.tierLow;
  }
  return `${r.tierLow}〜${r.tierHigh}`;
}

export function roomSettingsFromForm(form: RoomSettingsForm): RoomMatchSettings {
  const out: RoomMatchSettings = {};
  for (const key of ROOM_SETTING_KEYS) {
    const raw = (form[key] ?? "").trim();
    if (raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue; // 打壞的輸入等同沒填，不要送 NaN
    out[key] = n;
  }
  return out;
}

/** `config.match@1` 的 match 區塊 —— 這一頁讀出貨預設值的**唯一**來源。 */
interface ShippedMatchBlock {
  champSelectSec?: number;
  champSelectSecVsBot?: number;
  intermissionSec?: number;
  combatMaxSec?: number;
  maxRounds?: number;
  fireRing?: { startSec?: number; shrinkSec?: number; stage2StartSec?: number; stage2ShrinkSec?: number };
}

function shippedMatchBlock(): ShippedMatchBlock | undefined {
  const doc = Configs.tryGet("config.match") as unknown as ConfigMatchDoc | undefined;
  return doc?.schema === "config@1" ? (doc.match as unknown as ShippedMatchBlock) : undefined;
}

const numText = (n: number | undefined): string => (typeof n === "number" ? String(n) : "預設");

interface RoomSettingField {
  key: RoomSettingKey;
  label: string;
  placeholder: string;
  hint: string;
  min: number;
  max: number;
  step: number;
}

/**
 * 四格的畫面定義。**這一頁不擁有任何一個數字**：上下界來自
 * `ROOM_SETTING_LIMITS`（契約），預設值來自載入的 `config.match@1`。
 *
 * ⚠️ `combatMaxSec` 的下界是**推導的**（契約語意③）：`config@1` 有一條跨欄位
 * 不變式「火圈起燃 + 整個收完 <= combatMaxSec」，而那條 refine 只在載入內容時
 * 跑，攔不到房間設定。所以這裡用 `minCombatMaxSecFor(出貨火圈)` 算；內容還沒
 * 載入完（大廳不等內容）就退回靜態絕對下界，**並且接受伺服器可能回拒** ——
 * 伺服器才是權威，這個 min 只是先擋住明顯的誤植。
 */
function roomSettingFields(m: ShippedMatchBlock | undefined): readonly RoomSettingField[] {
  const ring = m?.fireRing;
  const minCombat =
    typeof ring?.startSec === "number" && typeof ring?.shrinkSec === "number"
      ? minCombatMaxSecFor({
          startSec: ring.startSec,
          shrinkSec: ring.shrinkSec,
          stage2StartSec: ring.stage2StartSec,
          stage2ShrinkSec: ring.stage2ShrinkSec,
        })
      : ROOM_SETTING_LIMITS.combatMaxSec.min;
  const L = ROOM_SETTING_LIMITS;
  const vsBot = m?.champSelectSecVsBot ?? m?.champSelectSec;
  return [
    {
      key: "champSelectSec",
      label: "選角時間（秒）",
      placeholder: numText(m?.champSelectSec),
      hint: `留空 = 用預設（一般 ${numText(m?.champSelectSec)} 秒 · vs bot ${numText(vsBot)} 秒）`,
      min: L.champSelectSec.min,
      max: L.champSelectSec.max,
      step: 1,
    },
    {
      key: "intermissionSec",
      label: "商店時間（秒）",
      placeholder: numText(m?.intermissionSec),
      hint: `留空 = 用預設（${numText(m?.intermissionSec)} 秒）`,
      min: L.intermissionSec.min,
      max: L.intermissionSec.max,
      step: 1,
    },
    {
      key: "combatMaxSec",
      label: "每回合時間（秒）",
      placeholder: numText(m?.combatMaxSec),
      hint: `留空 = 用預設（${numText(m?.combatMaxSec)} 秒）· 至少 ${minCombat} 秒，火圈才收得完`,
      min: minCombat,
      max: L.combatMaxSec.max,
      step: 1,
    },
    {
      key: "maxRounds",
      label: "總回合數",
      placeholder: numText(m?.maxRounds ?? MAX_ROUNDS_UNLIMITED),
      // ⚠️ 這句話寫錯過一次（第三守則）：不設限**不是**「打到某隊團隊生命歸零」。
      // owner 2026-07-27 取消淘汰之後，團隊生命只是計分板，歸零不會讓任何人出局；
      // 今天唯一的結束條件是打完賽制的最後一回合（決賽）。所以設得比賽制總回合數
      // 還大的數字沒有效果 —— 兩條是 OR，決賽先到。房主看不到那個數字，所以這裡
      // 只說「沒有效果」，不在客戶端替它開第四個住處。
      hint: `留空 = 用預設 · ${MAX_ROUNDS_UNLIMITED} = 不設限（照賽制打到最後一回合）· 設得比賽制總回合數還大不會有效果`,
      min: L.maxRounds.min,
      max: L.maxRounds.max,
      step: 1,
    },
  ];
}

function CreateRoomDialog(props: { onClose: () => void }): React.JSX.Element {
  const createRoom = useApp((s) => s.createRoom);
  const [name, setName] = useState("");
  const [difficulty, setDifficulty] = useState("normal");
  const [mapId, setMapId] = useState(DEFAULT_MAP_ID);
  // ⭐ 從 `Arenas` 登錄表推導（GH#324 的七張新圖以前選不到 —— 這裡本來是一份
  //    寫死的五筆清單）。內容是背景載入的，載完 hook 自動重算。
  const arenaOpts = useArenaOptions();
  const [localPlayers, setLocalPlayers] = useState(1);
  // 肉鴿殭屍模式 (#215) — default CHECKED (ON) per the owner directive. Only when a
  // host UNCHECKS it does createRoom transmit `false` down the chain.
  const [rogueliteMobs, setRogueliteMobs] = useState(true);
  // #288 房主每房設定。四格全部從空字串開始 = 四格全部缺席 = 全部用出貨值。
  const [settingsForm, setSettingsForm] = useState<RoomSettingsForm>(EMPTY_ROOM_SETTINGS_FORM);
  const [busy, setBusy] = useState(false);
  // 語意②：伺服器指名的越界欄位必須被看見 —— 留在對話框裡，不靜默關掉重開。
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  // 大廳不等內容載入完（ContentGate 只擋 match 畫面），所以出貨預設值可能還沒
  // 到。訂閱這個訊號，內容一落地就用真的數字重畫 placeholder 與動態下界。
  useContentReady();
  const fields = roomSettingFields(shippedMatchBlock());

  const submit = (): void => {
    if (busy) return;
    setBusy(true);
    setSubmitErr(null);
    void (async () => {
      await createRoom(
        name.trim() || "New Room",
        difficulty,
        mapId,
        rogueliteMobs,
        roomSettingsFromForm(settingsForm),
      );
      setBusy(false);
      // store.createRoom 把失敗吞進 lastError；房間有建起來才關對話框。
      if (appStore.getState().room) {
        props.onClose();
        return;
      }
      setSubmitErr(appStore.getState().lastError ?? "建立房間失敗");
    })();
  };

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
              {arenaOpts.map((m) => (
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
          {/* #288 —— 房主的四格。留空 = 缺席 = 用出貨值（含 vs bot 的選角長度）。 */}
          <div data-ggd-room-settings="" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {fields.map((f) => (
              <div key={f.key}>
                <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 3 }}>
                  {f.label} <span style={{ opacity: 0.8 }}>— {f.hint}</span>
                </div>
                <input
                  type="number"
                  data-ggd-room-setting={f.key}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  placeholder={f.placeholder}
                  value={settingsForm[f.key]}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  style={{ ...selStyle, boxSizing: "border-box" }}
                />
              </div>
            ))}
          </div>
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
          <FieldError text={submitErr} />
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <Btn kind="primary" style={{ flex: 1 }} disabled={busy} onClick={submit}>
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
                {roomTierRange(r) !== null && <> · {roomTierRange(r)}</>}
              </div>
              {/* ⭐ GH#915 —— 房主是誰、誰在裡面、什麼牌位。
                  ⚠️ `members` **缺席**（舊伺服器／seam 沒注入）⇒ ⛔ 整段不畫，
                  ⭐ 而不是畫一個空框：那會讓「沒接線」看起來像「房裡沒人」。 */}
              {r.members !== undefined && r.members.length > 0 && (
                <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2 }}>
                  {r.members.map((m, i) => (
                    <span key={`${m.username}-${i}`}>
                      {i > 0 && "、"}
                      {m.host && <span title="房主">👑</span>}
                      {/* ⭐ 名字查不到時顯示「—」，⛔ 不是空白：
                          一個空白看起來像渲染壞了，一個「—」看得出是缺資料。 */}
                      {m.username === "" ? "—" : m.username}
                      {m.tier !== undefined && m.tier !== "" && (
                        <span style={{ opacity: 0.75 }}>
                          {" "}
                          {m.tier}
                          {m.division !== undefined && m.division !== "" ? ` ${m.division}` : ""}
                        </span>
                      )}
                    </span>
                  ))}
                  {r.moreMembers !== undefined && r.moreMembers > 0 && (
                    <span style={{ opacity: 0.75 }}>　還有 {r.moreMembers} 人</span>
                  )}
                </div>
              )}
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
