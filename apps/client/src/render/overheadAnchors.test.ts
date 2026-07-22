/**
 * Healing flowers (task #34, docs/todo/flowers.md): the overhead-bar
 * rules feeding GameApp.updateFrameBus — champions AND flowers get bars
 * (projectiles never), flowers get a NEUTRAL color outside the 4-team CSS
 * palette, and a lower projection height than the champion head anchor.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  hasOverheadBar,
  anchorColorFor,
  anchorHeightFor,
  NEUTRAL_BAR_COLOR,
  KIND_CHAMPION,
  KIND_FLOWER,
} from "./overheadAnchors";
import { TEAM_CSS } from "../ui/theme";

describe("overhead anchor rules (flower-anchor-filter)", () => {
  it("champions and flowers carry bars; projectiles do not", () => {
    cover("flower-anchor-filter");
    expect(hasOverheadBar(KIND_CHAMPION)).toBe(true);
    expect(hasOverheadBar(KIND_FLOWER)).toBe(true);
    expect(hasOverheadBar(1)).toBe(false); // projectile
    expect(hasOverheadBar(99)).toBe(false); // future kinds default to no bar
  });

  it("flower bar color is neutral: set, and outside the team palette", () => {
    cover("flower-anchor-filter");
    expect(anchorColorFor(KIND_FLOWER)).toBe(NEUTRAL_BAR_COLOR);
    // champions keep the teamId-derived color (no override)
    expect(anchorColorFor(KIND_CHAMPION)).toBeUndefined();
    // "distinct neutral": never collides with a team's CSS color
    for (const teamColor of TEAM_CSS) {
      expect(NEUTRAL_BAR_COLOR.toLowerCase()).not.toBe(teamColor.toLowerCase());
    }
  });

  it("flower bars project from a lower world height than champion bars", () => {
    cover("flower-anchor-filter");
    expect(anchorHeightFor(KIND_FLOWER)).toBeLessThan(anchorHeightFor(KIND_CHAMPION));
    expect(anchorHeightFor(KIND_FLOWER)).toBeGreaterThan(0);
  });
});
