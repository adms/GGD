/**
 * ex-hud-button: the EX ability-bar slot's pure visibility/read logic. The 5th
 * slot renders ONLY when the hero has an EX skill AND it is unlocked (exRank>0);
 * it reads the EX ability's real name + cooldown sweep from the shared registry.
 * (The client vitest env is node — no DOM — so the JSX shells test the extracted
 * pure helper `exSlotView`, exactly as the other client UI logic is tested.)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { TICK_HZ } from "@ggd/shared/constants";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityId } from "@ggd/shared/ids";
import type { AbilityDef } from "@ggd/shared/sim/content/defs";
import { exSlotView } from "./exSlot";

const EX_ID = "test-hero.ex";

beforeAll(() => {
  Abilities.register(EX_ID as AbilityId, {
    id: EX_ID as AbilityId,
    name: "究極EX招式",
    slot: "EX",
    castType: "self",
    maxRank: 1,
    cooldown: [60],
    manaCost: [100],
    range: 0,
    effects: [],
  } as AbilityDef);
});

describe("EX ability-bar slot visibility (ex-hud-button)", () => {
  it("is hidden without an EX skill and while locked, shown once unlocked", () => {
    cover("ex-hud-button");
    // hero has NO EX skill (exAbilityId "")
    expect(exSlotView({ exAbilityId: "", exRank: 0, exCooldown: 0 })).toBeNull();
    // hero HAS an EX but it is still locked (pre-unlock, exRank 0)
    expect(exSlotView({ exAbilityId: EX_ID, exRank: 0, exCooldown: 0 })).toBeNull();
    // unlocked and off cooldown → visible, real name, no sweep
    const ready = exSlotView({ exAbilityId: EX_ID, exRank: 1, exCooldown: 0 });
    expect(ready).not.toBeNull();
    expect(ready!.name).toBe("究極EX招式");
    expect(ready!.sweep).toBe(0);
  });

  it("reports the cooldown sweep from remaining ticks (ex-hud-button)", () => {
    cover("ex-hud-button");
    // 30s remaining on a 60s cd → half-swept
    const mid = exSlotView({ exAbilityId: EX_ID, exRank: 1, exCooldown: 30 * TICK_HZ })!;
    expect(mid.cdSecs).toBeCloseTo(30, 6);
    expect(mid.sweep).toBeCloseTo(0.5, 6);
    // an unknown ability id resolves to null (defensive)
    expect(exSlotView({ exAbilityId: "nope.ex", exRank: 1, exCooldown: 0 })).toBeNull();
  });
});
