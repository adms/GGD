/**
 * Pure procedural painters — verified against a recording mock 2D context, so
 * no real canvas is needed. Proves the sprites are drawn (radial/linear
 * gradients with stops + a full fill), not fetched from disk.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  drawSoftDot,
  drawCloud,
  paintVerticalGradient,
  SKY_STOPS,
  type Ctx2DLike,
  type GradientLike,
} from "./paint";

interface Rec {
  ctx: Ctx2DLike;
  stops: Array<[number, string]>;
  radial: number;
  linear: number;
  fills: Array<[number, number, number, number]>;
  clears: number;
}

function recordingCtx(): Rec {
  const rec: Rec = { ctx: null as unknown as Ctx2DLike, stops: [], radial: 0, linear: 0, fills: [], clears: 0 };
  const grad: GradientLike = { addColorStop: (o, c) => rec.stops.push([o, c]) };
  rec.ctx = {
    fillStyle: "",
    globalAlpha: 1,
    createRadialGradient: () => {
      rec.radial++;
      return grad;
    },
    createLinearGradient: () => {
      rec.linear++;
      return grad;
    },
    clearRect: () => {
      rec.clears++;
    },
    fillRect: (x, y, w, h) => {
      rec.fills.push([x, y, w, h]);
    },
  };
  return rec;
}

describe("drawSoftDot", () => {
  it("clears, builds a centred radial gradient, and fills the sprite", () => {
    cover("login-paint-softdot");
    const rec = recordingCtx();
    drawSoftDot(rec.ctx, 64);
    expect(rec.clears).toBe(1);
    expect(rec.radial).toBe(1);
    expect(rec.stops.length).toBeGreaterThanOrEqual(3);
    // opaque core → transparent rim
    expect(rec.stops[0]![0]).toBe(0);
    expect(rec.stops[rec.stops.length - 1]![1]).toContain("0)");
    expect(rec.fills).toContainEqual([0, 0, 64, 64]);
  });
});

describe("drawCloud", () => {
  it("stacks several soft blobs (multiple radial gradients + fills)", () => {
    cover("login-paint-softdot");
    const rec = recordingCtx();
    drawCloud(rec.ctx, 128);
    expect(rec.radial).toBeGreaterThanOrEqual(3);
    expect(rec.fills.length).toBe(rec.radial);
    for (const f of rec.fills) expect(f).toEqual([0, 0, 128, 128]);
  });
});

describe("paintVerticalGradient", () => {
  it("applies every sky stop onto a linear gradient and fills", () => {
    cover("login-paint-sky");
    const rec = recordingCtx();
    paintVerticalGradient(rec.ctx, 4, 512, SKY_STOPS);
    expect(rec.linear).toBe(1);
    expect(rec.stops.length).toBe(SKY_STOPS.length);
    expect(rec.stops[0]![0]).toBe(SKY_STOPS[0]![0]);
    expect(rec.fills).toContainEqual([0, 0, 4, 512]);
  });

  it("defaults to the sky stops", () => {
    cover("login-paint-sky");
    const rec = recordingCtx();
    paintVerticalGradient(rec.ctx, 4, 100);
    expect(rec.stops.length).toBe(SKY_STOPS.length);
  });
});

describe("SKY_STOPS dark-epic palette", () => {
  const lum = (hex: string): number => {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
    expect(m, `hex parse ${hex}`).toBeTruthy();
    const r = parseInt(m![1]!, 16);
    const g = parseInt(m![2]!, 16);
    const b = parseInt(m![3]!, 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255; // 0..1 perceived
  };

  it("is a DARK gradient (every stop low-luminance) so emissive can pop", () => {
    cover("login-dark-palette");
    // ordered top→bottom offsets
    for (let i = 0; i < SKY_STOPS.length; i++) {
      expect(SKY_STOPS[i]![0]).toBe([0.0, 0.34, 0.62, 0.84, 1.0][i]);
      expect(lum(SKY_STOPS[i]![1])).toBeLessThan(0.2); // no bright dawn colour survives
    }
    // zenith is the darkest; horizon may carry a faint ember glow but stays dark
    expect(lum(SKY_STOPS[0]![1])).toBeLessThan(0.05);
  });
});
