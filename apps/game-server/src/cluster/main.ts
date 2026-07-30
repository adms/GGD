/**
 * Game-server entrypoint. Decides ONE thing and then gets out of the way:
 * is this process a supervisor that forks shards, or a shard that serves rooms?
 *
 * `GGD_GAME_PROCESSES=1` (the default, and what GGD has always shipped) takes
 * the second branch immediately — no fork, no supervisor, no Redis, no extra
 * process in the container. The multi-process path costs nothing until it is
 * turned on.
 *
 * index.ts stays the shard: it is unchanged apart from reading this same config
 * to pick its port and its matchmaker backend.
 */
import { applyIpcTimeoutEnv, clusterBootLine, resolveClusterConfig } from "../config/cluster";

const { config, errors } = resolveClusterConfig(process.env);

if (errors.length > 0) {
  // FAIL CLOSED, like the secret guard and the endpoint guard next to it. Every
  // error in this list describes a configuration where the shard would BOOT AND
  // LOOK HEALTHY while some or all matches were unjoinable — the single most
  // expensive failure shape this repo has (see the deploy protocol in CLAUDE.md).
  console.error(`[cluster] FATAL: refusing to start.\n  - ${errors.join("\n  - ")}`);
  process.exit(1);
}

// MUST happen before any `import("colyseus")` anywhere below — Colyseus freezes
// this deadline at module load. Both branches below are dynamic imports for
// exactly this reason.
applyIpcTimeoutEnv(config);

console.log(clusterBootLine(config));

if (config.role === "supervisor") {
  const { runSupervisor } = await import("./supervisor");
  runSupervisor(config);
} else {
  await import("../index");
}
