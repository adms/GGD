/**
 * Guards for 回到原廠設定's preview logic.
 *
 * THE ONE THAT MATTERS MOST is `classifies a champion the starter does not
 * carry as a REAL HERO LOSS`. On 2026-08-02 the live delta happened to be ten
 * 變身態 whose base bodies stay enabled, i.e. the reset is invisible in
 * champ-select. If anyone ever "simplifies" this by baking today's ten ids in,
 * the panel keeps saying 「0 隻會消失」 on the day it is wrong — so that test
 * builds a live whitelist containing a champion that is NOT in the starter and
 * NOT a transformed body, and demands it be reported in red.
 */
import { describe, expect, it } from "vitest";
import { isTransformedBody } from "@ggd/shared/content/championForms";
import type { StarterBundle, WhitelistDoc } from "./curation";
import {
  baseChampionOf,
  buildExpect,
  buildResetPlan,
  canProceed,
  confirmSummary,
  defaultSelection,
  halfEnabledAfterReset,
  legendaryItemsOff,
  parseLootTableItemIds,
  requiresTypedConfirm,
  resetResultDoc,
  totalOff,
  totalOn,
  typedConfirmOk,
  visibleHeroLosses,
  type ResetKind,
} from "./curationReset";

function doc(c: string[], i: string[], a: string[]): WhitelistDoc {
  return { version: 1, updatedAt: "", champions: [...c].sort(), items: [...i].sort(), abilities: [...a].sort() };
}
function bundle(c: string[], i: string[], a: string[]): StarterBundle {
  return { champions: [...c].sort(), items: [...i].sort(), abilities: [...a].sort() };
}
function sel(...kinds: ResetKind[]): Set<ResetKind> {
  return new Set(kinds);
}

/** The five ability ids of a champion, so fixtures stay complete. */
function kit(id: string): string[] {
  return ["q", "w", "e", "r", "ex"].map((s) => `${id}.${s}`);
}

// A REAL transform pair out of the shipped table (godie-o00x 超級賽亞人 is the
// alternate body of godie-ogrh 悟空). Asserted here so the fixture cannot
// silently stop being a transform pair.
const ALT = "godie-o00x";
const ALT_BASE = "godie-ogrh";

describe("championForms is the source of truth for the fixture", () => {
  it("the fixture ids really are a transform pair in the shipped table", () => {
    expect(isTransformedBody(ALT)).toBe(true);
    expect(baseChampionOf(ALT)).toBe(ALT_BASE);
    expect(isTransformedBody(ALT_BASE)).toBe(false);
  });

  it("resolves a Nef1 SPLIT body to its caster, not to itself", () => {
    // 巴恩 godie-ubal's 魔界之王 tiers live in the SECOND table; baseFormIdOf
    // alone returns them unchanged, which would report them as real heroes.
    expect(baseChampionOf("godie-u001")).toBe("godie-ubal");
    expect(isTransformedBody("godie-u001")).toBe(true);
  });
});

describe("buildResetPlan", () => {
  it("splits the delta per kind, in BOTH directions", () => {
    const live = doc(["a", "b"], ["i1", "i2"], ["a.q"]);
    const starter = bundle(["a"], ["i1", "i3"], ["a.q"]);
    const plan = buildResetPlan({ live, starter });

    expect(plan.byKind.champions.off).toEqual(["b"]);
    expect(plan.byKind.champions.on).toEqual([]);
    // Items are BIDIRECTIONAL — a panel that only reports "off" lies about them
    // (the live ggd.adms.ai delta is 43 off / 9 on).
    expect(plan.byKind.items.off).toEqual(["i2"]);
    expect(plan.byKind.items.on).toEqual(["i3"]);
    expect(plan.byKind.items.liveCount).toBe(2);
    expect(plan.byKind.items.starterCount).toBe(2);
  });

  it("classifies a 變身態 whose base survives as an INVISIBLE change", () => {
    const live = doc([ALT_BASE, ALT], [], []);
    const starter = bundle([ALT_BASE], [], []);
    const plan = buildResetPlan({ live, starter });

    expect(plan.championsOff).toHaveLength(1);
    expect(plan.championsOff[0]?.cls).toBe("form-base-kept");
    expect(plan.championsOff[0]?.baseId).toBe(ALT_BASE);
    expect(plan.championsOff[0]?.baseStaysEnabled).toBe(true);
    expect(visibleHeroLosses(plan, sel("champions"))).toEqual([]);
  });

  it("classifies a champion the starter does not carry as a REAL HERO LOSS", () => {
    // THE ANTI-HARD-CODING GUARD. `godie-hblm` is a base champion (not in the
    // 26-pair table); the starter here deliberately omits it, which is exactly
    // the case that today's live whitelist does NOT contain.
    const live = doc([ALT_BASE, "godie-hblm"], [], []);
    const starter = bundle([ALT_BASE], [], []);
    const plan = buildResetPlan({ live, starter });

    const losses = visibleHeroLosses(plan, sel("champions"));
    expect(losses.map((r) => r.id)).toEqual(["godie-hblm"]);
    expect(losses[0]?.cls).toBe("real-hero");
  });

  it("classifies a 變身態 whose base ALSO goes as a real loss", () => {
    const live = doc([ALT], [], []);
    const starter = bundle(["godie-e001"], [], []);
    const plan = buildResetPlan({ live, starter });

    expect(plan.championsOff[0]?.cls).toBe("form-base-lost");
    expect(plan.championsOff[0]?.baseStaysEnabled).toBe(false);
    expect(visibleHeroLosses(plan, sel("champions")).map((r) => r.id)).toEqual([ALT]);
  });

  it("asks the STARTER set, not the live set, whether the base survives", () => {
    // The base is enabled live but NOT in the starter, so after the reset it is
    // gone. Answering from the live doc would paint this grey ("玩家看不到差別")
    // when in fact the whole character disappears.
    const live = doc([ALT, ALT_BASE], [], []);
    const starter = bundle(["godie-e001"], [], []);
    const plan = buildResetPlan({ live, starter });

    const byId = new Map(plan.championsOff.map((r) => [r.id, r]));
    expect(byId.get(ALT)?.cls).toBe("form-base-lost");
    expect(byId.get(ALT_BASE)?.cls).toBe("real-hero");
  });

  it("carries the display name when the content tree gave one, and says so when not", () => {
    const plan = buildResetPlan({
      live: doc([ALT_BASE, ALT], [], []),
      starter: bundle([ALT_BASE], [], []),
      championNames: new Map([[ALT, "超級賽亞人"]]),
    });
    expect(plan.championsOff[0]?.name).toBe("超級賽亞人");
    expect(plan.championsOff[0]?.named).toBe(true);

    const noName = buildResetPlan({ live: doc([ALT_BASE, ALT], [], []), starter: bundle([ALT_BASE], [], []) });
    expect(noName.championsOff[0]?.name).toBe(ALT);
    expect(noName.championsOff[0]?.named).toBe(false);
  });

  it("refuses the whole plan when a starter kind is empty", () => {
    const plan = buildResetPlan({ live: doc(["a"], ["i"], []), starter: bundle([], ["i"], []) });
    expect(plan.refuse).not.toBeNull();
    expect(plan.refuse?.reason).toBe("empty-starter");
    expect(plan.refuse?.kinds).toContain("champions");
    expect(canProceed(plan, sel("champions"))).toBe(false);
  });
});

describe("scope selection", () => {
  const live = doc(["a", "b"], ["i1", "i2"], [...kit("a"), ...kit("b")]);
  const starter = bundle(["a"], ["i1"], kit("a"));
  const plan = buildResetPlan({ live, starter });

  it("defaults to 英雄 only — the owner's own words, and the only safe default", () => {
    expect([...defaultSelection()]).toEqual(["champions"]);
  });

  it("counts only the ticked kinds", () => {
    expect(totalOff(plan, sel("champions"))).toBe(1);
    expect(totalOff(plan, sel("champions", "items"))).toBe(2);
    expect(totalOff(plan, sel("champions", "items", "abilities"))).toBe(7);
  });

  it("leaves unticked kinds byte-identical in the resulting document", () => {
    const next = resetResultDoc(live, starter, sel("champions"));
    expect(next.champions).toEqual(["a"]);
    expect(next.items).toEqual(live.items);
    expect(next.abilities).toEqual(live.abilities);
  });

  it("sends the server an expect map covering exactly the ticked kinds", () => {
    expect(buildExpect(plan, sel("champions"))).toEqual({ champions: 1 });
    expect(buildExpect(plan, sel("champions", "abilities"))).toEqual({ champions: 1, abilities: 5 });
  });
});

describe("half-enabled champions", () => {
  it("resetting ABILITIES alone strands a live champion the starter lacks", () => {
    const live = doc(["a", "b"], [], [...kit("a"), ...kit("b")]);
    const starter = bundle(["a"], [], kit("a"));

    const stranded = halfEnabledAfterReset(live, starter, sel("abilities"));
    expect(stranded.map((h) => h.id)).toEqual(["b"]);
    expect(stranded[0]?.missing).toContain("b.ex");
  });

  it("resetting CHAMPIONS alone strands nothing — the leftover ability ids are unreachable", () => {
    const live = doc(["a", "b"], [], [...kit("a"), ...kit("b")]);
    const starter = bundle(["a"], [], kit("a"));
    expect(halfEnabledAfterReset(live, starter, sel("champions"))).toEqual([]);
  });

  it("resetting both together is clean", () => {
    const live = doc(["a", "b"], [], [...kit("a"), ...kit("b")]);
    const starter = bundle(["a"], [], kit("a"));
    expect(halfEnabledAfterReset(live, starter, sel("champions", "abilities"))).toEqual([]);
  });
});

describe("legendary pool cross-check", () => {
  it("is computed from the loot table, so it turns non-zero on its own", () => {
    const live = doc(["a"], ["keep", "legendary-x"], []);
    const starter = bundle(["a"], ["keep"], []);
    const plan = buildResetPlan({ live, starter });

    // Today (all 49 legendary ids are in the starter) this is empty…
    expect(legendaryItemsOff(plan, ["keep"])).toEqual([]);
    // …and it reports the item the moment the pool holds something the starter
    // does not carry. No id is written down anywhere for this to work.
    expect(legendaryItemsOff(plan, ["keep", "legendary-x"])).toEqual(["legendary-x"]);
  });

  it("parses the shipped loot-table shape and tolerates garbage", () => {
    expect(parseLootTableItemIds({ entries: [{ itemId: "a", weight: 1 }, { itemId: "b" }] })).toEqual(["a", "b"]);
    expect(parseLootTableItemIds({ entries: [{ weight: 1 }, null, "x"] })).toEqual([]);
    expect(parseLootTableItemIds(null)).toEqual([]);
    expect(parseLootTableItemIds({})).toEqual([]);
  });
});

describe("the two confirmations", () => {
  const live = doc(["a", "b", "c"], ["i1"], []);
  const starter = bundle(["a"], ["i1", "i2"], []);
  const plan = buildResetPlan({ live, starter });

  it("quotes the CURRENT numbers, and they move with the tick boxes", () => {
    expect(confirmSummary(plan, sel("champions"))).toContain("關掉 2 個項目");
    expect(confirmSummary(plan, sel("champions"))).toContain("打開 0 個項目");
    expect(confirmSummary(plan, sel("champions", "items"))).toContain("關掉 2 個項目");
    expect(confirmSummary(plan, sel("champions", "items"))).toContain("打開 1 個項目");
    expect(confirmSummary(plan, sel("items"))).toContain("道具");
  });

  it("demands the typed number, and the number is the off-count for the SELECTION", () => {
    expect(requiresTypedConfirm(plan, sel("champions"))).toBe(true);
    expect(typedConfirmOk(plan, sel("champions"), "")).toBe(false);
    expect(typedConfirmOk(plan, sel("champions"), "3")).toBe(false);
    expect(typedConfirmOk(plan, sel("champions"), "2")).toBe(true);
    expect(typedConfirmOk(plan, sel("champions"), " 2 ")).toBe(true);
  });

  it("does NOT demand typing for a scope that only ADDS", () => {
    // 道具 alone here turns nothing off. Making the operator type "0" would be
    // training them to treat the typing as a ritual.
    expect(totalOff(plan, sel("items"))).toBe(0);
    expect(totalOn(plan, sel("items"))).toBe(1);
    expect(requiresTypedConfirm(plan, sel("items"))).toBe(false);
    expect(typedConfirmOk(plan, sel("items"), "")).toBe(true);
  });

  it("cannot proceed with nothing ticked, or when the plan is a no-op", () => {
    expect(canProceed(plan, new Set())).toBe(false);
    const same = buildResetPlan({ live: doc(["a"], [], []), starter: bundle(["a"], [], []) });
    expect(canProceed(same, sel("champions"))).toBe(false);
  });
});
