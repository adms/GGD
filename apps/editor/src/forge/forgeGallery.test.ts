import { describe, expect, it } from "vitest";
import type { TemplateDoc } from "@ggd/shared/content";
import { templateMatchesQuery } from "./ForgeGallery";

const template = {
  schema: "ability-template@1",
  id: "tpl-line-blast",
  name: "直線衝擊波（落點大爆炸）",
  description: "火球沿直線前進，抵達目的地後產生範圍爆炸。",
  family: "line-blast",
  status: "enabled",
  gapScore: 8,
  exemplar: { skill: "04-03 龍破斬", jass: "A04R" },
  params: {},
  requires: [],
} as unknown as TemplateDoc;

describe("ForgeGallery template search", () => {
  it.each(["龍破斬", "A04R", "tpl-line", "落點", "LINE-BLAST"])(
    "matches every author-visible identity: %s",
    (query) => expect(templateMatchesQuery(template, query)).toBe(true),
  );

  it("keeps an empty query inclusive and rejects unrelated text", () => {
    expect(templateMatchesQuery(template, "  ")).toBe(true);
    expect(templateMatchesQuery(template, "治療護盾")).toBe(false);
  });
});
