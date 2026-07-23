/**
 * ct-s04 — the FANOUT guard for floating combat text (task #92).
 *
 * The four categories the request names are only as good as the wire. Two of
 * them (`heal` / `manaRestore`) are new sim events, and `MatchRoom.loop` fans
 * out sim events through an explicit ALLOWLIST — an event that is emitted but
 * not listed there is silently dropped, and the feature half-ships with no
 * error anywhere. That is exactly the failure this file exists to catch.
 *
 * The allowlist is now DATA — the `FANNED_OUT_EVENT_TYPES` set in
 * net/eventFanout, the single source of truth both MatchRoom and ReplayRoom
 * forward from (task #175 pulled it out of MatchRoom's inline `if` chain so the
 * replay could forward the EXACT same set). So the honest assertion is now
 * "the set contains these types", which fails loudly the moment someone drops a
 * row — and it covers the replay path too, not just the live room.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "../../../../packages/shared/testkit/cover";
import { FANNED_OUT_EVENT_TYPES } from "../net/eventFanout";

const restoreSrc = readFileSync(
  join(__dirname, "../../../../packages/shared/src/sim/combat/restore.ts"),
  "utf8",
);

describe("combat-text event fanout (ct-s04)", () => {
  it("every event sim/combat/restore emits is on the fanout allowlist", () => {
    cover("combat-text-fanout");
    // whatever restore.ts emits, both the live room AND the replay must forward
    // — derived from the source, so adding a third restore event without wiring
    // it fails here
    const emitted = [...restoreSrc.matchAll(/world\.emit\("([a-zA-Z]+)"/g)].map((m) => m[1]!);
    expect(new Set(emitted)).toEqual(new Set(["heal", "manaRestore"]));
    for (const type of emitted) {
      expect(FANNED_OUT_EVENT_TYPES.has(type)).toBe(true);
    }
  });

  it("the damage event that carries 造成/受到傷害 is still fanned out", () => {
    cover("combat-text-fanout");
    // 造成傷害 and 受到傷害 are the SAME event split client-side by who you
    // are, so losing this one row silently kills two of the four categories
    expect(FANNED_OUT_EVENT_TYPES.has("damage")).toBe(true);
  });

  it("passive regen is never emitted, so the fanout cannot become a 30 Hz stream", () => {
    cover("combat-text-fanout");
    const regen = readFileSync(
      join(__dirname, "../../../../packages/shared/src/sim/systems/RegenSystem.ts"),
      "utf8",
    );
    expect(regen).not.toContain("emit(");
  });
});
