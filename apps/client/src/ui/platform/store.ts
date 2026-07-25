/**
 * Platform app store — Zustand vanilla store driving the pre-match screens
 * (auth → lobby → store → match handoff). Lives under ui/ per the client-08
 * arch gate (zustand only in ui/* + net/RoomStore.ts); ALL writes happen via
 * the `set` closure inside the creator (no external .setState calls).
 * main.tsx subscribes to `screen` to boot/dispose the imperative GameApp.
 */
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";

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
import { ensureContentLoaded } from "../../content/bootContent";
import { isPlatformRestrictedError, OFFLINE_RESTRICTED_MESSAGE } from "./firstOwner";
import { restartAction, ONLINE_RESTART_NOTE } from "./restart";
import { connectedPadIndices } from "../../input/GamepadInput";
import { setLocalDisplayName } from "../../net/RoomConnection";
import { appendPage, hasMore, nextOffset, PAGE_SIZE } from "./ranking";
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
  myPick: string;
  myReady: boolean;
  /** couch players on MY machine for the current room (1..4) */
  myLocalPlayers: number;
  /** last invite token created by me (copyable room code) */
  createdInvite: { token: string; forName: string } | null;

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
  playOffline(mapId?: string): void;
  /**
   * login→battle handoff (task #74): stage an offline launch behind the >=1s
   * loading transition and request the login-roar fade — instead of jumping
   * straight to "match". `commitMatchLaunch` performs the actual screen flip
   * once the loading bar has run its minimum.
   */
  beginOfflineLoading(mapId?: string): void;
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
  createRoom(name: string, botDifficulty: string, mapId?: string, rogueliteMobs?: boolean): Promise<void>;
  joinRoom(roomId: string): Promise<void>;
  leaveRoom(): Promise<void>;
  refreshRoom(): Promise<void>;
  setReady(ready: boolean, champion?: string): Promise<void>;
  setPick(championId: string): void;
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
   */
  playBotMatch(mapId?: string, rogueliteMobs?: boolean): Promise<void>;
  createInvite(accountId: string, username: string): Promise<void>;
  joinByCode(token: string): Promise<void>;
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

  purchaseBegin(item: PurchaseItem): void;
  purchaseCancel(): void;
  purchaseConfirm(): Promise<void>;
  equip(championId: string, skinId: string | null): Promise<void>;

  onWsMessage(raw: unknown): void;
  matchJoinFailed(message: string): void;
  /** Surface a message in the error toast (a CLIENT-side failure, not an API one). */
  showError(message: string): void;
  clearError(): void;
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
    ]);
  }

  /** Compute the launch payload for an offline (dev direct-join) match. */
  function offlineLaunch(mapId?: string): MatchLaunch {
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
    myPick: "",
    myReady: false,
    myLocalPlayers: 1,
    createdInvite: null,
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
    match: null,
    matchLoading: null,
    matchEpoch: 0,
    botMatchBusy: false,
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
        myPick: "",
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
        match: null,
        matchLoading: null,
        botMatchBusy: false,
        leaveGate: false,
      });
    },

    playOffline(mapId?: string) {
      set({
        screen: "match",
        // snapshot the pre-match standing for the post-match rank-delta screen
        rankBefore: get().myStanding,
        showRankChange: false,
        matchLoading: null,
        match: offlineLaunch(mapId),
      });
    },

    beginOfflineLoading(mapId?: string) {
      // Stage the launch and request the roar fade NOW; the loading bar
      // (MatchLoadingOverlay) shows for >=MATCH_LOADING_MIN_MS, then calls
      // commitMatchLaunch. `screen` stays "auth" meanwhile, so AuthScreen (and
      // its login scene) remain mounted and no combat voice has started yet.
      set({ matchLoading: { launch: offlineLaunch(mapId), roarFadeRequested: true } });
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

    async createRoom(name, botDifficulty, mapId, rogueliteMobs) {
      try {
        const resp = await apiFns.createRoom({
          name,
          botDifficulty,
          ...(mapId ? { mapId } : {}),
          // Only transmit when the host UNCHECKED it: sending nothing keeps the
          // whole chain default-ON (#215). `=== false` guards against passing a
          // stray truthy/undefined that would still serialize a key.
          ...(rogueliteMobs === false ? { rogueliteMobs: false } : {}),
        });
        set({ room: resp, myReady: false, myPick: "", myLocalPlayers: 1, createdInvite: null, ws: { ...get().ws, chat: [] } });
      } catch (err) {
        set({ lastError: errText(err) });
      }
    },

    async joinRoom(roomId) {
      try {
        const resp = await apiFns.joinRoom(roomId);
        set({ room: resp, myReady: false, myPick: "", myLocalPlayers: 1, createdInvite: null, ws: { ...get().ws, chat: [] } });
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
      set({ room: null, myReady: false, myPick: "", createdInvite: null, ws: { ...get().ws, chat: [] } });
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

    async setReady(ready, champion) {
      const room = get().room;
      if (!room) return;
      try {
        await apiFns.setReady(room.room.id, ready, champion ?? (get().myPick || undefined));
        set({ myReady: ready });
        await get().refreshRoom();
      } catch (err) {
        set({ lastError: errText(err) });
      }
    },

    setPick(championId) {
      set({ myPick: championId });
      const { room, myReady } = get();
      // picks ride the ready endpoint; re-send to record the new pick
      if (room) void get().setReady(myReady, championId);
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
      try {
        await apiFns.startRoom(room.room.id);
        // seat token arrives over the lobby WS (match_ready) for everyone
      } catch (err) {
        set({ lastError: errText(err) });
      }
    },

    async playBotMatch(mapId?: string, rogueliteMobs?: boolean) {
      if (get().botMatchBusy) return; // one click is one match
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
      try {
        // Only include a field when it deviates from the default: map when set,
        // rogueliteMobs only when explicitly OFF (sending nothing = ON, #215).
        const solo: { mapId?: string; rogueliteMobs?: boolean } = {};
        if (mapId) solo.mapId = mapId;
        if (rogueliteMobs === false) solo.rogueliteMobs = false;
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
          myPick: "",
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

/** React hook over the vanilla store. */
export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(appStore, selector);
}
