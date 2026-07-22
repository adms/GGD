/**
 * MatchRoom — thin Colyseus wrapper around MatchController.
 * Network in: INPUT -> seat mailbox; SELECT_CHAMPION -> controller.
 * Network out: schema patches (projectSnapshot) + sim event fanout.
 * Disconnect: swap seat driver to AI immediately; allowReconnection window
 * hands control back on return. Match end: HMAC result callback to platform.
 */
import { Room, type Client } from "colyseus";
import { MatchState } from "@ggd/shared/protocol/schema";
import { MSG, SETTLEMENT_EVENT, type InputMessage, type SelectChampionMessage, type CheatMessage } from "@ggd/shared/protocol/messages";
import { TICK_MS, SEAT_COUNT, TEAM_SIZE } from "@ggd/shared/constants";
import { asSeatId, type SeatId } from "@ggd/shared/ids";
import { normalizeCombatEnv, type CombatEnvKey } from "@ggd/shared/sim/combatEnv";
import { MatchController, type SeatSpec } from "../match/MatchController";
import { resolvePhaseConfig } from "../match/phaseConfig";
import { resolveArenaRules } from "../match/arenaRules";
import { resolveArena } from "../match/arenaSelect";
import { cheatsEnabled } from "../match/cheatGate";
import { HumanDriver } from "../seat/HumanDriver";
import { AIDriver } from "../ai/Tier0Brain";
import { projectSnapshot } from "../net/snapshot";
import { sign, verifyTicket } from "../auth/hmac";
import { Whitelist, WHITELIST_BYPASS, sharedWhitelistCache } from "../curation/whitelist";
import { sharedCombatEnvCache } from "../config/combatEnv";

export interface MatchRoomOptions {
  matchId?: string;
  seed?: number;
  /** selected arena id (Arenas registry key); unknown/absent → skeleton */
  mapId?: string;
  /** human seats reserved by the platform; bots fill the rest */
  seats?: { seatId: number; teamId: number; accountId: string; displayName: string; championId?: string }[];
  callbackUrl?: string;
  /** dev convenience: create a fully-botted match on direct join */
  devSoloJoin?: boolean;
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

export class MatchRoom extends Room<MatchState> {
  private ctl!: MatchController;
  private accumulator = 0;
  private humanDrivers = new Map<number, HumanDriver>();
  private seatByAccount = new Map<string, SeatId>();
  private seatBySession = new Map<string, SeatId>();
  private callbackUrl: string | undefined;
  private resultSent = false;

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
      specs.push({ ...h, isBot: false });
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

    this.onMessage(MSG.INPUT, (client, msg: InputMessage) => {
      const seatId = this.seatBySession.get(client.sessionId);
      if (seatId === undefined) return;
      this.humanDrivers.get(seatId)?.mailbox.push(msg ?? { seq: 0 });
    });
    this.onMessage(MSG.SELECT_CHAMPION, (client, msg: SelectChampionMessage) => {
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
      const seatId = this.seatBySession.get(client.sessionId);
      if (seatId === undefined || !msg?.cheat) return;
      this.ctl.applyCheat(seatId, msg.cheat);
    });

    // fixed-tick accumulator loop
    this.setSimulationInterval((dtMs) => this.loop(dtMs), TICK_MS / 2);
  }

  private loop(dtMs: number): void {
    this.accumulator += dtMs;
    let stepped = false;
    while (this.accumulator >= TICK_MS) {
      this.accumulator -= TICK_MS;
      const phase = this.ctl.tick();
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
          ev.type === "sellRejected"
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
    this.seatBySession.set(client.sessionId, seatId);

    const driver = new HumanDriver();
    this.humanDrivers.set(seatId, driver);
    seat.setDriver(driver);
  }

  override async onLeave(client: Client, consented: boolean): Promise<void> {
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
