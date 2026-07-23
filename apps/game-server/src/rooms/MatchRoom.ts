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
import { MatchController, type SeatSpec } from "../match/MatchController";
import type { MatchPhase } from "../match/PhaseMachine";
import { resolvePhaseConfig, resolveFireRing } from "../match/phaseConfig";
import { planTicks } from "../match/tickLoop";
import { resolveArenaRules } from "../match/arenaRules";
import { resolveArena, resolveArenaPool } from "../match/arenaSelect";
import { cheatsEnabled } from "../match/cheatGate";
import { HumanDriver } from "../seat/HumanDriver";
import { AIDriver } from "../ai/Tier0Brain";
import { projectSnapshot } from "../net/snapshot";
import { sign, verifyTicket } from "../auth/hmac";
import { Whitelist, WHITELIST_BYPASS, sharedWhitelistCache } from "../curation/whitelist";
import { sharedCombatEnvCache } from "../config/combatEnv";
import { sanitizeInputMessage } from "../net/validateInput";
import { MessageRateLimiter } from "../net/messageRateLimiter";
import { sanitizeDisplayName } from "../net/sanitizeText";
import { roomRegistry } from "./roomRegistry";
import { verifyCreateToken } from "./createGate";

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
    // PROCESS-WIDE CONCURRENT-ROOM CAP (DoS). Refuse — before allocating the sim
    // — once the shard is already running the maximum number of ticking matches.
    if (!roomRegistry.tryAcquire()) {
      throw new Error("game-server at capacity: max concurrent matches reached");
    }
    this.acquiredRoomSlot = true;
    // Per-room client cap (join-flood) + autoDispose (no zombie rooms). A match
    // never has more than SEAT_COUNT human clients, so cap the room there.
    this.maxClients = SEAT_COUNT;
    this.autoDispose = true;

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
    this.ctl = new MatchController(
      matchId,
      seed,
      specs,
      resolvePhaseConfig(),
      3,
      resolveArenaRules(),
      arena,
      whitelist,
      combatEnv,
      // Round-pacing fire ring (task #132): resolved from the SAME config.match@1
      // doc as the phase durations, so `match.fireRing.startSec` is the single
      // round-length source of truth. null (absent block) leaves the ring off.
      resolveFireRing(),
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
      this.ctl.applyCheat(seatId, msg.cheat);
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
      // fan out selected sim events
      for (const ev of this.ctl.world.events) {
        if (
          ev.type === "abilityCast" ||
          ev.type === "damage" ||
          ev.type === "death" ||
          ev.type === "projectileSpawn" ||
          ev.type === "projectileHit" ||
          // a missile that expired without hitting anything → client fizzle,
          // so a ranged auto that whiffs still resolves visually
          ev.type === "projectileEnd" ||
          ev.type === "levelUp" ||
          ev.type === "castBegin" ||
          ev.type === "castEnd" ||
          ev.type === "castInterrupt" ||
          ev.type === "attackWindup" ||
          ev.type === "basicAttack" ||
          ev.type === "basicAttackHit" ||
          ev.type === "hitImpact" ||
          ev.type === "knockdown" ||
          ev.type === "whiff" ||
          ev.type === "guardBreak" ||
          ev.type === "flowerSpawn" ||
          ev.type === "flowerBurst" ||
          // FLOATING COMBAT TEXT (task #92): the request names four categories
          // — 造成傷害 / 受到傷害 / 補血 / 補魔 — and the first two already ride
          // `damage`. These two are the other half; without them the client
          // cannot draw 補血/補魔 at all. Emitted only for DISCRETE restores
          // (ability heals, `restore` percentages, lifesteal, flower bursts);
          // per-tick passive regen is deliberately never emitted (see
          // sim/combat/restore.ts), so this adds no steady-state traffic.
          ev.type === "heal" ||
          ev.type === "manaRestore" ||
          // revive circles (task #84): spawn/end drive the world VFX + the
          // spectating owner's HUD banner. Progress itself rides the snapshot,
          // not events — a per-tick event would be pure spam.
          ev.type === "reviveCircleSpawn" ||
          ev.type === "reviveCircleEnd" ||
          ev.type === "reviveComplete" ||
          ev.type === "vfxSpawn" ||
          // SHOP FEEDBACK (task #38/#60): the purchase/sale confirmations and —
          // the point of the change — every REJECTION, so the client can say
          // 金幣不足 / 背包已滿 / 已擁有 / 戰鬥中無法使用商店 instead of leaving
          // a dead button. The client filters these to its own entity; they ride
          // the same broadcast channel as damage/death, which already carry far
          // more about other players than a failed purchase does.
          ev.type === "itemBought" ||
          ev.type === "itemSold" ||
          ev.type === "buyRejected" ||
          ev.type === "sellRejected" ||
          // buy/sell UNDO (task #121): the confirmation drives the client's
          // inventory/gold refresh + undo-button state; the rejection lets the
          // HUD say why (nothing to undo / shop closed) instead of a dead button.
          ev.type === "shopUndone" ||
          ev.type === "undoRejected"
        ) {
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
  }

  private async finishMatch(): Promise<void> {
    if (this.resultSent || !this.ctl.result) return;
    this.resultSent = true;
    projectSnapshot(this.ctl, this.state, this.humanDrivers);

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

    if (this.callbackUrl && SHARED_SECRET) {
      const body = JSON.stringify(this.ctl.result);
      const ts = String(Math.floor(Date.now() / 1000));
      try {
        await fetch(this.callbackUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-Internal-Timestamp": ts,
            "X-Internal-Auth": sign(SHARED_SECRET, ts, body),
          },
          body,
        });
      } catch (err) {
        console.error("result callback failed", err);
      }
    }
    // let clients read the final state, then dispose
    this.clock.setTimeout(() => this.disconnect(), 10_000);
  }
}
