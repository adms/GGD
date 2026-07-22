/**
 * settings-perf: the perfBus is a PLAIN mutable object (never React state /
 * Zustand), and the PerfOverlay samples it on an interval (not per-frame React
 * state). Source-scan in the spirit of the client architecture gate, plus a
 * runtime mutability check.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { perfBus } from "./perfBus";

const SRC = __dirname;
const read = (p: string): string =>
  readFileSync(join(SRC, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

describe("perfBus is plain-mutable (settings-perf)", () => {
  it("perfBus.ts imports no React / Zustand and holds no store", () => {
    cover("perfbus-plain-mutable");
    const src = read("perfBus.ts");
    expect(/from\s+["']react(-dom)?["']/.test(src)).toBe(false);
    expect(/from\s+["']zustand/.test(src)).toBe(false);
    expect(/useState|createStore|\.setState\s*\(/.test(src)).toBe(false);
    // it exports a plain const object literal
    expect(/export const perfBus\s*:/.test(src)).toBe(true);
  });

  it("perfBus is a mutable object the render loop can write field-by-field", () => {
    cover("perfbus-plain-mutable");
    perfBus.fps = 123;
    perfBus.qualityLevel = 4;
    expect(perfBus.fps).toBe(123);
    expect(perfBus.qualityLevel).toBe(4);
  });

  it("PerfOverlay samples the bus on an interval, not per-frame React state", () => {
    cover("perfbus-plain-mutable");
    const src = read("ui/PerfOverlay.tsx");
    expect(src.includes("setInterval")).toBe(true);
    expect(src.includes('from "../perfBus"')).toBe(true);
    // it must NOT drive a per-frame requestAnimationFrame → setState loop
    expect(/requestAnimationFrame/.test(src)).toBe(false);
  });
});
