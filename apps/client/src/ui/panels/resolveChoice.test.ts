/**
 * hud-draft-choice-icon: the augment-draft offer resolver surfaces a w3x icon
 * (and description) for an ABILITY choice, an item choice keeps its icon, and an
 * icon-less choice falls back to a text card. Node-testable — the same fixture
 * pattern as icons.test.ts (hand-written defs into the shared registries).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { noblePhantasmLabel } from "./fateLexicon";
import { cover } from "@ggd/shared/testkit/cover";
import { Abilities, Augments, Items } from "@ggd/shared/sim/content/registry";
import type { AbilityId, AugmentId, ItemId } from "@ggd/shared/ids";
import type { AbilityDef, AugmentDef, ItemDef } from "@ggd/shared/sim/content/defs";
import { encodeAttrChoice } from "@ggd/shared/sim/economy/attrDraft";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { resolveChoice } from "./resolveChoice";
import { statLabel } from "./statDisplay";

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
    // ⭐ owner 2026-08-16：武器卡不再講價格，講**寶具**（Rank + 種別）。
    // ⚠️ 斷言從詞彙表推導，⛔ 不抄字面值 —— 抄了就是第二個住處，而那一份會過期。
    expect(item.desc).toBe(noblePhantasmLabel(ITEM_ICONED));
    // ⛔ 而且畫面上不可以再出現舊詞（owner：「不要講傳說武器道具這種字眼」）。
    expect(item.desc).not.toContain("傳說武器");
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

/**
 * #260 — the 能力屬性強化 card must PRINT its rolled magnitude.
 *
 * owner: 「隨機加點 0.1-2 顯示在卡片上面」. The number rides in the card's NAME,
 * which is also the string `draftA11y` feeds to `aria-label`, so it is on screen
 * AND spoken. Losing it would make all three cards read 「力量／敏捷／智慧」 with
 * nothing to choose between — the exact 「有可能你想要的屬性但加很少」 tension the
 * owner asked for, deleted.
 */
describe("能力屬性強化 三選一 cards (#260)", () => {
  it("names the attribute AND the rolled number", () => {
    cover("hud-draft-choice-icon");
    expect(resolveChoice(encodeAttrChoice("str", 14)).name).toBe("力量 +1.4");
    expect(resolveChoice(encodeAttrChoice("agi", 1)).name).toBe("敏捷 +0.1");
    expect(resolveChoice(encodeAttrChoice("int", 20)).name).toBe("智慧 +2.0");
  });

  it("says WHICH stats the attribute feeds, from the shared 三圍 table", () => {
    cover("hud-draft-choice-icon");
    // derived from ATTR_STAT_SOURCE, never re-typed — a card that named the
    // wrong ones would be worse than a card that named none.
    // ⭐ 2026-08-22 —— owner 加了兩條軸：力量→暴擊率、敏捷→迴避率。
    //    ⇒ 力量餵四項、敏捷餵三項。⛔ 這一行**跟著那張表走**，
    //    所以下一次加軸時它會自己對，⛔ 不會再變成一張說錯的卡。
    expect(resolveChoice(encodeAttrChoice("str", 5)).desc).toBe(
      [Stat.MaxHealth, Stat.HealthRegen, Stat.AttackDamage, Stat.CritChance]
        .map(statLabel)
        .join("・"),
    );
    expect(resolveChoice(encodeAttrChoice("agi", 5)).desc).toBe(
      [Stat.Armor, Stat.AttackSpeed, Stat.Evasion].map(statLabel).join("・"),
    );
  });

  it("a malformed attribute id degrades to a text card, never a fake +0", () => {
    cover("hud-draft-choice-icon");
    // out of range: the resolver must NOT invent a card for it
    expect(resolveChoice("attr:str:99")).toEqual({ name: "attr:str:99", desc: "" });
  });
});
