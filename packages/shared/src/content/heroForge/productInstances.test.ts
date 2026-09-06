import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { resolveTemplateExpansion } from "../templates/resolve";
import { zTemplateDoc } from "../schema/template";
import { contentSha256 } from "../import/jcs";

it("inherits changed defaults without baking them and keeps repeated instances independent", () => {
  const template = zTemplateDoc.parse(JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../../../content/ability-templates/tpl-single-strike.json"), "utf8")));
  const cards = [
    { ref: template.id, inheritDefaults: true, params: { damage: { perRank: [111], ratios: [] } } },
    { ref: template.id, inheritDefaults: true, params: { damage: { perRank: [222], ratios: [] } } },
  ];
  const source = { id: "repeated", effects: [], template: { cards, onConflict: "lastWins" } };
  const result = resolveTemplateExpansion(source, new Map([[template.id, template]]));
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(JSON.stringify(result.merged.effects)).toContain("111");
    expect(JSON.stringify(result.merged.effects)).toContain("222");
  }
  const pinned = { ...source, template: { cards: cards.map((card) => ({ ...card, contentSha256: contentSha256(template) })), onConflict: "lastWins" } };
  const altered = structuredClone(template); altered.name += " changed";
  expect(resolveTemplateExpansion(pinned, new Map([[template.id, altered]])).ok).toBe(false);
  expect(cards[0]!.params).toEqual({ damage: { perRank: [111], ratios: [] } });
});
