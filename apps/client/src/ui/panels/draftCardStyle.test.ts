/**
 * hud-draft-card-style: the pure tier→accent / tier-label / confirm-sfx mapping
 * behind the 3-choose-1 draft cards. Node-testable (no React/store import).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { GOLD } from "../theme";
import {
  DRAFT_CONFIRM_SFX,
  DRAFT_TIER_COLOR,
  tierColor,
  tierLabel,
} from "./draftCardStyle";

describe("draftCardStyle (hud-draft-card-style)", () => {
  it("maps every known tier to its own accent colour", () => {
    cover("hud-draft-card-style");
    // the four tiers the schedule can hand the panel each read apart
    const tiers = ["silver", "gold", "prismatic", "weapon"];
    const colours = tiers.map(tierColor);
    expect(new Set(colours).size).toBe(tiers.length);
    for (const t of tiers) expect(tierColor(t)).toBe(DRAFT_TIER_COLOR[t]);
  });

  it("falls back to GOLD for an unknown tier (never undefined)", () => {
    cover("hud-draft-card-style");
    expect(tierColor("mythic")).toBe(GOLD);
    expect(tierColor("")).toBe(GOLD);
  });

  it("labels the weapon tier bespoke and augment tiers generically", () => {
    cover("hud-draft-card-style");
    expect(tierLabel("weapon")).toBe("傳說武器 · WEAPON");
    expect(tierLabel("gold")).toBe("GOLD AUGMENT");
    expect(tierLabel("prismatic")).toBe("PRISMATIC AUGMENT");
  });

  it("pins the confirm sfx key to the audio-map entry", () => {
    cover("hud-draft-card-style");
    // must match the key authored in content/config/audio-map.json
    expect(DRAFT_CONFIRM_SFX).toBe("draftConfirm");
  });
});
