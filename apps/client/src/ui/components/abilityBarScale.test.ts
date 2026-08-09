/**
 * abilityBarScale — 技能列真的跟著玩家選的 HUD 縮放檔位變（owner 2026-08-10）。
 *
 * 讀的是**出貨的 `<AbilityBar/>` 渲染出來的 inline style**（不是設定物件裡有沒有
 * 那個欄位）。兩個方向一起關：最大 > 中 > 最小（有接上），而「中」算出的保留矩形
 * 逐位元等於出貨的 `ABILITY_ROW_H/MAX_W`（不改設定的人畫面一格都不變）。
 * ⛔ 斷言裡沒有出貨數值，比的是同一份輸入的兩個檔位或兩個住處。
 *
 * 最承重的是「保留 vs 畫出來」：只縮元件不縮保留尺寸，放大就會撞進小地圖，
 * 而 `hudBottomCluster.test.ts` 全綠（失敗形態⑤）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { AbilityDef, ChampionDef } from "@ggd/shared/sim/content/defs";
import type { ChampionId } from "@ggd/shared/ids";
import type { CoreAbilitySlot } from "@ggd/shared/sim/intents";
import { AbilityBar } from "./AbilityBar";
import { abilityRowHeight, abilityRowMaxWidth, ABILITY_BAR_BASE } from "./abilityBarMetrics";
import {
  ABILITY_ROW_H,
  ABILITY_ROW_MAX_W,
  hudClusterRects,
  hudClusterTuning,
} from "../hud/hudBottomCluster";
import { applyHudScale, hudScalePolicy, type HudScaleTier } from "../hudScale";
import { hudStore, resetHudStore, type SeatView } from "../../net/RoomStore";

const TEST_CHAMPION = "godie-scaletest" as ChampionId;

const ability = (slot: CoreAbilitySlot): AbilityDef =>
  ({
    id: `${TEST_CHAMPION}.${slot}`,
    name: `技能${slot}`,
    slot,
    castType: "self",
    maxRank: 5,
    cooldown: [8, 8, 8, 8, 8],
    manaCost: [50, 50, 50, 50, 50],
    range: 5,
    effects: [],
  }) as unknown as AbilityDef;

/** 出貨的 AbilityBar，在指定檔位下渲染出來的 HTML。 */
function renderBar(tier: HudScaleTier): string {
  Champions.register(TEST_CHAMPION, {
    id: TEST_CHAMPION,
    name: "測試英雄",
    role: "fighter",
    attackType: "melee",
    modelKey: "champ.test",
    baseStats: {},
    growth: {},
    abilities: { Q: ability("Q"), W: ability("W"), E: ability("E"), R: ability("R") },
  } as ChampionDef);
  resetHudStore();
  hudStore.setState({
    connected: true,
    phase: "combat",
    localSeatId: 0,
    seats: [
      {
        seatId: 0,
        championId: TEST_CHAMPION,
        abilityRanks: [1, 1, 1, 1],
        cooldowns: [0, 0, 0, 0],
        unspentPoints: 1,
        exRank: 0,
      } as unknown as SeatView,
    ],
  });
  applyHudScale(tier);
  return renderToStaticMarkup(createElement(AbilityBar));
}

/** Q 格**真的畫出來**的邊長（px）—— 最終的 style，不是某個設定值。 */
function tilePx(html: string): number {
  const at = html.indexOf('data-slot-key="Q"');
  expect(at, "AbilityBar 沒有畫出 Q 格").toBeGreaterThanOrEqual(0);
  const style = /style="([^"]*)"/.exec(html.slice(at, at + 800))?.[1] ?? "";
  return Number(/(?:^|;)\s*width:\s*([\d.]+)px/.exec(style)?.[1]);
}

afterEach(() => applyHudScale(null));

describe("HUD 縮放：技能列 (owner 2026-08-10)", () => {
  it("最大更大、最小仍按得到，而「中」逐位元等於今天", () => {
    cover("hud-scale-ability-bar");
    const med = tilePx(renderBar("medium"));
    expect(tilePx(renderBar("max"))).toBeGreaterThan(med);
    const min = tilePx(renderBar("min"));
    expect(min).toBeLessThan(med);
    expect(min).toBeGreaterThanOrEqual(hudScalePolicy().touchTargetFloorPx);
    expect(abilityRowHeight("medium")).toBe(ABILITY_ROW_H);
    expect(abilityRowMaxWidth("medium")).toBe(ABILITY_ROW_MAX_W);
  });

  it("保留的矩形跟著畫出來的一起長大（否則放大會撞進小地圖而全綠）", () => {
    cover("hud-scale-ability-bar");
    const vp = { width: 2560, height: 1440 };
    const rows = { resources: true, abilities: true };
    const t = hudClusterTuning();
    const med = hudClusterRects(vp, false, rows, t, "medium").abilities!;
    const max = hudClusterRects(vp, false, rows, t, "max").abilities!;
    expect(max.w).toBeGreaterThan(med.w);
    expect(max.h).toBeGreaterThan(med.h);
    // ⛔ 承重：保留的寬度要真的容得下畫出來的六格
    expect(max.w).toBeGreaterThanOrEqual(tilePx(renderBar("max")) * ABILITY_BAR_BASE.maxTiles);
  });
});
