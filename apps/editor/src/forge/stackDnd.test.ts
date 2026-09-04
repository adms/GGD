import { describe, expect, it } from "vitest";
import type { AbilityTemplateCard } from "@ggd/shared/content";
import {
  decodeTemplateStackDrag,
  encodeTemplateStackDrag,
  insertTemplateCard,
  moveTemplateCard,
} from "./stackDnd";

const card = (ref: string): AbilityTemplateCard => ({ ref, params: {} });

describe("template stack drag/drop", () => {
  it("accepts only the two exact payload shapes", () => {
    expect(decodeTemplateStackDrag(encodeTemplateStackDrag({ kind: "catalog-template", templateId: "tpl-a" })))
      .toEqual({ kind: "catalog-template", templateId: "tpl-a" });
    expect(decodeTemplateStackDrag(encodeTemplateStackDrag({ kind: "stack-card", index: 2 })))
      .toEqual({ kind: "stack-card", index: 2 });
    expect(decodeTemplateStackDrag("https://example.invalid/template")).toBeNull();
    expect(decodeTemplateStackDrag('{"kind":"stack-card","index":-1}')).toBeNull();
    expect(decodeTemplateStackDrag('{"kind":"catalog-template","templateId":7}')).toBeNull();
    expect(decodeTemplateStackDrag('{"kind":"stack-card","index":1,"url":"https://example.invalid"}')).toBeNull();
  });

  it("inserts at the chosen slot and refuses to exceed the shared ceiling", () => {
    expect(insertTemplateCard([card("a"), card("c")], card("b"), 1, 3).map((x) => x.ref))
      .toEqual(["a", "b", "c"]);
    expect(insertTemplateCard([card("a"), card("b"), card("c")], card("d"), 3, 3).map((x) => x.ref))
      .toEqual(["a", "b", "c"]);
  });

  it("reorders by insertion slot without cloning or dropping a card", () => {
    const cards = [card("a"), card("b"), card("c")];
    expect(moveTemplateCard(cards, 0, 3).map((x) => x.ref)).toEqual(["b", "c", "a"]);
    expect(moveTemplateCard(cards, 2, 0).map((x) => x.ref)).toEqual(["c", "a", "b"]);
    expect(moveTemplateCard(cards, 1, 2).map((x) => x.ref)).toEqual(["a", "b", "c"]);
  });
});
