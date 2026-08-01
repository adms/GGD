/**
 * 模板複數套用 — THE STACK EXPANDER'S GUARDS
 * (owner 2026-07-31「我們討論的技能記得都要能用編輯器編輯模板跟複數選取」)
 *
 * WHAT THIS FILE IS FOR, IN THE PROJECT'S OWN VOCABULARY:
 *
 *  ② 「算出來但從沒送到客戶端」 — the whole risk of a stack is that card 2 is
 *     computed and then quietly dropped on the floor. Every test below reads the
 *     MERGED result (and the trace) rather than asserting that `expandStack` was
 *     called, and `mergeExpansion → zAbilityDoc.parse` is exercised so the thing
 *     asserted on is the object the REGISTRY would accept, not a private shape.
 *  ⑤ 「被測的不是出貨的那個」 — every template here is read off
 *     `content/ability-templates/*.json` on disk and its params are the shipped
 *     `defaultParamsFor` values. Nothing is hand-rolled.
 *  ⑦ 「掃屬性代替掃行為」 — `expect(trace.cards).toHaveLength(2)` would pass on
 *     an expander that ignored card 2 entirely, so the assertions are about what
 *     the second card CONTRIBUTED (its effects being present in `result.effects`,
 *     its hook being present in `result.passive`), not about the trace's shape.
 *
 * MUTATION LOG (第二守則 — each of these was actually run):
 *   · delete `for (const e of ex.effects) { … effects.push(e) }`'s push
 *     → 「stacked cards CONCATENATE their effects」 red (1 !== 2).
 *   · `mergePassive`: `[...av, ...bv]` → `av`
 *     → 「two proc cards keep BOTH hooks」 red (1 hook, not 2).
 *   · `resolveScalar`/scalar loop: `const keepsHeld = ctx.onConflict !== "lastWins"`
 *     → `true` → 「lastWins really does let the later card win」 red.
 *   · `expandStackOrThrow`: drop the `trace.conflicts.length > 0` guard
 *     → 「reject refuses to expand a collision」 red (no throw).
 *   · `normalizeTemplateBinding`: `return { cards: [v], … }` → `{ cards: [], … }`
 *     → 「the pre-2026-07-31 single-card shape still loads」 red.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  zTemplateDoc,
  zAbilityTemplateBinding,
  DEFAULT_TEMPLATE_CONFLICT,
  TEMPLATE_STACK_MAX_CARDS,
  type TemplateDoc,
} from "../schema/template";
import { zAbilityDoc } from "../schema/ability";
import { defaultParamsFor } from "./paramsSchema";
import {
  expand,
  expandStack,
  expandStackOrThrow,
  mergeExpansion,
  normalizeTemplateBinding,
  denormalizeTemplateBinding,
  describeStackConflicts,
  type TemplateStackCard,
} from "./expand";

const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../content/ability-templates",
);

function allTemplates(): TemplateDoc[] {
  return readdirSync(TEMPLATES_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => zTemplateDoc.parse(JSON.parse(readFileSync(join(TEMPLATES_DIR, f), "utf8"))));
}

const TEMPLATES = allTemplates();
const ENABLED = TEMPLATES.filter((t) => t.status === "enabled");

function tpl(id: string): TemplateDoc {
  const hit = TEMPLATES.find((t) => t.id === id);
  if (hit === undefined) throw new Error(`fixture template ${id} is not shipped`);
  return hit;
}

/** A card built from a SHIPPED template and its SHIPPED defaults. */
function card(id: string, overrides: Record<string, unknown> = {}): TemplateStackCard {
  const template = tpl(id);
  return { template, params: { ...defaultParamsFor(template), ...overrides } };
}

// ---------------------------------------------------------------------------
// 1-A · the binding shape: three forms in, one ordered card list out
// ---------------------------------------------------------------------------

describe("normalizeTemplateBinding — 三種寫法，一種語意", () => {
  it("the pre-2026-07-31 single-card shape still loads (BACK-COMPAT)", () => {
    const legacy = { ref: "tpl-single-strike", params: { damageType: "physical" } };
    expect(zAbilityTemplateBinding.safeParse(legacy).success).toBe(true);
    const n = normalizeTemplateBinding(legacy);
    expect(n.form).toBe("single");
    expect(n.cards).toEqual([legacy]);
    expect(n.onConflict).toBe(DEFAULT_TEMPLATE_CONFLICT);
  });

  it("an ORDERED ARRAY keeps its order (that is what makes the stack a stack)", () => {
    const n = normalizeTemplateBinding([
      { ref: "tpl-ground-nova", params: {} },
      { ref: "tpl-buff-self", params: {} },
    ]);
    expect(n.form).toBe("array");
    expect(n.cards.map((c) => c.ref)).toEqual(["tpl-ground-nova", "tpl-buff-self"]);
  });

  it("the explicit stack form carries the policy; the other two take the default", () => {
    expect(
      normalizeTemplateBinding({
        cards: [{ ref: "tpl-ground-nova", params: {} }],
        onConflict: "lastWins",
      }).onConflict,
    ).toBe("lastWins");
    expect(normalizeTemplateBinding([{ ref: "tpl-ground-nova", params: {} }]).onConflict).toBe(
      "reject",
    );
  });

  it("the default is 重複即拒 — owner keeps the switch, the code does not guess quietly", () => {
    expect(DEFAULT_TEMPLATE_CONFLICT).toBe("reject");
  });

  it("BOUNDS: 0 cards and MAX+1 cards are both refused by the schema", () => {
    const one = { ref: "tpl-ground-nova", params: {} };
    expect(zAbilityTemplateBinding.safeParse([]).success).toBe(false);
    expect(zAbilityTemplateBinding.safeParse({ cards: [] }).success).toBe(false);
    const tooMany = Array.from({ length: TEMPLATE_STACK_MAX_CARDS + 1 }, () => one);
    expect(zAbilityTemplateBinding.safeParse(tooMany).success).toBe(false);
    expect(
      zAbilityTemplateBinding.safeParse(tooMany.slice(0, TEMPLATE_STACK_MAX_CARDS)).success,
    ).toBe(true);
  });

  it("the expander refuses an over-long stack too, not just the schema", () => {
    const many = Array.from({ length: TEMPLATE_STACK_MAX_CARDS + 1 }, () =>
      card("tpl-ground-nova"),
    );
    expect(() => expandStack(many)).toThrow(/over the/);
    expect(() => expandStack([])).toThrow(/empty/);
  });

  it("denormalize→normalize round-trips, and a lone card stays in the LEGACY shape", () => {
    const one = { ref: "tpl-ground-nova", params: { radius: 400 } };
    const two = { ref: "tpl-buff-self", params: {} };
    // the no-spurious-diff property: re-saving a 1-card skill rewrites nothing
    expect(denormalizeTemplateBinding([one])).toEqual(one);
    expect(denormalizeTemplateBinding([one, two])).toEqual([one, two]);
    expect(denormalizeTemplateBinding([one, two], "lastWins")).toEqual({
      cards: [one, two],
      onConflict: "lastWins",
    });
    for (const [cards, policy] of [
      [[one], "reject"],
      [[one, two], "reject"],
      [[one, two], "lastWins"],
      [[one], "lastWins"],
    ] as const) {
      const round = normalizeTemplateBinding(denormalizeTemplateBinding(cards, policy));
      expect(round.cards).toEqual(cards);
      expect(round.onConflict).toBe(policy);
    }
  });

  it("garbage is rejected with a message, never normalised into a silent no-op", () => {
    expect(() => normalizeTemplateBinding({ ref: 7 })).toThrow();
    expect(() => normalizeTemplateBinding(null)).toThrow();
    // `.strict()` on both object branches is what keeps the union unambiguous
    expect(() => normalizeTemplateBinding({ ref: "tpl-x", params: {}, cards: [] })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 1-A · a ONE-card stack must be the old expander, exactly
// ---------------------------------------------------------------------------

describe("a 1-card stack is byte-identical to the pre-stack expand()", () => {
  /**
   * This is the load-bearing back-compat claim: every shipped ability that ever
   * adopts a template gets the SAME behaviour whether it stores the legacy
   * `{ref,params}` or a 1-element stack. Run over every enabled family rather
   * than one sample, so a family added later cannot quietly diverge.
   */
  it("holds for all 16 enabled shipped templates, on their shipped defaults", () => {
    expect(ENABLED.length).toBeGreaterThanOrEqual(16);
    for (const t of ENABLED) {
      const params = defaultParamsFor(t);
      const solo = expandStack([{ template: t, params }]).result;
      expect(solo, t.id).toEqual(expand(t, params));
    }
  });

  it("and a 1-card stack can never conflict, under either policy", () => {
    for (const t of ENABLED) {
      const cards = [{ template: t, params: defaultParamsFor(t) }];
      expect(expandStack(cards, "reject").trace.conflicts, t.id).toEqual([]);
      expect(expandStack(cards, "lastWins").trace.conflicts, t.id).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// 1-B · the merge itself
// ---------------------------------------------------------------------------

describe("stacked cards CONCATENATE their effects, in card order", () => {
  it("two blast cards produce TWO damage packets, not one", () => {
    const solo = expandStack([card("tpl-ground-nova")]).result;
    const { result, trace } = expandStack([
      card("tpl-ground-nova"),
      card("tpl-instant-blast", { damageType: "physical" }),
    ]);
    expect(solo.effects).toHaveLength(1);
    expect(result.effects).toHaveLength(2);
    // the SECOND card's payload is really in there — read off the merged object
    expect(result.effects[1]).toMatchObject({ kind: "damage", damageType: "physical" });
    // …and the trace says which card each packet came from
    expect(trace.effects.map((e) => e.cardIndex)).toEqual([0, 1]);
    expect(trace.effects[1]?.templateId).toBe("tpl-instant-blast");
  });

  it("order is the CARD order — swapping the cards swaps the effects", () => {
    const ab = expandStack([card("tpl-ground-nova"), card("tpl-buff-self")]).result;
    const ba = expandStack([card("tpl-buff-self"), card("tpl-ground-nova")]).result;
    expect(ab.effects.map((e) => e.kind)).toEqual(["damage", "applyBuff"]);
    expect(ba.effects.map((e) => e.kind)).toEqual(["applyBuff", "damage"]);
  });

  it("每張卡都被吃進去 — the trace attributes non-zero output to EVERY card", () => {
    const { trace } = expandStack([
      card("tpl-ground-nova"),
      card("tpl-buff-self"),
      card("tpl-on-attack"),
    ]);
    expect(trace.cards).toHaveLength(3);
    expect(trace.cards.map((c) => c.effectCount)).toEqual([1, 1, 0]);
    // the proc card contributes no effect but DOES contribute a hook: a card
    // that reported 0 for both would be a card the expander silently dropped
    expect(trace.cards[2]?.hookCount).toBe(1);
    for (const c of trace.cards) {
      expect(c.effectCount + c.hookCount, `card ${c.index} (${c.templateId}) contributed nothing`)
        .toBeGreaterThan(0);
    }
  });
});

describe("two PROC cards keep BOTH hooks (the composition worth having)", () => {
  it("攻擊觸發 + 受擊反應 stack into one passive with two hooks", () => {
    const solo = expandStack([card("tpl-on-attack")]).result;
    const { result, trace } = expandStack([card("tpl-on-attack"), card("tpl-on-hit-react")]);
    expect(solo.passive?.ranks[0]?.hooks).toHaveLength(1);
    const hooks = result.passive?.ranks[0]?.hooks ?? [];
    expect(hooks).toHaveLength(2);
    expect(hooks.map((h) => h.on)).toEqual(["onBasicAttack", "onDamageTaken"]);
    // both cards agree on castType "self" and innateKind "passive" — AGREEMENT,
    // which must NOT be reported as a collision or `reject` would be useless
    expect(trace.conflicts).toEqual([]);
    expect(result.castType).toBe("self");
    expect(result.innateKind).toBe("passive");
  });

  it("a proc card and an active card compose: hooks kept AND the cast payload kept", () => {
    const { result } = expandStack([card("tpl-on-attack"), card("tpl-buff-self")]);
    expect(result.passive?.ranks[0]?.hooks).toHaveLength(1);
    expect(result.effects.map((e) => e.kind)).toEqual(["applyBuff"]);
  });
});

// ---------------------------------------------------------------------------
// 1-A · THE DECISION POINT: 後蓋前 vs 重複即拒
// ---------------------------------------------------------------------------

describe("conflict policy — the field, not a branch somebody picked", () => {
  /** 單體斬擊 is "targeted"; 原地震波 is "ground". A real, shipped disagreement. */
  const clashing = (): TemplateStackCard[] => [card("tpl-single-strike"), card("tpl-ground-nova")];

  it("AGREEMENT IS NOT A CONFLICT — same key, same value, no collision", () => {
    const { trace } = expandStack(clashing());
    // both cards emit targetsEnemies:true and castTimeSec:0
    expect(trace.conflicts.map((c) => c.key)).toEqual(["castType"]);
    const agreedKeys = trace.keys.filter((k) => k.agreed.length > 0).map((k) => k.key);
    expect(agreedKeys).toContain("targetsEnemies");
    expect(agreedKeys).toContain("castTimeSec");
  });

  it("reject: the FIRST writer keeps the key and expandStackOrThrow REFUSES", () => {
    const { result, trace } = expandStack(clashing(), "reject");
    expect(result.castType).toBe("targeted");
    expect(trace.conflicts[0]).toMatchObject({
      key: "castType",
      kept: { cardIndex: 0, templateId: "tpl-single-strike", value: "targeted" },
      dropped: { cardIndex: 1, templateId: "tpl-ground-nova", value: "ground" },
    });
    expect(() => expandStackOrThrow(clashing(), "reject")).toThrow(/castType/);
    expect(describeStackConflicts(trace)).toContain("tpl-ground-nova");
  });

  it("lastWins: the LATER card really does win, and the loser stays visible", () => {
    const { result, trace } = expandStack(clashing(), "lastWins");
    expect(result.castType).toBe("ground");
    const castType = trace.keys.find((k) => k.key === "castType");
    expect(castType?.winner).toMatchObject({ cardIndex: 1, value: "ground" });
    // 「我填的數字去哪了」 has an answer instead of a shrug
    expect(castType?.shadowed).toEqual([
      { cardIndex: 0, templateId: "tpl-single-strike", value: "targeted" },
    ]);
    // …and lastWins does NOT throw
    expect(expandStackOrThrow(clashing(), "lastWins").castType).toBe("ground");
  });

  it("ownership follows the policy — `owns` is not just「the last card to speak」", () => {
    expect(
      expandStack(clashing(), "reject").trace.cards.map((c) => c.owns),
    ).toEqual([["castType", "castTimeSec", "targetsEnemies"], ["radius"]]);
    expect(
      expandStack(clashing(), "lastWins").trace.cards.map((c) => c.owns),
    ).toEqual([["castTimeSec", "targetsEnemies"], ["castType", "radius"]]);
  });

  it("a numeric collision is caught too, not just the enum one", () => {
    const cards = [card("tpl-ground-nova", { radius: 300 }), card("tpl-instant-blast")];
    const { trace } = expandStack(cards, "reject");
    expect(trace.conflicts.map((c) => c.key)).toContain("radius");
  });
});

// ---------------------------------------------------------------------------
// ② the merged expansion must be something the REGISTRY would accept
// ---------------------------------------------------------------------------

describe("a stacked expansion survives the registry's own pipeline", () => {
  /** The skeleton half a templated doc keeps on disk. */
  const skeleton = (template: unknown): Record<string, unknown> => ({
    schema: "ability@1",
    id: "godie-stack.q",
    name: "疊卡測試",
    slot: "Q",
    castType: "self",
    maxRank: 1,
    cooldown: [8],
    manaCost: [50],
    range: 5,
    effects: [],
    template,
  });

  /**
   * 原地震波 + 範圍逐一施法, both `castType: "ground"` and both pinned to the
   * SAME radius so they agree on every scalar — a composition that needs no
   * policy at all, which is the shape most stacks will really have.
   */
  const composable = (): { ref: string; params: Record<string, unknown> }[] => [
    { ref: "tpl-ground-nova", params: defaultParamsFor(tpl("tpl-ground-nova")) },
    { ref: "tpl-proxy-fanout", params: { ...defaultParamsFor(tpl("tpl-proxy-fanout")), radius: 530 } },
  ];

  it("mergeExpansion → zAbilityDoc.parse accepts the 2-card result", () => {
    const binding = composable();
    const doc = skeleton(binding);
    const norm = normalizeTemplateBinding(doc["template"]);
    const cards = norm.cards.map((c) => ({ template: tpl(c.ref), params: c.params }));
    const merged = mergeExpansion(doc, expandStackOrThrow(cards, norm.onConflict));

    const parsed = zAbilityDoc.safeParse(merged);
    expect(parsed.success ? "" : JSON.stringify(parsed.error.issues)).toBe("");
    // BOTH cards reached the parsed doc — this is the ② assertion
    expect(
      (parsed as { success: true; data: { effects: { kind: string }[] } }).data.effects.map(
        (e) => e.kind,
      ),
    ).toEqual(["damage", "damage", "applyStatus"]);
  });

  it("the doc keeps the whole STACK on disk, so a template upgrade re-expands both", () => {
    const binding = composable();
    const cards = binding.map((c) => ({ template: tpl(c.ref), params: c.params }));
    const merged = mergeExpansion(skeleton(binding), expandStack(cards).result);
    expect(merged["template"]).toEqual(binding);
  });
});
