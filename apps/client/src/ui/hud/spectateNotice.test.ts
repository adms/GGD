/**
 * spectateNotice — the camera may not cut away in silence.
 *
 * owner, 2026-07-27: 「畫面跳到別的隊伍場地的時候要有明顯提示
 * 『等待並觀戰別的競技場晉級戰鬥中』」.
 *
 * Two guards, because the failure this closes is the repo's most common one
 * (「做了但玩家拿不到」) and it has two independent ways to recur here:
 *   1. the gate reads the wrong source and never fires, or
 *   2. the component is perfect and simply is not mounted.
 * (2) is asserted on HudRoot's source in the same style as
 * ui/panels/roundReportMount.test.ts, which exists because exactly that
 * happened to the round report.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { spectateNotice, SPECTATE_NOTICE_TEXT } from "./SpectateNotice";

const hudRoot = (): string => readFileSync(join(__dirname, "..", "HudRoot.tsx"), "utf8");

describe("the gate", () => {
  it("silent while you are watching your OWN zone", () => {
    // null is 「no redirect」 — which includes being dead in your own still-live
    // duel, where #85's death wash already explains the screen and a banner
    // would be noise.
    expect(spectateNotice(null).show).toBe(false);
  });

  it("fires the moment the camera is redirected — including to zone 0", () => {
    // Zone 0 is the trap: a truthiness check (`if (zone)`) would treat the
    // first zone as 「no redirect」 and leave the banner off for a quarter of
    // all spectated fights.
    expect(spectateNotice(0).show).toBe(true);
    expect(spectateNotice(1).show).toBe(true);
    expect(spectateNotice(3).show).toBe(true);
  });

  it("says exactly what the owner asked for", () => {
    expect(spectateNotice(2).text).toBe(SPECTATE_NOTICE_TEXT);
    expect(SPECTATE_NOTICE_TEXT).toBe("等待並觀戰別的競技場晉級戰鬥中");
  });

  it("names the arena 1-based — 「第 0 競技場」 reads as a bug", () => {
    expect(spectateNotice(0).zoneLabel).toBe("第 1 競技場");
    expect(spectateNotice(3).zoneLabel).toBe("第 4 競技場");
  });
});

describe("it is actually on screen", () => {
  it("HudRoot imports AND renders it", () => {
    const src = hudRoot();
    expect(src).toContain('from "./hud/SpectateNotice"');
    expect(src).toMatch(/<SpectateNotice\s*\/>/);
  });

  it("the mount is not disabled", () => {
    // The three shapes that leave a component in the tree while showing nothing.
    const src = hudRoot();
    expect(src).not.toMatch(/\{\s*false\s*&&\s*<SpectateNotice/);
    expect(src).not.toMatch(/\/\/\s*<SpectateNotice/);
    expect(src).not.toMatch(/\{\s*\/\*[^*]*<SpectateNotice/);
  });

  it("reads the SAME field the camera redirect writes", () => {
    // A second opinion about where the camera is would drift from the camera.
    // `frameBus.spectateZone` is written by GameApp.updateSpectateZone and is
    // what hud/Minimap already follows.
    const comp = readFileSync(join(__dirname, "SpectateNotice.tsx"), "utf8");
    expect(comp).toContain("frameBus.spectateZone");
  });
});
