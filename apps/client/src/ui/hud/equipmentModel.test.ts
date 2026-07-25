/**
 * client-32 (hud-equipment-bar): the persistent in-match equipment bar (task
 * #44). The bar's DOM shell lives in EquipmentBar.tsx (untested — the vitest env
 * is node, no DOM, same as the rest of ui/); everything the LoL-style rules turn
 * on is the pure `equipmentBar` model asserted here:
 *   - a VISIBLE slot cap: always exactly six cells, filled or empty;
 *   - no-duplicate-unique FEEDBACK: unique items are flagged + carry a 唯一 chip;
 *   - a DETAIL tooltip: the same ✦ effect + WC3 claims + lore the shop shows.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { INVENTORY_SLOTS } from "@ggd/shared/sim/economy/shop";
import { ModOp } from "@ggd/shared/sim/stats/modifiers";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import {
  buildEquipmentCells,
  equipmentCap,
  itemDetailBody,
  type EquipItemDef,
} from "./equipmentModel";
import { UNKNOWN_ITEM_LABEL } from "../panels/itemStats";

/** A small fixture registry keyed by id. */
const DEFS: Record<string, EquipItemDef> = {
  sword: {
    id: "sword",
    name: "巨劍",
    icon: "assets/icons/items/sword.png",
    modifiers: [{ stat: Stat.AttackDamage, op: ModOp.Flat, value: 18 }],
    description: "武器\n效能\n攻擊力+18\n擴散傷害60%\n解說\n古老的鋼。",
  },
  ring: {
    id: "ring",
    name: "唯一戒指",
    unique: true,
    modifiers: [{ stat: Stat.AbilityPower, op: ModOp.Flat, value: 30 }],
    description: "神器\n效能\n15%機率造成2倍傷害\n解說\n只此一枚。",
  },
  boots: { id: "boots", name: "疾行靴" }, // pure-stat-less, no description
};

const lookup = (id: string): EquipItemDef | undefined => DEFS[id];

describe("equipment bar model (client-32)", () => {
  it("always renders exactly six cells — the slot cap is visible", () => {
    cover("hud-equipment-bar");
    expect(INVENTORY_SLOTS).toBe(6);
    // one item held → six cells, one filled, five empty
    const cells = buildEquipmentCells(["sword"], lookup);
    expect(cells).toHaveLength(INVENTORY_SLOTS);
    expect(cells[0]!.itemId).toBe("sword");
    expect(cells.slice(1).every((c) => c.itemId === null)).toBe(true);
    // empty cells carry no name/icon/tooltip/meta
    expect(cells[1]).toMatchObject({ itemId: null, name: null, icon: null, tooltipBody: null, meta: [] });
  });

  it("equipmentCap reports filled / cap and the full flag", () => {
    cover("hud-equipment-bar");
    expect(equipmentCap([])).toEqual({ filled: 0, cap: 6, full: false });
    expect(equipmentCap(["sword", "ring"])).toEqual({ filled: 2, cap: 6, full: false });
    // empty-string holes (the seat pads its item array) do not count
    expect(equipmentCap(["sword", "", "ring", "", "", ""])).toEqual({ filled: 2, cap: 6, full: false });
    // six real items → full
    const six = ["a", "b", "c", "d", "e", "f"];
    expect(equipmentCap(six)).toEqual({ filled: 6, cap: 6, full: true });
    // never over-counts past the cap
    expect(equipmentCap([...six, "g"]).filled).toBe(6);
  });

  it("flags unique items and gives them the no-duplicate 唯一 feedback chip", () => {
    cover("hud-equipment-bar");
    const cells = buildEquipmentCells(["sword", "ring"], lookup);
    const sword = cells[0]!;
    const ring = cells[1]!;
    expect(sword.unique).toBe(false);
    expect(sword.meta).toEqual([]);
    expect(ring.unique).toBe(true);
    expect(ring.meta).toEqual([{ label: "唯一", value: "不可重複持有" }]);
  });

  it("exposes the DETAIL tooltip body — ✦ effect + WC3 claims + lore", () => {
    cover("hud-equipment-bar");
    const body = itemDetailBody(DEFS.sword!);
    expect(body).not.toBeNull();
    // the ✦ mechanical line survives; the stat-claim line (攻擊力+18) is stripped
    expect(body).toContain("✦ 擴散傷害60%");
    expect(body).toContain("攻擊力+18"); // kept as a non-authoritative WC3 claim line
    expect(body).toContain("古老的鋼。"); // lore
    // a pure name-only item has no prose body
    expect(itemDetailBody(DEFS.boots!)).toBeNull();
    // and the cell carries whatever the body resolved to
    expect(buildEquipmentCells(["sword"], lookup)[0]!.tooltipBody).toBe(body);
  });

  it("degrades to a READABLE placeholder (never the raw id) when the def is missing (#202)", () => {
    cover("hud-equipment-bar");
    const cells = buildEquipmentCells(["ghost"], lookup);
    // #202: a missing def must NOT leak the id as user-facing text — the owner's
    // 「顯示 ID」 complaint. The itemId is retained for the glyph seed / sell wiring,
    // but the displayed `name` is the neutral placeholder, never "ghost".
    expect(cells[0]).toMatchObject({
      itemId: "ghost",
      name: UNKNOWN_ITEM_LABEL,
      icon: null,
      unique: false,
      tooltipBody: null,
      meta: [],
    });
    expect(cells[0]!.name).not.toBe("ghost");
  });
});
