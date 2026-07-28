/**
 * GUARD — 殭屍來襲提示 + 戰鬥中即時已擊殺數 (task #258).
 *
 * owner, 2026-07-28: 「戰鬥開始殭屍出來是否有提示？並且提示已擊殺數量？」
 *
 * FOUR THINGS CAN GO WRONG HERE, AND THEY FAIL DIFFERENTLY:
 *   ① the gate is wrong and the readout never appears (or never leaves);
 *   ② the surge edge re-arms on every spawn, so 「殭屍來襲！」 is permanently on
 *      screen from round 3 and stops meaning anything;
 *   ③ the component paints nothing / is not mounted — asserted by RENDERING the
 *      shipped tree with react-dom/server (this package's vitest is
 *      `environment: "node"`, so there is no DOM to query, but there is a
 *      renderer) and reading the numbers back out of the markup;
 *   ④ it lands on the HUD chrome below it (#107) — asserted arithmetically
 *      against the corner registry on every guard viewport.
 *
 * The wire half of #258 (SeatState.mobKills / RoomStore.mobsAlive) is guarded
 * in apps/game-server/src/net/encode.test.ts — a pure model cannot prove a
 * field reaches the client.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ZOMBIE_ALERT_MS,
  ZOMBIE_ALERT_TEXT,
  zombieSurgeAt,
  zombieWaveView,
} from "./zombieWaveModel";
import {
  ZOMBIE_BAR_MAX_W,
  ZombieWaveBarView,
  zombieBarBottom,
  zombieBarMaxWidth,
  zombieBarMaxWidthCss,
  zombieBarRightReserve,
} from "./ZombieWaveBar";
import {
  HUD_EDGE,
  HUD_GAP,
  HUD_STAMP_BAND,
  HUD_SLOTS,
  hudRectsOverlap,
  hudSlotCorner,
  hudSlotRect,
  hudStackEnd,
  type HudSlotId,
  type HudViewport,
} from "./hudLayout";

const view = (o: {
  phase?: string;
  alive?: number;
  kills?: number;
  surgeAtMs?: number | null;
  nowMs?: number;
}) =>
  zombieWaveView({
    phase: o.phase ?? "combat",
    alive: o.alive ?? 0,
    kills: o.kills ?? 0,
    surgeAtMs: o.surgeAtMs ?? null,
    nowMs: o.nowMs ?? 0,
  });

const markup = (v: ReturnType<typeof view>, touch = false): string =>
  renderToStaticMarkup(createElement(ZombieWaveBarView, { view: v, touch }));

describe("the gate", () => {
  it("silent in rounds with no zombies and nothing killed", () => {
    // Waves start at round 3; a permanent 「殭屍 ×0 · 已擊殺 0」 through rounds
    // 1-2 is clutter that teaches the player to stop looking at that corner.
    expect(view({ alive: 0, kills: 0 })).toBeNull();
    expect(markup(view({ alive: 0, kills: 0 }))).toBe("");
  });

  it("appears the moment ONE zombie is standing in your zone", () => {
    const v = view({ alive: 1 })!;
    expect(v).not.toBeNull();
    expect(v.aliveText).toBe("殭屍 ×1");
  });

  it("SURVIVES the floor being cleared, because the tally is the question", () => {
    // 「已擊殺數量」 is exactly what you want to read the second the last zombie
    // drops; a readout that vanishes then answers nobody.
    const v = view({ alive: 0, kills: 34 })!;
    expect(v).not.toBeNull();
    expect(v.killsText).toBe("已擊殺 34");
    expect(v.alerting).toBe(false);
  });

  it("never paints outside combat", () => {
    // A zombie counter over the shop card describes a fight that is not running.
    for (const phase of ["intermission", "champSelect", "resolution", "matchEnd"]) {
      expect(view({ phase, alive: 12, kills: 5 })).toBeNull();
    }
  });
});

describe("the 來襲 alert", () => {
  it("is loud for its window and then goes quiet on its own", () => {
    expect(view({ alive: 4, surgeAtMs: 0, nowMs: 0 })!.alerting).toBe(true);
    expect(view({ alive: 4, surgeAtMs: 0, nowMs: ZOMBIE_ALERT_MS - 1 })!.alerting).toBe(true);
    // the failure this closes: an alert that never retires is a permanent
    // 「殭屍來襲！」 from round 3 to the end of the match.
    expect(view({ alive: 4, surgeAtMs: 0, nowMs: ZOMBIE_ALERT_MS })!.alerting).toBe(false);
    expect(view({ alive: 4, surgeAtMs: 0, nowMs: ZOMBIE_ALERT_MS + 5000 })!.alerting).toBe(false);
  });

  it("says exactly what it means, and only while alerting", () => {
    expect(view({ alive: 4, surgeAtMs: 0, nowMs: 0 })!.alertText).toBe(ZOMBIE_ALERT_TEXT);
    expect(view({ alive: 4, surgeAtMs: 0, nowMs: 99999 })!.alertText).toBe("");
  });

  it("a backwards clock shows the tally, never a stuck banner", () => {
    expect(view({ alive: 4, surgeAtMs: 1000, nowMs: 500 })!.alerting).toBe(false);
  });

  it("never alerts on an empty floor even with a fresh stamp", () => {
    expect(view({ alive: 0, kills: 9, surgeAtMs: 0, nowMs: 0 })!.alerting).toBe(false);
  });
});

describe("the surge edge (zombieSurgeAt)", () => {
  it("stamps on 0 → N, the arrival of a wave on an empty floor", () => {
    expect(zombieSurgeAt(0, 3, null, 1234)).toBe(1234);
  });

  it("does NOT re-stamp while zombies keep arriving", () => {
    // The shipped cadence is a wave every 2 s. Re-arming on every spawn would
    // pin 「殭屍來襲！」 on screen for the rest of the match.
    expect(zombieSurgeAt(3, 9, 1234, 9999)).toBe(1234);
    expect(zombieSurgeAt(9, 9, 1234, 9999)).toBe(1234);
    // …including while the wave is being killed off
    expect(zombieSurgeAt(9, 1, 1234, 9999)).toBe(1234);
  });

  it("clears when the floor empties, so the NEXT wave alerts again", () => {
    expect(zombieSurgeAt(5, 0, 1234, 9999)).toBeNull();
    expect(zombieSurgeAt(0, 4, null, 20000)).toBe(20000);
  });
});

describe("it really paints", () => {
  it("renders both numbers", () => {
    const html = markup(view({ alive: 12, kills: 34 }));
    expect(html).toContain("殭屍 ×12");
    expect(html).toContain("已擊殺 34");
  });

  it("the alert line only exists in the markup while alerting", () => {
    expect(markup(view({ alive: 3, surgeAtMs: 0, nowMs: 0 }))).toContain(ZOMBIE_ALERT_TEXT);
    expect(markup(view({ alive: 3, surgeAtMs: 0, nowMs: 99999 }))).not.toContain(
      ZOMBIE_ALERT_TEXT,
    );
  });

  it("is click-through — the left flank is where a phone thumb lands", () => {
    expect(markup(view({ alive: 1 }))).toMatch(/pointer-events:\s*none/);
  });

  it("its bottom offset in the markup is the DERIVED one, both pointer types", () => {
    for (const touch of [false, true]) {
      expect(markup(view({ alive: 1 }), touch)).toContain(`${zombieBarBottom(touch)}px`);
    }
  });
});

describe("#107: it sits clear of the chrome below it", () => {
  const VIEWPORTS: readonly HudViewport[] = [
    { width: 375, height: 667 },
    { width: 667, height: 375 },
    { width: 812, height: 375 },
    { width: 780, height: 360 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ];
  /** Generous upper bound on the bar's own painted height (12px text + padding). */
  const BAR_H = 30;

  it("the offset is DERIVED from the corner registry, not a magic number", () => {
    // If this is ever replaced by a literal, the bar stops moving when the
    // gamepad chip / FPS pill change height — which is the #42 bug returning.
    for (const touch of [false, true]) {
      expect(zombieBarBottom(touch)).toBe(
        hudStackEnd("bottom-left", touch, { skipTransient: true }) + HUD_GAP,
      );
      // …and therefore always clears the build-stamp / ping gutter
      expect(zombieBarBottom(touch)).toBeGreaterThanOrEqual(HUD_STAMP_BAND);
      expect(zombieBarBottom(touch)).toBeGreaterThanOrEqual(HUD_EDGE);
    }
  });

  it("the width cap is DERIVED from the right-hand stack, not chosen", () => {
    // 375 wide, fine pointer: the minimap reserves 208px on the right, so the
    // room actually left is 375 - (10+208+10+8) = 139 — and a 260px bar would
    // have run 113px into the map. This number is measured, not preferred.
    expect(zombieBarRightReserve(false)).toBe(HUD_EDGE + 208 + HUD_EDGE + HUD_GAP);
    expect(zombieBarMaxWidth(375, false)).toBe(139);
    // on a real desktop the cap is the comfortable width, not the viewport
    expect(zombieBarMaxWidth(1280, false)).toBe(ZOMBIE_BAR_MAX_W);
    // …and the CSS the browser evaluates on resize is the SAME arithmetic
    expect(zombieBarMaxWidthCss(false)).toContain(`${zombieBarRightReserve(false)}px`);
    expect(zombieBarMaxWidthCss(true)).toContain(`${zombieBarRightReserve(true)}px`);
  });

  const barRect = (vp: HudViewport, touch: boolean) => ({
    x: HUD_EDGE,
    y: vp.height - zombieBarBottom(touch) - BAR_H,
    w: zombieBarMaxWidth(vp.width, touch),
    h: BAR_H,
  });

  it("touches NO bottom-anchored slot, on any guard viewport, either pointer", () => {
    // The bar lives in the bottom flanks, so these are the neighbours it could
    // actually be squeezed against by its own placement rule.
    for (const vp of VIEWPORTS) {
      for (const touch of [false, true]) {
        const rect = barRect(vp, touch);
        for (const spec of HUD_SLOTS) {
          // the perf panel is a settings-gated dev overlay: hudLayout's own rule
          // is that an opt-in overlay never shrinks the real UI, and it paints
          // over this flank exactly as it already paints over SelfStatusBar.
          if (spec.transient) continue;
          const id = spec.id as HudSlotId;
          if (!hudSlotCorner(id, touch).startsWith("bottom")) continue;
          expect(
            hudRectsOverlap(rect, hudSlotRect(id, vp, touch)),
            `${vp.width}x${vp.height} touch=${touch}: the zombie bar lands on slot "${id}"`,
          ).toBe(false);
        }
      }
    }
  });

  /**
   * THE TOP-LEFT STACK IS A DIFFERENT PROBLEM, AND IT IS NOT THIS BAR'S.
   *
   * On a 360-393px-tall landscape phone the top-left COLUMN already runs to
   * y=356 (menu 44 + team-lives 44 + minimap 116 + revive 44 + enemy-team 66,
   * with gaps) — which on a 375-tall viewport is 15px BELOW where the existing
   * `gamepad` chip already paints (y 341-365). In other words the left flank on
   * those viewports is over-subscribed BEFORE this bar exists; the same
   * condition `versionBadgeBand.test.ts` records as GUTTER_INTRUDERS, and a
   * #107 layout decision about `EnemyTeamPanel`, not a placement bug here.
   *
   * So the strong claim is made where it is true and PROVEN rather than assumed:
   * on any viewport tall enough for the left column to fit, the bar touches
   * absolutely nothing. The row below keeps that honest — if the top-left stack
   * ever shrinks, the tall-viewport bound here should tighten with it.
   */
  it("on a viewport tall enough for the left column, it touches NOTHING at all", () => {
    for (const vp of VIEWPORTS) {
      if (vp.height < 600) continue;
      for (const touch of [false, true]) {
        const rect = barRect(vp, touch);
        for (const spec of HUD_SLOTS) {
          if (spec.transient) continue;
          const id = spec.id as HudSlotId;
          expect(
            hudRectsOverlap(rect, hudSlotRect(id, vp, touch)),
            `${vp.width}x${vp.height} touch=${touch}: the zombie bar lands on slot "${id}"`,
          ).toBe(false);
        }
      }
    }
  });

  it("the left flank really IS saturated on a landscape phone — non-vacuous", () => {
    // If this ever stops being true (someone shrinks the top-left stack), the
    // exemption above is stale and should be deleted rather than inherited.
    const vp: HudViewport = { width: 812, height: 375 };
    expect(
      hudRectsOverlap(hudSlotRect("gamepad", vp, true), hudSlotRect("enemy-team", vp, true)),
      "the bottom-left gamepad chip no longer collides with the top-left stack — " +
        "re-derive whether the zombie bar still needs the short-viewport exemption",
    ).toBe(true);
  });

  it("does not meet SelfStatusBar, the other unslotted piece of this flank", () => {
    // SelfStatusBar is bottom-anchored at HUD_STAMP_BAND + 122 and stacks
    // UPWARD, so the only way they can meet is this bar growing past it.
    const selfStatusBottom = HUD_STAMP_BAND + 122;
    for (const touch of [false, true]) {
      expect(zombieBarBottom(touch) + BAR_H).toBeLessThan(selfStatusBottom);
    }
  });
});

describe("it is actually on screen", () => {
  const hudRoot = (): string => readFileSync(join(__dirname, "..", "HudRoot.tsx"), "utf8");

  it("HudRoot imports AND renders it", () => {
    const src = hudRoot();
    expect(src).toContain('from "./hud/ZombieWaveBar"');
    expect(src).toMatch(/<ZombieWaveBar\s*\/>/);
  });

  it("the mount is not disabled", () => {
    const src = hudRoot();
    expect(src).not.toMatch(/\{\s*false\s*&&\s*<ZombieWaveBar/);
    expect(src).not.toMatch(/\/\/\s*<ZombieWaveBar/);
    expect(src).not.toMatch(/\{\s*\/\*[^*]*<ZombieWaveBar/);
  });
});
