import { describe, expect, it } from "vitest";
import { auditBackdropFrame, automaticVisualHygieneScore } from "./backdropFrameAudit";

function solid(width: number, height: number, rgba: readonly [number, number, number, number]): Uint8Array {
  return Uint8Array.from({ length: width * height * 4 }, (_, index) => rgba[index % 4]!);
}

describe("VFX Forge rendered-frame backdrop guard", () => {
  it("rejects a white fallback texture covering the camera", () => {
    const result = auditBackdropFrame(solid(20, 20, [255, 255, 255, 255]), 20, 20);
    expect(result.unsafe).toBe(true);
    expect(result.reason).toContain("底板");
  });

  it("rejects additive layers that wash most of the camera bright", () => {
    const rgba = solid(20, 20, [20, 24, 32, 255]);
    for (let pixel = 0; pixel < 320; pixel++) {
      const offset = pixel * 4;
      rgba[offset] = 230;
      rgba[offset + 1] = 90;
      rgba[offset + 2] = 40;
    }
    const result = auditBackdropFrame(rgba, 20, 20);
    expect(result.unsafe).toBe(true);
    expect(result.reason).toContain("過曝");
  });

  it("allows a localized bright spell over a dark arena", () => {
    const rgba = solid(20, 20, [20, 24, 32, 255]);
    for (let pixel = 0; pixel < 60; pixel++) {
      const offset = pixel * 4;
      rgba[offset] = 255;
      rgba[offset + 1] = 210;
      rgba[offset + 2] = 80;
    }
    expect(auditBackdropFrame(rgba, 20, 20).unsafe).toBe(false);
  });

  it("rejects a large brown telegraph plane even though it is not bright or white", () => {
    const width = 100;
    const height = 100;
    const rgba = solid(width, height, [20, 24, 32, 255]);
    for (let y = 30; y < 70; y++) {
      for (let x = 18; x < 82; x++) {
        const offset = (y * width + x) * 4;
        rgba[offset] = 112;
        rgba[offset + 1] = 82;
        rgba[offset + 2] = 48;
      }
    }
    const result = auditBackdropFrame(rgba, width, height);
    expect(result.unsafe).toBe(true);
    expect(result.reason).toContain("預告幾何");
  });

  it("rejects a small solid white texture card even when whole-frame coverage is tiny", () => {
    const width = 100;
    const height = 100;
    const rgba = solid(width, height, [20, 24, 32, 255]);
    for (let y = 30; y < 34; y++) {
      for (let x = 40; x < 44; x++) {
        const offset = (y * width + x) * 4;
        rgba[offset] = 255;
        rgba[offset + 1] = 255;
        rgba[offset + 2] = 255;
      }
    }
    const result = auditBackdropFrame(rgba, width, height);
    expect(result.unsafe).toBe(true);
    expect(result.reason).toContain("局部");
  });

  it("allows an irregular white silhouette with the same pixel count", () => {
    const width = 100;
    const height = 100;
    const rgba = solid(width, height, [20, 24, 32, 255]);
    for (let i = 0; i < 16; i++) {
      const x = 40 + (i % 4) * 2;
      const y = 30 + Math.floor(i / 4) * 2;
      const offset = (y * width + x) * 4;
      rgba[offset] = 255;
      rgba[offset + 1] = 255;
      rgba[offset + 2] = 255;
    }
    expect(auditBackdropFrame(rgba, width, height).unsafe).toBe(false);
  });

  it("fails closed when framebuffer readback is empty", () => {
    expect(auditBackdropFrame(new Uint8Array(), 0, 0).unsafe).toBe(true);
  });
});

describe("automaticVisualHygieneScore", () => {
  it("stays conservative for a locally over-bright but not full-screen frame", () => {
    const score = automaticVisualHygieneScore({
      litShare: 0.071,
      highlightShare: 0.052,
      brightShare: 0,
      nearWhiteShare: 0,
      dominantBrightShare: 0,
      dominantNonBackgroundShare: 0,
      localWhiteCardShare: 0,
      unsafe: false,
    });
    expect(score).toBe(6);
  });

  it("never turns an unsafe carrier into a passing number", () => {
    expect(automaticVisualHygieneScore({
      litShare: 1,
      highlightShare: 1,
      brightShare: 1,
      nearWhiteShare: 1,
      dominantBrightShare: 1,
      dominantNonBackgroundShare: 1,
      localWhiteCardShare: 1,
      unsafe: true,
      reason: "opaque card",
    })).toBe(0);
  });
});
