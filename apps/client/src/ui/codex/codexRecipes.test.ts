/**
 * codex-recipe: the item↔item relations, reconstructed from what the item docs
 * actually carry today (the w3x 合成配方 tooltip block) and, when task #70
 * lands, from the authored recipe field instead.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { normaliseItem } from "./codexData";
import { buildRecipeGraph, parseRecipeComponents } from "./codexRecipes";
import type { CodexItem } from "@ggd/shared/codex/codexTypes";

function item(id: string, name: string, over: Record<string, unknown> = {}): CodexItem {
  return normaliseItem({ id, name, cost: 100, tier: 2, tags: [], ...over }) as CodexItem;
}

const FINAL_DESC = "武器\n合成配方：\n吸血石\n妖刀村正製作書\n\n效能\n攻擊力+30\n\n解說\n村正打造的妖刀之一";

describe("codex recipes", () => {
  it("parses the 合成配方 block and stops at the blank line", () => {
    cover("codex-recipe");
    expect(parseRecipeComponents(FINAL_DESC)).toEqual(["吸血石", "妖刀村正製作書"]);
    expect(parseRecipeComponents("沒有配方的說明")).toEqual([]);
    expect(parseRecipeComponents(null)).toEqual([]);
  });

  it("links components → parent and parent → components", () => {
    cover("codex-recipe");
    const items = [
      item("final", "妖刀村正", { description: FINAL_DESC }),
      item("stone", "吸血石"),
      item("book", "妖刀村正製作書"),
    ];
    const g = buildRecipeGraph(items);
    expect(g.recipeOf.get("final")?.source).toBe("description");
    expect(g.recipeOf.get("final")?.components.map((c) => c.id)).toEqual(["stone", "book"]);
    expect(g.buildsInto.get("stone")).toEqual(["final"]);
    expect(g.buildsInto.get("book")).toEqual(["final"]);
    expect(g.unresolvedNames).toEqual([]);
  });

  it("keeps an unresolvable component name instead of dropping it", () => {
    cover("codex-recipe");
    // 寶石碎片 is exactly this case in the shipped content: the item it names
    // never got a display name out of the w3x string table, so nothing matches.
    const items = [item("ring", "戒指", { description: "合成配方：\n寶石碎片\n" }), item("shard", "shard-id-only")];
    const g = buildRecipeGraph(items);
    expect(g.recipeOf.get("ring")?.components).toEqual([{ name: "寶石碎片", id: null }]);
    expect(g.unresolvedNames).toEqual(["寶石碎片"]);
    expect(g.buildsInto.size).toBe(0);
  });

  it("prefers an authored recipe field (task #70) over the tooltip text", () => {
    cover("codex-recipe");
    const items = [
      item("final", "刀", { description: FINAL_DESC, components: ["stone"] }),
      item("stone", "吸血石"),
      item("book", "妖刀村正製作書"),
    ];
    const g = buildRecipeGraph(items);
    expect(g.recipeOf.get("final")?.source).toBe("doc");
    expect(g.recipeOf.get("final")?.components.map((c) => c.id)).toEqual(["stone"]);
    expect(g.buildsInto.has("book")).toBe(false);
  });

  it("a self-referencing recipe never creates a self edge", () => {
    cover("codex-recipe");
    const items = [item("x", "甲", { description: "合成配方：\n甲\n" })];
    const g = buildRecipeGraph(items);
    expect(g.buildsInto.get("x")).toBeUndefined();
  });
});
