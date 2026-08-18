/**
 * 迴避 sightings buffer (task #92b) — the net-layer half.
 *
 * `evade` is the one combat outcome the frame loop's event fanout cannot carry
 * to the presentation layer: it produces no damage packet, so nothing
 * downstream of the loop has a consumer for it. It is buffered here as FOUR
 * NUMBERS — no word, no colour, no styling — and drained by
 * ui/WorldAnchorLayer. These tests pin that boundary, because the moment the
 * net layer starts owning 「閃避」 the rule RoomStore's header states is gone.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { recordEvade, drainEvadeSightings, clearEvadeSightings } from "./RoomConnection";

const SRC = readFileSync(fileURLToPath(new URL("./RoomConnection.ts", import.meta.url)), "utf8");

beforeEach(() => clearEvadeSightings());

describe("迴避 sightings (ct-e05)", () => {
  it("records the four numbers the renderer needs, and a birth stamp", () => {
    cover("combat-text-density");
    recordEvade({ source: 7, target: 3, x: 12.5, z: -4 });
    const out = drainEvadeSightings();
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toBe(7);
    expect(out[0]!.target).toBe(3);
    expect(out[0]!.x).toBe(12.5);
    expect(out[0]!.z).toBe(-4);
    expect(out[0]!.atMs).toBeGreaterThan(0);
  });

  it("drains exactly once — a dodge is never drawn twice", () => {
    cover("combat-text-density");
    recordEvade({ source: 1, target: 2, x: 0, z: 0 });
    expect(drainEvadeSightings()).toHaveLength(1);
    expect(drainEvadeSightings()).toHaveLength(0);
  });

  it("a packet with no numeric target is dropped, not defaulted", () => {
    cover("combat-text-density");
    // entity 0 is a real id; a MISSING target must not silently become one
    recordEvade({ source: 1, x: 0, z: 0 });
    recordEvade({ target: "3", x: 0, z: 0 });
    expect(drainEvadeSightings()).toHaveLength(0);
  });

  it("a missing attacker stays undefined — it must not read as entity 0", () => {
    cover("combat-text-density");
    recordEvade({ target: 3, x: 0, z: 0 });
    const out = drainEvadeSightings();
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toBeUndefined();
    // and a missing position falls back to the origin rather than NaN
    expect(Number.isFinite(out[0]!.x)).toBe(true);
    expect(Number.isFinite(out[0]!.z)).toBe(true);
  });

  it("couch play: N connections in one room see one dodge, not N", () => {
    cover("combat-text-density");
    // net/MultiSession joins the SAME room once per local seat, so every
    // MSG.EVENT arrives once per connection.
    for (let i = 0; i < 4; i++) recordEvade({ source: 1, target: 3, x: 2, z: 2 });
    expect(drainEvadeSightings()).toHaveLength(1);
  });

  it("distinct dodges in the same window are NOT collapsed", () => {
    cover("combat-text-density");
    recordEvade({ source: 1, target: 3, x: 0, z: 0 });
    recordEvade({ source: 1, target: 4, x: 0, z: 0 }); // other defender
    recordEvade({ source: 2, target: 3, x: 0, z: 0 }); // other attacker
    expect(drainEvadeSightings()).toHaveLength(3);
  });

  it("is bounded — an undrained buffer cannot grow without limit", () => {
    cover("combat-text-density");
    for (let i = 0; i < 500; i++) recordEvade({ source: i, target: 1000 + i, x: 0, z: 0 });
    const out = drainEvadeSightings();
    expect(out.length).toBeLessThanOrEqual(32);
    // the SURVIVORS are the newest — a stale dodge is worse than a dropped one
    expect(out[out.length - 1]!.target).toBe(1499);
  });

  it("GUARD: the net layer still owns no UI copy and no ui/ import", () => {
    cover("combat-text-density");
    // The whole reason this buffer exists instead of a `pushCombatText` call in
    // the socket callback. If a future edit reaches for the renderer from here,
    // the layering rule stated in this file's own header is silently gone.
    expect(SRC).not.toMatch(/from\s+"\.\.\/ui\//);
    expect(SRC).not.toMatch(/from\s+"\.\.\/frameBus"/);
    expect(SRC).not.toContain("閃避");
    // ⭐ 2026-08-18：`immune` 接上來的時候「免疫」兩個字一度以 `recordEvade(…, "免疫")`
    // 的樣子住在這個檔裡，而這條守衛是綠的 —— 它只掃了**一個**詞。文案搬到
    // `ui/WorldAnchorLayer.EVADE_LABELS` 之後，把第二個詞也關起來。
    // ⚠️ 與上面那條一樣是**整個檔的純文字掃描**，連註解都算 —— 這是刻意的，
    // 而且是既有 `閃避` 那條就在做的事：一個「只有字串字面量不准」的版本要嘛
    // 需要一個真的 tokenizer，要嘛（實測過）會被 `can't` 的那一撇騙過去。
    // 代價是這個檔的註解要用英文講「immunity」，而那個代價很小。
    expect(SRC).not.toContain("免疫");
    expect(SRC).not.toContain("pushCombatText");
  });
});
