/**
 * merchantTips — two sharp rules, one per era of this file.
 *
 * #148: random, but NEVER the same tip twice in a row (a naïve draw repeats
 * ~1/n of the time and reads as "the box froze").
 *
 * GH#971: the pool is the ONLY thing in the game that teaches the format, so it
 * is guarded on CONTENT, not just on rotation — ⛔ no literal number may be
 * baked into a line (第〇·四守則: turn `statTickTarget` and the merchant must
 * turn with it), every placeholder must resolve, every row must name where its
 * mechanic lives, and every gameplay topic must actually be covered.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  MERCHANT_TIPS,
  MERCHANT_TIP_TEMPLATES,
  MERCHANT_TIP_TOPICS,
  PRIORITY_TIP_COUNT,
  TIP_KIND_META,
  TIP_VALUES,
  nextTipIndex,
  resolveTipText,
  tipPlaceholders,
  type MerchantTipKind,
} from "./merchantTips";

/** Deterministic LCG so the rotation is reproducible under test. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 2 ** 32);
}

describe("merchant tips rotation (#148)", () => {
  it("never repeats immediately, and still reaches EVERY tip", () => {
    cover("intermission-tips");
    const count = MERCHANT_TIPS.length;
    const rand = lcg(12345);
    const seen = new Set<number>();
    let cur = nextTipIndex(-1, count, rand);
    for (let i = 0; i < 20000; i++) {
      const next = nextTipIndex(cur, count, rand);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(count);
      expect(next, "an immediate repeat slipped through").not.toBe(cur);
      cur = next;
      seen.add(cur);
    }
    expect(seen.size, "the rotation is stuck on a subset").toBe(count);
  });

  it("opens on a PRIORITY line, and is crash-safe at the edges", () => {
    cover("intermission-tips");
    // ⭐ GH#971: a player sees ~5 lines an intermission out of a 30+ pool, so the
    // FIRST one is drawn from the survival-critical head — never uniformly.
    for (const r of [0, 0.25, 0.5, 0.9, 0.999999]) {
      const first = nextTipIndex(-1, MERCHANT_TIPS.length, () => r);
      expect(first).toBeLessThan(PRIORITY_TIP_COUNT);
      expect(MERCHANT_TIPS[first]!.kind).toBe("rule");
    }
    expect(nextTipIndex(0, 1, () => 0.5)).toBe(0);
    expect(nextTipIndex(-1, 0, () => 0.5)).toBe(0);
  });
});

describe("merchant tips content (GH#971)", () => {
  it("bakes NO literal number, resolves every placeholder, and cites a source", () => {
    cover("intermission-tips");
    for (const t of MERCHANT_TIP_TEMPLATES) {
      expect(t.text, `字面數字必須改成 {{佔位}}：${t.text}`).not.toMatch(/[0-9]/);
      expect(t.source.trim().length, `這一條沒有出處：${t.text}`).toBeGreaterThan(0);
      expect(TIP_KIND_META[t.kind], `unknown kind ${t.kind}`).toBeTruthy();
      for (const p of tipPlaceholders(t.text)) {
        expect(TIP_VALUES[p], `佔位 {{${p}}} 解析不到值`).toBeDefined();
      }
      expect(resolveTipText(t.text), `這一條被丟出輪播：${t.text}`).not.toBeNull();
    }
    expect(MERCHANT_TIPS.length).toBe(MERCHANT_TIP_TEMPLATES.length);
  });

  it("covers every gameplay topic, in all three kinds", () => {
    cover("intermission-tips");
    const topics = new Set(MERCHANT_TIPS.map((t) => t.topic));
    for (const want of MERCHANT_TIP_TOPICS) {
      expect(topics, `沒有任何一條提示在教「${want}」`).toContain(want);
    }
    expect(new Set(MERCHANT_TIPS.map((t) => t.kind))).toEqual(
      new Set<MerchantTipKind>(["rule", "tip", "build"]),
    );
    // ⛔ 棘輪：這個池子只能變大 —— 它是全遊戲唯一在教玩法的地方。
    expect(MERCHANT_TIPS.length).toBeGreaterThanOrEqual(30);
  });
});
