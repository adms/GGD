/**
 * MatchRoom — thin Colyseus wrapper around MatchController.
 * Network in: INPUT -> seat mailbox; SELECT_CHAMPION -> controller.
 * Network out: schema patches (projectSnapshot) + sim event fanout.
 * Disconnect: swap seat driver to AI immediately; allowReconnection window
 * hands control back on return. Match end: HMAC result callback to platform.
 */
import { Room, type Client } from "colyseus";
import { MatchState } from "@ggd/shared/protocol/schema";
import {
  MSG,
  SETTLEMENT_EVENT,
  TEAM_SETTLEMENT_EVENT,
  type SelectChampionMessage,
  type CheatMessage,
} from "@ggd/shared/protocol/messages";
import { TICK_MS, SEAT_COUNT, TEAM_SIZE } from "@ggd/shared/constants";
import { asSeatId, type SeatId } from "@ggd/shared/ids";
import { normalizeCombatEnv, type CombatEnvKey } from "@ggd/shared/sim/combatEnv";
import { MatchController, type MatchResult, type SeatSpec } from "../match/MatchController";
import type { MatchPhase } from "../match/PhaseMachine";
import {
  resolvePhaseConfig,
  resolveFireRing,
  resolveStartingLives,
  resolveMaxRounds,
} from "../match/phaseConfig";
import { sanitizeRoomSettings, minCombatMaxSecFor } from "@ggd/shared/roomSettings";
import { planTicks } from "../match/tickLoop";
import { tickHealth, formatShedLog } from "../match/tickHealth";
import { resolveArenaRules } from "../match/arenaRules";
import { resolveArena, resolveArenaPool } from "../match/arenaSelect";
import { isFannedOutEvent, privateEventAddress, PRIVATE_EVENT_FANOUT } from "../net/eventFanout";
import type { PrivateEventAddress } from "../net/eventFanout";
import { EventBatcher, resolveEventBatch } from "../net/eventBatch";
import { cheatsEnabled } from "../match/cheatGate";
// 練習模式 (GH#343) —— 「這間房是不是練習房 + 規則是什麼」只有這一支答案。
import { Configs, PRACTICE_DOC_ID, resolvePracticeRules } from "@ggd/shared/content";
import { HumanDriver } from "../seat/HumanDriver";
import type { Seat } from "../seat/Seat";
import type { SimEvent } from "@ggd/shared/sim/SimWorld";
import { AIDriver } from "../ai/Tier0Brain";
import { projectSnapshot } from "../net/snapshot";
import { sign, verifyTicket } from "../auth/hmac";
import { Whitelist, WHITELIST_BYPASS, sharedWhitelistCache } from "../curation/whitelist";
import { Ownership } from "../curation/ownership";
import { sharedCombatEnvCache } from "../config/combatEnv";
import { sharedBaseBonusCache } from "../config/baseBonus";
import { normalizeBaseBonus, type BaseBonusTable } from "@ggd/shared/sim/baseBonus";
import { resolveServerOps, type ServerOps } from "../config/serverOps";
import { PLATFORM_URL } from "../config/platformUrl";
import { sanitizeInputMessage } from "../net/validateInput";
import { MessageRateLimiter } from "../net/messageRateLimiter";
import { sanitizeDisplayName } from "../net/sanitizeText";
import { roomRegistry } from "./roomRegistry";
import { verifyCreateToken } from "./createGate";
import { MatchRecorder, reportRecorderSealFailure } from "../replay/Recorder";
import { replayRecordingEnabled } from "../replay/policy";
import { buildHeader } from "../replay/headerCodec";
import { buildStamp } from "../replay/fingerprint";
import { activeContentVersion } from "../replay/Player";
import { MatchStatsRecorder } from "../analytics/Recorder";

export interface MatchRoomOptions {
  matchId?: string;
  seed?: number;
  /** selected arena id (Arenas registry key); unknown/absent → skeleton */
  mapId?: string;
  /** human seats reserved by the platform; bots fill the rest. `owned` is the
   * account's playable champion set (task #201) — free roster ∪ unlocked — from
   * the signed match-create body; absent leaves that seat's ownership
   * unenforced (fail-open, e.g. dev/LAN joins). */
  seats?: {
    seatId: number;
    teamId: number;
    accountId: string;
    displayName: string;
    championId?: string;
    owned?: string[];
  }[];
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
   * 基礎加成 override (tests / dev callers). Absent = resolve from the platform
   * overlay through `sharedBaseBonusCache()` — see config/baseBonus.ts (#278).
   */
  baseBonus?: BaseBonusTable;
  /**
   * PER-ROOM roguelite-mob toggle (#215). Flows client → Go room → gamelink →
   * this bag. `undefined` (any room created before the toggle, and the whole
   * solo/bot default path) means ON — it is merged onto the resolved arenaRules
   * in onCreate as `rogueliteMobs: options.rogueliteMobs !== false`, so only an
   * explicit `false` disarms the mobs. Recorded into the replay header with the
   * rest of ArenaRules, so a tape replays with the value it was played on.
   */
  rogueliteMobs?: boolean;
  /**
   * 練習模式 (GH#343, owner 2026-08-17「新增練習模式…進入不會有對戰…可以使用各種
   * 功能測試碼…以及即時生成殭屍」)。走的路和 `rogueliteMobs` 逐字相同：
   * client → Go room → gamelink → 這個袋子。
   *
   * ⚠️ **這個旗標就是測試碼的鑰匙**（見 `cheatGate.ts`），所以它的可信度來自
   * `createToken`：有 shared secret 時（正式站）`onCreate` 第一件事就是驗簽，
   * 沒過就中止，於是這一格只可能由平台寫入。沒有 secret 時（dev）任何客戶端都能
   * 建房，但 dev 本來就是測試碼全開的環境，所以沒有新的破口。
   *
   * ⛔ 它**不是** CheatMessage 上的旗標：那條路等於讓要被擋的一方自己說自己該放行。
   */
  practice?: boolean;
  /**
   * PER-ROOM 開房設定 (#288, owner 2026-08-08:「開房房主可以設定 選角、商店、
   * 每回合的時間跟總回合數，但**預設值保留現在**（包含 vs bot）」).
   * 走的路和 `rogueliteMobs` 逐字相同：client → Go room → gamelink → 這個袋子。
   *
   * ⚠️ 型別寫 `number` 但**不可以相信它** —— 這個袋子是從 HTTP body 直接展開的，
   * 裡面可能是字串、`null`、`NaN`、或超出上下界的數字。權威的檢查在
   * `onCreate` 的 `sanitizeRoomSettings()`（見 `@ggd/shared/roomSettings` 的檔頭：
   * Go 那一層故意不驗，界限只能有一份，而 Go 沒辦法 import 那張表）。
   *
   * ⚠️ 每一格 `undefined` 的語意是**缺席 ≠ 重設**：退回
   * `content/config/config.match.json` 的出貨值，**包含 vs bot 的 320 秒選角**。
   */
  champSelectSec?: number;
  intermissionSec?: number;
  combatMaxSec?: number;
  /** 總回合數上限。0 = 不設限 = 今天的行為（打到決賽才結束）。 */
  maxRounds?: number;
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
/**
 * ⚠️ `DEV_CHEATS` 是**製程級**的答案，而 GH#343 之後這個問題變成**每間房**的：
 * 一間練習房在正式站上也要開測試碼。所以那個常數只剩「這間房不是練習房時的答案」，
 * 真正被訊息處理器讀的是 `this.cheatsAllowed`（`onCreate` 用房間自己的身分算的）。
 */
/** WS close code used when a session is booted for sustained message flooding. */
const RATE_LIMIT_CLOSE_CODE = 4290;

export class MatchRoom extends Room<MatchState> {
  private ctl!: MatchController;
  /**
   * 這間房准不准測試碼（GH#343）。`onCreate` 用**伺服器端解析出來的**練習房身分
   * 算一次就凍結；⛔ 訊息處理器不再讀製程級的 `DEV_CHEATS`。
   */
  private cheatsAllowed = DEV_CHEATS;
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
   * Per-room copy of the private-delivery decision (net/eventFanout). A field
   * rather than a direct read of the module const so the behaviour guard can
   * flip it on a live room and prove the rollback path still broadcasts — a
   * `process.env` read at import time cannot be exercised from a test at all.
   */
  private privateFanout = PRIVATE_EVENT_FANOUT;
  /**
   * PER-TICK EVENT BATCHING (net/eventBatch). Room-wide sim events accumulate
   * here through the fanout loop and leave as ONE `MSG.EVENT_BATCH` at the end
   * of the tick — measured 98 → 12 WebSocket frames per tick at the shipped mob
   * cap, 354 → 12 at 600 zombies/zone. Settings are resolved PER ROOM (not read
   * once at import) so a guard can build a room with batching off and prove the
   * rollback path still produces the old one-message-per-event wire.
   */
  private readonly batcher = new EventBatcher(resolveEventBatch(), {
    one: (payload) => this.broadcast(MSG.EVENT, payload),
    batch: (payload) => this.broadcast(MSG.EVENT_BATCH, payload),
  });
  /**
   * MATCH RECORDER (task #175) — every match is recorded by default, because the
   * replay IS the playtest feedback channel and a match nobody thought to record
   * is a match the owner cannot be told about. null when recording could not be
   * opened; a broken recording never breaks a game.
   */
  private recorder: MatchRecorder | null = null;
  /** #207 對戰統計的寫檔端;null = 這一場不記(功能關掉 / 開檔失敗)。 */
  private statsRecorder: MatchStatsRecorder | null = null;

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
    // Colyseus defaults a seat reservation to 15 SECONDS, and that default
    // silently broke every remote match on ggd.adms.ai. The sequence is:
    // platform reserves the seat → pushes it over the lobby WS → and only THEN
    // does the client download a 2.8 MB entry chunk, the content tree and the
    // champion models before it opens the game socket. On the owner's machine
    // that is instant, so it always passed in dev. On a real connection it
    // routinely exceeds 15 s, and the seat is gone by the time the client
    // arrives: "could not join the match: seat reservation expired", every
    // time, while the match itself sits there perfectly healthy.
    //
    // A one-click bot match is the worst case — nothing else has to load first,
    // so the entire asset download lands inside the reservation window.
    //
    // 120 s is measured against what has to happen in that window (a cold cache
    // pulling the full asset set over a slow link), not picked as a round
    // number. Being generous costs little: an unclaimed seat holds one slot in
    // a room the reaper disposes anyway, and the seat token is signed and
    // single-use, so a longer window widens no authorization hole.
    this.setSeatReservationTime(120);
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

    // 基礎加成 (task #278): resolved AT MATCH CREATION through the same TTL-cache
    // shape, so the admin page's 「下一場生效」 is finally true. It used to be read
    // from the boot-time `Configs` registry inside MatchController, which meant an
    // operator edit needed a game-server RESTART. Frozen for the match and written
    // into the replay header below, exactly like `combatEnv`.
    const baseBonus =
      options.baseBonus !== undefined
        ? normalizeBaseBonus(options.baseBonus)
        : await sharedBaseBonusCache().get();

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
    // owner 2026-08-03:「vs bot 一鍵開打的時候，選角色時間可以延長+300秒」。
    //
    // ⚠️ 判準是**人類座位數 <= 1**,不是「有沒有 bot」。上面那個迴圈把每一個沒人
    // 坐的座位都填成 `isBot: true`,所以「有 bot」在**每一場**都成立 —— 用它判
    // 會讓三個朋友一起打的那種局也吃到 320 秒的選角。
    const hasHumanOpponent = humanSeats.length > 1;
    // Round-pacing fire ring (task #132): resolved from the SAME config.match@1
    // doc as the phase durations, so `match.fireRing.startSec` is the single
    // round-length source of truth. null (absent block) leaves the ring off.
    //
    // ⚠️ 這一行搬到 `resolvePhaseConfig` 上面了（#288）：房主的「每回合時間」下界
    // 是**從火圈推導**的，所以要先有圈才能洗設定，洗完才能算相位。
    const fireRing = resolveFireRing();
    // ── 開房設定 (#288) —— 這裡是**權威**的那一道 ───────────────────────────
    // Go 那一層故意只做透明轉送（見 @ggd/shared/roomSettings 檔頭），所以送到這裡
    // 的東西完全沒有被驗過。下界用 `minCombatMaxSecFor` 從**出貨火圈**推導，不是
    // 寫死一個數字：`config@1` 有一條「火圈整個收完 <= combatMaxSec」的跨欄位
    // 不變式，而那條 refine 只在載入內容時跑，完全攔不到房間設定。
    const roomSettings = sanitizeRoomSettings(options, minCombatMaxSecFor(fireRing ?? undefined));
    // 語意②：越界就拒絕，而且**必須有人知道它被拒了**。表單擋在前面是第一道，
    // 但偽造的 body / 舊版 client / Go 那層改了欄位名都會繞過它，所以這裡指名
    // 欄位、原值與界限記一行。⛔ 吞掉 `rejected` 就是這一批的新缺陷。
    for (const r of roomSettings.rejected) {
      console.warn(
        `[room-settings] ${matchId}: 房主的 ${r.key}=${JSON.stringify(r.received)} 被拒絕` +
          `（${r.reason}，允許 ${r.min}–${r.max}）—— 這一格改用出貨值。`,
      );
    }
    const phaseCfg = resolvePhaseConfig(hasHumanOpponent, roomSettings.settings);
    // Merge the PER-ROOM roguelite-mob toggle (#215) onto the resolved rules
    // BEFORE the one object is handed to both the live MatchController and
    // buildHeader below — so the live sim and the recording can never disagree.
    // `!== false` keeps absent/undefined === ON (default-ON owner directive).
    //
    // 總回合數上限 (#288) 走同一行、同一個理由：它必須進 replay header，否則一場
    // 3 回合的比賽會被重播成 10 回合。房主沒設 → `resolveMaxRounds()` 退回
    // `config.match@1` 的出貨值（0 = 不設限 = 今天的行為）。
    const arenaRules = {
      ...resolveArenaRules(),
      rogueliteMobs: options.rogueliteMobs !== false,
      maxRounds: resolveMaxRounds(roomSettings.settings.maxRounds),
    };
    // STARTING TEAM LIVES from the SAME config.match@1 doc (`startingTeamLives`).
    // Was a hardcoded `3` while the doc's authored value sat unread — the owner
    // held the match-length dial and turning it did nothing. Resolved here, once,
    // and frozen for the match like the phase durations above; it is also written
    // into the replay header below, so a recording replays on ITS reservoir, not
    // on whatever the config says at playback time.
    const startingLives = resolveStartingLives();
    // Per-account ownership snapshot (task #201): rebuilt from the signed
    // match-create body's per-seat `owned` sets. Only human seats the platform
    // told us about are enforced; bots and dev/LAN seats carry no `owned` and
    // stay unenforced (fail-open — see curation/ownership.ts). The client filters
    // its roster to the same set, but THIS is the authoritative gate: a forged
    // SELECT_CHAMPION for an unowned champion is rejected by MatchController.
    const ownership = Ownership.fromSeats(humanSeats);
    // 練習模式 (GH#343) —— **一支**函式回答「這是不是練習房 + 規則是什麼」，
    // 所以房間與控制器不可能對這件事有兩種看法。`null` = 一般比賽 = 今天的行為。
    //
    // ⚠️ 這一行也是測試碼閘的來源。它讀的是 `options.practice`，而在有 shared
    // secret 的部署上 `options` 已經被 `verifyCreateToken` 擋在門外（onCreate 的
    // 第一件事），所以正式站上這一格只可能由平台寫入。
    const practice = resolvePracticeRules(options.practice === true, Configs.tryGet(PRACTICE_DOC_ID));
    this.cheatsAllowed = cheatsEnabled(SHARED_SECRET, process.env.GGD_DEV_CHEATS, practice !== null);
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
      ownership,
      baseBonus,
      // 屬性上限 (#286) 不在這裡傳 —— MatchController 的建構子預設已經是
      // `statCapsFromDoc(Configs.tryGet("stat-caps"))`,而那個模組有 Configs。
      // 在這裡重寫一次只會讓 MatchRoom 多一個它已經不需要的 Configs 相依
      // (#278 把 baseBonus 改成快取之後就把那個 import 拿掉了)。
      //
      // ⚠️ 已知且刻意:stat-caps 還沒有自己的 TTL 快取,所以它仍是 boot-time 的
      // —— 後台改了要重啟 shard。#278 對 baseBonus 修掉的正是這件事,這一份還沒
      // 修,已記進驗收表,不要以為它和隔壁一樣是即時的。
    );
    // 練習模式 (GH#343)：在**第一個 tick 之前**交給控制器（同 `recorder` /
    // `statsSink` 那條路，見 `MatchController.practice` 的說明）。
    this.ctl.practice = practice;
    for (const h of humanSeats) {
      this.seatByAccount.set(h.accountId, asSeatId(h.seatId));
    }

    this.setState(new MatchState());
    this.state.matchId = matchId;
    this.state.mapId = arena.id;
    this.state.seed = seed;
    // ACTIVE multiplier snapshot -> clients (prediction parity; set once)
    this.state.combatEnvJson = JSON.stringify(combatEnv);
    // 基礎加成 —— the controller resolved it from content (config.base-bonus@1);
    // publishing the SAME object is what keeps the champ-profile / shop preview
    // from disagreeing with the health bar. Never re-read the doc here: two
    // readers is how the two numbers drift apart.
    this.state.baseBonusJson = JSON.stringify(this.ctl.world.baseBonus);
    // 屬性上限 (GH#286) —— 同上,同一份物件。面板要顯示「攻速天花板」時必須用
    // 這一份,否則後台調過的一般上限只有伺服器知道。
    this.state.statCapsJson = JSON.stringify(this.ctl.world.statCaps);
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
    //
    // 錄影開關 (config.replay@1, owner 2026-08-02「請幫我預設打開」). 在這之前
    // 這一行是**無條件**的 —— 沒有開關，所以也沒有辦法在不重新 build 映像的情況
    // 下關掉它。出貨值是 true，而且缺文件／壞文件也回 true（fail-open，理由寫在
    // shared/content/replayPolicy.ts 的檔頭：內容載入失敗不可以順手把錄影關掉）。
    this.recorder = !replayRecordingEnabled()
      ? null
      : await MatchRecorder.open(
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
            baseBonus,
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

    // #207 對戰事件記錄。和回放**分開的一份檔**,理由寫在 analytics/format.ts
    // 檔頭:回放記的是輸入(它刻意不記結果),而這個專案量到的現況是 95 個回放
    // 檔裡只有 7 筆 championId、全部是小怪 —— 所有平衡決策都是憑感覺。
    // 同樣在 tick loop 開始前開好,所以第 1 回合的結算就寫得到。
    this.statsRecorder = await MatchStatsRecorder.open(matchId, {
      matchId,
      startedAt: new Date().toISOString(),
      seed,
      contentVersion: activeContentVersion(),
      buildStamp: buildStamp(),
      arenaId: arena.id,
      seats: [...this.ctl.seats.values()].map((s) => ({
        seatId: s.seatId,
        teamId: s.teamId,
        accountId: s.accountId,
        displayName: s.displayName,
        isBot: specs.find((sp) => sp.seatId === s.seatId)?.isBot ?? true,
      })),
    });
    this.ctl.statsSink = this.statsRecorder;

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
      // HARD GATE: dev mode **or a practice room** (GH#343), never trusting the
      // client. `cheatsAllowed` was resolved server-side in onCreate — the client's
      // message carries no flag that could open this. Seat is resolved from the
      // sender's OWN session, so a client can only cheat its own seat.
      if (!this.cheatsAllowed) return;
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
      // task #272: the shed used to produce ONE unthrottled console.warn and
      // nothing else — no counter, no endpoint — so a shard shedding ticks
      // every minute was indistinguishable from a healthy one. The counter
      // records EVERY event; noteShed owns the throttle (first 5, then every
      // 300th) so the log cannot flood at up to 60 lines/s again.
      const loud = tickHealth.noteShed(this.ctl.matchId, plan.droppedTicks, Date.now(), TICK_MS);
      if (loud) console.warn(formatShedLog(this.ctl.matchId, plan.droppedTicks, tickHealth.snapshot()));
    }
    let stepped = false;
    for (let step = 0; step < plan.steps; step++) {
      let phase: MatchPhase;
      // Per-tick cost, the signal that catches "every tick is a little over
      // budget but never reaches the clamp" — the shape sheds alone can never
      // see. Two clock reads, no allocation (see match/tickHealth.ts).
      const tickStartedMs = performance.now();
      try {
        phase = this.ctl.tick();
        tickHealth.noteTick(performance.now() - tickStartedMs);
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
          this.deliverSimEvent(ev);
        }
      }
      // END OF THE TICK THAT FILLED IT. Batching only ever coalesces events the
      // same 33.3 ms slice was going to send anyway (net/eventBatch header) —
      // owner: 「不要跨 tick 合批」. This line is what makes that true; drop it
      // and a tick's events would leak into the NEXT tick's batch.
      this.batcher.flush();
      // #193: a team just went out while the match keeps running → hand its
      // players their evaluation snapshot now, so a leave from the spectator
      // seat can pass through the settlement screen instead of dropping straight
      // to the lobby. The final matchEnd settlement below still fires for the
      // deciding team; these cover only the earlier, mid-match eliminations.
      for (const es of this.ctl.takeEliminationSettlements()) {
        this.broadcast(MSG.EVENT, {
          type: TEAM_SETTLEMENT_EVENT,
          tick: this.ctl.world.tick,
          data: es.settlement as unknown as Record<string, unknown>,
        });
      }
      if (phase === "matchEnd") {
        void this.finishMatch();
        break;
      }
    }
    if (stepped) projectSnapshot(this.ctl, this.state, this.humanDrivers);
  }

  /**
   * ONE fanned-out sim event → the sockets that are supposed to read it.
   *
   * Most events are room-wide and go out on `broadcast`, exactly as before. The
   * handful listed in `PRIVATE_EVENT_RULES` are ANSWERS TO A BUTTON PRESS
   * (「冷卻中」/「金幣不足」/「背包已滿」) — the client has always discarded
   * everybody else's copy, so those go to the one client they name.
   *
   * THREE OUTCOMES, and the difference between the last two is the whole point:
   *   • not private, or private with NO recipient in its payload → broadcast.
   *     A renamed field must degrade to today's behaviour, never to silence:
   *     an event that quietly stops arriving is the S2 failure this wire has
   *     already suffered nine times (see net/eventFanout.ts's header).
   *   • private, and the id names a seat we know → that client only. A seat with
   *     no live session (a BOT, or a human inside the reconnect window) means
   *     the answer has nobody to reach, so nothing is sent at all. MEASURED, so
   *     nobody oversells it: an all-bot 6,000-tick match emits 31–70 private
   *     events (0.6–1.1% of everything fanned out) — this is a correctness fix,
   *     not a throughput one.
   *   • private, but the id matches NO seat (a summon, a mob, a stale id) →
   *     broadcast. Unrecognised is not the same as unaddressed, so it falls back
   *     rather than guessing.
   *
   * Room-wide events go through `this.batcher`, which coalesces them into one
   * `MSG.EVENT_BATCH` per tick (net/eventBatch — measured: 98 → 12 frames/tick
   * at the shipped mob cap). A single-recipient send FLUSHES the pending batch
   * first, so the addressed player still observes the same relative order it
   * would have seen one-message-per-event: `castBegin` (room-wide) really does
   * arrive before its own `castRejected`.
   */
  private deliverSimEvent(ev: SimEvent): void {
    const payload = { type: ev.type, tick: ev.tick, data: ev.data };
    const addr = this.privateFanout ? privateEventAddress(ev) : null;
    if (addr === null) {
      this.batcher.push(payload);
      return;
    }
    // ORDER BEFORE FRAMES, on BOTH remaining branches: everything queued so far
    // was emitted BEFORE this event, so it has to leave first. Doing it here
    // (rather than inside each branch) also keeps the fail-open case a true
    // fallback — an unrecognised recipient is broadcast IMMEDIATELY, exactly as
    // it was before batching existed, instead of waiting for the tick's flush.
    // Private-typed events are 0.6–1.1% of the stream, so the split costs
    // nothing measurable.
    this.batcher.flush();
    const seat = this.seatForAddress(addr);
    if (seat === undefined) {
      this.broadcast(MSG.EVENT, payload); // unrecognised recipient → fail open
      return;
    }
    if (seat.sessionId === null) return; // bot / disconnected: nobody to tell
    this.clients.getById(seat.sessionId)?.send(MSG.EVENT, payload);
  }

  /** The seat a private event names, or undefined when no seat owns that id. */
  private seatForAddress(addr: PrivateEventAddress): Seat | undefined {
    if (addr.kind === "seat") return this.ctl.seats.get(asSeatId(addr.id));
    for (const seat of this.ctl.seats.values()) {
      if (seat.entityId === addr.id) return seat;
    }
    return undefined;
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

  /**
   * ⚠️ 回傳 `Promise` 是**這個方法唯一重要的細節**（owner 2026-08-02「就算玩到
   * 一半就離開也應該有 replay 才對」）。
   *
   * Colyseus 的 `gracefullyShutdown()` 會 `await` 每一間房的 `onDispose()`。
   * 在此之前這裡是 `onDispose(): void` + `void rec?.abandon()` —— 也就是說
   * 「把最後一段緩衝交出去、等串流關好」這件事被**射後不理**，而 Colyseus 拿到
   * 的是一個立刻 resolve 的 `undefined`，於是 SIGTERM（`docker compose restart`、
   * 部署、OOM 重排）之後程序可以在最後那一次 flush 落地之前就結束。
   *
   * 代價是關房多等幾毫秒（一次 `write` + `end`），換到的是「打到一半被重啟」
   * 那一場的最後一段輸入真的在磁碟上。
   */
  override async onDispose(): Promise<void> {
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
    // #207:同樣的道理 —— 一場打到第 6 回合斷線的比賽,那 6 個回合已經寫在
    // 磁碟上而且完整可讀。沒有 final 行就是「這場沒打完」的判斷依據。
    const stats = this.statsRecorder;
    this.statsRecorder = null;
    this.ctl.statsSink = null;
    // 兩份一起等,而且**一個失敗不可以害另一個沒落地** —— `allSettled`,不是 `all`。
    // 房間關閉是 best-effort 的收尾，丟例外只會讓 Colyseus 的關機流程停在半路。
    const results = await Promise.allSettled([rec?.abandon(), stats?.abandon()]);
    for (const r of results) {
      if (r.status === "rejected") console.error("[match] 收尾時落地失敗（比賽已結束，不影響玩家）", r.reason);
    }
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
        // GH#170: counted, not just logged. A seal that throws means the match
        // produced no playable tape, and this was the one failure site outside
        // Recorder.ts — so it was also the one that would have stayed invisible
        // on /healthz after everything else was wired up.
        reportRecorderSealFailure(rec.id, err);
      }
    }

    // #207 統計檔也在這裡封口 —— 在 `settleToPlatform()` 之前。平台回呼會走
    // 網路,它慢下來(或完全打不通,這在 dev 是常態)不該讓一份已經完整的統計
    // 停在半空中等著。`ctl.settlement` 是上面 `maybeFinish` 建好的,所以團隊
    // 積分這時候已經在帳本裡了。
    const stats = this.statsRecorder;
    this.statsRecorder = null;
    this.ctl.statsSink = null;
    if (stats) {
      try {
        await stats.finish(this.ctl);
      } catch (err) {
        console.error(`[match-stats] failed to seal the record for ${this.ctl.matchId}`, err);
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
    // ⛔ 練習房什麼都不結算（GH#343 的裁決：不發水晶、不動 MMR、不寫任何玩家資料）。
    // 這一行是「開放測試碼不是經濟漏洞」那個論證**唯一**的支點：測試碼的另一頭
    // 如果接得到平台，那它就不是沙盒了。
    //
    // ⚠️ 出貨預設 (`endlessCombat`) 讓練習房根本走不到結算，所以這是**第二道**閘。
    // 刻意留著：`endlessCombat` 是一格後台開關，而「練習不能換水晶」不是。
    if (this.ctl.practice) {
      console.warn(
        `[match ${this.ctl.matchId}] 練習房：⛔ 不回報結果（不發水晶、不動 MMR、不寫玩家資料）。`,
      );
      return;
    }
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
