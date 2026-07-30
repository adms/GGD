/**
 * MULTI-PROCESS SHARDING — how one machine's cores actually get used.
 *
 * ── THE GAP THIS CLOSES ───────────────────────────────────────────────────────
 *
 * A GGD match is one `SimWorld.step()` on one thread. Measured on this content
 * tree, a shipping match (50 mobs/zone, 116 entities) costs 0.67 ms of CPU per
 * 30 Hz tick — 2.0% of a core. Node is single-threaded, `game.replicas` is 1 and
 * `game.resources` is empty, so ALL rooms on a shard share ONE core no matter
 * how many the machine has. The 24-core production box was running the game on
 * one of them.
 *
 * This module is the config seam for the fix: N independent OS processes, each
 * carrying many rooms, sharing a matchmaker over Redis.
 *
 * ── DO NOT BUILD A CUSTOM CLUSTER. COLYSEUS ALREADY HAS ONE ───────────────────
 *
 * Everything below is plumbing for three Colyseus primitives that already exist
 * in @colyseus/core 0.16 (read `MatchMaker.mjs` if you doubt any of this):
 *
 *  1. PRESENCE is the whole mechanism. `matchMaker.createRoom()` asks
 *     `selectProcessIdToCreateRoom()` — whose default sorts `stats.fetchAll()`,
 *     i.e. `presence.hgetall("roomcount")`, and picks the process with the
 *     FEWEST rooms. If that is another process, the create is shipped there over
 *     `requestFromIPC(presence, …)`, which is a presence pub/sub round trip.
 *     `reserveSeatFor()` does the same over `remoteRoomCall`. With the default
 *     LocalPresence all of that degenerates to "always me", so processes cannot
 *     see each other at all. Redis presence IS the cluster.
 *
 *  2. THE DRIVER is the room *listing*. LocalDriver keeps listings in a Map in
 *     the creating process, so `getRoomById` / `findOneRoomAvailable` on any
 *     other process return nothing. RedisDriver puts the listing where every
 *     process can read it. Needed the moment a lookup can start on a process
 *     that does not own the room.
 *
 *  3. `publicAddress` IS THE ROUTING. The client builds its socket URL as
 *     `{publicAddress}/{processId}/{roomId}` (colyseus.js `buildEndpoint`), and
 *     the transport answers with `matchMaker.getLocalRoomById(roomId)` — a
 *     client that lands on the wrong process is REJECTED, it is not forwarded.
 *     So each process must advertise an address that reaches THAT process, and
 *     that address travels to the browser inside the seat reservation the
 *     platform already hands out (`/_internal/matches` → `match_ready`).
 *
 * Redis is already in this deployment (the Go platform's hot layer + the
 * `chan:content` bus, see contentBus.ts). This adds a second, independent use of
 * the same server; it does NOT share keys with either.
 *
 * ── WHY EVERY KNOB HERE IS A KNOB ─────────────────────────────────────────────
 *
 * `processes` is a decision point, not a constant: the right number depends on
 * the box (cores AND memory — see the RSS note below), and getting it wrong in
 * either direction is expensive. Hard-coding it would mean a rebuild to retune.
 * Same for the presence backend and the address template, which differ between
 * "owner's laptop", "docker compose" and "GKE".
 *
 * ⚠️ RSS IS THE REAL CEILING, NOT CORES. Each process loads the whole content
 * tree (119 champions / 215 items / 1,441 documents) into its own heap:
 * 198 MB resident, measured on a real idle boot. Processes do NOT share it —
 * Node has no shared heap — so memory grows strictly linearly with this number
 * while CPU capacity does too. `MAX_GAME_PROCESSES` is a guardrail against a
 * fat-fingered value swapping the box to death, not a recommendation.
 */

/**
 * Hard ceiling on `processes`. 64 × ~200 MB ≈ 12.6 GB of content-tree copies,
 * which is already past what any sane single box should spend on duplicated
 * read-only data. A value above this is refused rather than clamped: a silent
 * clamp is how "I set 500 and nothing happened" becomes a two-hour debug.
 */
export const MAX_GAME_PROCESSES = 64;

/** Ceiling on the port span so a typo cannot make a shard squat 60k ports. */
export const MAX_PORT = 65535;

/**
 * How long a cross-process matchmaker call may take (Colyseus reads this from
 * `COLYSEUS_PRESENCE_SHORT_TIMEOUT`; its own default is 2000).
 *
 * ⚠️ 2000 IS TOO SHORT FOR GGD, AND THE FAILURE IS SILENT. `MatchRoom.onCreate`
 * awaits four platform-backed resolutions (server-ops, the curation whitelist,
 * the combat-env table, 基礎加成) plus opening the replay and stats recorders,
 * all before it returns. That is fine on the LOCAL create path, which has no
 * deadline — but the REMOTE path is wrapped in this timeout, and when it fires
 * `matchMaker.createRoom` does two things:
 *
 *   1. creates the room LOCALLY instead, and
 *   2. calls `stats.excludeProcess()` on the perfectly healthy remote process,
 *      deleting it from the matchmaker's roomcount.
 *
 * The result is a shard that boots N processes, spreads nothing, and reports no
 * error — measured on the first run of the multi-process guard, where 8 of 8
 * rooms landed on one process and the log carried a single line: "ipc_timeout:
 * create room request timed out". This is failure shape ② from CLAUDE.md
 * ("built, but never reaches the player") with the cluster as the payload.
 *
 * 15 s is chosen to cover a COLD cache against an UNREACHABLE platform — the
 * worst case, and the one an operator hits right after a restart. The cost of
 * being generous is bounded: this deadline only delays a room CREATE (a player
 * is sitting in a lobby, not in combat) and only when a process really is dead.
 */
export const DEFAULT_IPC_TIMEOUT_MS = 15_000;
export const MIN_IPC_TIMEOUT_MS = 250;
export const MAX_IPC_TIMEOUT_MS = 120_000;

/**
 * Delay between forking shard i and shard i+1.
 *
 * ⚠️ NOT COSMETIC — forking simultaneously loses a shard. Colyseus's
 * `matchMaker.accept()` runs `healthCheckAllProcesses()`, which pings every
 * process that is in the shared roomcount but whose IPC channel it cannot yet
 * see in `PUBSUB CHANNELS`. Redis pub/sub is fire-and-forget, so if the target
 * subscribes a few milliseconds after the ping is published, the ping is dropped
 * on the floor, the check times out, and the checker EVICTS a perfectly healthy
 * sibling from the matchmaker (`stats.excludeProcess` + `driver.cleanup`). The
 * victim is invisible until its next 60 s auto-persist.
 *
 * Measured, three runs, forks issued in the same tick: one shard registered,
 * then vanished from `roomcount` exactly one IPC-timeout later, and every
 * subsequent match landed on the survivor. Staggering removes the race by
 * construction: shard i+1 cannot start its scan until shard i's subscription is
 * seconds old. It also spreads the boot spike — N shards each parsing 1,441
 * content documents at once is the worst moment to also be answering pings.
 */
export const DEFAULT_STARTUP_STAGGER_MS = 3_000;
export const MAX_STARTUP_STAGGER_MS = 60_000;

export type PresenceBackend = "local" | "redis";
export type ClusterRole = "supervisor" | "shard";

export interface ClusterConfig {
  /** How many shard processes this container runs. 1 == exactly today's server. */
  processes: number;
  /** 0-based index of THIS process, or null when this process is the supervisor. */
  processIndex: number | null;
  /** What this process is supposed to do. */
  role: ClusterRole;
  /** First port of the contiguous span; shard i listens on basePort + i. */
  basePort: number;
  /** The port THIS process listens on (basePort for a supervisor's own accounting). */
  port: number;
  /** Which Colyseus presence implementation to construct. */
  presence: PresenceBackend;
  redisHost: string;
  redisPort: number;
  redisPassword: string | undefined;
  /**
   * Address template advertised to browsers, with `{index}` / `{port}`
   * placeholders. Empty means "advertise nothing", which is correct — and only
   * correct — for a single-process shard.
   */
  publicAddressTemplate: string;
  /** The resolved address for THIS process (empty when the template is empty). */
  publicAddress: string;
  /**
   * Deadline for a cross-process matchmaker call (`COLYSEUS_PRESENCE_SHORT_TIMEOUT`).
   * See DEFAULT_IPC_TIMEOUT_MS for why Colyseus's own 2 s is wrong for GGD.
   */
  ipcTimeoutMs: number;
  /** Gap between consecutive shard forks. See DEFAULT_STARTUP_STAGGER_MS. */
  startupStaggerMs: number;
}

export interface ClusterResolution {
  config: ClusterConfig;
  /** Non-empty means REFUSE TO BOOT. Each string is an operator-facing sentence. */
  errors: string[];
}

function parseIntEnv(raw: string | undefined, fallback: number): number | null {
  const s = (raw ?? "").trim();
  if (s === "") return fallback;
  if (!/^-?\d+$/.test(s)) return null;
  return Number(s);
}

/**
 * Parse `REDIS_ADDR` (`host:port`), matching the platform's config.LoadStorage
 * and contentBus.parseRedisAddr. Duplicated deliberately rather than imported:
 * contentBus's copy is about an OPTIONAL subscriber that may fail silently, and
 * this one gates a FATAL boot check. They must not drift into each other.
 */
export function parseRedisAddr(addr: string | undefined): { host: string; port: number } {
  const raw = (addr ?? "").trim();
  if (raw === "") return { host: "127.0.0.1", port: 6379 };
  const idx = raw.lastIndexOf(":");
  if (idx <= 0) return { host: raw, port: 6379 };
  const port = Number(raw.slice(idx + 1));
  return {
    host: raw.slice(0, idx),
    port: Number.isInteger(port) && port > 0 && port <= MAX_PORT ? port : 6379,
  };
}

/** Substitute `{index}` / `{port}` in the advertised-address template. */
export function renderPublicAddress(template: string, index: number, port: number): string {
  if (template.trim() === "") return "";
  return template.trim().replace(/\{index\}/g, String(index)).replace(/\{port\}/g, String(port));
}

/**
 * Resolve the cluster posture from the environment.
 *
 * Pure: takes an env bag, returns a decision plus the reasons to refuse. The
 * caller decides whether to `process.exit(1)` — which keeps every rule here
 * testable without booting a server.
 */
export function resolveClusterConfig(env: NodeJS.ProcessEnv = process.env): ClusterResolution {
  const errors: string[] = [];

  const rawProcesses = parseIntEnv(env.GGD_GAME_PROCESSES, 1);
  let processes = rawProcesses ?? 1;
  if (rawProcesses === null) {
    errors.push(
      `GGD_GAME_PROCESSES=${JSON.stringify(env.GGD_GAME_PROCESSES)} is not an integer. ` +
        `It is a COUNT OF OS PROCESSES (1..${MAX_GAME_PROCESSES}); 1 keeps today's single-threaded shard.`,
    );
    processes = 1;
  } else if (processes < 1) {
    errors.push(`GGD_GAME_PROCESSES=${processes} is below the minimum of 1 — a shard with no process serves nobody.`);
    processes = 1;
  } else if (processes > MAX_GAME_PROCESSES) {
    // UPPER BOUND, not just a lower one. Each process holds its own ~198 MB copy
    // of the content tree, so this is the difference between "uses the cores" and
    // "OOM-kills the pod on boot". Refuse loudly instead of clamping silently.
    errors.push(
      `GGD_GAME_PROCESSES=${processes} exceeds the maximum of ${MAX_GAME_PROCESSES}. Every process loads its ` +
        `own copy of the content tree (~198 MB resident, measured), so ${processes} processes would need ` +
        `~${Math.round((processes * 198) / 1024)} GB of RAM for the content alone.`,
    );
    processes = MAX_GAME_PROCESSES;
  }

  const rawIndex = (env.GGD_GAME_PROCESS_INDEX ?? "").trim();
  let processIndex: number | null = null;
  if (rawIndex !== "") {
    const n = parseIntEnv(rawIndex, 0);
    if (n === null || n < 0 || n >= processes) {
      errors.push(
        `GGD_GAME_PROCESS_INDEX=${JSON.stringify(rawIndex)} is not a valid shard index for ` +
          `GGD_GAME_PROCESSES=${processes} (expected 0..${processes - 1}). This variable is set by the ` +
          `supervisor; do not set it by hand.`,
      );
      processIndex = 0;
    } else {
      processIndex = n;
    }
  }

  const rawBase = parseIntEnv(env.GAME_PORT, 2567);
  let basePort = rawBase ?? 2567;
  if (rawBase === null || basePort < 1 || basePort > MAX_PORT) {
    errors.push(`GAME_PORT=${JSON.stringify(env.GAME_PORT)} is not a port number in 1..${MAX_PORT}.`);
    basePort = 2567;
  }
  if (basePort + processes - 1 > MAX_PORT) {
    errors.push(
      `GAME_PORT=${basePort} with GGD_GAME_PROCESSES=${processes} would need ports up to ` +
        `${basePort + processes - 1}, past ${MAX_PORT}. Lower the base port or the process count.`,
    );
  }

  const rawPresence = (env.GGD_MATCHMAKER_PRESENCE ?? "auto").trim().toLowerCase();
  let presence: PresenceBackend;
  if (rawPresence === "auto" || rawPresence === "") {
    // AUTO is the honest default because the answer is forced, not preferred:
    // >1 process CANNOT work on LocalPresence (see the header), and 1 process
    // gains nothing from Redis. Stating it here beats hiding it in a comment.
    presence = processes > 1 ? "redis" : "local";
  } else if (rawPresence === "local" || rawPresence === "redis") {
    presence = rawPresence;
  } else {
    errors.push(
      `GGD_MATCHMAKER_PRESENCE=${JSON.stringify(rawPresence)} is not one of auto | local | redis.`,
    );
    presence = processes > 1 ? "redis" : "local";
  }

  // FAIL CLOSED. Multi-process on LocalPresence is not "degraded", it is broken
  // in a way that looks fine at boot: each process would run its own private
  // matchmaker, `/_internal/matches` would only ever create rooms on whichever
  // process the platform's HTTP call happened to reach, and the other processes
  // would sit idle forever while looking healthy.
  if (processes > 1 && presence === "local") {
    errors.push(
      `GGD_GAME_PROCESSES=${processes} with GGD_MATCHMAKER_PRESENCE=local is not a working configuration: ` +
        `Colyseus processes discover each other ONLY through presence, so each process would run a private ` +
        `matchmaker and never place or find a room on any other. Use redis (and set REDIS_ADDR), or set ` +
        `GGD_GAME_PROCESSES=1.`,
    );
  }

  const { host: redisHost, port: redisPort } = parseRedisAddr(env.REDIS_ADDR);

  const publicAddressTemplate = (env.GGD_GAME_PUBLIC_ADDRESS_TEMPLATE ?? "").trim();
  // The SECOND fail-closed rule, and the subtler one. Without a per-process
  // address every seat reservation advertises the same host, so the browser
  // opens its socket against whichever process the edge happens to pick and the
  // transport rejects it (`getLocalRoomById` returns undefined). Matches would
  // be created perfectly and then be unjoinable — for roughly (N-1)/N of players.
  if (processes > 1 && publicAddressTemplate === "") {
    errors.push(
      `GGD_GAME_PROCESSES=${processes} needs GGD_GAME_PUBLIC_ADDRESS_TEMPLATE. Colyseus sends the browser to ` +
        `{publicAddress}/{processId}/{roomId} and the transport only serves rooms it owns, so without a ` +
        `per-process address most players would be sent to a process that does not have their room and be ` +
        `rejected. Example: "ggd.adms.ai/ws/p{index}" with an edge route per index.`,
    );
  }
  // The template must VARY per process. Either placeholder does that: {index}
  // for a path-routed edge ("/ws/p0", "/ws/p1"), {port} for a port-routed one
  // ("host:2567", "host:2568"). A template with neither is the quiet killer —
  // it renders to one identical address for every shard, so the seat tokens all
  // look fine and (N-1)/N of players are refused at the socket.
  const varies = publicAddressTemplate.includes("{index}") || publicAddressTemplate.includes("{port}");
  if (processes > 1 && publicAddressTemplate !== "" && !varies) {
    errors.push(
      `GGD_GAME_PUBLIC_ADDRESS_TEMPLATE=${JSON.stringify(publicAddressTemplate)} has neither an {index} nor a ` +
        `{port} placeholder, so all ${processes} processes would advertise the SAME address and ` +
        `${processes - 1} of every ${processes} joins would be rejected.`,
    );
  }

  const rawIpc = parseIntEnv(env.GGD_GAME_IPC_TIMEOUT_MS, DEFAULT_IPC_TIMEOUT_MS);
  let ipcTimeoutMs = rawIpc ?? DEFAULT_IPC_TIMEOUT_MS;
  if (rawIpc === null || ipcTimeoutMs < MIN_IPC_TIMEOUT_MS || ipcTimeoutMs > MAX_IPC_TIMEOUT_MS) {
    errors.push(
      `GGD_GAME_IPC_TIMEOUT_MS=${JSON.stringify(env.GGD_GAME_IPC_TIMEOUT_MS)} is not an integer in ` +
        `${MIN_IPC_TIMEOUT_MS}..${MAX_IPC_TIMEOUT_MS} ms. It bounds how long a room create may take on ` +
        `ANOTHER process before the matchmaker gives up and evicts that process — too low and every ` +
        `match silently lands on one shard.`,
    );
    ipcTimeoutMs = DEFAULT_IPC_TIMEOUT_MS;
  }

  const rawStagger = parseIntEnv(env.GGD_GAME_STARTUP_STAGGER_MS, DEFAULT_STARTUP_STAGGER_MS);
  let startupStaggerMs = rawStagger ?? DEFAULT_STARTUP_STAGGER_MS;
  if (rawStagger === null || startupStaggerMs < 0 || startupStaggerMs > MAX_STARTUP_STAGGER_MS) {
    errors.push(
      `GGD_GAME_STARTUP_STAGGER_MS=${JSON.stringify(env.GGD_GAME_STARTUP_STAGGER_MS)} is not an integer in ` +
        `0..${MAX_STARTUP_STAGGER_MS} ms. 0 forks every shard at once, which races Colyseus's boot ` +
        `health-check and loses shards — see DEFAULT_STARTUP_STAGGER_MS.`,
    );
    startupStaggerMs = DEFAULT_STARTUP_STAGGER_MS;
  }

  const index = processIndex ?? 0;
  const port = basePort + index;

  return {
    config: {
      processes,
      processIndex,
      role: processes > 1 && processIndex === null ? "supervisor" : "shard",
      basePort,
      port,
      presence,
      redisHost,
      redisPort,
      redisPassword: env.REDIS_PASSWORD || undefined,
      publicAddressTemplate,
      publicAddress: renderPublicAddress(publicAddressTemplate, index, port),
      ipcTimeoutMs,
      startupStaggerMs,
    },
    errors,
  };
}

/**
 * Push the resolved IPC deadline into the variable Colyseus actually reads.
 *
 * ⚠️ TIMING IS THE WHOLE POINT: `@colyseus/core` freezes
 * `REMOTE_ROOM_SHORT_TIMEOUT` at MODULE LOAD (`utils/Utils.mjs`), so this must
 * run before anything imports `colyseus`. That is why it lives here and is
 * called from cluster/main.ts and from the supervisor's child env — never from
 * index.ts, whose `import { Server } from "colyseus"` is hoisted above any
 * statement it could contain.
 */
export function applyIpcTimeoutEnv(cfg: ClusterConfig, env: NodeJS.ProcessEnv = process.env): void {
  env.COLYSEUS_PRESENCE_SHORT_TIMEOUT = String(cfg.ipcTimeoutMs);
}

/** One line, at boot, saying what this process decided it is. */
export function clusterBootLine(cfg: ClusterConfig): string {
  if (cfg.processes === 1) {
    return `[cluster] single process on :${cfg.port} (presence=${cfg.presence}) — set GGD_GAME_PROCESSES>1 to use more cores`;
  }
  if (cfg.role === "supervisor") {
    return (
      `[cluster] supervisor: forking ${cfg.processes} shard processes on :${cfg.basePort}..` +
      `:${cfg.basePort + cfg.processes - 1} (presence=${cfg.presence} @ ${cfg.redisHost}:${cfg.redisPort})`
    );
  }
  return (
    `[cluster] shard ${cfg.processIndex}/${cfg.processes} on :${cfg.port} ` +
    `(presence=${cfg.presence} @ ${cfg.redisHost}:${cfg.redisPort}, publicAddress=${cfg.publicAddress || "-"})`
  );
}
