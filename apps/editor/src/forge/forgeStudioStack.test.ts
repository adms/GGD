/**
 * 鑄技工坊 — IS THE MULTI-CARD STACK ACTUALLY WIRED, OR JUST DECLARED?
 * (owner 2026-07-31「我們討論的技能記得都要能用編輯器編輯模板跟複數選取」)
 *
 * THE ACCIDENT THIS FILE INHERITS. `forgeStudioCondition.test.ts` records a real
 * one: a reviewer deleted the `conditionSlots.map(…)` block from ForgeStudio —
 * the entire editor half of a feature owner asked for by name — and 9 files /
 * 41 tests stayed green. 失敗形態③,「可以從渲染樹刪掉但測試還是全綠」. The stack
 * UI is a bigger version of the same surface, so every assertion below is
 * written to DIE when its block leaves the render tree:
 *
 *   delete `resolved.map(… <CardPanel …/>)`    → 「每張卡都有自己的參數面板」 red
 *   delete the `stack.add` <select>            → 「加第二張卡」 red
 *   delete `<OriginTable/>`                    → 「展開來源」 red
 *   delete `<ConflictPanel/>`                  → 「衝突面板」 red
 *   delete the `stack.onConflict` <select>     → 「切換衝突處理」 red
 *   drop `fieldPrefix={`cond${index}`}`        → 「兩張卡的觸發條件各自可編輯」 red
 *
 * ⑦ 掃屬性代替掃行為: none of these count DOM nodes and stop. Adding a card is
 * asserted by the MERGED EXPANSION changing (a second hook appears in the live
 * summary), reordering by the merged order flipping, and the policy switch by
 * the surviving castType flipping — all read off the panel the operator reads.
 *
 * WHAT IS REAL AND WHAT IS NOT. Every template is the SHIPPED
 * `content/ability-templates/*.json`, read off disk; `expandStack`,
 * `paramsSchemaFor`, `defaultParamsFor`, `walkZod`, `FormRenderer` and
 * `ConditionEditor` are all the real thing. Only the three edges that need a
 * browser or a server are stubbed: react-query, the content-api client, and the
 * Babylon-backed preview controller.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import type { FC } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mount, textOf } from "@ggd/shared/testkit/headlessUi";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { hookImpls } = await import("@ggd/shared/testkit/headlessUi");
  const base = (actual["default"] ?? {}) as Record<string, unknown>;
  return { ...actual, ...hookImpls, default: { ...base, ...hookImpls } };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    if (queryKey[1] === "abilities") return { data: { entries: [{ id: "godie-h07-002" }] } };
    return { data: undefined };
  },
}));

vi.mock("../api/client", () => ({
  WRITES_ENABLED: false,
  api: { index: async () => ({ entries: [] }), doc: async () => ({}) },
}));

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
  id: string;
  name: string;
  status: string;
  family: string;
}

const doc = (id: string): Tpl =>
  JSON.parse(readFileSync(join(REPO, `content/ability-templates/${id}.json`), "utf8")) as Tpl;

/** Real, shipped, ENABLED families the studio may offer as extra cards. */
const CATALOG = [
  "tpl-on-attack",
  "tpl-on-hit-react",
  "tpl-ground-nova",
  "tpl-buff-self",
].map(doc);

function open(seed = "tpl-on-attack") {
  return mount(
    createElement(ForgeStudio as unknown as FC<Record<string, unknown>>, {
      template: doc(seed),
      catalog: CATALOG,
      onBack: () => undefined,
    }),
  );
}

let h: ReturnType<typeof open>;
beforeEach(() => {
  h = open();
});

const add = (id: string): void => h.enter(h.field("stack.add"), id);
const summary = (name: string): string => textOf(h.field(`stack.summary.${name}`).children);

// ---------------------------------------------------------------------------

describe("新技能入口 — recipes must create content, not only edit old skills", () => {
  it("opens in create mode with ID, name, slot and preview-actor controls", () => {
    expect(h.fieldOrNull("stack.mode.new")).not.toBeNull();
    expect(h.fieldOrNull("stack.new.id")).not.toBeNull();
    expect(h.fieldOrNull("stack.new.name")).not.toBeNull();
    expect(h.field("stack.new.slot").props["value"]).toBe("Q");
    expect(h.fieldOrNull("stack.new.champion")).not.toBeNull();
    expect(h.fieldOrNull("stack.ability")).toBeNull();
  });

  it("keeps existing-skill editing as an explicit alternate mode", () => {
    h.press(h.field("stack.mode.existing"));
    expect(h.fieldOrNull("stack.ability")).not.toBeNull();
    expect(h.fieldOrNull("stack.new.id")).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("模板複數選取 — adding a second card really reaches the expansion", () => {
  it("starts as a ONE-card stack seeded from the picked template", () => {
    expect(textOf(h.field("stack.card0.name").children)).toBe(doc("tpl-on-attack").name);
    expect(h.fieldOrNull("stack.card1.name")).toBeNull();
    expect(summary("hooks")).toBe("onBasicAttack");
  });

  /**
   * The ② assertion. `stack.card1.name` alone would pass on a studio that
   * rendered a second panel and never fed it to `expandStack`, so the load
   * -bearing line is the SUMMARY: a second hook only appears there if card 2's
   * expansion was merged in.
   */
  it("加第二張卡 — the merged passive grows a SECOND hook", () => {
    add("tpl-on-hit-react");
    expect(h.fieldOrNull("stack.card1.name")).not.toBeNull();
    expect(textOf(h.field("stack.card1.name").children)).toBe(doc("tpl-on-hit-react").name);
    expect(summary("hooks")).toBe("onBasicAttack, onDamageTaken");
  });

  it("每張卡都有自己的參數面板（不是共用一份）", () => {
    add("tpl-on-hit-react");
    // 攻擊觸發's `event` enum belongs to card 0; 受擊反應 has no such slot, so a
    // shared form would show ONE of these, never both.
    const options = h
      .hosts()
      .filter((n) => n.type === "select")
      .flatMap((s) =>
        s.children
          .filter(
            (c): c is { type: string; props: Record<string, unknown>; children: [] } =>
              typeof c !== "string" && c.type === "option",
          )
          .map((o) => String(o.props["value"])),
      );
    expect(options).toContain("onBasicAttack"); // card 0's `event`
    // and both cards are addressable in the origin panel
    expect(h.fieldOrNull("stack.origin.card.0")).not.toBeNull();
    expect(h.fieldOrNull("stack.origin.card.1")).not.toBeNull();
  });

  it("兩張卡的觸發條件各自可編輯 — namespaced, not aliased", () => {
    add("tpl-on-attack"); // the SAME family twice: two `condition` slots on screen
    expect(h.fieldOrNull("cond0.sentence")).not.toBeNull();
    expect(h.fieldOrNull("cond1.sentence")).not.toBeNull();
    // editing card 1's gate must move card 1's sentence and LEAVE card 0's alone
    const before = textOf(h.field("cond0.sentence").children);
    h.enter(h.field("cond1.g1.c1.chance"), "7");
    expect(textOf(h.field("cond1.sentence").children)).toContain("7% 機率");
    expect(textOf(h.field("cond0.sentence").children)).toBe(before);
  });
});

describe("排序與移除 — the ORDER is the semantics, so it has to be editable", () => {
  it("↓ swaps the cards, and the merged hook order follows", () => {
    add("tpl-on-hit-react");
    expect(summary("hooks")).toBe("onBasicAttack, onDamageTaken");
    h.press(h.field("stack.card0.down"));
    expect(textOf(h.field("stack.card0.name").children)).toBe(doc("tpl-on-hit-react").name);
    expect(summary("hooks")).toBe("onDamageTaken, onBasicAttack");
  });

  it("↑ is the same move from the other end", () => {
    add("tpl-on-hit-react");
    h.press(h.field("stack.card1.up"));
    expect(summary("hooks")).toBe("onDamageTaken, onBasicAttack");
  });

  it("✕ removes a card and the expansion loses its contribution", () => {
    add("tpl-on-hit-react");
    h.press(h.field("stack.card1.remove"));
    expect(h.fieldOrNull("stack.card1.name")).toBeNull();
    expect(summary("hooks")).toBe("onBasicAttack");
  });

  it("the LAST card cannot be removed — an empty stack is a silent no-op skill", () => {
    expect(h.field("stack.card0.remove").props["disabled"]).toBe(true);
    // the ends of the list cannot be moved off it either
    expect(h.field("stack.card0.up").props["disabled"]).toBe(true);
    expect(h.field("stack.card0.down").props["disabled"]).toBe(true);
  });
});

describe("衝突處理 — the decision point is a control, not a hidden branch", () => {
  /** 攻擊觸發 is castType "self"; 原地震波 is "ground". A real disagreement. */
  const clash = (): void => add("tpl-ground-nova");

  it("the default is 重複即拒 and the collision is NAMED, not swallowed", () => {
    expect(h.field("stack.onConflict").props["value"]).toBe("reject");
    clash();
    expect(h.fieldOrNull("stack.conflicts")).not.toBeNull();
    const line = textOf(h.field("stack.conflict.0").children);
    expect(line).toContain("castType");
    expect(line).toContain("tpl-ground-nova");
    expect(textOf(h.field("stack.conflicts").children)).toContain("無法寫回");
    // reject keeps the FIRST writer
    expect(summary("castType")).toBe("self");
  });

  it("切換到「後蓋前」really changes what the game would run", () => {
    clash();
    expect(summary("castType")).toBe("self");
    h.enter(h.field("stack.onConflict"), "lastWins");
    expect(summary("castType")).toBe("ground");
    // and it stops blocking the writeback
    expect(textOf(h.field("stack.conflicts").children)).not.toContain("無法寫回");
  });

  it("no collision ⇒ no panel at all (silence is only for real agreement)", () => {
    add("tpl-on-hit-react"); // both "self", both passive
    expect(h.fieldOrNull("stack.conflicts")).toBeNull();
  });
});

describe("展開來源 — 「第二張卡真的有被吃進去」 has to be VISIBLE, not assumed", () => {
  it("names the owning card for every emitted key and every emitted effect", () => {
    add("tpl-ground-nova");
    // ground-nova's radius is the only source of `radius`
    const radius = textOf(h.field("stack.origin.key.radius").children);
    expect(radius).toContain("第 2 張");
    expect(radius).toContain("tpl-ground-nova");
    // its damage packet is effects[0] and is attributed to card 2
    const effect = textOf(h.field("stack.origin.effect.0").children);
    expect(effect).toContain("damage");
    expect(effect).toContain("第 2 張");
  });

  it("a shadowed value stays on screen under 後蓋前 — 「我填的數字去哪了」", () => {
    add("tpl-ground-nova");
    h.enter(h.field("stack.onConflict"), "lastWins");
    const castType = textOf(h.field("stack.origin.key.castType").children);
    expect(castType).toContain("蓋掉第 1 張");
    expect(castType).toContain('"self"');
  });

  it("per-card totals prove no card was silently dropped", () => {
    add("tpl-ground-nova");
    expect(textOf(h.field("stack.origin.card.0").children)).toContain("觸發 1 條");
    expect(textOf(h.field("stack.origin.card.1").children)).toContain("效果 1 個");
  });
});
