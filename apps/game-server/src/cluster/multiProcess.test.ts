/**
 * THE GUARD FOR MULTI-PROCESS SHARDING — and it starts real processes.
 *
 * A config-shaped assertion ("the values.yaml has a `processes` key", "the
 * Server got a presence object") would pass on a build where every room still
 * landed on one process and every second player was rejected at the socket.
 * That is failure shape ③/⑦ in CLAUDE.md, and this file is written to be immune
 * to it: it boots a REAL supervisor with REAL Redis, creates REAL matches
 * through the REAL `/_internal/matches` HMAC route, and then
 *
 *   1. asserts the rooms are spread over MORE THAN ONE OS process,
 *   2. asserts a seat reservation minted on process A for a room owned by
 *      process B came back successfully — that IS cross-process matchmaking,
 *      because `matchMaker.reserveSeatFor` reaches a remote room only over
 *      presence IPC, and
 *   3. opens an actual WebSocket to the advertised address and asserts the
 *      RIGHT process accepts the seat and the WRONG one rejects it.
 *
 * (3) is the one that cannot be faked. Colyseus's transport answers a socket
 * with `matchMaker.getLocalRoomById(roomId)`; a client sent to the wrong process
 * is refused, never forwarded. So "the browser is told an address that works" is
 * a claim about behaviour, and this measures it.
 *
 * MUTATION RECORD (run by hand, see the task report):
 *   - delete `presence` from buildMatchmakerBackend → all rooms collapse onto
 *     one processId → (1) fails.
 *   - delete `publicAddress` from buildMatchmakerBackend → seat tokens carry no
 *     address → (3) fails.
 * Both verified red, then restored.
 *
 * Redis is a hard requirement for the multi-process path (that is the point),
 * so this suite skips when no `redis-server` binary exists — loudly, naming
 * what was not exercised.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sign } from "../auth/hmac";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(HERE, "..", "..");
const TSX = join(APP_ROOT, "node_modules", ".bin", "tsx");

const REDIS_PORT = 39838;
const BASE_PORT = 39840;
const PROCESSES = 2;
const STAGGER_MS = 3_000;
/** ≥32 chars: secretGuard.ts refuses to boot a networked shard on a short one. */
const SECRET = "multi-process-guard-secret-0123456789abcdef";

const hasRedis = spawnSync("redis-server", ["--version"], { stdio: "ignore" }).status === 0;

async function waitForHealthz(port: number, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`game shard on :${port} never answered /healthz`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

interface Reservation {
  sessionId: string;
  room: { roomId: string; processId: string; publicAddress?: string };
}

async function createMatch(port: number, matchId: string): Promise<Reservation> {
  const body = JSON.stringify({
    matchId,
    mode: "arena",
    seats: [{ accountId: `acct-${matchId}`, displayName: "Guard", team: 0, slot: 0 }],
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const res = await fetch(`http://127.0.0.1:${port}/_internal/matches`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-timestamp": ts,
      "x-internal-auth": sign(SECRET, ts, body),
    },
    body,
  });
  expect(res.status, `POST /_internal/matches for ${matchId}`).toBe(200);
  const json = (await res.json()) as { reservations: { seatToken: string }[] };
  return JSON.parse(json.reservations[0]!.seatToken) as Reservation;
}

/** Open a socket exactly the way colyseus.js would and report what happened. */
function probeSocket(port: number, r: Reservation): Promise<"accepted" | "rejected"> {
  return new Promise((resolve) => {
    const url =
      `ws://127.0.0.1:${port}/${r.room.processId}/${r.room.roomId}` +
      `?sessionId=${encodeURIComponent(r.sessionId)}`;
    const ws = new WebSocket(url);
    let settled = false;
    const done = (verdict: "accepted" | "rejected"): void => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        /* already closing */
      }
      resolve(verdict);
    };
    // ⚠️ SURVIVAL, NOT "GOT A MESSAGE". A rejected seat also produces a frame —
    // Colyseus answers `client.error(...)` and only then closes — so treating
    // the first message as success made the WRONG process look accepting too
    // (caught by this test failing against a known-good server). The honest
    // signal is whether the socket is still open a moment later.
    ws.addEventListener("close", () => done("rejected"));
    ws.addEventListener("error", () => done("rejected"));
    setTimeout(() => done(ws.readyState === WebSocket.OPEN ? "accepted" : "rejected"), 2_500);
  });
}

describe.skipIf(!hasRedis)("multi-process sharding (real processes + real Redis)", () => {
  let redis: ChildProcess;
  let supervisor: ChildProcess;

  beforeAll(async () => {
    redis = spawn("redis-server", ["--port", String(REDIS_PORT), "--save", "", "--appendonly", "no"], {
      stdio: "ignore",
    });
    supervisor = spawn(TSX, ["src/cluster/main.ts"], {
      cwd: APP_ROOT,
      stdio: "ignore",
      env: {
        ...process.env,
        APP_ENV: "development",
        GGD_DEPLOY_TIER: "dev",
        GAME_PORT: String(BASE_PORT),
        GGD_GAME_PROCESSES: String(PROCESSES),
        GGD_MATCHMAKER_PRESENCE: "redis",
        GGD_GAME_STARTUP_STAGGER_MS: String(STAGGER_MS),
        REDIS_ADDR: `127.0.0.1:${REDIS_PORT}`,
        // The address a browser would be handed. `{port}` resolves per shard, so
        // this is the local stand-in for "an edge route per process".
        GGD_GAME_PUBLIC_ADDRESS_TEMPLATE: "127.0.0.1:{port}",
        PLATFORM_GAME_SHARED_SECRET: SECRET,
        // Skeleton content: this suite is about process topology, not the
        // content tree, and a full 1,441-document load per shard would make it
        // too slow to keep in the default run — which is how a guard quietly
        // stops guarding.
        CONTENT_DIR: join(APP_ROOT, "does-not-exist-on-purpose"),
        GGD_CONTENT_BUS: "0",
      },
    });
    await Promise.all([waitForHealthz(BASE_PORT), waitForHealthz(BASE_PORT + 1)]);
    // /healthz answers as soon as the HTTP server binds; a shard publishes
    // itself into the SHARED matchmaker a moment later (matchMaker.accept →
    // stats.persist). Wait out the fork stagger plus that margin so the
    // assertions below measure sharding, not a boot race we caused ourselves.
    await new Promise((r) => setTimeout(r, PROCESSES * STAGGER_MS + 6_000));
  }, 180_000);

  afterAll(() => {
    supervisor?.kill("SIGTERM");
    redis?.kill("SIGTERM");
  });

  it("spreads rooms across processes and reserves seats on remote ones", async () => {
    // Every create goes to ONE shard's HTTP port — exactly what the Go platform
    // does today. If sharding works, the matchmaker hands most of them to the
    // other process anyway.
    const reservations: Reservation[] = [];
    for (let i = 0; i < 6; i++) reservations.push(await createMatch(BASE_PORT, `m_guard_${i}`));

    const processIds = new Set(reservations.map((r) => r.room.processId));
    expect(
      processIds.size,
      `all 6 rooms landed on one process (${[...processIds]}) — the matchmaker is not clustered`,
    ).toBeGreaterThan(1);

    // Every one of the 6 came back with a usable reservation, and at least one
    // of those was minted for a room this process does not own. That round trip
    // only exists over presence IPC.
    const addresses = new Set(reservations.map((r) => r.room.publicAddress));
    expect(addresses.has(undefined), "a seat token carried no publicAddress").toBe(false);
    expect(addresses.size, "every process advertised the same address").toBe(processIds.size);
    for (const r of reservations) expect(r.sessionId).toMatch(/^[A-Za-z0-9_-]+$/);
  }, 60_000);

  it("the advertised address is the one that accepts the socket — and only it", async () => {
    // Create until we hold a room that lives on the SECOND shard, so the "right"
    // and "wrong" ports are genuinely different.
    let remote: Reservation | null = null;
    for (let i = 0; i < 8 && !remote; i++) {
      const r = await createMatch(BASE_PORT, `m_sock_${i}`);
      if (r.room.publicAddress === `127.0.0.1:${BASE_PORT + 1}`) remote = r;
    }
    expect(remote, "no room ever landed on the second shard").not.toBeNull();

    const right = Number(remote!.room.publicAddress!.split(":")[1]);
    const wrong = right === BASE_PORT ? BASE_PORT + 1 : BASE_PORT;
    expect(await probeSocket(right, remote!)).toBe("accepted");
    expect(await probeSocket(wrong, remote!)).toBe("rejected");
  }, 120_000);
});
