/**
 * sec-mailbox-01: the buffered-command cap in InputMailbox (DoS: unbounded
 * command accumulation / O(N)-per-tick event-loop stall). drain() hands the
 * whole buffer to one synchronous tick, so the buffer must never grow without
 * bound — excess commands past MAX_BUFFERED_COMMANDS are dropped, across a
 * single huge message AND across many messages between drains.
 */
import { describe, it, expect } from "vitest";
import type { Command } from "@ggd/shared/sim/intents";
import { InputMailbox, MAX_BUFFERED_COMMANDS } from "./InputMailbox";

const ready = (): Command => ({ kind: "ready" });

describe("InputMailbox buffered-command cap (sec-mailbox-01)", () => {
  it("truncates a single oversized message to the cap", () => {
    const mb = new InputMailbox();
    mb.push({ seq: 1, commands: Array.from({ length: 100_000 }, ready) });
    expect(mb.drain(0).commands.length).toBe(MAX_BUFFERED_COMMANDS);
  });

  it("caps the total buffered across many messages before a drain", () => {
    const mb = new InputMailbox();
    // 10 messages of 100 commands each = 1000 offered; only the cap is kept.
    for (let seq = 1; seq <= 10; seq++) {
      mb.push({ seq, commands: Array.from({ length: 100 }, ready) });
    }
    expect(mb.drain(0).commands.length).toBe(MAX_BUFFERED_COMMANDS);
  });

  it("a normal small batch is buffered intact", () => {
    const mb = new InputMailbox();
    mb.push({ seq: 1, commands: [ready(), ready(), ready()] });
    expect(mb.drain(0).commands).toHaveLength(3);
  });

  it("drain empties the buffer so the next tick starts fresh", () => {
    const mb = new InputMailbox();
    mb.push({ seq: 1, commands: Array.from({ length: 100_000 }, ready) });
    mb.drain(0);
    expect(mb.drain(1).commands).toHaveLength(0);
  });
});
