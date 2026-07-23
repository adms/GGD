/**
 * Per-session inbound-message rate limiter (token bucket).
 *
 * MatchRoom.onMessage applied NO rate limit: a client could flood MSG.INPUT to
 * pin the sim event loop / grow the mailbox unbounded (availability / DoS).
 * A legit client sends about one INPUT per 30 Hz tick (~30/s) plus the odd
 * shop / select message, so a bucket of `capacity` burst tokens refilling at
 * `refillPerSec` (a few × tickrate) has ample headroom while a flood is shed.
 *
 * The verdict is one of:
 *   • "ok"         — a token was available; process the message.
 *   • "drop"       — bucket empty; silently discard this message.
 *   • "disconnect" — the session has now dropped `disconnectAfterDrops`
 *                    messages IN A ROW (a sustained flood — a single processed
 *                    message resets the streak); the caller should boot it.
 *
 * Pure of Colyseus — takes a session-id string and an injectable clock — so it
 * unit-tests deterministically without a socket.
 */
export interface RateLimitPolicy {
  /** Burst size — the most messages accepted back-to-back from a cold bucket. */
  capacity: number;
  /** Sustained refill rate (tokens per second). */
  refillPerSec: number;
  /**
   * CONSECUTIVE dropped-message count that trips a disconnect — a sustained
   * flood with no successfully-processed message in between (any "ok" resets the
   * streak). NOT a lifetime aggregate, so a merely-active legit client is never
   * booted, while a saturating flood still is.
   */
  disconnectAfterDrops: number;
}

/**
 * Default INPUT policy: 120 burst, 90/s sustained (3× the 30 Hz tick rate), and
 * a session is booted once it has thrown away 300 messages IN A ROW — a client
 * that keeps hammering with nothing getting through is abusive, not merely
 * bursty. (Any accepted message resets the streak, so a legitimately active
 * player whose rate only brushes the limit is throttled but never booted.)
 */
export const DEFAULT_INPUT_POLICY: RateLimitPolicy = {
  capacity: 120,
  refillPerSec: 90,
  disconnectAfterDrops: 300,
};

export type RateVerdict = "ok" | "drop" | "disconnect";

interface Bucket {
  tokens: number;
  last: number;
  drops: number;
}

export class MessageRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly policy: RateLimitPolicy = DEFAULT_INPUT_POLICY) {}

  /** Charge one token for `sessionId`; returns what the caller should do. */
  check(sessionId: string, now: number = Date.now()): RateVerdict {
    let b = this.buckets.get(sessionId);
    if (!b) {
      b = { tokens: this.policy.capacity, last: now, drops: 0 };
      this.buckets.set(sessionId, b);
    }
    // Refill for elapsed wall time (never negative if the clock jumps back).
    const elapsedSec = Math.max(0, (now - b.last) / 1000);
    b.tokens = Math.min(this.policy.capacity, b.tokens + elapsedSec * this.policy.refillPerSec);
    b.last = now;

    if (b.tokens >= 1) {
      b.tokens -= 1;
      // A PROCESSED message clears the consecutive-drop streak. `disconnectAfterDrops`
      // counts a SUSTAINED flood (drops with no successful send in between), NOT a
      // lifetime aggregate. Before this reset, `drops` only ever grew: a legitimately
      // ACTIVE player whose steady input rate merely brushes ABOVE `refillPerSec`
      // (e.g. ~93 msgs/s vs the 90/s refill) shed a couple of messages per second and
      // accumulated to the threshold after a few minutes — booted MID-COMBAT at a
      // deterministic elapsed time (~2:42). Once disconnected, the client stops
      // receiving snapshots, so its countdown appears to FREEZE and the match "cannot
      // proceed" — the reported game-breaker. An abuser that truly saturates the bucket
      // gets NO successful send between drops, so its streak still climbs to the
      // threshold and it is disconnected exactly as before (the flood test's burst,
      // sent in one instant with no refill in between, still trips it).
      b.drops = 0;
      return "ok";
    }
    b.drops += 1;
    return b.drops >= this.policy.disconnectAfterDrops ? "disconnect" : "drop";
  }

  /** Forget a session (call on leave) so buckets never accumulate unbounded. */
  forget(sessionId: string): void {
    this.buckets.delete(sessionId);
  }

  /** Live bucket count — for tests / diagnostics. */
  get trackedSessions(): number {
    return this.buckets.size;
  }
}
