/**
 * Guards the guard. `readStarterRoster` exists so suites stop reading the
 * gitignored operator whitelist (`data/curation/whitelist.json`) — a read that
 * worked on one machine and threw ENOENT everywhere else, turning
 * castabilitySweep.test.ts into a permanent "1 skipped".
 *
 * The replacement only helps if its two properties hold: the tracked block is
 * really there, and a starter.go that stops declaring it FAILS LOUDLY instead of
 * yielding an empty roster (an empty roster sweeps nothing while staying green,
 * which is the same disease under a new name).
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { goStringSlice, readStarterRoster, STARTER_GO_REL } from "./starterRoster";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../.."); // testkit -> repo root

/**
 * The pinned roster size. A RATCHET, not a fact of nature: it moves only when
 * the owner genuinely opens or closes heroes, and moving it is the signal that
 * the rest of the roster's obligations (bindings.ts rows, a voice pack, the
 * store price) have to be checked too.
 *
 * 48 (#138) → 50 (#212) → 51 (GH#29 喪標麥可) → 53 (owner 2026-07-30: 白木卡迪那
 * `godie-e00s` #70 and 傑富力士 `godie-ucrl` #06, both as the BASE body per R6).
 */
const ROSTER_SIZE = 53;

describe("tracked first open roster", () => {
  it("parses 53 unique ids out of the committed starter.go", () => {
    const ids = readStarterRoster(ROOT);
    expect(ids.length, `${STARTER_GO_REL} must declare the pinned ${ROSTER_SIZE}`).toBe(ROSTER_SIZE);
    expect(new Set(ids).size).toBe(ROSTER_SIZE);
    for (const id of ids) expect(id).toMatch(/^godie-[a-z0-9]+$/);
  });

  it("throws when the block is gone, rather than returning an empty roster", () => {
    expect(() => goStringSlice("package curation\n", "starterChampions")).toThrow(
      /no longer declares/,
    );
    expect(() => readStarterRoster("/nonexistent-root")).toThrow(/cannot read the tracked/);
  });

  it("drops `//` annotations so prose quotes cannot leak in as ids", () => {
    const src = 'x = []string{\n\t"godie-a", // kept the "real" one\n\t"godie-b",\n\t}\n';
    expect(goStringSlice(src, "x")).toEqual(["godie-a", "godie-b"]);
  });
});
