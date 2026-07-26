/**
 * WIRING GUARD — the sim-health counter has LIVE production callers (#272).
 *
 * WHY THIS FILE EXISTS, stated bluntly. `tickHealth.test.ts` next door
 * constructs its own `new TickHealth()`, feeds it by hand and asserts the
 * arithmetic. Every one of those assertions stays green if somebody deletes
 * `tickHealth.noteShed(...)` and `tickHealth.noteTick(...)` from
 * rooms/MatchRoom.ts — the counter would simply never be fed, /healthz would
 * report an eternal zero, and the whole task would be undone with the suite
 * bit-for-bit green. That is the exact failure shape this project hit seven
 * times in one day (#259 spatial voice, #258, #271): the TEST tests a pure
 * function, and what can be deleted is the WIRING.
 *
 * MatchRoom cannot be instantiated headlessly (it extends Colyseus `Room`,
 * needs a transport, a driver and a live seat map), and /healthz is a
 * `node:http` handler wired at module scope in a file that boots a whole game
 * server on import. So this is a SOURCE scan — the same instrument, and for the
 * same reason, as GameApp.batch1Wiring.test.ts.
 *
 * COMMENTS ARE STRIPPED FIRST. Without that step the prose in this very
 * paragraph (and the design notes in MatchRoom) would satisfy the assertions,
 * and the guard would pass against a file where the calls had been deleted and
 * only their explanation left behind. This is not hypothetical — the stripping
 * step is what makes the batch-1 guard real, and it is copied here verbatim.
 *
 * Each assertion below targets THE LINE THAT CARRIES THE FEATURE, not a call
 * signature both sides would keep: the counter call with its real argument, the
 * timing pair around `this.ctl.tick()`, and the `sim:` key in the healthz body.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { stripComments } from "../../../../packages/shared/testkit/stripComments";

/**
 * Source with comments stripped, so prose can never satisfy an assertion.
 *
 * ⚠️ NOT the two-pass `replace(block).replace(line)` idiom: a `//` comment
 * containing a glob like `sim/**` opens a phantom block comment that eats real
 * code until the next `*​/`. See the stripComments module doc — it cost this
 * project a false guard result while #272 was being written.
 */
const strip = (rel: string): string =>
  stripComments(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));

const MATCH_ROOM = strip("../rooms/MatchRoom.ts");
const INDEX = strip("../index.ts");

describe("the sim-health counter is actually fed by the room loop (tick-health-wiring)", () => {
  it("MatchRoom imports the counter — not a local re-implementation", () => {
    cover("tick-health-wiring");
    expect(MATCH_ROOM).toMatch(
      /import\s*\{[^}]*\btickHealth\b[^}]*\}\s*from\s*["']\.\.\/match\/tickHealth["']/,
    );
  });

  it("the shed branch feeds noteShed with the REAL dropped count", () => {
    cover("tick-health-wiring");
    // `plan.droppedTicks` is the load-bearing argument. Passing a literal, or
    // passing `plan.dropped` (a boolean), would make the totals meaningless
    // while still "calling the counter" — so the argument is pinned, not just
    // the call.
    expect(
      MATCH_ROOM,
      "MatchRoom.loop must call tickHealth.noteShed(matchId, plan.droppedTicks, …) inside the " +
        "`if (plan.dropped)` branch — without it /healthz reports 0 sheds forever and #272 is undone",
    ).toMatch(/tickHealth\.noteShed\(\s*this\.ctl\.matchId\s*,\s*plan\.droppedTicks\s*,/);
    // and it is really under the shed branch, not somewhere harmless
    expect(MATCH_ROOM).toMatch(/if\s*\(plan\.dropped\)\s*\{[\s\S]{0,600}?tickHealth\.noteShed\(/);
  });

  it("the console.warn is THROTTLED through the counter, not unconditional", () => {
    cover("tick-health-wiring");
    // #272 also fixes the flood: the pre-existing warn had no throttle at all.
    // The gate must be the boolean noteShed returns.
    expect(MATCH_ROOM).toMatch(/const\s+loud\s*=\s*tickHealth\.noteShed\(/);
    expect(MATCH_ROOM).toMatch(/if\s*\(loud\)\s*console\.warn\(\s*formatShedLog\(/);
    // the old unconditional warn must be gone: a bare console.warn of the #46
    // sentence inside loop() is the regression this asserts against.
    expect(
      /console\.warn\(\s*\n?\s*`\[match \$\{this\.ctl\.matchId\}\] sim fell behind/.test(MATCH_ROOM),
      "the unthrottled shed warn came back",
    ).toBe(false);
  });

  it("every executed tick is TIMED — the signal sheds cannot see", () => {
    cover("tick-health-wiring");
    // The pair must bracket the real tick call. A `noteTick(0)` or a call
    // outside the loop would keep the percentiles green and meaningless.
    expect(MATCH_ROOM).toMatch(/const\s+tickStartedMs\s*=\s*performance\.now\(\);/);
    expect(
      MATCH_ROOM,
      "the per-tick cost must be measured around this.ctl.tick() — deleting this line makes " +
        "p50/p95/p99 a permanent 0 and hides the 'always slightly late' failure mode entirely",
    ).toMatch(
      /phase\s*=\s*this\.ctl\.tick\(\);\s*tickHealth\.noteTick\(\s*performance\.now\(\)\s*-\s*tickStartedMs\s*\);/,
    );
    // …and inside the catch-up burst, i.e. per TICK, not per frame
    expect(MATCH_ROOM).toMatch(
      /for\s*\(let step = 0; step < plan\.steps; step\+\+\)\s*\{[\s\S]{0,600}?tickHealth\.noteTick\(/,
    );
  });

  it("/healthz publishes the snapshot beside rooms — the operator-facing channel", () => {
    cover("tick-health-healthz");
    expect(INDEX).toMatch(
      /import\s*\{[^}]*\btickHealth\b[^}]*\}\s*from\s*["']\.\/match\/tickHealth["']/,
    );
    // the key AND the call: `sim: {}` would be a lie that still parses
    expect(
      INDEX,
      "/healthz must render `sim: tickHealth.snapshot()` — it is the only place tick health is " +
        "readable without shelling into the container and grepping logs",
    ).toMatch(/sim:\s*tickHealth\.snapshot\(\)/);
    // and it is inside the /healthz body, next to the other three blocks
    expect(INDEX).toMatch(
      /rooms:\s*roomRegistry\.stats\(\),\s*sim:\s*tickHealth\.snapshot\(\),\s*platform:/,
    );
  });

  it("the clamp's BEHAVIOUR is untouched — #272 is observation only", () => {
    cover("tick-health-wiring");
    const tickLoop = strip("./tickLoop.ts");
    // owner's constraint: 「不要改 clamp 本身的行為」. The two numbers that decide
    // behaviour must still be exactly what #46 shipped.
    expect(tickLoop).toMatch(/export const MAX_CATCHUP_TICKS = 5;/);
    expect(tickLoop).toMatch(/while \(acc >= tickMs && steps < maxCatchup\)/);
    // the carried accumulator after a shed is still exactly `acc % tickMs`
    expect(tickLoop).toMatch(/const rem = acc % tickMs;/);
    expect(tickLoop).toMatch(/acc = rem;/);
    // …and the count is derived from that same remainder, so it can never
    // disagree with what the shed actually threw away
    expect(tickLoop).toMatch(/droppedTicks = Math\.round\(\(acc - rem\) \/ tickMs\);/);
  });
});
