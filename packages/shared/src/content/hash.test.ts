/**
 * content-03 (content-hash-stable): object hash is stable across key order.
 * content-04 (content-version-pure): contentVersion is a pure function of content.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { sha256Hex } from "./sha256";
import { contentVersion, hashCollection, hashDoc } from "./hash";

describe("sha256 (pure)", () => {
  it("matches FIPS 180-4 test vectors", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    // > 64 bytes exercises multi-block + length encoding
    expect(sha256Hex("The quick brown fox jumps over the lazy dog".repeat(3))).toHaveLength(64);
    expect(sha256Hex("The quick brown fox jumps over the lazy dog")).toBe(
      "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
    );
  });
});

describe("hashDoc (content-03)", () => {
  it("is stable across key-order permutations, sensitive to values", () => {
    cover("content-hash-stable");
    const a = { id: "x", name: "X", stats: { hp: 10, mana: 5 }, tags: ["a", "b"] };
    const b = { tags: ["a", "b"], stats: { mana: 5, hp: 10 }, name: "X", id: "x" };
    expect(hashDoc(a)).toBe(hashDoc(b));
    expect(hashDoc(a)).toMatch(/^[0-9a-f]{12}$/);

    expect(hashDoc({ ...a, name: "Y" })).not.toBe(hashDoc(a));
    // array ORDER is meaningful content — must change the hash
    expect(hashDoc({ ...a, tags: ["b", "a"] })).not.toBe(hashDoc(a));
  });
});

describe("contentVersion (content-04)", () => {
  it("is a pure function of content, independent of iteration order", () => {
    cover("content-version-pure");
    const e1 = [
      { id: "a", hash: hashDoc({ id: "a", v: 1 }) },
      { id: "b", hash: hashDoc({ id: "b", v: 2 }) },
    ];
    // same members, reversed insertion order
    const c1 = hashCollection(e1);
    const c2 = hashCollection([...e1].reverse());
    expect(c1).toBe(c2);

    const v1 = contentVersion({ items: c1, champions: "abc123abc123" });
    const v2 = contentVersion({ champions: "abc123abc123", items: c2 });
    expect(v1).toBe(v2);
    expect(v1).toMatch(/^cv_[0-9a-f]{12}$/);

    // any doc change propagates: doc hash -> collection hash -> contentVersion
    const changed = hashCollection([e1[0]!, { id: "b", hash: hashDoc({ id: "b", v: 3 }) }]);
    expect(changed).not.toBe(c1);
    expect(contentVersion({ items: changed, champions: "abc123abc123" })).not.toBe(v1);
  });
});
