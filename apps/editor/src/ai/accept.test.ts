/**
 * editor-12 (editor-ai-accept): the Accept flow saves the generated PNG to
 * content/assets/icons/<kind>/<docId>.png via the content-api asset-write path
 * AND sets the doc's `icon` field (via the store's update) — verified with a
 * mocked content-api (spy putAsset + a real store round-trip on the update).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { acceptIcon } from "./accept";
import { getIn, useEditorStore } from "../store";

beforeEach(() => useEditorStore.getState().clearSelection());

describe("acceptIcon (editor-12)", () => {
  it("writes the PNG asset then sets the icon field on the draft", async () => {
    cover("editor-ai-accept");
    const putAsset = vi.fn().mockResolvedValue({ path: "assets/icons/champions/hero.png", bytes: 10 });
    const setField = vi.fn();

    const { assetPath } = await acceptIcon({
      collection: "champions",
      docId: "hero",
      pngBase64: "data:image/png;base64,QUJD", // "ABC"
      deps: { putAsset, setField },
    });

    expect(assetPath).toBe("assets/icons/champions/hero.png");
    // raw base64 is stored (data-url prefix stripped)
    expect(putAsset).toHaveBeenCalledTimes(1);
    expect(putAsset).toHaveBeenCalledWith("assets/icons/champions/hero.png", "QUJD");
    // and the icon field is set to the content-relative path
    expect(setField).toHaveBeenCalledWith("icon", "assets/icons/champions/hero.png");
    // asset save happens before the field is set
    expect(putAsset.mock.invocationCallOrder[0]!).toBeLessThan(setField.mock.invocationCallOrder[0]!);
  });

  it("threads through the real store update so the draft ends up dirty with the icon", async () => {
    const s = () => useEditorStore.getState();
    s().select("items", "ember-rod", { id: "ember-rod", schema: "item@1", name: "Ember Rod", tags: [] });
    expect(s().dirty).toBe(false);

    const putAsset = vi.fn().mockResolvedValue({ path: "x", bytes: 1 });
    await acceptIcon({
      collection: "items",
      docId: "ember-rod",
      pngBase64: "QUJD",
      deps: { putAsset, setField: (p, v) => s().update(p, v) },
    });

    expect(putAsset).toHaveBeenCalledWith("assets/icons/items/ember-rod.png", "QUJD");
    expect(getIn(s().draft, "icon")).toBe("assets/icons/items/ember-rod.png");
    expect(s().dirty).toBe(true);
  });

  it("rejects collections with no icon field", async () => {
    await expect(
      acceptIcon({
        collection: "vfx",
        docId: "flame",
        pngBase64: "QUJD",
        deps: { putAsset: vi.fn(), setField: vi.fn() },
      }),
    ).rejects.toThrow(/no icon/);
  });
});
