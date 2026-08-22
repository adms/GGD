/**
 * Platform app store — Zustand vanilla store driving the pre-match screens
 * (auth → lobby → store → match handoff). Lives under ui/ per the client-08
 * arch gate (zustand only in ui/* + net/RoomStore.ts); ALL writes happen via
 * the `set` closure inside the creator (no external .setState calls).
 * main.tsx subscribes to `screen` to boot/dispose the imperative GameApp.
 */
import { useCallback, useSyncExternalStore } from "react";
import { createStore } from "zustand/vanilla";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import { ROOM_SETTING_KEYS, type RoomMatchSettings } from "@ggd/shared/roomSettings";

import * as apiFns from "./api";
import { api } from "./api";
import { ApiError } from "./session";
import { LobbySocket } from "./LobbySocket";
import {
  initialLobbyWsState,
  reduceLobbyMessage,
  removeInvite,
  type LobbyWsState,
} from "./lobbyReducer";
import {
  beginPurchase,
  cancelPurchase,
  executePurchase,
  purchaseIdle,
  type PurchaseItem,
  type PurchaseState,
} from "./purchase";
import { buildSkinOverrides } from "./catalog";
import {
  announcementView,
  browserDismissStorage,
  markDismissed,
  parseAnnouncementFeed,
  readDismissed,
  writeDismissed,
  type PublicAnnouncement,
} from "./announcements";
import { ensureContentLoaded } from "../../content/bootContent";
import { isPlatformRestrictedError, OFFLINE_RESTRICTED_MESSAGE } from "./firstOwner";
import { restartAction, ONLINE_RESTART_NOTE } from "./restart";
import { connectedPadIndices } from "../../input/GamepadInput";
import { setLocalDisplayName } from "../../net/RoomConnection";
import { appendPage, hasMore, nextOffset, PAGE_SIZE } from "./ranking";
import { activeLobbyRally } from "./lobbyRally";
import type {
  AccountPublic,
  Catalog,
  FriendsList,
  LeaderboardResp,
  OpenRoom,
  PlayerMeStanding,
  RankingMe,
  RankLadderRow,
  RoomResp,
  SeatTokenEntry,
  SkinDoc,
  TokenPair,
  Wallet,
} from "./types";

export type Screen = "boot" | "auth" | "lobby" | "match";
export type LobbyView = "play" | "store";

/**
 * Minimum time the login→battle loading bar is shown before the match scene
 * boots (task #74). The long login dragon roar plays on the SFX bus and the
 * combat scene's voices start the instant `screen` flips to "match"; holding
 * the launch behind a >=1s loading transition lets the roar fade out first so
 * the two never overlap. >=1000ms is load-bearing — do not shorten it.
 */
export const MATCH_LOADING_MIN_MS = 1000;

/**
 * How long the lobby waits for the seat token of a one-click bot match (#188)
 * before telling the player something went wrong. The platform has already
 * created and started the match by the time the POST returns, so the only thing
 * that can still be missing is the lobby WebSocket push — a state the player
 * cannot see and would otherwise wait in forever.
 */
export const BOT_MATCH_SEAT_TIMEOUT_MS = 12_000;

/**
 * 一鍵開打透過**大廳集合令**開出來的那間房叫什麼（GH#492）。
 *
 * ⚠️ 它會**列在大廳的房間列表上**，因為那正是重點：owner 要的是「拉人進來」。
 * 名字要讓大廳裡的人一眼看懂那是一場馬上要開的公開場，⛔ 不是 `POST /rooms/solo`
 * 那間不列房的 `單機 vs BOT`（那個名字現在只屬於練習模式與 rollback 那條路）。
 */
export const BOT_MATCH_ROOM_NAME = "一鍵開打 · 等你上車";

/**
 * A match launch staged behind the loading transition (task #74). While this is
 * non-null the loading bar is on screen; `screen` stays where it was (still
 * "auth" for the Play-offline handoff) so the roar's own scene keeps running
 * and no combat voice has started yet. `commitMatchLaunch` flips to "match".
 */
export interface MatchLoading {
  launch: MatchLaunch;
  /**
   * True once the login-roar fade-out has been requested. Set the moment the
   * transition begins so the roar starts receding behind the bar; observed by
   * AuthScreen (which owns the roar emit seam) to stop layering new roars.
   */
  roarFadeRequested: boolean;
}

export interface MatchLaunch {
  mode: "platform" | "offline";
  matchId: string;
  endpoint: string | null;
  seatToken: string | null;
  /** couch play: one entry per local player on this machine (owner first) */
  seatTokens: SeatTokenEntry[] | null;
  /** couch play (offline flow): local player count = connected pads */
  localPlayers: number;
  accountId: string | null;
  /** base champion modelKey -> equipped skin modelKey (local player only) */
  skinOverrides: Map<string, string>;
  /** selected arena id (offline picker); platform matches learn it from state */
  mapId: string | null;
  /**
   * 練習模式（GH#343）—— 這一場是不是**單人沙盒**。只影響 `connectDev` 送出的
   * 開房參數與測試碼面板要不要出現；⛔ 它不是權威，伺服器自己有一份
   * （`MatchRoom.cheatsAllowed`）。
   */
  practice: boolean;
}

export interface AppState {
  screen: Screen;
  lobbyView: LobbyView;
  account: AccountPublic | null;
  authBusy: boolean;
  authError: string | null;
  /**
   * First-owner state (T0 / #180). `bootstrapNeedsOwner` is true only while this
   * deploy has no administrator, from GET /auth/bootstrap-state — it flips the
   * register form into "首位管理員設定" mode (owner-token field instead of the
   * invite field). `bootstrapRequireToken` says whether that claim must present
   * the one-time token. Both default false so an ungated/dev deploy is unchanged.
   */
  bootstrapNeedsOwner: boolean;
  bootstrapRequireToken: boolean;
  /**
   * A registration that SUCCEEDED but landed PENDING under the #126 approval
   * gate — the account exists, but no session was issued, so it cannot enter the
   * lobby. We hold the account (which carries its #203 personal referral code)
   * so AuthScreen can show the "awaiting approval" card + the code the person
   * can share to get auto-approved. null the rest of the time.
   */
  pendingRegistration: AccountPublic | null;

  friends: FriendsList | null;
  rooms: OpenRoom[];
  room: RoomResp | null;
  myReady: boolean;
  /** couch players on MY machine for the current room (1..4) */
  myLocalPlayers: number;
  /** last invite token created by me (copyable room code) */
  createdInvite: { token: string; forName: string } | null;
  /**
   * ⭐ 大廳集合令 (GH#492) —— 我這一間房正在「拉人」，倒數到 `expiresAt` 就開打。
   *
   * `expiresAt` 是**伺服器蓋的**，和每一個收到確認視窗的人拿到的是同一個數字，
   * ⛔ 不是各自瀏覽器起算 —— 不然主揪的 0 秒和別人的 3 秒會是不同的時刻。
   * null = 沒有在集合（一般建房、或 `enabled` 被關掉了）。
   */
  rally: { roomId: string; expiresAt: number; waitSec: number; invited: number; inLobby: number } | null;

  ws: LobbyWsState;
  wsStatus: "connecting" | "connected" | "disconnected";

  leaderboard: LeaderboardResp | null;
  myRank: RankingMe | null;
  /** ranked ladder (task #37): cumulative season-points player board + my standing */
  playerBoard: RankLadderRow[] | null;
  playerBoardMore: boolean;
  playerBoardBusy: boolean;
  myStanding: PlayerMeStanding | null;
  // ---- victory-settlement → leaderboard delta (task #25, additive) ----
  // NOTE: store.ts is also edited by the login task — keep these additions
  // minimal + additive. Snapshot of the caller's standing taken when a match
  // launches, so the post-match "查看戰績變化" screen can show what changed.
  rankBefore: PlayerMeStanding | null;
  /** true after "查看戰績變化" → the leaderboard shows the post-match delta banner */
  showRankChange: boolean;
  wallet: Wallet | null;
  catalog: Catalog | null;
  skinDocs: Map<string, SkinDoc>;
  purchase: PurchaseState;

  // ---- 大廳公告 (task #259) ----------------------------------------------
  /**
   * The newest ACTIVE announcement from the platform's public feed, or null —
   * null being every ordinary case: no announcement published, the feed
   * unreachable, or this browser already closed the current one. The lobby
   * renders identically to today whenever this is null, which is the whole
   * fail-quiet contract: a platform hiccup must not change the lobby at all.
   */
  announcement: PublicAnnouncement | null;
  /** true while the popup is on screen. Closing it hides the popup but keeps
   *  `announcement` set, so 📢 公告 in the header can reopen the same one. */
  announcementOpen: boolean;

  match: MatchLaunch | null;
  /** login→battle handoff (task #74): a launch held behind the loading bar */
  matchLoading: MatchLoading | null;
  /** bumped to force a clean GameApp teardown+recreate (offline Restart) */
  matchEpoch: number;
  /**
   * A one-click bot match has been requested and the seat token has not landed
   * yet (#188). The button reads "開房中…" and cannot be pressed twice — one
   * click must not become two matches.
   */
  botMatchBusy: boolean;
  /**
   * 練習模式（GH#343）—— **這一次按下去的是不是練習模式那顆按鈕**。
   *
   * ⚠️ 為什麼需要一格狀態：座位是**非同步**回來的（POST /rooms/solo 之後，
   * `match_ready` 才從大廳 WS 推過來），而那則推播裡沒有「這是練習房」這件事。
   * `platformLaunch()` 因此讀這一格來決定 `MatchLaunch.practice`。
   *
   * ⛔ 它**不是**權威：伺服器有自己的一份（`MatchRoom.cheatsAllowed`）。它只
   * 決定客戶端要不要畫 🐞 測試碼面板 —— 少了它，伺服器開的是練習房而畫面上
   * 什麼都沒有（失敗形態②：算出來了但從沒送到看得到的地方）。
   */
  practiceIntent: boolean;
  lastError: string | null;

  /**
   * #193 — leave-through-settlement gate. When a player whose team is eliminated
   * asks to leave, the leave-flow (ui/leaveFlow) sets this instead of returning
   * to the lobby, so LeaveSettlementOverlay can show their evaluation FIRST; the
   * overlay's 返回大廳 then calls returnToLobby (which clears it). False during
   * normal play and for a still-alive player, who leaves directly as before.
   */
  leaveGate: boolean;

  // ------------------------------------------------------------ actions --
  boot(): Promise<void>;
  doLogin(username: string, password: string): Promise<void>;
  /**
   * QR device-login success (#197/#199). The token pair an approved handheld
   * received at the poll is fed through the IDENTICAL sink a typed login uses
   * (api.setTokens → enterLobby), so a device-granted session is
   * indistinguishable from a typed one from here on.
   */
  applyDeviceSession(tokens: TokenPair, account: AccountPublic): Promise<void>;
  /**
   * Register. `inviteCode` is the private-deploy gate (#174) — required by the
   * SERVER on a gated deploy, ignored on an open one. Optional here so the
   * offline/dev flow is unchanged.
   */
  doRegister(
    username: string,
    email: string,
    password: string,
    inviteCode?: string,
    bootstrapToken?: string,
  ): Promise<void>;
  /** Fetch first-owner state (best-effort) so the register form can pick its mode. */
  refreshBootstrapState(): Promise<void>;
  /** Dismiss the "awaiting approval" card and return to the auth form (#203/#126). */
  clearPendingRegistration(): void;
  doLogout(): Promise<void>;
  /**
   * @param practice 練習模式（GH#343）—— 開一間**單人沙盒**：沒有敵隊、不結算、
   *   測試碼直接可用、可以即時生殭屍。場地由 `mapId` 決定（重用大廳現有的下拉），
   *   角色照常在選角相位挑。⛔ 客戶端這一格只是**請求**，真正決定的是伺服器
   *   （`cheatGate.ts`：客戶端說自己是練習房不算數）。
   */
  playOffline(mapId?: string, practice?: boolean): void;
  /**
   * login→battle handoff (task #74): stage an offline launch behind the >=1s
   * loading transition and request the login-roar fade — instead of jumping
   * straight to "match". `commitMatchLaunch` performs the actual screen flip
   * once the loading bar has run its minimum.
   */
  beginOfflineLoading(mapId?: string, practice?: boolean): void;
  /** Flip to the staged match once the loading transition has run (task #74). */
  commitMatchLaunch(): void;
  /** Abort a staged loading transition without launching (task #74). */
  cancelMatchLoading(): void;
  returnToLobby(): Promise<void>;
  /** #193 — open the leave-through-settlement gate (eliminated player asked to leave) */
  openLeaveGate(): void;
  /** #193 — dismiss the gate without leaving (繼續觀戰) */
  closeLeaveGate(): void;
  /** clear battlefield & restart round 1 (offline) / return to lobby (online) */
  restartMatch(): void;

  refreshFriends(): Promise<void>;
  addFriend(username: string): Promise<void>;
  acceptFriend(accountId: string): Promise<void>;
  declineFriend(accountId: string): Promise<void>;

  refreshRooms(): Promise<void>;
  /**
   * Create a room. `settings` is the #288 host block (選角 / 商店 / 每回合時間 +
   * 總回合數) and is ONE OBJECT on purpose — four extra positional parameters
   * after `rogueliteMobs` would be eight in a row, i.e. a signature that gets
   * called wrong. Callers that omit it send no settings at all, which is the
   * contract's 缺席 ≠ 重設: every field falls back to config.match@1's shipped
   * value, vs-bot champ select included.
   */
  createRoom(
    name: string,
    botDifficulty: string,
    mapId?: string,
    rogueliteMobs?: boolean,
    settings?: RoomMatchSettings,
  ): Promise<void>;
  joinRoom(roomId: string): Promise<void>;
  leaveRoom(): Promise<void>;
  refreshRoom(): Promise<void>;
  setReady(ready: boolean): Promise<void>;
  setLocalPlayers(count: number): Promise<void>;
  /** host edits room settings post-create (e.g. the #215 肉鴿殭屍模式 toggle);
   *  takes effect for the NEXT match since arenaRules is frozen at match start. */
  updateRoomSettings(settings: { rogueliteMobs?: boolean; mapId?: string; botDifficulty?: string }): Promise<void>;
  startMatch(): Promise<void>;
  /**
   * ONE-CLICK BOT MATCH (#188) — 「一鍵開房直接玩」. A real, settling match:
   * the platform creates a private room, starts it with 11 bots and pushes the
   * seat token over the lobby WS, so it records, rates and pays half crystals.
   * This is NOT `playOffline`, which is the dev direct-join and settles nowhere.
   *
   * @param practice 練習模式（GH#343）—— 同一條路，只多帶一格旗標。⭐ 它刻意
   *   **不是**另一個 action：練習房就是一間 solo 房（不列在大廳、只有自己），
   *   座位／回呼／心跳／#200 的內容預熱通通共用，⛔ 第二條路只會各自腐爛。
   *   練習房**完全沒有獎勵積分**（owner 2026-08-17）是伺服器保證的：它不發
   *   result callback，所以水晶／MMR／賽季積分／M幣／戰績五條路一條都不會跑。
   */
  playBotMatch(mapId?: string, rogueliteMobs?: boolean, practice?: boolean): Promise<void>;
  createInvite(accountId: string, username: string): Promise<void>;
  joinByCode(token: string): Promise<void>;
  /**
   * ⭐ 接下這一則集合令 (GH#492)。一個 request 就進房而且是 ready 的
   * （`readyOnJoin`）—— 主揪的倒數正在跑，⛔ 沒有第二趟來回的餘裕。
   *
   * ⚠️ 呼叫它的**多數不是按鈕**：owner 2026-08-21 把語意反轉成「預設是加入」，
   * 所以倒數走完時 `RallyConfirmDialog` 會自己呼叫這一條（沒有人按過任何東西）。
   * 按鈕「立刻加入」只是把等待跳過去。
   */
  acceptRally(token: string): Promise<void>;
  /**
   * ⭐ 對整個大廳發出集合令並開始倒數 (GH#492)。建房之後自動跑一次；主揪也可以在
   * 房間裡再按一次「再喊一次」（有人剛上線時）。
   *
   * ⛔ 政策關掉（`enabled: false`）時它什麼都不做 —— 那是 owner 的一鍵 rollback。
   */
  beginRally(roomId: string, waitSecOverride?: number): Promise<void>;
  /**
   * ⭐ 主揪按「多等 1 分鐘」（GH#573，owner 2026-08-23 逐字：
   * 「邀請朋友的部分 除了可以等 10 秒、不等了以外，**還可以選多等 1 分鐘**」）。
   *
   * ⛔ 它**不是**「把 expiresAt 加上 60 秒」：截止時間是**伺服器蓋的**，而大廳裡
   * 每一台收到的視窗都從那個時間算。只在主揪這一台加時間，別人的視窗會照舊在
   * 第 10 秒關掉 —— 於是「多等一分鐘」變成「多等一分鐘的空房」。
   * ⇒ 它**重新喊一次**（同一條 `POST /rooms/{id}/rally`，只是 waitSec 不同），
   * 所以剛剛按過「不要」的人也會再被問一次 —— 那正是「再等一下」的意思。
   */
  extendRally(seconds: number): Promise<void>;
  /** 主揪按「不等了，現在開始」/ 倒數到期 —— 兩個都走這一條。 */
  startRallyNow(): Promise<void>;
  dismissInvite(token: string): void;
  sendChat(text: string): void;

  refreshLeaderboard(): Promise<void>;
  /** load page 1 of the season-points player board + the caller's standing */
  refreshRankedLadder(): Promise<void>;
  /** append the next page of the player board ("load more") */
  loadMorePlayers(): Promise<void>;
  refreshWallet(): Promise<void>;
  refreshCatalog(): Promise<void>;
  setLobbyView(view: LobbyView): void;
  /** settlement "查看戰績變化": go to the lobby leaderboard + show the rank delta */
  viewRankChange(): void;
  dismissRankChange(): void;

  /**
   * Pull the public announcement feed and decide whether anything should pop up
   * (task #259). Runs on every lobby entry. NEVER throws and never sets
   * `lastError` — an unreachable feed is not something to interrupt a player
   * with, it is something to be silent about.
   */
  refreshAnnouncement(): Promise<void>;
  /** 「知道了」 — close the popup and remember this id so it will not nag again. */
  dismissAnnouncement(): void;
  /** 📢 公告 in the lobby header — reopen the announcement after dismissing it. */
  openAnnouncement(): void;

  purchaseBegin(item: PurchaseItem): void;
  purchaseCancel(): void;
  purchaseConfirm(): Promise<void>;
  equip(championId: string, skinId: string | null): Promise<void>;

  onWsMessage(raw: unknown): void;
  matchJoinFailed(message: string): void;
  /**
   * GH#596 —— 比賽**中途**斷線（⛔ 不是 join 失敗）。
   * ⚠️ 刻意不沿用 `matchJoinFailed`：它的文案是「could not join the match」，
   * 而玩家明明已經打了十分鐘 —— 那句話會對他說謊（第一·五守則）。
   */
  matchDisconnected(code: number): void;
  /** Surface a message in the error toast (a CLIENT-side failure, not an API one). */
  showError(message: string): void;
  clearError(): void;
}

/**
 * #288 — drop every host setting the room creator did not fill in.
 *
 * ⭐ The load-bearing half of 缺席 ≠ 重設. `JSON.stringify` already drops
 * `undefined` values, but the object also travels through the Go platform's
 * `*float64` decode, where an explicit `null` is NOT the same as a missing key.
 * Building the payload with only the present keys makes "the host left it
 * blank" unrepresentable rather than merely unlikely.
 */
function presentRoomSettings(settings: RoomMatchSettings | undefined): RoomMatchSettings {
  const out: RoomMatchSettings = {};
  if (!settings) return out;
  for (const key of ROOM_SETTING_KEYS) {
    const v = settings[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
  }
  return out;
}

function errText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "something went wrong";
}

/** championId -> base modelKey via the shared registry. */
function championModelKey(championId: string): string | null {
  registerSkeletonContent(); // idempotent
  return Champions.tryGet(championId as ChampionId)?.modelKey ?? null;
}

/** Fetch content skin docs (names/descriptions) — optional, never throws. */
async function fetchSkinDocs(): Promise<Map<string, SkinDoc>> {
  const out = new Map<string, SkinDoc>();
  try {
    const idx = (await (await fetch("/content/skins/_index.json")).json()) as {
      entries?: { id: string; path: string }[];
    };
    const docs = await Promise.all(
      (idx.entries ?? []).map(async (e) => {
        try {
          return (await (await fetch(`/content/${e.path}`)).json()) as SkinDoc;
        } catch {
          return null;
        }
      }),
    );
    for (const d of docs) if (d?.id) out.set(d.id, d);
  } catch {
    /* content mount missing — ids are shown instead of names */
  }
  return out;
}

export const appStore = createStore<AppState>()((set, get) => {
  // ---- lobby socket (module-scoped singleton; store drives lifecycle) ----
  const socket = new LobbySocket({
    onMessage: (msg) => get().onWsMessage(msg),
    onStatus: (wsStatus) => set({ wsStatus }),
    getToken: async () => {
      try {
        await apiFns.me(); // forces a token refresh when the access JWT expired
        return api.accessToken;
      } catch {
        return null;
      }
    },
  });

  /** Common post-auth landing: load lobby data + open the WS. */
  async function enterLobby(account: AccountPublic): Promise<void> {
    // Publish the username to the net layer so the dev/LAN direct-join path can
    // claim its seat by name (#156) — net/* can't reach into this store, and
    // the offline launch payload never passes through a seat reservation.
    setLocalDisplayName(account.username);
    set({
      screen: "lobby",
      lobbyView: "play",
      account,
      authBusy: false,
      authError: null,
      ws: initialLobbyWsState(),
    });
    socket.start();
    const s = get();
    await Promise.all([
      s.refreshFriends(),
      s.refreshRooms(),
      s.refreshLeaderboard(),
      s.refreshRankedLadder(),
      s.refreshWallet(),
      s.refreshCatalog(),
      // 大廳公告 (#259). Sits in the SAME landing fan-out as friends/rooms/
      // wallet rather than in a component effect, because "the lobby loads its
      // data here" is the one place a reviewer looks to answer "does anything
      // read the announcement feed?" — and for four releases the answer was no.
      // It is fail-quiet (see refreshAnnouncement), so it can never fail this
      // Promise.all and strand a player on a half-loaded lobby.
      s.refreshAnnouncement(),
    ]);
  }

  /** Compute the launch payload for an offline (dev direct-join) match. */
  function offlineLaunch(mapId?: string, practice = false): MatchLaunch {
    // equipped skins still apply offline when a platform session exists
    const { wallet, catalog, account } = get();
    const skinOverrides =
      wallet && catalog ? buildSkinOverrides(wallet, catalog.skins, championModelKey) : new Map<string, string>();
    // couch dev mode: every connected pad becomes a local player (split-screen)
    const pads = connectedPadIndices().length;
    return {
      mode: "offline",
      matchId: "",
      endpoint: null,
      seatToken: null,
      seatTokens: null,
      localPlayers: Math.min(4, Math.max(1, pads)),
      accountId: account?.id ?? null,
      skinOverrides,
      mapId: mapId ?? null,
      practice,
    };
  }

  /** Compute the launch payload for a platform match. */
  function platformLaunch(
    matchId: string,
    endpoint: string,
    seatToken: string,
    seatTokens?: SeatTokenEntry[],
  ): MatchLaunch {
    const { wallet, catalog, account } = get();
    const skinOverrides =
      wallet && catalog ? buildSkinOverrides(wallet, catalog.skins, championModelKey) : new Map<string, string>();
    const entries =
      seatTokens && seatTokens.length > 0
        ? seatTokens
        : [{ accountId: account?.id ?? "", seatToken }];
    return {
      mode: "platform",
      matchId,
      endpoint,
      seatToken,
      seatTokens: entries,
      localPlayers: entries.length,
      accountId: account?.id ?? null,
      skinOverrides,
      mapId: null, // platform matches render the server-authoritative state.mapId
      // 練習模式（GH#343）跟著**這一次開的房**走，⛔ 不再寫死 false。
      // 這一行寫死的那段時間裡，練習模式只能走 `playOffline`（dev 直連），而那條路
      // 在正式站被 MatchRoom 的 createToken 閘擋死 —— 也就是說線上根本沒有練習模式。
      // 現在練習房是一間真的 solo 房，座位從 `match_ready` 回來，所以「它是不是練習房」
      // 只能由按下按鈕的那一刻記住（`practiceIntent`）。
      practice: get().practiceIntent,
    };
  }

  return {
    screen: "boot",
    lobbyView: "play",
    account: null,
    authBusy: false,
    authError: null,
    bootstrapNeedsOwner: false,
    bootstrapRequireToken: false,
    pendingRegistration: null,
    friends: null,
    rooms: [],
    room: null,
    myReady: false,
    myLocalPlayers: 1,
    createdInvite: null,
    rally: null,
    ws: initialLobbyWsState(),
    wsStatus: "disconnected",
    leaderboard: null,
    myRank: null,
    playerBoard: null,
    playerBoardMore: false,
    playerBoardBusy: false,
    myStanding: null,
    rankBefore: null,
    showRankChange: false,
    wallet: null,
    catalog: null,
    skinDocs: new Map(),
    purchase: purchaseIdle,
    announcement: null,
    announcementOpen: false,
    match: null,
    matchLoading: null,
    matchEpoch: 0,
    botMatchBusy: false,
    practiceIntent: false,
    lastError: null,
    leaveGate: false,

    // ------------------------------------------------------------- auth --

    async boot() {
      if (!api.hasSession) {
        set({ screen: "auth" });
        // Best-effort: learn whether this is a fresh gated deploy needing its
        // first owner, so AuthScreen can offer the 站長 path instead of the
        // dead-end "ask an admin" invite copy. Never blocks first paint.
        void get().refreshBootstrapState();
        return;
      }
      try {
        const { account } = await apiFns.me();
        await enterLobby(account);
      } catch {
        api.setTokens(null);
        set({ screen: "auth" });
        void get().refreshBootstrapState();
      }
    },

    async refreshBootstrapState() {
      try {
        const st = await apiFns.bootstrapState();
        set({ bootstrapNeedsOwner: st.needsOwner, bootstrapRequireToken: st.requireToken });
      } catch {
        // endpoint missing (older platform) or transient — leave defaults
        // (needsOwner=false), so the normal invite flow is shown.
      }
    },

    clearPendingRegistration() {
      set({ pendingRegistration: null });
    },

    async doLogin(username, password) {
      set({ authBusy: true, authError: null, pendingRegistration: null });
      try {
        const resp = await apiFns.login(username, password);
        api.setTokens(resp.tokens);
        await enterLobby(resp.account);
      } catch (err) {
        set({ authBusy: false, authError: errText(err) });
      }
    },

    async applyDeviceSession(tokens, account) {
      // Same success path as doLogin — persist the pair, then enter the lobby.
      // The server already ran the approval/ban gate before minting these
      // tokens (auth.DevicePoll → AuthorizePlay), so there is nothing extra to
      // check here that a typed login would not also skip.
      api.setTokens(tokens);
      await enterLobby(account);
    },

    async doRegister(username, email, password, inviteCode = "", bootstrapToken = "") {
      set({ authBusy: true, authError: null, pendingRegistration: null });
      try {
        const resp = await apiFns.register(username, email, password, inviteCode, bootstrapToken);
        // Gated deploy (#126): a successful registration can land PENDING with NO
        // session. Entering the lobby with an empty token would just bounce off
        // the WS handshake, so instead surface the "awaiting approval" state —
        // which carries the #203 referral code the person can share to get
        // auto-approved. `status === "approved"` (or a token) means play now.
        if (!resp.tokens.accessToken) {
          set({ authBusy: false, authError: null, pendingRegistration: resp.account });
          return;
        }
        api.setTokens(resp.tokens);
        await enterLobby(resp.account);
      } catch (err) {
        set({ authBusy: false, authError: errText(err) });
        // A failed first-owner claim (token consumed by a racing owner, or
        // someone else won) may mean this deploy now HAS an owner — re-probe so
        // the form falls back to the invite flow instead of the token field.
        if (get().bootstrapNeedsOwner) void get().refreshBootstrapState();
      }
    },

    async doLogout() {
      const room = get().room;
      if (room) {
        try {
          await apiFns.leaveRoom(room.room.id);
        } catch {
          /* best effort */
        }
      }
      socket.stop();
      try {
        // revoke the refresh family server-side (best effort)
        const token = api.refreshToken;
        if (token) await apiFns.logout(token);
      } catch {
        /* ignore */
      }
      api.setTokens(null);
      setLocalDisplayName(""); // never name the next session's seats after the last user
      set({
        screen: "auth",
        account: null,
        pendingRegistration: null,
        friends: null,
        rooms: [],
        room: null,
        myReady: false,
        createdInvite: null,
        ws: initialLobbyWsState(),
        leaderboard: null,
        myRank: null,
        playerBoard: null,
        playerBoardMore: false,
        playerBoardBusy: false,
        myStanding: null,
        rankBefore: null,
        showRankChange: false,
        wallet: null,
        catalog: null,
        purchase: purchaseIdle,
        // The next person to sign in on this machine re-fetches the feed on
        // their own lobby entry; leaving the last session's announcement in
        // state would pop it over THEIR first lobby paint.
        announcement: null,
        announcementOpen: false,
        match: null,
        matchLoading: null,
        botMatchBusy: false,
        // 換一個人登入不能繼承上一個人的練習模式意圖。
        practiceIntent: false,
        leaveGate: false,
      });
    },

    playOffline(mapId?: string, practice?: boolean) {
      set({
        screen: "match",
        // snapshot the pre-match standing for the post-match rank-delta screen
        rankBefore: get().myStanding,
        showRankChange: false,
        matchLoading: null,
        match: offlineLaunch(mapId, practice === true),
      });
    },

    beginOfflineLoading(mapId?: string, practice?: boolean) {
      // Stage the launch and request the roar fade NOW; the loading bar
      // (MatchLoadingOverlay) shows for >=MATCH_LOADING_MIN_MS, then calls
      // commitMatchLaunch. `screen` stays "auth" meanwhile, so AuthScreen (and
      // its login scene) remain mounted and no combat voice has started yet.
      set({ matchLoading: { launch: offlineLaunch(mapId, practice === true), roarFadeRequested: true } });
    },

    commitMatchLaunch() {
      const ml = get().matchLoading;
      if (!ml) return;
      set({
        screen: "match",
        rankBefore: get().myStanding,
        showRankChange: false,
        match: ml.launch,
        matchLoading: null,
      });
    },

    cancelMatchLoading() {
      set({ matchLoading: null });
    },

    openLeaveGate() {
      set({ leaveGate: true });
    },

    closeLeaveGate() {
      set({ leaveGate: false });
    },

    async returnToLobby() {
      const s = get();
      set({ screen: s.account ? "lobby" : "auth", match: null, myReady: false, botMatchBusy: false, leaveGate: false });
      if (!s.account) return;
      // the played room is now in-match: leave it and refresh lobby data
      if (s.room) {
        try {
          await apiFns.leaveRoom(s.room.room.id);
        } catch {
          /* room may already be gone */
        }
        set({ room: null, createdInvite: null, ws: { ...get().ws, chat: [], matchReady: null } });
      }
      const cur = get();
      await Promise.all([
        cur.refreshRooms(),
        cur.refreshWallet(),
        cur.refreshFriends(),
        cur.refreshLeaderboard(),
        cur.refreshRankedLadder(),
      ]);
    },

    restartMatch() {
      const s = get();
      if (!s.match || s.screen !== "match") return;
      if (restartAction(s.match.mode) === "recreate") {
        // offline: bump the epoch — main.tsx tears the GameApp down and rebuilds
        // it, so a fresh dev joinOrCreate spins up a NEW SimWorld (round 1).
        set({ matchEpoch: s.matchEpoch + 1 });
      } else {
        // online: a live room can't be reset without host authority — bail to
        // the lobby with a note (the player can start a fresh room from there).
        set({ lastError: ONLINE_RESTART_NOTE });
        void s.returnToLobby();
      }
    },

    // ---------------------------------------------------------- friends --

    async refreshFriends() {
      try {
        set({ friends: await apiFns.listFriends() });
      } catch {
        /* transient */
      }
    },

    async addFriend(username) {
      try {
        await apiFns.sendFriendRequest(username);
        await get().refreshFriends();
      } catch (err) {
        set({ lastError: errText(err) });
      }
    },

    async acceptFriend(accountId) {
      try {
        await apiFns.acceptFriend(accountId);
        await get().refreshFriends();
      } catch (err) {
        set({ lastError: errText(err) });
      }
    },

    async declineFriend(accountId) {
      try {
        await apiFns.declineFriend(accountId);
        await get().refreshFriends();
      } catch (err) {
        set({ lastError: errText(err) });
      }
    },

    // ------------------------------------------------------------ rooms --

    async refreshRooms() {
      try {
        set({ rooms: (await apiFns.listOpenRooms()).rooms });
      } catch {
        /* transient */
      }
    },

    async createRoom(name, botDifficulty, mapId, rogueliteMobs, settings) {
      try {
        const resp = await apiFns.createRoom({
          name,
          botDifficulty,
          ...(mapId ? { mapId } : {}),
          // Only transmit when the host UNCHECKED it: sending nothing keeps the
          // whole chain default-ON (#215). `=== false` guards against passing a
          // stray truthy/undefined that would still serialize a key.
          ...(rogueliteMobs === false ? { rogueliteMobs: false } : {}),
          // #288 語意①: only the fields the host actually filled in. A key the
          // host left blank must NOT appear — `undefined`/`null` would read as
          // an explicit value downstream (0 is out of range for the three time
          // fields and means "no cap" for maxRounds), so it is dropped here
          // rather than serialized.
          ...presentRoomSettings(settings),
        });
        set({ room: resp, myReady: false, myLocalPlayers: 1, createdInvite: null, rally: null, ws: { ...get().ws, chat: [] } });
        // ⭐ 建好房的下一件事就是**拉人**（GH#492，owner:「創建房間最重要的就是
        // 拉人進來」）。⛔ 這不是「開好房再自己按一次邀請」—— 那顆按鈕 2026-08-21
        // 之前就存在，而它一次只邀得到一個人。
        await get().beginRally(resp.room.id);
      } catch (err) {
        set({ lastError: errText(err) });
      }
    },

    async joinRoom(roomId) {
      try {
        const resp = await apiFns.joinRoom(roomId);
        set({ room: resp, myReady: false, myLocalPlayers: 1, createdInvite: null, rally: null, ws: { ...get().ws, chat: [] } });
        try {
          const hist = await apiFns.chatHistory(roomId);
          set({ ws: { ...get().ws, chat: hist.messages.slice(-100) } });
        } catch {
          /* history optional */
        }
      } catch (err) {
        set({ lastError: errText(err) });
      }
    },

    async leaveRoom() {
      const room = get().room;
      if (!room) return;
      try {
        await apiFns.leaveRoom(room.room.id);
      } catch {
        /* already gone */
      }
      set({ room: null, myReady: false, createdInvite: null, rally: null, ws: { ...get().ws, chat: [] } });
      await get().refreshRooms();
    },

    async refreshRoom() {
      const room = get().room;
      if (!room) return;
      try {
        const resp = await apiFns.getRoom(room.room.id);
        const meId = get().account?.id;
        const mine = resp.members.find((m) => m.accountId === meId);
        set({
          room: resp,
          myReady: mine?.ready ?? false,
          myLocalPlayers: Math.max(1, mine?.localPlayers ?? 1),
        });
      } catch {
        // room disposed (host left etc.) — drop back to the room list
        set({ room: null, myReady: false, myLocalPlayers: 1 });
      }
    },

    async setReady(ready) {
      const room = get().room;
      if (!room) return;
      try {
        await apiFns.setReady(room.room.id, ready);
        set({ myReady: ready });
        await get().refreshRoom();
      } catch (err) {
        set({ lastError: errText(err) });
      }
    },

    async setLocalPlayers(count) {
      const room = get().room;
      if (!room) return;
      try {
        const resp = await apiFns.setLocalPlayers(room.room.id, count);
        set({ room: resp, myLocalPlayers: count });
      } catch (err) {
        set({ lastError: errText(err) });
      }
    },

    async updateRoomSettings(settings) {
      const room = get().room;
      if (!room) return;
      try {
        const resp = await apiFns.updateRoomSettings(room.room.id, settings);
        set({ room: resp });
      } catch (err) {
        set({ lastError: errText(err) });
      }
    },

    async startMatch() {
      const room = get().room;
      if (!room) return;
      // 一般房間永遠不是練習房（伺服器的 room.Create 也把那一格清掉了）；
      // 這裡讓畫面那一半跟著對齊，⛔ 不要讓上一次按練習模式的意圖漏進來。
      set({ practiceIntent: false });
      try {
        await apiFns.startRoom(room.room.id);
        // seat token arrives over the lobby WS (match_ready) for everyone
      } catch (err) {
        set({ lastError: errText(err) });
      }
    },

    async playBotMatch(mapId?: string, rogueliteMobs?: boolean, practice?: boolean) {
      if (get().botMatchBusy) return; // one click is one match
      // 記住這一次按的是哪一顆按鈕：座位是非同步回來的，`platformLaunch()` 到時候
      // 只剩這一格能回答「這一場是不是練習房」。⚠️ 每一次按都要重寫（含 false），
      // ⛔ 不可以只在 true 的時候設 —— 那樣上一場練習會沾到下一場一鍵開打。
      set({ practiceIntent: practice === true });
      set({ botMatchBusy: true, lastError: null });
      // PRIME THE ONE-TIME CONTENT LOAD BEFORE THE SEAT IS MINTED (task #200).
      // A colyseus seat reservation starts its expiry clock the instant the
      // platform mints it — which is inside startSoloMatch below — but the seat
      // cannot be CONSUMED until the client has downloaded the entry chunk +
      // content tree (main.tsx's startMatch no-ops on `!isContentReady()`). On a
      // COLD first press that download outlasts the reservation window, so the
      // join arrives after the seat has expired and bounces back to the lobby;
      // the warmed cache then makes every later press win the race, which is
      // exactly the first-press-only, self-healing report. Awaiting the
      // single-flight load (already in flight from boot) here means we do not
      // ask the platform for a seat until we can consume it AT ONCE — there is
      // no window left to lose. Resolves immediately once warm; never rejects
      // (a failed load falls back to the skeleton and still resolves ready).
      await ensureContentLoaded();
      // A press can be abandoned while content loads (logout, navigation). If we
      // are no longer the pending press, do not mint a seat nobody will claim.
      if (!get().botMatchBusy || get().screen !== "lobby") return;
      // ⭐ owner 2026-08-21 明說「最多等 10 秒，**包含 vs bot**」——
      // 一鍵開打走的是**同一條**集合令，⛔ 不是第二條流程：建一間會列在大廳的房
      // → 對全大廳廣播 → 等 `waitSeconds` → 誰來了誰上，剩下的位子 bot 補。
      //
      // ⛔ **練習模式永遠不走這條路**：練習房是測試碼的鑰匙，一間有旁人的練習房
      // 就是作弊房（理由寫在 platform 的 `room.Create()` 檔頭）。所以它繼續走
      // 不列房、不等人的 POST /rooms/solo。
      const rallyPolicy = activeLobbyRally();
      if (rallyPolicy.enabled && rallyPolicy.includeBotMatch && practice !== true) {
        // botMatchBusy 的座位逾時是給「立刻開場」那條路的；集合令會先等一段
        // 倒數，所以在這裡先放掉那個旗標，⛔ 不然玩家會在等人的十秒裡看到
        // 「沒收到座位」的錯誤訊息。
        set({ botMatchBusy: false });
        await get().createRoom(
          BOT_MATCH_ROOM_NAME,
          "normal",
          mapId,
          rogueliteMobs,
        );
        return;
      }
      try {
        // Only include a field when it deviates from the default: map when set,
        // rogueliteMobs only when explicitly OFF (sending nothing = ON, #215),
        // practice only when it IS a practice room (缺席 = 不是練習房，GH#343).
        const solo: { mapId?: string; rogueliteMobs?: boolean; practice?: boolean } = {};
        if (mapId) solo.mapId = mapId;
        if (rogueliteMobs === false) solo.rogueliteMobs = false;
        if (practice === true) solo.practice = true;
        await apiFns.startSoloMatch(Object.keys(solo).length ? solo : undefined);
      } catch (err) {
        set({ botMatchBusy: false, lastError: errText(err) });
        return;
      }
      // The match now EXISTS on the platform; the seat token follows over the
      // lobby WS and onWsMessage flips the screen. If it never arrives (a WS
      // that dropped between the click and the push) the player would sit in a
      // lobby staring at a spinner while a real match ticks away without him —
      // so say so rather than hang. The match itself is unaffected: it settles
      // or the #187 reaper closes it out.
      setTimeout(() => {
        if (!get().botMatchBusy || get().screen !== "lobby") return;
        set({
          botMatchBusy: false,
          lastError: "開房成功但沒收到座位（大廳連線可能斷了）— 重新整理後再試一次",
        });
      }, BOT_MATCH_SEAT_TIMEOUT_MS);
    },

    // ---- 大廳集合令 (GH#492) --------------------------------------------
    //
    // owner 2026-08-21:「創建房間最重要的就是拉人進來，請你將所有線上在大廳的人
    // 都跳出確認視窗是否進入房間一起開始，同意後就一起進入開始遊戲，最多等 10 秒」
    //
    // ⭐ 倒數住在**主揪這一台**，而截止時間是**伺服器蓋的**。伺服器端的計時器要
    // 活過 replica 重啟，而且會替一個已經關掉分頁的主揪開場 —— 一間主揪不在的房
    // 正是不該把別人拉進去的那一間。⇒ 客戶端擁有的只有「什麼時候按下開始」，
    // 那本來就是它一直有的權力。

    async beginRally(roomId, waitSecOverride) {
      const policy = activeLobbyRally();
      if (!policy.enabled) return; // ⛔ owner 的一鍵 rollback
      try {
        // ⭐ GH#573 —— `waitSecOverride` 是「多等 N」那一條路（`extendRally`）。
        // 缺席 = 出貨的窗口，也就是這一行在此之前的行為，逐位元不變。
        const info = await apiFns.rallyRoom(roomId, waitSecOverride ?? policy.waitSeconds);
        set({
          rally: {
            roomId,
            expiresAt: info.expiresAt,
            waitSec: info.waitSec,
            invited: info.invited,
            inLobby: info.inLobby,
          },
        });
        // 到期就開打。⚠️ 用**伺服器的截止時間 − 現在**當延遲，⛔ 不是
        // `policy.waitSeconds × 1000`：後者會在時鐘有偏差時和收到確認視窗的人
        // 各數各的，而視窗上寫的秒數是從同一個 `expiresAt` 算出來的。
        const delay = Math.max(0, info.expiresAt - Date.now());
        setTimeout(() => {
          const cur = get().rally;
          if (!cur || cur.roomId !== roomId) return; // 已經離開/取消了
          // ⭐ GH#573 —— **這一行是「多等 1 分鐘」的承重點**：再喊一次會留下上一次的
          // 計時器，而它的 `roomId` 一模一樣。少了這個比對，按下「多等 1 分鐘」之後
          // 原本那個 10 秒的計時器仍然會在第 10 秒把比賽開起來 —— 畫面上寫著還有
          // 55 秒，而房間已經開打了。⭐ `expiresAt` 是伺服器蓋的，所以它是這一輪
          // 集合令的身分。
          if (cur.expiresAt !== info.expiresAt) return;
          void get().startRallyNow();
        }, delay);
      } catch (err) {
        // ⚠️ 廣播失敗**不可以**害這間房開不成：主揪還是可以自己按開始。
        // 說出來（fail-loud），⛔ 不要靜靜地變成一間沒人被通知的房。
        set({ rally: null, lastError: errText(err) });
      }
    },

    async extendRally(seconds) {
      const { rally, room } = get();
      if (!rally || !room || room.room.id !== rally.roomId) return;
      if (!(seconds > 0)) return;
      await get().beginRally(rally.roomId, seconds);
    },

    async startRallyNow() {
      const { rally, room } = get();
      if (!rally || !room || room.room.id !== rally.roomId) return;
      set({ rally: null, practiceIntent: false });
      const policy = activeLobbyRally();
      try {
        // ⭐ 倒數是**期限**不是共識：時間到就開，⛔ 不管有沒有人按過準備。
        // 少了這一格，一個從房間列表走進來、從不按準備的路人就能讓倒數永遠
        // 開不了場，而畫面上只寫著「按了開始，什麼都沒發生」。
        await apiFns.startRoom(rally.roomId, policy.startIgnoresReady);
        // seat token arrives over the lobby WS (match_ready) for everyone
      } catch (err) {
        set({ lastError: errText(err) });
      }
    },

    async acceptRally(token) {
      const policy = activeLobbyRally();
      const trimmed = token.trim();
      try {
        // 一個 request 進房 + 標記準備好 —— 主揪的倒數正在跑（見 api.joinByCode）。
        const resp = await apiFns.joinByCode(trimmed, policy.readyOnJoin);
        set({
          room: resp,
          myReady: policy.readyOnJoin,
          createdInvite: null,
          rally: null,
          ws: removeInvite({ ...get().ws, chat: [] }, trimmed),
        });
      } catch (err) {
        // 集合令過期／房間已經開打是**正常結局**，不是缺陷 —— 但要說出來，
        // 不然按下去什麼都沒發生看起來像按鈕壞了。
        set({ ws: removeInvite(get().ws, trimmed), lastError: errText(err) });
      }
    },

    async createInvite(accountId, username) {
      const room = get().room;
      if (!room) return;
      try {
        const { token } = await apiFns.inviteToRoom(room.room.id, accountId);
        set({ createdInvite: { token, forName: username } });
      } catch (err) {
        set({ lastError: errText(err) });
      }
    },

    async joinByCode(token) {
      try {
        const resp = await apiFns.joinByCode(token.trim());
        set({
          room: resp,
          myReady: false,
          createdInvite: null,
          ws: removeInvite({ ...get().ws, chat: [] }, token.trim()),
        });
        try {
          const hist = await apiFns.chatHistory(resp.room.id);
          set({ ws: { ...get().ws, chat: hist.messages.slice(-100) } });
        } catch {
          /* optional */
        }
      } catch (err) {
        set({ lastError: errText(err) });
      }
    },

    dismissInvite(token) {
      set({ ws: removeInvite(get().ws, token) });
    },

    sendChat(text) {
      const room = get().room;
      const trimmed = text.trim();
      if (!room || !trimmed) return;
      socket.sendChat(room.room.id, trimmed);
    },

    // --------------------------------------------------- ranking/wallet --

    async refreshLeaderboard() {
      try {
        const [leaderboard, myRank] = await Promise.all([apiFns.leaderboard(1, 20), apiFns.rankingMe()]);
        set({ leaderboard, myRank });
      } catch {
        /* transient */
      }
    },

    async refreshRankedLadder() {
      // player board is public; the caller's own standing needs a session and
      // 404s pre-placement — both are best-effort so a cold ladder never errors.
      try {
        const rows = await apiFns.playerBoard(PAGE_SIZE, 0);
        set({ playerBoard: rows, playerBoardMore: hasMore(rows.length) });
      } catch {
        set({ playerBoard: [], playerBoardMore: false });
      }
      if (!get().account) {
        set({ myStanding: null });
        return;
      }
      try {
        set({ myStanding: await apiFns.playerMe() });
      } catch {
        set({ myStanding: null }); // unplaced this season
      }
    },

    async loadMorePlayers() {
      const s = get();
      if (s.playerBoardBusy || !s.playerBoardMore) return;
      const loaded = s.playerBoard ?? [];
      set({ playerBoardBusy: true });
      try {
        const rows = await apiFns.playerBoard(PAGE_SIZE, nextOffset(loaded.length));
        const merged = appendPage(loaded, rows);
        set({ playerBoard: merged, playerBoardMore: hasMore(rows.length), playerBoardBusy: false });
      } catch {
        set({ playerBoardBusy: false });
      }
    },

    async refreshWallet() {
      try {
        set({ wallet: await apiFns.getWallet() });
      } catch {
        /* transient */
      }
    },

    async refreshCatalog() {
      try {
        const [catalog, skinDocs] = await Promise.all([apiFns.getCatalog(), fetchSkinDocs()]);
        set({ catalog, skinDocs });
      } catch {
        /* transient */
      }
    },

    setLobbyView(view) {
      set({ lobbyView: view });
      if (view === "store") {
        void get().refreshWallet();
        void get().refreshCatalog();
      }
    },

    viewRankChange() {
      // settlement "查看戰績變化": land on the lobby leaderboard (play view) and
      // flag the delta banner. returnToLobby re-fetches the ranked ladder, so
      // myStanding refreshes and the banner can diff it against rankBefore.
      set({ lobbyView: "play", showRankChange: true });
      void get().returnToLobby();
    },

    dismissRankChange() {
      set({ showRankChange: false });
    },

    // ------------------------------------------------- 大廳公告 (#259) --

    async refreshAnnouncement() {
      try {
        const feed = parseAnnouncementFeed(await apiFns.publicAnnouncements());
        const view = announcementView(feed, readDismissed(browserDismissStorage()));
        // TWO SEPARATE FACTS, deliberately:
        //   `announcement`     — what the operator has published (or null).
        //   `announcementOpen` — whether it should INTERRUPT this player now.
        // Dismissal only answers the second. Collapsing them (storing only the
        // announcement that is still pending) was the first cut, and it threw
        // the text away on the next page load: the 📢 公告 chip vanished, so a
        // player who closed the popup before reading it had no way back to it.
        // Found by driving a browser, not by reading the code.
        set({ announcement: view.current, announcementOpen: view.open });
      } catch {
        // Platform down, feed 404 on an old build, offline, garbage body — the
        // lobby is unchanged and the player is never told. An announcement
        // system that breaks the lobby is worse than no announcement system.
      }
    },

    dismissAnnouncement() {
      const current = get().announcement;
      set({ announcementOpen: false });
      if (!current) return;
      const storage = browserDismissStorage();
      writeDismissed(storage, markDismissed(readDismissed(storage), current.id));
    },

    openAnnouncement() {
      if (get().announcement) set({ announcementOpen: true });
    },

    // ------------------------------------------------------------ store --

    purchaseBegin(item) {
      set({ purchase: beginPurchase(get().purchase, item) });
    },

    purchaseCancel() {
      set({ purchase: cancelPurchase(get().purchase) });
    },

    async purchaseConfirm() {
      const cur = get().purchase;
      if (cur.phase !== "confirm") return;
      set({ purchase: { phase: "busy", item: cur.item } });
      const result = await executePurchase(cur, apiFns.buyItem);
      set({ purchase: result });
      if (result.phase === "done") {
        set({ wallet: result.wallet });
        await get().refreshCatalog();
      }
    },

    async equip(championId, skinId) {
      try {
        const wallet = await apiFns.equipSkin(championId, skinId);
        set({ wallet });
        await get().refreshCatalog();
      } catch (err) {
        set({ lastError: errText(err) });
      }
    },

    // --------------------------------------------------------------- ws --

    matchJoinFailed(message) {
      const s = get();
      // A secured host refuses client-initiated (offline) match creation by
      // design (game-server MatchRoom.ts). Surface that as guidance — play via
      // login → lobby — not the raw technical string the owner hit.
      const friendly = isPlatformRestrictedError(message)
        ? OFFLINE_RESTRICTED_MESSAGE
        : `could not join the match: ${message}`;
      set({
        screen: s.account ? "lobby" : "auth",
        match: null,
        lastError: friendly,
      });
    },

    matchDisconnected(code) {
      const s = get();
      // ⚠️ 只講**真的發生了**的事：連線斷了、這一場結束了。⛔ 不要猜原因
      //（伺服器重啟／網路／被踢在客戶端這一側分不出來），代碼留給回報用。
      set({
        screen: s.account ? "lobby" : "auth",
        match: null,
        lastError: `與伺服器的連線中斷（代碼 ${code}），這一場已經結束。`,
      });
    },

    onWsMessage(raw) {
      const prev = get().ws;
      const next = reduceLobbyMessage(prev, raw);
      if (next === prev) return;
      // seat token push → launch the match (consume so it can't re-fire)
      if (next.matchReady && get().screen === "lobby") {
        const mr = next.matchReady;
        set({
          ws: { ...next, matchReady: null },
          screen: "match",
          // snapshot the pre-match standing for the post-match rank-delta screen
          rankBefore: get().myStanding,
          showRankChange: false,
          // the seat arrived: a pending one-click bot match is no longer pending
          botMatchBusy: false,
          match: platformLaunch(mr.matchId, mr.endpoint, mr.seatToken, mr.seatTokens),
        });
        return;
      }
      set({ ws: next });
      // presence deltas refresh the friends list lazily
      if (next.presence !== prev.presence) void get().refreshFriends();
    },

    showError(message) {
      set({ lastError: message });
    },

    clearError() {
      set({ lastError: null });
    },
  };
});

/**
 * React hook over the vanilla store.
 *
 * WHY THIS IS HAND-ROLLED INSTEAD OF `useStore(appStore, selector)`.
 * The client-side half is IDENTICAL to zustand's own `useStore` — same
 * `useSyncExternalStore`, same `useCallback([selector])` memo, so no extra
 * subscribe churn and no behaviour change in the browser. The difference is the
 * THIRD argument, the server snapshot: zustand passes `api.getInitialState`,
 * so anything rendered through `react-dom/server` sees the store as it was at
 * module load, no matter what has been `setState`d since.
 *
 * That is not an abstract concern here. `react-dom/server`'s
 * `renderToStaticMarkup` is how this repo's client tests render React at all —
 * the vitest env is `node`, there is no DOM — and several suites do
 * `appStore.setState({...})` and then render a screen. Under zustand's default
 * every one of those writes was invisible to the markup: the tests passed on
 * the parts that are static text and could not have caught a store-driven
 * element that fails to appear. That is the same class of hole that let #93,
 * #247 and 蒼月潮 ship invisible, and #259's announcement popup is entirely
 * store-driven, so it had to be closed before its test could mean anything.
 *
 * Production is untouched: this app never server-renders and never hydrates
 * (main.tsx uses `createRoot().render`), so React never asks for the server
 * snapshot outside a test.
 */
export function useApp<T>(selector: (s: AppState) => T): T {
  const snapshot = useCallback(() => selector(appStore.getState()), [selector]);
  return useSyncExternalStore(appStore.subscribe, snapshot, snapshot);
}
