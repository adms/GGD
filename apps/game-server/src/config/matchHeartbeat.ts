/**
 * MATCH LIVENESS — the game-server half of #187.
 *
 * THE BUG. The platform put every started match into a pending set scored
 * `now + 30 minutes` and never touched that score again. Its reaper reads
 * everything scored in the past and declares it abandoned: an abandoned
 * settlement is written, every human is dropped back to the lobby and the room
 * is disposed. That was safe only while `startingLives` was hardcoded to 3 and a
 * match could not exceed ~18 minutes. With the owner's
 * `match.startingTeamLives = 8` the MEAN match is 33.6 minutes (42.3 if rounds
 * run to the full combatMaxSec), so the family's games were being torn down
 * mid-play and everyone credited with an ABANDONED result.
 *
 * WHY THE FIX LIVES HERE. Nothing on the platform can tell a running match from
 * a hung one; this process can, because it is the one ticking the sim. So this
 * module tells the platform, on the same HMAC-signed channel that already
 * carries seat reservations and the match result. The platform then renews the
 * deadline from the last beat instead of guessing from a constant — match
 * length stops being any constant's business, whether the owner sets 3 lives or
 * 12.
 *
 * WHAT IS REPORTED, AND WHY BOTH. `matchMaker.query({ name: "match" })` is the
 * complete list of rooms this process is actually running, but it is keyed by
 * Colyseus roomId; the platform resolves those against the `gameRoomId` it
 * recorded when it created the match. `liveRecordingIds()` is keyed by matchId
 * directly and needs no resolution, but it is best-effort (a recorder that
 * failed to open is absent). Sending both means either one being unavailable
 * degrades coverage rather than losing it — and a match the platform never
 * hears about simply keeps the long blind deadline it started with, so partial
 * coverage can never cause an EARLY reap.
 *
 * FAIL-SAFE, LIKE EVERY OTHER PLATFORM CALL HERE. Unreachable platform, non-200
 * or a malformed reply changes nothing about the running match; it warns once
 * through the shared degradation registry (config/platformUrl.ts) so an operator
 * sees on /healthz that liveness is not being reported, which is exactly the
 * condition under which the platform falls back to its blind deadline.
 */
import { matchMaker } from "@colyseus/core";
import { sign } from "../auth/hmac";
import { liveRecordingIds } from "../replay/Recorder";
import { PLATFORM_URL, warnOnce, clearDegradation } from "./platformUrl";

/** Degradation-registry key raised when the platform is not hearing us. */
const DEGRADE_KEY = "match-heartbeat";

/**
 * How often liveness is asserted. The platform's grace defaults to 3 minutes,
 * so this tolerates five consecutive failures before a live match is at risk —
 * and it is cheap: one signed POST carrying at most a few dozen ids.
 */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/** Skip the beat entirely (unit tests / an intentionally isolated shard). */
export const HEARTBEAT_BYPASS = process.env.GGD_MATCH_HEARTBEAT_BYPASS === "1";

interface HeartbeatAck {
  status?: string;
  renewed?: string[];
  unknown?: string[];
  done?: string[];
  graceSecs?: number;
}

/** The live rooms this process is running, keyed by Colyseus room id. */
async function liveGameRoomIds(): Promise<string[]> {
  try {
    const rooms = await matchMaker.query({ name: "match" });
    return rooms.map((r) => r.roomId).filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch (err) {
    // The recording ids below still carry the beat; say it once so a permanent
    // failure here is not invisible.
    warnOnce(
      `${DEGRADE_KEY}-query`,
      "could not list live rooms from the matchmaker; match liveness is being reported from recordings only",
      err,
    );
    return [];
  }
}

/**
 * Assert once that every live match is still being played. Returns the ack when
 * the platform answered, null when it did not (nothing about the match changes
 * either way).
 */
export async function sendHeartbeat(sharedSecret: string): Promise<HeartbeatAck | null> {
  const gameRoomIds = await liveGameRoomIds();
  const matchIds = liveRecordingIds();
  if (gameRoomIds.length === 0 && matchIds.length === 0) {
    // Nothing is running. Deliberately still a no-op rather than an empty POST:
    // an idle shard has no liveness to assert, and the platform's pending set is
    // empty too.
    return null;
  }
  const body = JSON.stringify({ matchIds, gameRoomIds });
  const ts = String(Math.floor(Date.now() / 1000));
  try {
    const res = await fetch(`${PLATFORM_URL.replace(/\/$/, "")}/api/v1/internal/matches/heartbeat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-timestamp": ts,
        "x-internal-auth": sign(sharedSecret, ts, body),
      },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      warnOnce(
        DEGRADE_KEY,
        `platform refused the match liveness heartbeat (HTTP ${res.status}) — while this persists the platform ` +
          `judges matches on its BLIND deadline and may reap a live one` +
          (res.status === 401 ? "; a 401 means PLATFORM_GAME_SHARED_SECRET differs between the two processes" : ""),
      );
      return null;
    }
    const ack = (await res.json()) as HeartbeatAck;
    clearDegradation(DEGRADE_KEY);
    if (ack.unknown && ack.unknown.length > 0) {
      console.warn(
        `[liveness] the platform has no pending record for ${ack.unknown.length} match(es) we are running ` +
          `(${ack.unknown.join(", ")}) — they will settle into nothing`,
      );
    }
    return ack;
  } catch (err) {
    warnOnce(
      DEGRADE_KEY,
      "could not reach the platform to report match liveness — while this persists the platform judges " +
        "matches on its BLIND deadline and may reap a live one",
      err,
    );
    return null;
  }
}

/**
 * Start the periodic beat. Unref'd: liveness must never hold the process open.
 * Returns a stop function (tests).
 */
export function startMatchHeartbeat(sharedSecret: string): () => void {
  if (HEARTBEAT_BYPASS || !sharedSecret) {
    // Without a shared secret the platform cannot verify us and would reject
    // every beat; that is dev mode, where the operator is the only player.
    return () => {};
  }
  const timer = setInterval(() => {
    void sendHeartbeat(sharedSecret);
  }, HEARTBEAT_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
