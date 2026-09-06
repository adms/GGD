import { describe, expect, it } from "vitest";
import { assertContainedModelAsset } from "./modelAssetSafety";
const glb = (document: unknown) => {
  const text = JSON.stringify(document);
  const json = new TextEncoder().encode(text + " ".repeat((4 - text.length % 4) % 4));
  const bytes = new Uint8Array(20 + json.length); const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
  view.setUint32(12, json.length, true); view.setUint32(16, 0x4e4f534a, true); bytes.set(json, 20); return bytes;
};
describe("frozen model resource boundary", () => {
  it("accepts embedded resources", () => {
    expect(() => assertContainedModelAsset("assets/proof.glb", glb({ asset: { version: "2.0" }, images: [{ uri: "data:image/png;base64,AAAA" }] }))).not.toThrow();
  });
  it.each(["https://example.com/new.png", "../changed.png", "texture.png", "file:///private/key", "//example.com/a.png"])("rejects an unbound external resource %s", (uri) => {
    expect(() => assertContainedModelAsset("assets/proof.glb", glb({ images: [{ uri }] }))).toThrow("未固定");
  });
  it("rejects a truncated binary model before handing bytes to the graphics loader", () => {
    const bytes = glb({ asset: { version: "2.0" } });
    expect(() => assertContainedModelAsset("assets/proof.glb", bytes.slice(0, -1))).toThrow("長度");
  });
});
