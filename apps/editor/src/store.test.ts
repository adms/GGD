/**
 * editor-03 (editor-store-dirty): dirty tracking, immutable path updates,
 * and 422 server field errors mapping onto data paths.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { getIn, issuesToErrorMap, setIn, useEditorStore } from "./store";

const DOC = {
  id: "sela.q",
  schema: "ability@1",
  name: "Ember Bolt",
  cooldown: [6, 5.5],
  effects: [{ kind: "damage", amount: { flat: 20 } }],
};

beforeEach(() => {
  useEditorStore.getState().clearSelection();
});

describe("setIn/getIn", () => {
  it("does immutable deep updates through arrays and objects", () => {
    const next = setIn(DOC, "effects.0.amount.flat", 25) as typeof DOC;
    expect(getIn(next, "effects.0.amount.flat")).toBe(25);
    expect(DOC.effects[0]!.amount.flat).toBe(20); // original untouched
    expect(next).not.toBe(DOC);
    expect(next.effects).not.toBe(DOC.effects);
    expect(next.name).toBe(DOC.name);

    // undefined deletes the key (optional field cleared)
    const cleared = setIn(DOC, "name", undefined) as Record<string, unknown>;
    expect("name" in cleared).toBe(false);
  });
});

describe("editor store (editor-03)", () => {
  it("tracks dirty state across select/update/save", () => {
    cover("editor-store-dirty");
    const s = () => useEditorStore.getState();
    s().select("abilities", "sela.q", DOC);
    expect(s().dirty).toBe(false);
    expect(s().draft).toEqual(DOC);

    s().update("cooldown.1", 5);
    expect(s().dirty).toBe(true);
    expect(getIn(s().draft, "cooldown.1")).toBe(5);
    expect(getIn(s().original, "cooldown.1")).toBe(5.5); // original preserved

    s().markSaved(s().draft);
    expect(s().dirty).toBe(false);
    expect(getIn(s().original, "cooldown.1")).toBe(5);
  });

  it("maps server 422 issues onto field paths and clears on save", () => {
    const s = () => useEditorStore.getState();
    s().select("abilities", "sela.q", DOC);
    s().setServerErrors([
      { path: "cooldown.0", message: "Expected number", code: "invalid_type" },
      { path: "cooldown.0", message: "too small", code: "too_small" },
      { path: "name", message: "required", code: "invalid_type" },
    ]);
    expect(s().serverErrors["cooldown.0"]).toEqual(["Expected number", "too small"]);
    expect(s().serverErrors["name"]).toEqual(["required"]);

    s().markSaved(s().draft);
    expect(s().serverErrors).toEqual({});
  });

  it("issuesToErrorMap groups by path", () => {
    const map = issuesToErrorMap([
      { path: "", message: "root", code: "custom" },
      { path: "a.b", message: "x", code: "custom" },
      { path: "a.b", message: "y", code: "custom" },
    ]);
    expect(map[""]).toEqual(["root"]);
    expect(map["a.b"]).toEqual(["x", "y"]);
  });
});
