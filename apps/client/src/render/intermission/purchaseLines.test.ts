import { describe, expect, it } from "vitest";
import {
  FALLBACK_REACTION,
  pickPurchaseReaction,
  purchaseLinesFromDoc,
  reactionsFor,
} from "./purchaseLines";

describe("purchaseLinesFromDoc", () => {
  it("parses a well-formed doc into a champion map", () => {
    const map = purchaseLinesFromDoc({
      "godie-e001": { name: "龍宮禮奈", reactions: ["a", "b", "c"], tone: "瘋癲" },
    });
    expect(map["godie-e001"]).toEqual({ name: "龍宮禮奈", reactions: ["a", "b", "c"], tone: "瘋癲" });
  });

  it("is tolerant: drops non-string reactions, defaults name/tone, skips junk", () => {
    const map = purchaseLinesFromDoc({
      ok: { reactions: ["x", 1, "", null, "y"] },
      bad: 42,
      alsoBad: null,
    });
    expect(map.ok).toEqual({ name: "ok", reactions: ["x", "y"], tone: "" });
    expect(map.bad).toBeUndefined();
    expect(map.alsoBad).toBeUndefined();
  });

  it("returns {} for non-object docs (never throws)", () => {
    expect(purchaseLinesFromDoc(null)).toEqual({});
    expect(purchaseLinesFromDoc("nope")).toEqual({});
    expect(purchaseLinesFromDoc(undefined)).toEqual({});
  });
});

describe("reactionsFor", () => {
  const map = purchaseLinesFromDoc({ hero: { reactions: ["one", "two"] } });
  it("returns the champion's reactions", () => {
    expect(reactionsFor(map, "hero")).toEqual(["one", "two"]);
  });
  it("returns [] for an unmapped champion, empty id, or null map", () => {
    expect(reactionsFor(map, "ghost")).toEqual([]);
    expect(reactionsFor(map, "")).toEqual([]);
    expect(reactionsFor(null, "hero")).toEqual([]);
  });
});

describe("pickPurchaseReaction", () => {
  it("falls back gracefully when a champion has no lines (index −1, never blank)", () => {
    const pick = pickPurchaseReaction([], -1);
    expect(pick).toEqual({ index: -1, text: FALLBACK_REACTION });
  });

  it("returns a real authored line when reactions exist", () => {
    const reactions = ["好可愛…帶回家嘛", "嘿嘿…這個歸我了", "禮奈也想要這個～"];
    const pick = pickPurchaseReaction(reactions, -1, () => 0);
    expect(reactions).toContain(pick.text);
    expect(pick.index).toBeGreaterThanOrEqual(0);
    expect(pick.index).toBeLessThan(reactions.length);
  });

  it("never repeats the same line twice in a row (no immediate repeat)", () => {
    const reactions = ["A", "B", "C"];
    let current = 0;
    // sweep the rng across its whole range from every starting index
    for (let start = 0; start < reactions.length; start++) {
      current = start;
      for (let r = 0; r < 1; r += 0.05) {
        const pick = pickPurchaseReaction(reactions, current, () => r);
        expect(pick.index).not.toBe(current);
        expect(reactions[pick.index]).toBe(pick.text);
      }
    }
  });

  it("handles a single-line champion without looping forever", () => {
    const pick = pickPurchaseReaction(["solo"], 0, () => 0.999);
    expect(pick).toEqual({ index: 0, text: "solo" });
  });
});
