/**
 * shopStatVisibility — the shop must show what a purchase BOUGHT.
 *
 * owner, 2026-07-27: 「在 shop 時候，購買屬性看不到加多少屬性跟次數 等級也是，
 * 應該在上方屬性多顯示等級及屬性旁邊多 (+xxx)」
 * owner, 2026-07-28 (#260): 「記得 力敏智三屬性也要顯示在 SHOP 的玩家角色屬性表」
 *
 * Two halves, and both are asserted against something a player could see:
 *
 *  1. WIRING — `SeatView.attrBonus` → `statContextFromSeat` → `buildWorld` →
 *     `championStatBase`. Each assertion BREAKS if a link is removed.
 *  2. PIXELS — the 三圍 row and the `(+xxx)` column are asserted by
 *     SERVER-RENDERING the exported `StatPanel` and reading the markup. This
 *     replaces the pre-#260 version of this file, which scanned MerchantShop.tsx
 *     with `expect(src).toMatch(...)`: a source scan cannot tell a rendered row
 *     from a comment about one, and it stays green when the element is deleted
 *     from the tree so long as the string survives somewhere in the file.
 *
 * The client's vitest runs in the `node` env, so the render goes through
 * `react-dom/server` — the same approach MerchantShop.test.ts and draftA11y.test.ts
 * use. MerchantShop imports no Babylon (its layout constants are plain numbers),
 * so importing it here is cheap.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Champions } from "@ggd/shared/sim/content/registry";
import { Stat, zeroStats } from "@ggd/shared/sim/stats/statTypes";
import {
  ATTR_KEYS,
  ATTR_LABEL,
  championAttribute,
} from "@ggd/shared/sim/stats/attributes";
import { attrBonusFromArray } from "@ggd/shared/sim/economy/statPath";
import type { ChampionId } from "@ggd/shared/ids";
import { computeStatBlock, computeBaseStatBlock } from "./statPreview";
import { StatPanel } from "./MerchantShop";

/**
 * The skeleton content set's champion. Deliberately NOT a real roster id: this
 * file asserts the WIRING, and pinning it to shipped content would make it fail
 * the day that champion is retuned — a false alarm about a mechanism that works.
 */
const CHAMP = "thorne";
const LEVEL = 5;

beforeAll(() => {
  registerSkeletonContent();
});

function ctx(attrBonus?: number[]) {
  return {
    championId: CHAMP,
    level: LEVEL,
    abilityRanks: [1, 0, 0, 0],
    items: ["", "", "", "", "", ""],
    augments: [],
    statCapstonePct: 0,
    attrBonus,
  };
}

/** Render the shop's attribute panel exactly as MerchantShop mounts it. */
function renderPanel(attrBonus?: number[]): string {
  const block = computeStatBlock(ctx(attrBonus)) ?? zeroStats();
  const base = computeBaseStatBlock(ctx());
  return renderToStaticMarkup(
    createElement(StatPanel, {
      block,
      base,
      preview: null,
      exact: true,
      authMaxHp: 0,
      authMaxMana: 0,
      level: LEVEL,
      statStacks: 3,
      capstonePct: 0,
      championId: CHAMP,
      attrBonus,
    }),
  );
}

describe("屬性強化 reaches the client at all", () => {
  it("the wire array → the AttrBonus the shared pipeline accepts", () => {
    const b = attrBonusFromArray([1.4, 0, 0.5]);
    expect(b).toEqual({ str: 1.4, agi: 0, int: 0.5 });
    // absent / short / garbage arrays read as "nothing bought", never a crash
    expect(attrBonusFromArray(undefined)).toEqual({ str: 0, agi: 0, int: 0 });
    expect(attrBonusFromArray([])).toEqual({ str: 0, agi: 0, int: 0 });
    expect(attrBonusFromArray([Number.NaN, 2])).toEqual({ str: 0, agi: 2, int: 0 });
  });

  it("a picked 力量 card actually MOVES the panel's numbers", () => {
    // THE regression guard. Deleting the `champ.attrBonus` write in
    // statPreview.buildWorld makes these two blocks identical and this fails —
    // which is exactly the silence being guarded against: 375g spent, panel
    // frozen. The DIRECTION is asserted too, because a delta of the wrong sign
    // would still be "a difference".
    const without = computeStatBlock(ctx());
    const withStr = computeStatBlock(ctx([4, 0, 0]));
    expect(without).not.toBeNull();
    expect(withStr).not.toBeNull();
    const gained = withStr![Stat.MaxHealth] - without![Stat.MaxHealth];
    expect(gained).toBeGreaterThan(0);
    // …and it SCALES with the amount bought rather than being an on/off flag
    const one = computeStatBlock(ctx([1, 0, 0]))!;
    const oneGain = one[Stat.MaxHealth] - without![Stat.MaxHealth];
    expect(gained).toBeGreaterThan(oneGain * 2);
  });

  it("each attribute drives its OWN stats — the three are not interchangeable", () => {
    const base = computeStatBlock(ctx())!;
    const str = computeStatBlock(ctx([5, 0, 0]))!;
    const int = computeStatBlock(ctx([0, 0, 5]))!;
    // 力量 → 生命, and NOT 法術強度
    expect(str[Stat.MaxHealth]).toBeGreaterThan(base[Stat.MaxHealth]);
    expect(str[Stat.AbilityPower]).toBeCloseTo(base[Stat.AbilityPower], 6);
    // 智慧 → 法術強度, and NOT 生命
    expect(int[Stat.AbilityPower]).toBeGreaterThan(base[Stat.AbilityPower]);
    expect(int[Stat.MaxHealth]).toBeCloseTo(base[Stat.MaxHealth], 6);
  });

  it("the (+xxx) subtrahend strips the build but KEEPS the level", () => {
    // computeBaseStatBlock is what `(+xxx)` subtracts. If it also stripped the
    // level, a champion who bought nothing would show a fat green bonus on
    // every row — a number answering no question the player is asking.
    const base5 = computeBaseStatBlock(ctx())!;
    const base9 = computeBaseStatBlock({ ...ctx(), level: 9 })!;
    expect(base9[Stat.MaxHealth]).toBeGreaterThan(base5[Stat.MaxHealth]);

    // …and with an empty build the bonus is exactly zero, not merely small.
    const live = computeStatBlock(ctx())!;
    expect(live[Stat.MaxHealth] - base5[Stat.MaxHealth]).toBeCloseTo(0, 6);

    // with bought attributes it is the whole gain
    const bought = computeStatBlock(ctx([0, 0, 8]))!;
    expect(bought[Stat.AbilityPower] - base5[Stat.AbilityPower]).toBeGreaterThan(0);
  });
});

describe("the shop panel RENDERS what the owner asked for", () => {
  it("prints all three 三圍 rows with the champion's real values", () => {
    const html = renderPanel();
    const def = Champions.get(CHAMP as ChampionId);
    for (const key of ATTR_KEYS) {
      expect(html, `${ATTR_LABEL[key]} row missing from the shop panel`).toContain(ATTR_LABEL[key]);
      const innate = championAttribute(def, key, LEVEL);
      expect(html, `${ATTR_LABEL[key]} shows no value`).toContain(innate.toFixed(1));
    }
  });

  it("prints the BOUGHT amount beside the 三圍 total", () => {
    // 「隨機加點 0.1-2」 — a +0.1 must survive to the screen, so the row is
    // formatted to one decimal rather than rounded to an int.
    const html = renderPanel([1.4, 0.1, 0]);
    const def = Champions.get(CHAMP as ChampionId);
    expect(html).toContain("(+1.4)");
    expect(html).toContain("(+0.1)");
    // …and the TOTAL moved with it, not just the badge
    expect(html).toContain((championAttribute(def, "str", LEVEL) + 1.4).toFixed(1));
  });

  it("prints the hero LEVEL and the 屬性強化 purchase COUNT", () => {
    const html = renderPanel();
    expect(html).toContain(`Lv ${LEVEL}`);
    expect(html).toContain("屬性強化 3 / 20 次");
  });

  it("prints a (+xxx) column driven by the real base subtraction", () => {
    // With attributes bought, the stats they feed must carry a visible bonus
    // chip. Rendering with base=null (the "silently withheld" failure) or with
    // an unfed panel would drop it.
    const html = renderPanel([0, 0, 8]);
    // 智慧 ×1 → +8 法術強度 at the default coefficient
    expect(html).toContain("+8");
  });
});
