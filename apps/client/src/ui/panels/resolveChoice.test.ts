/**
 * hud-draft-choice-icon: the augment-draft offer resolver surfaces a w3x icon
 * (and description) for an ABILITY choice, an item choice keeps its icon, and an
 * icon-less choice falls back to a text card. Node-testable — the same fixture
 * pattern as icons.test.ts (hand-written defs into the shared registries).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { Abilities, Augments, Items } from "@ggd/shared/sim/content/registry";
import type { AbilityId, AugmentId, ItemId } from "@ggd/shared/ids";
import type { AbilityDef, AugmentDef, ItemDef } from "@ggd/shared/sim/content/defs";
import { resolveChoice } from "./resolveChoice";

const ABILITY_ICONED = "godie-draft.ex" as AbilityId;
const ABILITY_PLAIN = "godie-draft.plain" as AbilityId;
const ITEM_ICONED = "godie-draft-weapon" as ItemId;
const AUGMENT = "draft-aug" as AugmentId;

beforeAll(() => {
  Abilities.register(ABILITY_ICONED, {
    id: ABILITY_ICONED,
    name: "88-01 究極連斬",
    // description isn't in the AbilityDef TS type (only the doc schema) — the
    // runtime doc carries it; resolveChoice reads it structurally.
    description: "對前方敵人造成連續斬擊",
    slot: "EX",
    castType: "skillshot",
    maxRank: 1,
    cooldown: [60],
    manaCost: [100],
    range: 8,
    effects: [],
    icon: "assets/icons/abilities/godie-draft.ex.png",
  } as AbilityDef);
  Abilities.register(ABILITY_PLAIN, {
    id: ABILITY_PLAIN,
    name: "技能無圖",
    slot: "EX",
    castType: "self",
    maxRank: 1,
    cooldown: [30],
    manaCost: [0],
    range: 0,
    effects: [],
  } as AbilityDef);
  Items.register(ITEM_ICONED, {
    id: ITEM_ICONED,
    name: "傳說之劍",
    cost: 2400,
    tier: 5,
    icon: "assets/icons/items/godie-draft-weapon.png",
    tags: [],
  } as ItemDef);
  Augments.register(AUGMENT, {
    id: AUGMENT,
    name: "增幅",
    description: "強化下一次施法",
    tier: "gold",
    weight: 1,
    tags: [],
  } as AugmentDef);
});

describe("resolveChoice (hud-draft-choice-icon)", () => {
  it("returns an ability choice's w3x icon + description when present", () => {
    cover("hud-draft-choice-icon");
    const r = resolveChoice(ABILITY_ICONED);
    expect(r.name).toBe("88-01 究極連斬");
    expect(r.desc).toBe("對前方敵人造成連續斬擊");
    expect(r.icon).toBe("assets/icons/abilities/godie-draft.ex.png");
  });

  it("returns an ability with stock art as an icon-less (text) card", () => {
    cover("hud-draft-choice-icon");
    const r = resolveChoice(ABILITY_PLAIN);
    expect(r.name).toBe("技能無圖");
    expect(r.icon).toBeUndefined();
  });

  it("keeps item (weapon) icons and augment/unknown fallbacks", () => {
    cover("hud-draft-choice-icon");
    const item = resolveChoice(ITEM_ICONED);
    expect(item.icon).toBe("assets/icons/items/godie-draft-weapon.png");
    expect(item.desc).toBe("2400 g");
    // Augments have no w3x icon and CANNOT declare one — `augment@1` is
    // `.strict()` with no `icon` field. Their art is resolved BY CONVENTION from
    // the id instead, so the draft card gets its mandatory icon (#110) rather
    // than the GlyphTile letter tile a playtest caught it rendering.
    //
    // This previously asserted `toBeUndefined()`, which pinned the bug: every
    // augment card was permanently a letter tile even though all 21 generated
    // .webp files were sitting on disk.
    const aug = resolveChoice(AUGMENT);
    expect(aug.name).toBe("增幅");
    expect(aug.desc).toBe("強化下一次施法");
    expect(aug.icon).toBe(`assets/icons/augments/${AUGMENT}.webp`);
    // an unknown id degrades to a bare text card
    const unknown = resolveChoice("no-such-choice");
    expect(unknown).toEqual({ name: "no-such-choice", desc: "" });
  });
});
