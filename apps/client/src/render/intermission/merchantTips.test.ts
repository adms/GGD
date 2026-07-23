/**
 * merchantTips (task #148) — the rotating shop-tips box's one sharp rule:
 * random, but NEVER the same tip twice in a row. A naïve draw repeats ~1/n of
 * the time and reads as "the box froze"; `nextTipIndex` makes an immediate
 * repeat impossible by construction. These tests pin that, plus that the
 * rotation still reaches every tip (it isn't stuck on a subset) and that the
 * content pool is well-formed.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { MERCHANT_TIPS, TIP_KIND_META, nextTipIndex, type MerchantTipKind } from "./merchantTips";

/** Deterministic LCG so the rotation is reproducible under test. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("merchant tips rotation (#148)", () => {
  it("never shows the same tip twice in a row, over a long random run", () => {
    cover("intermission-tips");
    const count = MERCHANT_TIPS.length;
    const rand = lcg(12345);
    let cur = nextTipIndex(-1, count, rand);
    expect(cur).toBeGreaterThanOrEqual(0);
    expect(cur).toBeLessThan(count);
    for (let i = 0; i < 5000; i++) {
      const next = nextTipIndex(cur, count, rand);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(count);
      expect(next, "an immediate repeat slipped through").not.toBe(cur);
      cur = next;
    }
  });

  it("still reaches EVERY tip — the rotation isn't stuck on a subset", () => {
    cover("intermission-tips");
    const count = MERCHANT_TIPS.length;
    const rand = lcg(97);
    const seen = new Set<number>();
    let cur = nextTipIndex(-1, count, rand);
    seen.add(cur);
    for (let i = 0; i < 5000; i++) {
      cur = nextTipIndex(cur, count, rand);
      seen.add(cur);
    }
    expect(seen.size).toBe(count);
  });

  it("advances every step (the index always changes) for count > 1", () => {
    cover("intermission-tips");
    // sweep the whole rand range so we hit every branch of the skip-over
    for (const r of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.999999]) {
      for (let cur = 0; cur < MERCHANT_TIPS.length; cur++) {
        const next = nextTipIndex(cur, MERCHANT_TIPS.length, () => r);
        expect(next).not.toBe(cur);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(MERCHANT_TIPS.length);
      }
    }
  });

  it("picks any tip from a fresh start, and is crash-safe at the edges", () => {
    cover("intermission-tips");
    const count = MERCHANT_TIPS.length;
    // a fresh start (current < 0) can land on index 0 as well as the last one
    expect(nextTipIndex(-1, count, () => 0)).toBe(0);
    expect(nextTipIndex(-1, count, () => 0.999999)).toBe(count - 1);
    // degenerate pools never throw and never index out of range
    expect(nextTipIndex(0, 1, () => 0.5)).toBe(0);
    expect(nextTipIndex(-1, 0, () => 0.5)).toBe(0);
  });

  it("ships a well-formed, varied pool of rules / tips / build advice", () => {
    cover("intermission-tips");
    expect(MERCHANT_TIPS.length).toBeGreaterThanOrEqual(8);
    const kinds = new Set<MerchantTipKind>();
    for (const t of MERCHANT_TIPS) {
      expect(TIP_KIND_META[t.kind], `unknown kind ${t.kind}`).toBeTruthy();
      expect(t.text.trim().length, "an empty tip line").toBeGreaterThan(0);
      kinds.add(t.kind);
    }
    // all three flavours are represented, so a new player sees rules AND builds
    expect(kinds).toEqual(new Set<MerchantTipKind>(["rule", "tip", "build"]));
  });
});
