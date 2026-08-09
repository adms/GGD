/**
 * HUD scale, enemy-panel lane (owner 2026-08-10): 對手角色的資訊 must follow the
 * player's tier — 「包含整體圖案框架與字體」 — and the RESERVED geometry must
 * follow it too, or the panel paints 3× larger inside a 1× rectangle (failure
 * form ①: drawn off-screen / over its neighbour, with every layout test green
 * because the reserve never moved).
 *
 * ⚠️ The first `it` reads the SHIPPED `<EnemyTeamPanel/>`'s rendered inline
 * style, not just the chrome model: pinning the component to `"medium"` (= the
 * whole lane unwired) left the model-only version of this guard GREEN.
 * ⛔ No shipped px in the assertions (第零守則⑦ / 不要過度測試數值).
 */
import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import { EnemyTeamPanel, enemyPanelChrome } from "./EnemyTeamPanel";
import {
  applyHudOverflowPolicy,
  applyHudViewport,
  hudRectInViewport,
  hudSlot,
  hudSlotRect,
} from "../hud/hudLayout";
import { applyHudScale, type HudScaleTier } from "../hudScale";
import { hudStore, resetHudStore, type SeatView } from "../../net/RoomStore";

afterEach(() => {
  applyHudScale(null);
  applyHudOverflowPolicy(null);
  applyHudViewport(null);
});

/** Viewports measured as tight for this slot: phone landscape + a 720p-ish desktop. */
const PHONE = { width: 812, height: 375 };
const DESK = { width: 780, height: 360 };
const ROOMY = { width: 2560, height: 1440 }; // 32" — owner's 最大 use case

/** The panel's OUTER frame width as really painted, at `tier`. */
function paintedFrameWidthPx(tier: HudScaleTier): number {
  resetHudStore();
  hudStore.setState({
    connected: true,
    phase: "combat",
    localSeatId: 0,
    seats: [0, 1].map(
      (i) => ({ seatId: i, teamId: i, entityId: 10 + i, zone: 0, hp: 60, maxHp: 60 }) as SeatView,
    ),
  });
  applyHudViewport(ROOMY);
  applyHudScale(tier);
  const html = renderToStaticMarkup(createElement(EnemyTeamPanel));
  return Number(/(?:^|;)\s*border-width:\s*([\d.]+)px/.exec(html)?.[1]);
}

describe("enemy-team panel follows the HUD scale tier", () => {
  it("the PAINTED frame + type follow the tier, and 中 is untouched", () => {
    cover("enemy-team-panel");
    const med = paintedFrameWidthPx("medium");
    expect(paintedFrameWidthPx("max")).toBeGreaterThan(med);
    expect(paintedFrameWidthPx("min")).toBeLessThan(med);
    const mid = enemyPanelChrome(false, "medium");
    const big = enemyPanelChrome(false, "max");
    const tiny = enemyPanelChrome(false, "min");
    const keys = Object.keys(mid) as (keyof typeof mid)[];
    // every painted number grows / shrinks — not just the fonts, which would
    // push the text straight out of a frame that never moved
    expect(keys.filter((k) => big[k] <= mid[k])).toEqual([]);
    expect(keys.filter((k) => tiny[k] >= mid[k])).toEqual([]);
  });

  it("the RESERVED rect grows with the tier, and 中 is the shipped reserve", () => {
    cover("enemy-team-panel");
    const shipped = hudSlot("enemy-team");
    expect(hudSlotRect("enemy-team", ROOMY).h).toBe(shipped.height);
    applyHudScale("max");
    const big = hudSlotRect("enemy-team", ROOMY);
    expect(big.h).toBeGreaterThan(shipped.height);
    expect(big.w).toBeGreaterThan(shipped.width);
  });

  it("GUARD: 最大 on a phone/short desktop stays ON SCREEN (overflow clamp)", () => {
    cover("enemy-team-panel");
    applyHudScale("max");
    expect(hudRectInViewport(hudSlotRect("enemy-team", PHONE, true), PHONE)).toBe(true);
    expect(hudRectInViewport(hudSlotRect("enemy-team", DESK), DESK)).toBe(true);
    // …and it is not vacuous: the unclamped policy really does run off-screen
    applyHudOverflowPolicy("allow");
    expect(hudRectInViewport(hudSlotRect("enemy-team", PHONE, true), PHONE)).toBe(false);
    // a tall screen keeps the tier the player actually asked for
    applyHudOverflowPolicy(null);
    const tall = { width: 1280, height: 500 };
    expect(hudSlotRect("enemy-team", tall).h).toBeGreaterThan(hudSlot("enemy-team").height);
  });
});
