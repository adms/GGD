/**
 * editor-11 (editor-ai-prompt): the AI-icon prompt PREFILL builder is pure and
 * deterministic — it weaves name + description + tags (+ per-kind traits) into a
 * prompt, degrades gracefully on a bare doc, and the kind/path mapping targets
 * assets/icons/<kind>/<docId>.png. Also covers the AI 填空 helpers.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  buildIconPrompt,
  buildTextPrompt,
  iconAssetPath,
  iconKindFor,
  isFillableField,
} from "./prompt";

describe("icon kind + path mapping (editor-11)", () => {
  it("maps only icon-bearing collections and builds the asset path", () => {
    cover("editor-ai-prompt");
    expect(iconKindFor("champions")).toBe("champions");
    expect(iconKindFor("abilities")).toBe("abilities");
    expect(iconKindFor("items")).toBe("items");
    expect(iconKindFor("vfx")).toBeNull();
    expect(iconKindFor("arenas")).toBeNull();

    expect(iconAssetPath("champions", "godie-e001")).toBe("assets/icons/champions/godie-e001.png");
    expect(iconAssetPath("abilities", "godie-e001.q")).toBe("assets/icons/abilities/godie-e001.q.png");
    expect(iconAssetPath("items", "ember-rod")).toBe("assets/icons/items/ember-rod.png");
  });
});

describe("buildIconPrompt prefill (editor-11)", () => {
  it("weaves name, description, tags and champion traits", () => {
    const doc = {
      name: "Ember Knight",
      description: "A fire-forged duelist who burns foes with each strike.",
      tags: ["fire", "melee", "bruiser"],
      role: "bruiser",
      attackType: "melee",
    };
    const p = buildIconPrompt("champions", doc);
    expect(p).toContain("champion portrait icon");
    expect(p).toContain("Name: Ember Knight.");
    expect(p).toContain("role: bruiser");
    expect(p).toContain("melee attacker");
    expect(p).toContain("A fire-forged duelist");
    expect(p).toContain("Tags: fire, melee, bruiser.");
    // deterministic
    expect(buildIconPrompt("champions", doc)).toBe(p);
  });

  it("uses ability traits (slot/castType) for abilities", () => {
    const p = buildIconPrompt("abilities", { name: "Flame Dash", slot: "Q", castType: "dash" });
    expect(p).toContain("ability / spell icon");
    expect(p).toContain("slot: Q");
    expect(p).toContain("dash cast");
    expect(p).not.toContain("role:");
  });

  it("degrades gracefully on a bare doc (no name/desc/tags)", () => {
    const p = buildIconPrompt("items", {});
    expect(p).toContain("item icon");
    expect(p).not.toContain("Name:");
    expect(p).not.toContain("Description:");
    expect(p).not.toContain("Tags:");
    // always ends with the style guidance so the prompt is never empty
    expect(p).toMatch(/Style:/);
  });
});

describe("AI 填空 helpers (editor-11)", () => {
  it("marks free-text fields fillable and structural ones not", () => {
    expect(isFillableField("description")).toBe(true);
    expect(isFillableField("name")).toBe(true);
    expect(isFillableField("lore")).toBe(true);
    expect(isFillableField("id")).toBe(false);
    expect(isFillableField("modelKey")).toBe(false);
    expect(isFillableField("cost")).toBe(false);
  });

  it("builds a field-scoped {prompt, field, context} from the doc", () => {
    const doc = {
      id: "ember-rod",
      schema: "item@1",
      name: "Ember Rod",
      cost: 900,
      tier: 2,
      tags: ["ap"],
      // bulky/structural fields must be dropped from the context
      modifiers: [{ stat: "ap", op: "flat", value: 45 }],
    };
    const req = buildTextPrompt("description", doc);
    expect(req.field).toBe("description");
    expect(req.prompt).toMatch(/description/i);
    expect(req.prompt).toContain("Ember Rod");
    const ctx = JSON.parse(req.context) as Record<string, unknown>;
    expect(ctx.name).toBe("Ember Rod");
    expect(ctx.tier).toBe(2);
    expect(ctx.tags).toEqual(["ap"]);
    expect(ctx.modifiers).toBeUndefined(); // dropped
    expect(ctx.schema).toBeUndefined(); // dropped
  });
});
