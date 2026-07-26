/**
 * WIRING GUARD — the ping chip is actually FED, and actually PAINTS (#272).
 *
 * WHY THIS FILE EXISTS, stated bluntly. `pingReadout.test.ts` next door builds
 * its own input objects and asserts a pure state machine; `versionBadgeBand`
 * asserts pure geometry. Both stay green, bit for bit, if somebody deletes:
 *   • `perfBus.netSnapshots = cs.snapshots;` — the chip then hides on EVERY
 *     screen forever and the whole task is undone with no test failing;
 *   • `perfBus.pingMs = cs.pingMs;` — the number freezes at 0;
 *   • `this.connStats.noteAck(...)` — no RTT is ever measured;
 *   • the `el.textContent = text` write in PingChip — the element mounts, the
 *     timer runs, and the chip is permanently blank.
 *
 * That is EXACTLY the shape this project hit seven times in one day (#259
 * spatial voice, #258, #271): the test tests a pure function, and what can be
 * deleted is the wiring. GameApp cannot be instantiated headlessly (Babylon
 * engine, canvas, sockets) and PingChip's paint path needs a live DOM + timer,
 * so this is a SOURCE scan — the instrument this repo already uses for exactly
 * this, in GameApp.batch1Wiring.test.ts.
 *
 * COMMENTS ARE STRIPPED FIRST, and that step is load-bearing: without it the
 * design notes in GameApp (which name every one of these lines) would satisfy
 * the assertions against a file where the code had been deleted and only the
 * explanation left behind.
 *
 * ⚠️ It uses `@ggd/shared/testkit/stripComments`, NOT the two-pass
 * `replace(block).replace(line)` idiom. GameApp line 489 reads
 * `// render/** may not read it …`, and the naive block pass treats that `/**`
 * as an opening delimiter and eats the next 231 lines — including
 * `connStats.noteSent(...)`. Read that module's doc before copying this file.
 *
 * Each assertion targets THE LINE THAT CARRIES THE FEATURE with its real
 * arguments — not a call signature both sides would keep either way.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { stripComments } from "@ggd/shared/testkit/stripComments";

const strip = (rel: string): string =>
  stripComments(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));

const GAME_APP = strip("../GameApp.ts");
const CHIP = strip("./PingChip.tsx");
const CHROME = strip("./GlobalChrome.tsx");

describe("the RTT estimator has live production callers (ping-chip-wiring)", () => {
  it("every input send is stamped, and every ack is measured", () => {
    cover("ping-chip-wiring");
    // Delete either of these and pingMs is 0 forever while ConnectionStats'
    // own unit tests stay green — they call noteSent/noteAck by hand.
    expect(
      GAME_APP,
      "GameApp must stamp each transmitted seq (sender.onSent → connStats.noteSent); without it " +
        "there is nothing to measure an ack against and ping is permanently 0",
    ).toMatch(/this\.connStats\.noteSent\(\s*msg\.seq\s*,\s*performance\.now\(\)\s*\)/);
    expect(
      GAME_APP,
      "GameApp must measure RTT off the authoritative seat's lastAckSeq",
    ).toMatch(/this\.connStats\.noteAck\(\s*seat\.lastAckSeq\s*,\s*nowMs\s*\)/);
    // and the snapshot cadence, which is what makes 「斷」 detectable at all
    expect(GAME_APP).toMatch(/this\.connStats\.noteSnapshot\(\s*nowMs\s*\)/);
  });

  it("the per-frame sampler publishes the number AND its provenance", () => {
    cover("ping-chip-wiring");
    for (const [line, consequence] of [
      ["perfBus.pingMs = cs.pingMs;", "the chip's number freezes at 0"],
      ["perfBus.jitterMs = cs.jitterMs;", "the 抖動 half of the readout is永遠 0"],
      ["perfBus.snapshotGapMs = cs.snapshotGapMs;", "「斷線 N.Ns」 can never count up"],
      ["perfBus.pingSamples = cs.pingSamples;", "the chip can never leave 「量測中」"],
      ["perfBus.pingAgeMs = cs.pingAgeMs;", "a frozen ping is never labelled 停滯"],
      ["perfBus.netSnapshots = cs.snapshots;", "THE CHIP IS HIDDEN ON EVERY SCREEN, FOREVER"],
    ] as const) {
      expect(
        GAME_APP.includes(line),
        `GameApp.samplePerf must write \`${line}\` — delete it and ${consequence}, with every ` +
          "other test in this repo still green",
      ).toBe(true);
    }
  });

  it("a replay declares itself, and teardown forgets the dead match", () => {
    cover("ping-chip-wiring");
    // without this the replay page reads 「量測中」 forever (no ack can exist)
    expect(GAME_APP).toMatch(/perfBus\.netMode = "replay";[\s\S]{0,200}?this\.sessions\.connectReplay\(/);
    // …and without the reset, the lobby after a match keeps the dead match's
    // snapshot count and shows 斷線 with an ever-growing gap
    expect(GAME_APP).toMatch(/this\.connStats\.reset\(\);/);
    expect(GAME_APP).toMatch(/perfBus\.netSnapshots = 0;/);
    expect(GAME_APP).toMatch(/perfBus\.netMode = "live";/);
  });
});

describe("the chip actually paints what it reads (ping-chip-wiring)", () => {
  it("GlobalChrome renders it — the ubiquity claim, on both render trees", () => {
    cover("ping-chip-everywhere");
    // The one-line deletion that removes the feature from every screen at once.
    // (./globalChrome.test.ts additionally proves BOTH root.render trees mount
    // GlobalChrome, so this covers the replay page too.)
    expect(CHROME).toMatch(/import\s*\{\s*PingChip\s*\}\s*from\s*["']\.\/PingChip["']/);
    expect(CHROME).toContain("<PingChip />");
  });

  it("the sampler reads the REAL bus and writes the REAL DOM node", () => {
    cover("ping-chip-wiring");
    // reads the live bus (not a prop, not a stub) …
    expect(CHIP).toMatch(/pingChipState\(\{[\s\S]{0,400}?netSnapshots:\s*perfBus\.netSnapshots/);
    expect(CHIP).toMatch(/pingMs:\s*perfBus\.pingMs/);
    // … and writes text into the mounted element. THIS is the line whose
    // deletion leaves a mounted, correctly-styled, permanently EMPTY chip.
    expect(
      CHIP,
      "PingChip must write the resolved label into the element (el.textContent = text)",
    ).toMatch(/if \(el\.textContent !== text\) el\.textContent = text;/);
    expect(CHIP).toMatch(/el\.style\.color = state\.color;/);
    // the visibility toggle is the other half: a chip that never unhides is the
    // same defect wearing a different hat
    expect(CHIP).toMatch(/el\.style\.display = "block";/);
    expect(CHIP).toMatch(/el\.style\.display = "none";/);
  });

  it("it re-samples on a timer, and cleans it up", () => {
    cover("ping-chip-wiring");
    // perfBus is a plain mutable object — nothing notifies. Without an interval
    // the chip paints once at mount (when there is no match yet) and never again.
    expect(CHIP).toMatch(/setInterval\(paint, PING_SAMPLE_MS\)/);
    expect(CHIP).toMatch(/return \(\) => clearInterval\(id\);/);
    // and it does NOT put per-sample data through React (the perfBus rule)
    expect(
      /useState/.test(CHIP),
      "the ping sampler must not hold per-sample React state — FpsPill already runs a 4Hz " +
        "setState in-match, and this chip is on the login screen too",
    ).toBe(false);
  });

  it("it honours the Show ping setting — the switch that used to be dead", () => {
    cover("ping-chip-wiring");
    expect(CHIP).toMatch(/useSettings\(\(s\) => s\.network\.showPing\)/);
    expect(CHIP).toMatch(/showPing:\s*showRef\.current/);
  });
});
