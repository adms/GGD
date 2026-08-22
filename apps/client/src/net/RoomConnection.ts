/**
 * RoomConnection — the colyseus.js seam. Dev flow: joinOrCreate("match")
 * directly (the server backfills bots; no ticket needed without a shared
 * secret). Platform flow: consume a seat reservation minted by the Go
 * platform (seatToken) which carries the onAuth ticket.
 * Server events (MSG.EVENT) queue here and are drained once per frame by the
 * GameApp loop — network → sim-event fanout never runs inside a socket callback.
 */
import { Client, type Room, type SeatReservation } from "colyseus.js";
import { perfBus } from "../perfBus";
import type { MatchState } from "@ggd/shared/protocol/schema";
import { recordReject } from "./RoomStore";
import {
  MSG,
  unpackEventBatch,
  type Cheat,
  type CheatMessage,
  type EventBatchMessage,
  type EventMessage,
  type InputMessage,
  type SelectChampionMessage,
} from "@ggd/shared/protocol/messages";

// NOTE: we deliberately do NOT pass the shared MatchState class as rootSchema.
// colyseus.js reflects the schema from the server handshake and builds its own
// tracked classes; the shared classes are used as a TYPE only. (The shared
// schema classes use class-field initializers, which — compiled with ES2022
// [[Define]] semantics — shadow @colyseus/schema's per-instance accessor
// descriptors and break change tracking. Reflection sidesteps that entirely.)

/** Hosts that mean "this machine", where a hardcoded localhost target is safe. */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1", ""]);

// ------------------------------------------------------------- 迴避 (#92b) --
/**
 * 迴避 SIGHTINGS — the ONE event the presentation layer needs that the frame
 * loop does not hand it.
 *
 * `evade` (packages/shared/src/sim/combat/evasion.ts) is a total miss: no damage
 * packet, no `damage` event, no on-hit hook. Nothing downstream of the frame
 * loop can infer it, so before this the client drew nothing at all for a dodge —
 * it was indistinguishable from a dropped packet, which is exactly the
 * 「看不出剛剛發生什麼事」 complaint.
 *
 * WHY IT IS PUBLISHED AS RAW NUMBERS AND NOT RENDERED HERE. `net/*` owns no UI
 * copy and imports no `ui/*` — RoomStore's header states the rule and this
 * module's does too ("network → sim-event fanout never runs inside a socket
 * callback"). So this is a BUFFER, not a fanout: identical in kind to
 * `queuedEvents`, four numbers wide, with the label text and every styling
 * decision left to ui/WorldAnchorLayer, which drains it on its own rAF.
 *
 * DEDUPE. In couch play (net/MultiSession) N RoomConnections join the SAME room,
 * so one dodge arrives N times, once per local seat. Identical sightings inside
 * one arrival window collapse here rather than relying on the downstream
 * coalesce — which would also work, but silently, and only while the two windows
 * happen to line up.
 */
export interface EvadeSighting {
  /** attacker entity id; undefined when the packet carried none */
  source: number | undefined;
  /** defender entity id — the body that slipped the hit */
  target: number;
  x: number;
  z: number;
  /** client arrival time (`performance.now()`), the text's birth stamp */
  atMs: number;
  /**
   * 這一筆是哪一種 sighting 的 **token**（今天只有 `"immune"`；缺席 = 普通迴避）。
   * ⭐ 這是 `immune` 借用這個緩衝區的方式 —— ⛔ 不是第二個緩衝區。
   * ⚠️ 它**不是要畫的那串字**：`net/*` 不擁有任何 UI 文案，連引用都不行
   *（`evadeSightings.test.ts` 掃這個檔的原始碼）。token → 人看得懂的字
   * 是 `ui/WorldAnchorLayer.tsx::EVADE_LABELS` 的工作。
   */
  label?: string;
}

/** Bounded: a dropped dodge label is a cosmetic loss, an unbounded queue is not. */
const MAX_EVADE_SIGHTINGS = 32;
/** Two connections in one room see the same dodge within a socket turn. */
const EVADE_DEDUPE_MS = 20;
const evadeSightings: EvadeSighting[] = [];

function nowMsSafe(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Record one dodge, unless this exact dodge was already recorded just now.
 *
 * `label` overrides the drawn text — that is how `immune` rides this buffer
 * without a second one. ⚠️ It is part of the DEDUPE key: an immunity and a dodge
 * on the same body in the same socket turn are two different things the player
 * must see, so collapsing them would hide one of them. (Neither label's actual
 * text is quoted here — `net/*` owns no UI copy, and `evadeSightings.test.ts`
 * greps this file for exactly that.)
 */
export function recordEvade(data: Record<string, unknown>, label?: string): void {
  const target = data.target;
  if (typeof target !== "number") return;
  const source = typeof data.source === "number" ? data.source : undefined;
  const x = typeof data.x === "number" ? data.x : 0;
  const z = typeof data.z === "number" ? data.z : 0;
  const atMs = nowMsSafe();
  for (let i = evadeSightings.length - 1; i >= 0; i--) {
    const e = evadeSightings[i]!;
    if (atMs - e.atMs > EVADE_DEDUPE_MS) break; // buffer is append-ordered
    if (e.target === target && e.source === source && e.label === label) return;
  }
  evadeSightings.push({ source, target, x, z, atMs, ...(label !== undefined ? { label } : {}) });
  if (evadeSightings.length > MAX_EVADE_SIGHTINGS) {
    evadeSightings.splice(0, evadeSightings.length - MAX_EVADE_SIGHTINGS);
  }
}

/** Take every dodge seen since the last call. Drained by ui/WorldAnchorLayer. */
export function drainEvadeSightings(): EvadeSighting[] {
  if (evadeSightings.length === 0) return [];
  const out = evadeSightings.slice();
  evadeSightings.length = 0;
  return out;
}

/** Match teardown / test isolation. */
export function clearEvadeSightings(): void {
  evadeSightings.length = 0;
}

// ------------------------------------------------------ display name (#156) --
// The dev/LAN direct-join path claims an AI seat that carries a generic
// "Bot N"/"Player N" label; MatchRoom.onJoin renames it from
// `options.displayName`, but nothing ever SENT one — so the human's own seat
// read "Player 0" in the one game where knowing who is who is the whole point.
//
// net/* must not import ui/*, so the logged-in username is PUBLISHED here by
// the platform store (setLocalDisplayName on login, cleared on logout) rather
// than threaded through GameApp. Sanitising client-side is not a security
// control — the server re-sanitises authoritatively — it just guarantees the
// name we send is already a fixpoint of the server's rule, so what the player
// typed as a username is what they see on their seat (or nothing at all).

/** Mirror of the server's sanitizeText.MAX_DISPLAY_NAME. */
export const MAX_DISPLAY_NAME = 32;

/** HTML-significant characters + backtick/backslash, per the server's rule. */
const BLOCKED_CODES: ReadonlySet<number> = new Set<number>([
  0x3c, // <
  0x3e, // >
  0x26, // &
  0x22, // "
  0x27, // '
  0x60, // backtick
  0x5c, // backslash
]);

/**
 * Byte-for-byte mirror of apps/game-server/src/net/sanitizeText.ts: drop C0
 * controls, DEL and the HTML-significant set, then trim and bound the length.
 * Spaces and CJK survive intact.
 */
export function sanitizeDisplayName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    if (code <= 0x1f || code === 0x7f || BLOCKED_CODES.has(code)) continue;
    out += ch;
  }
  return out.trim().slice(0, MAX_DISPLAY_NAME);
}

/** The logged-in account's username, published by the platform store. */
let localDisplayName = "";

/** Called on login / session restore (and with "" on logout). */
export function setLocalDisplayName(name: string | null | undefined): void {
  localDisplayName = sanitizeDisplayName(name ?? "");
}

/** Current published name — "" when nobody is logged in. */
export function getLocalDisplayName(): string {
  return localDisplayName;
}

/**
 * Couch seat number of an account id: 1 for the owner, 2..4 for the ":pN"
 * guest pseudo-ids minted by MultiSession (mirrors ui/platform/couch.ts, which
 * net/* cannot import).
 */
function couchPlayerNumber(accountId: string): number {
  const i = accountId.lastIndexOf(":p");
  if (i <= 0) return 1;
  const n = Number(accountId.slice(i + 2));
  return Number.isInteger(n) && n >= 2 ? n : 1;
}

/**
 * Where to open the Colyseus socket.
 *
 * SAME-ORIGIN FIRST. vite.config.ts proxies `/colyseus` → localhost:2567 with
 * `ws: true`, so routing through the page's own origin works for every way the
 * client is served — including LAN playtests, where a phone or a second laptop
 * loads http://<mac-lan-ip>:39527. A hardcoded `ws://localhost:2567` resolves to
 * the PHONE on a phone, so it could never connect; that was the one thing
 * standing between this dev setup and multi-device testing.
 *
 * Loopback keeps the direct target so a bare `vite preview`, a unit test or a
 * tool that talks to the game server without the proxy still works.
 */
export function defaultEndpoint(): string {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  if (env?.VITE_GAME_WS) return env.VITE_GAME_WS; // explicit override always wins
  if (typeof location === "undefined") return "ws://localhost:2567"; // node/vitest
  if (location.protocol === "https:") return `wss://${location.host}/colyseus`;
  if (!LOOPBACK.has(location.hostname)) return `ws://${location.host}/colyseus`;
  return "ws://localhost:2567";
}

/**
 * ⭐ GH#570 —— 一間在我離開**之後**才抵達的房被當場退掉了。
 * ⛔ 不是一行沒有人讀的 log：它進 `perfBus`,而 `ui/PerfOverlay` 的常駐 chip
 * 把非零的數字**畫在畫面上**（第二守則：fail-open 沒錯,**靜默**才是缺陷）。
 */
export function noteOrphanRoom(): void {
  perfBus.orphanRooms++;
}

export class RoomConnection {
  room: Room<MatchState> | null = null;
  readonly accountId: string;
  /** per-connection override; falls back to the published local name */
  readonly displayNameOverride: string;
  private readonly queuedEvents: EventMessage[] = [];
  onDisconnect: ((code: number) => void) | null = null;
  /**
   * ⭐ GH#570 —— **已經離開了嗎**。
   *
   * ⛔ 在此之前 `leave()` 做的是 `void this.room?.leave(true)`，而 `this.room`
   * 要等 `await client.create(...)` 回來、`bind()` 跑完才有值 ⇒ 離開落在 join
   * 的窗口裡時，`leave()` **靜靜什麼都沒做**，接著 `bind()` 把 4 個 onMessage
   * ＋ socket 接上一條**已經死掉的連線**。而 `main.tsx` 的
   * `const join = app.connect();` **從來不 await** ⇒ `stopMatch()` 可以落在
   * 那個 await 的任何一刻。
   *
   * ⭐ 量到的窗口寬度（主執行緒每幀被卡 0 / 60 / 250 / 800 ms 時）：
   * **31 / 370 / 1,511 / 4,817 ms** —— ⇒ 越 LAG 窗口越寬、越容易多一間幽靈房，
   * 而每一間 = 一條 20 Hz socket ＋ 伺服器一間**永不 autoDispose** 的房（30 tick/s）
   * ⇒ 更 LAG。**正回饋，⛔ 不是兩件事。**
   */
  private disposed = false;

  /**
   * ⭐ GH#592 —— `bind()` 掛上去的東西，`leave()` 要**逐一**拆下來。
   *
   * ⛔ 在此之前 `leave()` 只送一個 `LEAVE_ROOM` 位元組就把 `this.room` 設成 null，
   * 而那條 socket 上的 4 個 `onMessage` ＋ 1 個 `onLeave` **原封不動掛著** ——
   * 真正清掉它們的是 colyseus.js `Room` 建構子那行 `onLeave(() => removeAllListeners())`，
   * 也就是**伺服器真的回關閉之後**。探針量到 handler **4 → 8 → … → 32**（8 輪）。
   *
   * ⚠️ 既有的 `teardown.test.ts` 看不到它：那支的 `attach()` **直接指派 `conn.room`，
   * 從不呼叫 `bind()`** —— 失敗形態⑤（被測的不是出貨的那條路）。
   */
  private readonly disposers: (() => void)[] = [];

  constructor(accountId?: string, displayName?: string) {
    this.accountId = accountId ?? `dev-${Math.random().toString(36).slice(2, 10)}`;
    this.displayNameOverride = sanitizeDisplayName(displayName ?? "");
  }

  /**
   * Name to claim the seat with, "" when unknown (server then falls back to
   * "Player N"). Couch guests get the "(2P)".."(4P)" suffix so three people on
   * one couch don't all read as the same account holder.
   */
  displayName(): string {
    const base = this.displayNameOverride || localDisplayName;
    if (!base) return "";
    const n = couchPlayerNumber(this.accountId);
    if (n <= 1) return base;
    const suffix = ` (${n}P)`;
    return sanitizeDisplayName(base.slice(0, MAX_DISPLAY_NAME - suffix.length) + suffix);
  }

  /** join options shared by both dev entry points */
  private joinOptions(): { accountId: string; displayName?: string } {
    const displayName = this.displayName();
    return { accountId: this.accountId, ...(displayName ? { displayName } : {}) };
  }

  /**
   * Dev / offline flow: CREATE a fresh "match" room directly (bots backfill; no
   * ticket needed without a shared secret). We create rather than joinOrCreate so
   * every offline launch — and every "Restart match" — gets a brand-new SimWorld
   * (cleared battlefield, round 1) and can't rejoin a not-yet-disposed old room.
   * Couch guests join this room by id via connectDevJoin.
   */
  async connectDev(
    mapId?: string,
    endpoint: string = defaultEndpoint(),
    /**
     * 練習模式（GH#343）—— 只在 true 時才送出這一格，缺席就是「一般房」，
     * 逐字沿用 `mapId` 與 #215 `rogueliteMobs` 的約定（缺席 ≠ 關掉）。
     * ⚠️ 這只是**請求**：伺服器自己解析身分並據此開閘（見 `cheatGate.ts`）。
     *
     * ⚠️ 排在 `endpoint` **後面**是刻意的：既有呼叫端（含 roomConnectionName.test）
     * 用位置參數傳 endpoint，插在中間會讓那些呼叫悄悄把 URL 當成旗標。
     */
    practice?: boolean,
  ): Promise<Room<MatchState>> {
    const client = new Client(endpoint);
    const room = await client.create<MatchState>("match", {
      ...this.joinOptions(),
      ...(mapId ? { mapId } : {}),
      ...(practice ? { practice: true } : {}),
    });
    this.bind(room);
    return room;
  }

  /** Dev couch flow: join an EXISTING dev room by id (extra local players). */
  async connectDevJoin(roomId: string, endpoint: string = defaultEndpoint()): Promise<Room<MatchState>> {
    const client = new Client(endpoint);
    const room = await client.joinById<MatchState>(roomId, this.joinOptions());
    this.bind(room);
    return room;
  }

  /** Platform flow: consume a Go-minted seat reservation (seatToken). */
  async connectWithReservation(
    endpoint: string,
    reservation: SeatReservation,
  ): Promise<Room<MatchState>> {
    const client = new Client(endpoint);
    const room = await client.consumeSeatReservation<MatchState>(reservation);
    this.bind(room);
    return room;
  }

  /**
   * REPLAY flow (task #175): join a "replay" room instead of "match". The replay
   * room re-runs a recorded match and projects it through the SAME MatchState
   * schema, so binding it here means the whole existing renderer + interpolation
   * + HUD path renders a replay with zero changes — a replay is, to everything
   * downstream of this seam, just a match nobody is controlling. `replayId` is
   * the recording id; `ticket` is the admin-minted view proof (empty in dev).
   */
  async connectReplay(
    replayId: string,
    ticket: string,
    endpoint: string = defaultEndpoint(),
  ): Promise<Room<MatchState>> {
    const client = new Client(endpoint);
    const room = await client.joinOrCreate<MatchState>("replay", { replayId, ticket });
    this.bind(room);
    return room;
  }

  /**
   * ONE arrived sim event → the frame loop's queue. Both wire shapes funnel
   * through here ON PURPOSE: `MSG.EVENT` (one event per message) and
   * `MSG.EVENT_BATCH` (a whole tick in one message) must be indistinguishable
   * downstream, and the only way to guarantee that is for them to run the same
   * code rather than two copies of it that drift.
   */
  private acceptEvent(ev: EventMessage): void {
    // ⭐ GH#590 —— **在途封包不屬於任何一場**。
    //
    // `leave()` 之後 GH#592 已經把 5 個 handler 拆掉了，但那只關掉「之後才到的」；
    // 一個**已經排進事件迴圈**的 socket callback 仍然會跑完，而它會寫進
    // **模組層全域**的 `evadeSightings`（`recordEvade`,見這個檔開頭）。
    // 那個緩衝的消費端 `ui/WorldAnchorLayer` 在大廳整棵 unmount ⇒ ⛔ 沒有人 drain
    // ⇒ 那 0–3 筆會**活著進到下一場**，在不存在的座標上飄出 sighting 浮字。
    // （⚠️ 這裡刻意不寫出那兩個詞：`net/*` 不擁有任何 UI 文案，而
    //   `evadeSightings.test.ts` 是**整個檔的純文字掃描**，連註解都算。）
    //
    // ⚠️ 這是**縱深**那一層（與 `RoomStore.ownerMatchId` 同型）：⛔ 不是重複，
    // 因為它擋的是「handler 拆掉的那一瞬間**已經在飛**」的那一顆。
    if (this.room === null) return;
    this.queuedEvents.push(ev);
    if (this.queuedEvents.length > 512) this.queuedEvents.splice(0, this.queuedEvents.length - 512);
    // 迴避 also lands in its own buffer (see EvadeSighting above): the frame
    // loop's fanout can't carry it, because nothing downstream of the loop
    // has a consumer for an event that produces no damage packet.
    if (ev.type === "evade") recordEvade(ev.data);
    // ⭐ type-streak immunity / invulnerability —— `immune` 走**完全相同**的通道，
    // 理由也相同：
    // 它沒有傷害封包，所以 frame loop 的 fanout 下游沒有消費者。
    //
    // ⚠️ `immune` 在 `net/eventFanout.ts` 的 FANNED_OUT 名單裡從 2026-07 就在了，
    // 而 `grep -rn '"immune"' apps/client/src/` 一直是 **0 筆** —— 伺服器每次
    // 都在發這個事件，客戶端從來沒有人接（失敗形態②）。這一行是那條線的接頭。
    //
    // ⚠️ 傳過去的是**事件型別這個 token**，⛔ 不是要畫在螢幕上的那串字 ——
    // `net/*` 不擁有任何 UI 文案（`evadeSightings.test.ts` 掃這個檔）。翻成人看的字
    // 是 `ui/WorldAnchorLayer.tsx::EVADE_LABELS` 的工作。
    else if (ev.type === "immune") recordEvade(ev.data, "immune");
  }

  private bind(room: Room<MatchState>): void {
    // ⭐ GH#570 —— **這一行是承重的那一條**（見 `disposed` 的註解）。
    // 一間在我離開**之後**才抵達的房,只有一個正確答案:把座位還回去然後走人。
    // ⛔ 一個 handler 都不掛 —— 掛上去它就會寫進**模組層全域** `hudStore`,
    //    而那正是 owner 看到的「隱形的英雄在攻擊我、喊語音、給我傷害」。
    // ⚠️ `room.leave(true)` 是必要的:伺服器的 autoDispose 只在 `clients.length === 0`
    //    才觸發,而幽靈 client 永遠不離開 ⇒ 那間房會用 30 tick/s 一直跑下去。
    if (this.disposed) {
      void room.leave(true);
      noteOrphanRoom();
      return;
    }
    this.room = room;
    this.keepDisposer(room.onMessage(MSG.EVENT, (ev: EventMessage) => this.acceptEvent(ev)));
    // A whole tick's room-wide events in one message (net/eventBatch on the
    // server). Unpacked IN ORDER into the same queue, so the frame loop cannot
    // tell which wire shape delivered them. ⚠️ Losing this handler does not
    // error — colyseus.js silently drops messages with no registered type — it
    // makes combat MUTE (HP bars drain, no numbers, no animations), the S2
    // failure eventFanout.ts's header lists nine times over.
    this.keepDisposer(
      room.onMessage(MSG.EVENT_BATCH, (b: EventBatchMessage) => {
        for (const ev of unpackEventBatch(b)) this.acceptEvent(ev);
      }),
    );
    this.keepDisposer(
      room.onMessage(MSG.REJECT, (msg: { reason?: string } | undefined) => {
        if (this.room === null) return; // ⭐ GH#590 —— 同 `acceptEvent`：在途封包
        // surface the reason (e.g. a non-whitelisted champion pick) to the HUD
        recordReject(typeof msg?.reason === "string" ? msg.reason : "rejected");
      }),
    );
    this.keepDisposer(
      room.onMessage(MSG.PHASE, () => {
        /* phase rides the schema; message is informational */
      }),
    );
    /**
     * ⭐ GH#596 —— **非預期斷線**要出聲。
     *
     * 進得到這裡而 `disposed` 還是 false ⇒ 這條 socket 不是我關的
     *（`leave()` **第一行**就把 `disposed` 設成 true）。⛔ 在此之前
     * `onDisconnect` 全 repo **零指派點**，於是非預期斷線唯一的訊號是
     * `ui/pingReadout` 的「斷線 Ns 無封包」—— 一行沒有人會當成 bug 的字。
     *
     * ⚠️ 計數器**掛在這裡而不是掛在指派點上**是刻意的：fail-loud 不可以
     * 取決於「有沒有人記得指派」（第二守則：fail-open 沒錯，**靜默**才是缺陷）。
     * ⚠️ 沙發連線（`MultiSession`）一次斷線會記 N 筆 —— 這一格數的是**連線**，
     * ⛔ 不是「幾次斷線事件」。
     */
    const onLeave = (code: number): void => {
      if (this.disposed) return; // 我自己叫的 leave() —— ⛔ 不是非預期
      perfBus.unexpectedDisconnects++;
      this.onDisconnect?.(code);
    };
    room.onLeave(onLeave);
    // ⚠️ `onLeave` ⛔ 不回傳 unbind fn（colyseus `createSignal` 回傳的是
    //    EventEmitter 本身）—— 拆它只有 `remove(cb)` 一條路，而那需要**具名** cb。
    if (typeof room.onLeave.remove === "function") {
      this.keepDisposer(() => room.onLeave.remove(onLeave));
    }
  }

  /**
   * 收下一個「拆掉它」的動作（`bind()` 專用）。
   *
   * ⚠️ `typeof` 這一層是給**測試替身**用的：出貨的 colyseus `Room.onMessage()`
   * 一定回傳 nanoevents 的 unbind fn（`Room.js:onMessage` 直接 return
   * `onMessageHandlers.on(...)`），而 repo 裡的 FakeRoom 多半回 undefined。
   * ⛔ 不是「以防萬一」—— 少了它，既有的 `eventBatchClient.test.ts` 會在
   * `leave()` 裡對 undefined 呼叫。
   */
  private keepDisposer(off: unknown): void {
    if (typeof off === "function") this.disposers.push(off as () => void);
  }

  /** Drained once per frame at the top of the GameApp loop. */
  drainEvents(): EventMessage[] {
    if (this.queuedEvents.length === 0) return [];
    const out = this.queuedEvents.slice();
    this.queuedEvents.length = 0;
    return out;
  }

  sendInput(msg: InputMessage): void {
    this.room?.send(MSG.INPUT, msg);
  }

  sendSelectChampion(championId: string): void {
    const msg: SelectChampionMessage = { championId };
    this.room?.send(MSG.SELECT_CHAMPION, msg);
  }

  /** Dev-only offline cheat (server hard-gates the channel to dev mode). */
  sendCheat(cheat: Cheat): void {
    const msg: CheatMessage = { cheat };
    this.room?.send(MSG.CHEAT, msg);
  }

  leave(): void {
    // ⭐ **第一行** —— ⛔ 不是最後一行:中間還有 `clearEvadeSightings()`,
    // 晚設就是留一個更小、但仍然存在的窗。
    this.disposed = true;
    void this.room?.leave(true);
    // ⭐ GH#592 —— 逐一拆掉 `bind()` 掛上去的 5 個 handler。⛔ 不要等伺服器：
    //    `leave(true)` 只是送出一個位元組，回關閉之前那條 socket 還會送資料上來。
    for (const off of this.disposers) off();
    this.disposers.length = 0;
    this.queuedEvents.length = 0;
    // …and the 迴避 buffer with them: a dodge that was never drained belongs to
    // a match that is over, and would otherwise be drawn over the next one.
    clearEvadeSightings();
    this.onDisconnect = null;
    this.room = null;
  }
}
