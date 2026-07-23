/**
 * RoomConnection — the colyseus.js seam. Dev flow: joinOrCreate("match")
 * directly (the server backfills bots; no ticket needed without a shared
 * secret). Platform flow: consume a seat reservation minted by the Go
 * platform (seatToken) which carries the onAuth ticket.
 * Server events (MSG.EVENT) queue here and are drained once per frame by the
 * GameApp loop — network → sim-event fanout never runs inside a socket callback.
 */
import { Client, type Room, type SeatReservation } from "colyseus.js";
import type { MatchState } from "@ggd/shared/protocol/schema";
import { recordReject } from "./RoomStore";
import {
  MSG,
  type Cheat,
  type CheatMessage,
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

export class RoomConnection {
  room: Room<MatchState> | null = null;
  readonly accountId: string;
  private readonly queuedEvents: EventMessage[] = [];
  onDisconnect: ((code: number) => void) | null = null;

  constructor(accountId?: string) {
    this.accountId = accountId ?? `dev-${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * Dev / offline flow: CREATE a fresh "match" room directly (bots backfill; no
   * ticket needed without a shared secret). We create rather than joinOrCreate so
   * every offline launch — and every "Restart match" — gets a brand-new SimWorld
   * (cleared battlefield, round 1) and can't rejoin a not-yet-disposed old room.
   * Couch guests join this room by id via connectDevJoin.
   */
  async connectDev(mapId?: string, endpoint: string = defaultEndpoint()): Promise<Room<MatchState>> {
    const client = new Client(endpoint);
    const room = await client.create<MatchState>("match", {
      accountId: this.accountId,
      ...(mapId ? { mapId } : {}),
    });
    this.bind(room);
    return room;
  }

  /** Dev couch flow: join an EXISTING dev room by id (extra local players). */
  async connectDevJoin(roomId: string, endpoint: string = defaultEndpoint()): Promise<Room<MatchState>> {
    const client = new Client(endpoint);
    const room = await client.joinById<MatchState>(roomId, { accountId: this.accountId });
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

  private bind(room: Room<MatchState>): void {
    this.room = room;
    room.onMessage(MSG.EVENT, (ev: EventMessage) => {
      this.queuedEvents.push(ev);
      if (this.queuedEvents.length > 512) this.queuedEvents.splice(0, this.queuedEvents.length - 512);
    });
    room.onMessage(MSG.REJECT, (msg: { reason?: string } | undefined) => {
      // surface the reason (e.g. a non-whitelisted champion pick) to the HUD
      recordReject(typeof msg?.reason === "string" ? msg.reason : "rejected");
    });
    room.onMessage(MSG.PHASE, () => {
      /* phase rides the schema; message is informational */
    });
    room.onLeave((code) => {
      this.onDisconnect?.(code);
    });
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
    void this.room?.leave(true);
    this.queuedEvents.length = 0;
    this.onDisconnect = null;
    this.room = null;
  }
}
