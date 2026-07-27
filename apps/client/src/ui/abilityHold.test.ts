/**
 * task-152 hold-preview seam: the framework-free held-ability store (press →
 * slot, release → null, subscriber notification) and the pure content resolver
 * `describeHeldAbility` that turns a seat + slot into the SAME name/description/
 * cost-cooldown-cast meta the ability-bar tooltip shows. The client vitest env is
 * node (no DOM), so — like exSlot.test — only the pure pieces are exercised here;
 * the React overlay shell just renders these.
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { Champions, Abilities } from "@ggd/shared/sim/content/registry";
import type { ChampionId, AbilityId } from "@ggd/shared/ids";
import type { ChampionDef, AbilityDef } from "@ggd/shared/sim/content/defs";
import {
  getHeldAbility,
  setHeldAbility,
  subscribeHeldAbility,
  describeHeldAbility,
  UNRANKABLE_NOTE,
  type HeldSeat,
} from "./abilityHold";

const CHAMP_ID = "test-hold-hero" as ChampionId;
const EX_ID = "test-hold-hero.ex" as AbilityId;

/** A minimal AbilityDef; `description` rides on the doc, not the sim TS type. */
function ability(id: string, name: string, slot: string, extra: Record<string, unknown>): AbilityDef {
  return {
    id: id as AbilityId,
    name,
    slot,
    castType: "skillshot",
    maxRank: 3,
    cooldown: [10, 9, 8],
    manaCost: [50, 55, 60],
    range: 14,
    effects: [],
    ...extra,
  } as unknown as AbilityDef;
}

beforeAll(() => {
  Champions.register(CHAMP_ID, {
    id: CHAMP_ID,
    name: "測試英雄",
    role: "test",
    attackType: "ranged",
    modelKey: "none",
    baseStats: {},
    growth: {},
    abilities: {
      Q: ability(`${CHAMP_ID}.q`, "19-01 斷未", "Q", {
        radius: 3,
        description: "造成[c=damage]200[/c]點傷害",
      }),
      W: ability(`${CHAMP_ID}.w`, "19-02 技", "W", {}),
      E: ability(`${CHAMP_ID}.e`, "19-03 技", "E", {}),
      R: ability(`${CHAMP_ID}.r`, "19-04 技", "R", {}),
    },
    skillOrder: [],
    buildPriority: [],
    tags: [],
  } as unknown as ChampionDef);
  Abilities.register(EX_ID, {
    id: EX_ID,
    name: "22-002 月光決鬥",
    slot: "EX",
    castType: "self",
    maxRank: 1,
    cooldown: [60],
    manaCost: [100],
    range: 0,
    effects: [],
    description: "EX 專屬招式",
  } as unknown as AbilityDef);
});

afterEach(() => setHeldAbility(null));

describe("held-ability store (task-152)", () => {
  it("latches a slot on press and clears on release", () => {
    expect(getHeldAbility()).toBeNull();
    setHeldAbility("Q");
    expect(getHeldAbility()).toBe("Q");
    setHeldAbility(null);
    expect(getHeldAbility()).toBeNull();
  });

  it("notifies subscribers only on an actual change", () => {
    let hits = 0;
    const unsub = subscribeHeldAbility(() => hits++);
    setHeldAbility("W");
    setHeldAbility("W"); // unchanged → no extra notify
    setHeldAbility("E");
    expect(hits).toBe(2);
    unsub();
    setHeldAbility(null); // after unsubscribe → not counted
    expect(hits).toBe(2);
  });
});

describe("describeHeldAbility (task-152)", () => {
  const seat: HeldSeat = {
    championId: CHAMP_ID,
    abilityRanks: [0, 0, 0, 0],
    exAbilityId: EX_ID,
    exRank: 1,
    exCooldown: 0,
  };

  it("resolves a core slot: clean name, full name, description, meta rows", () => {
    const info = describeHeldAbility(seat, "Q")!;
    expect(info).not.toBeNull();
    expect(info.slot).toBe("Q");
    expect(info.name).toBe("斷未"); // number prefix stripped
    expect(info.fullName).toBe("19-01 斷未");
    expect(info.body).toBe("造成[c=damage]200[/c]點傷害");
    // 施法 / 冷卻 / 魔力, rank-1 numbers (unlearned → cooldown[0], manaCost[0])
    expect(info.meta).toEqual([
      { label: "施法", value: "技能預測" },
      { label: "冷卻", base: 10, factor: "cooldown", unit: "s" },
      { label: "魔力", value: "50" },
    ]);
  });

  it("uses rank-scaled cooldown/mana once learned", () => {
    const info = describeHeldAbility({ ...seat, abilityRanks: [2, 0, 0, 0] }, "Q")!;
    // rank 2 → cooldown[1]=9, manaCost[1]=55
    expect(info.meta).toContainEqual({ label: "冷卻", base: 9, factor: "cooldown", unit: "s" });
    expect(info.meta).toContainEqual({ label: "魔力", value: "55" });
  });

  it("resolves EX with a hotkey row, and hides a locked EX", () => {
    const ex = describeHeldAbility(seat, "EX")!;
    expect(ex.slot).toBe("EX");
    expect(ex.name).toBe("月光決鬥");
    expect(ex.body).toBe("EX 專屬招式");
    expect(ex.meta).toContainEqual({ label: "快捷", value: "F / Back" });
    // still LOCKED (exRank 0) → nothing to show
    expect(describeHeldAbility({ ...seat, exRank: 0 }, "EX")).toBeNull();
  });

  it("returns null for an unknown champion", () => {
    expect(describeHeldAbility({ ...seat, championId: "nope" }, "Q")).toBeNull();
  });

  /**
   * OWNER RULING, 2026-07-27 (gamepad remap): long-press-to-level stays, but the
   * two slots it CANNOT level must say why. On a pad, LB/RB use the identical
   * 400 ms gesture that levels Q/W/E/R — so with points in hand, silence reads
   * as a dead button, not as a rule.
   *
   * Asserted against the SHIPPED constants, and in the failing direction: the
   * defect is the absence of the line, so the test demands its presence in the
   * panel a player actually holds open. Deleting either `meta.push` turns this
   * red; so does emptying the string, because the constant is asserted to be
   * non-trivial and to name the skill point.
   */
  it("says WHY EX and 天生技 refuse a skill point", () => {
    const ex = describeHeldAbility(seat, "EX")!;
    expect(ex.meta).toContainEqual({ label: "等級", value: UNRANKABLE_NOTE.EX });

    // both notes must actually mention the point — an empty or vague string
    // satisfies `toContainEqual` above while telling the player nothing
    for (const note of [UNRANKABLE_NOTE.EX, UNRANKABLE_NOTE.PASSIVE]) {
      expect(note.length).toBeGreaterThan(4);
      expect(note).toContain("技能點");
    }

    // the four rankable slots must NOT carry it — a note on Q would be a lie,
    // and this is the assertion that stops the fix from being applied blanket
    for (const slot of ["Q", "W", "E", "R"] as const) {
      const info = describeHeldAbility(seat, slot);
      if (!info) continue;
      expect(info.meta.some((m) => m.label === "等級")).toBe(false);
    }
  });
});
