/**
 * 變身 FORM BITS on the wire (task #249, wave G2) + the ENTITY_FLAG BIT BUDGET.
 *
 * ---------------------------------------------------------------------------
 * WHY THE BUDGET IS A TEST AND NOT JUST A COMMENT
 * ---------------------------------------------------------------------------
 * `EntityState.flags` is a **uint16** — 16 bits, not extensible. Two features
 * have already collided here: #244 黑泥吞噬 and #247 leap both authored 512, and
 * the unmerged side had to move (see `ENTITY_FLAG.AIRBORNE`'s own note). A
 * comment saying "these bits are free" is exactly the artefact that failed the
 * first two times, because nobody re-reads it while adding a flag. These tests
 * fail the build instead:
 *
 *   · every flag is a distinct power of two,
 *   · every flag fits inside uint16,
 *   · the FREE list is disjoint from the used ones and complete.
 *
 * A third collision cannot be silent again: the two features would then share a
 * bit, and a live client would render a champion as transformed because it is
 * burning — with no error anywhere.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ENTITY_FLAG,
  ENTITY_FLAG_FREE_BITS,
  formFlagsForIndex,
  formIndexFromFlags,
  growthTierFromFlags,
} from "./schema";

const UINT16_MAX = 0xffff;

describe("formIndexFromFlags — the client's only 變身 read", () => {
  it("decodes the four ordinals", () => {
    expect(formIndexFromFlags(0)).toBe(0);
    expect(formIndexFromFlags(ENTITY_FLAG.FORM_A)).toBe(1);
    expect(formIndexFromFlags(ENTITY_FLAG.FORM_B)).toBe(2);
    expect(formIndexFromFlags(ENTITY_FLAG.FORM_A | ENTITY_FLAG.FORM_B)).toBe(3);
  });

  it("FORM_B alone is 2, not 'tier 1 with extra' — a form is a NUMBER, not a threshold", () => {
    // The neighbouring `growthTierFromFlags` IS a threshold ladder (high bit
    // wins, low bit implied). Copying that shape here would silently collapse
    // form 2 onto form 1. This is the test that would have caught it.
    expect(formIndexFromFlags(ENTITY_FLAG.FORM_B)).not.toBe(
      formIndexFromFlags(ENTITY_FLAG.FORM_A),
    );
    expect(growthTierFromFlags(ENTITY_FLAG.MUD_BOSS)).toBe(2); // the ladder, for contrast
  });

  it("ignores every unrelated bit — a burning, airborne, tier-2 alternate is still form 1", () => {
    const noise =
      ENTITY_FLAG.BURNING |
      ENTITY_FLAG.AIRBORNE |
      ENTITY_FLAG.MUD_SWELL |
      ENTITY_FLAG.MUD_BOSS |
      ENTITY_FLAG.STUNNED |
      ENTITY_FLAG.CASTING;
    expect(formIndexFromFlags(noise)).toBe(0);
    expect(formIndexFromFlags(noise | ENTITY_FLAG.FORM_A)).toBe(1);
  });

  it("does not disturb the growth read, and the growth read does not disturb it", () => {
    const both = ENTITY_FLAG.FORM_A | ENTITY_FLAG.MUD_BOSS | ENTITY_FLAG.MUD_SWELL;
    expect(formIndexFromFlags(both)).toBe(1);
    expect(growthTierFromFlags(both)).toBe(2);
  });

  it("round-trips through formFlagsForIndex, which is the snapshot's encoder", () => {
    for (const i of [0, 1, 2, 3]) {
      expect(formIndexFromFlags(formFlagsForIndex(i))).toBe(i);
    }
    // an out-of-range index clamps to the BASE body rather than emitting a bit
    // pattern the decoder cannot name (a body the client cannot resolve is the
    // one thing that must never ride the wire).
    for (const bad of [-1, 4, 99, 1.5, Number.NaN]) {
      expect(formFlagsForIndex(bad)).toBe(0);
      expect(formIndexFromFlags(formFlagsForIndex(bad))).toBe(0);
    }
  });

  it("the encoder writes ONLY the two form bits", () => {
    for (const i of [0, 1, 2, 3]) {
      const written = formFlagsForIndex(i);
      expect(written & ~(ENTITY_FLAG.FORM_A | ENTITY_FLAG.FORM_B)).toBe(0);
    }
  });
});

describe("ENTITY_FLAG bit budget — uint16, and the third collision must not be silent", () => {
  const values = Object.values(ENTITY_FLAG) as number[];

  it("every flag is a distinct power of two inside uint16", () => {
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(UINT16_MAX);
      expect(v & (v - 1)).toBe(0); // exactly one bit set
    }
  });

  it("the declared FREE bits are genuinely free, and the two lists together fill uint16", () => {
    const used = values.reduce((a, b) => a | b, 0);
    for (const free of ENTITY_FLAG_FREE_BITS) {
      expect(used & free).toBe(0);
      expect(free & (free - 1)).toBe(0);
      expect(free).toBeLessThanOrEqual(UINT16_MAX);
    }
    const free = (ENTITY_FLAG_FREE_BITS as readonly number[]).reduce((a, b) => a | b, 0);
    // No gap and no overlap: if a flag is added without deleting its bit from
    // the FREE list, this fails; if one is removed without returning its bit,
    // this fails too. The budget can only be wrong loudly.
    expect(used | free).toBe(UINT16_MAX);
    expect(used & free).toBe(0);
  });

  it("FORM_A / FORM_B are 4096 / 8192 — the literals the wire is pinned to", () => {
    // Pinned because both halves (server encoder, client decoder) are compiled
    // separately and a renumber would desync a client mid-match with no error.
    expect(ENTITY_FLAG.FORM_A).toBe(4096);
    expect(ENTITY_FLAG.FORM_B).toBe(8192);
    // 隱形原語 took 16384 (INVISIBLE) and 精英小怪 took 32768 (MOB_ELITE), so the
    // budget is EXHAUSTED — the next feature must widen the field or claim its
    // own channel. (This comment used to say 「ONE bit is left」 while the line
    // under it asserted the list was empty: GH#285's exact shape, inside the
    // guard for it.)
    expect(ENTITY_FLAG_FREE_BITS).toEqual([]);
  });

  /**
   * …AND CLAUDE.md HAS TO AGREE (GH#285).
   *
   * The budget above was already guarded on the CODE side, loudly, in this very
   * file. It still went wrong where it mattered: `CLAUDE.md` — the document
   * everybody is told to read FIRST — went on saying 「目前剩 16384 / 32768 兩格」
   * for months after both were taken. Nothing read that sentence, so nothing
   * could contradict it. This does.
   */
  it("CLAUDE.md's ENTITY_FLAG sentence agrees with ENTITY_FLAG_FREE_BITS", () => {
    const doc = readFileSync(
      fileURLToPath(new URL("../../../../CLAUDE.md", import.meta.url)),
      "utf8",
    );
    const line = doc.split("\n").find((l) => l.includes("ENTITY_FLAG"));
    expect(line, "CLAUDE.md no longer mentions ENTITY_FLAG at all — the bit budget is the kind " +
      "of irreversible constraint that has to stay in the rules, not only in a schema comment")
      .toBeDefined();
    const claimsExhausted = /用光|用盡|沒有了|空陣列|zero|exhaust/i.test(doc.slice(doc.indexOf(line!), doc.indexOf(line!) + 600));
    expect(
      claimsExhausted,
      `ENTITY_FLAG_FREE_BITS has ${ENTITY_FLAG_FREE_BITS.length} bit(s) left, but CLAUDE.md says:\n` +
        `  ${line!.trim()}\n` +
        "When the budget is empty CLAUDE.md must say so; when bits come back (only by WIDENING the " +
        "field) it must say how many. A rule nobody can falsify is the thing GH#285 was about.",
    ).toBe(ENTITY_FLAG_FREE_BITS.length === 0);
  });
});
