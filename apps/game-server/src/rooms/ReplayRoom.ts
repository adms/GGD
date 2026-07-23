/**
 * ReplayRoom — the viewer's end of a recorded match.
 *
 * WHY A ROOM AND NOT A NEW VIEWER. The client already has a renderer, an
 * interpolation buffer, a HUD and a full projection of `MatchState`. Re-running
 * the recorded match here and publishing it through the SAME schema means a
 * replay is, to the client, just a match whose seats nobody controls — so the
 * owner watches it with the exact renderer his family played on, and a second
 * renderer (which would drift out of sync with the first the moment either
 * changed) never has to exist.
 *
 * WHAT MAKES IT A REPLAY AND NOT A VIDEO: the sim really re-runs, so the viewer
 * can pause, change speed, jump to a round, or scrub to any tick, and the camera
 * and HUD stay live throughout. Seeking rebuilds from tick 0 and fast-forwards
 * (there is no mid-match state snapshot to jump into — driver latches and the
 * input mailbox live outside the sim), which at ~0.1 ms/tick is a second or two
 * for a whole match, chunked so it never pins the event loop.
 *
 * INPUT IS REFUSED. A replay room registers no INPUT / SELECT_CHAMPION / CHEAT
 * handler, so a viewer cannot influence the match being replayed — the only
 * channel is the transport control below.
 */
import { Room, type Client } from "colyseus";
import { MatchState } from "@ggd/shared/protocol/schema";
import {
  REPLAY_MSG,
  type ReplayControlAction,
  type ReplayDivergedMessage,
  type ReplayRefusedMessage,
  type ReplayStatusMessage,
} from "@ggd/shared/protocol/replay";
import { TICK_MS } from "@ggd/shared/constants";
import type { HumanDriver } from "../seat/HumanDriver";
import { projectSnapshot } from "../net/snapshot";
import { ReplayPlayer, type ReplayRefusal } from "../replay/Player";
import { verifyReplayTicket } from "../replay/access";

export interface ReplayRoomOptions {
  /** Recording id (== matchId). */
  replayId?: string;
  /**
   * Admin-minted, short-lived proof that the viewer is allowed to watch. Only
   * enforced when a shared secret is configured; recordings carry player names,
   * so on a real deploy they are never viewable without one.
   */
  ticket?: string;
}

const SHARED_SECRET = process.env.PLATFORM_GAME_SHARED_SECRET ?? "";
/** Speed clamp: slow enough to study a trade, fast enough to skim a round. */
const MIN_SPEED = 0.25;
const MAX_SPEED = 8;
/** Ticks per fast-forward slice while seeking (bounded event-loop work). */
const SEEK_SLICE = 400;

export class ReplayRoom extends Room<MatchState> {
  private player: ReplayPlayer | null = null;
  private refusal: ReplayRefusal | null = null;
  private playing = false;
  private speed = 1;
  private seeking = false;
  private accumulator = 0;
  /** A replay has no live humans; projectSnapshot wants the map regardless. */
  private readonly noDrivers = new Map<number, HumanDriver>();

  override async onAuth(_client: Client, options: Record<string, unknown>): Promise<boolean> {
    if (!SHARED_SECRET) return true; // dev/LAN: the whole box is the operator's
    const ticket = typeof options.ticket === "string" ? options.ticket : "";
    const replayId = typeof options.replayId === "string" ? options.replayId : "";
    return verifyReplayTicket(SHARED_SECRET, ticket, replayId);
  }

  override async onCreate(options: ReplayRoomOptions): Promise<void> {
    this.maxClients = 4; // the owner, maybe someone looking over his shoulder
    this.autoDispose = true;
    this.setState(new MatchState());

    const opened = await ReplayPlayer.open(String(options.replayId ?? ""));
    if ("refusal" in opened) {
      // REFUSE, LOUDLY AND EARLY. Nothing is simulated and nothing is projected:
      // a viewer must never see a single frame of a match this recording does not
      // actually describe.
      this.refusal = opened.refusal;
      console.warn(`[replay] refused to play ${options.replayId}: ${opened.refusal.code}`);
      return;
    }
    this.player = opened.player;
    this.state.matchId = this.player.header.matchId;
    this.state.seed = this.player.header.seed;
    this.state.contentVersion = this.player.header.contentVersion;
    this.state.combatEnvJson = JSON.stringify(this.player.header.combatEnv);
    projectSnapshot(this.player.ctl, this.state, this.noDrivers);

    this.onMessage(REPLAY_MSG.CONTROL, (client, msg: ReplayControlAction) => {
      void this.control(client, msg);
    });
    this.setSimulationInterval((dt) => this.loop(dt), TICK_MS / 2);
  }

  override onJoin(client: Client): void {
    // The refusal / status is pushed on join so a viewer arriving late (or a
    // reconnect) always learns the current state without asking.
    if (this.refusal) {
      client.send(REPLAY_MSG.REFUSED, this.refusal satisfies ReplayRefusedMessage);
      return;
    }
    this.sendStatus(client);
    if (this.player?.divergence) client.send(REPLAY_MSG.DIVERGED, this.player.divergence);
  }

  private async control(client: Client, msg: ReplayControlAction): Promise<void> {
    const p = this.player;
    if (!p || !msg || this.seeking) return;
    switch (msg.action) {
      case "play":
        // Refuse to resume a diverged replay: everything past the divergence is
        // a match that never happened, and showing it is the exact failure this
        // feature exists to prevent.
        if (!p.divergence && !p.finished) this.playing = true;
        break;
      case "pause":
        this.playing = false;
        break;
      case "speed":
        this.speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, Number(msg.speed) || 1));
        break;
      case "restart":
        await this.seekTo(0);
        break;
      case "seekTick":
        await this.seekTo(Math.max(0, Math.floor(Number(msg.tick) || 0)));
        break;
      case "seekRound": {
        const tick = p.roundStartTick(Math.floor(Number(msg.round) || 1));
        if (tick !== null) await this.seekTo(tick);
        break;
      }
    }
    this.broadcastStatus();
  }

  /**
   * Rebuild-and-fast-forward. Digests are verified for every intermediate tick
   * exactly as during normal playback, so a seek can (and should) surface a
   * divergence that lies before the destination.
   */
  private async seekTo(targetTick: number): Promise<void> {
    const p = this.player;
    if (!p) return;
    const wasPlaying = this.playing;
    this.playing = false;
    this.seeking = true;
    this.broadcastStatus();
    p.reset();
    while (p.tick < targetTick && !p.stopped) {
      p.runSlice(Math.min(SEEK_SLICE, targetTick - p.tick));
      await new Promise<void>((r) => setImmediate(r));
    }
    this.seeking = false;
    this.accumulator = 0;
    projectSnapshot(p.ctl, this.state, this.noDrivers);
    if (p.divergence) this.reportDivergence(p.divergence);
    else this.playing = wasPlaying && !p.finished;
    this.broadcastStatus();
  }

  private loop(dtMs: number): void {
    const p = this.player;
    if (!p || !this.playing || this.seeking) return;
    this.accumulator += dtMs * this.speed;
    // Bound the per-frame burst the same way the live room does, so an 8x replay
    // cannot starve the snapshot broadcast (or a live match sharing the loop).
    let steps = Math.min(Math.floor(this.accumulator / TICK_MS), Math.ceil(MAX_SPEED * 2));
    this.accumulator -= steps * TICK_MS;
    let stepped = false;
    while (steps-- > 0) {
      if (!p.step()) {
        this.playing = false;
        if (p.divergence) this.reportDivergence(p.divergence);
        else this.broadcastStatus();
        break;
      }
      stepped = true;
    }
    if (stepped) {
      projectSnapshot(p.ctl, this.state, this.noDrivers);
      // Cheap heartbeat so the viewer's scrub bar tracks without a message per
      // tick: once every ~half second of playback.
      if (p.tick % 15 === 0) this.broadcastStatus();
    }
  }

  /** STOP and say exactly where and why. Never a warning, never a continue. */
  private reportDivergence(d: ReplayDivergedMessage): void {
    this.playing = false;
    console.error(
      `[replay ${this.player?.header.matchId}] DIVERGED at tick ${d.tick} (${d.kind}): ` +
        `world expected ${d.expectedWorld} got ${d.actualWorld}, ` +
        `host expected ${d.expectedHost} got ${d.actualHost}`,
    );
    this.broadcast(REPLAY_MSG.DIVERGED, d);
    this.broadcastStatus();
  }

  private status(): ReplayStatusMessage {
    const p = this.player!;
    return {
      matchId: p.header.matchId,
      startedAt: p.header.startedAt,
      tick: p.tick,
      lastTick: p.lastRecordedTick,
      playing: this.playing,
      speed: this.speed,
      seeking: this.seeking,
      finished: p.finished,
      truncated: p.truncated,
      rounds: p.rounds,
      contentVersion: p.header.contentVersion,
      buildStamp: p.header.buildStamp,
      seats: p.header.seats.map((s) => ({
        seatId: s.seatId,
        teamId: s.teamId,
        displayName: s.displayName,
        isBot: s.isBot,
      })),
    };
  }

  private sendStatus(client: Client): void {
    if (this.player) client.send(REPLAY_MSG.STATUS, this.status());
  }

  private broadcastStatus(): void {
    if (this.player) this.broadcast(REPLAY_MSG.STATUS, this.status());
  }
}
