/**
 * Batch-1 visible-correctness wiring guard (1B-1 + 1B-2). GameApp drives the
 * canvas imperatively and cannot be instantiated headlessly (Babylon engine,
 * sockets, render seam), so — in the same spirit as architecture.test.ts —
 * this is a SOURCE scan that pins the two callers the plan found were missing.
 * Their whole failure mode was "dead code the internal unit tests still passed
 * for": StatusAuraFx and enemyUnitsFor were green in isolation, but nothing in
 * the frame loop ever CALLED them for the champions / neutrals that needed it.
 *
 *   · 1B-1  the per-frame champion pass registers each live champion's flags
 *           with the status-aura layer, so a stun/root/slow finally reads on the
 *           body (`vfx.statusFx.set(...)` had ZERO production callers before);
 *   · 1B-2  the enemy pick list admits the neutral objectives (guardian tower +
 *           harvest flower), so a human can click / attack-move / auto-acquire
 *           them — not just bots via direct AI orders.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";

/** GameApp source with comments stripped, so prose can't satisfy the assertions. */
const SRC = readFileSync(fileURLToPath(new URL("./GameApp.ts", import.meta.url)), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

describe("1B-1 status-aura layer has a live per-frame caller (status-aura-wiring)", () => {
  it("the frame loop feeds each champion's flags into vfx.statusFx.set", () => {
    cover("status-aura-wiring");
    // the exact caller the plan said was absent (grep count was 0 in production)
    expect(SRC).toMatch(/this\.vfx\.statusFx\.set\(\s*es\.id\s*,\s*es\.flags\s*,/);
  });

  it("only registers auras for LIVE champions (dead bodies stay quiet)", () => {
    cover("status-aura-wiring");
    // the guard immediately above the set() call gates on champion + alive
    expect(SRC).toMatch(/es\.kind !== KIND_CHAMPION \|\| !es\.alive\)\s*return;\s*const p = this\.views\.posOf/);
  });
});

describe("1B-2 neutral objectives are pickable enemy units (neutral-pick-wiring)", () => {
  it("enemyUnitsFor admits guardians and flowers, not just kind 0", () => {
    cover("neutral-pick-wiring");
    // the old gate `es.kind !== 0` filtered BOTH neutrals out of every pick path
    expect(SRC).not.toMatch(/if \(es\.kind !== 0 \|\| !es\.alive\) return;/);
    // the widened gate keeps champions AND the two neutral kinds
    expect(SRC).toMatch(/es\.kind !== KIND_CHAMPION && es\.kind !== KIND_GUARDIAN && es\.kind !== KIND_FLOWER/);
  });
});
