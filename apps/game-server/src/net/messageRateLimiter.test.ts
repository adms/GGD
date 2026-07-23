/**
 * sec-rate-01: the per-session inbound-message rate limiter (DoS: flood).
 * A legit client stays under budget; a flood is dropped and, past the strike
 * threshold, told to disconnect. Deterministic via an injected clock.
 */
import { describe, it, expect } from "vitest";
import { MessageRateLimiter, DEFAULT_INPUT_POLICY } from "./messageRateLimiter";

describe("MessageRateLimiter (sec-rate-01)", () => {
  it("passes a burst up to capacity, then drops", () => {
    const rl = new MessageRateLimiter({ capacity: 5, refillPerSec: 0, disconnectAfterDrops: 1000 });
    const now = 1_000;
    for (let i = 0; i < 5; i++) expect(rl.check("s", now)).toBe("ok");
    expect(rl.check("s", now)).toBe("drop");
    expect(rl.check("s", now)).toBe("drop");
  });

  it("escalates to disconnect after enough drops", () => {
    const rl = new MessageRateLimiter({ capacity: 1, refillPerSec: 0, disconnectAfterDrops: 3 });
    const now = 0;
    expect(rl.check("s", now)).toBe("ok"); // uses the single token
    expect(rl.check("s", now)).toBe("drop"); // drop #1
    expect(rl.check("s", now)).toBe("drop"); // drop #2
    expect(rl.check("s", now)).toBe("disconnect"); // drop #3 -> trip
  });

  it("refills over wall-clock time", () => {
    const rl = new MessageRateLimiter({ capacity: 2, refillPerSec: 10, disconnectAfterDrops: 1000 });
    expect(rl.check("s", 0)).toBe("ok");
    expect(rl.check("s", 0)).toBe("ok");
    expect(rl.check("s", 0)).toBe("drop"); // empty
    // 1s later => +10 tokens, capped at capacity 2
    expect(rl.check("s", 1000)).toBe("ok");
    expect(rl.check("s", 1000)).toBe("ok");
    expect(rl.check("s", 1000)).toBe("drop");
  });

  it("tracks sessions independently and forgets them", () => {
    const rl = new MessageRateLimiter({ capacity: 1, refillPerSec: 0, disconnectAfterDrops: 1000 });
    expect(rl.check("a", 0)).toBe("ok");
    expect(rl.check("b", 0)).toBe("ok"); // b has its own bucket
    expect(rl.trackedSessions).toBe(2);
    rl.forget("a");
    expect(rl.trackedSessions).toBe(1);
    expect(rl.check("a", 0)).toBe("ok"); // fresh bucket after forget
  });

  it("the default policy gives a legit ~30Hz client comfortable headroom", () => {
    const rl = new MessageRateLimiter(DEFAULT_INPUT_POLICY);
    // one message per 33ms for 2 seconds (~60 msgs) is well under budget
    let now = 0;
    let dropped = 0;
    for (let i = 0; i < 60; i++) {
      if (rl.check("s", now) !== "ok") dropped++;
      now += 33;
    }
    expect(dropped).toBe(0);
  });
});
