/**
 * shopStatVisibility — the shop must show what a purchase BOUGHT.
 *
 * owner, 2026-07-27: 「在 shop 時候，購買屬性看不到加多少屬性跟次數 等級也是，
 * 應該在上方屬性多顯示等級及屬性旁邊多 (+xxx)」.
 *
 * That report had a mechanical cause, not a layout one. The 20 能力屬性強化
 * rolls (economy/statPath) were the ONE stat source that never rode the wire —
 * statPreview's own header said so — so the panel reconstructed every champion
 * WITHOUT them, printed a number that did not move when you spent 375g, and
 * shipped an 「≈ 屬性強化未同步」 disclaimer in place of the answer.
 *
 * These are wiring guards, not formatting ones. Each asserts something that
 * BREAKS if a link in the chain is removed:
 *
 *   schema → snapshot fill → SeatView → statContextFromSeat → buildWorld
 *
 * The DOM half (Lv in the header, `(+xxx)` in its own column) is asserted in
 * roundReportMount-style source form, because a jsdom render of MerchantShop
 * drags in Babylon and the whole content DB for what is a two-line question.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { STAT_TICK_ROLLS } from "@ggd/shared/sim/economy/itemTiers";
import { statRollModifiers } from "@ggd/shared/sim/economy/statPath";
import { computeStatBlock, computeBaseStatBlock } from "./statPreview";

const SRC = join(__dirname, "MerchantShop.tsx");
const shopSource = (): string => readFileSync(SRC, "utf8");

/**
 * The skeleton content set's champion. Deliberately NOT a real roster id: this
 * file asserts the WIRING (do the rolls reach the pipeline, does the bonus
 * subtract), and pinning it to shipped content would make it fail the day that
 * champion is retuned — a false alarm about a mechanism that still works.
 */
const CHAMP = "thorne";

beforeAll(() => {
  registerSkeletonContent();
});

function ctx(rolls?: number[]) {
  return {
    championId: CHAMP,
    level: 5,
    abilityRanks: [1, 0, 0, 0],
    items: ["", "", "", "", "", ""],
    augments: [],
    statCapstonePct: 0,
    statRollCounts: rolls,
  };
}

describe("屬性強化 reaches the client at all", () => {
  it("counts → the exact modifiers the server attached", () => {
    // index 0 is the AttackDamage roll; three of them is three flat adds.
    const three = statRollModifiers([3, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(three).toHaveLength(3);
    expect(three.every((m) => m.stat === STAT_TICK_ROLLS[0]!.stat)).toBe(true);
    // absent / short arrays read as "no ticks", never as a crash
    expect(statRollModifiers(undefined)).toEqual([]);
    expect(statRollModifiers([])).toEqual([]);
  });

  it("a bought tick actually MOVES the panel's number", () => {
    // THE regression guard for the owner's report. Deleting the `statRollModifiers`
    // attach loop in statPreview.buildWorld makes these two blocks identical and
    // this fails — which is exactly the silence being fixed: 375g spent, panel
    // frozen. Asserting the DIRECTION too, because a delta of the wrong sign
    // would still be "a difference".
    const withoutTicks = computeStatBlock(ctx());
    const withTicks = computeStatBlock(ctx([4, 0, 0, 0, 0, 0, 0, 0, 0]));
    expect(withoutTicks).not.toBeNull();
    expect(withTicks).not.toBeNull();
    const gained = withTicks![Stat.AttackDamage] - withoutTicks![Stat.AttackDamage];
    expect(gained).toBeGreaterThan(0);
    // 4 ticks of the AD roll, so the gain scales with the count rather than
    // being a one-shot "any ticks at all" flag.
    const one = computeStatBlock(ctx([1, 0, 0, 0, 0, 0, 0, 0, 0]))!;
    const oneGain = one[Stat.AttackDamage] - withoutTicks![Stat.AttackDamage];
    expect(gained).toBeGreaterThan(oneGain * 2);
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
    expect(live[Stat.AttackDamage] - base5[Stat.AttackDamage]).toBeCloseTo(0, 6);

    // with ticks it is the whole gain
    const bought = computeStatBlock(ctx([2, 0, 0, 0, 0, 0, 0, 0, 0]))!;
    expect(bought[Stat.AttackDamage] - base5[Stat.AttackDamage]).toBeGreaterThan(0);
  });
});

describe("the shop panel renders what the owner asked for", () => {
  it("prints the hero LEVEL in the attribute header", () => {
    expect(shopSource()).toMatch(/Lv \{props\.level\}/);
  });

  it("prints the 屬性強化 purchase COUNT", () => {
    const src = shopSource();
    expect(src).toMatch(/屬性強化 \{props\.statStacks\} \/ \{props\.statTarget\} 次/);
  });

  it("prints a (+xxx) column driven by the base block", () => {
    const src = shopSource();
    // the column exists…
    expect(src).toMatch(/\(\$\{formatStatDelta\(meta\.stat, bonus!\)\}\)/);
    // …and it is fed by the real subtraction, not a hard-coded string
    expect(src).toMatch(/const bonusOf =/);
    expect(src).toMatch(/return shown\(stat\) - base\[stat\];/);
  });

  it("recomputes when a tick is bought — statRollCounts is in the memo signature", () => {
    // Without this the panel is correct and STILL never moves: `sig` is the only
    // dependency of the useMemo that produces the block, and buying a tick moves
    // neither items nor augments nor the capstone.
    const src = shopSource();
    const sig = src.slice(src.indexOf("const sig = useMemo("), src.indexOf("const env = useMemo("));
    expect(sig).toContain("seat.statRollCounts");
  });

  it("StatPanel is actually GIVEN the base block and the level", () => {
    // The component could be perfect and mounted with `base={null}` — then every
    // (+xxx) is silently withheld and the screen looks exactly like the bug.
    const src = shopSource();
    const mount = src.slice(src.indexOf("<StatPanel"), src.indexOf("<StatPanel") + 500);
    expect(mount).toContain("base={baseBlock}");
    expect(mount).toContain("level={seat.level}");
    expect(mount).toContain("statStacks={seat.statStacks}");
  });
});
