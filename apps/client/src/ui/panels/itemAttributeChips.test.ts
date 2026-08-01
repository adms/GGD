/**
 * 道具的 三圍 必須被「看得到」—— the display half of `item@1.attributes`.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS EXISTS AGAINST, STATED PRECISELY
 *
 * `itemStats.ts`'s `STAT_CLAIM_RE` lists 力量 / 敏捷 / 智慧 among the stat-CLAIM
 * keywords, so a whole line of 「力量+12」 is STRIPPED out of the ✦ effect line —
 * on the assumption that a modifier chip is carrying that number instead. For
 * every other keyword on that list that assumption holds, because they are all
 * `Stat` members with a `modifiers` entry behind them.
 *
 * 力/敏/智 ARE NOT. Before `item@1.attributes` existed there was no chip and no
 * modifier to build one from, so 朗基努斯之槍's 「力量+12」「敏捷+12」 were deleted
 * from the shop shelf, the 三選一 card, the equipment tooltip and 戰場情報 — all
 * four, silently. That is CLAUDE.md 失敗形態 ② from the display side: the sim
 * pays it and no surface says so.
 *
 * So the two assertions BELONG TOGETHER and neither is sufficient alone:
 *   · the prose really is stripped (`isStatClaimLine`), and
 *   · the chip really is produced (`buildItemRow(...).secondary`).
 * Break either and this file goes red; delete the chip and the number is gone
 * from the game with 3,500 other tests still green.
 *
 * ⚠️ THE ITEM DOC IS READ OFF DISK. A hand-written `{attributes:{str:12}}`
 * fixture would stay green after somebody removes the block from
 * `content/items/godie-i018.json` — 失敗形態 ⑤ verbatim.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildItemRow, isStatClaimLine, attributeChips, type RowItem } from "./itemStats";
import { attributeRows } from "./statDisplay";
import type { AttrBonus, AttributeCarrier } from "@ggd/shared/sim/stats/attributes";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../../content");

function itemDoc(id: string): RowItem {
  return JSON.parse(readFileSync(join(CONTENT_DIR, "items", `${id}.json`), "utf-8")) as RowItem;
}

describe("三圍 chips on an item row", () => {
  it("朗基努斯之槍: the prose IS stripped, so the chip is the ONLY carrier", () => {
    // half 1 — the ✦ line will not show it
    expect(isStatClaimLine("力量+12")).toBe(true);
    expect(isStatClaimLine("敏捷+12")).toBe(true);

    // half 2 — …and the chip does
    const row = buildItemRow(itemDoc("godie-i018"), null);
    expect(row.secondary).toContain("力量 +12");
    expect(row.secondary).toContain("敏捷 +12");
    // 智慧 is NOT granted and must not be advertised as +0.
    expect(row.secondary.some((c) => c.startsWith("智慧"))).toBe(false);
    // the effect line survived and does not repeat the numbers
    expect(row.effect ?? "").not.toContain("力量+12");
  });

  it("四魂之玉: 力敏智+30 becomes three chips, in 力/敏/智 order", () => {
    const row = buildItemRow(itemDoc("godie-i00z"), null);
    const attrs = row.secondary.filter((c) => /^(力量|敏捷|智慧) /.test(c));
    expect(attrs).toEqual(["力量 +30", "敏捷 +30", "智慧 +30"]);
    // 三圍 lead the chip list — a primary attribute outranks a derived stat.
    expect(row.secondary.slice(0, 3)).toEqual(attrs);
  });

  it("an item with no attributes block produces no attribute chip at all", () => {
    expect(attributeChips(undefined)).toEqual([]);
    expect(attributeChips({})).toEqual([]);
    expect(attributeChips({ str: 0 })).toEqual([]);
    expect(attributeChips({ agi: 2.5 })).toEqual(["敏捷 +2.5"]);
  });
});

describe("the shop's 三圍 rows count 裝備 as a third component", () => {
  const HERO: AttributeCarrier = {
    baseStats: {},
    growth: {},
    attributes: {
      str: 20,
      agi: 10,
      int: 5,
      strGrowth: 0,
      agiGrowth: 0,
      intGrowth: 0,
      primary: "STR",
      source: "authored",
    },
  };
  const BOUGHT: AttrBonus = { str: 3, agi: 0, int: 0 };

  it("total = 天生 + 屬性強化 + 裝備, and the three stay separable", () => {
    const rows = attributeRows(HERO, 1, BOUGHT, { str: 12, agi: 12, int: 0 });
    const str = rows.find((r) => r.key === "str")!;
    expect([str.innate, str.bought, str.gear, str.total]).toEqual([20, 3, 12, 35]);
    const agi = rows.find((r) => r.key === "agi")!;
    expect([agi.innate, agi.bought, agi.gear, agi.total]).toEqual([10, 0, 12, 22]);
    // 裝備 must NOT be laundered into 屬性強化: the 375g tooltip would then take
    // credit for a weapon, and selling the weapon would look like a refund.
    expect(agi.bought).toBe(0);
  });

  it("omitting 裝備 is the pre-`item@1.attributes` arithmetic, exactly", () => {
    const withNone = attributeRows(HERO, 1, BOUGHT);
    expect(withNone.map((r) => r.total)).toEqual([23, 10, 5]);
    expect(withNone.every((r) => r.gear === 0)).toBe(true);
  });
});
