/**
 * Task #33 — w3x icon rendering logic (pure halves of IconImg + the surfaces):
 *
 *   icon-ui-fallback   — absent / non-assets / failed icons resolve to null so
 *                        every surface keeps its pre-icon rendering (stock-art
 *                        heroes NEVER get a fabricated URL)
 *   icon-ui-abilitybar — Q/W/E/R icons resolve from the champion's embedded
 *                        defs and the EX slot surfaces its ability's icon
 *
 * (Client vitest env is node — no DOM — so, exactly like exSlot.test.ts, the
 * JSX shells are exercised through their extracted pure helpers with 2-3
 * hand-written fixture defs registered into the shared registries. NOT live
 * content: the extraction workflow is writing icon fields concurrently.)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { Abilities, Items, registerChampion } from "@ggd/shared/sim/content/registry";
import type { AbilityId, ChampionId, ItemId } from "@ggd/shared/ids";
import type { AbilityDef, ChampionDef, ItemDef } from "@ggd/shared/sim/content/defs";
import { contentAssetUrl } from "../content/ContentDb";
import { abilityIconUrl, championIconUrl, iconSrc, itemIconUrl } from "./icons";
import { exSlotView } from "./exSlot";

const CHAMP_ID = "godie-icontest" as ChampionId;
const EX_ID = "godie-icontest.ex" as AbilityId;
const ITEM_ICONED = "godie-item-iconed" as ItemId;
const ITEM_PLAIN = "godie-item-plain" as ItemId;

function ability(slot: "Q" | "W" | "E" | "R" | "EX", icon?: string): AbilityDef {
  const def: AbilityDef = {
    id: `${CHAMP_ID}.${slot.toLowerCase()}` as AbilityId,
    name: `技能 ${slot}`,
    slot,
    castType: "self",
    maxRank: slot === "EX" ? 1 : 5,
    cooldown: [10],
    manaCost: [50],
    range: 0,
    effects: [],
  };
  if (icon !== undefined) def.icon = icon;
  return def;
}

beforeAll(() => {
  // fixture hero: icons on the doc + Q/E/R, W deliberately icon-less (stock art)
  const champ: ChampionDef = {
    id: CHAMP_ID,
    name: "圖示測試俠",
    role: "fighter",
    attackType: "melee",
    modelKey: "champ.test",
    baseStats: {},
    growth: {},
    abilities: {
      Q: ability("Q", "assets/icons/abilities/godie-icontest.q.png"),
      W: ability("W"), // ← stock icon in WC3 → NO icon field
      E: ability("E", "assets/icons/abilities/godie-icontest.e.png"),
      R: ability("R", "assets/icons/abilities/godie-icontest.r.png"),
    },
    icon: "assets/icons/champions/godie-icontest.png",
    skillOrder: ["Q", "W", "E", "R"],
    buildPriority: [],
    tags: ["wc3-import"],
  };
  registerChampion(champ);
  const ex = ability("EX", "assets/icons/abilities/godie-icontest.ex.png");
  ex.id = EX_ID;
  ex.cooldown = [60];
  Abilities.register(EX_ID, ex);
  Items.register(ITEM_ICONED, {
    id: ITEM_ICONED,
    name: "有圖示的劍",
    cost: 500,
    tier: 2,
    icon: "assets/icons/items/godie-item-iconed.png",
    tags: [],
  } as ItemDef);
  Items.register(ITEM_PLAIN, {
    id: ITEM_PLAIN,
    name: "沒圖示的藥",
    cost: 50,
    tier: 1,
    tags: [],
  } as ItemDef);
});

describe("icon fallback resolution (icon-ui-fallback)", () => {
  it("resolves assets/ paths to /content/ URLs and everything else to null", () => {
    cover("icon-ui-fallback");
    // the served URL mirrors every other content fetch (BASE = /content/)
    expect(contentAssetUrl("assets/icons/items/x.png")).toBe("/content/assets/icons/items/x.png");
    expect(iconSrc("assets/icons/champions/a.png")).toBe("/content/assets/icons/champions/a.png");
    // absent icon (stock art) → null → caller renders its old look
    expect(iconSrc(undefined)).toBeNull();
    expect(iconSrc(null)).toBeNull();
    expect(iconSrc("")).toBeNull();
    // foreign/hotlink/stock paths are never turned into URLs
    expect(iconSrc("ReplaceableTextures\\CommandButtons\\BTNFoo.blp")).toBeNull();
    expect(iconSrc("https://cdn.example/icon.png")).toBeNull();
    // a load failure (404) forces the fallback even for a well-formed path
    expect(iconSrc("assets/icons/items/x.png", true)).toBeNull();
  });

  it("id-level helpers fall back to null for unknown/icon-less docs", () => {
    cover("icon-ui-fallback");
    expect(championIconUrl("no-such-champ")).toBeNull();
    expect(championIconUrl(null)).toBeNull();
    expect(itemIconUrl(ITEM_PLAIN)).toBeNull(); // registered, but no icon field
    expect(itemIconUrl(ITEM_ICONED)).toBe("/content/assets/icons/items/godie-item-iconed.png");
    expect(championIconUrl(CHAMP_ID)).toBe("/content/assets/icons/champions/godie-icontest.png");
  });
});

describe("ability-bar icon resolution (icon-ui-abilitybar)", () => {
  it("Q/W/E/R read the embedded def icons; icon-less slots keep the letter tile", () => {
    cover("icon-ui-abilitybar");
    expect(abilityIconUrl(CHAMP_ID, "Q")).toBe(
      "/content/assets/icons/abilities/godie-icontest.q.png",
    );
    expect(abilityIconUrl(CHAMP_ID, "E")).toBe(
      "/content/assets/icons/abilities/godie-icontest.e.png",
    );
    // W has stock art → no icon field → null → letter-tile fallback
    expect(abilityIconUrl(CHAMP_ID, "W")).toBeNull();
    expect(abilityIconUrl("no-such-champ", "Q")).toBeNull();
  });

  it("the EX slot view carries its ability's icon path (amber tile when absent)", () => {
    cover("icon-ui-abilitybar");
    const view = exSlotView({ exAbilityId: EX_ID, exRank: 1, exCooldown: 0 });
    expect(view).not.toBeNull();
    expect(view!.icon).toBe("assets/icons/abilities/godie-icontest.ex.png");
    expect(iconSrc(view!.icon)).toBe("/content/assets/icons/abilities/godie-icontest.ex.png");
    // an EX def without an icon yields an icon-less view (fallback tile)
    const plainId = "godie-icontest.ex2" as AbilityId;
    const plain = ability("EX");
    plain.id = plainId;
    Abilities.register(plainId, plain);
    const plainView = exSlotView({ exAbilityId: plainId, exRank: 1, exCooldown: 0 });
    expect(plainView).not.toBeNull();
    expect(plainView!.icon).toBeUndefined();
  });
});
