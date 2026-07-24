/**
 * MatchRoom — thin Colyseus wrapper around MatchController.
 * Network in: INPUT -> seat mailbox; SELECT_CHAMPION -> controller.
 * Network out: schema patches (projectSnapshot) + sim event fanout.
 * Disconnect: swap seat driver to AI immediately; allowReconnection window
 * hands control back on return. Match end: HMAC result callback to platform.
 */
import { Room, type Client } from "colyseus";
import { MatchState } from "@ggd/shared/protocol/schema";
import { MSG, SETTLEMENT_EVENT, type SelectChampionMessage, type CheatMessage } from "@ggd/shared/protocol/messages";
import { TICK_MS, SEAT_COUNT, TEAM_SIZE } from "@ggd/shared/constants";
import { asSeatId, type SeatId } from "@ggd/shared/ids";
import { normalizeCombatEnv, type CombatEnvKey } from "@ggd/shared/sim/combatEnv";
import { MatchController, type MatchResult, type SeatSpec } from "../match/MatchController";
import type { MatchPhase } from "../match/PhaseMachine";
import { resolvePhaseConfig, resolveFireRing, resolveStartingLives } from "../match/phaseConfig";
import { planTicks } from "../match/tickLoop";
import { resolveArenaRules } from "../match/arenaRules";
import { resolveArena, resolveArenaPool } from "../match/arenaSelect";
import { isFannedOutEvent } from "../net/eventFanout";
import { cheatsEnabled } from "../match/cheatGate";
import { HumanDriver } from "../seat/HumanDriver";
import { AIDriver } from "../ai/Tier0Brain";
import { projectSnapshot } from "../net/snapshot";
import { sign, verifyTicket } from "../auth/hmac";
import { Whitelist, WHITELIST_BYPASS, sharedWhitelistCache } from "../curation/whitelist";
import { sharedCombatEnvCache } from "../config/combatEnv";
import { resolveServerOps, type ServerOps } from "../config/serverOps";
import { PLATFORM_URL } from "../config/platformUrl";
import { sanitizeInputMessage } from "../net/validateInput";
import { MessageRateLimiter } from "../net/messageRateLimiter";
import { sanitizeDisplayName } from "../net/sanitizeText";
import { roomRegistry } from "./roomRegistry";
import { verifyCreateToken } from "./createGate";
import { MatchRecorder } from "../replay/Recorder";
import { buildHeader } from "../replay/headerCodec";
import { activeContentVersion } from "../replay/Player";

export interface MatchRoomOptions {
  matchId?: string;
  seed?: number;
  /** selected arena id (Arenas registry key); unknown/absent → skeleton */
  mapId?: string;
  /** human seats reserved by the platform; bots fill the rest */
  seats?: { seatId: number; teamId: number; accountId: string; displayName: string; championId?: string }[];
  callbackUrl?: string;
  /**
   * Server-only proof that /_internal/matches minted this room (createGate.ts).
   * Required — and verified — only when a shared secret is configured (prod);
   * absent/forged aborts creation before any sim state is built. Clients cannot
   * forge it without the secret, so client-initiated create()/joinOrCreate is
   * refused (room-creation-flood DoS).
   */
  createToken?: string;
  /** dev convenience: create a fully-botted match on direct join */
  devSoloJoin?: boolean;
  /**
   * Dev/LAN direct-join human name for the seat this client takes over. The
   * platform flow labels seats via `seats[].displayName`; the dev takeover path
   * has no such source, so without this the claimed seat keeps the generic
   * "Bot N" label stamped at construction (#156). Sanitized before use.
   */
  displayName?: string;
  /**
   * Pre-resolved content whitelist (tests / callers that already fetched it).
   * When absent, onCreate resolves one at match creation via the short-TTL
   * process cache (or allow-all under GGD_WHITELIST_BYPASS=1).
   */
  whitelist?: Whitelist;
  /**
   * Pre-resolved combat-environment multiplier overrides for this match
   * (sparse table; missing keys = 1.0). Tests/dev callers inject it directly;
   * when absent, onCreate resolves content defaults + the admin 戰鬥系統
   * override from the platform (short-TTL process cache, fail-safe to content
   * defaults — see config/combatEnv.ts).
   */
  combatEnv?: Partial<Record<CombatEnvKey, number>>;
  /**
   * NOTE — there is deliberately NO `serverOps` field here.
   *
   * Everything in this bag arrives from whoever created the room, which in a
   * deploy without a shared secret means any client (that is precisely why
   * `createToken` above has to be verified). The ops table carries `maxRooms`,
   * which is not per-match state: it moves the PROCESS-WIDE admission ceiling
   * and outlives the room that set it, so a client-supplied value would let one
   * join pin the whole shard at one concurrent match, or raise the ceiling to
   * 500 and delete the DoS guard, for everybody. The table is resolved through
   * config/serverOps.ts `resolveServerOps()` instead — platform, then env, then
   * compiled defaults — and tests override it with the module-level
   * `setServerOpsForTests`, which nothing on the wire can reach.
   */
}

/**
 * THE RESULT-CALLBACK WIRE CONTRACT — the JSON body of
 * `POST /api/v1/internal/matches/{matchId}/result`, field for field the Go
 * struct `gamelink.ResultRequest` in
 * `apps/platform/internal/gamelink/callback.go`.
 *
 * It is declared here, explicitly, because the previous code posted the
 * game-server's OWN `MatchResult` and assumed the two agreed. They never did:
 * `MatchResult` nests everything under `teams[]`, while the platform reads
 * top-level `placements[]` and `seats[]`. Only `matchId` and `mode` overlapped,
 * so every callback ever sent decoded into a settlement with zero seats — HMAC
 * valid, 200 OK, nobody credited. Keeping the shape as a named type next to the
 * function that fills it means the next divergence is a compile error here and
 * a 400 from the platform (which now rejects a body with no placements/seats
 * instead of silently settling it), not another year of empty ladders.
 */
export interface PlatformResultPayload {
  matchId: string;
  mode: string;
  mapId: string;
  /** one entry per team; `place` 1 = winner */
  placements: { team: number; place: number }[];
  /** every seat, bots included — the platform filters them */
  seats: { accountId: string; team: number; isBot: boolean; championId?: string }[];
  /** unix ms; the platform falls back to its own clock when absent */
  endedAt: number;
}

/**
 * Is this account id something the platform could actually credit?
 *
 * The dev/LAN join path stamps `dev-<sessionId>` on a seat whose client sent no
 * account id (see onJoin), which is the honest representation of "nobody is
 * signed in here". Those seats are real players having a real game, but there
 * is no account to pay, so a match made only of them is not worth a callback.
 * A signed-in client sends its platform account id even on the offline path
 * (client store `offlineLaunch`), and couch guests arrive as platform-minted
 * `:p2`..`:p4` pseudo-ids which the platform itself knows to skip.
 */
export function isSettleableAccountId(accountId: string): boolean {
  return accountId !== "" && !accountId.startsWith("dev-");
}

/**
 * Translate the sim's own `MatchResult` into the platform's contract above.
 * `championOf` resolves the champion a seat actually played, which credits the
 * per-champion points board (the platform falls back to the champion recorded
 * at reservation when it is empty).
 */
export function buildPlatformResult(
  result: MatchResult,
  mapId: string,
  championOf: (seatId: number) => string,
  endedAt: number = Date.now(),
): PlatformResultPayload {
  return {
    matchId: result.matchId,
    mode: result.mode,
    mapId,
    placements: result.teams.map((t) => ({ team: t.teamId, place: t.placement })),
    seats: result.teams.flatMap((t) =>
      t.members.map((m) => {
        const championId = championOf(m.seatId);
        return {
          accountId: m.accountId,
          team: t.teamId,
          isBot: m.isBot,
          ...(championId ? { championId } : {}),
        };
      }),
    ),
    endedAt,
  };
}

const SHARED_SECRET = process.env.PLATFORM_GAME_SHARED_SECRET ?? "";
const RECONNECT_GRACE_SECS = 60;
/**
 * Dev-cheat hard gate, decided ONCE at process start from the environment —
 * never from any client claim. Prod (shared secret set) always disables cheats;
 * dev defaults on unless GGD_DEV_CHEATS=0.
 */
const DEV_CHEATS = cheatsEnabled(SHARED_SECRET, process.env.GGD_DEV_CHEATS);
/** WS close code used when a session is booted for sustained message flooding. */
const RATE_LIMIT_CLOSE_CODE = 4290;

export class MatchRoom extends Room<MatchState> {
  private ctl!: MatchController;
  private accumulator = 0;
  private humanDrivers = new Map<number, HumanDriver>();
  private seatByAccount = new Map<string, SeatId>();
  private seatBySession = new Map<string, SeatId>();
  private callbackUrl: string | undefined;
  private resultSent = false;
  /** contained room-loop faults (tick() self-contains; this is the last-resort net). */
  private loopFaults = 0;
  private loggedLoopFaults = 0;
  /** per-session inbound-message rate limiter (DoS: message-flood). */
  private readonly rateLimiter = new MessageRateLimiter();
  /** true once this room holds a process-wide concurrent-room slot. */
  private acquiredRoomSlot = false;
  /**
   * MATCH RECORDER (task #175) — every match is recorded by default, because the
   * replay IS the playtest feedback channel and a match nobody thought to record
   * is a match the owner cannot be told about. null when recording could not be
   * opened; a broken recording never breaks a game.
   */
  private recorder: MatchRecorder | null = null;

  override async onAuth(client: Client, options: Record<string, unknown>): Promise<boolean> {
    // Defense-in-depth: when a shared secret is configured, joins must carry a
    // platform-minted ticket matching a reserved seat. Without a secret (dev),
    // anyone may join.
    if (!SHARED_SECRET) return true;
    const ticket = typeof options.ticket === "string" ? options.ticket : "";
    const accountId = verifyTicket(SHARED_SECRET, ticket);
    if (!accountId) return false;
    (client.userData as Record<string, unknown>) = { accountId };
    return true;
  }

  override async onCreate(options: MatchRoomOptions): Promise<void> {
    // CREATION GATE (DoS: room-creation-flood). Legit matches are always minted
    // server-side by /_internal/matches, which injects a signed createToken.
    // When a shared secret is configured (prod), a create()/joinOrCreate from a
    // client carries no valid token, so we abort BEFORE building any sim state.
    // In dev (no secret) creation stays open, matching onAuth's dev behavior.
    if (SHARED_SECRET && !verifyCreateToken(SHARED_SECRET, options.createToken)) {
      throw new Error("match creation is restricted to the platform reservation flow");
    }
    // OPERATIONAL SETTINGS (admin 系統運維). Resolved HERE, at the top of
    // onCreate, because both knobs are consumed a few lines below: maxRooms by
    // the admission gate and snapshotHz by patchRate. The create path is the
    // only reader of either, which is precisely why no polling loop exists —
    // refreshing at the create attempt IS "live" for maxRooms, and snapshotHz
    // gets combat-env semantics for free (a running match keeps what it started
    // with). Fails safe to the last-known-good table, then to the compiled/env
    // defaults.
    //
    // NOT from `options`: see MatchRoomOptions. maxRooms is process-wide state,
    // and this bag is client-controlled whenever no shared secret is set.
    const ops: ServerOps = await resolveServerOps();

    // PROCESS-WIDE CONCURRENT-ROOM CAP (DoS). Refuse — before allocating the sim
    // — once the shard is already running the maximum number of ticking matches.
    //
    // The ceiling is pushed in immediately before the gate so an operator's edit
    // takes effect on the very next create attempt (within the 5 s cache TTL).
    // Lowering it below the live count does NOT end any match: setCapacity only
    // moves the admission line, so the process drains — `active` stays where it
    // is, every new match is refused, and admission resumes as running matches
    // finish and release their slots (see rooms/roomRegistry.ts).
    roomRegistry.setCapacity(ops.maxRooms);
    if (!roomRegistry.tryAcquire()) {
      throw new Error(
        `game-server at capacity: ${roomRegistry.active} match(es) running, ceiling ${roomRegistry.capacity}`,
      );
    }
    this.acquiredRoomSlot = true;
    // Per-room client cap (join-flood) + autoDispose (no zombie rooms). A match
    // never has more than SEAT_COUNT human clients, so cap the room there.
    this.maxClients = SEAT_COUNT;
    this.autoDispose = true;
    // SNAPSHOT BROADCAST RATE. Must be assigned explicitly: Colyseus defaults
    // Room.patchRate to 1000/20, and before this line nothing in the repo ever
    // set it — so SNAPSHOT_HZ was a constant with no consumer and the 20 Hz on
    // the wire was the library default, not our choice. Transport only; the sim
    // still steps at TICK_HZ and stays byte-identical (see config/snapshotRate).
    // Resolved from the ops table (env value as the floor) and frozen for this
    // match — an admin save applies from the NEXT match.
    this.patchRate = 1000 / ops.snapshotHz;

    const matchId = options.matchId ?? `dev-${Math.random().toString(36).slice(2, 10)}`;
    const seed = options.seed ?? (Date.now() & 0xffffffff);
    this.callbackUrl = options.callbackUrl;

    // Resolve the content whitelist AT MATCH CREATION. Colyseus awaits an async
    // onCreate before the room accepts joins, so filtering is in force from the
    // first tick. Bypass / fetch failures fail safe to allow-all (see
    // curation/whitelist.ts). Tests inject options.whitelist directly.
    const whitelist =
      options.whitelist ?? (WHITELIST_BYPASS ? Whitelist.allowAll() : await sharedWhitelistCache().get());

    // Build 12 seat specs: reserved humans + bot fill.
    const specs: SeatSpec[] = [];
    const humanSeats = options.seats ?? [];
    const taken = new Set(humanSeats.map((s) => s.seatId));
    for (const h of humanSeats) {
      // XSS backstop: seat names enter room state and reach the client's
      // innerHTML sink — strip markup/controls + bound length here, so the
      // server never trusts a caller-supplied displayName (finding: stored-XSS).
      // Preserve an ABSENT name as undefined so MatchController's "Player N"
      // fallback still applies (only real strings are sanitized).
      specs.push({
        ...h,
        displayName: typeof h.displayName === "string" ? sanitizeDisplayName(h.displayName) : h.displayName,
        isBot: false,
      });
    }
    for (let seatId = 0; seatId < SEAT_COUNT; seatId++) {
      if (taken.has(seatId)) continue;
      specs.push({ seatId, teamId: Math.floor(seatId / TEAM_SIZE), isBot: true });
    }

    // Combat-environment multipliers: resolved AT MATCH CREATION (content
    // defaults + admin 戰鬥系統 override, admin wins per key) and frozen for
    // the whole match (deterministic — a mid-match admin save only affects the
    // NEXT match). Tests/dev callers inject options.combatEnv directly; the
    // platform fetch fails safe to content defaults (config/combatEnv.ts).
    const combatEnv =
      options.combatEnv !== undefined
        ? normalizeCombatEnv(options.combatEnv)
        : await sharedCombatEnvCache().get();

    // arena rules come from the config.arena-rules@1 doc when the content
    // tree is loaded (boot); absent doc -> legacy skeleton behavior
    const arena = resolveArena(options.mapId);
    // Per-round arena ROTATION pool (task #145): the whole loaded arena set, so
    // each combat round deterministically swaps the map (less boring). `arena`
    // above is only the champ-select / first-intermission map; combat rounds
    // rotate through this pool. A bare boot with no themed arenas loaded yields
    // just the skeleton → no rotation, identical to before.
    const arenaPool = resolveArenaPool();
    // PHASE DURATIONS come from the config.match@1 doc (task #38) — the prep
    // window is content, not a constant. Resolved ONCE here and frozen for the
    // match, so a mid-match content reload cannot retime a running phase.
    //
    // Resolved into locals rather than inline because the replay header records
    // the same three tables (task #175): a recording that stored a re-resolved
    // copy could disagree with what the match actually ran on if content reloaded
    // between the two calls, and the whole point of the header is that it cannot.
    const phaseCfg = resolvePhaseConfig();
    // Round-pacing fire ring (task #132): resolved from the SAME config.match@1
    // doc as the phase durations, so `match.fireRing.startSec` is the single
    // round-length source of truth. null (absent block) leaves the ring off.
    const fireRing = resolveFireRing();
    const arenaRules = resolveArenaRules();
    // STARTING TEAM LIVES from the SAME config.match@1 doc (`startingTeamLives`).
    // Was a hardcoded `3` while the doc's authored value sat unread — the owner
    // held the match-length dial and turning it did nothing. Resolved here, once,
    // and frozen for the match like the phase durations above; it is also written
    // into the replay header below, so a recording replays on ITS reservoir, not
    // on whatever the config says at playback time.
    const startingLives = resolveStartingLives();
    this.ctl = new MatchController(
      matchId,
      seed,
      specs,
      phaseCfg,
      startingLives,
      arenaRules,
      arena,
      whitelist,
      combatEnv,
      fireRing,
      // Per-round arena rotation pool (task #145).
      arenaPool,
    );
    for (const h of humanSeats) {
      this.seatByAccount.set(h.accountId, asSeatId(h.seatId));
    }

    this.setState(new MatchState());
    this.state.matchId = matchId;
    this.state.mapId = arena.id;
    this.state.seed = seed;
    // ACTIVE multiplier snapshot -> clients (prediction parity; set once)
    this.state.combatEnvJson = JSON.stringify(combatEnv);
    // CONTENT VERSION. The schema field has existed (and been replicated) since
    // the protocol was written, and until task #175 nothing ever assigned it —
    // the wire value was the empty string on every room, while the one process
    // that knows the value logged it at boot and threw it away. It is the single
    // most important key a replay carries (content changes constantly here, and
    // a replay recorded on cv_A and played on cv_B is a different game), so it is
    // now published to clients as well as written into every recording.
    this.state.contentVersion = activeContentVersion();

    // Open the recording BEFORE the tick loop starts, so tick 0 is captured.
    // Awaiting here is free: Colyseus does not accept joins until onCreate
    // resolves, and nothing after this point is on the tick path.
    this.recorder = await MatchRecorder.open(
      matchId,
      buildHeader({
        matchId,
        seed,
        contentVersion: activeContentVersion(),
        seats: this.ctl.seats,
        specIsBot: (seatId) => specs.find((s) => s.seatId === seatId)?.isBot ?? true,
        startingLives,
        arena,
        arenaPool,
        combatEnv,
        phaseConfig: phaseCfg,
        fireRing,
        arenaRules,
        whitelist,
        env: {
          whitelistBypass: WHITELIST_BYPASS,
          combatEnvBypass: process.env.GGD_COMBAT_ENV_BYPASS === "1",
          devCheats: DEV_CHEATS,
        },
      }),
    );
    this.ctl.recorder = this.recorder;

    this.onMessage(MSG.INPUT, (client, raw: unknown) => {
      // Per-session rate limit (DoS: message-flood). A sustained flood is
      // dropped and, past the strike threshold, the session is disconnected.
      const verdict = this.rateLimiter.check(client.sessionId);
      if (verdict === "disconnect") {
        client.leave(RATE_LIMIT_CLOSE_CODE);
        return;
      }
      if (verdict === "drop") return;
      const seatId = this.seatBySession.get(client.sessionId);
      if (seatId === undefined) return;
      // Untrusted payload → coerce to a SAFE InputMessage before it can mutate
      // sim state: unknown kinds, prototype-name slots, out-of-range item slots,
      // non-finite coords and oversized command lists are dropped (injection +
      // algorithmic-complexity DoS). Never throws.
      this.humanDrivers.get(seatId)?.mailbox.push(sanitizeInputMessage(raw));
    });
    this.onMessage(MSG.SELECT_CHAMPION, (client, msg: SelectChampionMessage) => {
      if (this.rateLimiter.check(client.sessionId) !== "ok") return;
      const seatId = this.seatBySession.get(client.sessionId);
      if (seatId === undefined || !msg?.championId) return;
      const res = this.ctl.selectChampion(seatId, String(msg.championId));
      // Recorded only when it TOOK EFFECT (a rejected pick changed nothing), and
      // stamped with `world.tick` — the tick about to run, which is the tick
      // playback re-applies it just before. There is no tick on the wire and
      // there cannot be: message arrival is wall-clock, so only the server knows
      // which tick an input landed on.
      if (res.ok) this.recorder?.recordChampionSelect(this.ctl.world.tick, seatId, String(msg.championId));
      if (!res.ok) {
        // surface WHY (not-whitelisted / unknown-champion / wrong-phase) so
        // champ-select can explain the rejection instead of silently ignoring.
        client.send(MSG.REJECT, { reason: res.reason });
      }
    });
    this.onMessage(MSG.CHEAT, (client, msg: CheatMessage) => {
      // HARD GATE: dev mode only, never trusting the client. Seat is resolved
      // from the sender's OWN session, so a client can only cheat its own seat.
      if (!DEV_CHEATS) return;
      if (this.rateLimiter.check(client.sessionId) !== "ok") return;
      const seatId = this.seatBySession.get(client.sessionId);
      if (seatId === undefined || !msg?.cheat) return;
      // Cheats mutate hp/gold/levels/items/cooldowns and can swap champions or
      // force-advance a phase, so a replay that did not carry them would diverge
      // on the very next tick. Recorded even though they are dev-only.
      if (this.ctl.applyCheat(seatId, msg.cheat)) {
        this.recorder?.recordCheat(this.ctl.world.tick, seatId, msg.cheat);
      }
    });

    // fixed-tick accumulator loop
    this.setSimulationInterval((dtMs) => this.loop(dtMs), TICK_MS / 2);
  }

  private loop(dtMs: number): void {
    // Fixed-timestep pacing with a CATCH-UP CLAMP (task #46). Advancing an
    // unbounded number of ticks per frame is the classic spiral of death: once
    // the server falls behind real-time it runs ever-longer synchronous bursts
    // that pin the event loop and starve the snapshot broadcast, so the sim
    // appears to freeze while the client renders on at 60fps. planTicks bounds
    // the work and sheds surplus backlog so the loop can never wedge. Pure math,
    // so the sim stays byte-deterministic (see match/tickLoop.ts).
    const plan = planTicks(this.accumulator, dtMs, TICK_MS);
    this.accumulator = plan.accumulator;
    if (plan.dropped) {
      console.warn(
        `[match ${this.ctl.matchId}] sim fell behind real-time; shed tick backlog to avoid a loop stall`,
      );
    }
    let stepped = false;
    for (let step = 0; step < plan.steps; step++) {
      let phase: MatchPhase;
      try {
        phase = this.ctl.tick();
      } catch (err) {
        // DEFENSE IN DEPTH (task #46). MatchController.tick() now CONTAINS sim /
        // transition faults internally and advances the phase clock before any
        // fallible work, so a thrown tick should be unreachable. If tick() itself
        // ever throws we must NOT disconnect the room: killing it permanently
        // freezes the countdown for every client — the exact reported symptom
        // ("倒數時間突然停止卡住不動"). A frozen-but-live room recovers on the
        // next tick; a disconnected one never does. So log (throttled) and bail
        // out of this frame's catch-up burst; the clock already advanced inside
        // tick(), the last good snapshot is projected below, and we retry next
        // frame instead of spiralling or dying.
        this.onLoopFault(err);
        break;
      }
      stepped = true;
      // Fan out selected sim events. The whitelist lives in one place
      // (net/eventFanout) so the ReplayRoom forwards the EXACT same set — a
      // replay that dropped these would be combat-mute (HP bars drain with no
      // damage numbers, no attack/cast animations, no hit sparks).
      for (const ev of this.ctl.world.events) {
        if (isFannedOutEvent(ev)) {
          this.broadcast(MSG.EVENT, { type: ev.type, tick: ev.tick, data: ev.data });
        }
      }
      if (phase === "matchEnd") {
        void this.finishMatch();
        break;
      }
    }
    if (stepped) projectSnapshot(this.ctl, this.state, this.humanDrivers);
  }

  /**
   * Record + throttle-log a room-loop fault (task #46). tick() self-contains sim
   * and transition faults, so this fires only if tick() itself unexpectedly
   * throws; when it does we keep the room ALIVE rather than disconnecting, so the
   * countdown never freezes permanently. The first few are logged in full, then
   * only every 300th (~10s at 30Hz), so a persistent fault leaves a trail without
   * flooding the log.
   */
  private onLoopFault(err: unknown): void {
    this.loopFaults++;
    if (this.loggedLoopFaults < 5 || this.loopFaults % 300 === 0) {
      this.loggedLoopFaults++;
      console.error(
        `[match ${this.ctl.matchId}] tick() threw at the room loop in phase ${this.ctl.phase.phase} at ` +
          `tick ${this.ctl.world.tick} (loop fault #${this.loopFaults}); keeping the room alive so the ` +
          `countdown does not freeze`,
        err,
      );
    }
  }

  override onJoin(client: Client, options: Record<string, unknown>): void {
    // resolve seat: reserved by accountId (platform flow) or first bot seat (dev)
    const accountId =
      ((client.userData as Record<string, unknown> | undefined)?.accountId as string | undefined) ??
      (typeof options.accountId === "string" ? options.accountId : `dev-${client.sessionId}`);

    let seatId = this.seatByAccount.get(accountId);
    if (seatId === undefined) {
      if (SHARED_SECRET) {
        client.leave();
        return;
      }
      // dev mode: take over the first AI seat
      for (const [sid, seat] of this.ctl.seats) {
        if (seat.driverKind === "ai" && seat.sessionId === null && !this.seatByAccount.has(seat.accountId)) {
          seatId = sid;
          break;
        }
      }
      if (seatId === undefined) {
        client.leave();
        return;
      }
      this.seatByAccount.set(accountId, seatId);
    }

    const seat = this.ctl.seats.get(seatId)!;
    seat.sessionId = client.sessionId;
    seat.accountId = accountId;
    // NAME the taken-over seat (#156). The dev/LAN direct-join path claims an AI
    // seat that still carries the generic "Bot N" label stamped at construction,
    // so the human's own champion shows "Bot 0". Overwrite ONLY a generic
    // bot/player/empty label (never a real platform-assigned name), preferring
    // the client-supplied dev name and falling back to "Player N".
    if (seat.displayName === "" || /^(Bot |Player )/.test(seat.displayName)) {
      const supplied = sanitizeDisplayName(options.displayName ?? "");
      seat.displayName = supplied || `Player ${seatId}`;
    }
    this.seatBySession.set(client.sessionId, seatId);

    const driver = new HumanDriver();
    this.humanDrivers.set(seatId, driver);
    seat.setDriver(driver);
  }

  override async onLeave(client: Client, consented: boolean): Promise<void> {
    // Drop the session's rate-limit bucket so they never accumulate unbounded
    // over a long-lived room (a returning client just gets a fresh bucket).
    this.rateLimiter.forget(client.sessionId);
    const seatId = this.seatBySession.get(client.sessionId);
    if (seatId === undefined) return;
    const seat = this.ctl.seats.get(seatId)!;

    // AI takes over at the next tick boundary — the bot inherits the exact
    // entity state (hp/cooldowns/items) because drivers hold no gameplay state.
    seat.setDriver(new AIDriver());
    seat.sessionId = null;
    this.humanDrivers.delete(seatId);
    this.seatBySession.delete(client.sessionId);

    if (consented) return;
    try {
      await this.allowReconnection(client, RECONNECT_GRACE_SECS);
      // human returned: swap control back
      const driver = new HumanDriver();
      this.humanDrivers.set(seatId, driver);
      seat.setDriver(driver);
      seat.sessionId = client.sessionId;
      this.seatBySession.set(client.sessionId, seatId);
    } catch {
      // window expired — seat stays AI for the rest of the match
    }
  }

  override onDispose(): void {
    // Return the process-wide concurrent-room slot so a completed/disposed match
    // frees capacity for the next one (the room-cap DoS guard, roomRegistry).
    if (this.acquiredRoomSlot) {
      roomRegistry.release();
      this.acquiredRoomSlot = false;
    }
    // A room disposed without reaching matchEnd (everyone left, the shard is
    // shutting down) still leaves a recording — footer-less, and therefore
    // marked 未完成 in the list, but playable up to its last complete line.
    // finishMatch() has already closed the recorder on the normal path.
    const rec = this.recorder;
    this.recorder = null;
    this.ctl.recorder = null;
    void rec?.abandon();
  }

  private async finishMatch(): Promise<void> {
    if (this.resultSent || !this.ctl.result) return;
    this.resultSent = true;
    projectSnapshot(this.ctl, this.state, this.humanDrivers);

    // Seal the recording FIRST: write the footer, compress, prune. Detaching the
    // sink before the await stops any further tick from writing into a closing
    // stream, and everything here is off the tick path (the room is done).
    const rec = this.recorder;
    this.recorder = null;
    this.ctl.recorder = null;
    if (rec) {
      try {
        await rec.finish(this.ctl);
      } catch (err) {
        console.error(`[replay] failed to seal the recording for ${this.ctl.matchId}`, err);
      }
    }

    // victory settlement → clients (per-player scoreboard + grade + rank +
    // winner). Rides the MSG.EVENT channel; the client renders the settlement
    // screen + ranking table from it. Ranked ladder deltas (points/tier) are
    // fetched separately by the client's leaderboard flow.
    if (this.ctl.settlement) {
      this.broadcast(MSG.EVENT, {
        type: SETTLEMENT_EVENT,
        tick: this.ctl.world.tick,
        data: this.ctl.settlement,
      });
    }

    await this.settleToPlatform();
    // let clients read the final state, then dispose
    this.clock.setTimeout(() => this.disconnect(), 10_000);
  }

  /**
   * Post the finished match to the platform. This call is the ONLY way a match
   * reaches the platform: MMR, the leaderboard, M COIN and the 水晶
   * meta-progression grant (task #118) all happen inside it, so it settles on
   * EVERY path a match can be played on and every outcome is stated out loud.
   *
   * Tasks #6 / #25 — this used to be a silent skip on two independent counts:
   *
   *  1. It only fired for a room the platform created (`callbackUrl` set). A
   *     dev/LAN direct-join match — which is how the owner actually plays on
   *     his own box, signed in with his real account — settled nowhere, so 51
   *     recorded matches sat next to an empty ladder and 0 M COIN.
   *  2. Far worse: when it DID fire, it posted `ctl.result` raw, whose shape
   *     (`{teams:[{teamId, placement, members:[…]}]}`) shares exactly two field
   *     names with the platform's `gamelink.ResultRequest`. `placements` and
   *     `seats` decoded as nil, so the platform HMAC-verified the body, walked
   *     zero seats, credited nobody and answered 200 "ok" — then latched the
   *     match id as done, so it could never be retried. Not one match had ever
   *     settled on this machine.
   *
   * The fix is `buildPlatformResult`, which speaks the platform's contract
   * field-for-field, plus a callback URL that is DERIVED when the platform did
   * not supply one. Deriving it adds no trust: it targets the same HMAC-signed,
   * signature-verified, `SetNX`-idempotent `/api/v1/internal/matches/{id}/result`
   * the platform flow uses, so a dev/LAN match inherits exactly the
   * authentication the platform-created one has, and the platform still decides
   * who is real (unknown account ids are skipped there, as bots and couch
   * guests always were).
   */
  private async settleToPlatform(): Promise<void> {
    const result = this.ctl.result;
    if (!result) return;
    const payload = buildPlatformResult(result, this.ctl.arena.id, (seatId) =>
      this.ctl.seats.get(asSeatId(seatId))?.championId ?? "",
    );
    const matchId = this.ctl.matchId;

    // Seats that could actually earn something. A bot never can; neither can a
    // dev seat that was auto-named because nobody was signed in (`dev-…`, see
    // onJoin). If NOTHING here can earn, the post is pointless traffic that
    // would also burn this match id in the platform's idempotency latch — so it
    // is skipped DELIBERATELY, and said so, which is a different statement from
    // the silence this replaced.
    const settleable = payload.seats.filter((s) => !s.isBot && isSettleableAccountId(s.accountId));
    if (settleable.length === 0) {
      console.warn(
        `[match ${matchId}] settled NOTHING to the platform: no seat belongs to a signed-in account ` +
          `(${payload.seats.filter((s) => !s.isBot).length} human seat(s), all anonymous/dev). ` +
          "No rating, no leaderboard entry, no M COIN, no 水晶 — expected for an offline bots-only run; " +
          "sign in before playing if this match was supposed to count.",
      );
      return;
    }

    // Candidate endpoints, in order: what the platform told us to call, then
    // the URL this process resolved for the platform (config/platformUrl.ts —
    // GGD_PLATFORM_URL, else the in-cluster or localhost default). The second
    // is what makes a dev/LAN match settle at all; it is also the recovery path
    // for a deploy whose PLATFORM_INTERNAL_URL points somewhere unreachable.
    // Retrying is safe by construction: the platform's SetNX latch answers a
    // duplicate with "duplicate" instead of paying twice.
    const derived = `${PLATFORM_URL.replace(/\/$/, "")}/api/v1/internal/matches/${encodeURIComponent(matchId)}/result`;
    const targets = [...new Set([this.callbackUrl, derived].filter((u): u is string => !!u))];

    const body = JSON.stringify(payload);
    const ts = String(Math.floor(Date.now() / 1000));
    const headers = {
      "content-type": "application/json",
      "X-Internal-Timestamp": ts,
      "X-Internal-Auth": sign(SHARED_SECRET, ts, body),
    };
    const failures: string[] = [];
    for (const url of targets) {
      const how = url === this.callbackUrl ? "platform-supplied" : "derived from GGD_PLATFORM_URL";
      try {
        const res = await fetch(url, { method: "POST", headers, body });
        // fetch only rejects on TRANSPORT failure: a 401 from a rotated shared
        // secret, or the 400 the platform now returns on a contract mismatch,
        // resolves normally and used to be discarded entirely.
        if (!res.ok) {
          failures.push(`HTTP ${res.status} from ${url} (${how}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
          continue;
        }
        // The platform reports how many accounts it actually credited. Logging
        // ITS number rather than ours is the point: "settled: 0" against 2 human
        // seats is the exact failure that hid here for the whole project, and it
        // is now a line in the log instead of a 200 that means nothing.
        const ack = (await res.json().catch(() => ({}))) as { status?: string; settled?: number };
        const credited = typeof ack.settled === "number" ? ack.settled : -1;
        const line =
          `[match ${matchId}] settled to the platform (${how}): status=${ack.status ?? "?"} ` +
          `credited=${credited < 0 ? "unreported" : credited}/${settleable.length} account(s)`;
        if (credited === 0 && ack.status !== "duplicate") {
          console.error(
            `${line} — the platform accepted the result but credited NOBODY. No rating, no M COIN, no 水晶. ` +
              "Check that these account ids exist on the platform.",
          );
        } else {
          console.log(line);
        }
        return;
      } catch (err) {
        failures.push(`${url} (${how}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    console.error(
      `[match ${matchId}] RESULT CALLBACK FAILED on every endpoint — this match awarded NO rating, ` +
        `no leaderboard entry, no M COIN and no 水晶 to ${settleable.length} player(s). ` +
        `Check PLATFORM_GAME_SHARED_SECRET matches the platform's and that the platform is reachable. ` +
        `Attempts: ${failures.join(" | ")}`,
    );
  }
}
