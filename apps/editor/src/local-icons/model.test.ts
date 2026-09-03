import { describe, expect, it } from "vitest";
import { centeredSquareCrop, localIconAssetPath, validateLocalIconSource } from "./model";

describe("local icon authoring policy", () => {
  it("uses the shipped icon tree and WebP without accepting unsafe ids", () => {
    expect(localIconAssetPath("abilities", "godie-e001.q")).toBe("assets/icons/abilities/godie-e001.q.webp");
    expect(() => localIconAssetPath("items", "../escape")).toThrow(/不安全/);
  });

  it("accepts the three browser-decodable source formats and rejects empty, huge or SVG input", () => {
    expect(() => validateLocalIconSource({ name: "a.png", type: "image/png", size: 12 })).not.toThrow();
    expect(() => validateLocalIconSource({ name: "a.svg", type: "image/svg+xml", size: 12 })).toThrow(/PNG/);
    expect(() => validateLocalIconSource({ name: "a.png", type: "image/png", size: 0 })).toThrow(/空檔/);
    expect(() => validateLocalIconSource({ name: "a.png", type: "image/png", size: 21 * 1024 * 1024 })).toThrow(/上限/);
  });

  it("center-crops landscape and portrait inputs without stretching", () => {
    expect(centeredSquareCrop(800, 400)).toEqual({ sx: 200, sy: 0, size: 400 });
    expect(centeredSquareCrop(300, 900)).toEqual({ sx: 0, sy: 300, size: 300 });
    expect(() => centeredSquareCrop(0, 100)).toThrow(/尺寸/);
  });
});
