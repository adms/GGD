/**
 * ct-s04 — the FANOUT guard for floating combat text (task #92).
 *
 * The four categories the request names are only as good as the wire. Two of
 * them (`heal` / `manaRestore`) are new sim events, and `MatchRoom.loop` fans
 * out sim events through an explicit ALLOWLIST — an event that is emitted but
 * not listed there is silently dropped, and the feature half-ships with no
 * error anywhere. That is exactly the failure this file exists to catch.
 *
 * It reads the room source rather than booting a match because the allowlist is
 * a literal `if` chain, not data: the honest assertion is "the chain mentions
 * these types", and it fails loudly the moment someone rewrites the chain and
 * forgets a row.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "../../../../packages/shared/testkit/cover";

const matchRoomSrc = readFileSync(join(__dirname, "MatchRoom.ts"), "utf8");
const restoreSrc = readFileSync(
  join(__dirname, "../../../../packages/shared/src/sim/combat/restore.ts"),
  "utf8",
);

describe("combat-text event fanout (ct-s04)", () => {
  it("every event sim/combat/restore emits is on the MatchRoom allowlist", () => {
    cover("combat-text-fanout");
    // whatever restore.ts emits, the room must forward — derived from the
    // source, so adding a third restore event without wiring it fails here
    const emitted = [...restoreSrc.matchAll(/world\.emit\("([a-zA-Z]+)"/g)].map((m) => m[1]!);
    expect(new Set(emitted)).toEqual(new Set(["heal", "manaRestore"]));
    for (const type of emitted) {
      expect(matchRoomSrc).toContain(`ev.type === "${type}"`);
    }
  });

  it("the damage event that carries 造成/受到傷害 is still fanned out", () => {
    cover("combat-text-fanout");
    // 造成傷害 and 受到傷害 are the SAME event split client-side by who you
    // are, so losing this one row silently kills two of the four categories
    expect(matchRoomSrc).toContain('ev.type === "damage"');
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
