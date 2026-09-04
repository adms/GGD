/**
 * 觸發條件編輯器 — THE GUARDS. What an author can actually BUILD with the
 * dropdowns, and what object comes out the other side.
 *
 * WHY THIS FILE EXISTS. Until 2026-07-31 the editor half of the condition
 * feature — the half owner named explicitly (「on-attack by condition 這個一定
 * 要實作，**編輯器也要配合**」) — had ZERO tests. A reviewer deleted the whole
 * `{conditionSlots.map(…)}` block from ForgeStudio and ran `vitest --root
 * apps/editor`: 9 files / 41 tests, all green. The feature could be silently
 * withdrawn and nothing anywhere said so — CLAUDE.md 失敗形態③ exactly.
 *
 * The same run found the second defect: `flatten()` returned `null` for
 * `tpl-on-attack`'s own slot default, so 獸矛 — THE card the feature was built
 * for — opened READ-ONLY. Both are pinned below.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT MAKES THESE BEHAVIOUR GUARDS AND NOT PROPERTY GUARDS
 *
 * Nothing here asserts 「the component has class X」 or 「props carry field Y」.
 * Every test MOUNTS the widget inside a stateful host (so `value`/`onChange`
 * form a real controlled loop), fires the REAL handler on the REAL control, and
 * then asserts on the `EffectCondition` OBJECT the widget emitted — the same
 * object `expand()` writes into the doc and `evaluateCondition` gates on. The
 * decisive test builds the entire 獸矛 gate by clicking, and deep-equals the
 * result against the shipped template default read off disk.
 *
 * The sentence assertions never compare against a typed string. They compare
 * against `describeCondition(<the object the widget just emitted>)` computed
 * here at runtime, over several different states reached by editing — so
 * replacing the derived line with hand-written phrasing fails on the first state
 * whose phrasing differs, and 「目標不是英雄」 (describeCondition's special-cased
 * negation) is one of the states on purpose.
 *
 * There is no jsdom in this monorepo; `@ggd/shared/testkit/headlessUi` supplies
 * the hook dispatcher and a plain host tree. See its header.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import type { ReactElement } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * The hook dispatcher. Element creation (`react/jsx-runtime`) stays REAL — only
 * `useState` / `useMemo` are ours, which is what makes a node-only render
 * interactive.
 */
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { hookImpls } = await import("@ggd/shared/testkit/headlessUi");
  const base = (actual["default"] ?? {}) as Record<string, unknown>;
  return { ...actual, ...hookImpls, default: { ...base, ...hookImpls } };
});

import { useState } from "react";
import { mount, textOf, optionValues, type HostNode } from "@ggd/shared/testkit/headlessUi";
import { ConditionEditor, flatten, unflatten } from "./ConditionEditor";
import {
  describeCondition,
  CONDITION_MAX_CHILDREN,
  type EffectCondition,
} from "@ggd/shared/sim/content/condition";
// the REAL authoring schema — an emitted gate that does not parse here is one
// `expand()` would refuse to write, so the form must never be able to build it
import { zEffectCondition } from "@ggd/shared/content/schema/condition";

// ------------------------------------------------------------------ fixtures

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));

/**
 * The FLAGSHIP gate, read off the shipped template rather than retyped. If
 * somebody re-cuts 獸矛 in `content/`, these tests follow it — which is the
 * point: the claim under test is 「the editor can open the card that ships」,
 * not 「the editor can open this particular literal」.
 */
function flagshipGate(): EffectCondition {
  const raw = readFileSync(
    join(REPO, "content/ability-templates/tpl-on-attack.json"),
    "utf8",
  );
  const tpl = JSON.parse(raw) as {
    params: { condition: { default: EffectCondition } };
  };
  return tpl.params.condition.default;
}

/** Where the emitted object lands. Re-armed per test. */
const bus: { value: EffectCondition | undefined; seed: EffectCondition | undefined } = {
  value: undefined,
  seed: undefined,
};

beforeEach(() => {
  bus.value = undefined;
  bus.seed = undefined;
});

/**
 * A stateful host, so `value` → controls → `onChange` → `value` is a REAL
 * controlled loop rather than a one-way render. Without it a test could not
 * tell a widget that emits the right object from one that emits it and then
 * fails to draw it back.
 */
function Host(): ReactElement {
  const [value, setValue] = useState<EffectCondition | undefined>(bus.seed);
  bus.value = value;
  return createElement(ConditionEditor, {
    label: "condition · 觸發條件",
    value,
    onChange: setValue,
  });
}

function open(seed: EffectCondition | undefined) {
  bus.seed = seed;
  const h = mount(createElement(Host));
  return h;
}

/** The live 人話 line, minus its 「實際效果：」 caption. */
function sentence(h: ReturnType<typeof mount>): string {
  return textOf(h.field("cond.sentence").children).replace(/^實際效果：/, "");
}

/** Read the sentence AND check it is the shared describer's output, not prose. */
function derivedSentence(h: ReturnType<typeof mount>): string {
  const shown = sentence(h);
  const expected = describeCondition(bus.value) ?? "無條件，每次都觸發。";
  expect(shown).toBe(expected);
  return shown;
}

const clauseKinds = (h: ReturnType<typeof mount>): HostNode[] =>
  h.hosts().filter((n) => n.props["aria-label"] === "條件種類");

// ---------------------------------------------------------------------------

describe("ConditionEditor — the flagship card OPENS", () => {
  it("獸矛's shipped gate is editable, not the read-only fallback", () => {
    const gate = flagshipGate();

    // The defect this pins: `flatten` used to return null here.
    expect(flatten(gate)).not.toBeNull();

    const h = open(gate);
    expect(h.fieldOrNull("cond.readonly")).toBeNull();
    // two groups, four clauses, all of them driveable
    expect(h.fieldOrNull("cond.g0.c1.kind")).not.toBeNull();
    expect(h.fieldOrNull("cond.g1.c1.kind")).not.toBeNull();
    expect(clauseKinds(h)).toHaveLength(4);
    // and the outer join control is on screen with the real value
    expect(h.field("cond.join").props["value"]).toBe("any");
  });

  it("editing one clause of the flagship changes only that clause", () => {
    const h = open(flagshipGate());
    // group 0 clause 1 is 目標HP% < 35% — take it to 20%
    h.enter(h.field("cond.g0.c1.value"), "20");
    const after = bus.value as { any: [{ all: [unknown, { value: number }] }, unknown] };
    expect(after.any[0].all[1].value).toBeCloseTo(0.2, 6);
    // the hero branch is untouched
    expect(after.any[1]).toEqual((flagshipGate() as { any: unknown[] }).any[1]);
    expect(derivedSentence(h)).toContain("20%");
  });

  it("the emitted flagship still parses against the real Zod schema", () => {
    const h = open(flagshipGate());
    h.enter(h.field("cond.g1.c1.chance"), "2");
    expect(zEffectCondition.safeParse(bus.value).success).toBe(true);
  });
});

describe("ConditionEditor — building 獸矛 from an empty slot, by clicking", () => {
  /**
   * THE decisive test. Every control below is the one an author uses, in the
   * order they use it, and the assertion is that the object handed back is
   * BYTE-FOR-BYTE the gate the template ships. Break any single dropdown, the
   * group button, or the join select and this fails.
   */
  it("reproduces the shipped gate exactly", () => {
    const h = open(undefined);
    expect(sentence(h)).toBe("無條件，每次都觸發。");

    // ── group 1, clause 1: 非（目標是英雄） ──────────────────────────────
    h.press(h.field("cond.addFirst"));
    h.enter(h.field("cond.g0.c0.kind"), "kind");
    h.check(h.field("cond.g0.c0.not"), true);
    expect(h.field("cond.g0.c0.is").props["value"]).toBe("champion");

    // ── group 1, clause 2: 目標生命 < 35% (the pre-fill already says so) ──
    h.press(h.field("cond.g0.add"));
    expect(h.field("cond.g0.c1.stat").props["value"]).toBe("hp");
    expect(h.field("cond.g0.c1.mode").props["value"]).toBe("percent");
    expect(h.field("cond.g0.c1.op").props["value"]).toBe("<");
    h.enter(h.field("cond.g0.c1.value"), "35");
    // 且 is the group default, and the control exists to say otherwise
    expect(h.field("cond.g0.join").props["value"]).toBe("all");

    // ── group 2: 目標是英雄 且 1% 機率 ───────────────────────────────────
    h.press(h.field("cond.addGroup"));
    h.enter(h.field("cond.g1.c0.kind"), "kind");
    h.press(h.field("cond.g1.add"));
    h.enter(h.field("cond.g1.c1.kind"), "chance");
    h.enter(h.field("cond.g1.c1.chance"), "1");

    // ── the two groups are alternatives ──────────────────────────────────
    expect(h.field("cond.join").props["value"]).toBe("any");

    expect(bus.value).toEqual(flagshipGate());
    expect(derivedSentence(h)).toBe(
      "（目標不是英雄 且 目標生命 < 35%） 或 （目標是英雄 且 1% 機率）",
    );
  });

  /**
   * 「另一組」 must not be a button that lies. With one one-clause group the
   * tree it would build (`any:[A,B]`) is indistinguishable from adding a clause,
   * so no second box could ever appear; the control shows up exactly when it can
   * deliver one.
   */
  it("＋另一組 appears only once it can actually produce a second group", () => {
    const h = open({ kind: "chance", p: 0.25 });
    expect(h.fieldOrNull("cond.addGroup")).toBeNull();

    h.press(h.field("cond.g0.add")); // now two clauses in group 0
    expect(h.fieldOrNull("cond.addGroup")).not.toBeNull();

    h.press(h.field("cond.addGroup"));
    // and it really is a second BOX, not a third clause
    expect(h.fieldOrNull("cond.g1.c0.kind")).not.toBeNull();
    expect(h.field("cond.g0.remove").props["aria-label"]).toBe("刪除第 1 組");
    expect(bus.value).toEqual({
      any: [
        {
          all: [
            { kind: "chance", p: 0.25 },
            { kind: "stat", subject: "target", stat: "hp", mode: "percent", op: "<", value: 0.35 },
          ],
        },
        { kind: "stat", subject: "target", stat: "hp", mode: "percent", op: "<", value: 0.35 },
      ],
    });
  });

  it("flipping 群組之間 to 且 changes the emitted operator and the sentence", () => {
    const h = open(flagshipGate());
    const before = derivedSentence(h);
    h.enter(h.field("cond.join"), "all");
    expect(bus.value).toHaveProperty("all");
    expect(bus.value).not.toHaveProperty("any");
    const after = derivedSentence(h);
    expect(after).not.toBe(before);
    expect(after).toContain(" 且 ");
  });

  it("flipping ONE group's 組合方式 leaves the other group alone", () => {
    const h = open(flagshipGate());
    h.enter(h.field("cond.g0.join"), "any");
    const v = bus.value as { any: [{ any?: unknown; all?: unknown }, { all?: unknown }] };
    expect(v.any[0].any).toBeDefined();
    expect(v.any[0].all).toBeUndefined();
    expect(v.any[1].all).toBeDefined();
  });
});

describe("ConditionEditor — the one-group form still behaves like a flat list", () => {
  it("one group renders NO group chrome and no outer join", () => {
    const h = open({ kind: "chance", p: 0.25 });
    expect(h.fieldOrNull("cond.join")).toBeNull(); // 群組之間 hidden
    expect(h.fieldOrNull("cond.g0.remove")).toBeNull(); // 刪除這一組 hidden
    expect(h.fieldOrNull("cond.g0.join")).toBeNull(); // single clause → no 且/或
    expect(h.field("cond.g0.c0.chance").props["value"]).toBe(25);
  });

  it("＋加一個條件 stacks a second clause and reveals 組合方式", () => {
    const h = open({ kind: "chance", p: 0.25 });
    h.press(h.field("cond.g0.add"));
    expect(h.field("cond.g0.join").props["value"]).toBe("all");
    expect(bus.value).toEqual({
      all: [
        { kind: "chance", p: 0.25 },
        { kind: "stat", subject: "target", stat: "hp", mode: "percent", op: "<", value: 0.35 },
      ],
    });
    h.enter(h.field("cond.g0.join"), "any");
    expect(bus.value).toHaveProperty("any");
    derivedSentence(h);
  });

  it("✕ on the last clause empties the slot back to 無條件", () => {
    const h = open({ kind: "chance", p: 0.25 });
    h.press(h.field("cond.g0.c0.remove"));
    expect(bus.value).toBeUndefined();
    expect(sentence(h)).toBe("無條件，每次都觸發。");
  });

  it("刪除這一組 drops a whole group and collapses back to one level", () => {
    const h = open(flagshipGate());
    h.press(h.field("cond.g1.remove"));
    expect(bus.value).toEqual((flagshipGate() as { any: EffectCondition[] }).any[0]);
    expect(h.fieldOrNull("cond.join")).toBeNull(); // outer join gone again
  });

  it("清除 wipes the slot; the ＋ button comes back", () => {
    const h = open(flagshipGate());
    h.press(h.field("cond.clear"));
    expect(bus.value).toBeUndefined();
    expect(h.fieldOrNull("cond.addFirst")).not.toBeNull();
  });
});

describe("ConditionEditor — the coupled dropdowns repair each other", () => {
  it("edits both legal recentCast forms without raw JSON", () => {
    const h = open({ kind: "recentCast", subject: "self", slot: "Q", withinSec: 1 });
    expect(h.field("cond.g0.c0.recentCast.match").props["value"]).toBe("slot");
    h.enter(h.field("cond.g0.c0.slot"), "EX");
    expect(bus.value).toEqual({ kind: "recentCast", subject: "self", slot: "EX", withinSec: 1 });

    h.enter(h.field("cond.g0.c0.recentCast.match"), "ability");
    expect(h.fieldOrNull("cond.g0.c0.slot")).toBeNull();
    h.enter(h.field("cond.g0.c0.abilityId"), "godie-hart.r");
    h.enter(h.field("cond.g0.c0.withinSec"), "2.5");
    expect(bus.value).toEqual({
      kind: "recentCast",
      subject: "self",
      abilityId: "godie-hart.r",
      withinSec: 2.5,
    });
    expect(zEffectCondition.safeParse(bus.value).success).toBe(true);
  });

  it("retargeting 屬性 to a stat with no maximum drops percent mode", () => {
    const h = open({
      kind: "stat",
      subject: "target",
      stat: "hp",
      mode: "percent",
      op: "<",
      value: 0.35,
    });
    h.enter(h.field("cond.g0.c0.stat"), "attackSpeed");
    // the repair is `retargetStatLeaf`'s, not this widget's — what is asserted
    // is that the widget ROUTES through it rather than spreading `{...leaf}`
    expect((bus.value as { mode?: string }).mode).not.toBe("percent");
    expect(zEffectCondition.safeParse(bus.value).success).toBe(true);
    expect(h.field("cond.g0.c0.mode").props["disabled"]).toBe(true);
  });

  it("switching 條件種類 swaps the whole row of fields", () => {
    const h = open({ kind: "chance", p: 0.25 });
    expect(h.fieldOrNull("cond.g0.c0.stat")).toBeNull();
    h.enter(h.field("cond.g0.c0.kind"), "stat");
    expect(h.fieldOrNull("cond.g0.c0.chance")).toBeNull();
    expect(h.field("cond.g0.c0.stat").props["value"]).toBe("hp");
    expect((bus.value as { kind: string }).kind).toBe("stat");
  });

  it("機率 is typed as a percent and stored as a ratio", () => {
    const h = open({ kind: "chance", p: 0.25 });
    h.enter(h.field("cond.g0.c0.chance"), "1");
    expect(bus.value).toEqual({ kind: "chance", p: 0.01 });
    expect(derivedSentence(h)).toBe("1% 機率");
  });

  // 層數門檻（GH#301-5）。⭐ 承重的是**清空**那一半：schema 是 `.strict()` + `.min(1)`，
  // 一個留下 `minStacks: 0` 或 `NaN` 的實作會做出一張存不回去的卡，而畫面上看不出來。
  it("層數門檻寫得進去，清空是拿掉整格而不是留一個 0", () => {
    const h = open({ kind: "status", subject: "target", statusId: "root" as never });
    h.enter(h.field("cond.g0.c0.minStacks"), "3");
    expect(bus.value).toEqual({ kind: "status", subject: "target", statusId: "root", minStacks: 3 });
    h.enter(h.field("cond.g0.c0.minStacks"), "");
    expect(bus.value).toEqual({ kind: "status", subject: "target", statusId: "root" });
    expect(zEffectCondition.safeParse(bus.value).success).toBe(true);
  });

  it("每一個 select 只列出 shared 模組承認的值", () => {
    const h = open({ kind: "kind", subject: "target", is: "champion" });
    expect(optionValues(h.field("cond.g0.c0.subject"))).toEqual(["self", "target"]);
    expect(optionValues(h.field("cond.g0.c0.is"))).toEqual([
      "champion",
      "mob",
      "summon",
      "guardian",
      // ⭐ 2026-08-18 (GH#355)：大師球要問「這隻是不是特殊殭屍／殭屍王」，
      // 所以 `CONDITION_ENTITY_KINDS` 多了兩個成員。這條守衛的判準沒有變 ——
      // 下拉列的必須**恰好**是 shared 那份清單，⛔ 不多也不少。
      "mobSpecial",
      "mobBoss",
    ]);
  });

  it("both ＋ buttons stop at CONDITION_MAX_CHILDREN", () => {
    const h = open({ kind: "chance", p: 0.25 });
    for (let i = 1; i < CONDITION_MAX_CHILDREN; i++) h.press(h.field("cond.g0.add"));
    expect(h.field("cond.g0.add").props["disabled"]).toBe(true);
    expect(() => h.press(h.field("cond.g0.add"))).toThrow(/disabled/);
  });
});

describe("ConditionEditor — the 人話 line is DERIVED, never typed", () => {
  /**
   * Four states whose phrasings differ in ways a hand-written line would get
   * wrong: the `not`-of-kind special case (「目標不是英雄」, NOT 「非（目標是英雄
   * ）」), a nested group's parentheses, a bare leaf with none, and the empty
   * slot's fallback. Each is compared against `describeCondition` run here.
   */
  it("matches describeCondition through a whole editing session", () => {
    const h = open(undefined);
    expect(sentence(h)).toBe("無條件，每次都觸發。");

    h.press(h.field("cond.addFirst"));
    expect(derivedSentence(h)).toBe("目標生命 < 35%");

    h.enter(h.field("cond.g0.c0.kind"), "kind");
    h.check(h.field("cond.g0.c0.not"), true);
    // describeCondition's special case — a hand-written editor line would very
    // likely print 「非（目標是英雄）」 here, which is what makes this the probe
    expect(derivedSentence(h)).toBe("目標不是英雄");

    // one clause in one group: `any:[A,B]` reads back as one group of two, so
    // 「另一組」 is not offered yet — see canAddGroup
    expect(h.fieldOrNull("cond.addGroup")).toBeNull();
    h.press(h.field("cond.g0.add"));
    h.enter(h.field("cond.g0.join"), "any");
    expect(derivedSentence(h)).toBe("目標不是英雄 或 目標生命 < 35%");

    h.press(h.field("cond.addGroup"));
    h.enter(h.field("cond.g1.c0.kind"), "chance");
    // now group 0 is a real nested group, so it must parenthesise
    expect(derivedSentence(h)).toBe("（目標不是英雄 或 目標生命 < 35%） 或 15% 機率");
  });

  it("the read-only panel derives its sentence too", () => {
    const deep: EffectCondition = {
      any: [
        {
          all: [
            { kind: "kind", subject: "target", is: "champion" },
            { any: [{ kind: "chance", p: 0.5 }, { kind: "chance", p: 0.25 }] },
          ],
        },
        { kind: "chance", p: 0.1 },
      ],
    };
    const h = open(deep);
    expect(sentence(h)).toBe(describeCondition(deep));
  });
});

describe("ConditionEditor — read-only is EXPLICIT, not a silent degrade", () => {
  /** Three levels of grouping — deeper than the form draws, still legal content. */
  const threeLevels: EffectCondition = {
    any: [
      {
        all: [
          { kind: "kind", subject: "target", is: "champion" },
          { any: [{ kind: "chance", p: 0.5 }, { kind: "chance", p: 0.25 }] },
        ],
      },
      { kind: "chance", p: 0.1 },
    ],
  };

  it("says so in words, and offers exactly one way out", () => {
    expect(flatten(threeLevels)).toBeNull();
    const h = open(threeLevels);
    const note = textOf(h.field("cond.readonly").children);
    expect(note).toContain("只顯示不編輯");
    expect(note).toContain("仍然會照常載入與執行");
    // the copy must name BOTH shapes flatten() refuses, not just "too deep" —
    // `not` of a whole group is the other one and is not a depth problem
    expect(note).toContain("非");
    // no editable control anywhere — the author cannot half-edit it
    expect(clauseKinds(h)).toHaveLength(0);
    expect(h.fieldOrNull("cond.g0.add")).toBeNull();
    expect(h.fieldOrNull("cond.addGroup")).toBeNull();
  });

  it("清除並重建 drops to the empty editable form", () => {
    const h = open(threeLevels);
    h.press(h.field("cond.rebuild"));
    expect(bus.value).toBeUndefined();
    expect(h.fieldOrNull("cond.readonly")).toBeNull();
    expect(h.fieldOrNull("cond.addFirst")).not.toBeNull();
  });
});

describe("ConditionEditor — comparing against another live stat", () => {
  it("builds value + scale × other through controls and still parses", () => {
    const h = open({
      kind: "stat",
      subject: "self",
      stat: "hp",
      mode: "percent",
      op: "<",
      value: 0,
    });

    h.check(h.field("cond.g0.c0.other.enabled"), true);
    expect(bus.value).toEqual({
      kind: "stat",
      subject: "self",
      stat: "hp",
      mode: "percent",
      op: "<",
      value: 0,
      other: { subject: "target" },
    });

    h.enter(h.field("cond.g0.c0.other.stat"), "mp");
    h.enter(h.field("cond.g0.c0.other.scale"), "0.8");
    expect(bus.value).toHaveProperty("other", { subject: "target", stat: "mp", scale: 0.8 });
    expect(zEffectCondition.safeParse(bus.value).success).toBe(true);
    expect(derivedSentence(h)).toContain("×0.8");
  });

  it("does not offer a cross-family stat and can remove the operand without residue", () => {
    const h = open({
      kind: "stat",
      subject: "self",
      stat: "ad",
      op: ">=",
      value: 10,
      other: { subject: "target", stat: "armor", scale: 1.2 },
    });

    expect(optionValues(h.field("cond.g0.c0.other.stat"))).not.toContain("hp");
    expect(optionValues(h.field("cond.g0.c0.other.stat"))).toContain("armor");
    h.check(h.field("cond.g0.c0.other.enabled"), false);
    expect(bus.value).not.toHaveProperty("other");
    expect(zEffectCondition.safeParse(bus.value).success).toBe(true);
  });
});

describe("flatten / unflatten round-trip", () => {
  /**
   * `unflatten(flatten(x))` must EQUAL x for every tree the form can draw.
   * Anything less means opening a doc and saving it unchanged rewrites the gate
   * — the silent-corruption failure this widget exists to avoid.
   */
  const drawable: Array<[string, EffectCondition]> = [
    ["bare leaf", { kind: "chance", p: 0.01 }],
    ["negated leaf", { not: { kind: "kind", subject: "target", is: "mob" } }],
    [
      "one level, 且",
      {
        all: [
          { kind: "kind", subject: "self", is: "champion" },
          { kind: "stat", subject: "self", stat: "hp", mode: "percent", op: ">", value: 0.5 },
        ],
      },
    ],
    [
      "one level, 或",
      { any: [{ kind: "chance", p: 0.1 }, { kind: "chance", p: 0.2 }] },
    ],
    [
      "mixed: a bare clause beside a group",
      {
        any: [
          { kind: "chance", p: 0.1 },
          {
            all: [
              { kind: "kind", subject: "target", is: "guardian" },
              { kind: "stat", subject: "target", stat: "level", op: ">=", value: 3 },
            ],
          },
        ],
      },
    ],
  ];

  for (const [name, tree] of drawable) {
    it(`${name} survives a round trip`, () => {
      const flat = flatten(tree);
      expect(flat).not.toBeNull();
      expect(unflatten(flat!)).toEqual(tree);
    });
  }

  it("the flagship survives a round trip", () => {
    const gate = flagshipGate();
    const flat = flatten(gate);
    expect(flat).not.toBeNull();
    expect(unflatten(flat!)).toEqual(gate);
  });

  it("mounting the flagship and touching nothing emits nothing", () => {
    const h = open(flagshipGate());
    // a re-render must not rewrite the doc; `bus.value` is still the seed
    expect(bus.value).toEqual(flagshipGate());
    expect(h.fieldOrNull("cond.readonly")).toBeNull();
  });

  it("an empty slot flattens to zero groups and unflattens to undefined", () => {
    expect(flatten(undefined)).toEqual({ join: "all", groups: [] });
    expect(unflatten({ join: "all", groups: [] })).toBeUndefined();
    expect(unflatten({ join: "any", groups: [{ join: "all", clauses: [] }] })).toBeUndefined();
  });

  it("deeper than two levels flattens to null rather than being truncated", () => {
    expect(
      flatten({
        all: [{ any: [{ all: [{ kind: "chance", p: 0.5 }, { kind: "chance", p: 0.25 }] }] }],
      }),
    ).toBeNull();
    // `not` of a GROUP is the other shape the form skips — also honest null
    expect(
      flatten({ not: { all: [{ kind: "chance", p: 0.5 }, { kind: "chance", p: 0.25 }] } }),
    ).toBeNull();
  });
});
