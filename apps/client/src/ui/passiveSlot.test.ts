/**
 * The SIXTH slot's pure read logic — the 天生技 (NN-00 innate) every champion
 * owns from level 1. Asserts the three facts the bars and the champ-select
 * profile depend on:
 *   1. it resolves through `champion.passiveAbility` → the STANDALONE ability
 *      doc (never an embedded copy, never the legacy `champion.passive` block);
 *   2. `innateKind` separates a pure 被動 (no cooldown, never pressable) from an
 *      ACTIVE innate (a real-cooldown D-slot ability) — the two need different
 *      tiles, and defaults to "passive" when a doc omits it;
 *   3. a champion with no NN-00 returns null. Three of the 111 heroes genuinely
 *      have none; that absence is a recovered fact, so the UI shows five slots
 *      rather than an empty sixth.
 *
 * (Client vitest env is node — no DOM — so the JSX bars are tested through this
 * extracted pure helper, exactly like `exSlot`.)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { Abilities, Champions } from "@ggd/shared/sim/content/registry";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import type { AbilityId, ChampionId } from "@ggd/shared/ids";
import type { AbilityDef, ChampionDef } from "@ggd/shared/sim/content/defs";
import { innateCastNote, innateKindLabel, passiveSlotView } from "./passiveSlot";

const PURE_ID = "passive-hero.passive";
const ACTIVE_ID = "active-hero.passive";

function abilityStub(id: string, over: Partial<AbilityDef>): AbilityDef {
  return {
    id: id as AbilityId,
    name: "00-00 未命名",
    slot: "PASSIVE",
    castType: "self",
    maxRank: 1,
    cooldown: [0],
    manaCost: [0],
    range: 0,
    effects: [],
    ...over,
  } as AbilityDef;
}

beforeAll(() => {
  registerSkeletonContent();
  Abilities.register(
    PURE_ID as AbilityId,
    abilityStub(PURE_ID, { name: "12-00 感應意脈", innateKind: "passive" }),
  );
  Abilities.register(
    ACTIVE_ID as AbilityId,
    abilityStub(ACTIVE_ID, {
      name: "22-00 嗚鎖打!",
      innateKind: "active",
      cooldown: [40],
      manaCost: [150],
      castType: "self",
    }),
  );
  // two champions cloned off the skeleton hero, each pointing at one innate
  const base = Champions.get("sela" as ChampionId);
  Champions.register("passive-hero" as ChampionId, {
    ...base,
    id: "passive-hero" as ChampionId,
    passiveAbility: PURE_ID,
  } as ChampionDef);
  Champions.register("active-hero" as ChampionId, {
    ...base,
    id: "active-hero" as ChampionId,
    passiveAbility: ACTIVE_ID,
  } as ChampionDef);
});

describe("the sixth slot (天生技)", () => {
  it("resolves the standalone NN-00 doc named by passiveAbility", () => {
    cover("shop-skill-details");
    const view = passiveSlotView("passive-hero");
    expect(view).not.toBeNull();
    expect(view!.id).toBe(PURE_ID);
    expect(view!.name).toBe("12-00 感應意脈");
    // the hero-number prefix is stripped for the tile caption
    expect(view!.displayName).toBe("感應意脈");
  });

  it("separates a pure 被動 from an ACTIVE innate", () => {
    cover("shop-skill-details");
    const pure = passiveSlotView("passive-hero")!;
    expect(pure.innateKind).toBe("passive");
    // a pure passive has no cooldown / cost to show at all
    expect(pure.cooldownSec).toBeUndefined();
    expect(pure.manaCost).toBeUndefined();
    expect(innateKindLabel(pure.innateKind)).toBe("被動");

    const active = passiveSlotView("active-hero")!;
    expect(active.innateKind).toBe("active");
    expect(active.cooldownSec).toBe(40);
    expect(active.manaCost).toBe(150);
    expect(innateKindLabel(active.innateKind)).toBe("主動");
    // both notes must state the level-1 ownership the owner insisted on
    expect(innateCastNote(pure.innateKind)).toContain("天生");
    expect(innateCastNote(active.innateKind)).toContain("等級 1");
  });

  it("returns null for a champion that genuinely has no NN-00", () => {
    cover("shop-skill-details");
    // the skeleton hero carries no passiveAbility — the same shape as the three
    // real champions with no innate in the source map
    expect(passiveSlotView("sela")).toBeNull();
    expect(passiveSlotView("")).toBeNull();
    expect(passiveSlotView(null)).toBeNull();
    expect(passiveSlotView("no-such-hero")).toBeNull();
  });
});
