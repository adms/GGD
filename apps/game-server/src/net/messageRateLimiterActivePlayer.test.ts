/**
 * sec-rate-01 (regression) — the 2:42 combat-freeze root cause.
 *
 * The per-session INPUT rate limiter used to count `disconnectAfterDrops` as a
 * LIFETIME aggregate: `drops` only ever grew. A legitimately ACTIVE player whose
 * steady input rate merely brushes ABOVE the 90/s refill (e.g. ~93 msgs/s from
 * per-frame aim/order sends during a brawl) shed a couple of messages a second
 * and accumulated to the 300 threshold after a few minutes — booted MID-COMBAT
 * at a DETERMINISTIC elapsed time (~2:42). Once disconnected the client stops
 * receiving snapshots, so its countdown appears to FREEZE and the match "cannot
 * proceed" (戰鬥到 2:42 會停止倒數並且無法進行下去).
 *
 * The fix makes `disconnectAfterDrops` count CONSECUTIVE drops: any processed
 * message resets the streak. A merely-active player always gets messages through
 * (90/s of them), so the streak never reaches the threshold; only a saturating
 * flood — nothing getting through — is booted.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { MessageRateLimiter, DEFAULT_INPUT_POLICY } from "./messageRateLimiter";

describe("MessageRateLimiter — active player never booted (sec-rate-01 / 2:42 freeze)", () => {
  it("a legit client steadily just ABOVE the refill is NEVER disconnected over a long combat", () => {
    cover("sec-rate-01");
    // ~93 msgs/s (just above the 90/s refill) — the exact regime that used to
    // trip the disconnect at ~2:42. Drive SIX minutes of steady input.
    const rl = new MessageRateLimiter(DEFAULT_INPUT_POLICY);
    const dtMs = 1000 / 93;
    let now = 0;
    let disconnected = false;
    let drops = 0;
    for (let i = 0; i < 93 * 360 && !disconnected; i++) {
      now += dtMs;
      const v = rl.check("legit", now);
      if (v === "disconnect") disconnected = true;
      else if (v === "drop") drops++;
    }
    expect(disconnected).toBe(false); // pre-fix: disconnected ~209s in at 92/s, sooner at 93/s
    expect(drops).toBeGreaterThan(0); // it DID shed some (it is above refill) — just never booted
  });

  it("an accepted message RESETS the consecutive-drop streak", () => {
    cover("sec-rate-01");
    const rl = new MessageRateLimiter({ capacity: 1, refillPerSec: 1000, disconnectAfterDrops: 3 });
    expect(rl.check("s", 0)).toBe("ok"); // spend the token, streak 0
    expect(rl.check("s", 0)).toBe("drop"); // streak 1
    expect(rl.check("s", 0)).toBe("drop"); // streak 2 (one short of the trip)
    // 1ms later a token refills → an accepted message clears the streak. Pre-fix
    // the very next drop (lifetime #3) would have tripped a disconnect here.
    expect(rl.check("s", 1)).toBe("ok"); // streak reset to 0
    expect(rl.check("s", 1)).toBe("drop"); // streak 1 (NOT disconnect)
    expect(rl.check("s", 1)).toBe("drop"); // streak 2
    expect(rl.check("s", 1)).toBe("disconnect"); // 3 in a row AFTER the reset → trip
  });

  it("a saturating flood (nothing gets through) is STILL disconnected", () => {
    cover("sec-rate-01");
    // 5000 messages in one instant: after the 120 burst, no refill happens between
    // them, so every remaining message is a consecutive drop → the abuser is booted.
    const rl = new MessageRateLimiter(DEFAULT_INPUT_POLICY);
    let disconnected = false;
    for (let i = 0; i < 5000 && !disconnected; i++) {
      if (rl.check("flood", 1000) === "disconnect") disconnected = true;
    }
    expect(disconnected).toBe(true);
  });
});
