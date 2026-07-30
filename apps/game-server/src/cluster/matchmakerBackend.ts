/**
 * Construct the Colyseus matchmaker backend for THIS process.
 *
 * Two objects, one decision. `presence` is how processes find each other at all
 * (room placement + cross-process seat reservation ride on presence pub/sub);
 * `driver` is where room listings live so a lookup started on one process can
 * find a room owned by another. See config/cluster.ts for why both are needed
 * and why neither is home-grown.
 *
 * Returning `{}` for the single-process case is deliberate: Colyseus's own
 * defaults (LocalPresence + LocalDriver) are then used, so a 1-process shard is
 * byte-for-byte the server GGD has always shipped and takes no Redis dependency.
 */
import { RedisPresence } from "@colyseus/redis-presence";
import { RedisDriver } from "@colyseus/redis-driver";
import type { ClusterConfig } from "../config/cluster";

export interface MatchmakerBackend {
  presence?: RedisPresence;
  driver?: RedisDriver;
  publicAddress?: string;
}

export function buildMatchmakerBackend(cfg: ClusterConfig): MatchmakerBackend {
  if (cfg.presence !== "redis") {
    return cfg.publicAddress ? { publicAddress: cfg.publicAddress } : {};
  }
  const options = {
    host: cfg.redisHost,
    port: cfg.redisPort,
    ...(cfg.redisPassword ? { password: cfg.redisPassword } : {}),
    /**
     * ⚠️ `enableReadyCheck: false` IS LOad-BEARING. THE CLUSTER DOES NOT WORK
     * WITHOUT IT — and it fails silently, which is worse.
     *
     * `RedisPresence` hands these options to BOTH of its ioredis connections,
     * including the one it puts into subscriber mode for matchmaker IPC. With
     * ioredis's default ready-check on (measured on ioredis 5.11.1), that
     * connection is issued an `INFO` right after connecting, Redis refuses it
     * ("Connection in subscriber mode, only subscriber commands may be used"),
     * ioredis surfaces an unhandled error event — and the subscription is gone.
     *
     * MEASURED, before this line existed: `MONITOR` showed `SUBSCRIBE p:<id>`
     * at boot, and ten seconds later `CLIENT LIST` showed `sub=0` on every
     * connection and `PUBSUB CHANNELS` was empty. Since presence pub/sub IS the
     * cluster, the consequences were all of:
     *   - every cross-process room create timed out and fell back to LOCAL,
     *   - the boot health-check timed out and EVICTED a healthy sibling from
     *     the shared roomcount (`stats.excludeProcess` + `driver.cleanup`),
     *   - so N processes booted, reported healthy, and served every match from
     *     one of them.
     * The only symptom in the log was one line: "ipc_timeout".
     */
    enableReadyCheck: false,
  };
  return {
    presence: new RedisPresence(options),
    driver: new RedisDriver(options),
    ...(cfg.publicAddress ? { publicAddress: cfg.publicAddress } : {}),
  };
}
