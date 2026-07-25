/**
 * gamepadFocus — pure traversal + edge-detection helpers behind the handheld's
 * gamepad-driven QR screen (#197/#199). No browser, no controller: just the math.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { nextFocusIndex, gamepadIntents, axisDir } from "./gamepadFocus";

describe("nextFocusIndex", () => {
  it("moves toward the ends and CLAMPS (no wrap)", () => {
    cover("webui-gamepad-focus");
    expect(nextFocusIndex(0, 3, "down")).toBe(1);
    expect(nextFocusIndex(1, 3, "down")).toBe(2);
    expect(nextFocusIndex(2, 3, "down")).toBe(2); // clamp at the bottom
    expect(nextFocusIndex(0, 3, "up")).toBe(0); // clamp at the top
    expect(nextFocusIndex(2, 3, "left")).toBe(1);
    expect(nextFocusIndex(0, 3, "right")).toBe(1);
  });
  it("is a no-op on an empty list", () => {
    cover("webui-gamepad-focus");
    expect(nextFocusIndex(0, 0, "down")).toBe(0);
  });
});

describe("gamepadIntents", () => {
  const none = [] as boolean[];
  it("fires on the press EDGE only, never on hold", () => {
    cover("webui-gamepad-focus");
    const down = { 13: true } as unknown as boolean[];
    // fresh press
    expect(gamepadIntents(none, down, null, null).navs).toEqual(["down"]);
    // still held → no repeat
    expect(gamepadIntents(down, down, null, null).navs).toEqual([]);
  });
  it("maps A to activate and B to back on their edges", () => {
    cover("webui-gamepad-focus");
    const a = { 0: true } as unknown as boolean[];
    const b = { 1: true } as unknown as boolean[];
    expect(gamepadIntents(none, a, null, null).activate).toBe(true);
    expect(gamepadIntents(a, a, null, null).activate).toBe(false);
    expect(gamepadIntents(none, b, null, null).back).toBe(true);
  });
  it("treats a fresh stick direction as a nav flick", () => {
    cover("webui-gamepad-focus");
    expect(gamepadIntents(none, none, null, "down").navs).toEqual(["down"]);
    // holding the same direction does not repeat
    expect(gamepadIntents(none, none, "down", "down").navs).toEqual([]);
  });
});

describe("axisDir", () => {
  it("resolves the dominant axis outside the deadzone, null inside", () => {
    cover("webui-gamepad-focus");
    expect(axisDir(0, 0)).toBe(null);
    expect(axisDir(0.9, 0)).toBe("right");
    expect(axisDir(-0.9, 0)).toBe("left");
    expect(axisDir(0, -0.9)).toBe("up");
    expect(axisDir(0, 0.9)).toBe("down");
    expect(axisDir(0.3, 0.3)).toBe(null); // inside deadzone
  });
});
