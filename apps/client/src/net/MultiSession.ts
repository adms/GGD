/**
 * MultiSession — couch play: N local players = N RoomConnections into the SAME
 * match, each with its own IntentSender (own seq stream + own seat).
 *
 * Kept deliberately minimal:
 *  - entity rendering / interpolation / HUD projection key off connection 0's
 *    schema state ONLY (every connection sees the same authoritative state —
 *    render it once);
 *  - inputs + lastAckSeq are PER connection, but client-side prediction runs
 *    only for player 0's champion — players 2..4 render server-authoritative
 *    (INTERP_DELAY_MS of interpolation; fine on a couch).
 *
 * Connections + senders exist from construction (GameApp wires input sinks
 * before any socket opens); connect*() opens the sockets.
 */
import type { Room } from "colyseus.js";
import type { MatchState } from "@ggd/shared/protocol/schema";
import type { Cheat } from "@ggd/shared/protocol/messages";
import { RoomConnection } from "./RoomConnection";
import { IntentSender } from "./IntentSender";

/** One entry of the platform's match_ready seatTokens[] push. */
export interface SeatTokenEntry {
  accountId: string;
  seatToken: string;
}

/** Couch caps at 4 local players (pads) per machine. */
export const MAX_LOCAL_PLAYERS = 4;

export class MultiSession {
  readonly connections: RoomConnection[];
  readonly senders: IntentSender[];

  /**
   * accountIds: one per local player, player 0 first. An empty array means a
   * single anonymous dev player.
   */
  constructor(accountIds: (string | undefined)[]) {
    const ids = accountIds.length > 0 ? accountIds.slice(0, MAX_LOCAL_PLAYERS) : [undefined];
    this.connections = [];
    for (let i = 0; i < ids.length; i++) {
      // dev guests without an explicit id get "{player0}:p2".."p4" — mirrors
      // the platform's guest pseudo-ids so display/HUD logic matches
      const id = ids[i] ?? (i > 0 ? `${this.connections[0]!.accountId}:p${i + 1}` : undefined);
      this.connections.push(new RoomConnection(id));
    }
    this.senders = this.connections.map(
      (conn) => new IntentSender((msg) => conn.sendInput(msg)),
    );
  }

  /** Primary connection — the ONLY source of rendered/HUD state. */
  get primary(): RoomConnection {
    return this.connections[0]!;
  }

  get count(): number {
    return this.connections.length;
  }

  localAccountIds(): string[] {
    return this.connections.map((c) => c.accountId);
  }

  senderFor(player: number): IntentSender | null {
    return this.senders[player] ?? null;
  }

  /**
   * Platform flow: one consumeSeatReservation per seat-token entry, aligned
   * with the connections by index (owner first, then ":p2".."p4" guests).
   */
  async connectPlatform(endpoint: string, entries: SeatTokenEntry[]): Promise<Room<MatchState>> {
    let primaryRoom: Room<MatchState> | null = null;
    for (let i = 0; i < this.connections.length; i++) {
      const entry = entries[i];
      if (!entry) break;
      const reservation = JSON.parse(entry.seatToken) as Parameters<
        RoomConnection["connectWithReservation"]
      >[1];
      const room = await this.connections[i]!.connectWithReservation(endpoint, reservation);
      if (!primaryRoom) primaryRoom = room;
    }
    if (!primaryRoom) throw new Error("no seat tokens");
    return primaryRoom;
  }

  /**
   * Dev flow (no platform): player 0 joinOrCreates the shared dev match;
   * players 2..N join the SAME room by id with their own dev ids.
   */
  async connectDev(mapId?: string): Promise<Room<MatchState>> {
    const room = await this.connections[0]!.connectDev(mapId);
    for (let i = 1; i < this.connections.length; i++) {
      await this.connections[i]!.connectDevJoin(room.roomId);
    }
    return room;
  }

  /**
   * REPLAY flow (task #175): the PRIMARY connection joins a "replay" room. There
   * are no couch guests and no senders in a replay — nobody controls the match —
   * so only connection 0 is used; the rest stay idle. Returns the primary room
   * so GameApp binds its renderer to the same schema stream a live match uses.
   */
  async connectReplay(replayId: string, ticket: string): Promise<Room<MatchState>> {
    return this.connections[0]!.connectReplay(replayId, ticket);
  }

  sendSelectChampion(player: number, championId: string): void {
    this.connections[player]?.sendSelectChampion(championId);
  }

  /** Dev cheat for the LOCAL (primary) player only — offline testing aid. */
  sendCheat(cheat: Cheat): void {
    this.primary.sendCheat(cheat);
  }

  /** Flush every player's coalesced order/aim (once per frame). */
  update(nowMs: number): void {
    for (const s of this.senders) s.update(nowMs);
  }

  /** Leave every room — the network half of GameApp teardown. */
  leave(): void {
    for (const c of this.connections) c.leave();
  }

  /**
   * Full teardown: leave ALL rooms and drop input sinks so no coalesced flush
   * or socket callback can fire after the GameApp is disposed. Idempotent.
   */
  dispose(): void {
    this.leave();
    for (const s of this.senders) s.onSent = null;
  }
}
