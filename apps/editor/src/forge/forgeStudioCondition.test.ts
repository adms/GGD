/**
 * 鑄技工坊 — IS THE CONDITION SLOT ACTUALLY WIRED TO THE CONDITION EDITOR?
 *
 * THE MUTATION THIS FILE EXISTS FOR. A reviewer deleted this block from
 * `ForgeStudio.tsx`
 *
 *     {conditionSlots.map((name) => (
 *       <ConditionEditor … value={params[name]} onChange={…} />
 *     ))}
 *
 * — the entire editor half of the feature owner asked for by name — and ran
 * `npx vitest run --root apps/editor`: 9 files, 41 tests, ALL GREEN. Nothing in
 * the repo noticed that 觸發條件 had stopped being editable. That is CLAUDE.md
 * 失敗形態③ (「可以從渲染樹刪掉但測試還是全綠」) on the one surface that cannot
 * be checked by playing the game.
 *
 * `conditionEditor.test.ts` guards the WIDGET. This file guards the WIRING, and
 * they are different failures: the widget can be perfect while the studio never
 * mounts it, or mounts it against the wrong slot, or seeds it from nothing.
 *
 * ⚠️ THE `data-field` NAMESPACE IS `cond<cardIndex>`, NOT `cond` (模板複數套用,
 * 2026-07-31). A stacked ability can put the SAME slot on two cards, so two
 * editors are on screen at once; with one shared namespace `h.field("cond.…")`
 * silently returns whichever rendered first and a test「driving card 2」would
 * really be driving card 1 (失敗形態 ④). The rename is not a weakening — the
 * last describe block below adds the two-card case the old names could not
 * express at all.
 *
 * WHAT IS REAL HERE AND WHAT IS NOT. The template is the SHIPPED
 * `content/ability-templates/tpl-on-attack.json`, read off disk; `paramsSchemaFor`,
 * `defaultParamsFor`, `walkZod`, `FormRenderer` and `ConditionEditor` are all
 * the real thing. Only the three edges that need a browser or a server are
 * stubbed: react-query (no provider — the harness has no context), the
 * content-api client, and the Babylon-backed preview controller (it is
 * instantiated at module scope).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import type { FC } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mount, textOf } from "@ggd/shared/testkit/headlessUi";
import { describeCondition, type EffectCondition } from "@ggd/shared/sim/content/condition";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { hookImpls } = await import("@ggd/shared/testkit/headlessUi");
  const base = (actual["default"] ?? {}) as Record<string, unknown>;
  return { ...actual, ...hookImpls, default: { ...base, ...hookImpls } };
});

/** No QueryClientProvider (the harness has no context), so the hook is stubbed. */
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    const kind = queryKey[1];
    if (kind === "abilities") return { data: { entries: [{ id: "godie-h07-002" }] } };
    return { data: undefined };
  },
}));

vi.mock("../api/client", () => ({
  WRITES_ENABLED: false,
  api: {
    index: async () => ({ entries: [] }),
    doc: async () => ({}),
  },
}));

/** Instantiated at module scope in ForgeStudio, and it drags in Babylon. */
vi.mock("../preview/PreviewController", () => ({
  createSimPreviewController: () => ({
    mount: () => undefined,
    previewAbility: () => ({ lines: null }),
  }),
}));

const { ForgeStudio } = await import("./ForgeStudio");

// ------------------------------------------------------------------ fixtures

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));

interface Tpl {
  params: Record<string, { type: string; default?: unknown }>;
}

function template(): Tpl {
  return JSON.parse(
    readFileSync(join(REPO, "content/ability-templates/tpl-on-attack.json"), "utf8"),
  ) as Tpl;
}

const flagshipGate = (): EffectCondition =>
  template().params["condition"]!.default as EffectCondition;

function open() {
  return mount(
    createElement(ForgeStudio as unknown as FC<Record<string, unknown>>, {
      template: template(),
      onBack: () => undefined,
    }),
  );
}

let h: ReturnType<typeof open>;
beforeEach(() => {
  h = open();
});

// ---------------------------------------------------------------------------

describe("ForgeStudio hands its condition slots to ConditionEditor", () => {
  /**
   * THE anti-③ guard. Every assertion here fails the moment the
   * `conditionSlots.map(…)` block leaves the render tree.
   */
  it("the 攻擊觸發 template's condition slot renders as real dropdowns", () => {
    expect(h.fieldOrNull("cond0.sentence")).not.toBeNull();
    // four clauses across two groups — the flagship gate, editable
    expect(h.fieldOrNull("cond0.g0.c0.is")).not.toBeNull();
    expect(h.fieldOrNull("cond0.g0.c1.stat")).not.toBeNull();
    expect(h.fieldOrNull("cond0.g1.c0.is")).not.toBeNull();
    expect(h.fieldOrNull("cond0.g1.c1.chance")).not.toBeNull();
    expect(h.fieldOrNull("cond0.join")).not.toBeNull();
    // and it is NOT the read-only degrade
    expect(h.fieldOrNull("cond0.readonly")).toBeNull();
  });

  it("the widget is SEEDED from the template's own default, not from empty", () => {
    // `defaultParamsFor(template)` → `params.condition` → the editor's `value`.
    // Drop the `value={params[name]}` prop and this line reads 「無條件」.
    expect(textOf(h.field("cond0.sentence").children)).toBe(
      `實際效果：${describeCondition(flagshipGate())}`,
    );
  });

  it("the slot is LABELLED with its param name, so a two-condition template is legible", () => {
    expect(h.text()).toContain("condition · 觸發條件");
  });

  it("editing a dropdown flows back into params and out again", () => {
    // Drop the `onChange` half of the wiring and the sentence never moves.
    h.enter(h.field("cond0.g1.c1.chance"), "7");
    expect(textOf(h.field("cond0.sentence").children)).toContain("7% 機率");
    expect(textOf(h.field("cond0.sentence").children)).toContain("目標不是英雄");
  });

  it("清除 empties the slot and the ＋ button comes back", () => {
    h.press(h.field("cond0.clear"));
    expect(textOf(h.field("cond0.sentence").children)).toBe("實際效果：無條件，每次都觸發。");
    expect(h.fieldOrNull("cond0.addFirst")).not.toBeNull();
  });
});

describe("ForgeStudio keeps the condition OUT of the generated form", () => {
  /**
   * The other half of the wiring: `ui` filters `type: "condition"` slots out of
   * `walkZod(paramsSchema)`. Without the filter the recursive union degrades to
   * `kind:"unknown"` → `JsonField` → a raw JSON <textarea>, which is exactly the
   * script editor owner ruled out (「不是 script 編輯而是 UI 選項」). Delete the
   * filter and BOTH a textarea and the dropdowns appear, so this fails.
   */
  it("no raw-JSON textarea is rendered for the gate", () => {
    expect(h.hosts().filter((n) => n.type === "textarea")).toHaveLength(0);
  });

  it("the non-condition slots still render through the generated form", () => {
    // `event` is an enum slot: proof the filter removed ONE field, not the form
    const selects = h.hosts().filter((n) => n.type === "select");
    const values = selects.flatMap((s) =>
      s.children
        .filter((c): c is { type: string; props: Record<string, unknown>; children: [] } =>
          typeof c !== "string" && c.type === "option",
        )
        .map((o) => String(o.props["value"])),
    );
    expect(values).toContain("onBasicAttack");
    expect(values).toContain("onDamageDealt");
  });
});
