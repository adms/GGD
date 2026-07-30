/**
 * The supervisor: fork N shard processes, keep them alive, die with them.
 *
 * WHY NOT node:cluster. `cluster` shares ONE listening socket and round-robins
 * connections across workers. That is exactly wrong here: a Colyseus room lives
 * in ONE process and the transport rejects a socket for a room it does not own
 * (`getLocalRoomById`), so a round-robined upgrade would land on the wrong
 * worker most of the time. Each shard therefore gets its OWN port, and each
 * advertises an address that reaches that port (config/cluster.ts).
 *
 * WHY NOT worker_threads. Threads would share the process's heap — attractive,
 * given each shard's 198 MB content tree — but the sim is not the only thing in
 * a shard: the WS transport, the schema encoder and the replay writer all assume
 * a process. Processes also give real fault isolation, which matters more here
 * than the memory: one match crashing must not take the other 49 with it.
 */
import { fork, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClusterConfig } from "../config/cluster";

/** Shard entrypoint, resolved relative to this file so tsx and node both work. */
export function shardEntrypoint(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "index.ts");
}

/**
 * A crash-looping shard must not become a fork bomb. A shard that dies inside
 * this window of its own start is treated as "failed to boot" and backed off;
 * one that dies after it is treated as a runtime crash and restarted at once.
 */
export const RESTART_BACKOFF_MS = 2_000;
export const HEALTHY_UPTIME_MS = 30_000;

export interface SupervisorHandle {
  children: ChildProcess[];
  stop: () => void;
}

export function runSupervisor(
  cfg: ClusterConfig,
  opts: { entrypoint?: string; log?: typeof console.log } = {},
): SupervisorHandle {
  const entrypoint = opts.entrypoint ?? shardEntrypoint();
  const log = opts.log ?? console.log;
  const children: ChildProcess[] = [];
  let stopping = false;

  const spawn = (index: number): void => {
    const startedAt = Date.now();
    const child = fork(entrypoint, [], {
      env: {
        ...process.env,
        GGD_GAME_PROCESS_INDEX: String(index),
        // The shard reads GAME_PORT as the BASE and adds its own index, so the
        // base is passed through unchanged. Deriving the port in one place
        // (cluster.ts) is what keeps the advertised {port} and the bound port
        // from ever disagreeing.
        GAME_PORT: String(cfg.basePort),
        GGD_GAME_PROCESSES: String(cfg.processes),
        // Colyseus freezes this at module load, and the child's `colyseus`
        // import is hoisted — so it has to be in the environment it is BORN
        // with. Without it every cross-process create silently times out at 2 s
        // and the cluster degrades to one working process (see cluster.ts).
        COLYSEUS_PRESENCE_SHORT_TIMEOUT: String(cfg.ipcTimeoutMs),
      },
      stdio: "inherit",
    });
    children[index] = child;
    child.on("exit", (code, signal) => {
      if (stopping) return;
      const uptime = Date.now() - startedAt;
      const delay = uptime < HEALTHY_UPTIME_MS ? RESTART_BACKOFF_MS : 0;
      log(
        `[cluster] shard ${index} exited (code=${code} signal=${signal}) after ${uptime}ms — ` +
          `restarting${delay ? ` in ${delay}ms` : ""}`,
      );
      setTimeout(() => {
        if (!stopping) spawn(index);
      }, delay).unref?.();
    });
  };

  // STAGGERED, NOT SIMULTANEOUS. Forking them all in one tick races Colyseus's
  // boot health-check and makes one shard evict another — measured, see
  // DEFAULT_STARTUP_STAGGER_MS in config/cluster.ts. Shard 0 still starts
  // immediately, so a single-shard-equivalent boot is not slowed.
  for (let i = 0; i < cfg.processes; i++) {
    if (i === 0 || cfg.startupStaggerMs === 0) spawn(i);
    else setTimeout(() => { if (!stopping) spawn(i); }, i * cfg.startupStaggerMs).unref?.();
  }

  const stop = (): void => {
    stopping = true;
    for (const child of children) child?.kill("SIGTERM");
  };
  // A supervisor that survives its own SIGTERM would leave orphaned shards
  // holding ports, which is how a rolling restart turns into a stuck deploy.
  process.on("SIGTERM", () => {
    stop();
    process.exit(0);
  });
  process.on("SIGINT", () => {
    stop();
    process.exit(0);
  });

  return { children, stop };
}
