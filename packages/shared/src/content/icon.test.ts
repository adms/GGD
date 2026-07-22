/**
 * Task #33 — optional `icon` field (w3x BLP→PNG icon path) on champion@1,
 * ability@1 (embedded AND standalone) and item@1.
 *
 *   icon-schema-champ   — champion@1 accepts/rejects the top-level icon path
 *   icon-schema-ability — zAbilityDef icon works embedded and standalone
 *   icon-schema-item    — item@1 accepts/rejects icon (iconKey untouched)
 *
 * Fixtures are hand-written minimal docs (NOT live content) so this suite is
 * independent of the concurrent extraction workflow and of index state.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { zAbilityDoc, zChampionDoc, zItemDoc } from "./schema/index";

const ICON_CHAMP = "assets/icons/champions/godie-test.png";
const ICON_ABILITY = "assets/icons/abilities/godie-test.q.png";
const ICON_ITEM = "assets/icons/items/godie-item-test.png";

/** Minimal embedded ability def for slot `slot` (no schema tag). */
function abilityFix(slot: "Q" | "W" | "E" | "R", icon?: string): Record<string, unknown> {
  return {
    id: `godie-test.${slot.toLowerCase()}`,
    name: `測試技能 ${slot}`,
    slot,
    castType: "self",
    maxRank: 5,
    cooldown: [8],
    manaCost: [40],
    range: 0,
    effects: [],
    ...(icon !== undefined ? { icon } : {}),
  };
}

/** Minimal champion@1 fixture; embedded Q carries an ability icon. */
function championFix(icon?: string): Record<string, unknown> {
  return {
    schema: "champion@1",
    id: "godie-test",
    name: "測試英雄",
    role: "fighter",
    attackType: "melee",
    modelKey: "champ.test",
    baseStats: {},
    growth: {},
    abilities: {
      Q: abilityFix("Q", ICON_ABILITY),
      W: abilityFix("W"),
      E: abilityFix("E"),
      R: abilityFix("R"),
    },
    skillOrder: ["Q", "W", "E", "R"],
    buildPriority: [],
    tags: ["wc3-import"],
    ...(icon !== undefined ? { icon } : {}),
  };
}

function itemFix(icon?: string): Record<string, unknown> {
  return {
    schema: "item@1",
    id: "godie-item-test",
    name: "測試道具",
    cost: 100,
    tier: 1,
    iconKey: "legacy-key",
    tags: [],
    ...(icon !== undefined ? { icon } : {}),
  };
}

describe("champion@1 icon (icon-schema-champ)", () => {
  it("accepts an assets/ icon path, stays valid without one, rejects other prefixes", () => {
    cover("icon-schema-champ");
    // with icon
    const parsed = zChampionDoc.parse(championFix(ICON_CHAMP));
    expect(parsed.icon).toBe(ICON_CHAMP);
    // additive: docs without icon (the whole existing roster) stay valid
    const bare = zChampionDoc.parse(championFix());
    expect(bare.icon).toBeUndefined();
    // stock/absolute/hotlinked paths are rejected, error lands on "icon"
    for (const bad of ["icons/champ.png", "ReplaceableTextures\\foo.blp", "https://x/y.png"]) {
      const res = zChampionDoc.safeParse(championFix(bad));
      expect(res.success).toBe(false);
      if (res.success) throw new Error("unreachable");
      expect(res.error.issues.map((i) => i.path.join("."))).toContain("icon");
    }
  });
});

describe("ability icon, embedded + standalone (icon-schema-ability)", () => {
  it("round-trips on the embedded Q def inside champion@1", () => {
    cover("icon-schema-ability");
    const parsed = zChampionDoc.parse(championFix());
    expect(parsed.abilities.Q.icon).toBe(ICON_ABILITY);
    // embedded defs without icon stay valid + undefined
    expect(parsed.abilities.W.icon).toBeUndefined();
  });

  it("round-trips on a standalone ability@1 doc (EX-style) and rejects bad prefixes", () => {
    cover("icon-schema-ability");
    const doc = {
      schema: "ability@1",
      ...abilityFix("Q", ICON_ABILITY),
      id: "godie-test.ex",
      slot: "EX",
      maxRank: 1,
    };
    const parsed = zAbilityDoc.parse(doc);
    expect(parsed.icon).toBe(ICON_ABILITY);
    const res = zAbilityDoc.safeParse({ ...doc, icon: "not-assets/x.png" });
    expect(res.success).toBe(false);
    if (res.success) throw new Error("unreachable");
    expect(res.error.issues.map((i) => i.path.join("."))).toContain("icon");
  });
});

describe("item@1 icon (icon-schema-item)", () => {
  it("accepts an assets/ icon path alongside legacy iconKey, rejects other prefixes", () => {
    cover("icon-schema-item");
    const parsed = zItemDoc.parse(itemFix(ICON_ITEM));
    expect(parsed.icon).toBe(ICON_ITEM);
    expect(parsed.iconKey).toBe("legacy-key"); // legacy key untouched
    const bare = zItemDoc.parse(itemFix());
    expect(bare.icon).toBeUndefined();
    const res = zItemDoc.safeParse(itemFix("item.png"));
    expect(res.success).toBe(false);
    if (res.success) throw new Error("unreachable");
    expect(res.error.issues.map((i) => i.path.join("."))).toContain("icon");
  });
});
