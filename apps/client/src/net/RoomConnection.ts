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
}

/** Bounded: a dropped dodge label is a cosmetic loss, an unbounded queue is not. */
const MAX_EVADE_SIGHTINGS = 32;
/** Two connections in one room see the same dodge within a socket turn. */
const EVADE_DEDUPE_MS = 20;
const evadeSightings: EvadeSighting[] = [];

function nowMsSafe(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Record one dodge, unless this exact dodge was already recorded just now. */
export function recordEvade(data: Record<string, unknown>): void {
  const target = data.target;
  if (typeof target !== "number") return;
  const source = typeof data.source === "number" ? data.source : undefined;
  const x = typeof data.x === "number" ? data.x : 0;
  const z = typeof data.z === "number" ? data.z : 0;
  const atMs = nowMsSafe();
  for (let i = evadeSightings.length - 1; i >= 0; i--) {
    const e = evadeSightings[i]!;
    if (atMs - e.atMs > EVADE_DEDUPE_MS) break; // buffer is append-ordered
    if (e.target === target && e.source === source) return;
  }
  evadeSightings.push({ source, target, x, z, atMs });
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

export class RoomConnection {
  room: Room<MatchState> | null = null;
  readonly accountId: string;
  /** per-connection override; falls back to the published local name */
  readonly displayNameOverride: string;
  private readonly queuedEvents: EventMessage[] = [];
  onDisconnect: ((code: number) => void) | null = null;

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
  async connectDev(mapId?: string, endpoint: string = defaultEndpoint()): Promise<Room<MatchState>> {
    const client = new Client(endpoint);
    const room = await client.create<MatchState>("match", {
      ...this.joinOptions(),
      ...(mapId ? { mapId } : {}),
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

  private bind(room: Room<MatchState>): void {
    this.room = room;
    room.onMessage(MSG.EVENT, (ev: EventMessage) => {
      this.queuedEvents.push(ev);
      if (this.queuedEvents.length > 512) this.queuedEvents.splice(0, this.queuedEvents.length - 512);
      // 迴避 also lands in its own buffer (see EvadeSighting above): the frame
      // loop's fanout can't carry it, because nothing downstream of the loop
      // has a consumer for an event that produces no damage packet.
      if (ev.type === "evade") recordEvade(ev.data);
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
    // …and the 迴避 buffer with them: a dodge that was never drained belongs to
    // a match that is over, and would otherwise be drawn over the next one.
    clearEvadeSightings();
    this.onDisconnect = null;
    this.room = null;
  }
}
