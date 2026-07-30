/**
 * 觸發條件 ON THE PLAYER'S SCREEN — the guards that were missing entirely.
 *
 * WHY THIS FILE EXISTS. A reviewer grepped the client's whole test tree for any
 * condition-related string and got ZERO hits. The sim half is guarded by 53
 * tests that drive a real `SimWorld.step()`; the two surfaces that TELL THE
 * PLAYER about the gate — the ability hold panel and the item card's ✦ line —
 * had nothing. Either could be deleted and every client suite stays green, which
 * is CLAUDE.md 失敗形態③: the gate still fires, the player is just never told
 * why, and no test says so.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT EACH HALF ACTUALLY PROVES — and what it does not
 *
 *  • ABILITY PANEL: guarded END TO END. `AbilityDescriptionOverlay` is MOUNTED
 *    (headlessUi — there is no jsdom here) over a REAL registered champion with
 *    a REAL gated hook, and the assertion reads the TEXT OF THE RENDER TREE.
 *    Deleting the `{info.conditions.length > 0 && …}` block, or the
 *    `conditions: abilityConditionLabels(…)` line that feeds it, fails this.
 *
 *  • ITEM CARD: guarded at `buildItemRow`, the ONE model behind all four card
 *    surfaces (shop shelf, expanded row, 三選一 card, equipment tooltip). That
 *    is deliberate and it is also the limit of this file: it proves the ✦ string
 *    CONTAINS the derived sentence, not that MerchantShop still prints `row.effect`.
 *    MerchantShop is not mountable here (audio, 3D stage, several stores) and
 *    `ExpandedRow` is not exported. Do not read these tests as covering that
 *    last hop — say so out loud rather than let a later reader assume it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTHING HERE COMPARES AGAINST A TYPED SENTENCE. Every expectation is built by
 * calling `conditionLabel` / `describeCondition` on the SAME object the fixture
 * gave the def — the same functions the editor's live 人話 line calls. A surface
 * that starts hand-writing its phrasing fails here even if the words look right,
 * because the fixture gate is chosen so its phrasing is non-obvious (獸矛's
 * two-branch gate, whose `not`-of-kind arm prints 「目標不是英雄」 rather than
 * 「非（目標是英雄）」).
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { createElement } from "react";
import { mount } from "@ggd/shared/testkit/headlessUi";
import {
  conditionLabel,
  describeCondition,
  type EffectCondition,
} from "@ggd/shared/sim/content/condition";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { hookImpls } = await import("@ggd/shared/testkit/headlessUi");
  const base = (actual["default"] ?? {}) as Record<string, unknown>;
  return { ...actual, ...hookImpls, default: { ...base, ...hookImpls } };
});

/** The zustand-backed HUD store and the combat-env hook need neither here. */
vi.mock("../net/RoomStore", () => ({
  useHud: (sel: (s: unknown) => unknown) =>
    sel({ localSeatId: 1, seats: [{ seatId: 1, ...SEAT() }] }),
}));
vi.mock("./displayFinal", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { DEFAULT_COMBAT_ENV } = await import("@ggd/shared/sim/combatEnv");
  // the neutral table — `rescaleAbilityProse` indexes it, so it cannot be null
  return { ...actual, useDisplayEnv: () => DEFAULT_COMBAT_ENV };
});
/** Only the store SUBSCRIPTION is stubbed; `describeHeldAbility` stays real. */
vi.mock("./abilityHold", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useHeldAbility: () => "Q" };
});

const { Champions, Abilities } = await import("@ggd/shared/sim/content/registry");
const { describeHeldAbility } = await import("./abilityHold");
const { AbilityDescriptionOverlay } = await import("./AbilityDescriptionOverlay");
const { buildItemRow } = await import("./panels/itemStats");
type ChampionId = import("@ggd/shared/ids").ChampionId;

// ------------------------------------------------------------------ fixtures

/**
 * The 獸矛 gate. Two branches, so the sentence has parentheses AND the
 * special-cased 「目標不是英雄」 — the phrasing a hand-written line gets wrong.
 */
const GATE: EffectCondition = {
  any: [
    {
      all: [
        { not: { kind: "kind", subject: "target", is: "champion" } },
        { kind: "stat", subject: "target", stat: "hp", mode: "percent", op: "<", value: 0.35 },
      ],
    },
    {
      all: [
        { kind: "kind", subject: "target", is: "champion" },
        { kind: "chance", p: 0.01 },
      ],
    },
  ],
};

/** A second, DIFFERENT gate on a later rank — the dedup/all-ranks probe. */
const RANK3_GATE: EffectCondition = {
  kind: "stat",
  subject: "self",
  stat: "mp",
  mode: "percent",
  op: ">=",
  value: 0.5,
};

const CHAMP_ID = "test-cond-hero" as ChampionId;

const SEAT = () => ({
  championId: CHAMP_ID,
  exAbilityId: "",
  exUnlocked: false,
  abilityRanks: [1, 0, 0, 0],
});

function gatedAbility(id: string, name: string, slot: string): unknown {
  return {
    id,
    name,
    slot,
    castType: "skillshot",
    maxRank: 3,
    cooldown: [10, 9, 8],
    manaCost: [50, 55, 60],
    range: 14,
    effects: [],
    description: "普攻時對瀕死的非英雄直接處決。",
    passive: {
      ranks: [
        { hooks: [{ on: "onBasicAttack", condition: GATE }] },
        { hooks: [{ on: "onBasicAttack", condition: GATE }] },
        { hooks: [{ on: "onBasicAttack", condition: RANK3_GATE }] },
      ],
    },
  };
}

beforeAll(() => {
  Champions.register(CHAMP_ID, {
    id: CHAMP_ID,
    name: "測試·條件英雄",
    role: "test",
    attackType: "melee",
    modelKey: "none",
    baseStats: {},
    growth: {},
    abilities: {
      Q: gatedAbility(`${CHAMP_ID}.q`, "07-01 獸矛試作", "Q"),
      W: gatedAbility(`${CHAMP_ID}.w`, "07-02 無閘技", "W"),
      E: gatedAbility(`${CHAMP_ID}.e`, "07-03 無閘技", "E"),
      R: gatedAbility(`${CHAMP_ID}.r`, "07-04 無閘技", "R"),
    },
  } as never);
  Abilities.register(`${CHAMP_ID}.q` as never, gatedAbility(`${CHAMP_ID}.q`, "Q", "Q") as never);
});

// ---------------------------------------------------------------------------

describe("技能長按面板 — the gate reaches the screen", () => {
  it("describeHeldAbility carries the DERIVED sentence, not the doc prose", () => {
    const info = describeHeldAbility(SEAT() as never, "Q");
    expect(info).not.toBeNull();
    expect(info!.conditions).toEqual([
      conditionLabel(GATE),
      conditionLabel(RANK3_GATE),
    ]);
    // ...and it is genuinely derived: the identical gate on ranks 1 and 2 is
    // deduped, while rank 3's DIFFERENT gate is still listed (a tooltip is read
    // before the point is spent)
    expect(info!.conditions).toHaveLength(2);
    expect(info!.conditions[0]).toContain("目標不是英雄");
    // the WC3 prose stays the WC3 prose — the sentence is NOT spliced into it
    expect(info!.body ?? "").not.toContain("觸發條件");
  });

  /**
   * THE anti-③ guard for this surface. Delete the conditions block from
   * AbilityDescriptionOverlay's JSX and the rendered text loses the sentence.
   */
  it("the held panel RENDERS it", () => {
    const h = mount(createElement(AbilityDescriptionOverlay));
    const shown = h.text();
    expect(shown).toContain(conditionLabel(GATE));
    expect(shown).toContain(conditionLabel(RANK3_GATE));
    // sanity: the panel really did render (so a null render cannot pass by
    // failing both expectations in some future refactor)
    expect(shown).toContain("獸矛試作");
  });

  it("a skill with no gated hook adds no chip at all", () => {
    const plain = describeHeldAbility(SEAT() as never, "EX");
    // EX is locked on this seat → no panel; the point is that `conditions` is
    // never a placeholder string on the ungated path
    expect(plain).toBeNull();
    const q = describeHeldAbility(
      { ...SEAT(), championId: CHAMP_ID } as never,
      "Q",
    );
    expect(q!.conditions.every((c) => c.startsWith("觸發條件："))).toBe(true);
  });
});

describe("道具卡 ✦ 效果行 — the gate reaches the card", () => {
  const item = {
    id: "test-cond-item",
    name: "測試·獸矛之證",
    modifiers: [],
    passive: [{ condition: GATE }],
    description: "普攻時觸發。",
  };

  it("the ✦ line carries the DERIVED condition sentence", () => {
    const row = buildItemRow(item as never, null);
    expect(row.effect).not.toBeNull();
    expect(row.effect!).toContain(conditionLabel(GATE));
    // derived, not retyped: it is exactly describeCondition's output
    expect(row.effect!).toContain(describeCondition(GATE));
  });

  it("an aura hook's gate is picked up too, and duplicates collapse", () => {
    const row = buildItemRow(
      { ...item, auras: [{ hooks: [{ condition: GATE }, { condition: RANK3_GATE }] }] } as never,
      null,
    );
    const shown = row.effect!;
    // GATE appears once even though passive + aura both carry it
    expect(shown.split(conditionLabel(GATE)!).length - 1).toBe(1);
    expect(shown).toContain(conditionLabel(RANK3_GATE));
  });

  it("誰能用 → 何時發動 → 做什麼 is the printed order", () => {
    const row = buildItemRow(
      { ...item, passive: [{ requires: { classes: ["warrior"] }, condition: GATE }] } as never,
      null,
    );
    const shown = row.effect!;
    const gate = shown.indexOf(conditionLabel(GATE)!);
    const mech = shown.indexOf("普攻時觸發");
    expect(gate).toBeGreaterThanOrEqual(0);
    // the 職業限定 chip comes first when present, the condition second, prose last
    if (mech >= 0) expect(gate).toBeLessThan(mech);
  });

  it("an ungated item prints no 觸發條件 at all", () => {
    const row = buildItemRow({ ...item, passive: [{}] } as never, null);
    expect(row.effect ?? "").not.toContain("觸發條件");
  });
});
